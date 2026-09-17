import * as THREE from 'three';

/**
 * The room shell: glossy stage floor, dark walls/ceiling, and a floor seam
 * that separates the stage area (front) from the audience area (rear).
 * Deliberately low-poly and low-texture for VR performance.
 */
export class Studio {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Studio';
    scene.add(this.group);

    this._buildFloor();
    this._buildWalls();
    this._buildCeiling();
  }

  _buildFloor() {
    const floorGeo = new THREE.CircleGeometry(11, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0d0b1f',
      metalness: 0.6,
      roughness: 0.25
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.group.add(floor);

    // Subtle concentric ring accents to break up the floor without extra textures.
    for (const r of [3.2, 6.4, 9.4]) {
      const ringGeo = new THREE.RingGeometry(r, r + 0.05, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#5a3fc0',
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      this.group.add(ring);
    }
  }

  _buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#120f26',
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.BackSide
    });
    const wallGeo = new THREE.CylinderGeometry(11, 11, 7, 32, 1, true);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 3.5;
    this.group.add(wall);

    // A soft vertical light strip band around the wall for atmosphere.
    const bandGeo = new THREE.CylinderGeometry(10.95, 10.95, 0.25, 32, 1, true);
    const bandMat = new THREE.MeshBasicMaterial({
      color: '#f2c94c',
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide
    });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = 2.2;
    this.group.add(band);
  }

  _buildCeiling() {
    const ceilGeo = new THREE.CircleGeometry(11, 32);
    const ceilMat = new THREE.MeshStandardMaterial({ color: '#060510', roughness: 1 });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 7;
    this.group.add(ceiling);

    // A grid of small emissive rig lights on the ceiling (visual only, not real lights)
    const rigGeo = new THREE.BoxGeometry(0.25, 0.08, 0.25);
    const rigMat = new THREE.MeshBasicMaterial({ color: '#ffe3a8' });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const rig = new THREE.Mesh(rigGeo, rigMat);
      rig.position.set(Math.cos(angle) * 4, 6.9, Math.sin(angle) * 4);
      this.group.add(rig);
    }
  }
}
