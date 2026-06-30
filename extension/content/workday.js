// Workday content script — multi-step with application logging

(async () => {
  const log = (...args) => console.log("[AutoApply Workday]", ...args);

  let allAnswers = {};

  const WORKDAY_FIELD_SELECTOR =
    "[data-automation-id] input:not([type=hidden]):not([type=file]), " +
    "[data-automation-id] textarea, " +
    "[data-automation-id] select, " +
    "input:not([type=hidden]):not([type=submit]):not([type=file]), textarea, select";

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
    AutoApply.notifyFileUploads(document.querySelector("main, form") || document.body, btn);
    log("Button injected");
  }

  async function runAutoFill(btn) {
    btn.disabled = true;
    allAnswers = {};
    try {
      await fillAndAdvance(btn);
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

  async function fillAndAdvance(btn) {
    let step = 1;

    while (true) {
      btn.textContent = `⏳ Step ${step}…`;

      const jobDescription = scrapeJobDescription();
      const form = findForm();
      const fields = AutoApply.scrapeFormFields(form || document, {
        selector: WORKDAY_FIELD_SELECTOR,
        dedupe: true,
      });
      const unfilledFields = AutoApply.unfilledFields(fields);
      log(`Step ${step} — fields: ${fields.length} total, ${unfilledFields.length} unfilled`);

      if (unfilledFields.length > 0) {
        const answers = await AutoApply.askBackend(unfilledFields, jobDescription, "workday");
        log(`Step ${step} — answers:`, answers);
        Object.assign(allAnswers, answers);
        await AutoApply.applyAnswers(answers, document, 150);
        await handleWorkdayCustomDropdowns(answers);
        await AutoApply.sleep(500);
      }

      // Check Workday-specific automation ID first, then fall back to text
      const submitBtn =
        document.querySelector("[data-automation-id='wd-CommandButton_uic_submitButton']:not([disabled])") ||
        AutoApply.findButton(document, ["submit application", "submit"]);
      const nextBtn =
        document.querySelector("[data-automation-id='wd-CommandButton_uic_nextButton']:not([disabled])") ||
        AutoApply.findButton(document, ["next", "save and continue", "siguiente", "weiter", "continue"]);

      if (submitBtn) {
        const emptyRequired = AutoApply.emptyRequiredFields(document);

        if (emptyRequired.length > 0) {
          log("Stopping: required fields empty:", emptyRequired.map((e) => AutoApply.extractLabel(e, document)));
          btn.textContent = `⚠️ ${emptyRequired.length} required field(s) empty — review`;
          btn.disabled = false;
          break;
        }

        btn.textContent = "📨 Submitting…";
        log("Clicking Submit");
        submitBtn.click();
        await AutoApply.sleep(2000);
        btn.textContent = "✅ Applied!";
        const logResult = await AutoApply.logApplication({
          platform: "workday",
          company: scrapeCompanyName(),
          role: scrapeJobTitle(),
          jobDescription,
          answers: allAnswers,
        });
        if (logResult.ok) log("Application logged ✅");
        else log("Log failed:", logResult.error);
        break;
      } else if (nextBtn) {
        log("Clicking Next");
        nextBtn.click();
        await AutoApply.sleep(2000);
        step++;
      } else {
        log("No navigation button — stopping");
        btn.textContent = "✅ Filled!";
        break;
      }

      if (step > 20) {
        log("Too many steps — stopping");
        btn.textContent = "⚠️ Check form";
        break;
      }
    }
  }

  function scrapeCompanyName() {
    return (
      document.querySelector("[data-automation-id='employerName']")?.textContent?.trim() ||
      document.querySelector("[class*='company'], [class*='employer']")?.textContent?.trim() ||
      "Unknown Company"
    );
  }

  function scrapeJobTitle() {
    return (
      document.querySelector("[data-automation-id='jobPostingHeader'] h1, h1")?.textContent?.trim() ||
      "Unknown Role"
    );
  }

  async function handleWorkdayCustomDropdowns(answers) {
    const triggers = document.querySelectorAll(
      "[data-automation-id] [aria-haspopup='listbox']:not([disabled]), " +
      "[data-automation-id] [aria-haspopup='true']:not([disabled])"
    );
    for (const trigger of triggers) {
      const container = trigger.closest("[data-automation-id]");
      const automationId = container?.getAttribute("data-automation-id") || "";
      const label = AutoApply.extractLabel(trigger, document) || automationId;
      const key = AutoApply.findMatchingKey(answers, trigger, label);
      if (!key) continue;

      const value = String(answers[key]).toLowerCase();
      trigger.click();
      await AutoApply.sleep(500);

      const options = [...document.querySelectorAll("[role='option']:not([aria-disabled='true'])")];
      const match = options.find((o) => o.textContent.trim().toLowerCase().includes(value));
      if (match) {
        match.click();
        await AutoApply.sleep(300);
      } else {
        // Close without selecting if no match
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await AutoApply.sleep(200);
      }
    }
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
})().catch((err) => console.error("[AutoApply Workday] Fatal:", err));
