"""Repositories for order recommendations and confirmed orders."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select

from app.db.base import OrderSource, OrderStatus, PricingStatus, RecommendationStatus, utc_now
from app.db.repositories.base import RepositoryBase
from app.models import Order, OrderItem, OrderRecommendation, OrderRecommendationItem, Product


class OrderRepository(RepositoryBase):
    """Persistence helpers for recommendation snapshots and order confirmations."""

    async def create_recommendation_snapshot(
        self,
        *,
        store_id: str,
        items: Sequence[dict[str, Any]],
        category: str | None = None,
        client_option_id: str | None = None,
        option_label: str | None = None,
        source: OrderSource = OrderSource.AI,
        created_by: str | None = None,
        reference_date=None,
        reason_summary: str | None = None,
        four_week_avg_qty: float | None = None,
        context_payload: dict[str, Any] | None = None,
        raw_response: dict[str, Any] | None = None,
    ) -> OrderRecommendation:
        await self.ensure_store(store_id)
        await self.ensure_user(created_by, store_id=store_id)
        product_map = await self._load_products(store_id, [str(item["product_id"]) for item in items])

        recommendation = OrderRecommendation(
            store_id=store_id,
            client_option_id=client_option_id,
            option_label=option_label,
            category=category,
            source=source,
            status=RecommendationStatus.GENERATED,
            reference_date=reference_date,
            reason_summary=reason_summary,
            four_week_avg_qty=four_week_avg_qty,
            recommended_at=utc_now(),
            created_by=created_by,
            context_payload=context_payload or {},
            raw_response=raw_response or {},
        )
        self.session.add(recommendation)
        await self.session.flush()

        for sort_order, item in enumerate(items):
            product_id = str(item["product_id"])
            product = product_map[product_id]
            unit_price = self._coerce_price(item.get("unit_price"), product.base_price)
            quantity = int(item["quantity"])
            amount = round(unit_price * quantity, 2) if unit_price is not None else None
            self.session.add(
                OrderRecommendationItem(
                    recommendation_id=recommendation.id,
                    product_id=product_id,
                    product_name_snapshot=item.get("product_name") or product.product_name,
                    quantity=quantity,
                    unit_price=unit_price,
                    amount=amount,
                    ai_reason=item.get("ai_reason"),
                    confidence_score=item.get("confidence_score"),
                    sort_order=sort_order,
                    payload=item.get("payload") or {},
                )
            )

        await self.session.flush()
        return recommendation

    async def create_order(
        self,
        *,
        store_id: str,
        items: Sequence[dict[str, Any]],
        recommendation_id: uuid.UUID | None = None,
        client_draft_id: str | None = None,
        client_option_id: str | None = None,
        category: str | None = None,
        source: OrderSource = OrderSource.MANUAL,
        status: OrderStatus = OrderStatus.CONFIRMED,
        created_by: str | None = None,
        confirmed_by: str | None = None,
        memo: str | None = None,
        context_payload: dict[str, Any] | None = None,
        extra_data: dict[str, Any] | None = None,
    ) -> Order:
        """Create an order header and append order_items for confirmOrder."""

        await self.ensure_store(store_id)
        await self.ensure_user(created_by, store_id=store_id)
        await self.ensure_user(confirmed_by, store_id=store_id)
        product_map = await self._load_products(store_id, [str(item["product_id"]) for item in items])
        order = Order(
            store_id=store_id,
            recommendation_id=recommendation_id,
            client_draft_id=client_draft_id,
            client_option_id=client_option_id,
            category=category,
            source=source,
            status=status,
            pricing_status=PricingStatus.PENDING,
            memo=memo,
            total_quantity=0,
            total_amount=None,
            confirmed_at=utc_now() if status == OrderStatus.CONFIRMED else None,
            created_by=created_by,
            confirmed_by=confirmed_by,
            context_payload=context_payload or {},
            extra_data=extra_data or {},
        )
        self.session.add(order)
        await self.session.flush()

        order_items = await self.add_order_items(order=order, items=items, product_map=product_map)
        order.total_quantity = sum(item.quantity for item in order_items)
        priced_amounts = [float(item.amount) for item in order_items if item.amount is not None]
        all_priced = len(priced_amounts) == len(order_items)
        order.total_amount = round(sum(priced_amounts), 2) if all_priced else None
        order.pricing_status = PricingStatus.CONFIRMED if all_priced else PricingStatus.PENDING
        await self.session.flush()
        return order

    async def add_order_items(
        self,
        *,
        order: Order,
        items: Sequence[dict[str, Any]],
        product_map: dict[str, Product] | None = None,
    ) -> list[OrderItem]:
        """Append order_items to an existing order header."""

        resolved_product_map = product_map or await self._load_products(
            order.store_id,
            [str(item["product_id"]) for item in items],
        )
        created_items: list[OrderItem] = []

        for item in items:
            product_id = str(item["product_id"])
            product = resolved_product_map[product_id]
            quantity = int(item["quantity"])
            unit_price = self._coerce_price(item.get("unit_price"), product.base_price)
            amount = round(unit_price * quantity, 2) if unit_price is not None else None
            order_item = OrderItem(
                order_id=order.id,
                recommendation_item_id=item.get("recommendation_item_id"),
                product_id=product_id,
                product_name_snapshot=item.get("product_name") or product.product_name,
                quantity=quantity,
                unit_price=unit_price,
                amount=amount,
                pricing_status=PricingStatus.CONFIRMED if amount is not None else PricingStatus.PENDING,
                note=item.get("note"),
                extra_data=item.get("extra_data") or {},
            )
            self.session.add(order_item)
            created_items.append(order_item)

        await self.session.flush()
        return created_items

    async def get_order_by_id(self, order_id: uuid.UUID) -> Order | None:
        """Explicit repository entry point for `/confirm` follow-up reads."""

        return await self.session.get(Order, order_id)

    async def get_order(self, order_id: uuid.UUID) -> Order | None:
        return await self.get_order_by_id(order_id)

    async def list_orders_by_store(self, store_id: str, *, limit: int = 20) -> list[Order]:
        """List recent orders for dashboard and order history use cases."""

        stmt = (
            select(Order)
            .where(Order.store_id == store_id)
            .order_by(Order.created_at.desc())
            .limit(limit)
        )
        return list((await self.session.scalars(stmt)).all())

    async def list_recent_orders(self, store_id: str, *, limit: int = 20) -> list[Order]:
        return await self.list_orders_by_store(store_id, limit=limit)

    async def _load_products(self, store_id: str, product_ids: Sequence[str]) -> dict[str, Product]:
        return await self.ensure_products(store_id, list(product_ids))

    @staticmethod
    def _coerce_price(*values: Any) -> float | None:
        for value in values:
            if value is None:
                continue
            return float(value)
        return None
