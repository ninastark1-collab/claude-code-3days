import * as Phaser from "phaser";
import { GAME_H, GAME_W } from "./layout";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { BattleScene } from "./scenes/BattleScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { DeckScene } from "./scenes/DeckScene";
import { unlockAudio } from "./audio";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#141129",
  width: GAME_W,
  height: GAME_H,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  render: { antialias: true },
  scene: [BootScene, MenuScene, LobbyScene, BattleScene, DeckScene],
});

// long-press menus would interrupt dragging cards
window.addEventListener("contextmenu", (e) => e.preventDefault());

// first touch: unlock audio, and on phones go fullscreen + lock portrait where the browser allows it
const isTouch = matchMedia("(pointer: coarse)").matches;
const standalone = matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches;
window.addEventListener("pointerdown", () => {
  unlockAudio();
  if (!isTouch || standalone || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: "hide" })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("portrait"))
    .catch(() => { /* not allowed (e.g. iOS Safari): keep playing in the page */ });
}, { once: true });

// offline cache / installability (production builds only)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
