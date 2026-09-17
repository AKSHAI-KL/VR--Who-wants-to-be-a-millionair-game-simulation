import { REQUIRED_QUESTION_COUNT } from '../data/defaultConfig.js';

/**
 * Wraps exactly REQUIRED_QUESTION_COUNT question slots from the active config.
 * The game mode never grows or shrinks this list — editing content happens
 * through the Game Editor / config, not here.
 */
export class QuestionManager {
  constructor(questions) {
    this.setQuestions(questions);
    this.currentIndex = 0;
  }

  setQuestions(questions) {
    if (!Array.isArray(questions) || questions.length !== REQUIRED_QUESTION_COUNT) {
      throw new Error(`QuestionManager requires exactly ${REQUIRED_QUESTION_COUNT} questions.`);
    }
    this.questions = questions;
  }

  reset() {
    this.currentIndex = 0;
  }

  get total() {
    return this.questions.length;
  }

  current() {
    return this.questions[this.currentIndex];
  }

  isLast() {
    return this.currentIndex >= this.questions.length - 1;
  }

  advance() {
    if (this.isLast()) return false;
    this.currentIndex += 1;
    return true;
  }
}
