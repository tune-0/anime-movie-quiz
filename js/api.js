/* =========================================================
   API — fetches live title data from public APIs and
   normalizes it into { name, kind, blurb, vector, posterUrl }
   so the rest of the app never needs to know where a title
   came from.

   Anime   -> AniList (GraphQL), no key needed.
   Movies  -> TMDB discover/movie.
   K-drama -> TMDB discover/tv, filtered to South Korean origin.
   ========================================================= */

import { TMDB_API_KEY } from "./config.js";
import { genresToVector } from "./genre-map.js";

const ANILIST_URL = "https://graphql.anilist.co";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

// TMDB genre IDs are stable and documented, so hardcoding them
// avoids an extra round-trip just to look up genre names.
const TMDB_MOVIE_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
};

const TMDB_TV_GENRES = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery",
  10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics", 37: "Western"
};

const ANILIST_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: POPULARITY_DESC) {
        title { english romaji }
        description(asHtml: false)
        genres
        coverImage { large }
      }
    }
  }
`;

function stripHtml(text) {
  return (text || "").replace(/<[^>]*>/g, " ");
}

function truncateBlurb(text, maxLength) {
  if (!text) return "No synopsis available.";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? clean.slice(0, maxLength).trim() + "…" : clean;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Free public APIs occasionally return 429/502/503/504 under load.
// These are transient — retrying with a short backoff usually works.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

async function requestWithRetry(url, options = {}, attempt = 1) {
  const response = await fetch(url, options);

  if (!response.ok) {
    if (RETRYABLE_STATUSES.has(response.status) && attempt <= 3) {
      await wait(attempt * 600);
      return requestWithRetry(url, options, attempt + 1);
    }
    throw new Error(`Request failed (${response.status}): ${url}`);
  }

  return response.json();
}

function fetchJson(url) {
  return requestWithRetry(url);
}

async function fetchAniListPage(page, perPage) {
  const json = await requestWithRetry(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query: ANILIST_QUERY, variables: { page, perPage } })
  });
  return json.data.Page.media;
}

export async function fetchAnimeTitles() {
  const [page1, page2] = await Promise.all([
    fetchAniListPage(1, 25),
    fetchAniListPage(2, 25)
  ]);

  return [...page1, ...page2].map(item => ({
    name: item.title.english || item.title.romaji,
    kind: "anime",
    blurb: truncateBlurb(stripHtml(item.description), 160),
    posterUrl: item.coverImage?.large || null,
    vector: genresToVector(item.genres || [])
  }));
}

export async function fetchMovieTitles() {
  const pages = await Promise.all([
    fetchJson(`${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&vote_count.gte=500&page=1`),
    fetchJson(`${TMDB_BASE}/discover/movie?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&vote_count.gte=500&page=2`)
  ]);

  return pages
    .flatMap(page => page.results || [])
    .map(item => ({
      name: item.title,
      kind: "movie",
      blurb: truncateBlurb(item.overview, 160),
      posterUrl: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null,
      vector: genresToVector((item.genre_ids || []).map(id => TMDB_MOVIE_GENRES[id]).filter(Boolean))
    }));
}

export async function fetchKdramaTitles() {
  const pages = await Promise.all([
    fetchJson(`${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=KR&sort_by=popularity.desc&vote_count.gte=100&page=1`),
    fetchJson(`${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=KR&sort_by=popularity.desc&vote_count.gte=100&page=2`)
  ]);

  return pages
    .flatMap(page => page.results || [])
    .map(item => ({
      name: item.name,
      kind: "kdrama",
      blurb: truncateBlurb(item.overview, 160),
      posterUrl: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null,
      vector: genresToVector((item.genre_ids || []).map(id => TMDB_TV_GENRES[id]).filter(Boolean))
    }));
}

const FETCHERS = {
  anime: fetchAnimeTitles,
  movie: fetchMovieTitles,
  kdrama: fetchKdramaTitles
};

// Fetches only the categories the person actually selected,
// in parallel, and flattens the results into one pool.
export async function fetchTitlesForKinds(kinds) {
  const results = await Promise.all(kinds.map(kind => FETCHERS[kind]()));
  return results.flat();
}