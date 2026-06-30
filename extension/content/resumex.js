// Content script running on resumex pages.
// Injects the bridge into the page context and relays messages
// between the extension (chrome.runtime) and the page (window.postMessage).

(function () {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("content/resumex-bridge.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  function postToBridge(requestType, responseType, payload, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      let settled = false;

      const handler = (event) => {
        if (event.source !== window || event.data?.type !== responseType) return;
        if (responseType.endsWith("_RESPONSE") && event.data?.nonce !== nonce) return;
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        window.removeEventListener("message", handler);
        resolve(event.data);
      };

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", handler);
        resolve({ error: "ResumeX bridge timed out" });
      }, timeoutMs);

      window.addEventListener("message", handler);
      window.postMessage({ type: requestType, payload, nonce }, "*");
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_RESUMEX_PROFILE") {
      postToBridge("AUTOAPPLY_GET_PROFILE", "AUTOAPPLY_PROFILE_RESPONSE")
        .then((data) => sendResponse(data.error ? { error: data.error } : { profile: data.profile }));
      return true;
    }

    if (message.type === "PUSH_PROFILE_TO_RESUMEX") {
      postToBridge("AUTOAPPLY_SET_PROFILE", "AUTOAPPLY_PROFILE_SET_OK", message.payload, 2000)
        .then((data) => sendResponse(data.error ? { error: data.error } : { ok: true }));
      return true;
    }

    if (message.type === "GET_RESUMEX_JOBS") {
      postToBridge("RESUMEX_GET_JOBS", "RESUMEX_JOBS_RESPONSE")
        .then((data) => sendResponse(data.error ? { error: data.error } : { jobs: data.jobs || [] }));
      return true;
    }

    if (message.type === "MERGE_JOBS_TO_RESUMEX") {
      postToBridge("RESUMEX_MERGE_JOBS", "RESUMEX_JOBS_MERGE_OK", message.payload, 5000)
        .then((data) =>
          sendResponse(data.error ? { error: data.error } : { ok: true, jobs: data.jobs, count: data.jobs?.length })
        );
      return true;
    }

    if (message.type === "SET_RESUMEX_JOBS") {
      postToBridge("RESUMEX_SET_JOBS", "RESUMEX_JOBS_SET_OK", message.payload, 2000)
        .then((data) => sendResponse(data.error ? { error: data.error } : { ok: true }));
      return true;
    }

    if (message.type === "PUSH_APPLICATION_TO_RESUMEX") {
      window.postMessage({ type: "AUTOAPPLY_LOG_APPLICATION", payload: message.payload }, "*");
      sendResponse({ ok: true });
      return true;
    }
  });
})();
