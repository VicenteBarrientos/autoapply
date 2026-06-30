const listEl = document.getElementById("job-list");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const filterEl = document.getElementById("filter");
const sortEl = document.getElementById("sort");
const boardsEl = document.getElementById("greenhouse-boards");
const leverEl = document.getElementById("lever-boards");

let jobs = [];
let profile = null;

function send(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (res) => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve(res || {});
    });
  });
}

function parseList(str) {
  return str.split(",").map((s) => s.trim()).filter(Boolean);
}

function showStatus(text, isErr = false) {
  statusEl.textContent = text;
  statusEl.className = isErr ? "err" : text ? "ok" : "";
  if (text) setTimeout(() => { statusEl.textContent = ""; statusEl.className = ""; }, 4000);
}

function scoreClass(score) {
  if (score == null) return "";
  return score >= 75 ? "high" : "";
}

function filteredJobs() {
  const f = filterEl.value;
  let list = jobs.filter((j) => j.status !== "dismissed" || f === "all");
  if (f === "open") list = list.filter((j) => j.status !== "applied" && j.status !== "dismissed");
  else if (f === "saved") list = list.filter((j) => j.status === "saved");
  else if (f === "applied") list = list.filter((j) => j.status === "applied");
  else if (f === "auto") list = list.filter((j) => j.applySupported && j.status !== "applied");

  if (sortEl.value === "score") {
    list.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
  } else {
    list.sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt));
  }
  return list;
}

function renderStats() {
  const open = jobs.filter((j) => j.status !== "applied" && j.status !== "dismissed").length;
  const auto = jobs.filter((j) => j.applySupported && j.status !== "applied").length;
  const scored = jobs.filter((j) => j.matchScore != null).length;
  const unscored = jobs.filter((j) => j.matchScore == null && j.status !== "applied" && j.status !== "dismissed").length;
  statsEl.innerHTML =
    `<span><strong>${jobs.length}</strong> total</span>` +
    `<span><strong>${open}</strong> open</span>` +
    `<span><strong>${auto}</strong> AutoApply-ready</span>` +
    `<span><strong>${scored}</strong> analyzed</span>` +
    `<span><strong>${unscored}</strong> pending analysis</span>`;
}

function render() {
  renderStats();
  const list = filteredJobs();
  listEl.innerHTML = "";
  emptyEl.hidden = list.length > 0;

  for (const job of list) {
    const card = document.createElement("article");
    card.className = `job-card ${job.status}`;
    card.dataset.id = job.id;

    const scoreBadge = job.matchScore != null
      ? `<span class="badge badge-score ${scoreClass(job.matchScore)}">${job.matchScore}% match</span>`
      : "";

    card.innerHTML = `
      <div class="job-head">
        <div>
          <div class="job-title">${esc(job.title)}</div>
          <div class="job-meta">${esc(job.company)}${job.location ? ` · ${esc(job.location)}` : ""}</div>
          <div class="badges">
            <span class="badge badge-platform">${esc(job.platform)}</span>
            ${job.remote ? '<span class="badge badge-remote">Remote</span>' : ""}
            ${job.applySupported ? '<span class="badge badge-auto">⚡ AutoApply</span>' : ""}
            ${job.status === "applied" ? '<span class="badge badge-applied">Applied</span>' : ""}
            ${scoreBadge}
          </div>
        </div>
      </div>
      ${job.matchSummary ? `<p class="job-summary">${esc(job.matchSummary)}</p>` : ""}
      ${job.matchGaps?.length ? `<p class="job-gaps">Gaps: ${esc(job.matchGaps.join(", "))}</p>` : ""}
      <div class="job-actions">
        ${job.matchScore == null ? `<button class="btn btn-sm" data-action="match">Analyze match</button>` : ""}
        ${job.url ? `<button class="btn btn-sm btn-apply" data-action="apply">Open & apply</button>` : ""}
        <button class="btn btn-sm" data-action="save">${job.status === "saved" ? "Saved ✓" : "Save"}</button>
        <button class="btn btn-sm" data-action="dismiss">Dismiss</button>
      </div>
    `;

    card.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(job.id, btn.dataset.action));
    });
    listEl.appendChild(card);
  }
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function saveJobs(updated) {
  jobs = updated;
  await send("SET_JOBS", updated);
  render();
}

