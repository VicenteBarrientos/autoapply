// Shared DOM helpers used by all platform content scripts

window.AutoApply = window.AutoApply || {};

AutoApply.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

AutoApply.fillInput = (el, value) => {
  // Respect the field's maxLength so we never submit truncated data silently
  let strVal = String(value);
  if (el.maxLength > 0 && strVal.length > el.maxLength) strVal = strVal.slice(0, el.maxLength);
  if (el.value === strVal) return; // already correct — don't trigger unnecessary events
  el.focus();
  el.value = "";
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  nativeInputValueSetter.call(el, strVal);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
};

AutoApply.fillTextarea = (el, value) => {
  let strVal = String(value);
  if (el.maxLength > 0 && strVal.length > el.maxLength) strVal = strVal.slice(0, el.maxLength);
  if (el.value === strVal) return;
  el.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  ).set;
  nativeSetter.call(el, strVal);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
};

AutoApply.selectOption = (el, value) => {
  const strValue = String(value).toLowerCase();
  el.focus();
  // Prefer exact value match first, then partial text match
  for (const opt of el.options) {
    if (opt.value.toLowerCase() === strValue) {
      opt.selected = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  for (const opt of el.options) {
    if (opt.text.toLowerCase() === strValue) {
      opt.selected = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  // Fall back to substring — shortest matching option wins to avoid "Norway" matching "No"
  const candidates = Array.from(el.options).filter((o) =>
    o.text.toLowerCase().includes(strValue)
  );
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.text.length - b.text.length);
    candidates[0].selected = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
};

AutoApply.extractLabel = (el, root = document) => {
  if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
  if (el.placeholder) return el.placeholder;
  if (el.id) {
    const label = root.querySelector(`label[for="${el.id}"]`) ||
                  document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }
  let parent = el.parentElement;
  for (let i = 0; i < 4; i++) {
    if (!parent) break;
    const label = parent.querySelector("label");
    if (label) return label.textContent.trim();
    parent = parent.parentElement;
  }
  return el.name || el.id || el.closest("[data-automation-id]")?.getAttribute("data-automation-id") || "";
};

// root scopes scraping to a form/modal — defaults to whole document.
// options.selector overrides the input query; options.dedupe skips duplicate elements.
// Returned fields include current value/checked so Claude can preserve correct answers.
AutoApply.scrapeFormFields = (root = document, options = {}) => {
  const inputSelector = options.selector ||
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file])," +
    " textarea, select";
  const fields = [];
  const seen = options.dedupe ? new Set() : null;
  const inputs = (root?.querySelectorAll ? root : document).querySelectorAll(inputSelector);
  inputs.forEach((el) => {
    if (el.offsetParent === null) return;
    if (seen) {
      if (seen.has(el)) return;
      seen.add(el);
    }
    const isCheckable = el.type === "radio" || el.type === "checkbox";
    const field = {
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      name: el.name || null,
      id: el.id || null,
      label: AutoApply.extractLabel(el, root),
      required: el.required,
    };
    if (isCheckable) {
      field.checked = el.checked;
    } else {
      field.value = el.value || null;
    }
    if (el.tagName === "SELECT") {
      field.options = Array.from(el.options).map((o) => o.text.trim());
    }
    fields.push(field);
  });
  return fields;
};

// Shared answer-key matcher used by every platform script.
AutoApply.findMatchingKey = (answers, el, label) => {
  for (const key of Object.keys(answers)) {
    if (el.id && el.id.toLowerCase().includes(key.toLowerCase())) return key;
    if (el.name && el.name.toLowerCase().includes(key.toLowerCase())) return key;
    if (label && label.toLowerCase().includes(key.toLowerCase())) return key;
    if (key.toLowerCase().includes(label?.toLowerCase()) && label?.length > 3) return key;
  }
  return null;
};

// Generic form-fill dispatcher used by every platform script.
// root scopes the query; sleepMs controls the per-field pause.
AutoApply.applyAnswers = async (answers, root = document, sleepMs = 120) => {
  const inputs = root.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=file])," +
    " textarea, select"
  );
  for (const el of inputs) {
    if (el.offsetParent === null) continue;
    const label = AutoApply.extractLabel(el, root);
    const key = AutoApply.findMatchingKey(answers, el, label);
    if (!key) continue;
    const value = answers[key];
    await AutoApply.sleep(sleepMs);

    if (el.tagName === "SELECT") {
      AutoApply.selectOption(el, value);
    } else if (el.tagName === "TEXTAREA") {
      AutoApply.fillTextarea(el, value);
    } else if (el.type === "radio" || el.type === "checkbox") {
      const strVal = String(value).toLowerCase();
      const wantChecked = value === true || strVal === "yes" || strVal === "true";
      const wantUnchecked = value === false || strVal === "no" || strVal === "false";
      if (wantChecked && !el.checked) el.click();
      else if (wantUnchecked && el.checked) el.click();
    } else {
      AutoApply.fillInput(el, value);
    }
  }
};

