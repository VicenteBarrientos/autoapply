// Lever content script

(async () => {
  const log = (...args) => console.log("[AutoApply Lever]", ...args);

  let allAnswers = {};

  function isApplicationPage() {
    return (
      window.location.hostname.includes("jobs.lever.co") &&
      window.location.pathname.includes("/apply")
    );
  }

  function injectButton() {
    if (document.getElementById("autoapply-btn")) return;
    const form = document.querySelector("form.application-form, form[data-qa='application-form'], form");
    if (!form) return;

    const btn = document.createElement("button");
    btn.id = "autoapply-btn";
    btn.type = "button";
    btn.textContent = "⚡ Auto-Apply";
    btn.style.cssText =
      "margin:12px 0;background:#5352ed;color:#fff;border:none;border-radius:6px;" +
      "padding:8px 18px;font-size:14px;cursor:pointer;font-weight:600;";
    btn.addEventListener("click", () => runAutoFill(form, btn));

    form.insertBefore(btn, form.firstElementChild);
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

      const answers = await AutoApply.askBackend(fields, jobDescription, "lever");
      log("Answers:", answers);
      Object.assign(allAnswers, answers);
      await AutoApply.applyAnswers(answers, form, 100);

      AutoApply.attachSubmitLogger(form, async () => {
        const logResult = await AutoApply.logApplication({
          platform: "lever",
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
      document.querySelector(".main-header-logo img")?.alt?.trim() ||
      document.querySelector("[class*='company']")?.textContent?.trim() ||
      document.title.split(" - ")[1]?.trim() ||
      "Unknown Company"
    );
  }

  function scrapeJobTitle() {
    return (
      document.querySelector("h2[data-qa='posting-name'], .posting-headline h2")?.textContent?.trim() ||
      document.querySelector("h1, h2")?.textContent?.trim() ||
      "Unknown Role"
    );
  }


  function scrapeJobDescription() {
    const el = document.querySelector(
      ".posting-description, [class*='job-description'], .section-wrapper"
    );
    return el ? el.innerText.slice(0, 3000) : "";
  }

  const observer = new MutationObserver(() => {
    if (isApplicationPage()) injectButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (isApplicationPage()) injectButton();
})().catch((err) => console.error("[AutoApply Lever] Fatal:", err));
