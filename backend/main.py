"""POS-first FastAPI backend for the BR Korea AI Agent POC."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from functools import partial

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.chat_agent import ChatAgent
from agents.ordering import OrderingAgent
from agents.production import ProductionAgent
from agents.sales_analysis import SalesAnalysisAgent
from api import (
    admin,
    chat,
    home,
    hq_ai,
    inventory,
    modal,
    notice,
    notifications,
    order,
    sales,
    settings as settings_api,
)

notification_settings_api = None
from app.services.local_data import LocalDataStore
from config import get_settings
from core.agent_loop import AgentLoop
from core.classifier import Classifier
from core.fast_path import FastPath
from core.llm_client import LLMClient
from core.profit_calculator import ProfitCalculator
from proactive.modal_manager import ModalManager, NotificationHub
from proactive.monitor import ProactiveMonitor
from security.audit import Auditor
from security.gate import SecurityGate
from security.masking import MaskingService
from tools import inventory_tools, order_tools, production_tools, sales_tools
from tools.calculator import calculate
from tools.registry import ToolDefinition, ToolRegistry

settings = get_settings()


def _register_tools(registry: ToolRegistry, data_store) -> None:
    def register(
        name: str, handler, description: str, parameters: dict, is_write: bool = False
    ):
        registry.register(
            ToolDefinition(
                name=name,
                handler=handler,
                description=description,
                parameters=parameters,
                is_write=is_write,
                timeout=settings.tool_timeout,
            )
        )

    register(
        "get_current_inventory",
        partial(inventory_tools.get_current_inventory, data_store),
        "현재 재고 조회",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "product_id": {"type": "string"},
            },
        },
    )
    register(
        "predict_stock_depletion",
        partial(inventory_tools.predict_stock_depletion, data_store),
        "품절 시점 예측",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "product_id": {"type": "string"},
            },
            "required": ["store_id", "product_id"],
        },
    )
    register(
        "get_stockout_history",
        partial(inventory_tools.get_stockout_history, data_store),
        "품절 이력 조회",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}, "days": {"type": "integer"}},
        },
    )
    register(
        "get_production_pattern",
        partial(production_tools.get_production_pattern, data_store),
        "생산 패턴 조회",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "product_id": {"type": "string"},
            },
            "required": ["store_id", "product_id"],
        },
    )
    register(
        "get_recommended_production",
        partial(production_tools.get_recommended_production, data_store),
        "생산 추천 조회",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}},
            "required": ["store_id"],
        },
    )
    register(
        "register_production",
        partial(production_tools.register_production, data_store),
        "생산 등록",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "product_id": {"type": "string"},
                "quantity": {"type": "integer"},
            },
            "required": ["store_id", "product_id", "quantity"],
        },
        is_write=True,
    )
    register(
        "get_order_history",
        partial(order_tools.get_order_history, data_store),
        "과거 발주 이력 조회",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}, "date": {"type": "string"}},
            "required": ["store_id", "date"],
        },
    )
    register(
        "get_order_options",
        partial(order_tools.get_order_options, data_store),
        "발주 추천안 조회",
        {"type": "object", "properties": {"store_id": {"type": "string"}}},
    )
    register(
        "calculate_order_risk",
        partial(order_tools.calculate_order_risk, data_store),
        "발주 리스크 계산",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}, "items": {"type": "array"}},
            "required": ["store_id", "items"],
        },
    )
    register(
        "confirm_order",
        partial(order_tools.confirm_order, data_store),
        "발주 확정",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}, "items": {"type": "array"}},
            "required": ["store_id", "items"],
        },
        is_write=True,
    )
    register(
        "get_pending_deadlines",
        partial(order_tools.get_pending_deadlines, data_store),
        "발주 마감 조회",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}},
            "required": ["store_id"],
        },
    )
    register(
        "get_daily_summary",
        partial(sales_tools.get_daily_summary, data_store),
        "일 매출 요약",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}},
            "required": ["store_id"],
        },
    )
    register(
        "compare_sales",
        partial(sales_tools.compare_sales, data_store),
        "기간 매출 비교",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "period_a_start": {"type": "string"},
                "period_a_end": {"type": "string"},
                "period_b_start": {"type": "string"},
                "period_b_end": {"type": "string"},
            },
            "required": [
                "store_id",
                "period_a_start",
                "period_a_end",
                "period_b_start",
                "period_b_end",
            ],
        },
    )
    register(
        "get_product_ranking",
        partial(sales_tools.get_product_ranking, data_store),
        "매출 순위 조회",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "period": {"type": "string"},
            },
        },
    )
    register(
        "get_waste_summary",
        partial(sales_tools.get_waste_summary, data_store),
        "폐기 요약",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "period": {"type": "string"},
            },
        },
    )
    register(
        "get_hourly_sales",
        partial(sales_tools.get_hourly_sales, data_store),
        "시간대 매출 조회",
        {
            "type": "object",
            "properties": {"store_id": {"type": "string"}, "date": {"type": "string"}},
        },
    )
    register(
        "get_profitability",
        partial(sales_tools.get_profitability, data_store),
        "수익률 분석",
        {
            "type": "object",
            "properties": {
                "store_id": {"type": "string"},
                "period": {"type": "string"},
            },
        },
    )
    register(
        "calculate",
        calculate,
        "수식 계산",
        {
            "type": "object",
            "properties": {
                "expression": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["expression"],
        },
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    data_store = LocalDataStore(
        settings.data_dir,
        demo_mode=settings.demo_mode,
        demo_seed_dir=settings.demo_seed_dir,
    )
    registry = ToolRegistry()
    _register_tools(registry, data_store)
    llm_client = LLMClient(settings.vllm_base_url, settings.vllm_model)
    auditor = Auditor(settings.audit_log_path)
    security_gate = SecurityGate(MaskingService())
    notification_hub = NotificationHub()
    profit_calculator = ProfitCalculator(data_store)
    modal_manager = ModalManager(
        notification_hub,
        settings.modal_duplicate_suppress_minutes,
        settings.max_daily_modals,
    )
    classifier = Classifier(llm_client)
    fast_path = FastPath(registry)
    agent_loop = AgentLoop(registry, llm_client)
    chat_agent = ChatAgent(classifier, fast_path, agent_loop, auditor, security_gate)
    production_agent = ProductionAgent(registry, profit_calculator)
    ordering_agent = OrderingAgent(registry, profit_calculator)
    sales_agent = SalesAnalysisAgent(registry)
    proactive_monitor = ProactiveMonitor(
        registry, modal_manager, auditor, profit_calculator
    )
    scheduler = AsyncIOScheduler()
    metrics = {
        "pos_api_calls": 0,
        "chat_requests": 0,
        "chat_fast_path": 0,
        "chat_agent_path": 0,
        "avg_latency_pos_ms": 0,
        "avg_latency_chat_fast_ms": 0,
        "avg_latency_chat_agent_ms": 0,
        "total_tokens": 0,
        "proactive_checks": 0,
        "errors": 0,
    }
    user_store_bindings = {
        ("store_owner", "U001"): str(data_store.dim_store.iloc[0]["store_id"]),
        ("store_owner", "U002"): str(data_store.dim_store.iloc[1]["store_id"])
        if len(data_store.dim_store) > 1
        else str(data_store.dim_store.iloc[0]["store_id"]),
        ("hq_admin", "A001"): None,
    }

    async def run_all():
        for store_id in data_store.dim_store["store_id"].astype(str).head(10):
            from core.schemas import StoreContext

            context = StoreContext(
                store_id=store_id,
                user_id="system",
                role="hq_admin",
                current_time=datetime.now(UTC),
            )
            await proactive_monitor.run(context)

    scheduler.add_job(run_all, "interval", minutes=settings.proactive_interval_minutes)
    scheduler.start()

    app.state.data_store = data_store
    app.state.registry = registry
    app.state.llm_client = llm_client
    app.state.auditor = auditor
    app.state.security_gate = security_gate
    app.state.notification_hub = notification_hub
    app.state.modal_manager = modal_manager
    app.state.proactive_monitor = proactive_monitor
    app.state.chat_agent = chat_agent
    app.state.production_agent = production_agent
    app.state.ordering_agent = ordering_agent
    app.state.sales_agent = sales_agent
    app.state.metrics = metrics
    app.state.user_store_bindings = user_store_bindings
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="BR Korea POS AI Agent POC", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
_routers = [
    home.router,
    inventory.router,
    order.router,
    notice.router,
    settings_api.router,
    chat.router,
    hq_ai.router,
    modal.router,
    notifications.router,
    admin.router,
]
if notification_settings_api is not None:
    _routers.append(notification_settings_api.router)
for router in _routers:
    app.include_router(router)

# Sales router includes both /api/sales/* and /v1/analytics/* endpoints
app.include_router(sales.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "br-pos-ai-poc"}
