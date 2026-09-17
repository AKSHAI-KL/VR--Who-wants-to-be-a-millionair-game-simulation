import * as THREE from 'three';
import facePhotoUrl from '../assets/host-face.jpg';

const SKIN = '#e8b48c';

// ---------------------------------------------------------------------------
// The host's face
//
// The portrait is cropped to the *head only* — hair crown down to the chin,
// shoulders and collar left behind — and its measured outline becomes the
// head's geometry, so the photo isn't a picture sitting on a box: the face is
// the head's front face and the silhouette is the head's silhouette. Sizes
// below are in the head's local units unless marked as image fractions.
//
// Measured off the photo (225x225): the head spans x 30-185, y 0-205, i.e. a
// 155x205 crop. The body is untouched — only the head changes shape.
const FACE_CROP = { x: 30 / 225, y: 0, w: 155 / 225, h: 205 / 225 };
// Canvas keeps the crop's aspect (155:205) exactly, so nothing is stretched.
const FACE_CANVAS = { w: 310, h: 410 };
const HEAD_W = 0.25;
const HEAD_H = HEAD_W * (FACE_CANVAS.h / FACE_CANVAS.w);
const HEAD_D = 0.25;
const HEAD_BOTTOM = 0.045;

// The portrait was shot against a bright studio wall, so the background is
// keyed out by brightness (the face never goes above ~219 on its dimmest
// channel, the wall never below ~238).
const FACE_KEY = { opaqueBelow: 222, clearAbove: 236 };
// The photo's rim carries a pixel or two of blended wall into the hair, so the
// texture is faded in just inside the silhouette — the head's *geometry* is the
// hard edge, and an opaque fringe would show up as a bright outline.
const FACE_EDGE_SOFT = 0.018; // fraction of the crop width

// The photo's own head outline, read off its silhouette as a half-width (as a
// fraction of the crop width) per row (as a fraction of the crop height):
// narrow at the clipped crown, full width across the temples, tapering to the
// chin. These numbers are also the head's *geometry* (see buildHeadGeometry) —
// the photo is the head's front face and its outline is the head's outline.
// Below the jaw the outline stops following the silhouette, which is what
// leaves the portrait's collar and shoulders out of the model.
const HEAD_OUTLINE = [
  [0.00, 0.158], [0.05, 0.323], [0.12, 0.423], [0.24, 0.477],
  [0.28, 0.487], [0.49, 0.452], [0.59, 0.448], [0.68, 0.416],
  [0.78, 0.403], [0.85, 0.425], [0.88, 0.435], [0.92, 0.32],
  [0.96, 0.26], [1.00, 0.229]
];

// Side walls run from the chin (skin) up through the hairline to the crown.
// v = 0 at the chin, 1 at the crown; the photo's forehead starts ~28% down.
const HAIR = '#23282c';
const WALL_RAMP = { skinTo: 0.66, hairFrom: 0.78 };

