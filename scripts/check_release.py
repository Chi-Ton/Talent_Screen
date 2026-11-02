"""Read-only HTTP checks against the local release deployment."""
import json
from pathlib import Path
from urllib.request import Request, urlopen

values = {}
for line in (Path(__file__).resolve().parents[1] / ".env.release").read_text().splitlines():
    if line.strip() and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        values[key] = value
base = "http://127.0.0.1:" + values.get("WEB_PORT", "3100")


def request(path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with urlopen(Request(base + path, data=json.dumps(body).encode() if body else None, headers=headers), timeout=20) as response:
        return response.status, response.read()


assert request("/login")[0] == 200
assert request("/api/v1/health")[0] == 200
assert b"swagger-ui" in request("/docs")[1]
assert "/api/v1/jobs" in json.loads(request("/openapi.json")[1])["paths"]
_, body = request("/api/v1/auth/login", {"email": values["HR_EMAIL"], "password": values["HR_PASSWORD"]})
token = json.loads(body)["accessToken"]
for path in ("/api/v1/jobs", "/api/v1/candidates", "/api/v1/batches", "/api/v1/settings/data-retention"):
    assert request(path, token=token)[0] == 200
    print(path + " OK")
for path in ("/screen", "/results", "/compare", "/settings"):
    assert request(path)[0] == 200
print("Login, health, core pages and authenticated API checks passed.")
