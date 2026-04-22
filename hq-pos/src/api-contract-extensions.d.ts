declare module "@/types/api" {
  export interface ProfitabilitySnapshot {
    biz_date: string;
    estimated_net_profit_amt: number | null;
    estimated_margin_rate_pct: number | null;
    break_even_sales_amt?: number | null;
    break_even_coverage_pct?: number | null;
    promo_profit_impact_amt?: number | null;
    fixed_cost_amt?: number | null;
    labor_cost_amt?: number | null;
    promo_cost_amt?: number | null;
    profit_status?: string;
    margin_status?: string;
    break_even_status?: string;
    promo_status?: string;
    basis?: string[];
    assumptions?: string[];
    input_source?: Record<string, string | null>;
  }

  export interface CustomerInsightsSnapshot {
    status: string;
    repeat_customer_count: number | null;
    repeat_visit_rate_pct: number | null;
    avg_orders_per_repeat_customer: number | null;
    reference_period?: string | null;
    data_points?: number;
    source?: string;
    note?: string;
  }

  export interface RecommendationRationale {
    summary?: string;
    vs_yesterday_sales_pct?: number | null;
    vs_last_week_same_dow_sales_pct?: number | null;
    stockout_signal?: { count?: number | null; note?: string; status?: string };
    waste_signal?: { waste_rate_pct?: number | null; status?: string };
    weather_impact?: { status?: string; note?: string };
    event_impact?: { status?: string; note?: string };
    mutual_support_impact?: { status?: string; note?: string };
    time_band_impact?: { status?: string; note?: string };
  }

  export interface DashboardData {
    profitability?: ProfitabilitySnapshot | null;
    customer_insights?: CustomerInsightsSnapshot | null;
  }

  export interface DashboardBriefingData {
    customer_insights?: CustomerInsightsSnapshot | null;
  }

  export interface DashboardSalesSummaryData {
    profitability?: ProfitabilitySnapshot | null;
  }

  export interface AlertCard {
    warning_kind?: string;
    warning_mode?: string;
  }

  export interface OrderOptionsData {
    rationale?: RecommendationRationale;
  }
}

export {};
