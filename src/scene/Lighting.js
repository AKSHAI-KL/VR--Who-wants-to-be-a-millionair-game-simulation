import * as THREE from 'three';

// The room's answer to "correct or wrong?": the background wash swings green or
// red to match the banner on the video wall, so the verdict is felt before it
// is read. The host's warm key light is only barely touched, so he stays
// legible while the studio around him changes colour.
const VERDICT_TINT = {
  correct: new THREE.Color('#2fd17a'),
  incorrect: new THREE.Color('#e2453c')
};

/**
 * Builds the studio lighting rig. Kept deliberately cheap: a handful of
 * lights, no real-time shadow maps (VR performance priority), a slow
 * "flash" pulse reserved for celebration moments (kept subtle for VR comfort).
 *
 * `setVerdict('correct' | 'incorrect' | null)` recolours the ambient, rim,
 * screen-glow and audience wash lights (plus a short intensity flash at the
 * moment of the reveal) and fades back out on the next question.
 */
export class Lighting {
  constructor(scene, theme) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Lighting';
    scene.add(this.group);

    const primary = new THREE.Color(theme?.primaryColor || '#7c3aed');

    // Cool ambient wash to establish the blue/purple studio mood.
    this.ambient = new THREE.AmbientLight(primary.clone().lerp(new THREE.Color('#0a0a18'), 0.5), 0.55);
    this.group.add(this.ambient);

    this.hemi = new THREE.HemisphereLight('#4b3f9e', '#08060f', 0.5);
    this.group.add(this.hemi);

    // Warm key light on the host.
    this.hostKey = new THREE.SpotLight('#ffe3a8', 6.5, 14, Math.PI / 6, 0.5, 1.2);
    this.hostKey.position.set(0.5, 4.2, -1.2);
    this.hostKey.target.position.set(0, 1.2, -3.2);
    this.group.add(this.hostKey, this.hostKey.target);

    // Cool rim/back light for stage depth.
    this.rim = new THREE.SpotLight('#8a5cf6', 4.5, 16, Math.PI / 4, 0.6, 1.4);
    this.rim.position.set(-3, 5, -5.5);
    this.rim.target.position.set(0, 0, -3.5);
    this.group.add(this.rim, this.rim.target);

    // Screen glow — soft light thrown from the video wall onto the stage.
    // Kept up at the wall's own height and just in front of it: parked any
    // lower it sits a hand's width behind the host's head and blows the top
    // of his hair out in blue (see project brief §host-visibility).
    this.screenGlow = new THREE.PointLight('#5fb3ff', 2.0, 8, 2);
    this.screenGlow.position.set(0, 2.5, -4.0);
    this.group.add(this.screenGlow);

    // Faint audience-area fills. The crowd now wraps around the contestant,
    // so the fill is split into a rear wash plus one each side — that keeps
    // the side and front-side rows readable instead of lit only from behind.
    this.audienceFillFar = new THREE.PointLight('#3a2f7a', 2.0, 16, 1.6);
    this.audienceFillFar.position.set(0, 4.2, 8);
    this.group.add(this.audienceFillFar);

    this.audienceFillLeft = new THREE.PointLight('#5544bb', 2.2, 14, 1.6);
    this.audienceFillLeft.position.set(-7.5, 4.2, 1.2);
    this.group.add(this.audienceFillLeft);

    this.audienceFillRight = new THREE.PointLight('#5544bb', 2.2, 14, 1.6);
    this.audienceFillRight.position.set(7.5, 4.2, 1.2);
    this.group.add(this.audienceFillRight);

    // Every light a verdict is allowed to recolour, with its resting colour
    // and intensity, and how far it should follow the wash.
    this._wash = [
      { light: this.ambient, mix: 0.8 },
      { light: this.hemi, mix: 0.7, ground: true },
      { light: this.rim, mix: 0.85 },
      { light: this.audienceFillFar, mix: 0.9 },
      { light: this.audienceFillLeft, mix: 0.9 },
      { light: this.audienceFillRight, mix: 0.9 },
      // These two also carry the celebration pulse, so their resting intensity
      // is read per frame rather than frozen at construction time.
      { light: this.hostKey, mix: 0.22, rest: () => 6.5 + this._pulse * 1.5 },
      { light: this.screenGlow, mix: 0.85, rest: () => 2.0 + this._pulse * 1.2 }
    ];
    for (const w of this._wash) {
      w.base = w.light.color.clone();
      w.intensity = w.light.intensity;
      if (w.ground) w.groundBase = w.light.groundColor.clone();
    }

    this._pulseT = 0;
    this._pulse = 0;
    this._celebrating = false;
    this._verdict = null;
    this._tint = null;      // kept while fading out, so the wash doesn't snap
    this._verdictMix = 0;
    this._verdictFlash = 0;
    this._washUp = false;
  }

  setCelebrating(on) {
    this._celebrating = on;
  }

  /**
   * Swings the room's lighting to match the verdict. Pass null (a new question)
   * to fade the wash back to the normal studio look.
   */
  setVerdict(verdict) {
    const next = VERDICT_TINT[verdict] ? verdict : null;
    if (next === this._verdict) return;
    this._verdict = next;
    if (next) {
      this._tint = VERDICT_TINT[next];
      this._verdictFlash = 1; // a beat of extra punch as it lands
    }
  }

  update(dt) {
    this._pulseT += dt;
    const pulseWasOn = this._pulse > 0;
    const washWasUp = this._washUp;
    this._pulse = this._celebrating
      // Gentle warm pulse — intentionally subtle to respect VR comfort guidance.
      ? 0.5 + 0.5 * Math.sin(this._pulseT * 4)
      : 0;

    this._verdictMix = THREE.MathUtils.damp(this._verdictMix, this._verdict ? 1 : 0, 3.5, dt);
    if (this._verdictFlash > 0) this._verdictFlash = Math.max(0, this._verdictFlash - dt * 1.4);

    const mix = this._verdictMix;
    this._washUp = mix > 0.002;
    // Once the wash has faded out and no pulse is running there is nothing left
    // to write, so the rig costs nothing between questions.
    if (!this._washUp && !washWasUp && this._pulse === 0 && !pulseWasOn) return;

    const punch = 1 + this._verdictFlash * 0.8;
    for (const w of this._wash) {
      const k = this._washUp ? mix * w.mix : 0;
      w.light.color.copy(w.base);
      if (w.ground) w.light.groundColor.copy(w.groundBase);
      if (this._tint) {
        w.light.color.lerp(this._tint, k);
        if (w.ground) w.light.groundColor.lerp(this._tint, k * 0.6);
      }
      // The wash also lifts the room slightly as it lands (green for a correct
      // answer, a hotter red for a wrong one).
      w.light.intensity = this._restIntensity(w) * (1 + (0.3 * punch) * k);
    }
  }

  _restIntensity(w) {
    return w.rest ? w.rest() : w.intensity;
  }
}
