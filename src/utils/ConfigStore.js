import { defaultConfig, REQUIRED_QUESTION_COUNT, REQUIRED_OPTION_COUNT } from '../data/defaultConfig.js';

const STORAGE_KEY = 'millionaireVR.config.v1';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Validates a config object. Returns { valid: true } or
 * { valid: false, errors: [ ...human readable strings ] }.
 * Never throws — callers decide what to do with invalid data.
 */
export function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be a JSON object.'] };
  }

  if (typeof config.title !== 'string' || !config.title.trim()) {
    errors.push('Game title must be a non-empty string.');
  }

  if (!Array.isArray(config.prizes) || config.prizes.length !== REQUIRED_QUESTION_COUNT) {
    errors.push(`Prize ladder must contain exactly ${REQUIRED_QUESTION_COUNT} values.`);
  } else if (config.prizes.some((p) => typeof p !== 'number' || Number.isNaN(p) || p < 0)) {
    errors.push('Every prize value must be a non-negative number.');
  }

  if (!Array.isArray(config.questions) || config.questions.length !== REQUIRED_QUESTION_COUNT) {
    errors.push(`There must be exactly ${REQUIRED_QUESTION_COUNT} questions.`);
  } else {
    config.questions.forEach((q, i) => {
      const label = `Question ${i + 1}`;
      if (!q || typeof q !== 'object') {
        errors.push(`${label} is missing or malformed.`);
        return;
      }
      if (typeof q.question !== 'string' || !q.question.trim()) {
        errors.push(`${label}: question text must not be empty.`);
      }
      if (!Array.isArray(q.options) || q.options.length !== REQUIRED_OPTION_COUNT) {
        errors.push(`${label}: must have exactly ${REQUIRED_OPTION_COUNT} answer options.`);
      } else if (q.options.some((o) => typeof o !== 'string' || !o.trim())) {
        errors.push(`${label}: every answer option must be non-empty text.`);
      }
      if (
        typeof q.correctAnswer !== 'number' ||
        !Number.isInteger(q.correctAnswer) ||
        q.correctAnswer < 0 ||
        q.correctAnswer > 3
      ) {
        errors.push(`${label}: correctAnswer must be an integer between 0 and 3 (A-D).`);
      }
      if (typeof q.prize !== 'number' || Number.isNaN(q.prize) || q.prize < 0) {
        errors.push(`${label}: prize must be a non-negative number.`);
      }
      if (q.hostIntro !== undefined && typeof q.hostIntro !== 'string') {
        errors.push(`${label}: hostIntro must be a string if provided.`);
      }
    });
  }

  if (!config.hostDialogue || typeof config.hostDialogue !== 'object') {
    errors.push('hostDialogue must be an object of dialogue strings.');
  }

  return { valid: errors.length === 0, errors };
}

/** Lenient merge used only for localStorage recovery: missing/malformed core
 * arrays silently fall back to defaults so a corrupted save never breaks the
 * app. NOT used for user-provided imports (see mergeForImport below), since
 * silently discarding a user's own questions/prizes without telling them
 * would hide real mistakes in their file. */
function mergeWithDefaults(partial) {
  const base = deepClone(defaultConfig);
  if (!partial || typeof partial !== 'object') return base;
  return {
    ...base,
    ...partial,
    theme: { ...base.theme, ...(partial.theme || {}) },
    audio: { ...base.audio, ...(partial.audio || {}) },
    hostDialogue: { ...base.hostDialogue, ...(partial.hostDialogue || {}) },
    prizes: Array.isArray(partial.prizes) && partial.prizes.length === REQUIRED_QUESTION_COUNT
      ? partial.prizes
      : base.prizes,
    questions: Array.isArray(partial.questions) && partial.questions.length === REQUIRED_QUESTION_COUNT
      ? partial.questions
      : base.questions
  };
}

/** Merge used for JSON import: fills in missing *cosmetic* fields (theme,
 * audio, hostDialogue, finalMessage) from defaults, but passes prizes/
 * questions/title through exactly as provided — even if malformed — so
 * validateConfig() can catch and report real problems in the user's file
 * instead of them being silently papered over. */
function mergeForImport(partial) {
  const base = deepClone(defaultConfig);
  return {
    title: partial.title,
    finalMessage: typeof partial.finalMessage === 'string' ? partial.finalMessage : base.finalMessage,
    theme: { ...base.theme, ...(partial.theme || {}) },
    audio: { ...base.audio, ...(partial.audio || {}) },
    hostDialogue: { ...base.hostDialogue, ...(partial.hostDialogue || {}) },
    prizes: partial.prizes,
    questions: partial.questions
  };
}

export const ConfigStore = {
  /** Load config from localStorage, falling back to defaults. Never throws. */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return deepClone(defaultConfig);
      const parsed = JSON.parse(raw);
      const merged = mergeWithDefaults(parsed);
      const { valid } = validateConfig(merged);
      return valid ? merged : deepClone(defaultConfig);
    } catch (err) {
      console.warn('ConfigStore.load failed, using defaults:', err);
      return deepClone(defaultConfig);
    }
  },

  /** Persist config to localStorage. Returns { ok, errors? }. */
  save(config) {
    const { valid, errors } = validateConfig(config);
    if (!valid) return { ok: false, errors };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return { ok: true };
    } catch (err) {
      return { ok: false, errors: [`Could not write to local storage: ${err.message}`] };
    }
  },

  /** Remove saved config and return a fresh copy of the defaults. */
  reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('ConfigStore.reset failed:', err);
    }
    return deepClone(defaultConfig);
  },

  exportJSON(config) {
    return JSON.stringify(config, null, 2);
  },

  /** Parse + strictly validate a JSON string against the user's actual
   * content (does not silently substitute defaults for bad questions/prizes).
   * Returns { ok, config? , errors? }. */
  importJSON(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      return { ok: false, errors: [`Invalid JSON: ${err.message}`] };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, errors: ['Imported file must contain a JSON object.'] };
    }
    const merged = mergeForImport(parsed);
    const { valid, errors } = validateConfig(merged);
    if (!valid) return { ok: false, errors };
    return { ok: true, config: merged };
  },

  defaults() {
    return deepClone(defaultConfig);
  }
};
