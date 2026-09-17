import { ConfigStore } from '../utils/ConfigStore.js';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * A complete, functional admin panel. It reads/writes the exact same config
 * object the live game uses (via ConfigStore + the callbacks passed in), so
 * nothing here is a mock: Save Changes persists to localStorage and hands
 * the updated config back to the game; Preview Game does the same and then
 * jumps straight into desktop preview.
 */
export class Editor {
  constructor({ root, onApplyConfig, onPreview }) {
    this.root = root;
    this.onApplyConfig = onApplyConfig;
    this.onPreview = onPreview;

    this.working = ConfigStore.load();

    this.tabSettings = root.querySelector('#tab-settings');
    this.tabQuestions = root.querySelector('#tab-questions');
    this.messageEl = root.querySelector('#editor-message');

    this._wireTabs();
    this._wireFooterButtons();
    this.render();
  }

  open() {
    this.working = ConfigStore.load();
    this.render();
    this.root.classList.remove('hidden');
  }

  close() {
    this.root.classList.add('hidden');
  }

  _wireTabs() {
    this.root.querySelectorAll('.editor-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll('.editor-tab').forEach((b) => b.classList.remove('active'));
        this.root.querySelectorAll('.editor-tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        this.root.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
      });
    });
    this.root.querySelector('#editor-close').addEventListener('click', () => this.close());
  }

  _wireFooterButtons() {
    this.root.querySelector('#editor-save').addEventListener('click', () => this._save());
    this.root.querySelector('#editor-preview').addEventListener('click', () => this._previewGame());
    this.root.querySelector('#editor-reset').addEventListener('click', () => this._resetGame());
    this.root.querySelector('#editor-export').addEventListener('click', () => this._exportJSON());

    const importBtn = this.root.querySelector('#editor-import');
    const importInput = this.root.querySelector('#editor-import-input');
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => this._importJSON(e));
  }

  _setMessage(text, kind = '') {
    this.messageEl.textContent = text;
    this.messageEl.className = `editor-message ${kind}`;
  }

  _readFormIntoWorking() {
    // Settings
    this.working.title = this._val('#f-title') || this.working.title;
    this.working.finalMessage = this._val('#f-final-message');
    this.working.theme.primaryColor = this._val('#f-theme-primary');
    this.working.theme.screenColor = this._val('#f-theme-screen');
    this.working.audio.muted = this._checked('#f-audio-muted');
    this.working.audio.volume = parseFloat(this._val('#f-audio-volume')) || 0;
    this.working.audio.voiceEnabled = this._checked('#f-audio-voice');

    this.working.hostDialogue.welcome = this._val('#f-dlg-welcome');
    this.working.hostDialogue.questionIntro = this._val('#f-dlg-intro');
    this.working.hostDialogue.correct = this._val('#f-dlg-correct');
    this.working.hostDialogue.incorrect = this._val('#f-dlg-incorrect');
    this.working.hostDialogue.gameOver = this._val('#f-dlg-game-over');
    this.working.hostDialogue.thinking = this._val('#f-dlg-thinking');
    this.working.hostDialogue.audiencePoll = this._val('#f-dlg-audience');
    this.working.hostDialogue.fiftyFifty = this._val('#f-dlg-fifty');
    this.working.hostDialogue.phoneFriend = this._val('#f-dlg-friend');
    this.working.hostDialogue.final = this._val('#f-dlg-final');

    this.working.prizes = this.working.prizes.map((_, i) => Number(this._val(`#f-prize-${i}`)) || 0);

    // Questions
    this.working.questions = this.working.questions.map((q, i) => ({
      id: i + 1,
      question: this._val(`#f-q${i}-text`),
      options: LETTERS.map((_, oi) => this._val(`#f-q${i}-opt${oi}`)),
      correctAnswer: LETTERS.indexOf(this._val(`#f-q${i}-correct`)),
      prize: Number(this._val(`#f-q${i}-prize`)) || 0,
      hostIntro: this._val(`#f-q${i}-intro`)
    }));
  }

  _val(sel) {
    const el = this.root.querySelector(sel);
    return el ? el.value : '';
  }
  _checked(sel) {
    const el = this.root.querySelector(sel);
    return el ? el.checked : false;
  }

  _save() {
    this._readFormIntoWorking();
    const result = ConfigStore.save(this.working);
    if (!result.ok) {
      this._setMessage(result.errors.join(' '), 'error');
      return false;
    }
    this._setMessage('Changes saved. The live game now uses this configuration.', 'success');
    this.onApplyConfig?.(this.working);
    return true;
  }

  _previewGame() {
    if (this._save()) {
      this.close();
      this.onPreview?.();
    }
  }

  _resetGame() {
    if (!confirm('Reset all game settings, dialogue, and questions to the defaults? This cannot be undone.')) return;
    this.working = ConfigStore.reset();
    this.render();
    this._setMessage('Game reset to defaults.', 'success');
    this.onApplyConfig?.(this.working);
  }

  _exportJSON() {
    this._readFormIntoWorking();
    const json = ConfigStore.exportJSON(this.working);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'millionaire-vr-config.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this._setMessage('Configuration exported as JSON.', 'success');
  }

  _importJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = ConfigStore.importJSON(String(reader.result));
      if (!result.ok) {
        this._setMessage(`Import failed: ${result.errors.join(' ')}`, 'error');
        return;
      }
      this.working = result.config;
      this.render();
      this._setMessage('Configuration imported. Click "Save Changes" to apply it to the game.', 'success');
    };
    reader.onerror = () => this._setMessage('Could not read the selected file.', 'error');
    reader.readAsText(file);
    e.target.value = '';
  }

  render() {
    this._renderSettings();
    this._renderQuestions();
  }

  _renderSettings() {
    const c = this.working;
    this.tabSettings.innerHTML = `
      <div class="field-row">
        <label for="f-title">Game Title</label>
        <input type="text" id="f-title" value="${escapeAttr(c.title)}" />
      </div>
      <div class="field-row">
        <label for="f-final-message">Final Message</label>
        <input type="text" id="f-final-message" value="${escapeAttr(c.finalMessage)}" />
      </div>

      <div class="field-grid-2">
        <div class="field-row">
          <label for="f-theme-primary">Theme &mdash; Primary Color</label>
          <input type="text" id="f-theme-primary" value="${escapeAttr(c.theme.primaryColor)}" />
        </div>
        <div class="field-row">
          <label for="f-theme-screen">Theme &mdash; Screen Color</label>
          <input type="text" id="f-theme-screen" value="${escapeAttr(c.theme.screenColor)}" />
        </div>
      </div>

      <div class="field-row">
        <label>Audio Settings</label>
        <div class="field-grid-2">
          <div class="checkbox-row"><input type="checkbox" id="f-audio-muted" ${c.audio.muted ? 'checked' : ''}/><label for="f-audio-muted" style="margin:0;text-transform:none;">Muted by default</label></div>
          <div class="checkbox-row"><input type="checkbox" id="f-audio-voice" ${c.audio.voiceEnabled ? 'checked' : ''}/><label for="f-audio-voice" style="margin:0;text-transform:none;">Host voice (text-to-speech) enabled</label></div>
        </div>
        <label for="f-audio-volume" style="margin-top:10px;">Volume (0&ndash;1)</label>
        <input type="number" id="f-audio-volume" min="0" max="1" step="0.05" value="${c.audio.volume}" />
      </div>

      <div class="field-row"><label>Host Dialogue</label></div>
      <div class="field-row"><label for="f-dlg-welcome" style="text-transform:none;">Welcome / intro</label><input type="text" id="f-dlg-welcome" value="${escapeAttr(c.hostDialogue.welcome)}" /></div>
      <div class="field-row"><label for="f-dlg-intro" style="text-transform:none;">Default question intro</label><input type="text" id="f-dlg-intro" value="${escapeAttr(c.hostDialogue.questionIntro)}" /></div>
      <div class="field-row"><label for="f-dlg-correct" style="text-transform:none;">On correct answer</label><input type="text" id="f-dlg-correct" value="${escapeAttr(c.hostDialogue.correct)}" /></div>
      <div class="field-row"><label for="f-dlg-incorrect" style="text-transform:none;">On incorrect answer</label><input type="text" id="f-dlg-incorrect" value="${escapeAttr(c.hostDialogue.incorrect)}" /></div>
      <div class="field-row"><label for="f-dlg-game-over" style="text-transform:none;">On game over (run ended)</label><input type="text" id="f-dlg-game-over" value="${escapeAttr(c.hostDialogue.gameOver || '')}" /></div>
      <div class="field-row"><label for="f-dlg-thinking" style="text-transform:none;">While the answer is locked in</label><input type="text" id="f-dlg-thinking" value="${escapeAttr(c.hostDialogue.thinking)}" /></div>
      <div class="field-row"><label for="f-dlg-audience" style="text-transform:none;">Lifeline &mdash; ask the audience</label><input type="text" id="f-dlg-audience" value="${escapeAttr(c.hostDialogue.audiencePoll || '')}" /></div>
      <div class="field-row"><label for="f-dlg-fifty" style="text-transform:none;">Lifeline &mdash; 50:50</label><input type="text" id="f-dlg-fifty" value="${escapeAttr(c.hostDialogue.fiftyFifty || '')}" /></div>
      <div class="field-row"><label for="f-dlg-friend" style="text-transform:none;">Lifeline &mdash; phone a friend</label><input type="text" id="f-dlg-friend" value="${escapeAttr(c.hostDialogue.phoneFriend || '')}" /></div>
      <div class="field-row"><label for="f-dlg-final" style="text-transform:none;">Final congratulations</label><input type="text" id="f-dlg-final" value="${escapeAttr(c.hostDialogue.final)}" /></div>

      <div class="field-row"><label>Prize Ladder (5 tiers, low to high)</label></div>
      <div class="field-grid-4">
        ${c.prizes.map((p, i) => `
          <div class="field-row">
            <label for="f-prize-${i}" style="text-transform:none;">Tier ${i + 1}</label>
            <input type="number" id="f-prize-${i}" min="0" value="${p}" />
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderQuestions() {
    const c = this.working;
    this.tabQuestions.innerHTML = c.questions
      .map((q, i) => `
        <div class="question-card">
          <h3>Question ${i + 1}</h3>
          <div class="field-row">
            <label for="f-q${i}-text" style="text-transform:none;">Question</label>
            <textarea id="f-q${i}-text">${escapeHtml(q.question)}</textarea>
          </div>
          <div class="field-grid-2">
            ${LETTERS.map((letter, oi) => `
              <div class="field-row">
                <label for="f-q${i}-opt${oi}" style="text-transform:none;">Option ${letter}</label>
                <input type="text" id="f-q${i}-opt${oi}" value="${escapeAttr(q.options[oi] || '')}" />
              </div>
            `).join('')}
          </div>
          <div class="field-grid-2">
            <div class="field-row">
              <label for="f-q${i}-correct" style="text-transform:none;">Correct Answer</label>
              <select id="f-q${i}-correct">
                ${LETTERS.map((letter, oi) => `<option value="${letter}" ${q.correctAnswer === oi ? 'selected' : ''}>${letter}</option>`).join('')}
              </select>
            </div>
            <div class="field-row">
              <label for="f-q${i}-prize" style="text-transform:none;">Prize</label>
              <input type="number" id="f-q${i}-prize" min="0" value="${q.prize}" />
            </div>
          </div>
          <div class="field-row">
            <label for="f-q${i}-intro" style="text-transform:none;">Host Introduction</label>
            <input type="text" id="f-q${i}-intro" value="${escapeAttr(q.hostIntro || '')}" />
          </div>
        </div>
      `)
      .join('');
  }
}

function escapeAttr(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escapeHtml(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
