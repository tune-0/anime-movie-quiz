/* =========================================================
   APP — state management and rendering.
   This is the only module that touches the DOM.
   ========================================================= */

import { TRAIT_KEYS, QUESTIONS } from "./data.js";
import {
  createEmptyVector,
  addVectorInPlace,
  subtractVectorInPlace,
  getTopMatches,
  getTopMatchingTraits,
  normalizeVectorTo100,
  formatKindLabel
} from "./engine.js";
import { fetchTitlesForKinds } from "./api.js";

const RESULT_COUNT = 5;
const CANDIDATE_POOL_SIZE = 20;
const REROLL_THRESHOLD = 0.05; // stay within 5% of the top score
const FAVORITES_KEY = "screeningRoomFavorites";
const HISTORY_KEY = "screeningRoomHistory";
const HISTORY_LIMIT = 10;
const THEME_KEY = "screeningRoomTheme";

// Which step of the overall flow each screen represents.
// null means "don't highlight a step" (utility screens).
const SCREEN_TO_STEP = {
  category: 0,
  loading: 1,
  quiz: 1,
  result: 2,
  favorites: null,
  history: null,
  error: null
};

const state = {
  screen: "category",
  selectedKinds: new Set(),
  questionIndex: 0,
  userVector: createEmptyVector(),
  answerHistory: [],
  categoryError: false,
  titlePool: [],
  loadError: null,
  rankedMatches: [],
  resultIndex: 0,
  favoritesFilter: { query: "", kind: "all", sort: "recent" }
};

/* --- Small helpers --- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function formatShortDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* --- Favorites: persisted in the browser's localStorage --- */

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
}

function saveFavoritesList(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

function isFavorite(title) {
  return loadFavorites().some(f => f.name === title.name && f.kind === title.kind);
}

function toggleFavorite(title) {
  const favorites = loadFavorites();
  const index = favorites.findIndex(f => f.name === title.name && f.kind === title.kind);
  if (index >= 0) {
    favorites.splice(index, 1);
  } else {
    favorites.push({
      name: title.name,
      kind: title.kind,
      blurb: title.blurb,
      posterUrl: title.posterUrl
    });
  }
  saveFavoritesList(favorites);
}

function getFilteredFavorites() {
  let list = loadFavorites();
  const { query, kind, sort } = state.favoritesFilter;

  if (kind !== "all") {
    list = list.filter(f => f.kind === kind);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    list = list.filter(f => f.name.toLowerCase().includes(q));
  }

  if (sort === "recent") list = [...list].reverse();
  else if (sort === "alpha") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "kind") list = [...list].sort((a, b) => a.kind.localeCompare(b.kind));

  return list;
}

/* --- History: last few completed quiz results --- */

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistoryList(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function addToHistory(topMatch) {
  const history = loadHistory();
  history.unshift({
    title: topMatch.title,
    score: topMatch.score,
    timestamp: Date.now()
  });
  saveHistoryList(history.slice(0, HISTORY_LIMIT));
}

/* --- Theme: persisted in localStorage --- */

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

function applyTheme(theme) {
  document.body.classList.toggle("light-theme", theme === "light");
  localStorage.setItem(THEME_KEY, theme);
  updateThemeIcon();
}

function toggleTheme() {
  applyTheme(loadTheme() === "dark" ? "light" : "dark");
}

function updateThemeIcon() {
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) btn.textContent = document.body.classList.contains("light-theme") ? "☀️" : "🌙";
}

/* --- State transitions --- */

function resetQuiz() {
  state.screen = "category";
  state.selectedKinds = new Set();
  state.questionIndex = 0;
  state.userVector = createEmptyVector();
  state.answerHistory = [];
  state.categoryError = false;
  state.titlePool = [];
  state.loadError = null;
  state.rankedMatches = [];
  state.resultIndex = 0;
  render();
}

function resetProgressOnly() {
  state.questionIndex = 0;
  state.userVector = createEmptyVector();
  state.answerHistory = [];
}

function goBackOneStep() {
  if (state.questionIndex === 0) {
    resetProgressOnly();
    state.titlePool = [];
    state.screen = "category";
    render();
    return;
  }

  const lastDelta = state.answerHistory.pop();
  subtractVectorInPlace(state.userVector, lastDelta);
  state.questionIndex -= 1;
  render();
}

async function loadTitlesAndStartQuiz() {
  state.screen = "loading";
  resetProgressOnly();
  render();

  try {
    state.titlePool = await fetchTitlesForKinds([...state.selectedKinds]);
    state.screen = "quiz";
    render();
  } catch (err) {
    state.loadError = err.message || "Something went wrong fetching titles.";
    state.screen = "error";
    render();
  }
}

