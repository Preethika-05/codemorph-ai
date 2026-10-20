package com.codemorph.ai.service;

import com.codemorph.ai.model.TranslationRequest;
import com.codemorph.ai.model.TranslationResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

@Service
public class GeminiService {

    private static final Logger log = LoggerFactory.getLogger(GeminiService.class);
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    @Value("${gemini.api.url}")
    private String apiUrl;

    @Value("${gemini.model}")
    private String model;

    @Value("${ai.api.key}")
    private String apiKey;

    @Value("${ai.provider:gemini}")
    private String provider;

    @Value("${ai.api.url:}")
    private String alternateApiUrl;

    public GeminiService(ObjectMapper objectMapper) {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
        this.objectMapper = objectMapper;
    }

    GeminiService(ObjectMapper objectMapper, HttpClient httpClient, String provider,
                  String apiUrl, String model, String apiKey, String alternateApiUrl) {
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
        this.provider = provider;
        this.apiUrl = apiUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.alternateApiUrl = alternateApiUrl;
    }

    public TranslationResponse translateCode(TranslationRequest request) {
        try {
            if (apiKey == null || apiKey.trim().isEmpty()) {
                return TranslationResponse.withError("Gemini API key is not configured. Please check application.properties or set the GEMINI_API_KEY environment variable.");
            }

            String prompt = buildPrompt(request);
            String requestBodyJson = isGemini() ? buildRequestBodyJson(prompt) : buildOpenAiRequestBody(prompt);

            String requestUrl = isGemini() ? String.format("%s/%s:generateContent", apiUrl, model) : alternateApiUrl;

            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(requestUrl))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(30))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBodyJson));
            requestBuilder.header(isGemini() ? "x-goog-api-key" : "Authorization",
                    isGemini() ? apiKey : "Bearer " + apiKey);

            log.info("Sending translation request to configured AI provider (provider: {}, model: {})", provider, model);
            HttpResponse<String> httpResponse = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());

            if (httpResponse.statusCode() < 200 || httpResponse.statusCode() >= 300) {
                int code = httpResponse.statusCode();
                String message = friendlyProviderError(code, httpResponse);
                log.warn("AI provider request failed with HTTP {} (provider: {})", code, provider);
                return TranslationResponse.withError(message);
            }

            return isGemini() ? parseGeminiResponse(httpResponse.body()) : parseOpenAiResponse(httpResponse.body());
        } catch (Exception e) {
            log.error("Translation failed due to {} (provider: {})", e.getClass().getSimpleName(), provider);
            return TranslationResponse.withError("The AI service could not complete this translation. Please try again later.");
        }
    }

    private boolean isGemini() {
        return provider == null || provider.isBlank() || provider.equalsIgnoreCase("gemini");
    }

    private String buildOpenAiRequestBody(String prompt) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "model", model,
                "temperature", 0.2,
                "response_format", Map.of("type", "json_object"),
                "messages", List.of(Map.of("role", "user", "content", prompt))));
    }

    private TranslationResponse parseOpenAiResponse(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        String content = root.path("choices").path(0).path("message").path("content").asText();
        if (content.isBlank()) return TranslationResponse.withError("The AI returned an empty translation. Please try again.");
        return objectMapper.readValue(content, TranslationResponse.class);
    }

    private String friendlyProviderError(int code, HttpResponse<String> response) {
        String retryAt = retryAt(response);
        if (code == 429) {
            return providerName() + " quota is temporarily exhausted. No automatic retry was made." +
                    (retryAt == null ? " Please try again later." : " Try again after " + retryAt + ".");
        }
        if (code == 503) {
            return providerName() + " is temporarily unavailable or overloaded." +
                    (retryAt == null ? " Wait a little, then try again." : " Try again after " + retryAt + ".");
        }
        return "The configured AI provider rejected the request (HTTP " + code + "). Check its model and API settings.";
    }

    private String providerName() {
        return isGemini() ? "Gemini" : "The AI provider";
    }

    private String retryAt(HttpResponse<String> response) {
        String value = response.headers().firstValue("Retry-After").orElse(null);
        if (value != null) {
            try { return Instant.now().plusSeconds(Long.parseLong(value.trim())).toString(); }
            catch (NumberFormatException ignored) {
                try { return ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toString(); }
                catch (DateTimeParseException ignoredDate) { /* check Gemini retry metadata */ }
            }
        }
        try {
            JsonNode body = objectMapper.readTree(response.body());
            for (JsonNode detail : body.path("error").path("details")) {
                String delay = detail.path("retryDelay").asText("");
                if (delay.matches("\\d+(\\.\\d+)?s")) {
                    double seconds = Double.parseDouble(delay.substring(0, delay.length() - 1));
                    return Instant.now().plusMillis((long) (seconds * 1000)).toString();
                }
            }
        } catch (Exception ignored) { /* do not expose provider error details */ }
        return null;
    }

    private String buildPrompt(TranslationRequest request) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are an expert multi-language code translator, compiler design expert, and code optimization assistant.\n");
        sb.append("Translate the following code from ").append(request.sourceLanguage()).append(" to ").append(request.targetLanguage()).append(".\n\n");
        
        sb.append("### Source Code:\n");
        sb.append("```").append(request.sourceLanguage().toLowerCase()).append("\n");
        sb.append(request.sourceCode()).append("\n");
        sb.append("```\n\n");

        sb.append("### Translation Requirements:\n");
        sb.append("1. Translate the code accurately preserving the original logic, semantics, and edge cases.\n");
        sb.append("2. Adapt the code to use the target language's idiomatic features, standard libraries, and best practices (e.g. use list comprehensions in Python, Streams in Java, etc.).\n");
        
        if (request.optimize()) {
            sb.append("3. OPTIMIZE the code: Improve runtime and memory usage efficiency. If possible, reduce time or space complexity and explain the optimization in your response.\n");
        } else {
            sb.append("3. Keep the translation structure as close to the source as reasonable.\n");
        }

        if (request.cleanCode()) {
            sb.append("4. Apply CLEAN CODE standards: Add meaningful variable names, structure the code modularly, follow standard naming conventions of the target language, and include standard documentation comments.\n");
        }

        if (request.explain()) {
            sb.append("5. Provide a detailed, step-by-step EXPLANATION of the translation, highlighting important language differences, syntax changes, and library mappings.\n");
        } else {
            sb.append("5. Keep the explanation brief, focusing only on crucial details.\n");
        }

        return sb.toString();
    }

    private String buildRequestBodyJson(String prompt) throws Exception {
        Map<String, Object> textPart = Map.of("text", prompt);
        Map<String, Object> partContainer = Map.of("parts", List.of(textPart));
        
        // Define JSON schema for structured output matching TranslationResponse
        Map<String, Object> schema = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                "translatedCode", Map.of("type", "STRING", "description", "The complete translated code in the target language"),
                "explanation", Map.of("type", "STRING", "description", "Detailed explanation of the code, how the translation works, and any logic details"),
                "timeComplexity", Map.of("type", "STRING", "description", "Estimated time complexity (e.g., O(N), O(log N))"),
                "spaceComplexity", Map.of("type", "STRING", "description", "Estimated space complexity (e.g., O(1), O(N))"),
                "keyChanges", Map.of(
                    "type", "ARRAY",
                    "items", Map.of("type", "STRING"),
                    "description", "List of key adaptations or changes made (e.g., library mapped, performance tuning, data structure changes)"
                )
            ),
            "required", List.of("translatedCode", "explanation", "timeComplexity", "spaceComplexity", "keyChanges")
        );

        Map<String, Object> generationConfig = Map.of(
            "responseMimeType", "application/json",
            "responseSchema", schema
        );

        Map<String, Object> requestBody = Map.of(
            "contents", List.of(partContainer),
            "generationConfig", generationConfig
        );

        return objectMapper.writeValueAsString(requestBody);
    }

    private TranslationResponse parseGeminiResponse(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        
        JsonNode candidates = root.get("candidates");
        if (candidates == null || !candidates.isArray() || candidates.isEmpty()) {
            return TranslationResponse.withError("Invalid response from Gemini API: No translation candidates returned.");
        }

        JsonNode parts = candidates.get(0).path("content").path("parts");
        if (parts.isEmpty()) {
            return TranslationResponse.withError("Invalid response from Gemini API: Empty response content parts.");
        }

        String jsonText = parts.get(0).get("text").asText();
        return objectMapper.readValue(jsonText, TranslationResponse.class);
    }
}