/** Half-width of the head at row `t` (0 = crown, 1 = chin), in crop width fractions. */
function headHalfWidth(t) {
  const pts = HEAD_OUTLINE;
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [y0, w0] = pts[i - 1];
      const [y1, w1] = pts[i];
      const k = (t - y0) / (y1 - y0);
      return w0 + (w1 - w0) * k;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * The head itself: the photo's silhouette, extruded to give the head depth.
 * Two materials — the front/back caps carry the portrait, the extruded sides
 * carry a chin-to-crown skin/hair ramp (their UVs are rewritten to run up the
 * head rather than around the outline).
 */
function buildHeadGeometry() {
  const steps = 56;
  const points = [];
  // Walk the outline: down one side from the crown to the chin, then back up
  // the other. (ExtrudeGeometry normalises the winding either way.)
  for (const side of [-1, 1]) {
    for (let i = 0; i <= steps; i++) {
      const t = side < 0 ? i / steps : 1 - i / steps;
      points.push(new THREE.Vector2(side * headHalfWidth(t) * HEAD_W, HEAD_H * (1 - t)));
    }
  }
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: HEAD_D,
    bevelEnabled: false
  });
  geometry.translate(0, 0, -HEAD_D / 2);
  geometry.computeVertexNormals();

  // Cap UVs come out as raw shape coordinates (metres), so scale them to the
  // portrait. Side-wall UVs are rewritten to sample the vertical ramp.
  const uv = geometry.attributes.uv;
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nor.getZ(i)) > 0.9) {
      uv.setXY(i, pos.getX(i) / HEAD_W + 0.5, pos.getY(i) / HEAD_H);
    } else {
      uv.setXY(i, 0.5, pos.getY(i) / HEAD_H);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Vertical chin(skin) -> crown(hair) gradient for the head's sides. */
function buildWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // flipY is on, so the canvas top row is v = 1 (the crown).
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, HAIR);
  gradient.addColorStop(1 - WALL_RAMP.hairFrom, HAIR);
  gradient.addColorStop(1 - WALL_RAMP.skinTo, SKIN);
  gradient.addColorStop(1, SKIN);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const BLAZER = '#2a1f5c';
const SHIRT = '#e9e6f5';
const TROUSERS = '#171233';
const SHOE = '#0c0a1a';

// Per-animation-state pose targets. Values are radians / unit-less bob params.
// Everything is procedural (no skeletal rig / mocap) — deliberately simple,
// slightly exaggerated, in keeping with the low-poly aesthetic.
const POSES = {
  idle: { armX: 0.05, armZ: 0.12, headX: 0, headY: 0, bobAmp: 0.01, bobSpeed: 1.4, clap: false, torsoLean: 0 },
  talking: { armX: 0.1, armZ: 0.18, headX: -0.03, headY: 0, bobAmp: 0.012, bobSpeed: 2.2, clap: false, torsoLean: 0 },
  welcoming: { armX: -0.9, armZ: 0.9, headX: -0.08, headY: 0, bobAmp: 0.02, bobSpeed: 1.6, clap: false, torsoLean: 0.02 },
  gesture: { armX: -0.6, armZ: 0.5, headX: 0, headY: 0.15, bobAmp: 0.015, bobSpeed: 2, clap: false, torsoLean: 0 },
  pointing: { armX: -0.3, armZ: 0.55, headX: 0, headY: -0.15, bobAmp: 0.01, bobSpeed: 1.4, clap: false, torsoLean: -0.03, oneArm: true },
  thinking: { armX: -1.7, armZ: 0.25, headX: 0.15, headY: 0.2, bobAmp: 0.008, bobSpeed: 1, clap: false, torsoLean: 0.05, oneArm: true },
  celebrating: { armX: -2.7, armZ: 0.35, headX: -0.1, headY: 0, bobAmp: 0.05, bobSpeed: 5, clap: false, torsoLean: 0 },
  disappointed: { armX: 0.3, armZ: 0.1, headX: 0.35, headY: 0, bobAmp: 0.005, bobSpeed: 0.8, clap: false, torsoLean: -0.1, slump: true },
  finalCongrats: { armX: -2.3, armZ: 0.3, headX: -0.05, headY: 0, bobAmp: 0.04, bobSpeed: 6, clap: true, torsoLean: 0 }
};

export class Host {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Host';
    this.group.position.set(0, 0, -3.2);
    scene.add(this.group);

    this._buildBody();

