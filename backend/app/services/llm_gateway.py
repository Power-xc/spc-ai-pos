"""OpenAI gateway abstraction."""

from __future__ import annotations

import asyncio
import json
import logging
from time import perf_counter
from typing import Any
from urllib.parse import urlparse

import httpx

from app.services.chat_trace import add_llm_call, now_iso

logger = logging.getLogger(__name__)
trace_logger = logging.getLogger("uvicorn.error")
LOCAL_OPENAI_COMPAT_HOSTS = {"127.0.0.1", "localhost", "host.docker.internal"}


class LLMGateway:
    """OpenAI-compatible API gateway abstraction."""

    def __init__(
        self,
        api_key: str | None,
        default_model: str = "gpt-4o-mini",
        complex_model: str | None = None,
        base_url: str = "https://api.openai.com/v1",
    ) -> None:
        normalized_api_key = (api_key or "").strip()
        parsed_base_url = urlparse(base_url)
        is_local_openai_compat = parsed_base_url.hostname in LOCAL_OPENAI_COMPAT_HOSTS
        placeholder_tokens = {
            "",
            "empty",
            "dummy",
            "dummy-local-key",
            "sk-xxxxxxx",
        }
        if not is_local_openai_compat:
            placeholder_tokens.add("EMPTY")
        if (
            normalized_api_key in placeholder_tokens
            or "xxxx" in normalized_api_key.lower()
        ):
            normalized_api_key = ""
        self.api_key = normalized_api_key or None
        self.default_model = default_model
        self.complex_model = complex_model or default_model
        self.base_url = base_url.rstrip("/")
        self._is_local_openai_compat = (
            parsed_base_url.hostname in LOCAL_OPENAI_COMPAT_HOSTS
        )
        self.max_retries = 0 if self._is_local_openai_compat else 2
        request_timeout = 18.0 if self._is_local_openai_compat else 30.0
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(request_timeout, connect=min(3.0, request_timeout)),
        )
        self.total_tokens_used = 0
        self.total_cost = 0.0
        self._supports_chat_completions: bool | None = None
        self._endpoint_mode: str | None = None
        self._unavailable_until: float = 0.0
        self._failure_backoff_sec: float = 20.0

    async def call(
        self,
        purpose: str,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 500,
        temperature: float = 0.3,
        response_format: dict[str, Any] | None = None,
        trace: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Call the OpenAI Chat Completions endpoint with lightweight retries."""
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")
        if perf_counter() < self._unavailable_until:
            raise RuntimeError("LLM upstream temporarily unavailable (circuit open)")

        model = (
            self.complex_model if purpose == "complex_analysis" else self.default_model
        )
        chat_body: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format:
            chat_body["response_format"] = response_format
        if is_local_openai_compat := (
            urlparse(self.base_url).hostname in LOCAL_OPENAI_COMPAT_HOSTS
        ):
            model_lower = model.lower()
            if (
                model_lower.startswith("qwen")
                or model_lower.startswith("glm")
                or "glm" in model_lower
            ):
                chat_body["chat_template_kwargs"] = {"enable_thinking": False}

        completion_prompt = (
            f"[SYSTEM]\n{system_prompt}\n\n[USER]\n{user_prompt}\n\n[ASSISTANT]\n"
        )
        completion_body: dict[str, Any] = {
            "model": model,
            "prompt": completion_prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        await self._ensure_endpoint_mode()

        headers = {"Authorization": f"Bearer {self.api_key}"}
        last_error: Exception | None = None
        last_status_code: int | None = None
        used_endpoint = (
            "/chat/completions"
            if self._endpoint_mode != "completion"
            else "/completions"
        )
        first_started_at_iso: str | None = None
        final_ended_at_iso: str | None = None
        first_started_counter: float | None = None
        timed_out = False
        retry_count = 0
        upstream_total_tokens = 0
        upstream_input_tokens = 0
        upstream_output_tokens = 0
        endpoint_candidates = [used_endpoint]
        if used_endpoint == "/completions":
            endpoint_candidates = ["/completions", "/chat/completions"]

        for endpoint in endpoint_candidates:
            body = chat_body if endpoint == "/chat/completions" else completion_body
            unsupported_chat_endpoint = False
            for attempt in range(self.max_retries + 1):
                try:
                    attempt_started_iso = now_iso()
                    attempt_started_counter = perf_counter()
                    if first_started_at_iso is None:
                        first_started_at_iso = attempt_started_iso
                        first_started_counter = attempt_started_counter
                    response = await self.client.post(
                        endpoint,
                        headers=headers,
                        json=body,
                    )
                    last_status_code = response.status_code
                    response.raise_for_status()
                    data = response.json()
                    usage = data.get("usage", {})
                    input_tokens = int(
                        usage.get("prompt_tokens", usage.get("input_tokens", 0)) or 0
                    )
                    output_tokens = int(
                        usage.get("completion_tokens", usage.get("output_tokens", 0))
                        or 0
                    )
                    total_tokens = int(
                        usage.get("total_tokens", input_tokens + output_tokens)
                        or (input_tokens + output_tokens)
                    )
                    upstream_input_tokens = input_tokens
                    upstream_output_tokens = output_tokens
                    upstream_total_tokens = total_tokens
                    cost = self._calc_cost(model, input_tokens, output_tokens)
                    self.total_tokens_used += total_tokens
                    self.total_cost += cost

                    if endpoint == "/chat/completions":
                        message = data.get("choices", [{}])[0].get("message", {}) or {}
                        content = message.get("content")
                        if isinstance(content, list):
                            content = "".join(
                                part.get("text", "")
                                if isinstance(part, dict)
                                else str(part)
                                for part in content
                            )
                        if not content:
                            content = (
                                message.get("reasoning_content")
                                or message.get("reasoning")
                                or ""
                            )
                            if content and len(content) > 800:
                                content = content[-800:]
                    else:
                        content = data.get("choices", [{}])[0].get("text")
                        if content is None:
                            content = data.get("content") or ""
                    if content is None:
                        content = ""

                    final_ended_at_iso = now_iso()
                    finished_counter = perf_counter()
                    call_ms = max(
                        ((finished_counter - first_started_counter) * 1000.0)
                        if first_started_counter
                        else 0.0,
                        0.0,
                    )
                    add_llm_call(
                        trace,
                        purpose=purpose,
                        model=model,
                        base_url=self.base_url,
                        endpoint=endpoint,
                        started_at_iso=first_started_at_iso or attempt_started_iso,
                        ended_at_iso=final_ended_at_iso,
                        llm_ms=call_ms,
                        upstream_status=last_status_code,
                        timeout=timed_out,
                        retry_count=retry_count,
                        input_tokens=upstream_input_tokens,
                        output_tokens=upstream_output_tokens,
                        total_tokens=upstream_total_tokens,
                    )
                    trace_logger.info(
                        json.dumps(
                            {
                                "event": "llm_call_trace",
                                "purpose": purpose,
                                "model": model,
                                "base_url": self.base_url,
                                "endpoint": endpoint,
                                "started_at": first_started_at_iso
                                or attempt_started_iso,
                                "ended_at": final_ended_at_iso,
                                "llm_ms": int(round(call_ms)),
                                "upstream_status": last_status_code,
                                "timeout": timed_out,
                                "retry": retry_count > 0,
                                "retry_count": retry_count,
                                "input_tokens": upstream_input_tokens,
                                "output_tokens": upstream_output_tokens,
                                "total_tokens": upstream_total_tokens,
                            },
                            ensure_ascii=False,
                        )
                    )
                    self._endpoint_mode = (
                        "completion" if endpoint == "/completions" else "chat"
                    )
                    self._unavailable_until = 0.0
                    return {
                        "content": content,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "model": model,
                        "cost": cost,
                    }
                except Exception as exc:  # pragma: no cover - network dependent
                    last_error = exc
                    retry_count = attempt + 1
                    if isinstance(exc, httpx.TimeoutException):
                        timed_out = True
                    if (
                        isinstance(exc, httpx.HTTPStatusError)
                        and exc.response is not None
                    ):
                        last_status_code = exc.response.status_code
                        if endpoint == "/chat/completions" and last_status_code in {
                            400,
                            404,
                            405,
                            422,
                            501,
                        }:
                            unsupported_chat_endpoint = True
                            logger.warning(
                                "LLM chat endpoint unsupported; trying /completions fallback"
                            )
                            break
                    logger.warning(
                        "LLM call failed on attempt %s (%s): %s",
                        attempt + 1,
                        endpoint,
                        exc,
                    )
                    await asyncio.sleep(0.5 * (attempt + 1))
            if unsupported_chat_endpoint:
                if (
                    endpoint == "/chat/completions"
                    and "/completions" not in endpoint_candidates
                ):
                    endpoint_candidates.append("/completions")
                continue
            break
        assert last_error is not None
        final_ended_at_iso = final_ended_at_iso or now_iso()
        finished_counter = perf_counter()
        call_ms = max(
            ((finished_counter - first_started_counter) * 1000.0)
            if first_started_counter
            else 0.0,
            0.0,
        )
        add_llm_call(
            trace,
            purpose=purpose,
            model=model,
            base_url=self.base_url,
            endpoint=used_endpoint,
            started_at_iso=first_started_at_iso or final_ended_at_iso,
            ended_at_iso=final_ended_at_iso,
            llm_ms=call_ms,
            upstream_status=last_status_code,
            timeout=timed_out,
            retry_count=retry_count,
            input_tokens=upstream_input_tokens,
            output_tokens=upstream_output_tokens,
            total_tokens=upstream_total_tokens,
        )
        trace_logger.info(
            json.dumps(
                {
                    "event": "llm_call_trace",
                    "purpose": purpose,
                    "model": model,
                    "base_url": self.base_url,
                    "endpoint": used_endpoint,
                    "started_at": first_started_at_iso,
                    "ended_at": final_ended_at_iso,
                    "llm_ms": int(round(call_ms)),
                    "upstream_status": last_status_code,
                    "timeout": timed_out,
                    "retry": retry_count > 0,
                    "retry_count": retry_count,
                    "input_tokens": upstream_input_tokens,
                    "output_tokens": upstream_output_tokens,
                    "total_tokens": upstream_total_tokens,
                    "error": str(last_error),
                },
                ensure_ascii=False,
            )
        )
        if self._is_local_openai_compat:
            self._unavailable_until = perf_counter() + self._failure_backoff_sec
        raise last_error

    async def _ensure_endpoint_mode(self) -> None:
        """Detect whether upstream supports /chat/completions or only /completions."""
        if self._endpoint_mode in {"chat", "completion"}:
            return
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        candidate_model = self.default_model
        prefer_completion = False
        try:
            response = await self.client.get("/models")
            response.raise_for_status()
            payload = response.json()
            model_rows = payload.get("data") if isinstance(payload, dict) else None
            capabilities: set[str] = set()
            if isinstance(model_rows, list):
                for row in model_rows:
                    if isinstance(row, dict) and not candidate_model:
                        candidate_model = (
                            str(row.get("id") or row.get("model") or "").strip()
                            or candidate_model
                        )
                for row in model_rows:
                    caps = row.get("capabilities") if isinstance(row, dict) else None
                    if isinstance(caps, list):
                        capabilities.update(str(cap).lower() for cap in caps)
            if (
                capabilities
                and "completion" in capabilities
                and "chat_completion" not in capabilities
            ):
                prefer_completion = True
        except Exception:
            # Keep OpenAI-compatible default if capability discovery fails.
            pass

        probe_body = {
            "model": candidate_model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "temperature": 0,
        }
        try:
            probe = await self.client.post(
                "/chat/completions", headers=headers, json=probe_body
            )
            if probe.status_code not in {404, 405, 501}:
                self._supports_chat_completions = True
                self._endpoint_mode = "chat"
                return
        except Exception:
            if not prefer_completion:
                # When probing fails unexpectedly, keep OpenAI chat default.
                self._supports_chat_completions = True
                self._endpoint_mode = "chat"
                return

        self._supports_chat_completions = False
        self._endpoint_mode = "completion"

    def _calc_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Approximate token cost in USD."""
        rates = {
            "gpt-4o-mini": (0.00015, 0.0006),
            "gpt-4o": (0.0025, 0.01),
        }
        input_rate, output_rate = rates.get(model, (0.001, 0.002))
        return round(
            (input_tokens / 1000 * input_rate) + (output_tokens / 1000 * output_rate),
            6,
        )

    def get_usage_stats(self) -> dict[str, Any]:
        """Return accumulated token and cost usage."""
        return {
            "total_tokens": self.total_tokens_used,
            "total_cost_usd": round(self.total_cost, 4),
        }

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self.client.aclose()