function enterResultScreen() {
  state.rankedMatches = getTopMatches(state.userVector, state.titlePool, [...state.selectedKinds], CANDIDATE_POOL_SIZE);
  state.resultIndex = 0;
  state.screen = "result";
  addToHistory(state.rankedMatches[0]);
}

function rerollResult() {
  const ranked = state.rankedMatches;
  if (ranked.length <= 1) return;

  const topScore = ranked[0].score;
  const closeIndices = ranked
    .map((_, i) => i)
    .filter(i => i !== state.resultIndex && (topScore - ranked[i].score) <= topScore * REROLL_THRESHOLD);

  const pool = closeIndices.length > 0
    ? closeIndices
    : ranked.map((_, i) => i).filter(i => i !== state.resultIndex);

  state.resultIndex = pool[Math.floor(Math.random() * pool.length)];
  render();
}

/* --- Navbar + stepper: persistent chrome outside #screen --- */

function updateNavbarBadge() {
  const badge = document.getElementById("saved-badge");
  if (badge) {
    const count = loadFavorites().length;
    badge.textContent = count > 0 ? String(count) : "";
  }
}

function renderStepper() {
  const stepperEl = document.getElementById("stepper");
  if (!stepperEl) return;

  const activeStep = SCREEN_TO_STEP[state.screen];
  if (activeStep === null || activeStep === undefined) {
    stepperEl.innerHTML = "";
    return;
  }

  const labels = ["Category", "Quiz", "Result"];
  let html = "";
  labels.forEach((label, i) => {
    html += `
      <div class="step-dot-group">
        <span class="step-dot ${i <= activeStep ? "filled" : ""}"></span>
        <span class="step-dot-label">${label}</span>
      </div>
    `;
    if (i < labels.length - 1) {
      html += `<span class="step-connector ${i < activeStep ? "filled" : ""}"></span>`;
    }
  });
  stepperEl.innerHTML = html;
}

function setupNavbar() {
  document.getElementById("navbar-home-btn").addEventListener("click", resetQuiz);
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);
  document.getElementById("nav-history-btn").addEventListener("click", () => {
    state.screen = "history";
    render();
  });
  document.getElementById("nav-saved-btn").addEventListener("click", () => {
    state.screen = "favorites";
    render();
  });
}

/* --- Rendering: one function per screen --- */

const screenEl = document.getElementById("screen");

function render() {
  updateNavbarBadge();
  renderStepper();

  if (state.screen === "category") return renderCategoryScreen();
  if (state.screen === "loading") return renderLoadingScreen();
  if (state.screen === "quiz") return renderQuizScreen();
  if (state.screen === "result") return renderResultScreen();
  if (state.screen === "error") return renderErrorScreen();
  if (state.screen === "favorites") return renderFavoritesScreen();
  if (state.screen === "history") return renderHistoryScreen();
}

function renderCategoryScreen() {
  const options = [
    { value: "anime", label: "Anime" },
    { value: "movie", label: "Movies" },
    { value: "kdrama", label: "K-drama" }
  ];

  screenEl.innerHTML = `
    <div class="card screen-transition">
      <h2 class="question">What are you in the mood to watch?</h2>
      <p class="hint-text">Pick one or more.</p>
      <div class="chip-row" id="chip-row">
        ${options.map(opt => `
          <button class="chip ${state.selectedKinds.has(opt.value) ? "selected" : ""}" data-value="${opt.value}">
            ${opt.label}
          </button>
        `).join("")}
      </div>
      ${state.categoryError ? `<p class="error-text" role="alert">Pick at least one category to continue.</p>` : ""}
      <button class="primary" id="start-btn">Start the quiz</button>
    </div>
  `;

  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const value = chip.getAttribute("data-value");
      if (state.selectedKinds.has(value)) {
        state.selectedKinds.delete(value);
      } else {
        state.selectedKinds.add(value);
      }
      state.categoryError = false;
      render();
    });
  });

  document.getElementById("start-btn").addEventListener("click", () => {
    if (state.selectedKinds.size === 0) {
      state.categoryError = true;
      render();
      return;
    }
    loadTitlesAndStartQuiz();
  });
}

function renderLoadingScreen() {
  screenEl.innerHTML = `
    <div class="card loading-card screen-transition">
      <div class="spinner" aria-hidden="true"></div>
      <p class="loading-text">Pulling in titles…</p>
    </div>
  `;
}

function renderErrorScreen() {
  screenEl.innerHTML = `
    <div class="card screen-transition">
      <p class="step-label">Something went wrong</p>
      <h2 class="question">Couldn't load titles.</h2>
      <p class="hint-text" role="alert" style="margin-top:-8px;">${state.loadError}</p>
      <button class="primary" id="retry-load-btn">Try again</button>
      <button class="ghost" id="error-back-btn">Back to categories</button>
    </div>
  `;

  document.getElementById("retry-load-btn").addEventListener("click", loadTitlesAndStartQuiz);
  document.getElementById("error-back-btn").addEventListener("click", resetQuiz);
}

