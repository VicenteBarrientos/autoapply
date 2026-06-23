const BACKEND_URL = "http://localhost:3000";
const RESUMEX_URL = "https://resumex.vercel.app";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FILL_FORM") {
    handleFillForm(message.payload).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === "GET_PROFILE") {
    chrome.storage.local.get(["candidate_profile"], (result) => {
      sendResponse({ profile: result.candidate_profile || null });
    });
    return true;
  }

  if (message.type === "SET_PROFILE") {
    chrome.storage.local.set({ candidate_profile: message.payload }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "LOG_APPLICATION") {
    logApplicationToResumeX(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "SYNC_PROFILE_FROM_RESUMEX") {
    syncProfileFromResumeX().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleFillForm(payload) {
  const res = await fetch(`${BACKEND_URL}/api/apply/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
  return res.json();
}

async function logApplicationToResumeX(application) {
  // 1. Save in extension's local storage
  const existing = await new Promise((resolve) =>
    chrome.storage.local.get(["autoapply_applications"], (r) =>
      resolve(r.autoapply_applications || [])
    )
  );
  const updated = [application, ...existing];
  chrome.storage.local.set({ autoapply_applications: updated });

  // 2. Push to any open ResumeX tab (so dashboard updates live)
  const resumexTabs = await chrome.tabs.query({ url: `${RESUMEX_URL}/*` });
  for (const tab of resumexTabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "PUSH_APPLICATION_TO_RESUMEX",
        payload: application,
      });
    } catch {
      // Tab may not have content script ready yet — that's fine
    }
  }

  return { ok: true, application };
}

async function syncProfileFromResumeX() {
  // Pull profile stored in ResumeX localStorage via a content script message
  // The popup triggers this when the user clicks "Sync from ResumeX"
  const tabs = await chrome.tabs.query({ url: `${RESUMEX_URL}/*` });
  if (tabs.length === 0) return { error: "ResumeX not open in any tab" };

  const result = await chrome.tabs.sendMessage(tabs[0].id, { type: "GET_RESUMEX_PROFILE" });
  if (result?.profile) {
    await chrome.storage.local.set({ candidate_profile: result.profile });
    return { ok: true, profile: result.profile };
  }
  return { error: "No profile found in ResumeX" };
}
