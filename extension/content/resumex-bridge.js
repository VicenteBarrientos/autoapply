// Runs in PAGE context (not extension context) — can access localStorage.
// Injected by resumex.js content script.

(function () {
  const PROFILE_KEY = "autoapply_profile";
  const APPS_KEY = "autoapply_applications";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const { type, payload } = event.data || {};

    if (type === "AUTOAPPLY_GET_PROFILE") {
      const raw = localStorage.getItem(PROFILE_KEY);
      window.postMessage({
        type: "AUTOAPPLY_PROFILE_RESPONSE",
        profile: raw ? JSON.parse(raw) : null,
      }, "*");
    }

    if (type === "AUTOAPPLY_SET_PROFILE") {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
      window.postMessage({ type: "AUTOAPPLY_PROFILE_SET_OK" }, "*");
      window.dispatchEvent(new CustomEvent("autoapply:profile_updated", { detail: payload }));
    }

    if (type === "AUTOAPPLY_LOG_APPLICATION") {
      const existing = JSON.parse(localStorage.getItem(APPS_KEY) || "[]");
      if (!existing.find((a) => a.id === payload.id)) {
        localStorage.setItem(APPS_KEY, JSON.stringify([payload, ...existing]));
      }
      window.postMessage({ type: "AUTOAPPLY_LOG_OK" }, "*");
      window.dispatchEvent(new CustomEvent("autoapply:new_application", { detail: payload }));
    }
  });
})();
