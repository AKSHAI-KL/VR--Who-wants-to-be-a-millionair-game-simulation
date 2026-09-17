/**
 * All sound is synthesized with the Web Audio API (tones/noise bursts) so the
 * game needs zero external audio assets and never breaks if a network asset
 * fails to load. Host speech optionally uses the browser's SpeechSynthesis
 * API. Everything degrades gracefully if audio is unavailable.
 */
export class AudioManager {
  constructor(audioConfig) {
    this.settings = { muted: false, volume: 0.6, voiceEnabled: true, ...audioConfig };
    this.ctx = null;
    this._unlocked = false;
  }

  /** Must be called after a user gesture (button click) to satisfy autoplay policies. */
  unlock() {
    if (this._unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this._unlocked = true;
    } catch (err) {
      console.warn('Web Audio unavailable:', err);
      this.ctx = null;
    }
  }

  updateSettings(partial) {
    this.settings = { ...this.settings, ...partial };
  }

  get effectiveVolume() {
    return this.settings.muted ? 0 : this.settings.volume;
  }

  _gain(destination, level = 1) {
    const g = this.ctx.createGain();
    g.gain.value = this.effectiveVolume * level;
    g.connect(destination);
    return g;
  }

  _tone({ freq = 440, duration = 0.2, type = 'sine', delay = 0, volume = 1, slideTo = null }) {
    if (!this.ctx || this.effectiveVolume <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this._gain(this.ctx.destination, volume);
    osc.type = type;
    const t0 = this.ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    gain.gain.setValueAtTime(gain.gain.value, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noiseBurst({ duration = 1.2, delay = 0, volume = 0.5, filterFreq = 1200 }) {
    if (!this.ctx || this.effectiveVolume <= 0) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = this._gain(this.ctx.destination, volume);
    noise.connect(filter).connect(gain);
    noise.start(this.ctx.currentTime + delay);
  }

  playSelectClick() {
    this._tone({ freq: 520, duration: 0.08, type: 'square', volume: 0.3 });
  }

  playQuestionIntro() {
    this._tone({ freq: 300, duration: 0.15, type: 'sine', volume: 0.3 });
    this._tone({ freq: 440, duration: 0.2, delay: 0.15, type: 'sine', volume: 0.3 });
  }

  playCorrectChime() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone({ freq: f, duration: 0.25, delay: i * 0.1, type: 'triangle', volume: 0.4 }));
  }

  playIncorrectBuzz() {
    this._tone({ freq: 180, duration: 0.5, type: 'sawtooth', volume: 0.35, slideTo: 90 });
  }

  playPrizeProgression() {
    this._tone({ freq: 660, duration: 0.3, type: 'sine', volume: 0.3, slideTo: 990 });
  }

  playApplause() {
    this._noiseBurst({ duration: 1.6, volume: 0.4, filterFreq: 2200 });
  }

  /** Lifeline feedback: crowd murmur while the audience votes. */
  playLifelineAudience() {
    this._noiseBurst({ duration: 1.8, volume: 0.3, filterFreq: 900 });
  }

  /** Lifeline feedback: quick "two down" pair for 50:50. */
  playLifelineFiftyFifty() {
    this._tone({ freq: 660, duration: 0.12, type: 'square', volume: 0.26 });
    this._tone({ freq: 420, duration: 0.14, delay: 0.14, type: 'square', volume: 0.26 });
  }

  /** Lifeline feedback: a two-burst ring-tone for phoning a friend. */
  playLifelinePhone() {
    for (const delay of [0, 0.22]) {
      this._tone({ freq: 900, duration: 0.13, delay, type: 'sine', volume: 0.28 });
      this._tone({ freq: 1120, duration: 0.13, delay: delay + 0.06, type: 'sine', volume: 0.22 });
    }
  }

  /** Crowd deflating after a wrong answer. */
  playAudienceSigh() {
    this._noiseBurst({ duration: 1.4, volume: 0.26, filterFreq: 700 });
  }

  /** Descending sting for the Game Over screen. */
  playGameOverSting() {
    [392, 330, 262, 196].forEach((f, i) =>
      this._tone({ freq: f, duration: 0.45, delay: i * 0.18, type: 'triangle', volume: 0.4 })
    );
    this._tone({ freq: 130, duration: 1.4, delay: 0.75, type: 'sawtooth', volume: 0.22, slideTo: 70 });
  }

  playCelebrationFanfare() {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      this._tone({ freq: f, duration: 0.35, delay: i * 0.14, type: 'triangle', volume: 0.45 })
    );
    this._noiseBurst({ duration: 2.2, delay: 0.1, volume: 0.3, filterFreq: 2500 });
  }

  /** Optional host voice via the browser's built-in speech synthesis. */
  speak(text) {
    if (!this.settings.voiceEnabled || this.settings.muted) return;
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.volume = this.effectiveVolume;
      utter.rate = 1.0;
      utter.pitch = 1.05;
      window.speechSynthesis.speak(utter);
    } catch (err) {
      console.warn('SpeechSynthesis unavailable:', err);
    }
  }
}
