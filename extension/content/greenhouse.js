// Greenhouse content script

(async () => {
  const log = (...args) => console.log("[AutoApply Greenhouse]", ...args);

  function isApplicationPage() {
    return (
      window.location.pathname.includes("/jobs/") ||
      document.querySelector("#application_form, form#application") !== null
    );
  }

  function injectButton() {
    if (document.getElementById("autoapply-btn")) return;
    const form = document.querySelector("#application_form, form#application");
    if (!form) return;

    const btn = document.createElement("button");
    btn.id = "autoapply-btn";
    btn.type = "button";
    btn.textContent = "⚡ Auto-Apply";
    btn.style.cssText =
      "margin:12px 0;background:#24a148;color:#fff;border:none;border-radius:6px;" +
      "padding:8px 18px;font-size:14px;cursor:pointer;font-weight:600;";
    btn.addEventListener("click", () => runAutoFill(form, btn));

    const firstSection = form.querySelector("fieldset, .field, .form-field") || form.firstElementChild;
    form.insertBefore(btn, firstSection);
    log("Button injected");
  }

  async function runAutoFill(form, btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Filling…";
    try {
      const jobDescription = scrapeJobDescription();
      const fields = AutoApply.scrapeFormFields();
      log("Fields scraped:", fields);

      const answers = await AutoApply.askBackend(fields, jobDescription, "greenhouse");
      log("Answers:", answers);
      await applyAnswers(form, answers);
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

  async function applyAnswers(form, answers) {
    const inputs = form.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select"
    );
    for (const el of inputs) {
      const label = AutoApply.extractLabel(el);
      const key = findMatchingKey(answers, el, label);
      if (!key) continue;
      const value = answers[key];
      await AutoApply.sleep(100);

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
    const el =
      document.querySelector(".job-post-description, #content .job-description, [class*='description']");
    return el ? el.innerText.slice(0, 3000) : "";
  }

  // Wait for form to appear then inject
  const observer = new MutationObserver(() => {
    if (isApplicationPage()) injectButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (isApplicationPage()) injectButton();
})();
