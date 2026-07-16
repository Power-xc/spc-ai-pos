"""Shared database + seed-data settings for the maintenance/seed scripts.

Credentials are read from the environment so nothing sensitive lives in the
source tree. Match these to docker-compose.yml (the ``POSTGRES_*`` values) or to
the backend ``.env``::

    export PGPASSWORD=...            # required — matches POSTGRES_PASSWORD
    export PGHOST=127.0.0.1 PGPORT=5433 PGDATABASE=pipaipos PGUSER=app_user
    export SEED_PICKLE=./data/seed_data/.cache/local_data_store.pkl

Run the scripts from the ``backend/`` directory, e.g.::

    python scripts/load_all_gold_tables.py
"""
from __future__ import annotations

import os


def db_config() -> dict:
    """Return asyncpg connection kwargs sourced from the environment."""
    password = os.environ.get("PGPASSWORD")
    if not password:
        raise SystemExit(
            "PGPASSWORD is not set. Export the database credentials "
            "(see scripts/_db.py) before running this script."
        )
    return {
        "host": os.environ.get("PGHOST", "127.0.0.1"),
        "port": int(os.environ.get("PGPORT", "5433")),
        "database": os.environ.get("PGDATABASE", "pipaipos"),
        "user": os.environ.get("PGUSER", "app_user"),
        "password": password,
    }


# Path to the pickled seed-data store. Relative to the repo by default; override
# with the SEED_PICKLE environment variable to point at another location.
SEED_PICKLE = os.environ.get(
    "SEED_PICKLE", "./data/seed_data/.cache/local_data_store.pkl"
)
