/* =========================================================
   ENGINE — scoring logic, kept separate from data and UI.
   Every function here is pure: same input, same output,
   no reliance on the DOM or global state.
   ========================================================= */

import { TRAIT_KEYS, KIND_LABELS, makeVector } from "./data.js";

export function createEmptyVector() {
  return makeVector([0, 0, 0, 0, 0, 0]);
}

export function addVectorInPlace(target, delta) {
  TRAIT_KEYS.forEach(key => { target[key] += delta[key]; });
}

export function subtractVectorInPlace(target, delta) {
  TRAIT_KEYS.forEach(key => { target[key] -= delta[key]; });
}

export function vectorMagnitude(vector) {
  const sumSquares = TRAIT_KEYS.reduce((sum, key) => sum + vector[key] * vector[key], 0);
  return Math.sqrt(sumSquares);
}

export function cosineSimilarity(a, b) {
  const magA = vectorMagnitude(a);
  const magB = vectorMagnitude(b);
  if (magA === 0 || magB === 0) return 0;
  const dot = TRAIT_KEYS.reduce((sum, key) => sum + a[key] * b[key], 0);
  return dot / (magA * magB);
}

export function filterTitlesByCategory(titles, selectedKinds) {
  return titles.filter(title => selectedKinds.includes(title.kind));
}

export function rankTitlesByMatch(userVector, titles) {
  return titles
    .map(title => ({ title, score: cosineSimilarity(userVector, title.vector) }))
    .sort((a, b) => b.score - a.score);
}

export function getTopMatches(userVector, titles, selectedKinds, count) {
  const pool = filterTitlesByCategory(titles, selectedKinds);
  return rankTitlesByMatch(userVector, pool).slice(0, count);
}

export function normalizeVectorTo100(vector) {
  const max = Math.max(...TRAIT_KEYS.map(key => vector[key]), 1);
  const result = {};
  TRAIT_KEYS.forEach(key => { result[key] = Math.round((vector[key] / max) * 100); });
  return result;
}

export function formatKindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

export function getTopMatchingTraits(userVector, titleVector, count) {
  return TRAIT_KEYS
    .map(key => ({ key, value: userVector[key] * titleVector[key] }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map(c => c.key);
}