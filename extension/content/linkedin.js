// LinkedIn Easy Apply content script

(async () => {
  const log = (...args) => console.log("[AutoApply LinkedIn]", ...args);

  let modalObserved = false;
  let allAnswers = {};

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
      allAnswers = {};
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
    AutoApply.notifyFileUploads(modal, btn);
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
      // Scope field scraping to the modal — avoids LinkedIn nav/search inputs
      const fields = AutoApply.scrapeFormFields(modal);
      const unfilledFields = AutoApply.unfilledFields(fields);
      log(`Step ${step} — fields: ${fields.length} total, ${unfilledFields.length} unfilled`);

      if (unfilledFields.length > 0) {
        const answers = await AutoApply.askBackend(unfilledFields, jobDescription, "linkedin");
        log(`Step ${step} — answers:`, answers);
        Object.assign(allAnswers, answers);
        await AutoApply.applyAnswers(answers, modal, 120);
        await handleLinkedInCustomSelects(answers, modal);
        await AutoApply.sleep(400);
      }

      const submitBtn = AutoApply.findButton(modal, ["submit application", "enviar solicitud"]);
      const reviewBtn = AutoApply.findButton(modal, ["review your application", "review", "revisar"]);
      const nextBtn = AutoApply.findButton(modal, ["next", "siguiente", "continue"]);

      if (submitBtn) {
        const emptyRequired = AutoApply.emptyRequiredFields(modal);

        if (emptyRequired.length > 0) {
          log("Stopping: required fields empty:", emptyRequired.map((e) => AutoApply.extractLabel(e, modal)));
          btn.textContent = `⚠️ ${emptyRequired.length} required field(s) empty — review before submitting`;
          btn.disabled = false;
          break;
        }

        btn.textContent = "📨 Submitting…";
        log("Clicking Submit");
        submitBtn.click();
        await AutoApply.sleep(2000);
        btn.textContent = "✅ Applied!";
        const logResult = await AutoApply.logApplication({
          platform: "linkedin",
          company: scrapeCompanyName(),
          role: scrapeJobTitle(),
          jobDescription,
          answers: allAnswers,
        });
        if (logResult.ok) log("Application logged to ResumeX ✅");
        else log("Log failed:", logResult.error);
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

  function scrapeJobDescription() {
    const descEl =
      document.querySelector(".job-view-layout .jobs-description") ||
      document.querySelector(".jobs-description-content__text") ||
      document.querySelector("[class*='description']");
    return descEl ? descEl.innerText.slice(0, 3000) : "";
  }

  async function handleLinkedInCustomSelects(answers, modal) {
    const dropdowns = modal.querySelectorAll(
      "[data-test-text-selectable-option], .fb-dropdown"
    );
    for (const dd of dropdowns) {
      const label = AutoApply.extractLabel(dd, modal) || dd.textContent.trim();
      // Use shared matcher — stops at first matching key to avoid acting multiple times per dropdown
      const key = AutoApply.findMatchingKey(answers, dd, label);
      if (!key) continue;
      const value = answers[key];
      dd.click();
      await AutoApply.sleep(200);
      const option = [...modal.querySelectorAll("li.fb-dropdown__option, li[role=option]")]
        .find((li) => li.textContent.toLowerCase().includes(value.toString().toLowerCase()));
      if (option) option.click();
      await AutoApply.sleep(100);
    }
  }
})().catch((err) => console.error("[AutoApply LinkedIn] Fatal:", err));
