# FoxPOS Backend

BR코리아(던킨) 매장 운영 AI 어시스턴트 PoC용 **FastAPI 백엔드**입니다.
자연어 요청을 의도(intent) 분류 후 도메인 에이전트로 라우팅하고, OpenAI 호환 LLM과
PostgreSQL을 사용해 매출·생산·발주 인사이트를 제공합니다.

## 구조

```text
backend/
├── app/
│   ├── main.py            # FastAPI 엔트리포인트 (app.main:app)
│   ├── agents/            # 도메인 에이전트 (sales / production / order)
│   ├── orchestration/     # 의도 분류 · 라우팅
│   ├── routers/           # REST 엔드포인트
│   ├── services/          # LLM 게이트웨이 · 마스킹 · 스케줄러 등
│   ├── tools/             # 예측 · 기회손실 계산 등
│   ├── models/ · db/      # SQLAlchemy 모델 · 세션
│   ├── schemas/           # Pydantic 스키마
│   └── security/          # 감사 로그 · 마스킹 · RBAC
├── tools/                 # 공용 계산 유틸 (app에서 사용)
├── alembic/               # DB 마이그레이션
├── config/                # events.json 등 설정 데이터
├── scripts/               # 시드/유지보수 스크립트
├── alembic.ini
├── Dockerfile
└── pyproject.toml
```

## 로컬 실행

```bash
cp .env.example .env        # DATABASE_URL, OPENAI_*, CORS_ORIGINS 등 설정
poetry install
poetry run alembic upgrade head
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload
```

기본 주소는 `http://localhost:8100`, 헬스체크는 `GET /health`입니다.

Redis는 기본적으로 필요 없으며, 실시간 SSE fan-out이 필요할 때만
`docker compose --profile realtime up -d redis`로 추가합니다.

## Docker

저장소 루트의 `docker-compose.yml`이 PostgreSQL과 이 백엔드를 함께 띄웁니다.
자세한 실행 방법은 [루트 README](../README.md#로컬-실행)를 참고하세요.

## 시드 스크립트

`scripts/`의 데이터 적재 스크립트는 DB 접속 정보를 **환경변수**에서 읽습니다
(`scripts/_db.py` 참고). 실행 전 아래를 지정하세요.

```bash
export PGPASSWORD=...        # docker-compose의 POSTGRES_PASSWORD와 동일하게
export PGHOST=127.0.0.1 PGPORT=5433 PGDATABASE=foxpos PGUSER=app_user
export SEED_PICKLE=./data/seed_data/.cache/local_data_store.pkl   # 시드 데이터 경로
python scripts/load_all_gold_tables.py
```
