import { Emitter } from '../utils/Emitter.js';
import { States, canTransition } from './GameState.js';
import { QuestionManager } from './QuestionManager.js';
import { PrizeManager } from './PrizeManager.js';
import { LifelineManager } from './LifelineManager.js';

const TIMING = {
  hostIntroMs: 2600,
  answerPauseMs: 700,
  revealMs: 2400,
  nextQuestionMs: 900,
  // How long the wrong answer is left on screen (highlight + host reaction +
  // audience reaction) before the run is terminated and the Game Over screen
  // takes over.
  gameOverDelayMs: 2200
};

/**
 * Drives the five-question game flow through an explicit state machine.
 * Knows nothing about Three.js, WebXR, or the DOM — it only emits events
 * that the scene/editor/UI layers subscribe to. This is what lets desktop
 * preview and VR mode share one game engine and one set of data.
 *
 * Flow: a correct answer is the ONLY way forward. Any incorrect answer ends
 * the session immediately (INCORRECT -> GAME_OVER -> PLAY_AGAIN).
 */
export class GameManager extends Emitter {
  constructor(config) {
    super();
    this._timers = [];
    this.loadConfig(config);
  }

  loadConfig(config) {
    this.config = config;
    this.questionManager = new QuestionManager(config.questions);
    this.prizeManager = new PrizeManager(config.prizes);
    this.lifelines = new LifelineManager(4);
    this.state = States.START;
    this.selectedAnswerIndex = null;
    this.correctCount = 0;
    this._clearTimers();
  }

  _clearTimers() {
    this._timers.forEach((t) => clearTimeout(t));
    this._timers = [];
  }

  _after(ms, fn) {
    const id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  }

  _setState(next) {
    if (!canTransition(this.state, next)) {
      console.warn(`Illegal state transition blocked: ${this.state} -> ${next}`);
      return false;
    }
    const prev = this.state;
    this.state = next;
    this.emit('stateChange', { state: next, prevState: prev });
    return true;
  }

  // ---- Flow entry points -------------------------------------------------

  /** Called once, from the START screen ("Enter VR" / "Desktop Preview"). */
  startGame() {
    this.questionManager.reset();
    this.prizeManager.reset();
    this.lifelines.reset();
    this.correctCount = 0;
    this.selectedAnswerIndex = null;
    if (!this._setState(States.HOST_INTRO)) return;
    this._runIntro();
  }

  /** Called from the "PLAY AGAIN" panel on the Game Over / victory screen. */
  playAgain() {
    if (this.state !== States.GAME_OVER && this.state !== States.FINAL_RESULT) return;
    this._clearTimers();
    if (!this._setState(States.PLAY_AGAIN)) return;
    this.questionManager.reset();
    this.prizeManager.reset();
    this.lifelines.reset();
    this.correctCount = 0;
    this.selectedAnswerIndex = null;
    this.emit('reset', {});
    if (!this._setState(States.HOST_INTRO)) return;
    this._runIntro();
  }

  /** Shared intro beat used by both a fresh game and a re-start. */
  _runIntro() {
    this.emit('hostDialogue', { text: this.config.hostDialogue.welcome, animState: 'welcoming' });
    this.emit('audienceReaction', { reaction: 'idle' });
    this._after(TIMING.hostIntroMs, () => this._beginQuestion());
  }

  _beginQuestion() {
    if (!this._setState(States.QUESTION)) return;
    const q = this.questionManager.current();
    this.selectedAnswerIndex = null;
    this.emit('questionLoaded', {
      question: q,
      index: this.questionManager.currentIndex,
      total: this.questionManager.total
    });
    this.emit('hostDialogue', {
      text: q.hostIntro || this.config.hostDialogue.questionIntro,
      animState: 'pointing'
    });
    this.emit('audienceReaction', { reaction: 'idle' });
  }

  /** Availability of each lifeline, for the scene's lifeline buttons. */
  lifelineAvailability() {
    return this.lifelines.availability();
  }

