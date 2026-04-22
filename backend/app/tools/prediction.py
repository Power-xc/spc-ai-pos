"""Prediction engine for production risk analysis."""

from __future__ import annotations

import logging
import math
import statistics
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.tools import sql_queries

logger = logging.getLogger(__name__)


class InventoryPredictor:
    """가중이동평균 기반 수요 예측."""

    WEIGHTS = [0.40, 0.30, 0.20, 0.10]
    OPERATING_MINUTES = 840
    BUSINESS_START_HOUR = 8
    BUSINESS_END_HOUR = 22
    DEFAULT_HOURLY_PROFILE = {
        8: 0.03,
        9: 0.04,
        10: 0.06,
        11: 0.08,
        12: 0.1,
        13: 0.09,
        14: 0.08,
        15: 0.07,
        16: 0.08,
        17: 0.1,
        18: 0.11,
        19: 0.09,
        20: 0.04,
        21: 0.03,
    }

    async def predict_daily_demand(
        self,
        db: AsyncSession,
        store_id: str,
        product_id: str,
        target_dow: int | None = None,
    ) -> dict[str, Any]:
        """Predict daily sold quantity for a product using same-DOW history."""
        history = await sql_queries.get_product_history(db, store_id, product_id, days=35)
        if not history:
            return {
                "product_id": product_id,
                "predicted_sold_qty": 0,
                "confidence": "LOW",
                "weekly_data": [],
                "std_dev": 0.0,
                "message": "데이터 부족",
            }

        latest_date = date.fromisoformat(str(history[-1]["biz_date"]))
        reference_dow = target_dow if target_dow is not None else latest_date.weekday()

        same_dow_rows = [
            row
            for row in reversed(history[:-1])
            if date.fromisoformat(str(row["biz_date"])).weekday() == reference_dow
        ][:4]
        same_dow_rows = list(reversed(same_dow_rows))

        if not same_dow_rows:
            return {
                "product_id": product_id,
                "predicted_sold_qty": 0,
                "confidence": "LOW",
                "weekly_data": [],
                "std_dev": 0.0,
                "message": "동요일 데이터 부족",
            }

        sold_values = [float(row["sold_qty"]) for row in same_dow_rows]
        mean = statistics.mean(sold_values)
        std_dev = statistics.pstdev(sold_values) if len(sold_values) > 1 else 0.0

        filtered_rows = []
        for row in same_dow_rows:
            sold_qty = float(row["sold_qty"])
            if std_dev > 0 and abs(sold_qty - mean) > 3 * std_dev:
                continue
            filtered_rows.append(row)

        if not filtered_rows:
            filtered_rows = same_dow_rows

        weighted_data = []
        for index, row in enumerate(reversed(filtered_rows)):
            weight = self.WEIGHTS[index] if index < len(self.WEIGHTS) else 0
            weighted_data.append(
                {
                    "weeks_ago": index + 1,
                    "sold_qty": float(row["sold_qty"]),
                    "weight": weight,
                }
            )

        total_weight = sum(item["weight"] for item in weighted_data)
        predicted = (
            sum(item["sold_qty"] * item["weight"] for item in weighted_data) / total_weight
            if total_weight > 0
            else statistics.mean([item["sold_qty"] for item in weighted_data])
        )

        confidence = "LOW"
        if len(filtered_rows) >= 4:
            confidence = "HIGH"
        elif len(filtered_rows) >= 2:
            confidence = "MEDIUM"

        return {
            "product_id": product_id,
            "predicted_sold_qty": round(predicted),
            "confidence": confidence,
            "weekly_data": weighted_data,
            "std_dev": round(std_dev, 2),
        }

    async def predict_hourly_depletion(
        self,
        db: AsyncSession,
        store_id: str,
        product_id: str,
        reference_time: datetime | None = None,
        biz_date: date | None = None,
    ) -> dict[str, Any]:
        """Predict one-hour depletion risk from same-DOW hourly burn."""
        now = reference_time or datetime.now(UTC).astimezone()
        inventory_rows = await sql_queries.get_store_inventory_today(db, store_id, biz_date)
        inventory_map = {row["product_id"]: row for row in inventory_rows}
        current_stock = int(round(float(inventory_map.get(product_id, {}).get("on_hand_eod", 0) or 0)))

        demand = await self.predict_daily_demand(
            db,
            store_id,
            product_id,
            target_dow=now.weekday(),
        )
        history = await sql_queries.get_product_history(db, store_id, product_id, days=35)

        hour_share = self._hour_share(now.hour)
        same_dow_rows = self._same_dow_rows(history, now.weekday())
        hourly_weighted_data = []
        for index, row in enumerate(reversed(same_dow_rows)):
            weight = self.WEIGHTS[index] if index < len(self.WEIGHTS) else 0
            hourly_weighted_data.append(
                {
                    "weeks_ago": index + 1,
                    "hourly_qty": round(float(row.get("sold_qty", 0) or 0) * hour_share, 2),
                    "weight": weight,
                }
            )

        total_weight = sum(item["weight"] for item in hourly_weighted_data)
        predicted_hourly_qty = (
            sum(item["hourly_qty"] * item["weight"] for item in hourly_weighted_data) / total_weight
            if total_weight > 0
            else float(demand.get("predicted_sold_qty", 0) or 0) * hour_share
        )
        predicted_hourly_qty = max(predicted_hourly_qty, 0.0)

        predicted_stock_1h = max(0, int(round(current_stock - predicted_hourly_qty)))
        remaining_business_hours = self._remaining_business_hours(now)
        depletion_eta = None
        if predicted_hourly_qty > 0 and current_stock > 0:
            hours_to_depletion = current_stock / predicted_hourly_qty
            if hours_to_depletion <= remaining_business_hours:
                depletion_eta = now + timedelta(hours=hours_to_depletion)
        elif current_stock <= 0:
            depletion_eta = now

        return {
            "product_id": product_id,
            "current_stock": current_stock,
            "predicted_stock_1h": predicted_stock_1h,
            "depletion_eta": depletion_eta,
            "hourly_burn_rate": round(predicted_hourly_qty, 2),
            "hourly_history": hourly_weighted_data,
        }

    async def get_production_pattern(
        self,
        db: AsyncSession,
        store_id: str,
        product_id: str,
        weeks: int = 4,
        target_dow: int | None = None,
    ) -> dict[str, Any]:
        """Return first/second production event averages for same-DOW history."""
        history = await sql_queries.get_production_history(
            db,
            store_id,
            product_id,
            days=max(weeks * 7 + 7, 35),
        )
        if not history:
            return {"first_production": None, "second_production": None}

        dated_rows: list[dict[str, Any]] = []
        for row in history:
            try:
                biz_date = date.fromisoformat(str(row["biz_date"]))
            except Exception:
                continue
            dated_rows.append({**row, "biz_date_obj": biz_date})
        if not dated_rows:
            return {"first_production": None, "second_production": None}

        latest_date = max(row["biz_date_obj"] for row in dated_rows)
        reference_dow = target_dow if target_dow is not None else latest_date.weekday()
        candidate_dates = sorted(
            {
                row["biz_date_obj"]
                for row in dated_rows
                if row["biz_date_obj"].weekday() == reference_dow
            },
            reverse=True,
        )[:weeks]
        first_events: list[tuple[int, float]] = []
        second_events: list[tuple[int, float]] = []

        for candidate_date in sorted(candidate_dates):
            day_rows = [row for row in dated_rows if row["biz_date_obj"] == candidate_date]
            events = self._extract_production_events(day_rows)
            if not events:
                continue
            first_events.append(events[0])
            if len(events) > 1:
                second_events.append(events[1])

        return {
            "first_production": self._summarize_event(first_events),
            "second_production": self._summarize_event(second_events),
        }

    async def predict_stockout_risk(
        self,
        db: AsyncSession,
        store_id: str,
        product_id: str,
        target_dow: int | None = None,
    ) -> dict[str, Any]:
        """Estimate stockout probability from same-DOW history."""
        history = await sql_queries.get_product_history(db, store_id, product_id, days=35)
        if len(history) <= 1:
            return {
                "stockout_probability": 0.0,
                "avg_stockout_minutes": 0.0,
                "weeks_with_stockout": 0,
                "total_weeks": 0,
                "risk_level": "UNKNOWN",
            }

        latest_date = date.fromisoformat(str(history[-1]["biz_date"]))
        reference_dow = target_dow if target_dow is not None else latest_date.weekday()
        same_dow_rows = [
            row
            for row in history[:-1]
            if date.fromisoformat(str(row["biz_date"])).weekday() == reference_dow
        ][-4:]

        if not same_dow_rows:
            return {
                "stockout_probability": 0.0,
                "avg_stockout_minutes": 0.0,
                "weeks_with_stockout": 0,
                "total_weeks": 0,
                "risk_level": "UNKNOWN",
            }

        stockout_rows = [row for row in same_dow_rows if int(row["stockout_minutes"] or 0) > 0]
        total_weeks = len(same_dow_rows)
        weeks_with_stockout = len(stockout_rows)
        probability = round((weeks_with_stockout / total_weeks) * 100, 1) if total_weeks else 0.0
        avg_stockout_minutes = round(
            statistics.mean([float(row["stockout_minutes"]) for row in stockout_rows]), 2
        ) if stockout_rows else 0.0

        if probability >= 70:
            risk_level = "HIGH"
        elif probability >= 40:
            risk_level = "MEDIUM"
        elif probability > 0:
            risk_level = "LOW"
        else:
            risk_level = "NONE"

        return {
            "stockout_probability": probability,
            "avg_stockout_minutes": avg_stockout_minutes,
            "weeks_with_stockout": weeks_with_stockout,
            "total_weeks": total_weeks,
            "risk_level": risk_level,
        }

    async def get_all_risk_products(
        self,
        db: AsyncSession,
        store_id: str,
        reference_time: datetime | None = None,
        biz_date: date | None = None,
    ) -> list[dict[str, Any]]:
        """Scan all products and return stockout-risk candidates."""
        risk_products = await sql_queries.get_stockout_risk_products(db, store_id)
        current_inventory = await sql_queries.get_store_inventory_today(db, store_id, biz_date)
        inventory_map = {row["product_id"]: row for row in current_inventory}
        enriched: list[dict[str, Any]] = []
        target_dow = reference_time.weekday() if reference_time is not None else None

        for risk_item in risk_products:
            product_id = risk_item["product_id"]
            demand = await self.predict_daily_demand(
                db,
                store_id,
                product_id,
                target_dow=target_dow,
            )
            risk = await self.predict_stockout_risk(
                db,
                store_id,
                product_id,
                target_dow=target_dow,
            )
            hourly = await self.predict_hourly_depletion(
                db,
                store_id,
                product_id,
                reference_time=reference_time,
                biz_date=biz_date,
            )
            pattern = await self.get_production_pattern(
                db,
                store_id,
                product_id,
                target_dow=target_dow,
            )
            current_on_hand = float(inventory_map.get(product_id, {}).get("on_hand_eod", 0) or 0)
            predicted_sold_qty = float(demand.get("predicted_sold_qty", 0) or 0)
            buffer_qty = math.ceil(predicted_sold_qty * 0.1)
            recommended_qty = max(0, math.ceil(predicted_sold_qty - current_on_hand + buffer_qty))
            depletion_eta = hourly.get("depletion_eta")
            risk_level = risk.get("risk_level", "UNKNOWN")
            if depletion_eta is not None:
                minutes_to_depletion = max(
                    0.0,
                    (depletion_eta - (reference_time or datetime.now(UTC).astimezone())).total_seconds() / 60,
                )
                if minutes_to_depletion <= 60:
                    risk_level = "HIGH"

            enriched.append(
                {
                    **risk_item,
                    "current_date_on_hand": current_on_hand,
                    "predicted_sold_qty": predicted_sold_qty,
                    "confidence": demand.get("confidence", "LOW"),
                    "weekly_data": demand.get("weekly_data", []),
                    "std_dev": demand.get("std_dev", 0.0),
                    "stockout_probability": risk.get("stockout_probability", 0.0),
                    "avg_stockout_minutes_4w": risk.get("avg_stockout_minutes", 0.0),
                    "risk_level": risk_level,
                    "recommended_production_qty": recommended_qty,
                    "chance_loss_if_no_action": float(
                        risk_item.get("estimated_chance_loss_per_day", 0) or 0
                    ),
                    "current_stock": hourly.get("current_stock", current_on_hand),
                    "predicted_stock_1h": hourly.get("predicted_stock_1h", current_on_hand),
                    "depletion_eta": hourly.get("depletion_eta"),
                    "hourly_burn_rate": hourly.get("hourly_burn_rate", 0.0),
                    "first_production": pattern.get("first_production"),
                    "second_production": pattern.get("second_production"),
                }
            )

        risk_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "NONE": 3, "UNKNOWN": 4}
        return sorted(
            enriched,
            key=lambda item: (
                risk_order.get(str(item.get("risk_level", "UNKNOWN")), 99),
                -float(item.get("stockout_probability", 0) or 0),
                -float(item.get("predicted_sold_qty", 0) or 0),
            ),
        )

    def _same_dow_rows(self, history: list[dict[str, Any]], target_dow: int) -> list[dict[str, Any]]:
        if not history:
            return []
        same_dow_rows = [
            row
            for row in reversed(history[:-1] if len(history) > 1 else history)
            if date.fromisoformat(str(row["biz_date"])).weekday() == target_dow
        ][:4]
        return list(reversed(same_dow_rows))

    def _hour_share(self, hour: int) -> float:
        if hour < self.BUSINESS_START_HOUR or hour >= self.BUSINESS_END_HOUR:
            return 0.0
        return self.DEFAULT_HOURLY_PROFILE.get(hour, 1 / max(self.BUSINESS_END_HOUR - self.BUSINESS_START_HOUR, 1))

    def _remaining_business_hours(self, reference_time: datetime) -> float:
        if reference_time.hour >= self.BUSINESS_END_HOUR:
            return 0.0
        if reference_time.hour < self.BUSINESS_START_HOUR:
            business_start = reference_time.replace(
                hour=self.BUSINESS_START_HOUR,
                minute=0,
                second=0,
                microsecond=0,
            )
            closing_time = reference_time.replace(
                hour=self.BUSINESS_END_HOUR,
                minute=0,
                second=0,
                microsecond=0,
            )
            return max((closing_time - business_start).total_seconds() / 3600, 0.0)
        closing_time = reference_time.replace(
            hour=self.BUSINESS_END_HOUR,
            minute=0,
            second=0,
            microsecond=0,
        )
        return max((closing_time - reference_time).total_seconds() / 3600, 0.0)

    def _extract_production_events(self, day_rows: list[dict[str, Any]]) -> list[tuple[int, float]]:
        timestamp_buckets: dict[datetime, float] = {}
        for row in day_rows:
            registered_at_raw = row.get("registered_at")
            registered_at = None
            if registered_at_raw:
                try:
                    registered_at = datetime.fromisoformat(str(registered_at_raw))
                except Exception:
                    registered_at = None
            if registered_at is None:
                degree = int(row.get("prod_degree", 1) or 1)
                biz_date = row["biz_date_obj"]
                registered_at = datetime.combine(
                    biz_date,
                    time(hour=min(self.BUSINESS_START_HOUR + (degree - 1) * 4, 21), minute=0),
                )
            timestamp_buckets.setdefault(registered_at, 0.0)
            timestamp_buckets[registered_at] += float(row.get("produced_qty", 0) or 0)
        ordered = sorted(timestamp_buckets.items(), key=lambda item: item[0])
        return [
            (registered_at.hour * 60 + registered_at.minute, round(quantity, 2))
            for registered_at, quantity in ordered
        ]

    def _summarize_event(self, events: list[tuple[int, float]]) -> dict[str, Any] | None:
        if not events:
            return None
        avg_minutes = round(statistics.mean(minutes for minutes, _ in events))
        avg_qty = round(statistics.mean(quantity for _, quantity in events))
        hour = avg_minutes // 60
        minute = avg_minutes % 60
        return {"avg_time": f"{hour:02d}:{minute:02d}", "avg_qty": avg_qty}
