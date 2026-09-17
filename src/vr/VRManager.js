import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

/**
 * Wraps WebXR session setup and VR controller pointing/selection. Both
 * controllers get a visible ray + reticle; a trigger ("select") press
 * raycasts against the same interactive mesh list the desktop mode uses,
 * so VR and desktop share one selection code path (see main.js).
 */
export class VRManager {
  constructor(renderer, scene, camera, { onSelect, getInteractiveMeshes }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.onSelect = onSelect;
    this.getInteractiveMeshes = getInteractiveMeshes;
    this.raycaster = new THREE.Raycaster();

    renderer.xr.enabled = true;
    this.controllers = [0, 1].map((i) => this._buildController(i));
  }

  /** Returns the VRButton DOM element (already handles unsupported/blocked states). */
  createButton() {
    const button = VRButton.createButton(this.renderer);
    // Undo the library's fixed positioning; caller places it inside their own layout.
    button.style.position = 'static';
    button.style.margin = '0';
    this.buttonEl = button;
    return button;
  }

  async isSupported() {
    if (!('xr' in navigator)) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      return false;
    }
  }

  _buildController(index) {
    const controller = this.renderer.xr.getController(index);
    controller.userData.active = false;

    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5)
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#f2c94c' }));
    line.scale.z = 1;
    line.name = 'ray';
    controller.add(line);

    controller.addEventListener('connected', () => {
      controller.userData.active = true;
    });
    controller.addEventListener('disconnected', () => {
      controller.userData.active = false;
    });
    controller.addEventListener('selectstart', () => this._trySelect(controller));

    this.scene.add(controller);
    return controller;
  }

  _trySelect(controller) {
    const meshes = this.getInteractiveMeshes?.() || [];
    if (!meshes.length) return;
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length) this.onSelect?.(hits[0].object);
  }
}
