import * as THREE from 'three';

/**
 * The raised stage riser under the host plus simple set-dressing pillars to
 * the left and right, so turning the head left/right (not just dead-ahead
 * or 180° behind) still reveals meaningful studio detail.
 */
export class Stage {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Stage';
    scene.add(this.group);

    this._buildRiser();
    this._buildSidePillars();
    this._buildContestantPodium();
  }

  _buildRiser() {
    const riserMat = new THREE.MeshStandardMaterial({ color: '#1a1533', metalness: 0.4, roughness: 0.4 });
    // Kept flush with the floor (its top face sits at y = 0) so the host — who
    // stands at y = 0 — is never sunk into it up to the ankles from a seated
    // eye line. It reads as a raised stage pad with a gold rim around him.
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.3, 24), riserMat);
    riser.position.set(0, -0.15, -3.2);
    this.group.add(riser);

    const edgeGlow = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.03, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#f2c94c' })
    );
    edgeGlow.rotation.x = Math.PI / 2;
    edgeGlow.position.set(0, 0.02, -3.2);
    this.group.add(edgeGlow);
  }

  _buildSidePillars() {
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#241d47', metalness: 0.5, roughness: 0.4 });
    const screenMat = new THREE.MeshBasicMaterial({ color: '#3fa9f5' });

    for (const side of [-1, 1]) {
      const x = side * 4.6;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.5, 0.6), pillarMat);
      pillar.position.set(x, 2.25, -1.8);
      this.group.add(pillar);

      const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), screenMat);
      monitor.position.set(x, 3.0, -1.44);
      monitor.rotation.y = side > 0 ? -0.5 : 0.5;
      this.group.add(monitor);

      // small spotlight housing (visual only)
      const housing = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: '#111', metalness: 0.7, roughness: 0.3 })
      );
      housing.position.set(x, 4.6, -1.8);
      housing.rotation.x = Math.PI;
      this.group.add(housing);
    }
  }

  _buildContestantPodium() {
    // A small podium/desk in front of the player position — grounds the
    // player's own body in the scene without blocking the view.
    const mat = new THREE.MeshStandardMaterial({ color: '#171331', metalness: 0.5, roughness: 0.35 });
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, 1.0, 16), mat);
    podium.position.set(0, 0.5, -0.9);
    this.group.add(podium);

    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.02, 8, 32),
      new THREE.MeshBasicMaterial({ color: '#f2c94c' })
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, 1.0, -0.9);
    this.group.add(trim);
  }
}
