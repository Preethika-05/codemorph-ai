package com.codemorph.ai.service;

import com.codemorph.ai.model.TranslationRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class GeminiServiceTest {
    @Test
    void quotaFailureIsNotRetriedAndKeyIsOnlySentInHeader() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        AtomicInteger keyWasInHeader = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1beta/models/test-model:generateContent", exchange -> {
            calls.incrementAndGet();
            if ("test-secret".equals(exchange.getRequestHeaders().getFirst("x-goog-api-key"))) keyWasInHeader.incrementAndGet();
            assertThat(exchange.getRequestURI().toString()).doesNotContain("test-secret");
            exchange.getResponseHeaders().add("Retry-After", "30");
            byte[] body = "{\"error\":{\"code\":429}}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(429, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            GeminiService service = new GeminiService(new ObjectMapper(), HttpClient.newHttpClient(), "gemini",
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta/models", "test-model", "test-secret", "");
            var result = service.translateCode(new TranslationRequest("print(1)", "Python", "Java", false, true, false));
            assertThat(result.error()).contains("No automatic retry was made", "Try again after").doesNotContain("test-secret");
            assertThat(calls).hasValue(1);
            assertThat(keyWasInHeader).hasValue(1);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void upstream503IsReportedAsTemporaryUnavailability() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1beta/models/test-model:generateContent", exchange -> {
            byte[] body = "{\"error\":{\"code\":503}}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(503, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            GeminiService service = new GeminiService(new ObjectMapper(), HttpClient.newHttpClient(), "gemini",
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta/models", "test-model", "test-secret", "");
            var result = service.translateCode(new TranslationRequest("print(1)", "Python", "Java", false, true, false));
            assertThat(result.error()).contains("temporarily unavailable or overloaded", "Wait a little");
        } finally {
            server.stop(0);
        }
    }
}
