import * as THREE from 'three';
import { ConfigStore } from './utils/ConfigStore.js';
import { GameManager } from './game/GameManager.js';
import { States } from './game/GameState.js';

import { Studio } from './scene/Studio.js';
import { Stage } from './scene/Stage.js';
import { Lighting } from './scene/Lighting.js';
import { Host } from './scene/Host.js';
import { Audience } from './scene/Audience.js';
import { Screen } from './scene/Screen.js';
import { PrizeLadder } from './scene/PrizeLadder.js';

import { AudioManager } from './audio/AudioManager.js';
import { VRManager } from './vr/VRManager.js';
import { DesktopLook } from './vr/DesktopLook.js';
import { GyroLook } from './vr/GyroLook.js';

import { StartScreen } from './ui/StartScreen.js';
import { HUD } from './ui/HUD.js';
import { Editor } from './editor/Editor.js';

// ---------------------------------------------------------------------------
// Renderer / scene / camera rig
// ---------------------------------------------------------------------------

const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// No real-time shadow maps — VR performance priority (see project brief §30).
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x08061a, 0.02);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 100);
const cameraRig = new THREE.Group();
// The rig stays at the floor origin (0,0,0). In an active WebXR session the
// renderer overwrites camera.position every frame from the tracked headset
// pose in the 'local-floor' reference space, which already reports real
// floor-relative height — adding a seat-height offset here would stack on
// top of that and float the player above the stage. The fixed seated eye
// height below is applied directly to the camera and only has an effect in
// desktop preview (where there is no head tracking to overwrite it).
cameraRig.position.set(0, 0, 0);
camera.position.set(0, 1.45, 0);
cameraRig.add(camera);
scene.add(cameraRig);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Config + game engine (shared by desktop preview and VR)
// ---------------------------------------------------------------------------

let config = ConfigStore.load();
const gameManager = new GameManager(config);
const audio = new AudioManager(config.audio);

// ---------------------------------------------------------------------------
// Scene assembly
// ---------------------------------------------------------------------------

const studio = new Studio(scene);
const stage = new Stage(scene);
const lighting = new Lighting(scene, config.theme);
const host = new Host(scene);
const audience = new Audience(scene);
const screenObj = new Screen(scene, config.theme);
const prizeLadder = new PrizeLadder(scene);
prizeLadder.setPrizes(config.prizes);

// ---------------------------------------------------------------------------
// UI: start screen, HUD, editor
// ---------------------------------------------------------------------------

const vrManager = new VRManager(renderer, scene, camera, {
  onSelect: (mesh) => handleMeshSelected(mesh),
  getInteractiveMeshes: () => screenObj.getInteractiveMeshes()
});

const startScreenRoot = document.getElementById('start-screen');
const hudRoot = document.getElementById('hud');
const editorRoot = document.getElementById('editor-overlay');

const startScreen = new StartScreen(startScreenRoot, {
  onEnterVR: () => { /* actual entry handled by renderer.xr session events below */ },
  onDesktopPreview: () => enterDesktopPreview(),
  onOpenEditor: () => editor.open(),
  vrButtonSlot: vrManager.createButton()
});
startScreen.setTitle(config.title);

const hud = new HUD(hudRoot, {
  onMenu: () => returnToMenu(),
  onMuteToggle: () => {
    audio.updateSettings({ muted: !audio.settings.muted });
    hud.setAudioState(audio.settings);
  },
  onVolumeChange: (v) => {
    audio.updateSettings({ volume: v });
    hud.setAudioState(audio.settings);
  }
});
hud.setAudioState(audio.settings);

const editor = new Editor({
  root: editorRoot,
  onApplyConfig: (newConfig) => applyConfig(newConfig),
  onPreview: () => enterDesktopPreview()
});

vrManager.isSupported().then((supported) => {
  if (!supported) {
    startScreen.setStatus('VR is not available on this device. You can continue using Desktop Preview.');
    vrManager.buttonEl?.classList.add('is-disabled');
  }
});

function applyConfig(newConfig) {
  config = newConfig;
  gameManager.loadConfig(config);
  audio.updateSettings(config.audio);
  prizeLadder.setPrizes(config.prizes);
  prizeLadder.setCurrentTier(-1);
  startScreen.setTitle(config.title);
  screenObj.drawIdle('Get ready...');
  hud.setAudioState(audio.settings);
}

// ---------------------------------------------------------------------------
// Input: desktop drag-to-look + click select, optional mobile gyro
// ---------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();

