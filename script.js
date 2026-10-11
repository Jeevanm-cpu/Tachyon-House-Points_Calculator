/* ==========================================================
   TACHYON — BEYOND SPACE v2.0 · House Points Calculator
   Self-contained: no frameworks, no network calls, no build step.
   ========================================================== */

const HOUSE_NAMES = ["ALPHA", "INFER", "MATRIX", "LAYER"];
const HOUSE_META = {
  ALPHA:  { color: "var(--alpha)",  hex: "#c18aff" },
  INFER:  { color: "var(--infer)",  hex: "#3eecc0" },
  MATRIX: { color: "var(--matrix)", hex: "#71bfff" },
  LAYER:  { color: "var(--layer)",  hex: "#ffc14d" }
};

// Storage keys are unchanged from v1 so saved scores and history carry over.
const STORAGE_KEY = "tachyon-house-points-v1";
const SOUND_KEY = "tachyon-house-points-sound-v1";
const HISTORY_LIMIT = 100;
const ACTIVITY_VISIBLE = 8;

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const prefersReducedMotion = () => reducedMotionQuery.matches;
const $ = id => document.getElementById(id);

const emptyScores = () => Object.fromEntries(HOUSE_NAMES.map(name => [name, 0]));
const isValidHistoryItem = item =>
  !!item && HOUSE_NAMES.includes(item.house) &&
  Number.isSafeInteger(item.points) && item.points >= 0 && typeof item.time === "string";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.scores && typeof saved.scores === "object" && Array.isArray(saved.history)) {
      const scores = emptyScores();
      HOUSE_NAMES.forEach(name => {
        const value = Number(saved.scores[name]);
        scores[name] = Number.isSafeInteger(value) && value >= 0 ? value : 0;
      });
      return { scores, history: saved.history.filter(isValidHistoryItem).slice(0, HISTORY_LIMIT) };
    }
  } catch (error) {
    console.warn("Could not load saved scores:", error);
  }
  return { scores: emptyScores(), history: [] };
}

function readSoundPreference() {
  try {
    return localStorage.getItem(SOUND_KEY) === "true";
  } catch (error) {
    return false;
  }
}

let state = loadState();
let soundEnabled = readSoundPreference();
let audioCtx = null;
let displayedScores = { ...state.scores };
const countFrames = {};
let toastTimer = 0;
let toastHideTimer = 0;
let confettiTimer = 0;
let modalHideTimer = 0;
let modalReturnFocus = null;
let pendingConfirm = null;
let lastSoleLeader = null;
let hasRendered = false;
let previousRanks = {};
let setSceneAccent = () => {};

const cards = {};
const rows = {};

const scoreCards = $("scoreCards");
const rankingList = $("rankingList");
const activityList = $("activityList");
const winnerCallout = $("winnerCallout");
const winnerName = $("winnerName");
const winnerPoints = $("winnerPoints");
const winnerEyebrow = $("winnerEyebrow");
const formMessage = $("formMessage");
const pointsForm = $("pointsForm");
const houseSelect = $("houseSelect");
const pointsInput = $("pointsInput");
const submitButton = $("submitButton");
const soundToggle = $("soundToggle");
const winnerToast = $("winnerToast");
const winnerToastText = $("winnerToastText");
const confettiLayer = $("confettiLayer");
const confirmModal = $("confirmModal");
const confirmTitle = $("confirmTitle");
const confirmBody = $("confirmBody");
const confirmOk = $("confirmOk");
const confirmCancel = $("confirmCancel");

/* ---------- Persistence ---------- */

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    showMessage("Unable to save in this browser. Check your storage settings.", true);
    return false;
  }
}

function saveSoundPreference() {
  try {
    localStorage.setItem(SOUND_KEY, soundEnabled ? "true" : "false");
  } catch (error) {
    /* preference persistence is optional */
  }
}

/* ---------- Formatting & messages ---------- */

