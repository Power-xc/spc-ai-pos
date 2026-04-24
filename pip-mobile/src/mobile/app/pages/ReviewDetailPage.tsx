import { useEffect, useMemo, useState } from "react";
import type {
  ReviewFullData,
  ReviewKeywordInsight,
  ReviewKeywordItem,
  ReviewListItem,
  ReviewSentiment,
} from "@/mobile/types";
import { getReviewFullData } from "@/mobile/lib/api";

type FilterKey = "전체" | ReviewSentiment;
const FILTERS: FilterKey[] = ["전체", "긍정", "혼합", "부정"];

function renderAnalysisText(raw: string) {
  const parts = raw.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      return (
        <span key={i} className="font-bold text-[#3babdd]">
          {inner}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function AiSummaryCard({ data }: { data: ReviewFullData }) {
  const total =
    data.positivePercent + data.neutralPercent + data.negativePercent;

  return (
    <section className="bg-white border border-[#ebebeb] rounded-[20px] p-[18px] mb-[14px]">
      <div className="flex items-center justify-between mb-[10px]">
        <div className="flex items-center gap-[7px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z"
              fill="#3babdd"
            />
          </svg>
          <span className="text-[14px] font-bold text-[#555]">AI 리뷰 요약</span>
        </div>
        <span className="text-[11px] font-bold text-[#3babdd] bg-[#eaf6ff] px-[10px] py-[3px] rounded-full">
          {data.periodLabel}
        </span>
      </div>

      <p className="text-[13px] leading-[20px] text-[#333] mb-[14px]">
        {renderAnalysisText(data.analysisText)}
      </p>

      <div className="flex rounded-[100px] overflow-hidden h-[10px] gap-[5px] mb-[10px]">
        <div
          className="h-full rounded-[100px]"
          style={{
            width: `${(data.positivePercent / total) * 100}%`,
            background: "linear-gradient(92deg, #3FAF60 -50.65%, #3AAEDD 121.87%)",
          }}
        />
        <div
          className="h-full rounded-[100px] bg-[#fed400]"
          style={{ width: `${(data.neutralPercent / total) * 100}%` }}
        />
        <div
          className="h-full rounded-[100px] bg-[#f85f34]"
          style={{ width: `${(data.negativePercent / total) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between mb-[16px] px-[2px]">
        <div className="flex items-center gap-[6px]">
          <span
            className="w-[9px] h-[5px] rounded-[30px]"
            style={{ background: "linear-gradient(94deg, #3faf60 50%, #3aaedd 121%)" }}
          />
          <span className="text-[#555] text-[10px] font-bold">
            긍정 <span className="text-black">{data.positivePercent}</span>
            <span className="font-normal"> %</span>
          </span>
        </div>
        <div className="flex items-center gap-[6px]">
          <span className="w-[9px] h-[5px] rounded-[30px] bg-[#fed400]" />
          <span className="text-[#555] text-[10px] font-bold">
            혼합 <span className="text-black">{data.neutralPercent}</span>
            <span className="font-normal"> %</span>
          </span>
        </div>
        <div className="flex items-center gap-[6px]">
          <span className="w-[9px] h-[5px] rounded-[30px] bg-[#f85f34]" />
          <span className="text-[#555] text-[10px] font-bold">
            부정 <span className="text-black">{data.negativePercent}</span>
            <span className="font-normal"> %</span>
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-[8px]">
        {data.insights.map((insight, i) => (
          <InsightRow key={i} insight={insight} />
        ))}
      </ul>
    </section>
  );
}

function InsightRow({ insight }: { insight: ReviewKeywordInsight }) {
  const isImprove = insight.type === "개선";
  const chipBg = isImprove ? "#fff2ec" : "#eaf6ff";
  const chipColor = isImprove ? "#ff7a52" : "#3babdd";
  return (
    <li className="bg-[#f6f7f9] rounded-[14px] px-[12px] py-[10px] flex items-start gap-[10px]">
      <span
        className="shrink-0 text-[11px] font-bold px-[10px] py-[3px] rounded-full"
        style={{ backgroundColor: chipBg, color: chipColor }}
      >
        {insight.type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-[#333] mb-[2px]">
          {insight.keyword}
        </p>
        <p className="text-[11px] text-[#6f6f6f] leading-[16px]">
          {insight.summary}
        </p>
      </div>
    </li>
  );
}

function KeywordListCard({
  title,
  subtitle,
  keywords,
  tone,
}: {
  title: string;
  subtitle: string;
  keywords: ReviewKeywordItem[];
  tone: "positive" | "negative";
}) {
  return (
    <section className="mb-[14px]">
      <div className="flex items-center gap-[6px] mb-[4px]">
        <h3 className="text-[14px] font-bold text-[#333]">{title}</h3>
        <span
          className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[10px] text-[#a4a4a4] border border-[#d4d4d4]"
          aria-hidden
        >
          ?
        </span>
      </div>
      <p className="text-[11px] text-[#888] mb-[10px]">✓ {subtitle}</p>
      <ul className="flex flex-col gap-[6px]">
        {keywords.map((item, i) => (
          <KeywordRow key={i} item={item} tone={tone} />
        ))}
      </ul>
    </section>
  );
}

function KeywordRow({
  item,
  tone,
}: {
  item: ReviewKeywordItem;
  tone: "positive" | "negative";
}) {
  const isHighlighted = tone === "negative" || item.highlight;
  const rowBg = isHighlighted
    ? tone === "positive"
      ? "#eaf6ff"
      : "#fff4ef"
    : "#ffffff";
  const countColor = tone === "positive" ? "#3babdd" : "#ff522c";

  return (
    <li
      className="flex items-center justify-between rounded-[14px] px-[16px] py-[12px] border border-[#ebebeb]"
      style={{ backgroundColor: rowBg }}
    >
      <div className="flex items-center gap-[10px]">
        <span className="text-[16px] leading-none">{item.icon}</span>
        <span className="text-[13px] font-bold text-[#333]">
          "{item.keyword}"
        </span>
      </div>
      <span className="text-[14px] font-bold" style={{ color: countColor }}>
        {item.count}
      </span>
    </li>
  );
}

function FilterTabs({
  active,
  onChange,
}: {
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}) {
  return (
    <div className="flex items-center gap-[8px] mb-[12px]">
      {FILTERS.map((f) => {
        const isActive = f === active;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            className={
              "px-[14px] py-[6px] rounded-full text-[12px] font-bold transition-colors cursor-pointer " +
              (isActive
                ? "bg-[#3babdd] text-white"
                : "bg-white text-[#555] border border-[#ebebeb]")
            }
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-[2px]">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= rating;
        return (
          <svg
            key={n}
            width="13"
            height="13"
            viewBox="0 0 12 12"
            fill={filled ? "#FFB800" : "none"}
            stroke={filled ? "none" : "#e0e0e0"}
            strokeWidth="1"
          >
            <path d="M6 1l1.5 3.3 3.5.3-2.7 2.4.8 3.4L6 8.6l-3.1 1.8.8-3.4L1 4.6l3.5-.3L6 1z" />
          </svg>
        );
      })}
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: ReviewSentiment }) {
  const styles: Record<ReviewSentiment, { bg: string; color: string }> = {
    긍정: { bg: "#eaf6ff", color: "#3babdd" },
    혼합: { bg: "#fff8dc", color: "#b38500" },
    부정: { bg: "#fff2ec", color: "#ff522c" },
  };
  const s = styles[sentiment];
  return (
    <span
      className="shrink-0 text-[11px] font-bold px-[10px] py-[3px] rounded-full"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {sentiment}
    </span>
  );
}

function ReviewRow({ item }: { item: ReviewListItem }) {
  return (
    <article className="bg-white rounded-[16px] border border-[#ebebeb] px-[16px] py-[14px] mb-[10px]">
      <div className="flex items-center justify-between mb-[6px]">
        <div className="flex items-center gap-[8px] min-w-0">
          <span className="text-[14px] font-bold text-[#333] truncate">
            {item.reviewerName}
          </span>
          <span className="text-[10px] font-bold text-[#3babdd] bg-[#eaf6ff] px-[8px] py-[2px] rounded-full shrink-0">
            {item.platform}
          </span>
        </div>
        <span className="text-[11px] text-[#a4a4a4] shrink-0">{item.date}</span>
      </div>
      <div className="mb-[8px]">
        <StarRating rating={item.rating} />
      </div>
      <p className="text-[13px] leading-[20px] text-[#333] mb-[10px]">
        {item.content}
      </p>
      <div className="flex items-center justify-between gap-[8px]">
        <div className="flex flex-wrap gap-[6px] min-w-0">
          {item.tags.map((t) => (
            <span
              key={t}
              className="text-[11px] text-[#6f6f6f] bg-[#f6f7f9] px-[8px] py-[3px] rounded-full"
            >
              #{t}
            </span>
          ))}
        </div>
        <SentimentBadge sentiment={item.sentiment} />
      </div>
    </article>
  );
}

export default function ReviewDetailPage() {
  const [data, setData] = useState<ReviewFullData | null>(null);
  const [filter, setFilter] = useState<FilterKey>("전체");

  useEffect(() => {
    getReviewFullData().then(setData);
  }, []);

  const filteredReviews = useMemo(() => {
    if (!data) return [];
    if (filter === "전체") return data.reviews;
    return data.reviews.filter((r) => r.sentiment === filter);
  }, [data, filter]);

  if (!data) {
    return (
      <div className="px-[20px] pt-[14px] pb-[24px]">
        <div className="bg-white rounded-[20px] h-[200px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="px-[20px] pt-[14px] pb-[24px]">
      <AiSummaryCard data={data} />

      <KeywordListCard
        title="이런 점이 좋았어요"
        subtitle={`${data.positiveKeywords.length}개 항목 · ${data.positiveMentionCount}명 언급`}
        keywords={data.positiveKeywords}
        tone="positive"
      />

      <KeywordListCard
        title="이런 점이 아쉬웠어요"
        subtitle={`${data.negativeKeywords.length}개 항목 · ${data.negativeMentionCount}명 언급`}
        keywords={data.negativeKeywords}
        tone="negative"
      />

      <section>
        <h3 className="text-[15px] font-bold text-[#333] mb-[10px]">리뷰 목록</h3>
        <FilterTabs active={filter} onChange={setFilter} />
        {filteredReviews.length === 0 ? (
          <div className="mt-[40px] text-center text-[13px] text-[#a4a4a4]">
            해당 리뷰가 없습니다.
          </div>
        ) : (
          filteredReviews.map((r) => <ReviewRow key={r.id} item={r} />)
        )}
      </section>
    </div>
  );
}
