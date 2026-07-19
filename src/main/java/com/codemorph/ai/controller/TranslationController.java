package com.codemorph.ai.controller;

import com.codemorph.ai.model.TranslationRequest;
import com.codemorph.ai.model.TranslationResponse;
import com.codemorph.ai.service.GeminiService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*") // Allow frontend to call the API during local development
public class TranslationController {

    private static final Logger log = LoggerFactory.getLogger(TranslationController.class);
    private final GeminiService geminiService;

    public TranslationController(GeminiService geminiService) {
        this.geminiService = geminiService;
    }

    @PostMapping("/translate")
    public ResponseEntity<TranslationResponse> translateCode(@Valid @RequestBody TranslationRequest request) {
        log.info("Received translation request: {} -> {}", request.sourceLanguage(), request.targetLanguage());
        
        TranslationResponse response = geminiService.translateCode(request);
        
        if (response.error() != null) {
            log.warn("Translation request failed: {}", response.error());
            return ResponseEntity.badRequest().body(response);
        }
        
        log.info("Translation completed successfully.");
        return ResponseEntity.ok(response);
    }
}
