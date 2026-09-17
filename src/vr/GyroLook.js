import * as THREE from 'three';

// Compact adaptation of the classic three.js DeviceOrientationControls pattern.
// Used only where supported; desktop drag-look remains available as a manual
// override at all times, so nothing breaks if a device reports bad/no data.
const ZEE = new THREE.Vector3(0, 0, 1);
const EULER = new THREE.Euler();
const Q0 = new THREE.Quaternion();
const Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

export class GyroLook {
  constructor(camera) {
    this.camera = camera;
    this.enabled = false;
    this.deviceOrientation = {};
    this.screenOrientation = window.orientation || 0;
    this._onDeviceOrientation = this._onDeviceOrientation.bind(this);
    this._onScreenOrientation = this._onScreenOrientation.bind(this);
  }

  static isSupported() {
    return typeof window.DeviceOrientationEvent !== 'undefined';
  }

  /** Must be called from a user gesture on iOS 13+. Returns true if active. */
  async requestPermissionAndEnable() {
    if (!GyroLook.isSupported()) return false;
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') return false;
      }
      window.addEventListener('deviceorientation', this._onDeviceOrientation);
      window.addEventListener('orientationchange', this._onScreenOrientation);
      this.enabled = true;
      return true;
    } catch (err) {
      console.warn('Gyroscope controls unavailable:', err);
      return false;
    }
  }

  disable() {
    this.enabled = false;
    window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    window.removeEventListener('orientationchange', this._onScreenOrientation);
  }

  _onDeviceOrientation(e) {
    this.deviceOrientation = e;
  }
  _onScreenOrientation() {
    this.screenOrientation = window.orientation || 0;
  }

  update() {
    if (!this.enabled) return;
    const { alpha, beta, gamma } = this.deviceOrientation;
    if (alpha == null) return;

    const alphaRad = THREE.MathUtils.degToRad(alpha);
    const betaRad = THREE.MathUtils.degToRad(beta || 0);
    const gammaRad = THREE.MathUtils.degToRad(gamma || 0);
    const orientRad = THREE.MathUtils.degToRad(this.screenOrientation || 0);

    EULER.set(betaRad, alphaRad, -gammaRad, 'YXZ');
    this.camera.quaternion.setFromEuler(EULER);
    this.camera.quaternion.multiply(Q1);
    this.camera.quaternion.multiply(Q0.setFromAxisAngle(ZEE, -orientRad));
  }
}
