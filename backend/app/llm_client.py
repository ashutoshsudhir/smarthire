"""Single, provider-agnostic LLM entry point: ``call(prompt, schema)``.

* Providers: ``mock`` (deterministic heuristics, no key needed), ``anthropic``, ``openai``
  (also any OpenAI-compatible endpoint via LLM_BASE_URL). Chosen with LLM_PROVIDER.
* Output is validated against a Pydantic schema. On invalid JSON / schema mismatch or a
  transient provider error (timeout, 429, 5xx) the call is retried exactly ONCE, then a
  clean ``LLMError`` is raised. Never loops.
* Single-turn, no tools, no agents.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .config import get_settings

log = logging.getLogger("smarthire.llm")

T = TypeVar("T", bound=BaseModel)

MAX_ATTEMPTS = 2  # first try + exactly one retry

DEFAULT_MODELS = {"anthropic": "claude-opus-5", "openai": "gpt-4.1-mini", "mock": "heuristic-v1"}


class LLMError(Exception):
    """Raised when the LLM cannot produce a valid structured response."""


class _Transient(Exception):
    pass


class _Fatal(Exception):
    pass


@dataclass
class LLMResult:
    data: BaseModel
    provider: str
    model: str
    latency_ms: int
    attempts: int


SYSTEM_PROMPT = (
    "You are a precise, fair technical recruiting evaluator. "
    "Respond with a single JSON object that matches the requested schema exactly. "
    "Do not include markdown fences or any text outside the JSON."
)


def _json_schema_for(schema: type[BaseModel]) -> dict:
    """Strict-mode friendly JSON schema: no numeric bounds (Pydantic enforces those)."""
    raw = schema.model_json_schema()
    props = {}
    for name, spec in raw["properties"].items():
        spec = {k: v for k, v in spec.items() if k in ("type", "items", "description")}
        if "items" in spec:
            spec["items"] = {k: v for k, v in spec["items"].items() if k == "type"}
        props[name] = spec
    return {
        "type": "object",
        "properties": props,
        "required": list(props.keys()),
        "additionalProperties": False,
    }


def extract_json(text: str) -> str:
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    if fence:
        return fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return text


# --------------------------------------------------------------------------- providers

def _anthropic_complete(prompt: str, schema: type[BaseModel], model: str, timeout: float) -> str:
    import anthropic

    s = get_settings()
    client = anthropic.Anthropic(api_key=s.llm_api_key, timeout=timeout, max_retries=0)
    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": 4000,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt}],
    }
    output_config: dict[str, Any] = {"format": {"type": "json_schema", "schema": _json_schema_for(schema)}}
    if not model.startswith("claude-haiku"):
        output_config["effort"] = os.getenv("LLM_EFFORT", "low")  # scoring should return in seconds
    kwargs["output_config"] = output_config
    try:
        resp = client.messages.create(**kwargs)
    except anthropic.APITimeoutError as e:
        raise _Transient(f"timeout: {e}") from e
    except anthropic.RateLimitError as e:
        raise _Transient("rate limited") from e
    except anthropic.APIConnectionError as e:
        raise _Transient(f"connection error: {e}") from e
    except anthropic.APIStatusError as e:
        if e.status_code >= 500:
            raise _Transient(f"provider error {e.status_code}") from e
        raise _Fatal(f"provider rejected request ({e.status_code}): {e.message}") from e
    if resp.stop_reason == "refusal":
        raise _Transient("model refused")
    return "".join(b.text for b in resp.content if b.type == "text")


def _openai_complete(prompt: str, schema: type[BaseModel], model: str, timeout: float) -> str:
    s = get_settings()
    base = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    body = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": schema.__name__, "schema": _json_schema_for(schema), "strict": True},
        },
    }
    try:
        r = httpx.post(f"{base}/chat/completions", json=body, timeout=timeout,
                       headers={"Authorization": f"Bearer {s.llm_api_key}"})
    except httpx.TimeoutException as e:
        raise _Transient("timeout") from e
    except httpx.HTTPError as e:
        raise _Transient(f"connection error: {e}") from e
    if r.status_code == 429 or r.status_code >= 500:
        raise _Transient(f"provider error {r.status_code}")
    if r.status_code >= 400:
        raise _Fatal(f"provider rejected request ({r.status_code}): {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"] or ""


def _mock_complete(prompt: str, schema: type[BaseModel], model: str, timeout: float,
                   mock: Callable[[], dict] | None) -> str:
    if mock is None:
        raise _Fatal("mock provider needs a heuristic for this call")
    return json.dumps(mock())


# --------------------------------------------------------------------------- public API

def provider_info() -> tuple[str, str]:
    s = get_settings()
    provider = s.llm_provider.lower()
    return provider, s.llm_model or DEFAULT_MODELS.get(provider, "unknown")


def call(prompt: str, schema: type[T], *, mock: Callable[[], dict] | None = None) -> LLMResult:
    """Run one structured prompt and return validated output (retry once on failure)."""
    s = get_settings()
    provider, model = provider_info()
    if provider not in ("mock", "anthropic", "openai"):
        raise LLMError(f"Unsupported LLM_PROVIDER '{provider}'")
    if provider != "mock" and not s.llm_api_key:
        raise LLMError(f"LLM_API_KEY is not set for provider '{provider}'")

    started = time.perf_counter()
    last_error = "unknown error"
    current_prompt = prompt
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            if provider == "anthropic":
                raw = _anthropic_complete(current_prompt, schema, model, s.llm_timeout_seconds)
            elif provider == "openai":
                raw = _openai_complete(current_prompt, schema, model, s.llm_timeout_seconds)
            else:
                raw = _mock_complete(current_prompt, schema, model, s.llm_timeout_seconds, mock)
        except _Fatal as e:
            log.error("LLM fatal error (%s/%s): %s", provider, model, e)
            raise LLMError(str(e)) from e
        except _Transient as e:
            last_error = str(e)
            log.warning("LLM transient error attempt %d/%d: %s", attempt, MAX_ATTEMPTS, e)
            continue
        try:
            data = schema.model_validate_json(extract_json(raw))
        except (ValidationError, ValueError) as e:
            last_error = f"invalid JSON from model: {str(e)[:300]}"
            log.warning("LLM invalid JSON attempt %d/%d: %s", attempt, MAX_ATTEMPTS, last_error)
            current_prompt = (
                prompt
                + "\n\nIMPORTANT: your previous reply was not valid JSON for the schema "
                f"({str(e)[:200]}). Reply with ONLY the JSON object."
            )
            continue
        latency = int((time.perf_counter() - started) * 1000)
        return LLMResult(data=data, provider=provider, model=model, latency_ms=latency, attempts=attempt)
    raise LLMError(f"LLM failed after {MAX_ATTEMPTS} attempts: {last_error}")
