'use strict';

/* ============================================================
   State
   ============================================================ */
let activities = [];
let currentActivity = null;
let currentView = 'counter'; // 'counter' | 'history'

/* ============================================================
   DOM helpers
   ============================================================ */
const $ = (id) => document.getElementById(id);

const emptyState   = $('emptyState');
const counterView  = $('counterView');
const historyView  = $('historyView');
const activityList = $('activityList');
const activityInput = $('activityInput');
const countDisplay = $('countDisplay');
const lastLap      = $('lastLap');
const activityTitle = $('activityTitle');
const historyTitle  = $('historyTitle');
const historyStats  = $('historyStats');
const lapList       = $('lapList');
const noLaps        = $('noLaps');
const topbarTitle   = $('topbarTitle');
const sidebar       = $('sidebar');
const overlay       = $('overlay');

/* ============================================================
   API helpers
   ============================================================ */
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ============================================================
   Rendering helpers
   ============================================================ */
function formatDate(isoStr) {
  const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(isoStr) {
  const d = new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showSection(name) {
  emptyState.classList.toggle('hidden', name !== 'empty');
  counterView.classList.toggle('hidden', name !== 'counter');
  historyView.classList.toggle('hidden', name !== 'history');
}

/* ============================================================
   Activity list sidebar
   ============================================================ */
function renderActivityList() {
  activityList.innerHTML = '';
  if (activities.length === 0) {
    activityList.innerHTML = '<li style="padding:12px 16px;color:var(--text-muted);font-size:0.85rem;">No activities yet.</li>';
    return;
  }
  for (const a of activities) {
    const li = document.createElement('li');
    li.className = 'activity-item' + (currentActivity && currentActivity.id === a.id ? ' active' : '');
    li.setAttribute('role', 'listitem');
    li.dataset.id = a.id;

    li.innerHTML = `
      <span class="activity-name" title="${escHtml(a.name)}">${escHtml(a.name)}</span>
      <span class="activity-meta">${a.lap_count} lap${a.lap_count !== 1 ? 's' : ''}</span>
      <button class="delete-btn" data-id="${a.id}" title="Delete activity" aria-label="Delete ${escHtml(a.name)}">🗑</button>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      selectActivity(a);
      closeSidebarMobile();
    });

    li.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteActivity(a.id);
    });

    activityList.appendChild(li);
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ============================================================
   Select / open activity
   ============================================================ */
async function selectActivity(a) {
  currentActivity = a;
  currentView = 'counter';
  topbarTitle.textContent = a.name;
  activityTitle.textContent = a.name;

  // refresh lap count from server
  try {
    const data = await api('GET', `/api/activities/${a.id}/laps`);
    currentActivity = { ...a, laps: data.laps };
    const count = data.laps.length;
    countDisplay.textContent = count;
    // update in activities array
    const idx = activities.findIndex(x => x.id === a.id);
    if (idx !== -1) activities[idx] = { ...activities[idx], lap_count: count };

    if (data.laps.length > 0) {
      const last = data.laps[0]; // ordered DESC
      lastLap.textContent = `Last lap: ${formatTime(last.recorded_at)}, ${formatDate(last.recorded_at)}`;
    } else {
      lastLap.textContent = '';
    }
  } catch (err) {
    console.error(err);
  }

  renderActivityList();
  showSection('counter');
}

/* ============================================================
   Add activity
   ============================================================ */
async function addActivity() {
  const name = activityInput.value.trim();
  if (!name) { activityInput.focus(); return; }
  try {
    const newActivity = await api('POST', '/api/activities', { name });
    newActivity.lap_count = 0;
    activities.unshift(newActivity);
    activityInput.value = '';
    renderActivityList();
    selectActivity(newActivity);
    closeSidebarMobile();
  } catch (err) {
    alert(err.message);
  }
}

/* ============================================================
   Delete activity
   ============================================================ */
async function deleteActivity(id) {
  if (!confirm('Delete this activity and all its laps?')) return;
  try {
    await api('DELETE', `/api/activities/${id}`);
    activities = activities.filter(a => a.id !== id);
    if (currentActivity && currentActivity.id === id) {
      currentActivity = null;
      topbarTitle.textContent = 'RoundCounter';
      showSection('empty');
    }
    renderActivityList();
  } catch (err) {
    alert(err.message);
  }
}

/* ============================================================
   Record lap
   ============================================================ */
async function recordLap() {
  if (!currentActivity) return;
  const tapArea = $('tapArea');
  tapArea.classList.add('pressed');
  setTimeout(() => tapArea.classList.remove('pressed'), 120);

  try {
    const lap = await api('POST', `/api/activities/${currentActivity.id}/laps`);
    if (!currentActivity.laps) currentActivity.laps = [];
    currentActivity.laps.unshift(lap);
    const count = currentActivity.laps.length;
    countDisplay.textContent = count;
    lastLap.textContent = `Last lap: ${formatTime(lap.recorded_at)}, ${formatDate(lap.recorded_at)}`;

    // update sidebar badge
    const idx = activities.findIndex(x => x.id === currentActivity.id);
    if (idx !== -1) {
      activities[idx].lap_count = count;
      renderActivityList();
    }
  } catch (err) {
    console.error(err);
  }
}

/* ============================================================
   History view
   ============================================================ */
async function openHistory() {
  if (!currentActivity) return;
  currentView = 'history';
  historyTitle.textContent = currentActivity.name;
  showSection('history');
  await refreshHistory();
}

async function refreshHistory() {
  try {
    const data = await api('GET', `/api/activities/${currentActivity.id}/laps`);
    currentActivity = { ...currentActivity, laps: data.laps };

    // Stats
    const total = data.laps.length;
    historyStats.innerHTML = `
      <span class="stat-badge">Total laps: <strong>${total}</strong></span>
    `;

    // Lap list
    lapList.innerHTML = '';
    if (total === 0) {
      noLaps.classList.remove('hidden');
      return;
    }
    noLaps.classList.add('hidden');

    data.laps.forEach((lap, i) => {
      const li = document.createElement('li');
      li.className = 'lap-item';
      li.innerHTML = `
        <span class="lap-num">#${total - i}</span>
        <span class="lap-time">${formatTime(lap.recorded_at)}</span>
        <span class="lap-date">${formatDate(lap.recorded_at)}</span>
        <button class="lap-delete" data-lap-id="${lap.id}" title="Delete lap" aria-label="Delete lap ${total - i}">✕</button>
      `;
      li.querySelector('.lap-delete').addEventListener('click', () => deleteLap(lap.id));
      lapList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

async function deleteLap(lapId) {
  if (!currentActivity) return;
  try {
    await api('DELETE', `/api/activities/${currentActivity.id}/laps/${lapId}`);
    await refreshHistory();
    // also update count in activities array
    const count = currentActivity.laps.length;
    countDisplay.textContent = count;
    const idx = activities.findIndex(x => x.id === currentActivity.id);
    if (idx !== -1) { activities[idx].lap_count = count; renderActivityList(); }
  } catch (err) {
    console.error(err);
  }
}

/* ============================================================
   Mobile sidebar
   ============================================================ */
function openSidebarMobile() {
  sidebar.classList.add('open');
  overlay.classList.remove('hidden');
}

function closeSidebarMobile() {
  sidebar.classList.remove('open');
  overlay.classList.add('hidden');
}

/* ============================================================
   Event listeners
   ============================================================ */
$('addActivityBtn').addEventListener('click', addActivity);
activityInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addActivity(); });

$('tapArea').addEventListener('click', recordLap);
$('tapArea').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); recordLap(); } });

$('viewHistoryBtn').addEventListener('click', openHistory);
$('backBtn').addEventListener('click', () => { currentView = 'counter'; showSection('counter'); });

$('menuBtn').addEventListener('click', openSidebarMobile);
$('closeSidebar').addEventListener('click', closeSidebarMobile);
overlay.addEventListener('click', closeSidebarMobile);
$('showSidebarBtn').addEventListener('click', openSidebarMobile);

/* ============================================================
   Bootstrap
   ============================================================ */
async function init() {
  try {
    activities = await api('GET', '/api/activities');
    renderActivityList();
    if (activities.length > 0) {
      selectActivity(activities[0]);
    } else {
      showSection('empty');
    }
  } catch (err) {
    console.error('Failed to load activities', err);
    showSection('empty');
  }
}

init();
