// Indeed content script

(async () => {
  const log = (...args) => console.log("[AutoApply Indeed]", ...args);

  let modalObserved = false;

  const MODAL_SELECTORS = [
    "[data-testid='ia-container']",
    ".ia-BasePage",
    "#indeedApplyButton",
    ".jobsearch-IndeedApplyButton-contentWrapper",
  ];

  const findModal = () => {
    for (const sel of MODAL_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const observer = new MutationObserver(() => {
    const modal = findModal();
    if (modal && !modalObserved) {
      modalObserved = true;
      log("Modal detected");
      injectButton(modal);
    }
    if (!modal) modalObserved = false;
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function injectButton(container) {
    if (document.getElementById("autoapply-btn")) return;
    const btn = document.createElement("button");
    btn.id = "autoapply-btn";
    btn.type = "button";
    btn.textContent = "⚡ Auto-Apply";
    btn.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:99999;background:#2164f3;color:#fff;" +
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
      const fields = AutoApply.scrapeFormFields();
      log("Fields scraped:", fields);

      const answers = await AutoApply.askBackend(fields, jobDescription, "indeed");
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

  async function applyAnswers(answers) {
    const inputs = document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select"
    );
    for (const el of inputs) {
      if (el.offsetParent === null) continue;
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
    const el = document.querySelector(
      "#jobDescriptionText, .jobsearch-jobDescriptionText, [class*='description']"
    );
    return el ? el.innerText.slice(0, 3000) : "";
  }
})();
