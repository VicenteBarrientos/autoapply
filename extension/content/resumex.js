// Content script running on resumex pages.
// Injects the bridge into the page context and relays messages
// between the extension (chrome.runtime) and the page (window.postMessage).

(function () {
  // Inject bridge script into page context (needed to access localStorage)
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("content/resumex-bridge.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // Relay: extension → page
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_RESUMEX_PROFILE") {
      const handler = (event) => {
        if (event.data?.type === "AUTOAPPLY_PROFILE_RESPONSE") {
          window.removeEventListener("message", handler);
          sendResponse({ profile: event.data.profile });
        }
      };
      window.addEventListener("message", handler);
      window.postMessage({ type: "AUTOAPPLY_GET_PROFILE" }, "*");
      return true;
    }

    if (message.type === "PUSH_PROFILE_TO_RESUMEX") {
      window.postMessage({ type: "AUTOAPPLY_SET_PROFILE", payload: message.payload }, "*");
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === "PUSH_APPLICATION_TO_RESUMEX") {
      window.postMessage({ type: "AUTOAPPLY_LOG_APPLICATION", payload: message.payload }, "*");
      sendResponse({ ok: true });
      return true;
    }
  });
})();
