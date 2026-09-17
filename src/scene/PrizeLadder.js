import * as THREE from 'three';

function formatPrize(amount) {
  return '\u20B9' + Math.round(amount).toLocaleString('en-IN');
}

/**
 * A vertical prize ladder rendered to a single canvas texture (cheap: one
 * draw call, one plane) placed to the side of the main screen, within the
 * player's forward field of view.
 */
export class PrizeLadder {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'PrizeLadder';
    scene.add(this.group);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 360;
    this.canvas.height = 640;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // Hung beside the video wall and above the answer panels' line of sight,
    // so it stays readable for the whole game without ever covering the host.
    const geo = new THREE.PlaneGeometry(0.95, 1.7);
    const mat = new THREE.MeshBasicMaterial({ map: this.texture });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(2.5, 3.2, -4.35);
    this.mesh.rotation.y = -0.35;
    this.group.add(this.mesh);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.03, 1.78, 0.05),
      new THREE.MeshStandardMaterial({ color: '#0a0818', metalness: 0.6, roughness: 0.3 })
    );
    frame.position.copy(this.mesh.position);
    // Push the frame backwards along the panel's own normal rather than along
    // world -Z, otherwise its edge pokes through the rotated panel face.
    frame.position.x -= Math.sin(this.mesh.rotation.y) * 0.06;
    frame.position.z -= Math.cos(this.mesh.rotation.y) * 0.06;
    frame.rotation.y = this.mesh.rotation.y;
    this.group.add(frame);

    this.prizes = [];
    this.currentTierIndex = -1;
  }

  setPrizes(prizes) {
    this.prizes = [...prizes];
    this.draw();
  }

  setCurrentTier(index) {
    this.currentTierIndex = index;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0b1030';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#f2c94c';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PRIZE LADDER', w / 2, 44);
    ctx.textAlign = 'left';

    const highToLow = [...this.prizes].map((p, i) => ({ p, tier: i })).sort((a, b) => b.p - a.p);
    const rowH = (h - 80) / highToLow.length;

    highToLow.forEach((entry, displayIndex) => {
      const y = 70 + displayIndex * rowH;
      const isCurrent = entry.tier === this.currentTierIndex;
      ctx.fillStyle = isCurrent ? '#f2c94c' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(16, y, w - 32, rowH - 8);

      ctx.fillStyle = isCurrent ? '#0b1030' : '#cfd6ff';
      ctx.font = isCurrent ? 'bold 26px Arial' : '24px Arial';
      ctx.fillText(`${entry.tier + 1}.`, 30, y + rowH / 2 + 8);
      ctx.fillText(formatPrize(entry.p), 76, y + rowH / 2 + 8);
    });

    this.texture.needsUpdate = true;
  }
}
