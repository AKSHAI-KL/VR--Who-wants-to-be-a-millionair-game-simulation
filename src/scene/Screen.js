import * as THREE from 'three';

const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
// The host stands dead centre of the room (x = 0, z = -3.2) and must stay
// visible for the whole session, so nothing the player has to read or click is
// ever placed on top of him. Instead everything is arranged *around* him:
//
//            [ video wall: question / results ]   <- above + behind the host
//        [A]                              [B]     <- answers flank the host
//                      H O S T                    <- never covered
//        [C]                              [D]
//     [ audience ] [ 50:50 ] [ phone a friend ]    <- lifelines, above his head
//              [ PLAY AGAIN ] (results only)      <- under the wall's text
//
// The four answer panels are angled inwards so they face the player, and the
// gap between them is wide enough for the host's whole silhouette (body plus
// outstretched arms) to stay clear.
// ---------------------------------------------------------------------------

const WALL = { x: 0, y: 2.95, z: -4.25, width: 3.2, height: 1.8 };
const WALL_CANVAS = { w: 1024, h: 576 };

const PANEL_Z = -2.75;
// Sized so that, from the player's seat, each panel sits between roughly 19°
// and 40° off centre: clear of the host (whose silhouette is ~±13°) and still
// comfortably inside a single forward view on a monitor *and* in a headset.
const PANEL_SIZE = { w: 1.16, h: 0.34 };
const PANEL_CANVAS = { w: 680, h: 200 };
// How far each answer panel is yawed inwards, towards the player.
const PANEL_YAW = 0.4;
const PANEL_LAYOUT = [
  { x: -1.55, y: 1.7 }, // A — upper left of the host
  { x: 1.55, y: 1.7 },  // B — upper right of the host
  { x: -1.55, y: 1.0 }, // C — lower left of the host
  { x: 1.55, y: 1.0 }   // D — lower right of the host
];

// Lifelines sit in the short band between the host's head and the wall's text —
// the only strip that covers neither the host nor the answers.
const LIFELINE = { y: 2.46, z: -4.05, w: 1.15, h: 0.62, canvasW: 460, canvasH: 248 };
const LIFELINE_BUTTONS = [
  { id: 'audience', label: 'ASK THE AUDIENCE', x: -1.35 },
  { id: 'fiftyFifty', label: '50 : 50', x: 0 },
  { id: 'phoneFriend', label: 'PHONE A FRIEND', x: 1.35 }
];

const ACTION = { x: 0, y: 2.42, z: -4.12, w: 2.5, h: 0.55 };
const ACTION_CANVAS = { w: 700, h: 154 };

// Wall canvas bands. From the top: header line, divider, the lifeline status
// strip, then the question itself. Everything the player must read stays above
// the lifeline buttons, which float in front of the wall's lower band.
// (Text y values are baselines, so a line's glyphs start one cap-height above.)
const WALL_HEADER_BASELINE = 52;
const WALL_DIVIDER_Y = 76;
const WALL_STRIP = { y: 84, h: 52 };
const WALL_TEXT_TOP = 200;
const WALL_TEXT_BOTTOM = 340;

const COLOR_DEFAULT = '#1c1840';
const COLOR_SELECTED = '#3452c7';
const COLOR_CORRECT = '#1e8f4e';
const COLOR_INCORRECT = '#b13333';
const COLOR_PLAY_AGAIN = '#f2c94c';
const COLOR_REMOVED = '#101024';

function makeCanvasTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, texture };
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  let line = '';
  const lines = [];
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trim());
      line = word + ' ';
    } else {
      line = test;
    }
  }
  lines.push(line.trim());
  return lines;
}

function drawLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return lines.length;
}

