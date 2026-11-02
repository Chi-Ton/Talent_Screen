import json
import logging
import time
from typing import Any

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger("talentscreen.ai")


class AIClientError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class RouterClient:
    """Small OpenAI-compatible client for 9Router and other local providers."""

    def __init__(self, settings: Settings | None = None, transport: httpx.BaseTransport | None = None) -> None:
        self.settings = settings or get_settings()
        self.transport = transport

    @property
    def is_configured(self) -> bool:
        provider = self.settings.ai_provider.lower()
        if self.settings.ai_privacy_mode == "strict_local" and provider != "local":
            return False
        return provider in {"9router", "local"} and bool(self.settings.ai_base_url and self.settings.ai_api_key and self.settings.ai_model)

    def complete_json(self, *, system_prompt: str, user_prompt: str, trace_id: str) -> dict[str, Any]:
        if not self.is_configured:
            if self.settings.ai_privacy_mode == "strict_local":
                raise AIClientError("AI_PRIVACY_POLICY_BLOCKED", "Strict local privacy mode blocks remote AI providers.")
            raise AIClientError("AI_NOT_CONFIGURED", "The AI provider is not configured on the backend.")

        url = self.settings.ai_base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": self.settings.ai_model,
            "temperature": 0,
            "store": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        headers = {"Authorization": f"Bearer {self.settings.ai_api_key}", "Content-Type": "application/json", "X-Data-Classification": "pii-redacted"}
        attempts = self.settings.ai_retry_count + 1
        last_error: AIClientError | None = None
        for attempt in range(attempts):
            try:
                with httpx.Client(timeout=self.settings.ai_timeout_seconds, transport=self.transport) as client:
                    response = client.post(url, headers=headers, json=payload)
                if response.status_code >= 500 and attempt < attempts - 1:
                    time.sleep(min(0.5 * (attempt + 1), 2))
                    continue
                if response.status_code == 429:
                    raise AIClientError("AI_RATE_LIMITED", "The AI provider is rate-limiting requests. Wait a moment and retry.")
                if response.status_code >= 400:
                    raise AIClientError("AI_PROVIDER_ERROR", f"The AI provider returned HTTP {response.status_code}.")
                content = self._response_content(response)
                if not isinstance(content, str) or not content.strip():
                    raise AIClientError("AI_EMPTY_RESPONSE", "The AI provider returned an empty response.")
                return self._parse_json(content)
            except AIClientError as exc:
                last_error = exc
                if exc.code not in {"AI_PROVIDER_ERROR", "AI_EMPTY_RESPONSE"} or attempt >= attempts - 1:
                    raise
            except (httpx.HTTPError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
                last_error = AIClientError("AI_PROVIDER_UNAVAILABLE", "The AI provider could not be reached or returned invalid data.")
                logger.warning("ai_request_failed trace_id=%s model=%s attempt=%s error_type=%s", trace_id, self.settings.ai_model, attempt + 1, type(exc).__name__)
                if attempt >= attempts - 1:
                    raise last_error from exc
        raise last_error or AIClientError("AI_PROVIDER_UNAVAILABLE", "The AI provider could not complete the request.")

    @staticmethod
    def _response_content(response: httpx.Response) -> str | None:
        content_type = response.headers.get("content-type", "").lower()
        if "text/event-stream" not in content_type:
            body = response.json()
            return body.get("choices", [{}])[0].get("message", {}).get("content")

        parts: list[str] = []
        for line in response.text.splitlines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            event = json.loads(data)
            choice = event.get("choices", [{}])[0]
            value = choice.get("delta", {}).get("content") or choice.get("message", {}).get("content")
            if isinstance(value, str):
                parts.append(value)
        return "".join(parts) or None

    @staticmethod
    def _parse_json(content: str) -> dict[str, Any]:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
            cleaned = cleaned.rsplit("```", 1)[0].strip()
        value = json.loads(cleaned)
        if not isinstance(value, dict):
            raise AIClientError("AI_INVALID_RESPONSE", "The AI provider response must be a JSON object.")
        return value
