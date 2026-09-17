export class PrizeManager {
  constructor(prizeLadder) {
    this.setLadder(prizeLadder);
    this.reset();
  }

  setLadder(prizeLadder) {
    // Store ascending (lowest first) internally; ladder is often displayed high-to-low.
    this.ladder = [...prizeLadder].sort((a, b) => a - b);
  }

  reset() {
    this.currentPrize = 0;
    this.currentTierIndex = -1; // -1 = no tier won yet
  }

  /** Call when a question at ladder index `tierIndex` is answered correctly. */
  wonTier(tierIndex) {
    if (tierIndex < 0 || tierIndex >= this.ladder.length) return;
    this.currentTierIndex = tierIndex;
    this.currentPrize = this.ladder[tierIndex];
  }

  formatted(amount = this.currentPrize) {
    return '\u20B9' + Math.round(amount).toLocaleString('en-IN');
  }
}
