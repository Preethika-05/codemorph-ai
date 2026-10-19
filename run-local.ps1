param(
    [Parameter(Mandatory = $false)]
    [string]$GeminiApiKey,

    [Parameter(Mandatory = $false)]
    [int]$Port = 8081
)

if (-not $GeminiApiKey) {
    $GeminiApiKey = $env:GEMINI_API_KEY
}
if (-not $GeminiApiKey) {
    $GeminiApiKey = Read-Host "Paste your Gemini API key"
}
if (-not $GeminiApiKey.Trim()) {
    Write-Error "GEMINI_API_KEY is required to translate code."
    exit 1
}

$env:GEMINI_API_KEY = $GeminiApiKey.Trim()
$env:PORT = "$Port"
Write-Host "Starting CodeMorph AI on http://127.0.0.1:$Port"
python app.py
