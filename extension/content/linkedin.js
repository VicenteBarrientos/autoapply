// LinkedIn Easy Apply content script

(async () => {
  const log = (...args) => console.log("[AutoApply LinkedIn]", ...args);

  let modalObserved = false;
  let allAnswers = {}; // accumulate answers across all steps

  const MODAL_SELECTORS = [
    ".jobs-easy-apply-modal",
    "[data-test-modal-id='easy-apply-modal']",
    ".artdeco-modal[role='dialog']",
    ".jobs-apply-modal",
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
      allAnswers = {}; // reset for new application
      log("Modal detected:", modal.className);
      injectButton(modal);
    }
    if (!modal) {
      modalObserved = false;
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function injectButton(modal) {
    if (modal.querySelector("#autoapply-btn")) return;
    const btn = document.createElement("button");
    btn.id = "autoapply-btn";
    btn.textContent = "⚡ Auto-Apply";
    btn.style.cssText =
      "position:absolute;top:12px;right:60px;z-index:9999;background:#0a66c2;color:#fff;" +
      "border:none;border-radius:16px;padding:6px 14px;font-size:13px;cursor:pointer;font-weight:600;";
    btn.addEventListener("click", () => runAutoFill(modal));
    modal.style.position = "relative";
    modal.appendChild(btn);
    log("Button injected");
  }

  async function runAutoFill(modal) {
    const btn = modal.querySelector("#autoapply-btn");
    btn.disabled = true;

    try {
      await fillAndAdvance(modal, btn);
    } catch (err) {
      log("Error:", err);
      btn.textContent = "❌ Error";
      btn.title = err.message;
      setTimeout(() => {
        if (modal.contains(btn)) {
          btn.textContent = "⚡ Auto-Apply";
          btn.disabled = false;
        }
      }, 3000);
    }
  }

  async function fillAndAdvance(modal, btn) {
    let step = 1;

    while (true) {
      btn.textContent = `⏳ Step ${step}…`;

      const jobDescription = scrapeJobDescription();
      const fields = AutoApply.scrapeFormFields();
      log(`Step ${step} — fields scraped:`, fields);

      if (fields.length > 0) {
        const answers = await AutoApply.askBackend(fields, jobDescription, "linkedin");
        log(`Step ${step} — answers:`, answers);
        Object.assign(allAnswers, answers); // accumulate
        await applyAnswers(answers);
        await AutoApply.sleep(400);
      }

      const submitBtn = findButton(modal, ["submit application", "enviar solicitud"]);
      const reviewBtn = findButton(modal, ["review your application", "review", "revisar"]);
      const nextBtn = findButton(modal, ["next", "siguiente", "continue"]);

      if (submitBtn) {
        btn.textContent = "📨 Submitting…";
        log("Clicking Submit");
        submitBtn.click();
        await AutoApply.sleep(2000);
        btn.textContent = "✅ Applied!";
        await logApplication(jobDescription);
        break;
      } else if (reviewBtn) {
        log("Clicking Review");
        btn.textContent = "🔍 Reviewing…";
        reviewBtn.click();
        await AutoApply.sleep(1500);
        step++;
      } else if (nextBtn) {
        log("Clicking Next");
        nextBtn.click();
        await AutoApply.sleep(1500);
        step++;
      } else {
        log("No navigation button found — stopping");
        btn.textContent = "✅ Filled!";
        break;
      }

      if (step > 15) {
        log("Too many steps — stopping to be safe");
        btn.textContent = "⚠️ Check form";
        break;
      }
    }
  }

  async function logApplication(jobDescription) {
    const company = scrapeCompanyName();
    const role = scrapeJobTitle();

    const application = {
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      platform: "linkedin",
      company,
      role,
      jobUrl: window.location.href,
      jobDescription: jobDescription.slice(0, 2000),
      appliedAt: new Date().toISOString(),
      status: "applied",
      answers: allAnswers,
    };

    log("Logging application:", application);

    chrome.runtime.sendMessage({ type: "LOG_APPLICATION", payload: application }, (res) => {
      if (res?.ok) log("Application logged to ResumeX ✅");
      else log("Log failed:", res?.error);
    });
  }

  function scrapeCompanyName() {
    return (
      document.querySelector(".job-details-jobs-unified-top-card__company-name")?.textContent?.trim() ||
      document.querySelector(".jobs-unified-top-card__company-name")?.textContent?.trim() ||
      document.querySelector("[class*='company-name']")?.textContent?.trim() ||
      "Unknown Company"
    );
  }

  function scrapeJobTitle() {
    return (
      document.querySelector(".job-details-jobs-unified-top-card__job-title")?.textContent?.trim() ||
      document.querySelector(".jobs-unified-top-card__job-title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "Unknown Role"
    );
  }

  function findButton(modal, labels) {
    const buttons = modal.querySelectorAll("button:not([disabled])");
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if (labels.some((l) => text.includes(l))) return btn;
    }
    return null;
  }

  function scrapeJobDescription() {
    const descEl =
      document.querySelector(".job-view-layout .jobs-description") ||
      document.querySelector(".jobs-description-content__text") ||
      document.querySelector("[class*='description']");
    return descEl ? descEl.innerText.slice(0, 3000) : "";
  }

  async function applyAnswers(answers) {
    const inputs = document.querySelectorAll(
      ".jobs-easy-apply-modal input:not([type=hidden]):not([type=submit]):not([type=button]), " +
      ".jobs-easy-apply-modal textarea, " +
      ".jobs-easy-apply-modal select"
    );

    for (const el of inputs) {
      const label = AutoApply.extractLabel(el);
      const key = findMatchingKey(answers, el, label);
      if (!key) continue;

      const value = answers[key];
      await AutoApply.sleep(120);

      if (el.tagName === "SELECT") {
        AutoApply.selectOption(el, value);
      } else if (el.tagName === "TEXTAREA") {
        AutoApply.fillTextarea(el, value);
      } else if (el.type === "radio" || el.type === "checkbox") {
        handleCheckableInput(el, value, label);
      } else {
        AutoApply.fillInput(el, value);
      }
    }

    await handleLinkedInCustomSelects(answers);
  }

  function findMatchingKey(answers, el, label) {
    for (const key of Object.keys(answers)) {
      if (el.id && el.id.includes(key)) return key;
      if (el.name && el.name.includes(key)) return key;
      if (label && label.toLowerCase().includes(key.toLowerCase())) return key;
      if (key.toLowerCase().includes(label.toLowerCase()) && label.length > 3) return key;
    }
    return null;
  }

  function handleCheckableInput(el, value, label) {
    const wantChecked =
      value === true ||
      value === "yes" ||
      value === "true" ||
      (typeof value === "string" && label.toLowerCase().includes(value.toLowerCase()));
    if (wantChecked !== el.checked) el.click();
  }

  async function handleLinkedInCustomSelects(answers) {
    const dropdowns = document.querySelectorAll(
      ".jobs-easy-apply-modal [data-test-text-selectable-option], " +
      ".jobs-easy-apply-modal .fb-dropdown"
    );
    for (const dd of dropdowns) {
      const label = AutoApply.extractLabel(dd) || dd.textContent.trim();
      for (const [key, value] of Object.entries(answers)) {
        if (label.toLowerCase().includes(key.toLowerCase())) {
          dd.click();
          await AutoApply.sleep(200);
          const option = [...document.querySelectorAll("li.fb-dropdown__option, li[role=option]")]
            .find((li) => li.textContent.toLowerCase().includes(value.toString().toLowerCase()));
          if (option) option.click();
          await AutoApply.sleep(100);
        }
      }
    }
  }
})();
