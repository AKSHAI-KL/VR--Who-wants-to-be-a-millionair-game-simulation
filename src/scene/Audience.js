import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SHIRT_PALETTE = ['#4a4a68', '#5c3b6b', '#3b5c6b', '#6b4a3b', '#3b4a6b', '#5b5b5b'];
const SKIN_PALETTE = ['#e8b48c', '#c68a5e', '#8d5a3c', '#f0d0a8'];
const GOLD = '#f2c94c';

// ---------------------------------------------------------------------------
// The crowd wraps almost all the way *around* the contestant instead of
// sitting in one bank behind them. Angles are measured from the direction the
// player faces (the host and the video wall), so:
//
//      0° = straight ahead (host — deliberately kept clear)
//     48° = front-left / front-right   → first seats, just past the stage
//     90° = directly left / right
//    180° = directly behind
//    312° = front-right / front-left  → last seats, other side
//
// The 96° front cone stays empty so the host and the main screen are never
// blocked; everything else is seating. Rows step outwards and upwards so the
// contestant really feels like they are sitting in the middle of a studio
// audience.
// ---------------------------------------------------------------------------
const ARC_START_DEG = 48;
const ARC_END_DEG = 312;
const EDGE_INSET_DEG = 4; // keeps the two arc ends from crowding the front gap
const ROWS = 5;
const BASE_RADIUS = 6.0;
const ROW_RADIUS_STEP = 0.95;
const ROW_HEIGHT_STEP = 0.36;
const SEAT_SPACING = 0.9; // metres of arc between two seats
const TIER_THICKNESS = 0.35;
const TIER_SEGMENT = 1.1; // metres of arc per riser box

// An arm per audience member, pivoted at the shoulder (the geometry hangs
// below its origin, so rotating the instance swings the arm). It hangs down at
// rest and is thrown up when the crowd is asked to vote — see the 'vote'
// reaction.
const ARM = {
  side: 0.19,        // shoulder offset from the body's centre, along local X
  shoulderY: 0.18,
  thickness: 0.075,
  length: 0.34,
  downAngle: 0.16,
  upAngle: 2.92,     // nearly straight up: reads as hands aloft, not a thicket
  wobble: 0.1        // waving, so the raised hands aren't a frozen statue
};

// The 'vote' reaction (used by the ask-the-audience lifeline): livelier than
// idle, calmer than applause, and with hands going up *around* the room — each
// member starts raising a beat after their neighbour.
const VOTE = { bobAmp: 0.035, bobSpeed: 5.5, yawWobble: 0.14, yawSpeed: 1.7, raiseSpeed: 3.4, stagger: 0.5 };

/**
 * The studio audience: tiered seating arranged in a broad arc around the
 * player, built from three InstancedMeshes (riser steps, bodies, heads) so a
 * large crowd stays cheap to render and animate. Reactions are expressed as
 * one shared animation applied across all instances rather than per-character
 * rigs, and the per-frame update writes straight into the instance matrices
 * (only the Y translation changes) to keep the cost flat for VR.
 */
export class Audience {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Audience';
    scene.add(this.group);

    this.reaction = 'idle';
    this._t = 0;
    this._colorsDirty = false;
    this._tmpColor = new THREE.Color();
    this._gold = new THREE.Color(GOLD);
    // 0 = hands down, 1 = every hand up. Eased, so the crowd rises as a wave.
    this._raise = 0;
    this._armsApplied = false;
    this._dummy = new THREE.Object3D();