async function persistWatchlistsToProfile() {
  if (!profile) return;
  const greenhouseBoards = parseList(boardsEl.value);
  const leverBoards = parseList(leverEl.value);
  const updated = {
    ...profile,
    target: { ...profile.target, greenhouseBoards, leverBoards },
  };
  await send("SET_PROFILE", updated);
  profile = updated;
}

async function handleAction(jobId, action) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;

  if (action === "match") {
    if (!profile) { showStatus("No profile — save one in the popup first.", true); return; }
    showStatus(`Analyzing ${job.title}…`);
    const res = await send("MATCH_JOB", { profile, job });
    if (res.error) { showStatus(res.error, true); return; }
    const updated = jobs.map((j) =>
      j.id === jobId
        ? { ...j, matchScore: res.score, matchGaps: res.matchGaps || res.gaps, matchSummary: res.matchSummary || res.summary }
        : j
    );
    await saveJobs(updated);
    showStatus(`Match: ${res.score}% — ${res.recommendation || "done"}`);
    return;
  }

  if (action === "apply") {
    if (job.url) chrome.tabs.create({ url: job.url });
    return;
  }

  if (action === "save") {
    await saveJobs(jobs.map((j) => (j.id === jobId ? { ...j, status: "saved" } : j)));
    showStatus("Job saved.");
    return;
  }

  if (action === "dismiss") {
    await saveJobs(jobs.map((j) => (j.id === jobId ? { ...j, status: "dismissed" } : j)));
  }
}

async function loadJobs() {
  const res = await send("GET_JOBS");
  if (res.error) { showStatus(res.error, true); return; }
  jobs = res.jobs || [];
  render();
}

async function loadProfile() {
  const res = await send("GET_PROFILE");
  profile = res.profile || null;
  if (profile?.target?.greenhouseBoards?.length && !boardsEl.value) {
    boardsEl.value = profile.target.greenhouseBoards.join(", ");
  }
  if (profile?.target?.leverBoards?.length && !leverEl.value) {
    leverEl.value = profile.target.leverBoards.join(", ");
  }
}

document.getElementById("search-btn").addEventListener("click", async () => {
  if (!profile) { showStatus("No profile — save one in the AutoApply popup first.", true); return; }

  const greenhouseBoards = parseList(boardsEl.value);
  const leverBoards = parseList(leverEl.value);
  await persistWatchlistsToProfile();

  showStatus("Searching…");
  const res = await send("SEARCH_JOBS", {
    profile,
    preferences: { greenhouseBoards, leverBoards, limit: 30 },
  });
  if (res.error) { showStatus(res.error, true); return; }
  jobs = res.jobs || [];
  render();
  showStatus(`Found ${res.newCount ?? 0} new jobs (${jobs.length} in queue).`);
});

document.getElementById("batch-match-btn").addEventListener("click", async () => {
  if (!profile) { showStatus("No profile — save one in the popup first.", true); return; }

  const pending = jobs.filter((j) => j.matchScore == null && j.status !== "applied" && j.status !== "dismissed");
  if (pending.length === 0) { showStatus("No jobs need analysis.", true); return; }

  showStatus(`Analyzing ${Math.min(5, pending.length)} jobs…`);
  const res = await send("MATCH_JOBS_BATCH", { profile, jobs: pending, limit: 5 });
  if (res.error) { showStatus(res.error, true); return; }
  jobs = res.jobs || jobs;
  render();
  showStatus(`Analyzed ${res.results?.length ?? 0} jobs ✅`);
});

document.getElementById("add-job-btn").addEventListener("click", async () => {
  const url = document.getElementById("add-job-url").value.trim();
  if (!url) { showStatus("Paste a job URL first.", true); return; }

  showStatus("Adding job…");
  const res = await send("ADD_JOB", { url });
  if (res.error) { showStatus(res.error, true); return; }
  jobs = res.jobs || jobs;
  document.getElementById("add-job-url").value = "";
  render();
  showStatus(`Added: ${res.job?.title || "job"} ✅`);
});

document.getElementById("sync-btn").addEventListener("click", async () => {
  showStatus("Syncing from ResumeX…");
  const res = await send("SYNC_JOBS_FROM_RESUMEX");
  if (res.error) { showStatus(res.error, true); return; }
  jobs = res.jobs || [];
  render();
  showStatus("Synced with ResumeX ✅");
});

filterEl.addEventListener("change", render);
sortEl.addEventListener("change", render);

chrome.storage.onChanged.addListener((changes) => {
  if (changes.resumex_jobs) {
    jobs = changes.resumex_jobs.newValue || [];
    render();
  }
});

loadProfile().then(loadJobs);
