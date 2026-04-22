# Dunkin AI Agent Backend

던킨도너츠 매장 운영 AI Agent POC용 FastAPI 백엔드다. 이번 라운드 기준으로 PostgreSQL 중심 영속 계층의 최소 뼈대(ORM 모델, repository/service 초안, Alembic migration 초안)를 포함한다.

## 구조

```text
backend/
├── app/
│   ├── agents/
│   ├── db/
│   ├── models/
│   ├── routers/
│   ├── schemas/
│   ├── security/
│   ├── services/
│   └── tools/
├── migrations/
│   └── versions/
├── docker-compose.yml
├── alembic.ini
├── Dockerfile
├── pyproject.toml
├── .env.example
└── .gitignore
```

## 로컬 실행

```bash
cp .env.example .env
poetry install
poetry run uvicorn app.main:app --reload
```

기본 주소는 `http://localhost:8000`이다.

## PostgreSQL 로컬 실행

```bash
cp .env.postgres.round1.example .env
docker compose up -d postgres
poetry install
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload
```

기본적으로 Redis 없이도 동작하며, 실시간 fan-out 고도화가 필요할 때만 `docker compose --profile realtime up -d redis`를 추가한다.

## Docker 실행

```bash
cp .env.postgres.round1.example .env
docker compose up --build
```

`docker-compose.yml`은 PostgreSQL과 FastAPI를 기본으로 띄운다. Redis는 선택 프로파일이다.

## 현재 상태

- `main.py` / `api/*`: 파일 기반 POC API
- `app.main`: SQLAlchemy async 세션을 사용하는 차세대 FastAPI 엔트리포인트
- `app/models`, `app/db/repositories`, `migrations`: PostgreSQL 영속 계층 준비 완료
- 실제 라우터의 전면 DB 전환은 다음 라운드에서 서비스 레이어를 연결하면서 진행
