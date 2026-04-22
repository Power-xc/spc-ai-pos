# FoxPOS PoC — 점주 PIP POS / 본사 HQ POS

PoC(Proof of Concept) 점주용 AI 어시스턴트 POS 시스템입니다.

## 프로젝트 구조

```
foxpos-poc-clean/
├── pip-pos/           # 점주 PIP POS (포트 5181)
│   ├── src/           # React + TypeScript 소스
│   │   ├── app/       # 컴포넌트 (AiPanel, Dashboard, Sidebar 등)
│   │   ├── mobile/    # 모바일 버전 (포트 5186)
│   │   ├── lib/       # API 클라이언트, 유틸리티
│   │   └── styles/    # Tailwind CSS
│   ├── index.html     # 데스크톱 진입점
│   ├── index.mobile.html  # 모바일 진입점
│   ├── vite.config.ts # Vite 설정 (포트 5181, /api → 8100 프록시)
│   └── vite.mobile.config.ts  # 모바일 Vite 설정
│
├── hq-pos/            # 본사 HQ POS (포트 5173)
│   ├── src/           # React + TypeScript 소스
│   │   ├── app/       # 컴포넌트 (AgentChatPanel, FloatingChatbot 등)
│   │   ├── lib/       # API 클라이언트, HQ 데이터
│   │   └── styles/    # Tailwind CSS
│   ├── public/mockup/ # POS 쉘 목업 HTML
│   ├── vite.config.ts # Vite 설정 (포트 5173, /api → 8100 프록시)
│   └── index.html     # 진입점
│
├── backend/           # FastAPI 백엔드 (포트 8100)
│   ├── app/           # 메인 애플리케이션
│   │   ├── agents/    # AI 에이전트 (Sales, Production, Order)
│   │   ├── orchestration/  # 인텐트 분류, 라우팅
│   │   ├── routers/   # API 엔드포인트
│   │   ├── services/  # LLM 게이트웨이, 마스킹
│   │   ├── tools/     # SQL 쿼리, 예측 엔진
│   │   └── schemas/   # Pydantic 스키마
│   ├── agents/        # 레거시 에이전트
│   ├── api/           # 레거시 API
│   ├── core/          # LLM 클라이언트, 분류기
│   └── Dockerfile     # Docker 빌드
│
├── infra/             # 인프라 설정
│   └── env/           # 환경변수 예시
│
├── docker-compose.yml # Docker Compose 설정
└── AGENTS.md          # AI 에이전트 가이드
```

## 대상 URL

| URL | 포트 | 소스 | 설명 |
|-----|------|------|------|
| http://localhost:5173/mockup/pos-shell.html | 5173 | `hq-pos/` | 본사 HQ POS 목업 쉘 |
| http://localhost:5181/ | 5181 | `pip-pos/` | 점주 PIP POS |
| http://localhost:5186/index.mobile.html | 5186 | `pip-pos/` (모바일) | 점주 PIP POS 모바일 |

## 실행 방법

### 사전 요구사항
- Node.js 18+
- Python 3.11+
- PostgreSQL 16+ (또는 Docker)
- vLLM 서버 (선택사항, 없으면 LLM 기능 제한)

### 1. 백엔드 실행

```bash
cd backend

# Docker 사용 시
docker compose -f ../../docker-compose.yml up -d postgres
# 또는 로컬 PostgreSQL 사용 시
# DATABASE_URL 설정 후:

# 의존성 설치 (poetry 사용)
pip install -r requirements.txt  # 또는 poetry install

# 환경변수 설정
cp .env.example .env  # .env 수정 필요

# 데이터베이스 마이그레이션
alembic upgrade head

# 서버 실행
uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload
```

### 2. PIP POS 실행 (포트 5181)

```bash
cd pip-pos
npm install
npm run dev -- --host 0.0.0.0 --port 5181
```

### 3. PIP POS 모바일 실행 (포트 5186)

```bash
cd pip-pos
npm run dev:mobile -- --host 0.0.0.0 --port 5186
# 또는
npx vite --config vite.mobile.config.ts --host 0.0.0.0 --port 5186
```

### 4. HQ POS 실행 (포트 5173)

```bash
cd hq-pos
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

### Docker Compose (전체 실행)

```bash
docker compose up -d
# 백엔드: http://localhost:8100
# HQ POS: http://localhost:5173
```

## 확인 포인트

1. **PIP POS (5181)**: http://localhost:5181/ → 점주 AI 채팅 패널 동작 확인
2. **모바일 (5186)**: http://localhost:5186/index.mobile.html → 모바일 레이아웃 확인
3. **HQ POS (5173)**: http://localhost:5173/mockup/pos-shell.html → 본사 대시보드 확인
4. **API**: http://localhost:8100/health → 백엔드 헬스체크
5. **AI 채팅**: http://localhost:5181/api/v1/chat → 채팅 API 동작 확인

## 주의사항

- `.env` 파일은 실제 비밀번호/키를 포함할 수 있으므로 Git에 커밋하지 마세요
- `DATA_MODE=postgres` 설정 시 PostgreSQL 연결이 필요합니다
- vLLM 서버가 없으면 LLM 응답이 제한됩니다
- 모바일 버전은 백엔드 프록시가 설정되어 있지 않으므로 직접 API URL 구성이 필요합니다
