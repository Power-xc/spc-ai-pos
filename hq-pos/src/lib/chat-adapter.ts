import type { ChatResult, SuggestedQuestion } from "@/types/api";

export interface ActionCard {
  label: string;
  sub: string;
  to: string;
  actionType?: string;
  apiEndpoint?: string;
  params?: Record<string, any>;
}

export interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  cards?: ActionCard[];
  rawResponse?: ChatResult;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function extractCards(result: ChatResult): ActionCard[] {
  const rawCards = Array.isArray((result as any).action_cards)
    ? (result as any).action_cards
    : Array.isArray(result.metadata?.action_cards)
      ? result.metadata.action_cards
      : [];
  if (!rawCards.length) return [];

  const cards: ActionCard[] = [];
  for (const rawCard of rawCards) {
    const actions = Array.isArray(rawCard?.actions) ? rawCard.actions : [];
    for (const action of actions) {
      const actionType = String(action?.action_type || "");
      const apiEndpoint = String(action?.api_endpoint || "");
      const fallbackRoute = action?.params?.route
        ? String(action.params.route)
        : rawCard?.card_type === "order_recommendation" || apiEndpoint.includes("/order/confirm")
          ? "/orders"
          : "/actions";
      cards.push({
        label: String(action?.label || rawCard?.title || "액션"),
        sub: String(rawCard?.body || ""),
        to: actionType === "navigate" ? apiEndpoint || fallbackRoute : fallbackRoute,
        actionType,
        apiEndpoint,
        params: action?.params || {},
      });
    }
  }
  return cards;
}

export function extractSuggestedQuestions(result: ChatResult): SuggestedQuestion[] {
  const rawList = Array.isArray((result as any).suggested_questions)
    ? (result as any).suggested_questions
    : Array.isArray(result.metadata?.suggested_questions)
      ? result.metadata.suggested_questions
      : [];
  if (!rawList.length) return [];

  const deduped: SuggestedQuestion[] = [];
  const seen = new Set<string>();
  for (const item of rawList) {
    const normalized =
      typeof item === "string"
        ? { text: item }
        : item && typeof item === "object" && typeof item.text === "string"
          ? { text: item.text, source: item.source, reason: item.reason }
          : null;
    if (!normalized) continue;
    const text = normalized.text.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    deduped.push({ ...normalized, text });
    if (deduped.length >= 5) break;
  }
  return deduped;
}

export function chatResultToMessage(result: ChatResult): Message {
  const text = extractTextFromResult(result);
  const cards = extractCards(result);

  return {
    id: generateId("ai"),
    role: "ai",
    text,
    cards: cards.length > 0 ? cards : undefined,
    rawResponse: result,
  };
}

function extractTextFromResult(result: ChatResult): string {
  // 1. text response_type + string content
  if (result.response_type === "text" && typeof result.content === "string") {
    return result.content;
  }

  // 2. text response_type + metadata.answer fallback
  if (result.response_type === "text" && result.metadata?.answer) {
    return String(result.metadata.answer);
  }

  // 3. alert_card type
  if (result.response_type === "alert_card" && Array.isArray(result.content)) {
    const alerts = result.content as any[];
    if (!alerts.length) {
      return "현재 확인된 경고가 없습니다.";
    }
    return `${alerts.length}개의 경고를 확인했습니다.`;
  }

  // 4. order_card type — structured summary
  if (result.response_type === "order_card" && typeof result.content === "object") {
    const orderData = result.content as any;
    const summary = result.metadata?.order_summary as string | undefined;
    if (summary) {
      return summary;
    }
    // Fallback: build summary from order data
    const options = orderData.options || [];
    const first = options[0];
    if (!first) return "추천 주문안을 생성할 수 없습니다.";
    const topItems = (first.items || []).slice(0, 3).map((item: any) => `  • ${item.product_name}: ${item.quantity}개`).join("\n");
    const extra = Math.max(0, (first.items?.length || 0) - 3);
    const extraText = extra > 0 ? `\n  … 외 ${extra}종` : "";
    return `📋 ${first.label}\n  • 품목 ${first.items?.length || 0}종, 총 ${first.total_qty}개\n  • ${first.deviation_label}\n📦 대표 품목:\n${topItems}${extraText}\n📊 근거: 전주 동요일 주문 패턴 (실제 주문 데이터)`;
  }

  // 5. insight_card type
  if (result.response_type === "insight_card" && typeof result.content === "object") {
    const salesData = result.content as any;
    const textSection = salesData.sections?.find((s: any) => Boolean(s.text));
    return textSection?.text || salesData.title || "분석 결과를 정리했습니다.";
  }

  // 6. 최종 fallback: result.answer (백엔드가 직접 반환하는 경우)
  if (result.answer) {
    return String(result.answer);
  }

  return "요청을 처리했습니다.";
}

export function createUserMessage(text: string): Message {
  return {
    id: generateId("user"),
    role: "user",
    text,
  };
}

export function createErrorMessage(errorMessage: string): Message {
  return {
    id: generateId("error"),
    role: "ai",
    text: errorMessage,
  };
}