function wrapTextCentered(ctx, text, cx, y, maxWidth, lineHeight) {
  return drawLines(ctx, wrapLines(ctx, text, maxWidth), cx, y, lineHeight);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws the studio's in-world UI:
 *   • the video wall behind/above the host (question, lifeline status, results),
 *   • the four answer panels flanking him (also carry the audience poll), and
 *   • the lifeline + PLAY AGAIN buttons, all raycast against by desktop clicks
 *     and VR controllers alike.
 */
export class Screen {
  constructor(scene, theme) {
    this.theme = theme;
    this.group = new THREE.Group();
    this.group.name = 'Screen';
    scene.add(this.group);

    this._buildWall();
    this._buildAnswerPanels();
    this._buildLifelineButtons();
    this._buildActionButton();
    this.drawIdle('Get ready...');
  }

  // ---- Construction ------------------------------------------------------

  _buildWall() {
    const { canvas, ctx, texture } = makeCanvasTexture(WALL_CANVAS.w, WALL_CANVAS.h);
    this.wallCanvas = canvas;
    this.wallCtx = ctx;
    this.wallTexture = texture;

    this.wallMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WALL.width, WALL.height),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    this.wallMesh.position.set(WALL.x, WALL.y, WALL.z);
    this.group.add(this.wallMesh);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(WALL.width + 0.22, WALL.height + 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: '#0a0818', metalness: 0.6, roughness: 0.3 })
    );
    frame.position.set(WALL.x, WALL.y, WALL.z - 0.12);
    this.group.add(frame);
  }

  _buildAnswerPanels() {
    this.answerMeshes = [];
    this.answerSlots = [];
    this.answerMeta = [];
    for (let i = 0; i < PANEL_LAYOUT.length; i++) {
      const { canvas, ctx, texture } = makeCanvasTexture(PANEL_CANVAS.w, PANEL_CANVAS.h);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(PANEL_SIZE.w, PANEL_SIZE.h),
        // DoubleSide so a controller ray can never slip past a panel's edge.
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      );
      mesh.position.set(PANEL_LAYOUT[i].x, PANEL_LAYOUT[i].y, PANEL_Z);
      mesh.rotation.y = PANEL_LAYOUT[i].x > 0 ? -PANEL_YAW : PANEL_YAW;
      mesh.userData = { type: 'answer', index: i, interactive: false };
      this.group.add(mesh);
      this.answerMeshes.push(mesh);
      // Left-hand panels mirror their layout so the A/C/D/B labels all sit on
      // the side of the panel nearest the centre of view — otherwise the left
      // column's letters end up at the very edge of the frame.
      this.answerSlots.push({ canvas, ctx, texture, mirrored: PANEL_LAYOUT[i].x < 0 });
      this.answerMeta.push(this._blankMeta(i));
      this._paintPanel(i);
    }
  }

  _buildLifelineButtons() {
    this.lifelineMeshes = [];
    this.lifelineSlots = [];
    LIFELINE_BUTTONS.forEach((def) => {
      const { canvas, ctx, texture } = makeCanvasTexture(LIFELINE.canvasW, LIFELINE.canvasH);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(LIFELINE.w, LIFELINE.h),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      );
      mesh.position.set(def.x, LIFELINE.y, LIFELINE.z);
      mesh.userData = { type: 'lifeline', id: def.id, interactive: false };
      mesh.visible = false;
      this.group.add(mesh);
      this.lifelineMeshes.push(mesh);
      this.lifelineSlots.push({ canvas, ctx, texture });
      this._paintLifeline(this.lifelineMeshes.length - 1, true);
    });
  }

  _buildActionButton() {
    const { canvas, ctx, texture } = makeCanvasTexture(ACTION_CANVAS.w, ACTION_CANVAS.h);
    this.actionCanvas = canvas;
    this.actionCtx = ctx;
    this.actionTexture = texture;

    // Sits just in front of the video wall, in the clear band between the
    // host's head and the wall's text.
    this.actionMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ACTION.w, ACTION.h),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    );
    this.actionMesh.position.set(ACTION.x, ACTION.y, ACTION.z);
    this.actionMesh.userData = { type: 'playAgain', interactive: false };
    this.actionMesh.visible = false;
    this.group.add(this.actionMesh);
  }

  // ---- Answer panels -----------------------------------------------------

  _blankMeta(i) {
    return {
      letter: ANSWER_LETTERS[i],
      text: '',
      color: COLOR_DEFAULT,
      // audience share (percent) or null
      poll: null,
      // the friend's pick, drawn with a brighter rim
      suggested: false,
      // taken away by 50:50
      removed: false
    };
  }

  _paintPanel(i) {
    const meta = this.answerMeta[i];
    const { canvas, ctx, texture, mirrored } = this.answerSlots[i];
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (meta.removed) {
      // 50:50 took this one away — left as an empty, unlit slot.
      ctx.fillStyle = COLOR_REMOVED;
      roundRect(ctx, 6, 6, w - 12, h - 12, 20);
      ctx.fill();
      ctx.strokeStyle = '#2b2750';
      ctx.lineWidth = 3;
      roundRect(ctx, 6, 6, w - 12, h - 12, 20);
      ctx.stroke();
      texture.needsUpdate = true;
      return;
    }

    ctx.fillStyle = meta.color;
    roundRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.fill();
    ctx.strokeStyle = meta.suggested ? '#fff3c9' : '#f2c94c';
    ctx.lineWidth = meta.suggested ? 9 : 4;
    roundRect(ctx, 6, 6, w - 12, h - 12, 20);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2c94c';
    ctx.font = 'bold 62px Arial';
    ctx.fillText(meta.letter, mirrored ? w - 90 : 30, h / 2 + 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = '44px Arial';
    ctx.fillText(meta.text, mirrored ? 24 : 104, h / 2 + 2, w - 190);

    if (meta.poll != null) {
      const barX = 20;
      const barY = h - 28;
      const barW = w - 40;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(barX, barY, barW, 14);
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(barX, barY, barW * (meta.poll / 100), 14);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffe9a8';
      ctx.font = 'bold 30px Arial';
      ctx.fillText(`${meta.poll}%`, 24, 16);
    }

    texture.needsUpdate = true;
  }

  _setAnswersInteractive(state) {
    this.answerMeshes.forEach((m, i) => {
      m.userData.interactive = Boolean(state) && !this.answerMeta[i].removed;
    });
  }

  _setAnswersVisible(state) {
    this.answerMeshes.forEach((m) => {
      m.visible = state;
    });
  }

  // ---- Lifeline buttons --------------------------------------------------

  _paintLifeline(index, available) {
    const { canvas, ctx, texture } = this.lifelineSlots[index];
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = available ? '#2b2352' : '#141126';
    roundRect(ctx, 6, 6, w - 12, h - 12, 22);
    ctx.fill();
    ctx.strokeStyle = available ? '#f2c94c' : '#3a3560';
    ctx.lineWidth = available ? 6 : 4;
    roundRect(ctx, 6, 6, w - 12, h - 12, 22);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = available ? '#ffe9a8' : '#5a5580';
    ctx.font = 'bold 40px Arial';
    ctx.fillText(LIFELINE_BUTTONS[index].label, w / 2, h / 2 + 2, w - 48);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    texture.needsUpdate = true;
  }

  /** availability: { audience, fiftyFifty, phoneFriend } — true while unused. */
  setLifelines(availability) {
    LIFELINE_BUTTONS.forEach((def, i) => {
      const available = Boolean(availability && availability[def.id]);
      const mesh = this.lifelineMeshes[i];
      mesh.visible = true;
      mesh.userData.interactive = available;
      this._paintLifeline(i, available);
    });
  }

  hideLifelines() {
    this.lifelineMeshes.forEach((mesh) => {
      mesh.visible = false;
      mesh.userData.interactive = false;
    });
  }

  // ---- Video wall --------------------------------------------------------

  _clearWall(fill) {
    const ctx = this.wallCtx;
    ctx.fillStyle = fill || this.theme?.screenColor || '#0b1030';
    ctx.fillRect(0, 0, this.wallCanvas.width, this.wallCanvas.height);
  }

  _drawWallHeader(left, right) {
    const ctx = this.wallCtx;
    const c = this.wallCanvas;
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 34px Arial';
    ctx.fillStyle = '#8ab4ff';
    ctx.textAlign = 'left';
    ctx.fillText(left, 48, WALL_HEADER_BASELINE);
    ctx.fillStyle = '#f2c94c';
    ctx.textAlign = 'right';
    ctx.fillText(right, c.width - 48, WALL_HEADER_BASELINE);
    ctx.textAlign = 'left';
  }

  /** The one-line status strip under the header, used by the lifelines. */
  _drawLifelineStrip(text) {
    const ctx = this.wallCtx;
    const c = this.wallCanvas;
    const { y, h } = WALL_STRIP;
    ctx.fillStyle = this.theme?.screenColor || '#0b1030';
    ctx.fillRect(0, y, c.width, h);
    if (!text) return;

    ctx.fillStyle = 'rgba(242,201,76,0.14)';
    ctx.fillRect(0, y, c.width, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 32px Arial';
    ctx.fillText(text, c.width / 2, y + h / 2 + 2, c.width - 80);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.wallTexture.needsUpdate = true;
  }

  drawIdle(message) {
    const ctx = this.wallCtx;
    const c = this.wallCanvas;
    this._clearWall();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2c94c';
    ctx.font = 'bold 54px Arial';
    wrapTextCentered(ctx, message, c.width / 2, c.height / 2 - 40, c.width - 160, 64);
    ctx.fillStyle = '#8ab4ff';
    ctx.font = 'bold 26px Arial';
    ctx.fillText('STUDIO 5 · LIVE', c.width / 2, c.height - 90);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.wallTexture.needsUpdate = true;

    this.answerMeshes.forEach((m, i) => {
      this.answerMeta[i] = this._blankMeta(i);
      m.visible = true;
      m.userData.interactive = false;
      this._paintPanel(i);
    });
    this.hideLifelines();
    this._hideAction();
  }

  showQuestion(question, index, total, prizeFormatted) {
    const ctx = this.wallCtx;
    const c = this.wallCanvas;
    this._clearWall();
    this._drawWallHeader(`QUESTION ${index + 1} OF ${total}`, `PLAYING FOR ${prizeFormatted}`);
    this._drawLifelineStrip('');

    ctx.strokeStyle = 'rgba(242,201,76,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(48, WALL_DIVIDER_Y);
    ctx.lineTo(c.width - 48, WALL_DIVIDER_Y);
    ctx.stroke();

    // Shrink the type rather than let a long question run under the lifeline
    // buttons that float in front of the wall's lower band.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    const maxWidth = c.width - 96;
    let fontSize = 46;
    let lineHeight = 56;
    let lines = null;
    while (fontSize >= 30) {
      ctx.font = `bold ${fontSize}px Arial`;
      lines = wrapLines(ctx, question.question, maxWidth);
      if (WALL_TEXT_TOP + (lines.length - 1) * lineHeight + fontSize * 0.35 <= WALL_TEXT_BOTTOM) break;
      fontSize -= 4;
      lineHeight = Math.round(fontSize * 1.14);
    }
    drawLines(ctx, lines, 48, WALL_TEXT_TOP, lineHeight);
    this.wallTexture.needsUpdate = true;

    question.options.forEach((opt, i) => {
      this.answerMeta[i] = { ...this._blankMeta(i), text: opt };
      const mesh = this.answerMeshes[i];
      mesh.visible = true;
      mesh.userData.interactive = true;
      this._paintPanel(i);
    });
    this._hideAction();
  }

  highlightSelected(index) {
    this._setAnswersInteractive(false);
    this.answerMeta[index].color = COLOR_SELECTED;
    this._paintPanel(index);
  }

  showReveal(correctIndex, selectedIndex, isCorrect) {
    this.answerMeta[correctIndex].color = COLOR_CORRECT;
    this._paintPanel(correctIndex);
    if (selectedIndex !== correctIndex && selectedIndex != null) {
      this.answerMeta[selectedIndex].color = COLOR_INCORRECT;
      this._paintPanel(selectedIndex);
    }
    // The answer is locked in, so no lifeline can be spent on it any more.
    this.hideLifelines();

    // Banner on the video wall, in the band just above the host's head.
    const ctx = this.wallCtx;
    const c = this.wallCanvas;
    const bandTop = 366;
    const bandHeight = 140;
    ctx.fillStyle = isCorrect ? 'rgba(30,143,78,0.28)' : 'rgba(177,51,51,0.32)';
    ctx.fillRect(0, bandTop, c.width, bandHeight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isCorrect ? '#7CFFB2' : '#FF9E9E';
    ctx.font = 'bold 74px Arial';
    ctx.fillText(isCorrect ? 'CORRECT!' : 'INCORRECT', c.width / 2, bandTop + bandHeight / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.wallTexture.needsUpdate = true;
  }

  // ---- Lifeline results --------------------------------------------------

  /** Audience poll: a share bar (and percentage) on every answer panel. */
  showAudiencePoll(poll) {
    let best = 0;
    poll.forEach((share, i) => {
      if (this.answerMeta[i].removed) return;
      this.answerMeta[i].poll = share;
      this._paintPanel(i);
      if (share > poll[best]) best = i;
    });
    this._drawLifelineStrip(`AUDIENCE POLL  ·  MOST LIKELY ${ANSWER_LETTERS[best]} — ${poll[best]}%`);
  }

  /** 50:50 — the two taken-away options go dark and stop being selectable. */
  applyFiftyFifty(removed) {
    removed.forEach((i) => {
      this.answerMeta[i].removed = true;
      this.answerMeta[i].poll = null;
      this.answerMeshes[i].userData.interactive = false;
      this._paintPanel(i);
    });
    this._drawLifelineStrip('50 : 50  ·  TWO WRONG ANSWERS TAKEN AWAY');
  }

  /** Phone a friend: rims the suggested panel and names it on the wall. */
  showFriendSuggestion(index) {
    this.answerMeta[index].suggested = true;
    this._paintPanel(index);
    const option = (this.answerMeta[index].text || '').toUpperCase();
    this._drawLifelineStrip(
      `PHONE A FRIEND  ·  THEY SUGGEST ${ANSWER_LETTERS[index]}${option ? ` — ${option}` : ''}`
    );
  }

  /** Run-ending screen shown the moment a wrong answer is locked in. */
  showGameOver({ formattedPrize, total, reachedQuestion }) {
    const ctx = this.wallCtx;
    const c = this.wallCanvas;
    this._setAnswersInteractive(false);
    this._setAnswersVisible(false);
    this.hideLifelines();

    const wash = ctx.createRadialGradient(c.width / 2, c.height * 0.3, 40, c.width / 2, c.height * 0.55, c.width * 0.72);
    wash.addColorStop(0, 'rgba(176,44,44,0.55)');
    wash.addColorStop(1, 'rgba(10,7,24,0.98)');
    this._clearWall();
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff9e9e';
    ctx.font = 'bold 92px Arial';
    ctx.fillText('GAME OVER', c.width / 2, 100);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Arial';
    ctx.fillText('That answer is incorrect.', c.width / 2, 196);
    ctx.fillStyle = '#e6e2ff';
    ctx.font = '38px Arial';
    ctx.fillText('Thank you for playing!', c.width / 2, 252);
    ctx.fillStyle = '#a79fce';
    ctx.font = '30px Arial';
    ctx.fillText(
      `You reached question ${reachedQuestion} of ${total}  ·  Final prize ${formattedPrize}`,
      c.width / 2,
      312
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.wallTexture.needsUpdate = true;

    this._showAction('PLAY AGAIN');
  }

  showFinalResult({ message, formattedPrize, correctCount, total }) {
    const ctx = this.wallCtx;
    const c = this.wallCanvas;
    this._setAnswersInteractive(false);
    this._setAnswersVisible(false);
    this.hideLifelines();

    const wash = ctx.createRadialGradient(c.width / 2, c.height * 0.3, 40, c.width / 2, c.height * 0.55, c.width * 0.72);
    wash.addColorStop(0, 'rgba(242,201,76,0.35)');
    wash.addColorStop(1, 'rgba(10,7,24,0.96)');
    this._clearWall();
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2c94c';
    ctx.font = 'bold 72px Arial';
    ctx.fillText('CONGRATULATIONS!', c.width / 2, 92);
    ctx.fillStyle = '#ffffff';
    ctx.font = '36px Arial';
    wrapTextCentered(ctx, message, c.width / 2, 168, c.width - 200, 46);
    ctx.font = 'bold 54px Arial';
    ctx.fillText(`FINAL PRIZE: ${formattedPrize}`, c.width / 2, 268);
    ctx.fillStyle = '#8ab4ff';
    ctx.font = '32px Arial';
    ctx.fillText(`${correctCount} of ${total} correct`, c.width / 2, 322);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.wallTexture.needsUpdate = true;

    this._showAction('PLAY AGAIN');
  }

  // ---- Action button -----------------------------------------------------

  _showAction(label) {
    const ctx = this.actionCtx;
    const c = this.actionCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = COLOR_PLAY_AGAIN;
    roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 26);
    ctx.fill();
    ctx.strokeStyle = '#fff3c9';
    ctx.lineWidth = 5;
    roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 26);
    ctx.stroke();
    ctx.fillStyle = '#0b1030';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px Arial';
    ctx.fillText(`\u21bb  ${label}`, c.width / 2, c.height / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    this.actionTexture.needsUpdate = true;

    this.actionMesh.userData = { type: 'playAgain', interactive: true };
    this.actionMesh.visible = true;
  }

  _hideAction() {
    this.actionMesh.visible = false;
    this.actionMesh.userData = { type: 'playAgain', interactive: false };
  }

  resetPanelsForNewGame() {
    this.answerMeshes.forEach((m, i) => {
      m.visible = true;
      m.scale.set(1, 1, 1);
      m.position.set(PANEL_LAYOUT[i].x, PANEL_LAYOUT[i].y, PANEL_Z);
      m.rotation.set(0, PANEL_LAYOUT[i].x > 0 ? -PANEL_YAW : PANEL_YAW, 0);
      m.userData = { type: 'answer', index: i, interactive: false };
      this.answerMeta[i] = this._blankMeta(i);
      this._paintPanel(i);
    });
    this.hideLifelines();
    this._hideAction();
  }

  getInteractiveMeshes() {
    return [...this.answerMeshes, this.actionMesh, ...this.lifelineMeshes].filter(
      (m) => m.visible && m.userData.interactive
    );
  }
}
