// Indeed content script — multi-step apply with application logging

(async () => {
  const log = (...args) => console.log("[AutoApply Indeed]", ...args);

  let containerObserved = false;
  let allAnswers = {};

  const CONTAINER_SELECTORS = [
    "[data-testid='ia-container']",
    ".ia-BasePage",
    "#ia-container",
    ".jobsearch-IndeedApplyButton-contentWrapper",
  ];

  const findContainer = () => {
    for (const sel of CONTAINER_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const observer = new MutationObserver(() => {
    const container = findContainer();
    if (container && !containerObserved) {
      containerObserved = true;
      allAnswers = {};
      log("Container detected");
      injectButton(container);
    }
    if (!container) containerObserved = false;
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
    btn.addEventListener("click", () => runAutoFill(container, btn));
    document.body.appendChild(btn);
    AutoApply.notifyFileUploads(container, btn);
    log("Button injected");
  }

  async function runAutoFill(container, btn) {
    btn.disabled = true;
    try {
      await fillAndAdvance(container, btn);
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

  async function fillAndAdvance(container, btn) {
    let step = 1;

    while (true) {
      btn.textContent = `⏳ Step ${step}…`;

      const jobDescription = scrapeJobDescription();
      // Scope field scraping to the apply container
      const fields = AutoApply.scrapeFormFields(container);
      const unfilledFields = AutoApply.unfilledFields(fields);
      log(`Step ${step} — fields: ${fields.length} total, ${unfilledFields.length} unfilled`);

      if (unfilledFields.length > 0) {
        const answers = await AutoApply.askBackend(unfilledFields, jobDescription, "indeed");
        log(`Step ${step} — answers:`, answers);
        Object.assign(allAnswers, answers);
        await AutoApply.applyAnswers(answers, container, 100);
        await AutoApply.sleep(400);
      }

      const submitBtn = AutoApply.findButton(container, [
        "submit your application",
        "submit application",
        "apply now",
        "enviar solicitud",
      ]);
      const nextBtn = AutoApply.findButton(container, ["continue", "next", "save and continue", "siguiente"]);

      if (submitBtn) {
        const emptyRequired = AutoApply.emptyRequiredFields(container);

        if (emptyRequired.length > 0) {
          log("Stopping: required fields empty:", emptyRequired.map((e) => AutoApply.extractLabel(e, container)));
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
          platform: "indeed",
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
        await AutoApply.sleep(1500);
        step++;
      } else {
        log("No navigation button — stopping");
        btn.textContent = "✅ Filled!";
        break;
      }

      if (step > 15) {
        log("Too many steps — stopping");
        btn.textContent = "⚠️ Check form";
        break;
      }
    }
  }

  function scrapeCompanyName() {
    return (
      document.querySelector("[data-testid='inlineHeader-companyName'] a")?.textContent?.trim() ||
      document.querySelector(".jobsearch-CompanyInfoContainer a")?.textContent?.trim() ||
      document.querySelector("[class*='company']")?.textContent?.trim() ||
      "Unknown Company"
    );
  }

  function scrapeJobTitle() {
    return (
      document.querySelector("[data-testid='jobsearch-JobInfoHeader-title']")?.textContent?.trim() ||
      document.querySelector(".jobsearch-JobInfoHeader-title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "Unknown Role"
    );
  }

  function scrapeJobDescription() {
    const el =
      document.querySelector("#jobDescriptionText") ||
      document.querySelector(".jobsearch-jobDescriptionText") ||
      document.querySelector("[data-testid='jobDescriptionText']") ||
      document.querySelector("[class*='jobDescription']") ||
      document.querySelector("article");
    return el ? el.innerText.slice(0, 3000) : "";
  }
})().catch((err) => console.error("[AutoApply Indeed] Fatal:", err));
