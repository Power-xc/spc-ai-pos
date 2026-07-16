# PostgreSQL Backend Round 1

## 1. 현재 백엔드 DB 구조 유무

### 확인 결과

- `backend/main.py` + `backend/api/*` 는 현재 프론트가 붙기 쉬운 파일 기반 POC 서버다.
- `backend/app/main.py` 는 별도 FastAPI 진입점이며, 이미 `SQLAlchemy AsyncSession + app.database + Alembic stub` 구조를 일부 갖고 있었다.
- 초기 확인 시 ORM 파일은 일부 레거시/실험 코드가 섞여 있었고, 실제로는 `app/models/*`, `app/db/repositories/*`, `app/services/*` 를 기준으로 다시 정리하는 편이 안전했다.
- 기존 `backend/alembic/env.py` 는 `target_metadata = None` 상태라 migration 생성/적용 경로가 사실상 미완성이었다.
- `backend/app/tools/sql_queries.py` 는 PostgreSQL SQL이 아니라 `LocalDataStore` 기반 pandas 조회 유틸이다.

### 재사용 가능 여부

- 재사용 가능:
  - `backend/app/main.py`
  - `backend/app/config.py`
  - `backend/app/dependencies.py`
  - `backend/app/database.py` import 경로
  - `AsyncSession` 기반 앱 수명주기 구조
- 부분 재사용:
  - 기존 `backend/app/schemas/*`
  - 기존 agents/router 구조
- 재작업 필요:
  - 기존 Alembic stub 연결
  - 모델/리포지토리/서비스 경로 정합화
  - 실제 PostgreSQL 모델/metadata/migration

### 이번 라운드 신규/정리 스택

- 런타임 DB 레이어: `SQLAlchemy 2.x + AsyncSession + asyncpg`
- 마이그레이션: `Alembic`
- 운영 원장: `PostgreSQL`
- Redis: 선택 사항. 이번 라운드는 필수 아님.

## 2. PostgreSQL 채택 판단

- 채택 권장: `Dashboard / Alerts / SSE / Orders / Chat` 은 모두 정형 상태와 이력을 함께 보존해야 한다.
- 이유:
  - `confirmOrder` 는 트랜잭션 일관성이 필요하다.
  - `alerts` 는 현재 상태와 이벤트 로그 분리가 필요하다.
  - `chat` 은 `session_id` 기준의 문맥 복구가 필요하다.
  - `dashboard` 는 inventory/orders/alerts 기반 read model 조합이 가능하다.
- 이번 라운드 판단:
  - NoSQL/벡터DB 선도입 불필요
  - PostgreSQL 중심으로 충분히 시작 가능
  - Redis는 SSE fan-out 최적화나 분산 알림에서만 추후 추가

## 3. 최소 필수 테이블 설계안

### 관계 개요

- `stores 1:N users`
- `stores 1:N inventory_snapshots`
- `products 1:N inventory_snapshots`
- `stores 1:N order_recommendations`
- `order_recommendations 1:N order_recommendation_items`
- `stores 1:N orders`
- `order_recommendations 1:N orders` (선택 추천안 연결)
- `orders 1:N order_items`
- `stores 1:N alerts`
- `alerts 1:N alert_events`
- `stores 1:N chat_sessions`
- `chat_sessions 1:N chat_messages`

### 테이블별 설계

#### `stores`

- 목적: 모든 운영 데이터의 테넌트 기준
- PK/FK: `store_id` PK
- 주요 컬럼:
  - `store_id`, `store_name`
  - `region`, `city`, `timezone`
  - `is_active`
  - `metadata`
- nullable:
  - `region`, `city` nullable
- index 후보:
  - `store_name`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요. `is_active` 로 충분
- 우선순위:
  - 즉시 필요

#### `users`

- 목적: 주문 확정자, 알림 actor, 채팅 소유자 식별
- PK/FK:
  - `user_id` PK
  - `store_id -> stores.store_id`
- 주요 컬럼:
  - `user_id`, `store_id`, `name`, `email`
  - `role`
  - `is_active`
  - `metadata`
- nullable:
  - `store_id`, `name`, `email` nullable
- index 후보:
  - `store_id`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요. `is_active`
