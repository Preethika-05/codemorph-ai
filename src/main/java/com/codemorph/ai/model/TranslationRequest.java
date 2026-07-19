package com.codemorph.ai.model;

import jakarta.validation.constraints.NotBlank;

public record TranslationRequest(
    @NotBlank(message = "Source code is required") String sourceCode,
    @NotBlank(message = "Source language is required") String sourceLanguage,
    @NotBlank(message = "Target language is required") String targetLanguage,
    boolean optimize,
    boolean explain,
    boolean cleanCode
) {}
