"""Exercise the release startup sequence in a disposable PostgreSQL database."""

import os
import subprocess
import sys
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import get_settings


def main() -> None:
    source_url = make_url(get_settings().database_url)
    database = f"talentscreen_fresh_verify_{uuid4().hex[:12]}"
    admin = create_engine(source_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.exec_driver_sql(f'CREATE DATABASE "{database}"')
    try:
        test_url = source_url.set(database=database)
        environment = dict(os.environ)
        environment.update({
            "DATABASE_URL": test_url.render_as_string(hide_password=False),
            "HR_EMAIL": "fresh-install-test@example.invalid",
            "HR_PASSWORD": "fresh-install-test-password",
        })
        for command in (
            [sys.executable, "-m", "alembic", "upgrade", "e812d7c490ab"],
            [sys.executable, "-m", "app.compact.bootstrap"],
            [sys.executable, "-m", "alembic", "upgrade", "head"],
        ):
            subprocess.run(command, env=environment, check=True)
        target = create_engine(test_url)
        with target.connect() as connection:
            tables = connection.execute(text("""SELECT tablename FROM pg_tables
                WHERE schemaname='compact_v2' ORDER BY tablename""")).scalars().all()
            public_tables = connection.execute(text("""SELECT tablename FROM pg_tables
                WHERE schemaname='public' ORDER BY tablename""")).scalars().all()
            users = connection.scalar(text("SELECT count(*) FROM compact_v2.users"))
        target.dispose()
        assert len(tables) == 9, tables
        assert public_tables == ["alembic_version"], public_tables
        assert users == 1, users
        print("Fresh install verified: 9 application tables, one HR, no legacy tables")
    finally:
        with admin.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE "{database}" WITH (FORCE)')
        admin.dispose()


if __name__ == "__main__":
    main()
