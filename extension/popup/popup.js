const profileEl = document.getElementById("profile-json");
const msgEl = document.getElementById("msg");
const platformEl = document.getElementById("platform");
const profileStatusEl = document.getElementById("profile-status");
const backendUrlEl = document.getElementById("backend-url");
const secretEl = document.getElementById("backend-secret");
const appCountEl = document.getElementById("app-count");
const jobQueueEl = document.getElementById("job-queue-count");

const DEFAULT_BACKEND_URL = "https://backend-inky-kappa-12.vercel.app";
const RESUMEX_URL = "https://resume-x-yixz.vercel.app";

function isPlaceholderProfile(profile) {
  if (!profile) return false;
  const p = profile.personal || {};
  return (
    p.email?.includes("example.com") ||
    p.phone?.includes("555-") ||
    (p.firstName === "Jane" && p.lastName === "Doe")
  );
}

function updateProfileStatus(profile) {
  if (!profile) {
    profileStatusEl.textContent = "None saved";
    profileStatusEl.style.color = "#dc2626";
    return;
  }
  const name = [profile.personal?.firstName, profile.personal?.lastName].filter(Boolean).join(" ");
  const role = profile.experience?.currentTitle || profile.target?.roles?.[0] || "";
  const label = [name, role].filter(Boolean).join(" · ") || "Saved";
  if (isPlaceholderProfile(profile)) {
    profileStatusEl.textContent = `⚠️ ${label} — update with your real info!`;
    profileStatusEl.style.color = "#d97706";
  } else {
    profileStatusEl.textContent = label;
    profileStatusEl.style.color = "#16a34a";
  }
}

function updateAppCount(applications) {
  const count = (applications || []).length;
  appCountEl.textContent = count > 0 ? `${count} job${count === 1 ? "" : "s"}` : "None yet";
  appCountEl.style.color = count > 0 ? "#16a34a" : "#888";
}

function updateJobQueueCount(jobs) {
  const count = (jobs || []).length;
  const unapplied = (jobs || []).filter((j) => j.status !== "applied").length;
  if (count === 0) {
    jobQueueEl.textContent = "Empty";
    jobQueueEl.style.color = "#888";
  } else {
    jobQueueEl.textContent = `${unapplied} open · ${count} total`;
    jobQueueEl.style.color = unapplied > 0 ? "#16a34a" : "#888";
  }
}

function refreshJobQueueCount() {
  chrome.runtime.sendMessage({ type: "GET_JOBS" }, (res) => {
    if (chrome.runtime.lastError || res?.error) {
      jobQueueEl.textContent = "—";
      return;
    }
    updateJobQueueCount(res.jobs);
  });
}

document.getElementById("open-queue-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("jobs/dashboard.html") });
});

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
  if (chrome.runtime.lastError) return;
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

// Load saved profile, backend settings, and application count on open
chrome.storage.local.get(["candidate_profile", "backend_secret", "backend_url", "autoapply_applications"], (result) => {
  if (chrome.runtime.lastError) { showMsg("Storage error: " + chrome.runtime.lastError.message, true); return; }
  if (result.candidate_profile) profileEl.value = JSON.stringify(result.candidate_profile, null, 2);
  backendUrlEl.value = result.backend_url || DEFAULT_BACKEND_URL;
  if (result.backend_secret) secretEl.value = result.backend_secret;
  updateProfileStatus(result.candidate_profile || null);
  updateAppCount(result.autoapply_applications);
  refreshJobQueueCount();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.autoapply_applications) updateAppCount(changes.autoapply_applications.newValue);
  if (changes.resumex_jobs) updateJobQueueCount(changes.resumex_jobs.newValue);
});

document.getElementById("search-jobs-btn").addEventListener("click", () => {
  showMsg("Searching…");
  chrome.runtime.sendMessage({ type: "GET_PROFILE" }, (profileRes) => {
    if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
    const profile = profileRes?.profile;
    if (!profile) { showMsg("Save a profile first.", true); return; }

    chrome.runtime.sendMessage({ type: "SEARCH_JOBS", payload: { profile } }, (searchRes) => {
      if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
      if (searchRes?.error) { showMsg(searchRes.error, true); return; }

      const newCount = searchRes.newCount ?? 0;
      updateJobQueueCount(searchRes.jobs);
      if (newCount === 0) showMsg("No new matching jobs.", true);
      else showMsg(`${newCount} new jobs added (${(searchRes.jobs || []).length} in queue) ✅`);
    });
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

  // Warn about obviously missing required sections before saving
  const missing = ["personal", "experience", "skills"].filter((k) => !parsed[k]);
  if (missing.length > 0) {
    showMsg(`Profile missing: ${missing.join(", ")} — applications may be incomplete.`, true);
    // Still save so users can build iteratively
  }

  chrome.runtime.sendMessage({ type: "SET_PROFILE", payload: parsed }, (res) => {
    if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
    if (res?.ok) { if (missing.length === 0) showMsg("Profile saved!"); updateProfileStatus(parsed); }
  });
});

// Backend URL + secret save
document.getElementById("save-backend-btn").addEventListener("click", () => {
  const url = backendUrlEl.value.trim().replace(/\/$/, "") || DEFAULT_BACKEND_URL;
  const secret = secretEl.value.trim();
  chrome.storage.local.set({ backend_url: url, backend_secret: secret }, () => {
    if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
    showMsg("Backend settings saved!");
  });
});

document.getElementById("test-backend-btn").addEventListener("click", () => {
  const url = backendUrlEl.value.trim().replace(/\/$/, "") || DEFAULT_BACKEND_URL;
  const secret = secretEl.value.trim();
  showMsg("Testing connection…");
  chrome.runtime.sendMessage({ type: "TEST_BACKEND", payload: { url, secret } }, (res) => {
    if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
    if (res?.ok) showMsg(`Backend OK ✅ (${url})`);
    else showMsg(res?.error || "Connection failed", true);
  });
});

// Pull profile FROM ResumeX → extension
document.getElementById("pull-btn").addEventListener("click", () => {
  showMsg("Pulling from ResumeX…");
  chrome.runtime.sendMessage({ type: "SYNC_PROFILE_FROM_RESUMEX" }, (res) => {
    if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
    if (res?.profile) {
      profileEl.value = JSON.stringify(res.profile, null, 2);
      updateProfileStatus(res.profile);
      showMsg("Profile pulled from ResumeX ✅");
    } else {
      showMsg(res?.error || "Open resume-x-yixz.vercel.app/autoapply first.", true);
    }
  });
});

// Push profile TO ResumeX — saves locally first so extension always has the latest version
document.getElementById("push-btn").addEventListener("click", () => {
  let parsed;
  try {
    parsed = JSON.parse(profileEl.value);
  } catch {
    showMsg("Invalid JSON — fix first.", true);
    return;
  }

  // Always persist locally first
  chrome.runtime.sendMessage({ type: "SET_PROFILE", payload: parsed }, (saveRes) => {
    if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
    if (saveRes?.ok) updateProfileStatus(parsed);
  });

  chrome.tabs.query({ url: "https://resume-x-yixz.vercel.app/*" }, (tabs) => {
    if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
    if (tabs.length === 0) {
      showMsg("Saved locally. Open resume-x-yixz.vercel.app to also push there.", true);
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: "PUSH_PROFILE_TO_RESUMEX", payload: parsed }, () => {
      if (chrome.runtime.lastError) { showMsg("Error: " + chrome.runtime.lastError.message, true); return; }
      showMsg("Profile saved & pushed to ResumeX ✅");
    });
  });
});
