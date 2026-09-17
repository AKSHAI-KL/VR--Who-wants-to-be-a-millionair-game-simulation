export const States = Object.freeze({
  START: 'START',
  HOST_INTRO: 'HOST_INTRO',
  QUESTION: 'QUESTION',
  ANSWER_SELECTED: 'ANSWER_SELECTED',
  REVEAL: 'REVEAL',
  CORRECT: 'CORRECT',
  INCORRECT: 'INCORRECT',
  NEXT_QUESTION: 'NEXT_QUESTION',
  FINAL_RESULT: 'FINAL_RESULT',
  GAME_OVER: 'GAME_OVER',
  PLAY_AGAIN: 'PLAY_AGAIN'
});

// Explicit legal transitions. Anything not listed here is rejected by
// GameManager._setState(), which is what prevents double-answers,
// skipped questions, and out-of-order scoring.
//
// Note INCORRECT: the only way out of a wrong answer is GAME_OVER — there is
// deliberately no path to NEXT_QUESTION, so a single mistake always ends the
// current run (see project brief §3).
export const TRANSITIONS = {
  [States.START]: [States.HOST_INTRO],
  [States.HOST_INTRO]: [States.QUESTION],
  [States.QUESTION]: [States.ANSWER_SELECTED],
  [States.ANSWER_SELECTED]: [States.REVEAL],
  [States.REVEAL]: [States.CORRECT, States.INCORRECT],
  [States.CORRECT]: [States.NEXT_QUESTION, States.FINAL_RESULT],
  [States.INCORRECT]: [States.GAME_OVER],
  [States.NEXT_QUESTION]: [States.QUESTION],
  [States.FINAL_RESULT]: [States.PLAY_AGAIN],
  [States.GAME_OVER]: [States.PLAY_AGAIN],
  [States.PLAY_AGAIN]: [States.HOST_INTRO]
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
}
