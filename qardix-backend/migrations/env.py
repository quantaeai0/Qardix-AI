"""
Alembic Environment Configuration — Qardix AI

Configured for:
  - Async PostgreSQL (asyncpg driver via DATABASE_URL_SYNC for migrations)
  - Auto-import of all SQLAlchemy models for autogenerate support
  - DATABASE_URL_SYNC from .env (synchronous psycopg2 driver — Alembic needs sync)

Usage:
  # Create a new migration (auto-detects model changes):
  alembic revision --autogenerate -m "describe your change"

  # Apply all pending migrations:
  alembic upgrade head

  # Downgrade one step:
  alembic downgrade -1

  # Show current revision:
  alembic current

  # Show migration history:
  alembic history --verbose
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context

# ── Make sure the project root is on sys.path ─────────────────────────────────
# This allows: from app.models.models import ...
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# ── Load .env before importing app modules ────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

# ── Import all models so Alembic autogenerate picks them up ──────────────────
# IMPORTANT: Every model module must be imported here.
# If you add a new models file, import it here.
from app.database.connection import Base  # noqa: F401 — registers Base
import app.models.models  # noqa: F401 — registers all ORM tables

# ── Alembic config ────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Override sqlalchemy.url with DATABASE_URL_SYNC from environment
# (Alembic uses sync psycopg2, not asyncpg)
# Escape % signs in URL (configparser uses % for interpolation)
sync_url = os.environ.get("DATABASE_URL_SYNC")
if sync_url:
    # Escape percent signs so configparser doesn't treat them as interpolation
    escaped_url = sync_url.replace("%", "%%")
    config.set_main_option("sqlalchemy.url", escaped_url)

target_metadata = Base.metadata


# ── Migration runners ─────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode (generate SQL without connecting to DB).
    Useful for generating migration scripts to review before applying.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode (connect to DB and apply changes).
    Standard mode for: alembic upgrade head
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
