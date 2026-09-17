import * as THREE from 'three';

const DRAG_CLICK_THRESHOLD = 6; // px — below this we treat the interaction as a click, not a look-drag

/**
 * Seated-camera look controls for desktop preview: click-and-drag to look
 * around (yaw/pitch only — no strafing, no roll, no forced rotation), and a
 * plain click (no meaningful drag) is forwarded as a selection attempt.
 */
export class DesktopLook {
  constructor(camera, domElement, onClickSelect) {
    this.camera = camera;
    this.dom = domElement;
    this.onClickSelect = onClickSelect;
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;
    // When a gyroscope is actively driving the camera (mobile), drag should
    // still register taps for answer selection but must not fight the
    // gyro's per-frame rotation updates.
    this.suppressLook = false;

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._moveDist = 0;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  disable() {
    this.enabled = false;
    this.dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
  }

  _onPointerDown(e) {
    this._dragging = true;
    this._moveDist = 0;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this._moveDist += Math.abs(dx) + Math.abs(dy);

    if (this.suppressLook) return;

    this.yaw -= dx * 0.0035;
    this.pitch -= dy * 0.0035;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.0, 1.0);
    this._applyRotation();
  }

  _onPointerUp(e) {
    this._dragging = false;
    if (this._moveDist < DRAG_CLICK_THRESHOLD) {
      this.onClickSelect?.(e.clientX, e.clientY);
    }
  }

  _applyRotation() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this._applyRotation();
  }
}