const numberFormat = new Intl.NumberFormat("en-IN");
const formatPoints = points => numberFormat.format(points);

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function showMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);
  formMessage.classList.add("visible");
}

function pulse(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/* ---------- Web Audio (optional, off by default) ---------- */

function getAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone({ frequency, duration = 0.12, type = "sine", gain = 0.03, slideTo }) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(gain, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + duration);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}

const playClick = () => playTone({ frequency: 720, duration: 0.05, gain: 0.018, type: "triangle" });
const playError = () => playTone({ frequency: 180, duration: 0.14, gain: 0.022, slideTo: 140 });
function playSuccess() {
  playTone({ frequency: 520, duration: 0.08, gain: 0.03 });
  setTimeout(() => playTone({ frequency: 760, duration: 0.1, gain: 0.028 }), 70);
}
function playCelebration() {
  [523, 659, 784].forEach((frequency, index) => {
    setTimeout(() => playTone({ frequency, duration: 0.12, gain: 0.03 }), index * 90);
  });
}

function updateSoundToggle() {
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  soundToggle.setAttribute("aria-label",
    soundEnabled ? "Sound is on. Disable sound effects." : "Sound is off. Enable sound effects.");
  soundToggle.querySelector(".sound-toggle-label").textContent = soundEnabled ? "Sound on" : "Sound off";
  soundToggle.querySelector(".icon-sound-on").hidden = !soundEnabled;
  soundToggle.querySelector(".icon-sound-off").hidden = soundEnabled;
}

/* ---------- Build the DOM once; update it afterwards ---------- */

function buildUI() {
  scoreCards.innerHTML = HOUSE_NAMES.map((name, index) => `
    <article class="score-card" data-house="${name}"
             style="--house-color:${HOUSE_META[name].color}; --i:${index}"
             tabindex="0" role="button" aria-pressed="false" aria-label="Select ${name}">
      <div class="house-label"><span class="house-dot" aria-hidden="true"></span>${name}</div>
      <div class="score-value">${formatPoints(state.scores[name])}</div>
      <div class="score-caption">Total points</div>
      <span class="select-tag">Selected</span>
      <span class="leader-badge">♛ Leader</span>
    </article>`).join("");

  rankingList.innerHTML = HOUSE_NAMES.map(name => `
    <div class="rank-row" data-house="${name}">
      <span class="rank-number"></span>
      <span class="rank-house">
        <span class="house-dot" style="--house-color:${HOUSE_META[name].color}"></span>
        <span>${name}</span>
        <span class="rank-crown" hidden aria-hidden="true">♛</span>
      </span>
      <span class="rank-score"></span>
    </div>`).join("");

  HOUSE_NAMES.forEach(name => {
    cards[name] = scoreCards.querySelector(`[data-house="${name}"]`);
    rows[name] = rankingList.querySelector(`[data-house="${name}"]`);
  });
}

/* ---------- Score cards ---------- */

function animateScore(name, to) {
  const el = cards[name].querySelector(".score-value");
  const from = displayedScores[name];
  cancelAnimationFrame(countFrames[name]);
  if (from === to || prefersReducedMotion()) {
    el.textContent = formatPoints(to);
    displayedScores[name] = to;
    return;
  }
  const start = performance.now();
  const duration = 420;
  const step = now => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(from + (to - from) * eased);
    displayedScores[name] = value;
    el.textContent = formatPoints(value);
    countFrames[name] = progress < 1 ? requestAnimationFrame(step) : 0;
  };
  countFrames[name] = requestAnimationFrame(step);
}

function syncSelection() {
  const selected = houseSelect.value;
  HOUSE_NAMES.forEach(name => {
    cards[name].classList.toggle("is-selected", name === selected);
    cards[name].setAttribute("aria-pressed", String(name === selected));
  });
}

function selectHouse(name) {
  if (!HOUSE_NAMES.includes(name)) return;
  houseSelect.value = name;
  syncSelection();
}

/* ---------- Rankings & leaders ---------- */

