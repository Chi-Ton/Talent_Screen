"""Remove legacy extracted CV text while preserving local source files and profiles."""

import argparse

from sqlalchemy import func, select, update

from app.db.models import Resume
from app.db.session import SessionLocal


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Commit the cleanup. Without this flag the command is read-only.")
    args = parser.parse_args()

    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(Resume).where(Resume.raw_text.is_not(None))) or 0
        if not args.apply:
            print(f"Dry run: {count} resume raw-text rows would be cleared.")
            return 0
        db.execute(update(Resume).where(Resume.raw_text.is_not(None)).values(raw_text=None))
        db.commit()
        print(f"Cleared {count} historical raw-text rows. Source files and structured profiles were preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