AutoApply.getProfile = () =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (res) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(res?.profile || null);
    });
  });

// Returns only fields that have no current value/selection — avoids re-asking Claude
// about fields the ATS already pre-filled or that were answered in a previous step.
AutoApply.unfilledFields = (fields) =>
  fields.filter((f) => {
    if (f.type === "radio" || f.type === "checkbox") return !f.checked;
    if (f.tag === "select") return !f.value || f.value === "";
    return !f.value || f.value.trim() === "";
  });

// Returns visible required fields that still have no value/selection.
AutoApply.emptyRequiredFields = (root = document) =>
  [...(root?.querySelectorAll ? root : document).querySelectorAll(
    "input[required]:not([type=hidden]):not([type=submit]):not([type=button])," +
    " textarea[required], select[required]"
  )].filter((el) => {
    if (el.offsetParent === null) return false;
    if (el.type === "checkbox" || el.type === "radio") return !el.checked;
    return !el.value.trim();
  });

// Shows a sticky notice listing each file upload field the user must fill manually.
// Call after injecting the Auto-Apply button so users know to attach files manually.
AutoApply.notifyFileUploads = (root = document, anchorEl = null) => {
  const fileInputs = [...root.querySelectorAll("input[type=file]")]
    .filter((el) => el.offsetParent !== null);
  if (fileInputs.length === 0) return;
  if (document.getElementById("autoapply-file-notice")) return;

  const labelList = fileInputs
    .map((el) => AutoApply.extractLabel(el, root) || "File upload")
    .join(", ");

  const notice = document.createElement("div");
  notice.id = "autoapply-file-notice";
  notice.style.cssText =
    "margin:8px 0;padding:8px 12px;background:#fef3c7;border:1px solid #f59e0b;" +
    "border-radius:6px;font-size:13px;color:#92400e;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
  notice.textContent = `📎 Manual upload required: ${labelList}`;

  if (anchorEl?.parentNode) {
    anchorEl.parentNode.insertBefore(notice, anchorEl.nextSibling);
  } else {
    Object.assign(notice.style, {
      position: "fixed", top: "60px", right: "16px",
      maxWidth: "320px", zIndex: "99999",
    });
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 10000);
  }
};

// Find the first enabled button whose text matches any of the given labels.
AutoApply.findButton = (root, labels) => {
  const scope = root?.querySelectorAll ? root : document;
  const buttons = scope.querySelectorAll("button:not([disabled])");
  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase();
    if (labels.some((l) => text === l || text.includes(l))) return btn;
  }
  return null;
};

// Persist a completed application to extension storage + ResumeX.
AutoApply.logApplication = ({ platform, company, role, jobDescription, answers }) =>
  new Promise((resolve) => {
    const application = {
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      platform,
      company: company || "Unknown Company",
      role: role || "Unknown Role",
      jobUrl: window.location.href,
      jobDescription: (jobDescription || "").slice(0, 2000),
      appliedAt: new Date().toISOString(),
      status: "applied",
      answers: answers || {},
    };
    chrome.runtime.sendMessage({ type: "LOG_APPLICATION", payload: application }, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else if (res?.ok) resolve({ ok: true, application });
      else resolve({ ok: false, error: res?.error });
    });
  });

// Wire up one-time logging when the user clicks the form's submit button.
AutoApply.attachSubmitLogger = (form, callback) => {
  const submitEl = form.querySelector(
    "input[type=submit], button[type=submit], button[data-qa='btn-submit-application']"
  );
  if (!submitEl) return;
  submitEl.addEventListener("click", () => setTimeout(callback, 1000), { once: true });
};

AutoApply.askBackend = (fields, jobDescription, platform) =>
  new Promise((resolve, reject) => {
    AutoApply.getProfile().then((profile) => {
      if (!profile) {
        reject(new Error("No profile saved — open the AutoApply popup and save your profile first."));
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "FILL_FORM",
          payload: { fields, jobDescription, platform, profile },
        },
        (res) => {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          if (res?.error) reject(new Error(res.error));
          else resolve(res);
        }
      );
    });
  });