function getRanked() {
  return HOUSE_NAMES
    .map(name => ({ name, score: state.scores[name] }))
    .sort((a, b) => b.score - a.score || HOUSE_NAMES.indexOf(a.name) - HOUSE_NAMES.indexOf(b.name));
}

// Zero scores never produce a leader.
function getLeaders(ranked) {
  const highest = ranked[0].score;
  return highest === 0 ? [] : ranked.filter(house => house.score === highest);
}

function renderWinnerPanel(leaders) {
  winnerCallout.classList.toggle("has-leader", leaders.length === 1);
  winnerCallout.classList.toggle("is-tie", leaders.length > 1);

  if (leaders.length === 0) {
    winnerEyebrow.textContent = "Current leader";
    winnerName.textContent = "No winner yet";
    winnerPoints.textContent = "Award points to start the competition.";
  } else if (leaders.length > 1) {
    winnerEyebrow.textContent = "Tied for first";
    winnerName.textContent = leaders.map(h => h.name).join(" & ");
    winnerPoints.textContent = `${formatPoints(leaders[0].score)} points each`;
  } else {
    winnerEyebrow.textContent = "Current leader";
    winnerName.textContent = leaders[0].name;
    winnerPoints.textContent = `${formatPoints(leaders[0].score)} points · in the lead`;
  }
}

function flashRow(row) {
  pulse(row, "rank-up");
}

function renderRankings() {
  const ranked = getRanked();
  const reduce = prefersReducedMotion();
  const before = new Map();

  // First pass for FLIP: remember where each row sits before reordering.
  if (hasRendered && !reduce) {
    HOUSE_NAMES.forEach(name => before.set(name, rows[name].getBoundingClientRect().top));
  }

  let previousScore = null;
  let previousRank = 0;
  ranked.forEach((house, index) => {
    const rank = house.score === previousScore ? previousRank : index + 1;
    previousScore = house.score;
    previousRank = rank;

    const row = rows[house.name];
    rankingList.appendChild(row);
    const counted = house.score > 0;
    row.querySelector(".rank-number").textContent = rank;
    row.querySelector(".rank-score").innerHTML = `${formatPoints(house.score)} <small>PTS</small>`;
    row.classList.toggle("place-1", rank === 1 && counted);
    row.classList.toggle("place-2", rank === 2 && counted);
    row.classList.toggle("place-3", rank === 3 && counted);
    row.querySelector(".rank-crown").hidden = !(rank === 1 && counted);

    const oldRank = previousRanks[house.name];
    if (hasRendered && oldRank && rank < oldRank && counted) flashRow(row);
    previousRanks[house.name] = rank;
  });

  // Second pass for FLIP: animate each row from its old position to its new one.
  if (hasRendered && !reduce) {
    HOUSE_NAMES.forEach(name => {
      const row = rows[name];
      const dy = before.get(name) - row.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      row.style.transition = "none";
      row.style.transform = `translateY(${dy}px)`;
      void row.offsetWidth;
      row.style.transition = "";
      row.style.transform = "";
    });
  }

  const leaders = getLeaders(ranked);
  renderWinnerPanel(leaders);

  HOUSE_NAMES.forEach(name => {
    const isLeader = leaders.some(leader => leader.name === name);
    const tied = leaders.length > 1 && isLeader;
    cards[name].classList.toggle("is-leader", isLeader);
    const badge = cards[name].querySelector(".leader-badge");
    badge.textContent = tied ? "♛ Tied" : "♛ Leader";
    badge.classList.toggle("tied", tied);
  });

  // Celebrate only when a new sole leader emerges, never on unrelated rerenders.
  const sole = leaders.length === 1 ? leaders[0].name : null;
  const newSoleLeader = hasRendered && sole && sole !== lastSoleLeader;
  lastSoleLeader = sole;
  hasRendered = true;
  if (newSoleLeader) celebrateWinner(sole);
}

/* ---------- Celebration ---------- */