- 우선순위:
  - 즉시 필요

#### `products`

- 목적: `confirmOrder` 와 inventory/order/chat 모두에서 공통 참조하는 상품 마스터
- PK/FK:
  - `product_id` PK
- 주요 컬럼:
  - `product_id`, `product_name`, `category`, `unit`
  - `base_price`, `cost_price`
  - `is_active`, `metadata`
- nullable:
  - `category`, `base_price`, `cost_price`
- index 후보:
  - `product_name`, `category`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요. `is_active`
- 우선순위:
  - 즉시 필요

#### `inventory_snapshots`

- 목적: dashboard/production 판단의 원천 스냅샷
- PK/FK:
  - `id` UUID PK
  - `store_id -> stores`
  - `product_id -> products`
- 주요 컬럼:
  - `biz_date`, `snapshot_at`
  - `on_hand_qty`, `sold_qty`, `waste_qty`
  - `base_price`, `cost_price`
  - `stockout_minutes`, `reorder_triggered`
  - `risk_level`, `predicted_stock_1h`, `depletion_eta`
  - `hourly_burn_rate`, `stockout_probability`, `recommended_production_qty`
  - `source`, `metadata`
- nullable:
  - `biz_date`, 판매/예측 관련 대부분 nullable 허용
- index 후보:
  - `(store_id, snapshot_at)`
  - `(store_id, biz_date)`
  - unique `(store_id, product_id, snapshot_at)`
- timestamps:
  - `created_at`
- soft delete:
  - 불필요
- 우선순위:
  - 즉시 필요

#### `order_recommendations`

- 목적: 주문 추천 옵션 1건을 저장. 한 번의 추천 응답은 `recommendation_batch_id` 로 묶음
- PK/FK:
  - `id` UUID PK
  - `store_id -> stores`
  - `created_by_user_id -> users`
- 주요 컬럼:
  - `recommendation_batch_id`
  - `option_id`, `label`
  - `category`, `product_group`
  - `reference_date`, `deadline_time`
  - `source`, `status`
  - `four_week_avg_qty`, `total_qty`, `total_amount`
  - `deviation_pct`, `deviation_label`, `explanation`
  - `expires_at`
  - `snapshot_payload`, `metadata`
- nullable:
  - `product_group`, `reference_date`, `deadline_time`, `total_amount`, `explanation`, `expires_at`, `created_by_user_id`
- index 후보:
  - `recommendation_batch_id`
  - `(store_id, created_at)`
  - unique `(recommendation_batch_id, option_id)`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요. `status` 로 충분
- 우선순위:
  - 즉시 필요

#### `order_recommendation_items`

- 목적: 추천안의 라인 아이템 snapshot
- PK/FK:
  - `id` UUID PK
  - `recommendation_id -> order_recommendations`
  - `product_id -> products` nullable
- 주요 컬럼:
  - `product_name_snapshot`
  - `quantity`
  - `unit_price`, `amount`
  - `note`, `ai_reason`, `confidence`
  - `sort_order`
  - `metadata`
- nullable:
  - `product_id`, `unit_price`, `amount`, `note`, `ai_reason`, `confidence`
- index 후보:
  - `(recommendation_id, sort_order)`
- timestamps:
  - `created_at`
- soft delete:
  - 불필요
- 우선순위:
  - 즉시 필요

#### `orders`

- 목적: `confirmOrder` 결과를 보존하는 원장 헤더
- PK/FK:
  - `id` UUID PK
  - `store_id -> stores`
  - `recommendation_id -> order_recommendations` nullable
  - `confirmed_by_user_id -> users` nullable
- 주요 컬럼:
  - `order_no`
  - `source`, `status`, `pricing_status`
  - `currency_code`
  - `total_qty`, `total_amount`
  - `memo`
  - `session_id`
  - `confirmed_at`, `submitted_at`, `cancelled_at`
  - `context_payload`, `metadata`
- nullable:
  - `order_no`, `recommendation_id`, `total_amount`, `memo`, `session_id`, `confirmed_by_user_id`, 시간 필드 일부
- index 후보:
  - `(store_id, confirmed_at)`
  - `(store_id, status)`
  - unique `order_no`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요. `status`
- 우선순위:
  - 즉시 필요

