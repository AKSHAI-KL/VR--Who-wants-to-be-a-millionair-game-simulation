/**
 * The three classic lifelines, kept in the game layer (no Three.js, no DOM) so
 * desktop preview and VR behave identically — the scene only renders what this
 * emits.
 *
 * All three are meant to read as a helping hand, so the audience poll and the
 * phone-a-friend suggestion are driven by the SAME per-question probability
 * model, and the model's biggest share is always the correct option:
 *   • audience poll  → shows the whole distribution (a share per option)
 *   • phone a friend → names the most probable answer of that same distribution
 *   • 50:50          → takes away two options that are never the correct one
 * Each lifeline can be spent once per game.
 */
export const LIFELINE_IDS = ['audience', 'fiftyFifty', 'phoneFriend'];

export class LifelineManager {
  constructor(optionCount = 4) {
    this.optionCount = optionCount;
    this.reset();
  }

  reset() {
    this.used = {};
    for (const id of LIFELINE_IDS) this.used[id] = false;
    this._pollKey = null;
    this._poll = null;
  }

  /** True while this lifeline has not been spent yet. */
  isAvailable(id) {
    return id in this.used ? !this.used[id] : false;
  }

  /** { audience: bool, fiftyFifty: bool, phoneFriend: bool } — available flags. */
  availability() {
    const out = {};
    for (const id of LIFELINE_IDS) out[id] = this.isAvailable(id);
    return out;
  }

  /** Spends the lifeline. Returns false if it was already used (or is unknown). */
  use(id) {
    if (!this.isAvailable(id)) return false;
    this.used[id] = true;
    return true;
  }

  /**
   * The audience's vote for this question, as whole percentages summing to 100.
   * Cached per question so asking again (or phoning a friend afterwards) tells
   * a consistent story.
   */
  pollFor(question) {
    const key = `${question.id}:${question.correctAnswer}`;
    if (this._pollKey !== key) {
      this._pollKey = key;
      this._poll = buildPoll(question.correctAnswer, this.optionCount);
    }
    return this._poll;
  }

  /** Index of the most probable answer in a poll. */
  mostProbable(poll) {
    return poll.indexOf(Math.max(...poll));
  }

  /** Two wrong options to remove — never the correct one. */
  fiftyFiftyRemovals(question) {
    const wrong = [];
    for (let i = 0; i < this.optionCount; i++) {
      if (i !== question.correctAnswer) wrong.push(i);
    }
    for (let i = wrong.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
    }
    return wrong.slice(0, 2);
  }
}

/**
 * Builds a plausible audience distribution: the correct answer leads with
 * 42-72% of the vote, the rest is split unevenly between the other options.
 */
function buildPoll(correctIndex, optionCount) {
  const leaderShare = 42 + Math.floor(Math.random() * 31);
  const remainder = 100 - leaderShare;

  const others = [];
  let weightSum = 0;
  for (let i = 0; i < optionCount; i++) {
    if (i === correctIndex) continue;
    const weight = 0.2 + Math.random();
    others.push({ index: i, weight });
    weightSum += weight;
  }

  const poll = new Array(optionCount).fill(0);
  poll[correctIndex] = leaderShare;

  let assigned = 0;
  others.forEach((other, k) => {
    const value = k === others.length - 1
      ? remainder - assigned
      : Math.round((remainder * other.weight) / weightSum);
    other.value = value;
    assigned += value;
  });
  others.forEach((other) => { poll[other.index] = other.value; });

  return poll;
}
