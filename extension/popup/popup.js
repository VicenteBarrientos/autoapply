const profileEl = document.getElementById("profile-json");
const msgEl = document.getElementById("msg");
const platformEl = document.getElementById("platform");

document.querySelector("a.open-dashboard").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://resume-x-yixz.vercel.app/autoapply" });
});

function showMsg(text, isErr = false) {
  msgEl.textContent = text;
  msgEl.className = isErr ? "err" : "ok";
  setTimeout(() => (msgEl.textContent = ""), 3000);
}

// Detect current tab platform
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const url = tab?.url || "";
  if (url.includes("linkedin.com")) platformEl.textContent = "LinkedIn";
  else if (url.includes("indeed.com")) platformEl.textContent = "Indeed";
  else if (url.includes("greenhouse.io")) platformEl.textContent = "Greenhouse";
  else if (url.includes("lever.co")) platformEl.textContent = "Lever";
  else if (url.includes("myworkdayjobs.com")) platformEl.textContent = "Workday";
  else if (url.includes("jobgether.com")) platformEl.textContent = "Jobgether";
  else if (url.includes("resume-x-yixz.vercel.app")) platformEl.textContent = "ResumeX ✅";
  else platformEl.textContent = "Unknown";
});

// Load saved profile on open
chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (res) => {
  if (res?.profile) profileEl.value = JSON.stringify(res.profile, null, 2);
});

document.getElementById("load-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (res) => {
    if (res?.profile) {
      profileEl.value = JSON.stringify(res.profile, null, 2);
      showMsg("Profile loaded.");
    } else {
      showMsg("No saved profile found.", true);
    }
  });
});

document.getElementById("save-btn").addEventListener("click", () => {
  let parsed;
  try {
    parsed = JSON.parse(profileEl.value);
  } catch {
    showMsg("Invalid JSON — fix and retry.", true);
    return;
  }
  chrome.runtime.sendMessage({ type: "SET_PROFILE", payload: parsed }, () => {
    showMsg("Profile saved!");
  });
});

// Pull profile FROM ResumeX → extension
document.getElementById("pull-btn").addEventListener("click", () => {
  showMsg("Pulling from ResumeX…");
  chrome.runtime.sendMessage({ type: "SYNC_PROFILE_FROM_RESUMEX" }, (res) => {
    if (res?.profile) {
      profileEl.value = JSON.stringify(res.profile, null, 2);
      showMsg("Profile pulled from ResumeX ✅");
    } else {
      showMsg(res?.error || "Open resume-x-yixz.vercel.app/autoapply first.", true);
    }
  });
});

// Push profile TO ResumeX ← extension
document.getElementById("push-btn").addEventListener("click", () => {
  let parsed;
  try {
    parsed = JSON.parse(profileEl.value);
  } catch {
    showMsg("Invalid JSON — fix first.", true);
    return;
  }

  chrome.tabs.query({ url: "https://resume-x-yixz.vercel.app/*" }, (tabs) => {
    if (tabs.length === 0) {
      showMsg("Open resume-x-yixz.vercel.app first.", true);
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: "PUSH_PROFILE_TO_RESUMEX", payload: parsed }, () => {
      showMsg("Profile pushed to ResumeX ✅");
    });
  });
});
