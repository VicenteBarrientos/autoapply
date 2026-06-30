// Greenhouse content script

(async () => {
  const log = (...args) => console.log("[AutoApply Greenhouse]", ...args);

  let allAnswers = {};

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
    AutoApply.notifyFileUploads(form, btn);
    log("Button injected");
  }

  async function runAutoFill(form, btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Filling…";
    allAnswers = {};
    try {
      const jobDescription = scrapeJobDescription();
      const fields = AutoApply.scrapeFormFields(form);
      log("Fields scraped:", fields);

      const answers = await AutoApply.askBackend(fields, jobDescription, "greenhouse");
      log("Answers:", answers);
      Object.assign(allAnswers, answers);
      await AutoApply.applyAnswers(answers, form, 100);

      AutoApply.attachSubmitLogger(form, async () => {
        const logResult = await AutoApply.logApplication({
          platform: "greenhouse",
          company: scrapeCompanyName(),
          role: scrapeJobTitle(),
          jobDescription,
          answers: allAnswers,
        });
        if (logResult.ok) log("Application logged ✅");
        else log("Log failed:", logResult.error);
      });
      btn.textContent = "✅ Filled! Submit when ready.";
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

  function scrapeCompanyName() {
    return (
      document.querySelector(".company-name, [class*='company']")?.textContent?.trim() ||
      document.querySelector("header h2, header p")?.textContent?.trim() ||
      "Unknown Company"
    );
  }

  function scrapeJobTitle() {
    return (
      document.querySelector("h1.app-title, h1[class*='job'], h1")?.textContent?.trim() ||
      "Unknown Role"
    );
  }


  function scrapeJobDescription() {
    const el =
      document.querySelector(".job-post-description, #content .job-description, [class*='description']");
    return el ? el.innerText.slice(0, 3000) : "";
  }

  const observer = new MutationObserver(() => {
    if (isApplicationPage()) injectButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (isApplicationPage()) injectButton();
})().catch((err) => console.error("[AutoApply Greenhouse] Fatal:", err));
