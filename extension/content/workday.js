// Workday content script

(async () => {
  const log = (...args) => console.log("[AutoApply Workday]", ...args);

  let currentStep = 0;

  function isApplicationPage() {
    return (
      window.location.hostname.includes("myworkdayjobs.com") &&
      (window.location.pathname.includes("/job/") || window.location.pathname.includes("/apply"))
    );
  }

  function findForm() {
    return document.querySelector(
      "[data-automation-id='applicationForm'], form[aria-label], main form"
    );
  }

  function injectButton() {
    if (document.getElementById("autoapply-btn")) return;
    const form = findForm();
    if (!form) return;

    const btn = document.createElement("button");
    btn.id = "autoapply-btn";
    btn.type = "button";
    btn.textContent = "⚡ Auto-Apply";
    btn.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:99999;background:#e2401c;color:#fff;" +
      "border:none;border-radius:6px;padding:8px 18px;font-size:14px;cursor:pointer;font-weight:600;";
    btn.addEventListener("click", () => runAutoFill(btn));
    document.body.appendChild(btn);
    log("Button injected");
  }

  async function runAutoFill(btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Filling…";
    try {
      const jobDescription = scrapeJobDescription();
      const fields = scrapeWorkdayFields();
      log("Fields scraped:", fields);

      const answers = await AutoApply.askBackend(fields, jobDescription, "workday");
      log("Answers:", answers);
      await applyAnswers(answers);
      btn.textContent = "✅ Filled!";
    } catch (err) {
      log("Error:", err);
      btn.textContent = "❌ Error";
      btn.title = err.message;
      setTimeout(() => {
        btn.textContent = "⚡ Auto-Apply";
        btn.disabled = false;
      }, 3000);
    }
  }

  function scrapeWorkdayFields() {
    const fields = [];
    // Workday uses data-automation-id attributes extensively
    const inputs = document.querySelectorAll(
      "[data-automation-id] input:not([type=hidden]), " +
      "[data-automation-id] textarea, " +
      "[data-automation-id] select, " +
      "input:not([type=hidden]):not([type=submit]), textarea, select"
    );

    inputs.forEach((el) => {
      if (el.offsetParent === null) return;
      const label = AutoApply.extractLabel(el) || el.closest("[data-automation-id]")?.getAttribute("data-automation-id") || "";
      fields.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        label,
        required: el.required,
        options: el.tagName === "SELECT"
          ? Array.from(el.options).map((o) => o.text.trim())
          : undefined,
      });
    });
    return fields;
  }

  async function applyAnswers(answers) {
    const inputs = document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select"
    );
    for (const el of inputs) {
      if (el.offsetParent === null) continue;
      const label =
        AutoApply.extractLabel(el) ||
        el.closest("[data-automation-id]")?.getAttribute("data-automation-id") || "";
      const key = findMatchingKey(answers, el, label);
      if (!key) continue;
      const value = answers[key];
      await AutoApply.sleep(150);

      if (el.tagName === "SELECT") {
        AutoApply.selectOption(el, value);
      } else if (el.tagName === "TEXTAREA") {
        AutoApply.fillTextarea(el, value);
      } else if (el.type === "radio" || el.type === "checkbox") {
        const wantChecked = value === true || value === "yes" || value === "true";
        if (wantChecked !== el.checked) el.click();
      } else {
        AutoApply.fillInput(el, value);
      }
    }
  }

  function findMatchingKey(answers, el, label) {
    for (const key of Object.keys(answers)) {
      if (el.id && el.id.toLowerCase().includes(key.toLowerCase())) return key;
      if (el.name && el.name.toLowerCase().includes(key.toLowerCase())) return key;
      if (label && label.toLowerCase().includes(key.toLowerCase())) return key;
      if (key.toLowerCase().includes(label?.toLowerCase()) && label?.length > 3) return key;
    }
    return null;
  }

  function scrapeJobDescription() {
    const el = document.querySelector(
      "[data-automation-id='jobPostingDescription'], [class*='job-description'], [class*='description']"
    );
    return el ? el.innerText.slice(0, 3000) : "";
  }

  const observer = new MutationObserver(() => {
    if (isApplicationPage()) injectButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (isApplicationPage()) injectButton();
})();