function celebrateWinner(house) {
  setSceneAccent(HOUSE_META[house].hex);
  pulse(cards[house], "celebrate");
  pulse(winnerCallout, "celebrate");
  winnerToastText.textContent = `${house} takes the lead`;
  showToast();
  burstConfetti(HOUSE_META[house].hex);
  playCelebration();
}

function showToast() {
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  winnerToast.hidden = false;
  requestAnimationFrame(() => winnerToast.classList.add("visible"));
  toastTimer = setTimeout(() => {
    winnerToast.classList.remove("visible");
    toastHideTimer = setTimeout(() => { winnerToast.hidden = true; }, 300);
  }, 2400);
}

function burstConfetti(color) {
  if (prefersReducedMotion()) return;
  confettiLayer.innerHTML = "";
  const colors = [color, "#ffffff", HOUSE_META.LAYER.hex, HOUSE_META.INFER.hex];
  for (let i = 0; i < 18; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${48 + (Math.random() - 0.5) * 20}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 280}px`);
    piece.style.setProperty("--dy", `${80 + Math.random() * 180}px`);
    piece.style.setProperty("--rot", `${(Math.random() - 0.5) * 360}deg`);
    piece.style.animationDelay = `${Math.random() * 80}ms`;
    confettiLayer.appendChild(piece);
  }
  clearTimeout(confettiTimer);
  confettiTimer = setTimeout(() => { confettiLayer.innerHTML = ""; }, 1100);
}

/* ---------- Activity log ---------- */

function renderActivity(animateFirst = false) {
  if (state.history.length === 0) {
    activityList.innerHTML = `
      <div class="empty-state">
        <strong>Waiting for the first score</strong>
        No activity yet. Add points to see updates here.
      </div>`;
    return;
  }
  activityList.innerHTML = state.history.slice(0, ACTIVITY_VISIBLE).map((item, index) => `
    <div class="activity-item${animateFirst && index === 0 ? " enter" : ""}"
         style="--house-color:${HOUSE_META[item.house].color}">
      <div class="activity-left">
        <span class="activity-symbol" aria-hidden="true">+</span>
        <div>
          <p class="activity-title">${escapeHTML(item.house)} received points</p>
          <p class="activity-time">${escapeHTML(item.time)}</p>
        </div>
      </div>
      <div class="activity-points">+${formatPoints(item.points)} PTS</div>
    </div>`).join("");
}

/* ---------- Render orchestration ---------- */

function render(options = {}) {
  HOUSE_NAMES.forEach(name => animateScore(name, state.scores[name]));
  if (options.highlightHouse) pulse(cards[options.highlightHouse], "score-flash");
  syncSelection();
  renderRankings();
  renderActivity(options.animateActivity);
}

/* ---------- Score entry ---------- */

function clearInvalid() {
  pointsInput.parentElement.classList.remove("is-invalid");
  houseSelect.classList.remove("is-invalid");
}

function rejectEntry(message) {
  showMessage(message, true);
  clearInvalid();
  pulse(pointsInput.parentElement, "is-invalid");
  if (!HOUSE_NAMES.includes(houseSelect.value)) houseSelect.classList.add("is-invalid");
  playError();
  pointsInput.focus();
}

function handleSubmit(event) {
  event.preventDefault();
  const house = houseSelect.value;
  const raw = pointsInput.value.trim();

  if (!HOUSE_NAMES.includes(house)) return rejectEntry("Please select a valid house.");
  if (raw === "") return rejectEntry("Enter the points earned.");
  if (!/^\d+$/.test(raw)) return rejectEntry("Enter a whole number of zero or more.");

  const points = Number(raw);
  if (!Number.isSafeInteger(points) || !Number.isSafeInteger(state.scores[house] + points)) {
    return rejectEntry("That total is too large. Enter a smaller number.");
  }

  state.scores[house] += points;
  state.history.unshift({ house, points, time: new Date().toLocaleString() });
  state.history = state.history.slice(0, HISTORY_LIMIT);
  clearInvalid();

  if (saveState()) {
    showMessage(`${formatPoints(points)} points added to ${house}.`);
    playSuccess();
  }
  render({ highlightHouse: house, animateActivity: true });
  pointsInput.value = "";
  pulse(submitButton, "is-success");
  pointsInput.focus();
}

/* ---------- Confirmation modal (keyboard-operable) ---------- */

function openModal({ title, body, confirmLabel, onConfirm }) {
  modalReturnFocus = document.activeElement;
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmOk.textContent = confirmLabel;
  pendingConfirm = onConfirm;
  clearTimeout(modalHideTimer);
  confirmModal.hidden = false;
  requestAnimationFrame(() => confirmModal.classList.add("open"));
  confirmCancel.focus(); // Safer default for destructive actions.
}

function closeModal() {
  pendingConfirm = null;
  confirmModal.classList.remove("open");
  clearTimeout(modalHideTimer);
  modalHideTimer = setTimeout(() => {
    if (!confirmModal.classList.contains("open")) confirmModal.hidden = true;
  }, 220);
  if (modalReturnFocus && modalReturnFocus.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
}

function trapModalFocus(event) {
  const focusables = [confirmCancel, confirmOk];
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- Sound toggle ---------- */

function toggleSound() {
  soundEnabled = !soundEnabled;
  saveSoundPreference();
  updateSoundToggle();
  if (soundEnabled) playClick();
}

/* ---------- Event wiring (bound once) ---------- */

function bindEvents() {
  scoreCards.addEventListener("click", event => {
    const card = event.target.closest(".score-card");
    if (!card) return;
    playClick();
    selectHouse(card.dataset.house);
    pointsInput.focus();
  });

  scoreCards.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".score-card");
    if (!card) return;
    event.preventDefault();
    selectHouse(card.dataset.house);
    pointsInput.focus();
  });

  houseSelect.addEventListener("change", syncSelection);
  pointsInput.addEventListener("input", clearInvalid);
  pointsForm.addEventListener("submit", handleSubmit);
  soundToggle.addEventListener("click", toggleSound);

  $("resetButton").addEventListener("click", () => {
    playClick();
    openModal({
      title: "Reset all scores?",
      body: "This resets all four house scores to zero and clears the activity history. It cannot be undone.",
      confirmLabel: "Reset scores",
      onConfirm: () => {
        state = { scores: emptyScores(), history: [] };
        saveState();
        render();
        showMessage("All scores have been reset.");
      }
    });
  });

  $("clearHistoryButton").addEventListener("click", () => {
    playClick();
    if (!state.history.length) {
      showMessage("The activity history is already empty.");
      return;
    }
    openModal({
      title: "Clear activity history?",
      body: "This removes the activity log only. House scores stay the same.",
      confirmLabel: "Clear history",
      onConfirm: () => {
        state.history = [];
        saveState();
        renderActivity();
        showMessage("Activity history cleared. Scores are unchanged.");
      }
    });
  });

  confirmCancel.addEventListener("click", () => {
    playClick();
    closeModal();
  });

  confirmOk.addEventListener("click", () => {
    const action = pendingConfirm;
    playClick();
    closeModal();
    if (typeof action === "function") action();
  });

  confirmModal.addEventListener("click", event => {
    if (event.target === confirmModal) closeModal();
  });

  document.addEventListener("keydown", event => {
    if (!confirmModal.classList.contains("open")) return;
    if (event.key === "Escape") closeModal();
    if (event.key === "Tab") trapModalFocus(event);
  });
}

/* ---------- Cosmic WebGL scene (self-contained shader) ---------- */

const SCENE_VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const SCENE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uMotion;
uniform vec3 uAccent;

#define PI 3.14159265
#define RS 1.0          // Schwarzschild radius (scene units)
#define R_INNER 2.8     // inner disk edge (near ISCO)
#define R_OUTER 8.0     // outer disk edge
#define MAX_STEPS 220

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.3, 7.1);
    a *= 0.5;
  }
  return v;
}

// Hot inner gas is white-blue, cooling outward through amber to deep red.
vec3 diskRamp(float x) {
  vec3 hot = vec3(0.92, 0.90, 1.0);
  vec3 mid = vec3(1.0, 0.56, 0.22);
  vec3 cool = vec3(0.70, 0.20, 0.06);
  return x < 0.5 ? mix(hot, mid, x * 2.0) : mix(mid, cool, (x - 0.5) * 2.0);
}

// Single point-star layer: each grid cell holds at most one star.
float starPoints(vec2 g, float density, float size) {
  vec2 c = floor(g);
  vec2 f = fract(g);
  float h = hash(c);
  if (h < density) return 0.0;
  vec2 off = vec2(hash(c + 1.7), hash(c + 9.2)) * 0.6 + 0.2;
  float b = smoothstep(size, 0.0, length(f - off));
  return b * (h - density) / (1.0 - density) * (0.5 + 0.5 * hash(c + 4.4));
}

vec3 starfield(vec3 d, float t) {
  vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  vec2 g = (sph + vec2(PI, PI * 0.5)) * 34.0;
  float far = starPoints(g, 0.982, 0.14);
  float near = starPoints(g * 2.3 + 17.0, 0.994, 0.08);
  float tw = 0.8 + 0.2 * sin(t * 1.6 + hash(floor(g)) * 40.0);
  return vec3(0.75, 0.84, 1.0) * (far * tw * 0.9 + near * 0.9);
}

vec3 nebula(vec3 d, float t) {
  float n1 = fbm(d.xy * 2.2 + d.z * 1.3 + vec2(t * 0.004, 0.0));
  float n2 = fbm(d.yz * 3.1 + vec2(4.0, -t * 0.003));
  float neb = smoothstep(0.45, 0.9, n1) * 0.5 + smoothstep(0.55, 0.95, n2) * 0.25;
  vec3 c = mix(vec3(0.32, 0.20, 0.62), vec3(0.85, 0.40, 0.70), n2);
  c = mix(c, uAccent, 0.15);
  return c * neb * 0.20;
}

// Emission from the spinning accretion disk at hit point Ph.
vec3 diskEmission(vec3 Ph, vec3 Vr, vec3 n, vec3 e1, vec3 e2, float rh, float t) {
  float phi = atan(dot(Ph, e2), dot(Ph, e1));
  // Keplerian differential rotation: inner gas orbits faster.
  float omega = 0.9 * pow(rh, -1.5);
  float th = phi - t * omega;

  // Turbulent, spiral-banded structure sampled in a rotating polar frame (no seam).
  vec2 q = vec2(cos(th), sin(th)) * rh * 0.9;
  float turb = fbm(q * 1.3 + vec2(rh * 0.7, 0.0));
  float streak = fbm(vec2(cos(2.0 * th), sin(2.0 * th)) * rh * 0.5 + 3.0);
  float bands = 0.75 + 0.25 * sin(log(rh) * 22.0);
  float density = (0.30 + 0.70 * turb) * (0.6 + 0.4 * streak) * bands;

  // Temperature and flux fall off with radius.
  float x = R_INNER / rh;
  float temp = pow(x, 0.75);
  float flux = pow(x, 2.5) * (1.0 - 0.6 * sqrt(x));
  vec3 color = diskRamp(clamp(1.0 - temp, 0.0, 1.0));

  // Relativistic Doppler beaming: the side moving toward us is brighter.
  vec3 vdir = normalize(cross(n, Ph));
  float v = min(0.75, sqrt(0.5 / (rh - 1.0)));
  float los = dot(vdir, -Vr);
  float g = clamp(1.0 + 0.85 * v * los, 0.25, 2.2);
  float beam = g * g * g;

  // Gravitational redshift dims the gas close to the horizon.
  float grav = sqrt(max(0.0, 1.0 - RS / rh));

  return color * flux * density * beam * grav * 4.5;
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  float t = uTime * uMotion;

  // Camera slowly orbits the hole; the pointer steers it.
  float yaw = t * 0.035 + (uPointer.x - 0.5) * 1.2;
  float pitch = 0.26 + (uPointer.y - 0.5) * 0.35 + sin(t * 0.09) * 0.02;
  float D = 9.0;
  vec3 camPos = D * vec3(cos(pitch) * sin(yaw), sin(pitch), cos(pitch) * cos(yaw));
  vec3 fwd = normalize(-camPos);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  float k = 0.62;
  vec3 V = normalize(fwd + (uv.x * aspect * right + uv.y * up) * k);
  vec3 P = camPos;

  // Spin axis with a slight precession.
  vec3 n = normalize(vec3(0.10 * sin(t * 0.13), 1.0, 0.10 * cos(t * 0.11)));
  vec3 e1 = normalize(cross(n, vec3(0.0, 0.0, 1.0)));
  vec3 e2 = cross(n, e1);

  // Trace each light ray through curved spacetime (weak-field Schwarzschild bending).
  vec3 col = vec3(0.0);
  float trans = 1.0;
  float minR = 1e3;
  float prevS = dot(P, n);
  bool captured = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(P);
    minR = min(minR, r);
    if (r < 0.985) { captured = true; break; }
    if (r > 40.0 && dot(P, V) > 0.0) break;

    float dt = clamp(0.035 * r, 0.02, 0.22);
    vec3 L = cross(P, V);
    vec3 acc = -1.5 * RS * dot(L, L) * P / pow(r, 5.0);
    vec3 Pn = P + V * dt;
    V = normalize(V + acc * dt);

    // Crossing the disk plane: sample emission at the exact hit point.
    float s = dot(Pn, n);
    if (prevS * s < 0.0 && trans > 0.01) {
      float f = prevS / (prevS - s);
      vec3 Ph = mix(P, Pn, f);
      float rh = length(Ph);
      if (rh > R_INNER && rh < R_OUTER) {
        col += trans * diskEmission(Ph, V, n, e1, e2, rh, t);
        trans *= 0.38;
      }
    }
    prevS = s;
    P = Pn;
  }

  // Rays that escape see the lensed starfield and nebula behind the hole.
  if (!captured) {
    col += trans * (nebula(V, t) + starfield(V, t));
  }

  // Photon ring: rays grazing the photon sphere form a thin, bright loop.
  float ring = exp(-pow((minR - 1.55) / 0.09, 2.0));
  col += trans * mix(vec3(1.0, 0.92, 0.78), uAccent, 0.3) * ring * 1.2;

  // Tone map and output. The event horizon region is opaque black.
  col = 1.0 - exp(-col * 1.0);
  float alpha = captured ? 1.0 : clamp(max(max(col.r, col.g), col.b) * 1.15, 0.0, 1.0);
  gl_FragColor = vec4(captured ? vec3(0.0) : col, alpha);
}
`;

function buildProgram(gl) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("Scene shader failed:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, SCENE_VERT);
  const fs = compile(gl.FRAGMENT_SHADER, SCENE_FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("Scene program failed to link:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function initScene() {
  const canvas = $("blackHoleCanvas");
  const scene = $("blackHoleScene");
  const hero = $("heroSection");
  const coords = $("cosmicCoordinates");
  const fallback = () => scene.classList.add("webgl-unavailable");

  const gl = canvas.getContext("webgl", {
    alpha: true, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, powerPreference: "low-power"
  });
  if (!gl) return fallback();
  const program = buildProgram(gl);
  if (!program) return fallback();

  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    pointer: gl.getUniformLocation(program, "uPointer"),
    time: gl.getUniformLocation(program, "uTime"),
    motion: gl.getUniformLocation(program, "uMotion"),
    accent: gl.getUniformLocation(program, "uAccent")
  };

  const pointer = { x: 0.5, y: 0.5 };
  const target = { x: 0.5, y: 0.5 };
  let accent = [0.76, 0.54, 1.0];
  let accentTarget = [...accent];
  const startTime = performance.now();
  let raf = 0;
  let lastFrame = 0;
  let visible = !document.hidden;

  function resize() {
    const rect = scene.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.resolution, w, h);
    }
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;
    // Cap to roughly 33 fps when motion is on: smooth on laptops, lighter on GPU.
    if (!prefersReducedMotion() && now - lastFrame < 30) {
      raf = requestAnimationFrame(frame);
      return;
    }
    lastFrame = now;
    resize();
    const ease = prefersReducedMotion() ? 1 : 0.05;
    pointer.x += (target.x - pointer.x) * ease;
    pointer.y += (target.y - pointer.y) * ease;
    accent = accent.map((v, i) => v + (accentTarget[i] - v) * 0.03);

    gl.uniform2f(u.pointer, pointer.x, pointer.y);
    gl.uniform1f(u.time, prefersReducedMotion() ? 0 : (now - startTime) / 1000);
    gl.uniform1f(u.motion, prefersReducedMotion() ? 0 : 1);
    gl.uniform3f(u.accent, accent[0], accent[1], accent[2]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (!prefersReducedMotion()) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  hero.addEventListener("pointermove", event => {
    const rect = hero.getBoundingClientRect();
    target.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    target.y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    coords.textContent = `X ${(target.x * 100).toFixed(1)} · Y ${(target.y * 100).toFixed(1)}`;
    wake();
  }, { passive: true });

  hero.addEventListener("pointerleave", () => {
    target.x = 0.5;
    target.y = 0.5;
    wake();
  }, { passive: true });

  setSceneAccent = hex => {
    const n = parseInt(hex.replace("#", ""), 16);
    accentTarget = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    scene.classList.remove("gravity-shift");
    void scene.offsetWidth;
    scene.classList.add("gravity-shift");
    wake();
  };

  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible) wake();
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  });

  reducedMotionQuery.addEventListener?.("change", () => {
    cancelAnimationFrame(raf);
    raf = 0;
    wake();
  });

  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
    fallback();
  });

  window.addEventListener("resize", wake, { passive: true });
  resize();
  wake();
}

