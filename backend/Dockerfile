FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    POETRY_NO_INTERACTION=1 \
    POETRY_VERSION=1.8.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && pip install --no-cache-dir "poetry==${POETRY_VERSION}" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md alembic.ini ./
RUN poetry install --with dev --no-root

COPY app ./app
COPY tools ./tools
COPY config ./config
COPY alembic ./alembic

RUN mkdir -p logs

EXPOSE 8100

CMD ["sh", "-c", "alembic upgrade head && poetry run uvicorn app.main:app --host 0.0.0.0 --port 8100"]
