import type { ApiError as ApiErrorType } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_KEY = import.meta.env.VITE_AUTH_TOKEN_KEY ?? "pos_auth_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function buildHeaders(extraHeaders?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  const token = getToken();
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (typeof body.message === "string") {
        message = body.message;
      }
    } catch {
      // body가 JSON이 아닌 경우 기본 메시지 사용
    }
    const error: ApiErrorType = { status: response.status, message };
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function get<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params !== undefined) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(),
  });
  return parseResponse<T>(response);
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function put<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response);
}

export async function del<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  return parseResponse<T>(response);
}