  /**
   * Spends a lifeline. Only allowed while a question is showing and unanswered,
   * so a lifeline can never rescue a locked-in answer. Note this does NOT move
   * the state machine — lifelines are a side effect on the current question.
   * Returns false if it was unavailable.
   */
  useLifeline(id) {
    if (this.state !== States.QUESTION) return false;
    if (!this.lifelines.use(id)) return false;

    const question = this.questionManager.current();
    const dialogue = this.config.hostDialogue || {};

    if (id === 'audience') {
      const poll = this.lifelines.pollFor(question);
      this.emit('audiencePoll', { poll, mostProbable: this.lifelines.mostProbable(poll) });
      this.emit('hostDialogue', { text: dialogue.audiencePoll || "Let's ask the audience!", animState: 'gesture' });
      // The room itself reacts: hands up, turning to confer and tote up the vote.
      this.emit('audienceReaction', { reaction: 'vote' });
    } else if (id === 'fiftyFifty') {
      const removed = this.lifelines.fiftyFiftyRemovals(question);
      this.emit('fiftyFifty', { removed });
      this.emit('hostDialogue', {
        text: dialogue.fiftyFifty || 'Fifty-fifty — let me take two wrong answers away.',
        animState: 'gesture'
      });
    } else if (id === 'phoneFriend') {
      const poll = this.lifelines.pollFor(question);
      const index = this.lifelines.mostProbable(poll);
      this.emit('phoneFriend', { index, share: poll[index] });
      this.emit('hostDialogue', {
        text: dialogue.phoneFriend || "Let's phone a friend — they usually know!",
        animState: 'thinking'
      });
    }

    this.emit('lifelineUsed', { id, availability: this.lifelines.availability() });
    return true;
  }

  /** Called by desktop click handler or VR controller select. Ignored unless in QUESTION state. */
  selectAnswer(index) {
    if (this.state !== States.QUESTION) return false;
    if (typeof index !== 'number' || index < 0 || index > 3) return false;

    this.selectedAnswerIndex = index;
    if (!this._setState(States.ANSWER_SELECTED)) return false;
    // The answer is in, so the poll is over — hands come back down and the
    // crowd settles until the reveal tells them how to react.
    this.emit('audienceReaction', { reaction: 'idle' });
    this.emit('answerLocked', { index });
    this.emit('hostDialogue', { text: this.config.hostDialogue.thinking, animState: 'thinking' });

    this._after(TIMING.answerPauseMs, () => this._reveal());
    return true;
  }

  _reveal() {
    if (!this._setState(States.REVEAL)) return;
    const q = this.questionManager.current();
    const isCorrect = this.selectedAnswerIndex === q.correctAnswer;
    this.emit('reveal', {
      selectedIndex: this.selectedAnswerIndex,
      correctIndex: q.correctAnswer,
      isCorrect
    });

    if (isCorrect) {
      this.correctCount += 1;
      this.prizeManager.wonTier(this.questionManager.currentIndex);
      this.emit('prizeUpdate', {
        prize: this.prizeManager.currentPrize,
        tierIndex: this.prizeManager.currentTierIndex
      });
      this._setState(States.CORRECT);
      this.emit('hostDialogue', { text: this.config.hostDialogue.correct, animState: 'celebrating' });
      this.emit('audienceReaction', { reaction: 'applause' });
      this._after(TIMING.revealMs, () => this._afterCorrectAnswer());
      return;
    }

    // Wrong answer: show it, let the host and the audience react, then end
    // the whole session. There is no path from here back into the question.
    this._setState(States.INCORRECT);
    this.emit('hostDialogue', { text: this.config.hostDialogue.incorrect, animState: 'disappointed' });
    this.emit('audienceReaction', { reaction: 'disappointed' });
    this._after(TIMING.gameOverDelayMs, () => this._gameOver());
  }

  /** Only ever reached from a correct answer. */
  _afterCorrectAnswer() {
    if (this.questionManager.isLast()) {
      this._finalResult();
      return;
    }
    if (!this._setState(States.NEXT_QUESTION)) return;
    this._after(TIMING.nextQuestionMs, () => {
      this.questionManager.advance();
      this._beginQuestion();
    });
  }

  /** Terminates the current run after an incorrect answer. */
  _gameOver() {
    if (this.state !== States.INCORRECT) return;
    if (!this._setState(States.GAME_OVER)) return;
    this.emit('gameOver', {
      formattedPrize: this.prizeManager.formatted(),
      correctCount: this.correctCount,
      total: this.questionManager.total,
      reachedQuestion: this.questionManager.currentIndex + 1
    });
    this.emit('hostDialogue', {
      text: this.config.hostDialogue.gameOver || this.config.hostDialogue.incorrect,
      animState: 'disappointed'
    });
    this.emit('audienceReaction', { reaction: 'disappointed' });
  }

  _finalResult() {
    if (!this._setState(States.FINAL_RESULT)) return;
    this.emit('finalResult', {
      prize: this.prizeManager.currentPrize,
      formattedPrize: this.prizeManager.formatted(),
      correctCount: this.correctCount,
      total: this.questionManager.total,
      message: this.config.finalMessage
    });
    this.emit('hostDialogue', { text: this.config.hostDialogue.final, animState: 'finalCongrats' });
    this.emit('audienceReaction', { reaction: 'celebrate' });
  }

  destroy() {
    this._clearTimers();
  }
}
