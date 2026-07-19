package com.codemorph.ai.model;

import java.util.List;

public record TranslationResponse(
    String translatedCode,
    String explanation,
    String timeComplexity,
    String spaceComplexity,
    List<String> keyChanges,
    String error
) {
    public static TranslationResponse withError(String error) {
        return new TranslationResponse(null, null, null, null, null, error);
    }
}
