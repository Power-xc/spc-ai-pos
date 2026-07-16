import { useSyncExternalStore } from "react";

export type DemoDateTimeState = {
  date: string;
  time: string;
  iso: string;
  timestamp: number;
};

const STORAGE_KEY = "pip-pos-demo-datetime";
const DEFAULT_DATE = "2026-03-05";
const DEFAULT_TIME = "14:45";

const listeners = new Set<() => void>();

function normalizeDate(value: string | null | undefined): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim())
    ? String(value).trim()
    : DEFAULT_DATE;
}

function normalizeTime(value: string | null | undefined): string {
  return /^\d{2}:\d{2}$/.test(String(value ?? "").trim())
    ? String(value).trim()
    : DEFAULT_TIME;
}

function createState(
  date: string | null | undefined,
  time: string | null | undefined,
): DemoDateTimeState {
  const normalizedDate = normalizeDate(date);
  const normalizedTime = normalizeTime(time);
  return {
    date: normalizedDate,
    time: normalizedTime,
    iso: `${normalizedDate}T${normalizedTime}:00`,
    timestamp: new Date(`${normalizedDate}T${normalizedTime}:00+09:00`).getTime(),
  };
}

function readInitialState(): DemoDateTimeState {
  if (typeof window === "undefined") {
    return createState(DEFAULT_DATE, DEFAULT_TIME);
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const queryDate = normalizeDate(params.get("demo_date"));
    const queryTime = normalizeTime(params.get("demo_time"));
    if (params.has("demo_date") || params.has("demo_time")) {
      return createState(queryDate, queryTime);
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<DemoDateTimeState>;
      return createState(parsed.date, parsed.time);
    }
  } catch {
    // fall through to default
  }

  return createState(DEFAULT_DATE, DEFAULT_TIME);
}

let currentState = readInitialState();

function persistState(next: DemoDateTimeState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: next.date, time: next.time }),
    );
    const url = new URL(window.location.href);
    url.searchParams.set("demo_date", next.date);
    url.searchParams.set("demo_time", next.time);
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore persistence failure in demo mode
  }
}

function emitChange() {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("demo-datetime-changed", { detail: currentState }),
    );
  }
}

export function getDemoDateTimeState(): DemoDateTimeState {
  return currentState;
}

export function setDemoDateTime(next: {
  date?: string | null;
  time?: string | null;
}): DemoDateTimeState {
  currentState = createState(next.date ?? currentState.date, next.time ?? currentState.time);
  persistState(currentState);
  emitChange();
  return currentState;
}

export function resetDemoDateTime(): DemoDateTimeState {
  currentState = createState(DEFAULT_DATE, DEFAULT_TIME);
  persistState(currentState);
  emitChange();
  return currentState;
}

export function subscribeDemoDateTime(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDemoDateTime() {
  return useSyncExternalStore(
    subscribeDemoDateTime,
    getDemoDateTimeState,
    getDemoDateTimeState,
  );
}

export function getDemoDate(): string {
  return currentState.date;
}

export function getDemoTime(): string {
  return currentState.time;
}

export function getDemoDateTimeLabel(): string {
  return `${currentState.date} ${currentState.time}`;
}

export function getDemoDateObject(): Date {
  return new Date(`${currentState.date}T${currentState.time}:00+09:00`);
}

function rebuildPath(path: string, params: URLSearchParams) {
  const [base, hash = ""] = path.split("#", 2);
  const [pathname] = base.split("?", 1);
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

export function appendDemoQueryParams(
  path: string,
  options?: {
    includeBizDate?: boolean;
    includeDemoTime?: boolean;
    includeDemoDateTime?: boolean;
  },
) {
  const includeBizDate = options?.includeBizDate ?? false;
  const includeDemoTime = options?.includeDemoTime ?? false;
  const includeDemoDateTime = options?.includeDemoDateTime ?? false;
  const [base] = path.split("#", 1);
  const queryIndex = base.indexOf("?");
  const params = new URLSearchParams(queryIndex >= 0 ? base.slice(queryIndex + 1) : "");

  if (includeBizDate) {
    if (!params.has("biz_date")) {
      params.set("biz_date", currentState.date);
    }
  }
  if (includeDemoTime) {
    if (!params.has("demo_time")) {
      params.set("demo_time", currentState.time);
    }
  }
  if (includeDemoDateTime) {
    if (!params.has("demo_datetime")) {
      params.set("demo_datetime", currentState.iso);
    }
  }

  return rebuildPath(path, params);
}