#### `order_items`

- 목적: `confirmOrder` payload의 실제 라인 보존
- PK/FK:
  - `id` UUID PK
  - `order_id -> orders`
  - `product_id -> products` nullable
- 주요 컬럼:
  - `product_name_snapshot`
  - `quantity`
  - `unit_price`, `amount`
  - `pricing_status`
  - `sort_order`, `note`
  - `metadata`
- nullable:
  - `product_id`, `unit_price`, `amount`, `note`
- index 후보:
  - `(order_id, sort_order)`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요
- 우선순위:
  - 즉시 필요

#### `alerts`

- 목적: 대시보드/이슈 패널에서 보여줄 현재 alert 상태
- PK/FK:
  - `id` UUID PK
  - `store_id -> stores`
- 주요 컬럼:
  - `alert_type`
  - `severity`, `status`, `source`
  - `source_agent`
  - `title`, `subtitle`, `summary`, `message`
  - `is_unread`
  - `related_entity_type`, `related_entity_id`
  - `cta_label`, `cta_action`, `cta_route`
  - `sse_event_type`
  - `occurred_at`, `first_read_at`, `acknowledged_at`, `resolved_at`
  - `payload`, `metadata`
- nullable:
  - `subtitle`, `message`, `source_agent`, related entity/cta 일부
- index 후보:
  - `(store_id, status, occurred_at)`
  - `(store_id, is_unread)`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요. `status`
- 우선순위:
  - 즉시 필요

#### `alert_events`

- 목적: alert 상태 변경 이력과 SSE 발행 이력
- PK/FK:
  - `id` UUID PK
  - `alert_id -> alerts`
  - `store_id -> stores`
  - `actor_user_id -> users` nullable
- 주요 컬럼:
  - `event_type`
  - `event_at`
  - `emitted_to_sse`
  - `payload`
- nullable:
  - `actor_user_id`
- index 후보:
  - `(alert_id, event_at)`
  - `(store_id, event_at)`
- timestamps:
  - `created_at`
- soft delete:
  - 불필요
- 우선순위:
  - 즉시 필요

#### `chat_sessions`

- 목적: 프론트 `session_id` 를 DB에서도 식별 가능한 채팅 세션으로 보존
- PK/FK:
  - `id` UUID PK
  - `session_id` unique
  - `store_id -> stores` nullable
  - `user_id -> users` nullable
- 주요 컬럼:
  - `status`
  - `route_path`, `page_key`, `title`
  - `last_message_at`
  - `context_payload`, `metadata`
- nullable:
  - `store_id`, `user_id`, `route_path`, `page_key`, `title`, `last_message_at`
- index 후보:
  - `session_id`
  - `(store_id, last_message_at)`
- timestamps:
  - `created_at`, `updated_at`
- soft delete:
  - 불필요. `status`
- 우선순위:
  - 즉시 필요

#### `chat_messages`

- 목적: user/assistant/tool turn 자체를 저장
- PK/FK:
  - `id` UUID PK
  - `chat_session_id -> chat_sessions`
  - `user_id -> users` nullable
- 주요 컬럼:
  - `role`
  - `message_order`
  - `content`
  - `response_type`
  - `model_name`, `latency_ms`, `token_usage`
  - `context_payload`, `actions_payload`, `raw_payload`
- nullable:
  - `user_id`, `content`, `response_type`, `model_name`, `latency_ms`, `token_usage`
- index 후보:
  - unique `(chat_session_id, message_order)`
  - `(chat_session_id, created_at)`
- timestamps:
  - `created_at`
- soft delete:
  - 불필요
- 우선순위:
  - 즉시 필요

## 4. SQLAlchemy 모델 구조안

### 실제 생성한 파일 구조

```text
backend/app/
├── db/
│   ├── base.py
│   ├── session.py
│   └── repositories/
│       ├── alert_repository.py
│       ├── chat_repository.py
│       ├── dashboard_repository.py
│       └── order_repository.py
├── database.py
├── models/
│   ├── __init__.py
│   ├── common.py
│   ├── store.py
│   ├── user.py
│   ├── product.py
│   ├── inventory.py
│   ├── order.py
│   ├── alert.py
│   └── chat.py
└── services/
    ├── order_service.py
    ├── dashboard_service.py
    ├── alert_service.py
    └── chat_service.py
```