    this.pose = { ...POSES.idle };
    this.targetPoseName = 'idle';
    this._t = 0;
    this._baseY = 0.15;
  }

  _buildBody() {
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
    const blazerMat = new THREE.MeshStandardMaterial({ color: BLAZER, roughness: 0.6, metalness: 0.1 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.7 });
    const trouserMat = new THREE.MeshStandardMaterial({ color: TROUSERS, roughness: 0.7 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: SHOE, roughness: 0.5 });

    // Legs
    this.legs = new THREE.Group();
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.2), trouserMat);
      leg.position.set(side * 0.11, 0.375, 0);
      this.legs.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), shoeMat);
      shoe.position.set(side * 0.11, 0.05, 0.05);
      this.legs.add(shoe);
    }
    this.group.add(this.legs);

    // Torso (hips pivot lets us "lean")
    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.set(0, 0.75, 0);
    this.group.add(this.torsoPivot);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), blazerMat);
    torso.position.set(0, 0.31, 0);
    this.torsoPivot.add(torso);

    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.03), shirtMat);
    shirt.position.set(0, 0.34, 0.14);
    this.torsoPivot.add(shirt);

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    tie.position.set(0, 0.3, 0.16);
    this.torsoPivot.add(tie);

    // Neck + head
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.66, 0);
    this.torsoPivot.add(this.headPivot);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), skinMat);
    neck.position.set(0, 0.02, 0);
    this.headPivot.add(neck);

    // The head is the portrait's own outline, extruded for depth: the photo is
    // its front face, so the face *is* the head's shape rather than a picture
    // pasted onto a box. The body below is untouched.
    this.faceTexture = this._buildFaceTexture();
    const faceMat = new THREE.MeshBasicMaterial({
      map: this.faceTexture,
      transparent: true,
      depthWrite: false
    });
    const wallMat = new THREE.MeshStandardMaterial({ map: buildWallTexture(), roughness: 0.8 });
    const head = new THREE.Mesh(buildHeadGeometry(), [faceMat, wallMat]);
    head.position.set(0, HEAD_BOTTOM, 0);
    this.headPivot.add(head);

    // Arms: shoulder pivot -> upper arm -> elbow pivot -> forearm+hand
    this.arms = {};
    for (const side of [-1, 1]) {
      const key = side < 0 ? 'left' : 'right';
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.29, 0.55, 0);
      this.torsoPivot.add(shoulderPivot);

      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.15), blazerMat);
      upperArm.position.set(0, -0.16, 0);
      shoulderPivot.add(upperArm);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.32, 0);
      shoulderPivot.add(elbowPivot);

      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.28, 0.13), shirtMat);
      forearm.position.set(0, -0.14, 0);
      elbowPivot.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), skinMat);
      hand.position.set(0, -0.3, 0);
      elbowPivot.add(hand);

      this.arms[key] = { shoulderPivot, elbowPivot, side };
    }
  }

  /**
   * Builds the head's face texture. The portrait photo is painted into the
   * canvas as soon as it decodes; until then (and if it ever fails to load) a
   * drawn eyes-and-eyebrows face is used, so the host is never left blank.
   */
  _buildFaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = FACE_CANVAS.w;
    canvas.height = FACE_CANVAS.h;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    this._paintDrawnFace(ctx, canvas);
    const img = new Image();
    img.onload = () => {
      this._paintPortrait(ctx, canvas, img);
      tex.needsUpdate = true;
    };
    img.onerror = () => console.warn('Host portrait failed to load; keeping the drawn face.');
    img.src = facePhotoUrl;
    return tex;
  }

  /**
   * Crops the portrait to the head, keys the bright studio wall out of it and
   * shapes what is left to the head's outline.
   */
  _paintPortrait(ctx, canvas, img) {
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(
      img,
      FACE_CROP.x * img.width, FACE_CROP.y * img.height,
      FACE_CROP.w * img.width, FACE_CROP.h * img.height,
      0, 0, w, h
    );

    const frame = ctx.getImageData(0, 0, w, h);
    const px = frame.data;
    const range = FACE_KEY.clearAbove - FACE_KEY.opaqueBelow;
    const soft = FACE_EDGE_SOFT * w;
    for (let y = 0; y < h; y++) {
      const half = headHalfWidth(y / (h - 1)) * w;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;

        // 1) Bright studio wall -> transparent, the face and hair stay.
        const brightness = Math.min(px[i], px[i + 1], px[i + 2]);
        let alpha = (FACE_KEY.clearAbove - brightness) / range;
        alpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;

        // 2) Fade the last couple of pixels out towards the silhouette edge, so
        //    the wall the photo blends into its rim never renders as a fringe.
        const inside = half - Math.abs(x - w / 2);
        alpha *= inside <= 0 ? 0 : inside >= soft ? 1 : inside / soft;

        px[i + 3] = Math.round(px[i + 3] * alpha);
      }
    }
    ctx.putImageData(frame, 0, 0);
  }

  /**
   * Fallback face, used only if the portrait asset is unavailable. It fills the
   * face rather than only drawing features on it — the head's front cap *is*
   * this texture, so a transparent one would leave you looking through him.
   */
  _paintDrawnFace(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = HAIR;
    ctx.fillRect(0, 0, w, h * (1 - WALL_RAMP.hairFrom));
    ctx.fillStyle = SKIN;
    ctx.fillRect(0, h * (1 - WALL_RAMP.hairFrom), w, h * WALL_RAMP.hairFrom);
    const eyeY = h * 0.52;
    const eyeDx = w * 0.2;
    const eyeR = w * 0.06;

    ctx.strokeStyle = '#2b2117';
    ctx.lineWidth = w * 0.035;
    ctx.beginPath();
    ctx.moveTo(w / 2 - eyeDx - eyeR, eyeY - h * 0.1);
    ctx.lineTo(w / 2 - eyeDx + eyeR, eyeY - h * 0.13);
    ctx.moveTo(w / 2 + eyeDx - eyeR, eyeY - h * 0.13);
    ctx.lineTo(w / 2 + eyeDx + eyeR, eyeY - h * 0.1);
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(w / 2 - eyeDx, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(w / 2 + eyeDx, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(w / 2 - eyeDx + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.3, 0, Math.PI * 2);
    ctx.arc(w / 2 + eyeDx + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  setAnimState(name) {
    this.targetPoseName = POSES[name] ? name : 'idle';
  }

  update(dt) {
    this._t += dt;
    const target = POSES[this.targetPoseName] || POSES.idle;
    const lerpSpeed = 4 * dt;

    // Smoothly ease current pose params toward target.
    for (const k of ['armX', 'armZ', 'headX', 'headY', 'bobAmp', 'bobSpeed', 'torsoLean']) {
      this.pose[k] = THREE.MathUtils.lerp(this.pose[k], target[k] ?? 0, lerpSpeed);
    }

    const bob = Math.sin(this._t * this.pose.bobSpeed) * this.pose.bobAmp;
    this.group.position.y = bob;
    this.torsoPivot.rotation.z = this.pose.torsoLean + (target.slump ? -0.06 : 0);
    this.torsoPivot.position.y = 0.75 - (target.slump ? 0.03 : 0);

    this.headPivot.rotation.x = this.pose.headX;
    this.headPivot.rotation.y = this.pose.headY + Math.sin(this._t * 0.5) * 0.03;

    const oneArm = Boolean(target.oneArm);
    for (const key of ['left', 'right']) {
      const arm = this.arms[key];
      const isActive = !oneArm || key === 'right';
      const armX = isActive ? this.pose.armX : this.pose.armX * 0.15;
      const armZ = (this.pose.armZ * (key === 'left' ? -1 : 1)) * (isActive ? 1 : 0.3);
      arm.shoulderPivot.rotation.x = armX;
      arm.shoulderPivot.rotation.z = armZ;

      if (target.clap) {
        arm.elbowPivot.rotation.x = -0.4 + Math.sin(this._t * 14 + (key === 'left' ? Math.PI : 0)) * 0.35;
      } else {
        arm.elbowPivot.rotation.x = THREE.MathUtils.lerp(arm.elbowPivot.rotation.x, -0.15, lerpSpeed);
      }
    }
  }
}
