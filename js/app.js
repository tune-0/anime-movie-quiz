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

const state = {
  screen: "category",     // "category" | "loading" | "quiz" | "result" | "error" | "favorites"
  selectedKinds: new Set(),
  questionIndex: 0,
  userVector: createEmptyVector(),
  answerHistory: [],
  categoryError: false,
  titlePool: [],
  loadError: null,
  rankedMatches: [],
  resultIndex: 0
};

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

/* --- Rendering: one function per screen --- */

const screenEl = document.getElementById("screen");

function render() {
  if (state.screen === "category") return renderCategoryScreen();
  if (state.screen === "loading") return renderLoadingScreen();
  if (state.screen === "quiz") return renderQuizScreen();
  if (state.screen === "result") return renderResultScreen();
  if (state.screen === "error") return renderErrorScreen();
  if (state.screen === "favorites") return renderFavoritesScreen();
}

function renderCategoryScreen() {
  const options = [
    { value: "anime", label: "Anime" },
    { value: "movie", label: "Movies" },
    { value: "kdrama", label: "K-drama" }
  ];
  const favoritesCount = loadFavorites().length;

  screenEl.innerHTML = `
    <div class="card">
      <p class="step-label">Step 1 of 2</p>
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
      <button class="link-btn" id="view-favorites-btn">★ View saved (${favoritesCount})</button>
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

  document.getElementById("view-favorites-btn").addEventListener("click", () => {
    state.screen = "favorites";
    render();
  });
}

function renderLoadingScreen() {
  screenEl.innerHTML = `
    <div class="card loading-card">
      <div class="spinner" aria-hidden="true"></div>
      <p class="loading-text">Pulling in titles…</p>
    </div>
  `;
}

function renderErrorScreen() {
  screenEl.innerHTML = `
    <div class="card">
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
    <div class="card">
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
    <div class="ticket">
      <div class="ticket-top">
        <button class="star-btn" id="star-btn" aria-label="${favorited ? "Remove from saved" : "Save this pick"}">
          ${favorited ? "★" : "☆"}
        </button>
        ${top.title.posterUrl ? `<img class="ticket-poster" src="${top.title.posterUrl}" alt="${top.title.name} poster" />` : ""}
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
  const favorites = loadFavorites();

  screenEl.innerHTML = `
    <div class="card">
      <p class="step-label">Saved</p>
      <h2 class="question">Your saved picks</h2>
      ${favorites.length === 0
      ? `<p class="hint-text">Nothing saved yet — star a result to keep it here.</p>`
      : `
          <div class="favorite-list">
            ${favorites.map((fav, i) => `
              <div class="favorite-item">
                ${fav.posterUrl ? `<img class="favorite-poster" src="${fav.posterUrl}" alt="${fav.name} poster" />` : ""}
                <div class="favorite-info">
                  <p class="favorite-name">${fav.name}</p>
                  <p class="favorite-kind">${formatKindLabel(fav.kind)}</p>
                </div>
                <button class="favorite-remove" data-index="${i}" aria-label="Remove ${fav.name} from saved">✕</button>
              </div>
            `).join("")}
          </div>
        `}
      <button class="ghost" id="back-to-category-btn">Back</button>
    </div>
  `;

  document.querySelectorAll(".favorite-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-index"), 10);
      const current = loadFavorites();
      current.splice(index, 1);
      saveFavoritesList(current);
      render();
    });
  });

  document.getElementById("back-to-category-btn").addEventListener("click", () => {
    state.screen = "category";
    render();
  });
}

render();