function renderQuizScreen() {
  const question = QUESTIONS[state.questionIndex];
  const progressPct = Math.round((state.questionIndex / QUESTIONS.length) * 100);

  screenEl.innerHTML = `
    <div class="card screen-transition">
      <div class="quiz-header">
        <button class="back-link" id="back-link-btn" aria-label="Go back">← Back</button>
        <p class="step-label">Question ${state.questionIndex + 1} of ${QUESTIONS.length}</p>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${progressPct}%"></div>
      </div>
      <h2 class="question">${question.prompt}</h2>
      <div class="option-list">
        ${question.options.map((opt, i) => `
          <button class="option-btn" data-index="${i}">${opt.text}</button>
        `).join("")}
      </div>
    </div>
  `;

  document.getElementById("back-link-btn").addEventListener("click", goBackOneStep);

  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const optionIndex = parseInt(btn.getAttribute("data-index"), 10);
      const chosenOption = question.options[optionIndex];

      state.answerHistory.push(chosenOption.delta);
      addVectorInPlace(state.userVector, chosenOption.delta);

      if (state.questionIndex < QUESTIONS.length - 1) {
        state.questionIndex += 1;
        render();
      } else {
        enterResultScreen();
        render();
      }
    });
  });
}

function renderResultScreen() {
  const top = state.rankedMatches[state.resultIndex];
  const runnersUp = state.rankedMatches
    .filter((_, i) => i !== state.resultIndex)
    .slice(0, RESULT_COUNT - 1);

  const normalizedTop = normalizeVectorTo100(top.title.vector);
  const matchPercent = Math.round(top.score * 100);
  const topTraits = getTopMatchingTraits(state.userVector, top.title.vector, 2);
  const favorited = isFavorite(top.title);
  const canReroll = state.rankedMatches.length > 1;

  screenEl.innerHTML = `
    <div class="ticket screen-transition">
      <div class="ticket-top">
        <button class="star-btn" id="star-btn" aria-label="${favorited ? "Remove from saved" : "Save this pick"}">
          ${favorited ? "★" : "☆"}
        </button>
        ${top.title.posterUrl ? `<img class="ticket-poster" src="${top.title.posterUrl}" alt="${escapeHtml(top.title.name)} poster" />` : ""}
        <p class="ticket-eyebrow">Your match — ${matchPercent}% fit</p>
        <p class="ticket-title">${top.title.name}</p>
        <p class="ticket-kind">${formatKindLabel(top.title.kind)}</p>
        ${topTraits.length ? `<p class="match-reason">Matched mostly on ${topTraits.join(" + ")}</p>` : ""}
      </div>
      <div class="ticket-perf"></div>
      <div class="ticket-bottom">
        <p class="ticket-blurb">${top.title.blurb}</p>

        <div class="traits">
          ${TRAIT_KEYS.map(key => `
            <div class="trait-row">
              <div class="trait-name"><span>${key}</span><span>${normalizedTop[key]}</span></div>
              <div class="trait-bar-track">
                <div class="trait-bar-fill" style="width:${normalizedTop[key]}%"></div>
              </div>
            </div>
          `).join("")}
        </div>

        ${runnersUp.length ? `
          <div class="runners">
            <p class="label">Also worth a watch</p>
            ${runnersUp.map(m => `
              <div class="runner-item">
                <span>${m.title.name} <span class="runner-kind">(${formatKindLabel(m.title.kind)})</span></span>
                <span>${Math.round(m.score * 100)}%</span>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="ticket-actions">
          ${canReroll ? `<button class="ghost" id="reroll-btn">🎲 Show another close match</button>` : ""}
          <button class="ghost" id="share-btn">Copy to share</button>
        </div>
      </div>
    </div>
    <button class="ghost" id="retry-btn">Take the quiz again</button>
  `;

  document.getElementById("star-btn").addEventListener("click", () => {
    toggleFavorite(top.title);
    render();
  });

  if (canReroll) {
    document.getElementById("reroll-btn").addEventListener("click", rerollResult);
  }

  document.getElementById("share-btn").addEventListener("click", async (event) => {
    const shareText = `My Screening Room match: ${top.title.name} (${formatKindLabel(top.title.kind)}) — ${matchPercent}% fit. Find yours!`;
    const button = event.currentTarget;
    const originalLabel = button.textContent;
    try {
      await navigator.clipboard.writeText(shareText);
      button.textContent = "Copied!";
    } catch (err) {
      button.textContent = "Couldn't copy";
    }
    setTimeout(() => { button.textContent = originalLabel; }, 1500);
  });

  document.getElementById("retry-btn").addEventListener("click", resetQuiz);
}

function renderFavoritesScreen() {
  const filtered = getFilteredFavorites();
  const totalCount = loadFavorites().length;
  const { query, kind, sort } = state.favoritesFilter;

  screenEl.innerHTML = `
    <div class="card screen-transition">
      <p class="step-label">Saved</p>
      <h2 class="question">Your saved picks</h2>

      ${totalCount > 0 ? `
        <div class="filter-row">
          <input type="text" id="fav-search-input" class="filter-input" placeholder="Search saved titles…" value="${escapeHtml(query)}" />
          <select id="fav-kind-select" class="filter-select">
            <option value="all" ${kind === "all" ? "selected" : ""}>All kinds</option>
            <option value="anime" ${kind === "anime" ? "selected" : ""}>Anime</option>
            <option value="movie" ${kind === "movie" ? "selected" : ""}>Movies</option>
            <option value="kdrama" ${kind === "kdrama" ? "selected" : ""}>K-drama</option>
          </select>
          <select id="fav-sort-select" class="filter-select">
            <option value="recent" ${sort === "recent" ? "selected" : ""}>Recently added</option>
            <option value="alpha" ${sort === "alpha" ? "selected" : ""}>A–Z</option>
            <option value="kind" ${sort === "kind" ? "selected" : ""}>By kind</option>
          </select>
        </div>
      ` : ""}

      ${filtered.length === 0
      ? `<p class="hint-text">${totalCount === 0 ? "Nothing saved yet — star a result to keep it here." : "No saved titles match your filters."}</p>`
      : `
          <div class="list">
            ${filtered.map((fav, i) => `
              <div class="list-item">
                ${fav.posterUrl ? `<img class="list-item-poster" src="${fav.posterUrl}" alt="${escapeHtml(fav.name)} poster" />` : ""}
                <div class="list-item-info">
                  <p class="list-item-name">${fav.name}</p>
                  <p class="list-item-meta">${formatKindLabel(fav.kind)}</p>
                </div>
                <button class="list-item-action" data-index="${i}" aria-label="Remove ${escapeHtml(fav.name)} from saved">✕</button>
              </div>
            `).join("")}
          </div>
        `}
      <button class="ghost" id="back-to-category-btn">Back</button>
    </div>
  `;

  const searchInput = document.getElementById("fav-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.favoritesFilter.query = e.target.value;
      const cursorPos = e.target.selectionStart;
      render();
      const newInput = document.getElementById("fav-search-input");
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }

  const kindSelect = document.getElementById("fav-kind-select");
  if (kindSelect) {
    kindSelect.addEventListener("change", (e) => {
      state.favoritesFilter.kind = e.target.value;
      render();
    });
  }

  const sortSelect = document.getElementById("fav-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      state.favoritesFilter.sort = e.target.value;
      render();
    });
  }

  document.querySelectorAll(".list-item-action").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-index"), 10);
      const target = filtered[index];
      const current = loadFavorites().filter(f => !(f.name === target.name && f.kind === target.kind));
      saveFavoritesList(current);
      render();
    });
  });

  document.getElementById("back-to-category-btn").addEventListener("click", () => {
    state.screen = "category";
    render();
  });
}