function attemptSelectAtScreenXY(x, y) {
  const ndc = new THREE.Vector2(
    (x / window.innerWidth) * 2 - 1,
    -(y / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const meshes = screenObj.getInteractiveMeshes();
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length) handleMeshSelected(hits[0].object);
}

const desktopLook = new DesktopLook(camera, canvas, (x, y) => attemptSelectAtScreenXY(x, y));
const gyroLook = new GyroLook(camera);

function handleMeshSelected(mesh) {
  const data = mesh.userData;
  if (!data?.interactive) return;
  audio.unlock();
  if (data.type === 'answer') {
    audio.playSelectClick();
    gameManager.selectAnswer(data.index);
  } else if (data.type === 'playAgain') {
    audio.playSelectClick();
    gameManager.playAgain();
  } else if (data.type === 'lifeline') {
    audio.playSelectClick();
    gameManager.useLifeline(data.id);
  }
}

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function enterDesktopPreview() {
  audio.unlock();
  startScreen.hide();
  hud.show();
  desktopLook.reset();
  desktopLook.enable();

  if (isMobile && GyroLook.isSupported()) {
    const ok = await gyroLook.requestPermissionAndEnable();
    desktopLook.suppressLook = ok;
    hud.setHint(ok ? 'Tilt your device to look around · Tap an answer to select it' : 'Drag to look around · Tap an answer to select it');
  } else {
    hud.setHint('Drag to look around · Click an answer to select it');
  }

  gameManager.startGame();
}

function returnToMenu() {
  desktopLook.disable();
  gyroLook.disable();
  camera.rotation.set(0, 0, 0);
  gameManager.loadConfig(config); // resets to START state and clears timers
  host.setAnimState('idle');
  audience.setReaction('idle');
  lighting.setVerdict(null);
  lighting.setCelebrating(false);
  screenObj.drawIdle('Get ready...');
  screenObj.resetPanelsForNewGame();
  prizeLadder.setCurrentTier(-1);
  hud.hide();
  startScreen.show();
}

// ---------------------------------------------------------------------------
// WebXR session lifecycle (Enter VR button is created by VRManager)
// ---------------------------------------------------------------------------

renderer.xr.addEventListener('sessionstart', () => {
  audio.unlock();
  startScreen.hide();
  hud.hide(); // in-headset players use in-world panels, not the desktop DOM HUD
  gameManager.startGame();
});

renderer.xr.addEventListener('sessionend', () => {
  desktopLook.disable();
  gameManager.loadConfig(config);
  host.setAnimState('idle');
  audience.setReaction('idle');
  lighting.setVerdict(null);
  lighting.setCelebrating(false);
  screenObj.drawIdle('Get ready...');
  screenObj.resetPanelsForNewGame();
  prizeLadder.setCurrentTier(-1);
  startScreen.show();
});

// ---------------------------------------------------------------------------
// GameManager -> scene/audio reactions
// ---------------------------------------------------------------------------

gameManager.on('stateChange', ({ state }) => {
  lighting.setCelebrating(state === States.CORRECT || state === States.FINAL_RESULT);
  // The studio itself answers the question: green when it was right, red when
  // it wasn't, fading back to the normal look on the next question.
  if (state === States.CORRECT || state === States.FINAL_RESULT) lighting.setVerdict('correct');
  else if (state === States.INCORRECT || state === States.GAME_OVER) lighting.setVerdict('incorrect');
  else if (
    state === States.QUESTION ||
    state === States.HOST_INTRO ||
    state === States.PLAY_AGAIN ||
    state === States.START
  ) lighting.setVerdict(null);
  if (state === States.QUESTION) hud.setHint('Choose your answer — A, B, C or D · or use a lifeline above the host');
  else if (state === States.GAME_OVER) hud.setHint('Game over — select "PLAY AGAIN" to start a new game');
  else if (state === States.FINAL_RESULT) hud.setHint('Select "PLAY AGAIN" to restart');
  else hud.setHint('Drag to look around');
});

gameManager.on('hostDialogue', ({ text, animState }) => {
  host.setAnimState(animState);
  audio.speak(text);
  if (gameManager.state === States.HOST_INTRO || gameManager.state === States.PLAY_AGAIN) {
    screenObj.drawIdle(text);
  }
});

gameManager.on('audienceReaction', ({ reaction }) => {
  audience.setReaction(reaction);
  if (reaction === 'applause') audio.playApplause();
  if (reaction === 'celebrate') audio.playCelebrationFanfare();
  if (reaction === 'disappointed') audio.playAudienceSigh();
});

gameManager.on('questionLoaded', ({ question, index, total }) => {
  const prizeText = gameManager.prizeManager.formatted(question.prize);
  screenObj.showQuestion(question, index, total, prizeText);
  screenObj.setLifelines(gameManager.lifelineAvailability());
  prizeLadder.setCurrentTier(index);
  audio.playQuestionIntro();
});

// --- Lifelines -------------------------------------------------------------
// Each lifeline is spent once per game; the scene renders whatever the game
// layer decided (poll shares, the two removed options, the friend's pick).

gameManager.on('audiencePoll', ({ poll }) => {
  screenObj.showAudiencePoll(poll);
});

gameManager.on('fiftyFifty', ({ removed }) => {
  screenObj.applyFiftyFifty(removed);
});

gameManager.on('phoneFriend', ({ index }) => {
  screenObj.showFriendSuggestion(index);
});

gameManager.on('lifelineUsed', ({ id, availability }) => {
  screenObj.setLifelines(availability);
  if (id === 'audience') audio.playLifelineAudience();
  if (id === 'fiftyFifty') audio.playLifelineFiftyFifty();
  if (id === 'phoneFriend') audio.playLifelinePhone();
});

gameManager.on('answerLocked', ({ index }) => {
  screenObj.highlightSelected(index);
});

gameManager.on('reveal', ({ selectedIndex, correctIndex, isCorrect }) => {
  screenObj.showReveal(correctIndex, selectedIndex, isCorrect);
  if (isCorrect) audio.playCorrectChime();
  else audio.playIncorrectBuzz();
});

gameManager.on('prizeUpdate', ({ tierIndex }) => {
  prizeLadder.setCurrentTier(tierIndex);
  audio.playPrizeProgression();
});

gameManager.on('finalResult', (payload) => {
  screenObj.showFinalResult(payload);
});

// Wrong answer: the run is finished — show the exit screen with the
// [ PLAY AGAIN ] button. Only a correct answer can ever move the game on.
gameManager.on('gameOver', (payload) => {
  screenObj.showGameOver(payload);
  audio.playGameOverSting();
});

gameManager.on('reset', () => {
  screenObj.resetPanelsForNewGame();
  prizeLadder.setCurrentTier(-1);
  lighting.setVerdict(null);
  lighting.setCelebrating(false);
});

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  host.update(dt);
  audience.update(dt);
  lighting.update(dt);
  gyroLook.update();
  renderer.render(scene, camera);
});
