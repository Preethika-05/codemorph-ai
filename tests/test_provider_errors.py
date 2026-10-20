import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app import GeminiError, app as flask_app, generate  # noqa: E402


class ProviderErrorTests(unittest.TestCase):
    @patch.dict(os.environ, {"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "test-secret", "GEMINI_MODEL": "test-model"})
    @patch("app.requests.post")
    def test_429_is_not_retried_and_retry_after_is_reported(self, post):
        response = SimpleNamespace(ok=False, status_code=429, headers={"Retry-After": "45"}, json=lambda: {})
        post.return_value = response

        with self.assertRaises(GeminiError) as raised:
            generate("translate this")

        self.assertEqual(raised.exception.status_code, 429)
        self.assertIn("No automatic retry was made", str(raised.exception))
        self.assertIn("Try again after", str(raised.exception))
        self.assertEqual(post.call_count, 1)
        url, = post.call_args.args
        self.assertNotIn("test-secret", url)
        self.assertEqual(post.call_args.kwargs["headers"]["x-goog-api-key"], "test-secret")

    @patch.dict(os.environ, {"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "test-secret", "GEMINI_MODEL": "test-model"})
    @patch("app.requests.post")
    def test_503_is_reported_as_temporary_unavailability(self, post):
        response = SimpleNamespace(
            ok=False,
            status_code=503,
            headers={},
            json=lambda: {"error": {"details": [{"retryDelay": "12s"}]}},
        )
        post.return_value = response

        with self.assertRaises(GeminiError) as raised:
            generate("translate this")

        self.assertEqual(raised.exception.status_code, 503)
        self.assertIn("temporarily unavailable or overloaded", str(raised.exception))
        self.assertIn("Try again after", str(raised.exception))
        self.assertEqual(post.call_count, 1)

    @patch.dict(os.environ, {"AI_PROVIDER": "openai-compatible", "AI_API_KEY": "alternate-secret",
                             "AI_API_URL": "https://provider.example/v1/chat/completions", "AI_MODEL": "alternate-model"})
    @patch("app.requests.post")
    def test_alternate_provider_uses_configured_server_side_settings(self, post):
        post.return_value = SimpleNamespace(
            ok=True,
            json=lambda: {"choices": [{"message": {"content": '{"translatedCode":"print(1)"}'}}]},
        )
        self.assertEqual(generate("translate this"), '{"translatedCode":"print(1)"}')
        self.assertEqual(post.call_count, 1)
        self.assertEqual(post.call_args.args[0], "https://provider.example/v1/chat/completions")
        self.assertEqual(post.call_args.kwargs["json"]["model"], "alternate-model")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer alternate-secret")

    @patch("app.generate", side_effect=GeminiError("Gemini is temporarily unavailable. Wait a little, then try again.", 503))
    def test_translate_route_keeps_upstream_503_status(self, _generate):
        client = flask_app.test_client()
        registered = client.post("/api/auth/register", json={
            "name": "Test User", "email": "quota-test@example.com", "password": "test-password-123"
        })
        self.assertEqual(registered.status_code, 201)
        response = client.post("/api/translate", json={
            "sourceLanguage": "Java", "targetLanguage": "Python", "sourceCode": "class Example {}"
        })
        self.assertEqual(response.status_code, 503)
        self.assertIn("temporarily unavailable", " ".join(response.get_json()["details"]))


if __name__ == "__main__":
    unittest.main()