### 공통 베이스

- `app/db/base.py`
  - `Base`
  - `TimestampMixin`
  - `CreatedAtMixin`
  - `UUIDPrimaryKeyMixin`

### 공통 Enum

- `app/models/common.py`
  - `UserRole`
  - `InventoryRiskLevel`
  - `RecommendationSource`
  - `RecommendationStatus`
  - `OrderSource`
  - `OrderStatus`
  - `PricingStatus`
  - `AlertSeverity`
  - `AlertStatus`
  - `AlertSource`
  - `AlertEventType`
  - `ChatSessionStatus`
  - `ChatRole`

### 구현 상 주의점

- Python attribute 이름으로 `metadata` 를 직접 쓰지 않고 `extra` 로 매핑했다.
  - column name 은 그대로 `metadata` 유지
  - 이유: SQLAlchemy declarative 에서 `metadata` 는 예약 속성이라 충돌 가능
- `stores/users/products` 는 프론트 계약의 식별자(`store_id`, `user_id`, `product_id`)를 그대로 PK로 썼다.
- 이벤트성 테이블은 UUID PK를 사용했다.

## 5. Alembic migration 초안

### 실제 생성 파일

```text
backend/alembic.ini
backend/migrations/env.py
backend/migrations/versions/20260410_0001_postgres_operational_core.py
```

### 실행 순서

```bash
cd backend
cp .env.postgres.round1.example .env
poetry install
docker compose up -d postgres
poetry run alembic upgrade head
```

### 주의사항

- 기존 `backend/alembic/` 는 레거시 stub다.
- 이번 라운드의 실제 migration 경로는 `backend/migrations/` 와 `backend/alembic.ini` 다.
- `DATABASE_SCHEMA` 기본값은 기존 설정 호환을 위해 `dunkin_mart` 유지했다.
- 운영에서 스키마명을 바꾸려면 `.env` 의 `DATABASE_SCHEMA` 만 조정하면 된다.

## 6. confirmOrder / dashboard / alerts / chat DB 매핑

### A. Dashboard

- 원천 테이블:
  - `inventory_snapshots`
  - `alerts`
  - `orders`
  - `order_recommendations`
- 판단:
  - 지금은 API/service 계층 조합이 적절
  - materialized view 는 다음 라운드 후보
- 이유:
  - 아직 집계 규칙이 완전히 고정되지 않았고
  - 현재는 위젯별 조합이 더 잦다
- 보류:
  - 하루 집계 기준시각
  - inventory snapshot 적재 주기
  - dashboard refresh read-model 캐시 필요 여부

### B. Orders

- recommendation 과 confirmed order 는 분리
- recommendation snapshot 은 저장
  - 이유: 추천 당시 기준값, 편차, explanation, item snapshot 을 나중에 감사/재현 가능해야 함
- confirmOrder 흐름:
  1. 프론트에서 `items[{product_id, quantity}]`
  2. `orders` 1건 생성
  3. `order_items` N건 생성
  4. 가격이 확인 가능하면 `unit_price/amount/total_amount` 채움
  5. 가격이 미확정이면 `pricing_status = pending`, 금액 nullable 유지
- 보류:
  - `order_no` 생성 규칙
  - 추천안 선택 없이 manual confirm 허용 범위
  - 주문 제출/취소 후 상태 전이 규칙

### C. Alerts

- `alerts` 와 `alert_events` 분리
- `alerts` 는 현재 상태
- `alert_events` 는 생성/전달/read/ack/resolved 이력
- unread/read:
  - `alerts.is_unread`
  - `alerts.status`
  - `alert_events(event_type=read)` 로 이력 보존
- severity/source/related entity:
  - `severity`, `source`, `source_agent`
  - `related_entity_type`, `related_entity_id`
- SSE:
  - DB 상태를 push 하는 채널
  - `alert_events.emitted_to_sse` 로 발행 여부를 남길 수 있게 설계
- 보류:
  - 중복 alert dedup key
  - 자동 resolve 규칙
  - 사용자별 unread 여부를 별도 테이블로 분리할지 여부

### D. Chat

