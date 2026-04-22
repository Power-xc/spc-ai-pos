# FoxPOS Workspace

BR Korea POS AI Agent POC — 통합 작업공간

## 디렉토리 구조

```
foxpos-workspace/
├── apps/
│   ├── backend/          # FastAPI 백엔드 (Python 3.11 + Poetry)
│   └── frontend/         # React/Vite 프론트엔드 (Node 20)
├── infra/
│   ├── docker/           # Dockerfile (Dockerfile.backend, Dockerfile.frontend)
│   └── env/              # 환경설정 파일
│       ├── backend.env        # 백엔드 런타임 환경변수
│       ├── backend.env.example
│       ├── frontend.env       # 프론트엔드 런타임 환경변수
│       └── frontend.env.example
├── data/
│   └── seed_data -> /data/sapie/tax/BR-POS-App-UX-PoC/data  # 시드 데이터 (심볼릭 링크)
├── docs/                 # 프로젝트 문서
├── scripts/              # 유틸리티 스크립트
├── logs/                 # 런타임 로그
└── docker-compose.yml    # 통합 Docker Compose
```

## 빠른 시작

```bash
cd /data/sapie/tax/foxpos-workspace

# 환경설정 (필요시 수정)
cp infra/env/backend.env.example infra/env/backend.env
cp infra/env/frontend.env.example infra/env/frontend.env

# 전체 실행
docker compose up -d --build

# 상태 확인
docker compose ps
curl http://localhost:8100/health        # 백엔드
curl -s http://localhost:5173/ -o /dev/null -w "%{http_code}\n"  # 프론트엔드
```

## 포트

| 서비스 | 포트 | 비고 |
|--------|------|------|
| backend | 8100 | FastAPI (host network) |
| frontend | 5173 | Vite dev server (host network) |
| postgres | 5433 | 외부 접근 가능 |
| redis | 6379 | `realtime` 프로필에서만 |

## 주요 환경변수

### Backend (infra/env/backend.env)
- `DATABASE_URL`: PostgreSQL 연결 문자열
- `OPENAI_BASE_URL`: LLM 엔드포인트 (기본: http://127.0.0.1:8002/v1)
- `OPENAI_MODEL`: LLM 모델명
- `DATA_MODE`: file | postgres

### Frontend (infra/env/frontend.env)
- `VITE_API_URL`: 백엔드 API URL (비워두면 Vite proxy 사용)
- `VITE_PROXY_TARGET`: 백엔드 프록시 대상 (기본: http://127.0.0.1:8100)

## 아키텍처

- **Backend**: FastAPI + SQLAlchemy + Alembic + Poetry
- **Frontend**: React 18 + Vite + TypeScript
- **DB**: PostgreSQL 16 (docker volume)
- **LLM**: llama.cpp GLM-5.1 (host:8002)