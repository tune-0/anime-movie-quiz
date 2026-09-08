/* =========================================================
   DATA — traits, questions, and the recommendation pool.
   Each title/option carries a 6-dimension trait vector:
   whimsy, dark, action, romance, comedy, mindbend
   ========================================================= */

export const TRAIT_KEYS = ["whimsy", "dark", "action", "romance", "comedy", "mindbend"];

export const KIND_LABELS = { anime: "Anime", movie: "Movie", kdrama: "K-drama" };

export function makeVector(values) {
  const vector = {};
  TRAIT_KEYS.forEach((key, i) => { vector[key] = values[i] || 0; });
  return vector;
}

export const QUESTIONS = [
  {
    prompt: "Pick a mood for tonight.",
    options: [
      { text: "Cozy and whimsical", delta: makeVector([3, 0, 0, 0, 1, 0]) },
      { text: "Dark and intense", delta: makeVector([0, 3, 1, 0, 0, 0]) },
      { text: "An adrenaline rush", delta: makeVector([0, 0, 3, 0, 0, 0]) },
      { text: "Something to laugh at", delta: makeVector([0, 0, 0, 0, 3, 0]) }
    ]
  },
  {
    prompt: "Your ideal main character...",
    options: [
      { text: "Falls in love against the odds", delta: makeVector([1, 0, 0, 3, 0, 0]) },
      { text: "Fights for survival", delta: makeVector([0, 1, 3, 0, 0, 0]) },
      { text: "Solves an impossible puzzle", delta: makeVector([0, 0, 0, 0, 0, 3]) },
      { text: "Is just trying to get through the day", delta: makeVector([1, 0, 0, 0, 2, 0]) }
    ]
  },
  {
    prompt: "Pick an ending.",
    options: [
      { text: "Bittersweet — it makes you cry", delta: makeVector([0, 2, 0, 2, 0, 0]) },
      { text: "A twist that recontextualizes everything", delta: makeVector([0, 0, 0, 0, 0, 3]) },
      { text: "A triumphant victory", delta: makeVector([1, 0, 2, 0, 0, 0]) },
      { text: "Everyone's laughing together", delta: makeVector([0, 0, 0, 0, 3, 0]) }
    ]
  },
  {
    prompt: "Pick a setting.",
    options: [
      { text: "A fantastical world with its own rules", delta: makeVector([3, 0, 0, 0, 0, 1]) },
      { text: "A gritty, realistic world", delta: makeVector([0, 3, 0, 0, 0, 0]) },
      { text: "A workplace or school full of chaos", delta: makeVector([0, 0, 0, 1, 2, 0]) },
      { text: "A battlefield or warzone", delta: makeVector([0, 1, 3, 0, 0, 0]) }
    ]
  },
  {
    prompt: "How much thinking do you want to do?",
    options: [
      { text: "None — just vibes", delta: makeVector([2, 0, 0, 0, 1, 0]) },
      { text: "A little — some feelings", delta: makeVector([0, 0, 0, 2, 0, 0]) },
      { text: "A lot — mind-bending plot", delta: makeVector([0, 0, 0, 0, 0, 3]) },
      { text: "Doesn't matter, just want tension", delta: makeVector([0, 1, 2, 0, 0, 0]) }
    ]
  },
  {
    prompt: "Pick a soundtrack.",
    options: [
      { text: "Orchestral, swelling, epic", delta: makeVector([0, 1, 2, 0, 0, 0]) },
      { text: "Whimsical and playful", delta: makeVector([3, 0, 0, 0, 0, 0]) },
      { text: "Melancholic piano", delta: makeVector([0, 2, 0, 1, 0, 0]) },
      { text: "Upbeat, with comedic timing", delta: makeVector([0, 0, 0, 0, 3, 0]) }
    ]
  }
];