- `chat_sessions` / `chat_messages` 분리
- `session_id` 는 unique
- `context_payload` 에 page context, action context, order context 저장 가능
- `chat_messages.raw_payload` 에 model raw metadata 저장 가능
- `actions_payload` 에 action_cards/order draft payload 저장 가능
- 보류:
  - 세션 종료 TTL
  - assistant/tool message 저장 granularity
  - 대화 요약(summary) 컬럼 필요 여부

## 7. .env 및 실행 방법

### 예시 파일

- 기본 예시: `backend/.env.example`
- PostgreSQL 예시: `backend/.env.postgres.round1.example`

### docker compose

- 기본 서비스:
  - `postgres`
  - `api`
- 선택 서비스:
  - `redis` (`realtime` profile)

### 초기 셋업 순서

1. `cd backend`
2. `cp .env.postgres.round1.example .env`
3. `docker compose up -d postgres`
4. `poetry install`
5. `poetry run alembic upgrade head`
6. `poetry run uvicorn app.main:app --reload`

## 8. 지금 바로 생성 가능한 파일 목록

### SQLAlchemy 모델 파일

- `backend/app/db/base.py`
- `backend/app/db/session.py`
- `backend/app/models/__init__.py`
- `backend/app/models/common.py`
- `backend/app/models/store.py`
- `backend/app/models/user.py`
- `backend/app/models/product.py`
- `backend/app/models/inventory.py`
- `backend/app/models/order.py`
- `backend/app/models/alert.py`
- `backend/app/models/chat.py`

### Repository / Service 연결 포인트

- `backend/app/db/repositories/order_repository.py`
- `backend/app/db/repositories/dashboard_repository.py`
- `backend/app/db/repositories/alert_repository.py`
- `backend/app/db/repositories/chat_repository.py`
- `backend/app/services/order_service.py`
- `backend/app/services/dashboard_service.py`
- `backend/app/services/alert_service.py`
- `backend/app/services/chat_service.py`

### Alembic 최초 migration 파일

- `backend/alembic.ini`
- `backend/migrations/env.py`
- `backend/migrations/versions/20260410_0001_postgres_operational_core.py`

## 9. 아직 업무 규칙 확인이 필요한 필드 목록

- `orders.order_no`
  - 내부 시퀀스/일자 prefix/외부 ERP 번호 중 무엇을 쓸지 미확정
- `orders.total_amount`
  - 주문 시점 확정인지, 공급사 응답 후 확정인지 미확정
- `order_items.unit_price`, `order_items.amount`
  - 프론트 confirm payload 에 없음. 현재 nullable/pending 처리
- `order_recommendations.expires_at`
  - 추천안 만료 기준 시각 미확정
- `order_recommendations.deadline_time`
  - 카테고리별 마감 기준이 고정값인지 정책 테이블로 분리할지 미확정
- `alerts.related_entity_type`, `alerts.related_entity_id`
  - 엔티티 타입 표준값 미정
- `alerts.source_agent`
  - `production/order/sales/chat/system` 이상으로 세분화할지 미정
- `alerts` unread scope
  - 매장 단위 공용 unread 인지 사용자별 unread 인지 미정
- `chat_sessions.title`
  - 자동 생성할지 사용자 입력인지 미정
- `chat_sessions.status`
  - `closed/archive` 전이 규칙, retention 기간 미정
- `chat_messages.actions_payload`
  - 액션 카드 JSON 표준 스키마 확정 필요
- `products.base_price`, `products.cost_price`
  - 상품 마스터 기준값인지 점포별 snapshot 기준값인지 미확정

## 현재 프론트/백엔드 계약에서 확인된 점

- 프론트 `confirmOrder` 는 `store_id + items[{ product_id, quantity }]` 계약이다.
- 프론트 `chat` 은 `session_id` 와 `context` 를 같이 보낸다.
- 프론트 `useAlerts` SSE 는 DB 자체가 아니라 알림 push 채널이다.
- 현재 `v0.3` 프론트는 `/api/*` 경로를 사용하고, `backend/app/main.py` 는 `/api/v1/*` 경로를 사용한다.
  - 즉, 경로 정합화 또는 adapter router 는 다음 라운드에서 정리 필요