/* ---------- Pointer effects: sheen everywhere, tilt on fine pointers only ---------- */

function initPointerEffects() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches || prefersReducedMotion()) return;

  const SELECTOR = ".score-card, .panel, .rank-row, .activity-item";
  let current = null;
  let tiltFrame = 0;
  let tiltTarget = null;

  function release(el) {
    if (!el) return;
    if (el.classList.contains("score-card")) el.style.removeProperty("transform");
    if (tiltTarget && tiltTarget.el === el) tiltTarget = null;
  }

  function applyTilt() {
    tiltFrame = 0;
    if (!tiltTarget) return;
    const { el, px, py } = tiltTarget;
    el.style.transform =
      `perspective(900px) translateY(-8px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg)`;
    tiltTarget = null;
  }

  document.addEventListener("pointermove", event => {
    const el = event.target.closest(SELECTOR);
    if (current && current !== el) release(current);
    current = el;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    el.style.setProperty("--px", `${x}px`);
    el.style.setProperty("--py", `${y}px`);

    if (el.classList.contains("score-card")) {
      tiltTarget = { el, px: x / rect.width - 0.5, py: y / rect.height - 0.5 };
      if (!tiltFrame) tiltFrame = requestAnimationFrame(applyTilt);
    }
  }, { passive: true });

  // Leaving the window clears any active tilt so cards never stick.
  document.documentElement.addEventListener("mouseleave", () => {
    release(current);
    current = null;
  });
}

/* ---------- Boot ---------- */

buildUI();
bindEvents();
updateSoundToggle();
render();
selectHouse(houseSelect.value);
syncSelection();
initScene();
initPointerEffects();