function renderHistoryScreen() {
  const history = loadHistory();

  screenEl.innerHTML = `
    <div class="card screen-transition">
      <p class="step-label">History</p>
      <h2 class="question">Past matches</h2>
      ${history.length === 0
      ? `<p class="hint-text">No quiz history yet — take the quiz to start building one.</p>`
      : `
          <div class="list">
            ${history.map((entry, i) => `
              <div class="list-item">
                ${entry.title.posterUrl ? `<img class="list-item-poster" src="${entry.title.posterUrl}" alt="${escapeHtml(entry.title.name)} poster" />` : ""}
                <div class="list-item-info">
                  <p class="list-item-name">${entry.title.name}</p>
                  <p class="list-item-meta">${formatKindLabel(entry.title.kind)} · ${Math.round(entry.score * 100)}% · ${formatShortDate(entry.timestamp)}</p>
                </div>
                <button class="list-item-action list-item-view" data-index="${i}">View</button>
              </div>
            `).join("")}
          </div>
        `}
      <button class="ghost" id="back-to-category-btn">Back</button>
    </div>
  `;

  document.querySelectorAll(".list-item-view").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-index"), 10);
      const entry = history[index];
      state.rankedMatches = [{ title: entry.title, score: entry.score }];
      state.resultIndex = 0;
      state.screen = "result";
      render();
    });
  });

  document.getElementById("back-to-category-btn").addEventListener("click", () => {
    state.screen = "category";
    render();
  });
}

/* --- Init --- */

applyTheme(loadTheme());
setupNavbar();
render();