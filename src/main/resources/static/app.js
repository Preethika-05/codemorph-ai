const sourceSelect = document.querySelector("#sourceLanguage");
const targetSelect = document.querySelector("#targetLanguage");
const sourceCode = document.querySelector("#sourceCode");
const translatedCode = document.querySelector("#translatedCode");
const explanation = document.querySelector("#explanation");
const warnings = document.querySelector("#warnings");
const confidence = document.querySelector("#confidence");
const translateButton = document.querySelector("#translateButton");
const swapButton = document.querySelector("#swapButton");
const includeExplanation = document.querySelector("#includeExplanation");

const fallbackLanguages = [
    "Java",
    "Python",
    "JavaScript",
    "TypeScript",
    "C",
    "C++",
    "C#",
    "Go",
    "Rust",
    "PHP",
    "Ruby",
    "Kotlin",
    "Swift"
];

async function loadLanguages() {
    try {
        const response = await fetch("/api/languages");
        const data = await response.json();
        fillLanguageSelects(data.languages || fallbackLanguages);
    } catch {
        fillLanguageSelects(fallbackLanguages);
    }
}

function fillLanguageSelects(languages) {
    for (const language of languages) {
        sourceSelect.append(new Option(language, language));
        targetSelect.append(new Option(language, language));
    }
    sourceSelect.value = "Java";
    targetSelect.value = "Python";
}

function setWarnings(items) {
    warnings.innerHTML = "";
    const values = items.length ? items : ["No major warnings."];
    for (const item of values) {
        const li = document.createElement("li");
        li.textContent = item;
        warnings.append(li);
    }
}

async function translateCode() {
    const payload = {
        sourceLanguage: sourceSelect.value,
        targetLanguage: targetSelect.value,
        sourceCode: sourceCode.value,
        includeExplanation: includeExplanation.checked
    };

    translateButton.disabled = true;
    translateButton.textContent = "Translating...";
    translatedCode.textContent = "Working with Gemini...";
    explanation.classList.remove("error-text");

    try {
        const response = await fetch("/api/translate", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error((data.details || [data.error || "Translation failed"]).join(" "));
        }

        translatedCode.textContent = data.translatedCode;
        explanation.textContent = data.explanation || "Explanation disabled for this translation.";
        setWarnings(data.warnings || []);
        confidence.textContent = `${Math.round((data.confidence || 0) * 100)}%`;
    } catch (error) {
        translatedCode.textContent = "No translation generated.";
        explanation.textContent = error.message;
        explanation.classList.add("error-text");
        const missingKey = error.message.includes("GEMINI_API_KEY");
        setWarnings([
            missingKey
                ? "Add your Gemini API key as GEMINI_API_KEY, restart the server, then translate again."
                : "Check the backend logs and try again."
        ]);
        confidence.textContent = "--";
    } finally {
        translateButton.disabled = false;
        translateButton.textContent = "Translate Code";
    }
}

function swapLanguages() {
    const currentSource = sourceSelect.value;
    sourceSelect.value = targetSelect.value;
    targetSelect.value = currentSource;
    const output = translatedCode.textContent.trim();
    if (output && output !== "Your translated code will appear here." && output !== "No translation generated.") {
        sourceCode.value = output;
        translatedCode.textContent = "Ready for reverse translation.";
    }
}

translateButton.addEventListener("click", translateCode);
swapButton.addEventListener("click", swapLanguages);
loadLanguages();
