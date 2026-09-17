export class StartScreen {
  constructor(root, { onEnterVR, onDesktopPreview, onOpenEditor, vrButtonSlot }) {
    this.root = root;
    this.titleEl = root.querySelector('#game-title');
    this.statusEl = root.querySelector('#vr-status');
    this.vrSlot = root.querySelector('#btn-enter-vr-slot');

    root.querySelector('#btn-desktop-preview').addEventListener('click', onDesktopPreview);
    root.querySelector('#btn-open-editor').addEventListener('click', onOpenEditor);

    // The real WebXR "ENTER VR" button (from VRManager) is swapped into this slot
    // so its built-in support/permission handling (and its own click behaviour) is preserved.
    if (vrButtonSlot) {
      this.vrSlot.replaceWith(vrButtonSlot);
      vrButtonSlot.classList.add('btn', 'btn-primary');
      vrButtonSlot.addEventListener('click', () => onEnterVR?.());
    }
  }

  setTitle(title) {
    this.titleEl.textContent = title;
    document.title = title;
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }

  show() {
    this.root.classList.remove('hidden');
  }
  hide() {
    this.root.classList.add('hidden');
  }
}
