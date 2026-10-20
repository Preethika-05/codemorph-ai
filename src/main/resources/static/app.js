const $ = (selector) => document.querySelector(selector);
const sourceSelect = $("#sourceLanguage"), targetSelect = $("#targetLanguage"), sourceCode = $("#sourceCode");
const translatedCode = $("#translatedCode"), explanation = $("#explanation"), warnings = $("#warnings");
const confidence = $("#confidence"), translateButton = $("#translateButton"), includeExplanation = $("#includeExplanation");
const overlay = $("#authOverlay"), authForm = $("#authForm");
let authMode = "login", activeUser = null;
let translationInFlight = false;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details?.join(" ") || data.error || "Something went wrong.");
  return data;
}

async function loadLanguages() {
  const { languages } = await api("/api/languages");
  for (const language of languages) {
    sourceSelect.append(new Option(language, language));
    targetSelect.append(new Option(language, language));
  }
  sourceSelect.value = "Java"; targetSelect.value = "Python";
}

function showAuth(show = true) { overlay.classList.toggle("visible", show); if (show) $("#emailInput").focus(); }
function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  $("#nameField").hidden = !registering;
  $("#nameInput").required = registering;
  $("#loginTab").classList.toggle("active", !registering);
  $("#registerTab").classList.toggle("active", registering);
  $("#authTitle").textContent = registering ? "Make yourself at home." : "Your code, your space.";
  $("#authDescription").textContent = registering ? "Create an account to save every translation." : "Sign in to translate code and keep your history in one place.";
  $("#authSubmitText").textContent = registering ? "Create my account" : "Sign in to continue";
  $("#passwordInput").autocomplete = registering ? "new-password" : "current-password";
  $("#authError").textContent = "";
}

function showUser(user) {
  activeUser = user;
  $("#userBar").hidden = !user;
  $("#signInButton").hidden = Boolean(user);
  if (user) {
    $("#userName").textContent = user.name;
    $("#userAvatar").textContent = user.name.trim().charAt(0).toUpperCase();
    showAuth(false); loadHistory();
  } else {
    $("#historyCount").textContent = "0";
    $("#historyList").innerHTML = `<div class="history-empty"><span>↗</span><p>Your translations will live here.</p><small>Sign in and translate code to build your personal history.</small></div>`;
    showAuth(false);
  }
}

async function loadHistory() {
  if (!activeUser) return;
  try {
    const { history } = await api("/api/history");
    $("#historyCount").textContent = history.length;
    if (!history.length) {
      $("#historyList").innerHTML = `<div class="history-empty"><span>↗</span><p>No translations yet.</p><small>Your next translation will show up here.</small></div>`;
      return;
    }
    $("#historyList").innerHTML = history.map((item) => `<button class="history-item" data-id="${item.id}"><span class="history-langs"><i>${escapeHtml(item.sourceLanguage)}</i><b>→</b><i>${escapeHtml(item.targetLanguage)}</i></span><span class="history-preview">${escapeHtml(item.sourceCode.split("\n")[0].slice(0, 80))}</span><span class="history-date">${new Date(item.timestamp).toLocaleDateString()}</span><span class="history-arrow">↗</span></button>`).join("");
    document.querySelectorAll(".history-item").forEach((button, index) => button.addEventListener("click", () => restoreHistory(history[index])));
  } catch (error) { console.error("Unable to load history", error); }
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
function restoreHistory(item) {
  sourceSelect.value = item.sourceLanguage; targetSelect.value = item.targetLanguage;
  sourceCode.value = item.sourceCode; translatedCode.textContent = item.translatedCode;
  explanation.textContent = item.explanation || "Explanation was not included.";
  setWarnings(item.warnings); confidence.textContent = `${Math.round(item.confidence * 100)}%`;
  updateCounts(); window.scrollTo({ top: 320, behavior: "smooth" });
}
function setWarnings(items) {
  warnings.innerHTML = "";
  for (const item of (items?.length ? items : ["No major warnings."])) {
    const li = document.createElement("li"); li.textContent = item; warnings.append(li);
  }
}
function updateCounts() {
  $("#sourceCount").textContent = `${sourceCode.value.length.toLocaleString()} chars`;
  const output = translatedCode.textContent;
  $("#outputCount").textContent = output.startsWith("// Your translated") ? "—" : `${output.length.toLocaleString()} chars`;
}

async function translateCode() {
  if (translationInFlight) return;
  if (!activeUser) { showAuth(true); return; }
  translationInFlight = true;
  translateButton.disabled = true; translateButton.querySelector("span:first-child").textContent = "Morphing code…";
  translatedCode.textContent = "// Gemini is translating your code…"; explanation.classList.remove("error-text");
  try {
    const data = await api("/api/translate", { method: "POST", body: JSON.stringify({
      sourceLanguage: sourceSelect.value, targetLanguage: targetSelect.value,
      sourceCode: sourceCode.value, includeExplanation: includeExplanation.checked
    }) });
    translatedCode.textContent = data.translatedCode;
    explanation.textContent = data.explanation || "Explanation disabled for this translation.";
    setWarnings(data.warnings); confidence.textContent = `${Math.round(data.confidence * 100)}%`;
    loadHistory();
  } catch (error) {
    translatedCode.textContent = "// Translation failed."; explanation.textContent = error.message;
    explanation.classList.add("error-text"); confidence.textContent = "—";
    setWarnings([error.message.includes("GEMINI_API_KEY") ? "Add GEMINI_API_KEY to your server environment to enable translation." : "Check your connection and try again."]);
  } finally {
    translationInFlight = false;
    translateButton.disabled = false; translateButton.querySelector("span:first-child").textContent = "Translate code"; updateCounts();
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = authForm.querySelector("button[type=submit]"); submit.disabled = true; $("#authError").textContent = "";
  try {
    const payload = { email: $("#emailInput").value, password: $("#passwordInput").value };
    if (authMode === "register") payload.name = $("#nameInput").value;
    const { user } = await api(`/api/auth/${authMode}`, { method: "POST", body: JSON.stringify(payload) });
    authForm.reset(); showUser(user);
  } catch (error) { $("#authError").textContent = error.message; }
  finally { submit.disabled = false; }
});

$("#loginTab").addEventListener("click", () => setAuthMode("login"));
$("#registerTab").addEventListener("click", () => setAuthMode("register"));
$("#signInButton").addEventListener("click", () => showAuth(true));
$("#authClose").addEventListener("click", () => showAuth(false));
$("#logoutButton").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); showUser(null); });
$("#refreshHistory").addEventListener("click", loadHistory);
$("#translateButton").addEventListener("click", translateCode);
$("#swapButton").addEventListener("click", () => {
  const current = sourceSelect.value; sourceSelect.value = targetSelect.value; targetSelect.value = current;
  const output = translatedCode.textContent;
  if (!output.startsWith("// Your translated") && !output.startsWith("// No translation")) { sourceCode.value = output; translatedCode.textContent = "// Ready for reverse translation."; updateCounts(); }
});
sourceCode.addEventListener("input", updateCounts);

(async () => {
  updateCounts();
  try { await loadLanguages(); const { user } = await api("/api/auth/me"); showUser(user); }
  catch (error) { console.error(error); showAuth(true); }
})();
