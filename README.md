# Who Wants To Be A Millionaire? — VR Quiz Show

A fully interactive, browser-based VR quiz-show simulation built with Three.js
and WebXR. You sit in the contestant's seat inside a low-poly TV studio: a
host stands in front of you next to a big question screen and prize ladder,
and a tiered audience wraps around you on both sides and behind. Look around
freely (~180°+ of real 3D content, not a flat 360° photo), answer five
questions, and watch the host and crowd react. Three lifelines are on offer
(ask the audience, 50:50, phone a friend). One wrong answer ends the run.

## Quickest way to try it

Open **`millionaire-vr-standalone.html`** directly in a browser (just double-click
it — no server, no build, no install). Everything (Three.js, the game code,
the styling) is bundled into that one file. This is the fastest way to preview
the game, but for VR headset support you need it served over `https://` (or
`localhost`) — WebXR requires a secure context, so `file://` will correctly
show "VR not supported" and fall back to Desktop Preview.

## Running the full project (for editing / development / real VR testing)

This is a normal Vite + Three.js project (ES modules), so it needs a local
dev server — opening `index.html` directly via `file://` will **not** work
for the multi-file version (browsers block ES module imports over `file://`).
The single-file HTML above exists specifically to sidestep that.

```bash
npm install
npm run dev       # local dev server with hot reload, prints a localhost URL
```

To test on a real VR headset (e.g. Quest browser) or on a phone, you need
HTTPS or a same-network URL:

```bash
npm run build
npm run preview -- --host    # serves the production build, reachable from other devices
```

Then open the printed `http://<your-ip>:4173` URL on your headset's browser.
Standalone VR headset browsers require HTTPS for WebXR in most cases — for
real device testing you'll likely want to deploy the `dist/` folder to any
static host (Vercel, Netlify, GitHub Pages, etc.) or tunnel it (e.g. `ngrok`).

## Controls

- **VR**: click "Enter VR" (only enabled where WebXR is supported), then use
  a controller to point and pull the trigger at an answer panel.
- **Desktop**: click "Desktop Preview". Drag with the mouse to look around;
  click an answer panel to select it, or click one of the three lifeline
  buttons floating above the host.
- **Mobile**: same as desktop preview — on supported devices it will ask for
  motion/orientation permission and let you look around by tilting the phone.

## The Game Editor

Click "Game Editor" from the start screen (works without starting a game).
You can edit the game title, theme colors, audio defaults, all host dialogue
lines, the 5-tier prize ladder, and all 5 questions (text, 4 options, correct
answer, per-question prize, host introduction line) — all from forms, no code
editing required.

- **Save Changes** — validates and writes to `localStorage`; the live game
  immediately uses the new configuration.
- **Preview Game** — saves, then jumps straight into Desktop Preview with
  your edits.
- **Reset Game** — clears saved data and restores the built-in defaults.
- **Export / Import JSON** — download the whole configuration as a `.json`
  file, or load one back in. Invalid files (wrong question count, out-of-range
  correct answers, etc.) are rejected with a specific, human-readable error
  message rather than being silently "fixed" for you.

The editor and the 3D game read and write the *same* configuration object —
there's no separate/fake editor state.

## Project structure

```
src/
  data/defaultConfig.js     Built-in title/theme/prizes/dialogue/5 questions
  utils/ConfigStore.js      localStorage persistence + validation + import/export
  utils/Emitter.js          tiny pub/sub used by GameManager

  game/GameState.js         state machine enum + legal transition table
  game/QuestionManager.js   wraps the 5 active question slots
  game/PrizeManager.js      prize ladder progress tracking
  game/LifelineManager.js   the three lifelines + the poll probability model
  game/GameManager.js       orchestrates the whole 5-question flow (Three.js-agnostic)

  scene/Studio.js           room shell: floor, walls, ceiling
  scene/Stage.js            stage riser, side pillars, contestant podium
  scene/Lighting.js         spot/ambient/rim lighting rig
  scene/Host.js             low-poly host NPC + procedural animation states;
                            head geometry built from the portrait's outline
  assets/host-face.jpg      host portrait (face-swapped onto the head in scene/Host.js)
  scene/Audience.js         instanced-mesh tiered crowd encircling the player,
                            with arms that rise for the audience vote
  scene/Screen.js           big question screen + 4 answer panels + the lifeline
                            row (canvas textures), laid out around the host so
                            he is never covered
  scene/PrizeLadder.js      prize ladder panel

  vr/VRManager.js           WebXR session + controller ray-selection
  vr/DesktopLook.js         drag-to-look + click-to-select for desktop
  vr/GyroLook.js            optional mobile device-orientation look controls

  audio/AudioManager.js     Web Audio synthesized SFX + optional speech synthesis

  editor/Editor.js          the full Game Editor admin panel

  ui/StartScreen.js         start screen wiring
  ui/HUD.js                 in-game mute/volume/menu HUD

  main.js                   wires everything together + render loop
```

