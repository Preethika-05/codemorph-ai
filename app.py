"""Flask application for CodeMorph AI."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "src" / "main" / "resources" / "static"
LANGUAGES = [
    "Java", "Python", "JavaScript", "TypeScript", "C", "C++", "C#",
    "Go", "Rust", "PHP", "Ruby", "Kotlin", "Swift",
]
SYSTEM_INSTRUCTION = (
    "You are CodeMorph AI, a senior software engineer who translates code between "
    "programming languages. Preserve behavior, use idiomatic target-language style, "
    "and mention migration risks. Return only valid JSON with fields: translatedCode, "
    "explanation, warnings, confidence."
)

app = Flask(__name__)


class GeminiError(Exception):
    """An expected error while calling Gemini."""


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    return send_from_directory(STATIC_DIR, filename)


@app.get("/api/languages")
def languages():
    return jsonify(languages=LANGUAGES)


@app.get("/actuator/health")
@app.get("/health")
def health():
    return jsonify(status="UP")


def error_response(status: int, error: str, details: list[str]):
    return jsonify(timestamp=datetime.now(timezone.utc).isoformat(), status=status,
                   error=error, details=details), status


@app.post("/api/translate")
def translate():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response(400, "Validation failed", ["Request body must be a JSON object."])

    errors = []
    for field, label in (("sourceLanguage", "Source language"),
                         ("targetLanguage", "Target language"),
                         ("sourceCode", "Source code")):
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{field}: {label} is required")
    source_code = payload.get("sourceCode")
    if isinstance(source_code, str) and len(source_code) > 12000:
        errors.append("sourceCode: Code must be under 12,000 characters")
    if errors:
        return error_response(400, "Validation failed", errors)

    source_language = payload["sourceLanguage"].strip()
    target_language = payload["targetLanguage"].strip()
    prompt = (
        f"Translate this code from {source_language} to {target_language}.\n\n"
        "Requirements:\n"
        "- Preserve the original algorithm and intent.\n"
        f"- Use readable, production-quality {target_language}.\n"
        "- Do not invent external dependencies unless necessary.\n"
        "- Include short warnings for language-specific differences.\n"
        "- Return only JSON. Escape newlines inside JSON strings.\n\n"
        f"Source code:\n```{source_language.lower()}\n{source_code}\n```"
    )
    try:
        raw = generate(prompt)
    except GeminiError as exc:
        return error_response(502, "Gemini request failed", [str(exc)])

    parsed = parse_response(raw)
    return jsonify(
        translatedCode=parsed["translatedCode"],
        explanation=parsed["explanation"] if payload.get("includeExplanation", False) else "",
        warnings=parsed["warnings"],
        sourceLanguage=source_language,
        targetLanguage=target_language,
        confidence=parsed["confidence"],
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def generate(prompt: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise GeminiError("GEMINI_API_KEY is not configured.")
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    base_url = os.getenv(
        "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
    ).rstrip("/")
    body = {
        "model": model,
        "system_instruction": SYSTEM_INSTRUCTION,
        "input": prompt,
        "generation_config": {"temperature": 0.2, "thinking_level": "low"},
    }
    try:
        response = requests.post(
            f"{base_url}/interactions", json=body,
            headers={"x-goog-api-key": api_key}, timeout=90,
        )
        response.raise_for_status()
        output = response.json().get("output_text", "")
        if not isinstance(output, str) or not output.strip():
            raise GeminiError("Gemini returned an empty response.")
        return output
    except GeminiError:
        raise
    except (requests.RequestException, ValueError) as exc:
        raise GeminiError(
            "Unable to reach Gemini API. Check your key, quota, and network."
        ) from exc


def parse_response(raw: str) -> dict:
    content = raw.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[^\n]*\n?", "", content, count=1)
        content = re.sub(r"\n?```\s*$", "", content).strip()
    try:
        data = json.loads(content)
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object")
        code = data.get("translatedCode", raw)
        explanation = data.get("explanation", "Translation completed.")
        warnings = data.get("warnings", [])
        confidence = data.get("confidence", 0.82)
        return {
            "translatedCode": code if isinstance(code, str) else raw,
            "explanation": explanation if isinstance(explanation, str) else "Translation completed.",
            "warnings": [str(item) for item in warnings] if isinstance(warnings, list) else [],
            "confidence": float(confidence),
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return {
            "translatedCode": raw,
            "explanation": "Gemini returned plain text instead of structured JSON.",
            "warnings": ["Review the output before using it in production."],
            "confidence": 0.65,
        }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
