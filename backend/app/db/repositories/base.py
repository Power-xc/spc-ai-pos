"""Repository base helpers."""

from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import UserRole
from app.demo_store_config import canonical_store_name, is_hidden_store_id, normalize_store_id
from app.models import Product, Store, User


class RepositoryBase:
    """Guard repository usage to database mode only."""

    def __init__(self, session: AsyncSession) -> None:
        if not isinstance(session, AsyncSession):
            raise RuntimeError("PostgreSQL repositories require an AsyncSession in DATA_MODE=postgres.")
        self.session = session

    async def ensure_store(self, store_id: str, *, store_name: str | None = None) -> Store:
        """Ensure a valid store master row exists without creating demo-dummy stores."""

        normalized_store_id = normalize_store_id(store_id)
        if is_hidden_store_id(normalized_store_id):
            raise ValueError(f"Hidden/demo dummy store is not allowed: {normalized_store_id}")

        store = await self.session.get(Store, normalized_store_id)
        if store is None:
            seed_result = await self.session.execute(
                text(
                    """
                    SELECT
                        store_id,
                        store_name,
                        region,
                        city,
                        timezone
                    FROM dunkin_mart_copy.dim_store
                    WHERE store_id = :store_id
                    """
                ),
                {"store_id": normalized_store_id},
            )
            seed_row = seed_result.mappings().first()
            if seed_row is None and not store_name:
                raise ValueError(f"Store master not found for store_id={normalized_store_id}")

            store = Store(
                store_id=normalized_store_id,
                store_name=canonical_store_name(
                    normalized_store_id,
                    store_name or (seed_row.get("store_name") if seed_row else None),
                ),
                region=str(seed_row.get("region") or "").strip() or None if seed_row else None,
                city=str(seed_row.get("city") or "").strip() or None if seed_row else None,
                timezone=str(seed_row.get("timezone") or "Asia/Seoul") if seed_row else "Asia/Seoul",
                extra_data={"source": "dim_store_sync"},
            )
            self.session.add(store)
            await self.session.flush()
            return store

        canonical_name = canonical_store_name(normalized_store_id, store.store_name)
        if store.store_name != canonical_name:
            store.store_name = canonical_name
        return store

    async def ensure_user(
        self,
        user_id: str | None,
        *,
        store_id: str | None = None,
        role: str | UserRole | None = None,
    ) -> User | None:
        """Provision a placeholder user row for write paths that only have headers."""

        if not user_id:
            return None

        user = await self.session.get(User, user_id)
        resolved_role = self._coerce_user_role(role)
        if user is None:
            # TODO: replace placeholder creation with proper user-master sync.
            user = User(
                user_id=user_id,
                store_id=store_id,
                name=user_id,
                role=resolved_role,
                extra_data={"auto_created": True},
            )
            self.session.add(user)
            await self.session.flush()
            return user

        if store_id and user.store_id is None:
            user.store_id = store_id
        return user

    async def ensure_products(self, store_id: str, product_ids: list[str]) -> dict[str, Product]:
        """Provision product masters using gold master data before falling back."""

        unique_ids = list(dict.fromkeys(product_ids))
        if not unique_ids:
            return {}

        existing = {
            product.product_id: product
            for product in (
                await self.session.scalars(
                    select(Product).where(Product.product_id.in_(unique_ids))
                )
            ).all()
        }
        missing = [product_id for product_id in unique_ids if product_id not in existing]
        gold_lookup: dict[str, dict] = {}
        if missing:
            placeholders = ", ".join(f":pid_{index}" for index in range(len(missing)))
            params = {f"pid_{index}": product_id for index, product_id in enumerate(missing)}
            gold_result = await self.session.execute(
                text(
                    f"""
                    WITH app_products AS (
                        SELECT product_id, product_name, category, base_price
                        FROM products
                        WHERE product_id IN ({placeholders})
                    ),
                    gold_products AS (
                        SELECT
                            product_id,
                            max(NULLIF(product_name, '')) AS product_name,
                            max(NULLIF(category, '')) AS category,
                            max(base_price) AS base_price
                        FROM dunkin_mart_copy.dim_product
                        WHERE product_id IN ({placeholders})
                        GROUP BY product_id
                    ),
                    silver_products AS (
                        SELECT
                            product_id,
                            max(NULLIF(product_name, '')) AS product_name,
                            max(NULLIF(category, '')) AS category,
                            max(base_price) AS base_price
                        FROM dunkin_mart_copy.new_dim_product_silver
                        WHERE product_id IN ({placeholders})
                        GROUP BY product_id
                    )
                    SELECT
                        COALESCE(ap.product_id, gp.product_id, sp.product_id) AS product_id,
                        COALESCE(ap.product_name, gp.product_name, sp.product_name) AS product_name,
                        COALESCE(ap.category, gp.category, sp.category) AS category,
                        COALESCE(ap.base_price, gp.base_price, sp.base_price) AS base_price
                    FROM app_products ap
                    FULL OUTER JOIN gold_products gp
                      ON gp.product_id = ap.product_id
                    FULL OUTER JOIN silver_products sp
                      ON sp.product_id = COALESCE(ap.product_id, gp.product_id)
                    """
                ),
                {**params},
            )
            gold_lookup = {
                str(row["product_id"]): dict(row)
                for row in gold_result.mappings().all()
                if row.get("product_id") is not None
            }
        for product_id in missing:
            master = gold_lookup.get(product_id) or {}
            product = Product(
                product_id=product_id,
                store_id=store_id,
                product_name=str(master.get("product_name") or product_id),
                category=str(master.get("category") or "").strip() or None,
                base_price=float(master["base_price"]) if master.get("base_price") is not None else None,
                extra_data={"source": "master_sync" if master else "auto_created"},
            )
            self.session.add(product)
            existing[product_id] = product
        if missing:
            await self.session.flush()
        return existing

    @staticmethod
    def _coerce_user_role(role: str | UserRole | None) -> UserRole:
        if isinstance(role, UserRole):
            return role
        try:
            return UserRole(str(role))
        except Exception:
            return UserRole.STORE_OWNER
