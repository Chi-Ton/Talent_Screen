import httpx

from app.core.config import Settings
from app.services.ai.router_client import RouterClient


def test_router_client_uses_openai_compatible_chat_completions_without_logging_secret() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "```json\n{\"ok\": true}\n```"}}]})

    settings = Settings(
        jwt_secret="a" * 40,
        ai_provider="9router",
        ai_base_url="http://router.test/v1",
        ai_api_key="secret-test-key",
        ai_model="ag/gemini-3.1-pro-low",
        ai_retry_count=0,
    )
    result = RouterClient(settings, transport=httpx.MockTransport(handler)).complete_json(system_prompt="system", user_prompt="resume", trace_id="req_test")

    assert result == {"ok": True}
    assert len(calls) == 1
    assert calls[0].url == "http://router.test/v1/chat/completions"
    assert calls[0].headers["authorization"] == "Bearer secret-test-key"
    request_body = calls[0].read().decode("utf-8")
    assert request_body.find("ag/gemini-3.1-pro-low") >= 0
    assert '"store":false' in request_body
    assert calls[0].headers["x-data-classification"] == "pii-redacted"


def test_router_client_classifies_upstream_429_as_rate_limited() -> None:
    settings = Settings(jwt_secret="a" * 40, ai_provider="9router", ai_base_url="http://router.test/v1", ai_api_key="secret-test-key", ai_model="ag/gemini-3-flash", ai_retry_count=0)
    transport = httpx.MockTransport(lambda request: httpx.Response(429, json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}}))

    try:
        RouterClient(settings, transport=transport).complete_json(system_prompt="system", user_prompt="resume", trace_id="req_test")
    except Exception as exc:
        assert getattr(exc, "code", None) == "AI_RATE_LIMITED"
    else:
        raise AssertionError("Expected a rate-limit error")


def test_router_client_accepts_9router_sse_for_gemini_flash() -> None:
    stream = "\n".join([
        'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":"{\\\"ok\\\":"},"finish_reason":null}]}',
        'data: {"choices":[{"delta":{"content":"true}"},"finish_reason":null}]}',
        "data: [DONE]",
    ])
    settings = Settings(jwt_secret="a" * 40, ai_provider="9router", ai_base_url="http://router.test/v1", ai_api_key="secret-test-key", ai_model="ag/gemini-3.8-flash", ai_retry_count=0)
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text=stream, headers={"content-type": "text/event-stream"}))

    result = RouterClient(settings, transport=transport).complete_json(system_prompt="system", user_prompt="resume", trace_id="req_test")

    assert result == {"ok": True}
