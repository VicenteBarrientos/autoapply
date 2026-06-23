// Shared DOM helpers used by all platform content scripts

window.AutoApply = window.AutoApply || {};

AutoApply.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

AutoApply.fillInput = (el, value) => {
  el.focus();
  el.value = "";
  // React/Vue synthetic event workaround
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;
  nativeInputValueSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
};

AutoApply.fillTextarea = (el, value) => {
  el.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  ).set;
  nativeSetter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
};

AutoApply.selectOption = (el, value) => {
  el.focus();
  for (const opt of el.options) {
    if (
      opt.value.toLowerCase() === value.toLowerCase() ||
      opt.text.toLowerCase().includes(value.toLowerCase())
    ) {
      opt.selected = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  return false;
};

AutoApply.extractLabel = (el) => {
  // Try aria-label, placeholder, associated <label>
  if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
  if (el.placeholder) return el.placeholder;
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }
  // Walk up for wrapping label
  let parent = el.parentElement;
  for (let i = 0; i < 4; i++) {
    if (!parent) break;
    const label = parent.querySelector("label");
    if (label) return label.textContent.trim();
    parent = parent.parentElement;
  }
  return el.name || el.id || "";
};

AutoApply.scrapeFormFields = () => {
  const fields = [];
  const inputs = document.querySelectorAll(
    "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select"
  );
  inputs.forEach((el) => {
    if (el.offsetParent === null) return; // hidden
    fields.push({
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      name: el.name || null,
      id: el.id || null,
      label: AutoApply.extractLabel(el),
      required: el.required,
      options:
        el.tagName === "SELECT"
          ? Array.from(el.options).map((o) => o.text.trim())
          : undefined,
    });
  });
  return fields;
};

AutoApply.getProfile = () =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (res) => {
      resolve(res?.profile || null);
    });
  });

AutoApply.askBackend = (fields, jobDescription, platform) =>
  new Promise((resolve, reject) => {
    AutoApply.getProfile().then((profile) => {
      chrome.runtime.sendMessage(
        {
          type: "FILL_FORM",
          payload: { fields, jobDescription, platform, profile },
        },
        (res) => {
          if (res?.error) reject(new Error(res.error));
          else resolve(res);
        }
      );
    });
  });