## Design notes / scope decisions

- **Exactly 5 questions, always.** The state machine (`game/GameState.js`)
  only allows the sequence `START → HOST_INTRO → (QUESTION → ANSWER_SELECTED →
  REVEAL → CORRECT → NEXT_QUESTION) × 5 → FINAL_RESULT → PLAY_AGAIN`, plus the
  single failure branch `REVEAL → INCORRECT → GAME_OVER → PLAY_AGAIN`.
  Illegal transitions (double-answering, answering before a question loads,
  skipping ahead) are rejected at the source.
- **One wrong answer ends the run.** `INCORRECT` has exactly one legal
  transition (`GAME_OVER`) — there is deliberately no path from a wrong answer
  to `NEXT_QUESTION`, so the *only* route through the five questions is five
  correct answers. A wrong answer highlights the wrong choice in red and the
  right one in green, triggers a disappointed host pose plus a crowd sigh, and
  then switches to the Game Over screen ("GAME OVER / That answer is
  incorrect. / Thank you for playing!") with a **[ PLAY AGAIN ]** button that
  resets the whole game back to question 1.
- **The host is never covered.** He stands dead centre of the room, and every
  piece of UI is placed *around* him: the question wall sits above and behind
  his head, the prize ladder hangs beside it, and the four answer panels flank
  him left and right (angled inwards, clear of his outstretched arms). The
  question/answer interface and the host are always visible together, so you
  never have to turn away from him to answer.
- **Three lifelines, one per game.** *Ask the audience* paints a percentage
  share bar on all four answer panels (the highest share is always the correct
  option) *and* wakes the room up: the crowd turns to confer, bobs harder and
  raises its hands in a wave around the contestant before settling again when
  the answer is locked in. *50:50* blacks out exactly two wrong panels and
  makes them unclickable; *Phone a friend* names the guess on the wall strip
  and rims the suggested panel. Each is spent once per game and greys out on
  the lifeline row above the host. The poll distribution and the friend's
  suggestion come from the same per-question probability model, so they always
  agree with each other.
- **The room answers too.** A correct answer swings the studio lighting green
  and a wrong one red — ambient, rim, screen glow and the audience wash all
  follow the banner on the video wall, with a beat of extra intensity as the
  verdict lands, then fade back out on the next question. Only the host's warm
  key light is left (mostly) alone, so he stays legible while the room around
  him changes colour.
- **The audience surrounds the contestant.** Seating is generated along a wide
  arc (~250°, from front-left around the back to front-right) in five rising
  tiers, leaving only the ~96° front cone — where the host, wall and answers
  live — empty.
- **Almost no external assets.** The host and audience are built entirely
  from primitives (boxes/cylinders/spheres); the question screen, answer
  panels, and prize ladder are canvas-texture planes; all sound is synthesized
  with the Web Audio API. The one asset is the host's portrait photo
  (`src/assets/host-face.jpg`) — and the head is *made from it*: the photo's
  own silhouette (measured off the image as a half-width per row) is extruded
  into the head's geometry, the crop (crown to chin, shoulders and collar left
  out) is its front face, and the sides carry a chin-to-crown skin/hair ramp.
  His body stays the usual low-poly stack of boxes. If the photo ever fails to
  load, the host falls back to a drawn face rather than going blank.
- **Audience** uses three `InstancedMesh`es (riser steps, bodies + heads) for
  the whole crowd rather than one mesh per audience member, so reactions
  (idle/applause/disappointed/celebrate) stay cheap even with ~200 characters.
  The per-frame update rewrites only each instance's Y translation straight
  into the instance matrix buffer instead of recomposing matrices.
- **No forced camera movement.** The camera never auto-rotates the player;
  you always control where you're looking, per the VR-comfort requirement.

## Browser support notes

- WebXR ("Enter VR") requires a secure context (`https://` or `localhost`)
  and a WebXR-capable browser (e.g. Meta Quest Browser). Elsewhere, the
  button is automatically disabled and desktop preview is offered instead.
- Everything renders via a handful of lights and no real-time shadow maps,
  by design, to keep frame rate stable in VR.