    this._planSeats();
    this._buildTiers();
    this._buildCrowd();
  }

  /** Works out where every seat and every riser step goes. */
  _planSeats() {
    const start = THREE.MathUtils.degToRad(ARC_START_DEG + EDGE_INSET_DEG);
    const end = THREE.MathUtils.degToRad(ARC_END_DEG - EDGE_INSET_DEG);

    this._seats = [];
    this._tierSegments = [];

    for (let r = 0; r < ROWS; r++) {
      const radius = BASE_RADIUS + r * ROW_RADIUS_STEP;
      const y = r * ROW_HEIGHT_STEP;
      const arcLength = (end - start) * radius;

      const seatCount = Math.max(12, Math.round(arcLength / SEAT_SPACING));
      for (let s = 0; s < seatCount; s++) {
        const t = seatCount === 1 ? 0.5 : s / (seatCount - 1);
        this._seats.push({
          angle: start + t * (end - start),
          radius,
          y,
          jitter: Math.random() - 0.5
        });
      }

      const segmentCount = Math.max(6, Math.round(arcLength / TIER_SEGMENT));
      for (let k = 0; k < segmentCount; k++) {
        const mid = start + ((k + 0.5) / segmentCount) * (end - start);
        this._tierSegments.push({
          angle: mid,
          radius,
          y,
          // small overlap between neighbours so no gaps show through
          width: radius * ((end - start) / segmentCount) + 0.12
        });
      }
    }

    this.count = this._seats.length;
  }

  _buildTiers() {
    const geo = new THREE.BoxGeometry(1, TIER_THICKNESS, 1);
    const mat = new THREE.MeshStandardMaterial({ color: '#14112a', roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(geo, mat, this._tierSegments.length);
    mesh.name = 'AudienceTiers';
    const dummy = new THREE.Object3D();

    this._tierSegments.forEach((seg, i) => {
      dummy.position.set(
        Math.sin(seg.angle) * seg.radius,
        seg.y - TIER_THICKNESS / 2,
        -Math.cos(seg.angle) * seg.radius
      );
      dummy.rotation.set(0, -seg.angle, 0);
      dummy.scale.set(seg.width, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  _buildCrowd() {
    const bodyGeo = new THREE.BoxGeometry(0.34, 0.5, 0.28);
    const headGeo = new THREE.BoxGeometry(0.22, 0.22, 0.2);
    this.bodyMesh = new THREE.InstancedMesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      this.count
    );
    this.headMesh = new THREE.InstancedMesh(
      headGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      this.count
    );
    this.bodyMesh.name = 'AudienceBodies';
    this.headMesh.name = 'AudienceHeads';

    // A forearm with a chunky hand on the end, so a raised arm reads as a hand
    // rather than a stick from across the studio. The origin is the shoulder.
    const forearm = new THREE.BoxGeometry(ARM.thickness, ARM.length, ARM.thickness);
    forearm.translate(0, -ARM.length / 2, 0);
    const hand = new THREE.BoxGeometry(ARM.thickness * 1.5, ARM.thickness * 1.6, ARM.thickness * 1.5);
    hand.translate(0, -ARM.length, 0);
    const armGeo = mergeGeometries([forearm, hand]);
    this.armMesh = new THREE.InstancedMesh(
      armGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      this.count
    );
    this.armMesh.name = 'AudienceArms';

    // Kept so the per-frame update can rewrite only the Y translation (and,
    // while voting, the yaw) of each instance instead of re-composing a full
    // matrix for the whole crowd.
    this.baseY = new Float32Array(this.count);
    this.baseShirt = [];
    this._phases = new Float32Array(this.count);
    this._x = new Float32Array(this.count);
    this._z = new Float32Array(this.count);
    this._yaw = new Float32Array(this.count);
    this._scale = new Float32Array(this.count);
    this._armSide = new Float32Array(this.count);
    this._stagger = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this._phases[i] = Math.random() * Math.PI * 2;

    const dummy = new THREE.Object3D();
    this._seats.forEach((seat, i) => {
      const x = Math.sin(seat.angle) * seat.radius + seat.jitter * 0.18;
      const z = -Math.cos(seat.angle) * seat.radius + seat.jitter * 0.12;
      const bodyY = seat.y + 0.55;
      const scale = 0.85 + ((i * 37) % 100) / 100 * 0.3;
      // ry = -angle makes the local +Z (the character's front) point back at
      // the player, wherever they sit on the arc.
      const yaw = -seat.angle + seat.jitter * 0.35;

      dummy.position.set(x, bodyY, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.bodyMesh.setMatrixAt(i, dummy.matrix);
      this.baseY[i] = bodyY;

      dummy.position.y = bodyY + 0.36;
      dummy.updateMatrix();
      this.headMesh.setMatrixAt(i, dummy.matrix);

      const shirt = new THREE.Color(SHIRT_PALETTE[Math.floor(Math.random() * SHIRT_PALETTE.length)]);
      const skin = new THREE.Color(SKIN_PALETTE[Math.floor(Math.random() * SKIN_PALETTE.length)]);
      this.bodyMesh.setColorAt(i, shirt);
      this.headMesh.setColorAt(i, skin);
      this.baseShirt.push(shirt);

      // Arms: one per member, matching their skin, hanging at rest.
      const side = i % 2 === 0 ? 1 : -1;
      this._x[i] = x;
      this._z[i] = z;
      this._yaw[i] = yaw;
      this._scale[i] = scale;
      this._armSide[i] = side;
      // Spread the raise out along the arc so the room goes up as a wave.
      this._stagger[i] = ((i * 17) % 100) / 100 * VOTE.stagger;

      dummy.position.set(x + Math.cos(yaw) * side * ARM.side * scale, bodyY + ARM.shoulderY * scale, z - Math.sin(yaw) * side * ARM.side * scale);
      dummy.rotation.set(0, yaw, side * ARM.downAngle);
      dummy.updateMatrix();
      this.armMesh.setMatrixAt(i, dummy.matrix);
      this.armMesh.setColorAt(i, skin);
    });

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.bodyMesh.instanceColor.needsUpdate = true;
    this.headMesh.instanceColor.needsUpdate = true;
    this.armMesh.instanceMatrix.needsUpdate = true;
    this.armMesh.instanceColor.needsUpdate = true;

    this.group.add(this.bodyMesh, this.headMesh, this.armMesh);
  }

  setReaction(reaction) {
    this.reaction = reaction;
  }

  update(dt) {
    this._t += dt;

    const voting = this.reaction === 'vote';
    let bobAmp = 0.012;
    let bobSpeed = 1.2;
    let slump = 0;
    let colorMix = 0;

    if (voting) {
      // Ask the audience: the room comes alive, but stays short of applause.
      bobAmp = VOTE.bobAmp;
      bobSpeed = VOTE.bobSpeed;
      colorMix = 0.22;
    } else if (this.reaction === 'applause' || this.reaction === 'celebrate') {
      bobAmp = 0.06;
      bobSpeed = 9;
      colorMix = this.reaction === 'celebrate' ? 0.5 : 0.3;
    } else if (this.reaction === 'disappointed') {
      // Wrong answer: the crowd sinks into their seats and goes quiet.
      bobAmp = 0.004;
      bobSpeed = 0.6;
      slump = 0.07;
    }

    // Hands go up as a wave while voting, and back down afterwards. Once they
    // are settled down again the per-frame arm work stops entirely.
    this._raise = THREE.MathUtils.damp(this._raise, voting ? 1 : 0, VOTE.raiseSpeed, dt);
    if (!voting && this._raise < 0.002) this._raise = 0;
    const arms = voting || this._raise > 0;
    const resetArms = !arms && this._armsApplied;
    const dummy = this._dummy;

    const bodyArr = this.bodyMesh.instanceMatrix.array;
    const headArr = this.headMesh.instanceMatrix.array;
    const armArr = this.armMesh.instanceMatrix.array;
    for (let i = 0; i < this.count; i++) {
      const base = i * 16;
      const bob = Math.max(Math.sin(this._t * bobSpeed + this._phases[i]) * bobAmp, -0.002);
      const y = this.baseY[i] + bob - slump;
      bodyArr[base + 13] = y;
      headArr[base + 13] = y + 0.36;

      // While voting the members turn and murmur to each other, so the room
      // reads as a crowd conferring rather than a wall of statues.
      let yaw = this._yaw[i];
      if (voting) {
        yaw += Math.sin(this._t * VOTE.yawSpeed + this._phases[i]) * VOTE.yawWobble;
        const s = Math.sin(yaw) * this._scale[i];
        const c = Math.cos(yaw) * this._scale[i];
        bodyArr[base] = c;
        bodyArr[base + 2] = -s;
        bodyArr[base + 8] = s;
        bodyArr[base + 10] = c;
        headArr[base] = c;
        headArr[base + 2] = -s;
        headArr[base + 8] = s;
        headArr[base + 10] = c;
      }

      if (arms || resetArms) {
        const side = this._armSide[i];
        const f = resetArms ? 0 : Math.min(1, Math.max(0, this._raise * 1.6 - this._stagger[i]));
        const swing = ARM.downAngle + (ARM.upAngle - ARM.downAngle) * f;
        const wave = voting ? Math.sin(this._t * 3.1 + this._phases[i]) * ARM.wobble * f : 0;
        const lx = side * ARM.side * this._scale[i];
        dummy.position.set(
          this._x[i] + Math.cos(yaw) * lx,
          y + ARM.shoulderY * this._scale[i],
          this._z[i] - Math.sin(yaw) * lx
        );
        dummy.rotation.set(0, yaw, side * (swing + wave));
        dummy.scale.setScalar(this._scale[i]);
        dummy.updateMatrix();
        this.armMesh.setMatrixAt(i, dummy.matrix);
      }

      // Ride the same bob as the body, so a raised hand never drifts off its
      // owner (and applause doesn't leave the arms behind).
      armArr[base + 13] = y + ARM.shoulderY * this._scale[i];
    }
    this.armMesh.instanceMatrix.needsUpdate = true;
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    if (arms || resetArms) this._armsApplied = arms;

    if (colorMix > 0) {
      for (let i = 0; i < this.count; i++) {
        const flash = (Math.sin(this._t * bobSpeed + this._phases[i]) + 1) / 2;
        this._tmpColor.copy(this.baseShirt[i]).lerp(this._gold, colorMix * flash);
        this.bodyMesh.setColorAt(i, this._tmpColor);
      }
      this.bodyMesh.instanceColor.needsUpdate = true;
      this._colorsDirty = true;
    } else if (this._colorsDirty) {
      for (let i = 0; i < this.count; i++) this.bodyMesh.setColorAt(i, this.baseShirt[i]);
      this.bodyMesh.instanceColor.needsUpdate = true;
      this._colorsDirty = false;
    }
  }
}
