/* =========================================================
   GENRE MAP — translates genre names returned by TMDB/Jikan
   into deltas on our 6 traits: whimsy, dark, action, romance,
   comedy, mindbend. This is what lets live API data plug into
   the same scoring engine the static list used.
   ========================================================= */

import { makeVector } from "./data.js";

// Keys are lowercase so lookups are case-insensitive regardless
// of how each API capitalizes its genre names.
const GENRE_TRAITS = {
    "action": makeVector([0, 0, 3, 0, 0, 0]),
    "action & adventure": makeVector([1, 0, 2, 0, 0, 0]),
    "adventure": makeVector([1, 0, 2, 0, 0, 0]),
    "animation": makeVector([2, 0, 0, 0, 0, 0]),
    "comedy": makeVector([0, 0, 0, 0, 3, 0]),
    "crime": makeVector([0, 2, 1, 0, 0, 1]),
    "documentary": makeVector([0, 0, 0, 0, 0, 1]),
    "drama": makeVector([0, 1, 0, 1, 0, 0]),
    "ecchi": makeVector([0, 0, 0, 1, 1, 0]),
    "family": makeVector([2, 0, 0, 0, 1, 0]),
    "fantasy": makeVector([3, 0, 0, 0, 0, 0]),
    "gourmet": makeVector([1, 0, 0, 0, 2, 0]),
    "history": makeVector([0, 1, 0, 0, 0, 0]),
    "horror": makeVector([0, 3, 1, 0, 0, 0]),
    "kids": makeVector([2, 0, 0, 0, 1, 0]),
    "music": makeVector([1, 0, 0, 0, 1, 0]),
    "mystery": makeVector([0, 1, 0, 0, 0, 3]),
    "psychological": makeVector([0, 2, 0, 0, 0, 3]),
    "romance": makeVector([0, 0, 0, 3, 0, 0]),
    "sci-fi": makeVector([0, 0, 1, 0, 0, 2]),
    "sci-fi & fantasy": makeVector([2, 0, 1, 0, 0, 1]),
    "science fiction": makeVector([0, 0, 1, 0, 0, 2]),
    "slice of life": makeVector([1, 0, 0, 0, 2, 0]),
    "soap": makeVector([0, 1, 0, 2, 0, 0]),
    "sports": makeVector([1, 0, 2, 0, 0, 0]),
    "supernatural": makeVector([2, 1, 0, 0, 0, 1]),
    "suspense": makeVector([0, 2, 1, 0, 0, 1]),
    "thriller": makeVector([0, 2, 1, 0, 0, 1]),
    "tv movie": makeVector([0, 0, 0, 0, 0, 0]),
    "war": makeVector([0, 3, 2, 0, 0, 0]),
    "war & politics": makeVector([0, 2, 1, 0, 0, 1]),
    "western": makeVector([0, 1, 2, 0, 0, 0])
};

const FALLBACK_VECTOR = makeVector([1, 1, 1, 1, 1, 1]);

// Sums the trait deltas for every genre name a title has.
// Titles with no recognized genres fall back to a small neutral
// vector rather than an all-zero one, so cosine similarity still
// has something to compare against instead of always scoring 0.
export function genresToVector(genreNames) {
    const recognized = genreNames
        .map(name => GENRE_TRAITS[name.toLowerCase()])
        .filter(Boolean);

    if (recognized.length === 0) return FALLBACK_VECTOR;

    const result = makeVector([0, 0, 0, 0, 0, 0]);
    recognized.forEach(vector => {
        Object.keys(result).forEach(key => { result[key] += vector[key]; });
    });
    return result;
}