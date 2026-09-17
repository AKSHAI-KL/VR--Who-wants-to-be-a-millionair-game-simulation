export class HUD {
  constructor(root, { onMenu, onMuteToggle, onVolumeChange }) {
    this.root = root;
    this.muteBtn = root.querySelector('#hud-mute');
    this.volumeInput = root.querySelector('#hud-volume');
    this.hintEl = root.querySelector('#hud-hint');

    root.querySelector('#hud-menu').addEventListener('click', onMenu);
    this.muteBtn.addEventListener('click', onMuteToggle);
    this.volumeInput.addEventListener('input', (e) => onVolumeChange(parseFloat(e.target.value)));
  }

  setAudioState({ muted, volume }) {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.volumeInput.value = String(volume);
  }

  setHint(text) {
    this.hintEl.textContent = text;
  }

  show() {
    this.root.classList.remove('hidden');
  }
  hide() {
    this.root.classList.add('hidden');
  }
}
