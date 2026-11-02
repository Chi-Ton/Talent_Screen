"""Create local release secrets once; never copy development CVs or credentials."""
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
destination = root / ".env.release"
if destination.exists():
    raise SystemExit(".env.release already exists; unchanged.")
text = (root / ".env.release.example").read_text(encoding="utf-8")
for placeholder in (
    "replace_with_random_database_password",
    "replace_with_at_least_32_random_characters",
    "replace_with_a_strong_login_password",
):
    text = text.replace(placeholder, secrets.token_hex(32))
with destination.open("x", encoding="utf-8") as file:
    file.write(text)
print("Created .env.release. Read HR_EMAIL and HR_PASSWORD there to log in.")
