# CodeMorph AI

CodeMorph AI is a Python full-stack internship project that translates code between programming languages with Gemini AI. The Flask backend serves the responsive HTML, CSS, and JavaScript frontend and exposes a JSON REST API.

## Features

- Translate code across Java, Python, JavaScript, TypeScript, C, C++, C#, Go, Rust, PHP, Ruby, Kotlin, and Swift.
- Gemini-powered backend using the Google Generative Language API.
- AI explanation, migration warnings, and confidence score.
- Input validation, JSON response parsing, health checks, and Render deployment configuration.

## Tech stack

- Python 3.11+
- Flask
- HTML, CSS, JavaScript
- Gemini API
- Render

## Run locally

Install dependencies and set your Gemini API key in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:GEMINI_API_KEY = "your_api_key_here"
python app.py
```

Open <http://127.0.0.1:8081> (the included launcher uses port 8081) or <http://127.0.0.1:8080> when starting `app.py` directly.

Alternatively, use `.\run-local.ps1` and paste your API key when prompted. Set `GEMINI_API_KEY` in your environment for deployments; do not put API keys in source files.

## API

`POST /api/translate`

```json
{
  "sourceLanguage": "Java",
  "targetLanguage": "Python",
  "sourceCode": "public class Main { public static void main(String[] args) { System.out.println(\"Hi\"); } }",
  "includeExplanation": true
}
```

Other endpoints: `GET /api/languages`, `GET /health`, and `GET /actuator/health`.

## Deploy on Render

1. Push this repository to GitHub.
2. Create a Render Web Service from the repository; `render.yaml` supplies the Python build and start commands.
3. Set `GEMINI_API_KEY` in the service environment. `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash`.

## Internship viva points

- Flask routes implement a layered REST API and serve the frontend.
- Request validation rejects missing fields and code over 12,000 characters.
- The Gemini client reads secrets from environment variables and handles network errors.
- AI output is parsed into structured JSON with a plain-text fallback.
- The browser calls the backend asynchronously with the Fetch API.
