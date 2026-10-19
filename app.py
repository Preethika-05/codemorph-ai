"""CodeMorph AI: Flask app, account management, and translation history."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory, session
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "src" / "main" / "resources" / "static"
LANGUAGES = ["Java", "Python", "JavaScript", "TypeScript", "C", "C++", "C#", "Go", "Rust", "PHP", "Ruby", "Kotlin", "Swift"]
SYSTEM_INSTRUCTION = (
    "You are CodeMorph AI, a senior software engineer who translates code between "
    "programming languages. Preserve behavior, use idiomatic target-language style, "
    "and mention migration risks. Return only valid JSON with fields: translatedCode, "
    "explanation, warnings, confidence."
)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-only-change-me-" + os.urandom(16).hex())
database_url = os.getenv("DATABASE_URL", f"sqlite:///{(ROOT / 'codemorph.db').as_posix()}")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
app.config.update(SQLALCHEMY_DATABASE_URI=database_url, SQLALCHEMY_TRACK_MODIFICATIONS=False,
                  SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "false").lower() == "true")
db = SQLAlchemy(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(254), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class Translation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    source_language = db.Column(db.String(32), nullable=False)
    target_language = db.Column(db.String(32), nullable=False)
    source_code = db.Column(db.Text, nullable=False)
    translated_code = db.Column(db.Text, nullable=False)
    explanation = db.Column(db.Text, nullable=False, default="")
    warnings = db.Column(db.JSON, nullable=False, default=list)
    confidence = db.Column(db.Float, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    user = db.relationship(User, backref=db.backref("translations", lazy=True, cascade="all, delete-orphan"))


with app.app_context():
    db.create_all()


class GeminiError(Exception):
    """An expected error while calling Gemini."""


def user_payload(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email}


def current_user() -> User | None:
    user_id = session.get("user_id")
    return db.session.get(User, user_id) if user_id else None


def auth_required():
    user = current_user()
    if not user:
        return jsonify(error="Authentication required. Please log in.", code="unauthorized"), 401
    return user


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    return send_from_directory(STATIC_DIR, filename)


@app.get("/api/languages")
def languages():
    return jsonify(languages=LANGUAGES)


@app.get("/api/auth/me")
def auth_me():
    user = current_user()
    return jsonify(user=user_payload(user) if user else None)


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name, email, password = data.get("name"), data.get("email"), data.get("password")
    if not all(isinstance(v, str) for v in (name, email, password)):
        return jsonify(error="Name, email, and password are required."), 400
    name, email = name.strip(), email.strip().lower()
    if not 2 <= len(name) <= 80 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return jsonify(error="Enter a valid name and email address."), 400
    if len(password) < 8 or len(password) > 128:
        return jsonify(error="Password must be between 8 and 128 characters."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="An account with that email already exists."), 409
    user = User(name=name, email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    session.clear()
    session["user_id"] = user.id
    return jsonify(user=user_payload(user)), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email, password = data.get("email"), data.get("password")
    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify(error="Email and password are required."), 400
    user = User.query.filter_by(email=email.strip().lower()).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify(error="Email or password is incorrect."), 401
    session.clear()
    session["user_id"] = user.id
    return jsonify(user=user_payload(user))


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/history")
def history():
    user = auth_required()
    if not isinstance(user, User):
        return user
    items = Translation.query.filter_by(user_id=user.id).order_by(Translation.created_at.desc()).limit(50).all()
    return jsonify(history=[translation_payload(item) for item in items])


@app.delete("/api/history/<int:translation_id>")
def delete_history_item(translation_id: int):
    user = auth_required()
    if not isinstance(user, User):
        return user
    item = Translation.query.filter_by(id=translation_id, user_id=user.id).first()
    if not item:
        return jsonify(error="History item not found."), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify(ok=True)


def translation_payload(item: Translation) -> dict:
    created = item.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return {"id": item.id, "sourceLanguage": item.source_language, "targetLanguage": item.target_language,
            "sourceCode": item.source_code, "translatedCode": item.translated_code,
            "explanation": item.explanation, "warnings": item.warnings or [],
            "confidence": item.confidence, "timestamp": created.isoformat()}


def error_response(status: int, error: str, details: list[str]):
    return jsonify(timestamp=datetime.now(timezone.utc).isoformat(), status=status, error=error, details=details), status


@app.post("/api/translate")
def translate():
    user = auth_required()
    if not isinstance(user, User):
        return user
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response(400, "Validation failed", ["Request body must be a JSON object."])
    errors = []
    for field, label in (("sourceLanguage", "Source language"), ("targetLanguage", "Target language"), ("sourceCode", "Source code")):
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{field}: {label} is required")
    source_code = payload.get("sourceCode")
    if isinstance(source_code, str) and len(source_code) > 12000:
        errors.append("sourceCode: Code must be under 12,000 characters")
    if errors:
        return error_response(400, "Validation failed", errors)
    source_language, target_language = payload["sourceLanguage"].strip(), payload["targetLanguage"].strip()
    if source_language not in LANGUAGES or target_language not in LANGUAGES:
        return error_response(400, "Validation failed", ["Choose supported source and target languages."])
    prompt = (f"Translate this code from {source_language} to {target_language}.\n\nRequirements:\n"
              "- Preserve the original algorithm and intent.\n"
              f"- Use readable, production-quality {target_language}.\n"
              "- Do not invent external dependencies unless necessary.\n"
              "- Include short warnings for language-specific differences.\n"
              "- Return only JSON. Escape newlines inside JSON strings.\n\n"
              f"Source code:\n```{source_language.lower()}\n{source_code}\n```")
    try:
        parsed = parse_response(generate(prompt))
    except GeminiError as exc:
        return error_response(502, "Gemini request failed", [str(exc)])
    explanation = parsed["explanation"] if payload.get("includeExplanation", False) else ""
    item = Translation(user_id=user.id, source_language=source_language, target_language=target_language,
                       source_code=source_code, translated_code=parsed["translatedCode"], explanation=explanation,
                       warnings=parsed["warnings"], confidence=parsed["confidence"])
    db.session.add(item)
    db.session.commit()
    return jsonify(**translation_payload(item))


def generate(prompt: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise GeminiError("GEMINI_API_KEY is not configured.")
    model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
    body = {"model": model, "system_instruction": SYSTEM_INSTRUCTION, "input": prompt,
            "generation_config": {"thinking_level": "low"}}
    try:
        response = requests.post(f"{base_url}/interactions", json=body,
                                 headers={"x-goog-api-key": api_key}, timeout=90)
        response.raise_for_status()
        output = response.json().get("output_text", "")
        if not isinstance(output, str) or not output.strip():
            raise GeminiError("Gemini returned an empty response.")
        return output
    except GeminiError:
        raise
    except (requests.RequestException, ValueError) as exc:
        raise GeminiError("Unable to reach Gemini API. Check your key, quota, and network.") from exc


def parse_response(raw: str) -> dict:
    content = raw.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[^\n]*\n?", "", content, count=1)
        content = re.sub(r"\n?```\s*$", "", content).strip()
    try:
        data = json.loads(content)
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object")
        code, explanation = data.get("translatedCode", raw), data.get("explanation", "Translation completed.")
        warnings, confidence = data.get("warnings", []), data.get("confidence", 0.82)
        confidence = max(0.0, min(1.0, float(confidence)))
        return {"translatedCode": code if isinstance(code, str) else raw,
                "explanation": explanation if isinstance(explanation, str) else "Translation completed.",
                "warnings": [str(item) for item in warnings] if isinstance(warnings, list) else [],
                "confidence": confidence}
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"translatedCode": raw, "explanation": "Gemini returned plain text instead of structured JSON.",
                "warnings": ["Review the output before using it in production."], "confidence": 0.65}


@app.get("/health")
@app.get("/actuator/health")
def health():
    return jsonify(status="UP")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
