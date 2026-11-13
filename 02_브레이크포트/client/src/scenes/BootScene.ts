import * as Phaser from "phaser";
import { createTextures } from "../art";
import { createAnims, loadFonts, preloadAssets } from "../assets";
import { COLORS, CSS, FONT_NUM, GAME_H, GAME_W } from "../layout";

/** Loads the designer's art + web fonts (with a progress bar), fills gaps with placeholder art, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() { super("Boot"); }

  preload() {
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.uiDark);
    this.add.text(GAME_W / 2, GAME_H / 2 - 80, "몬스터 클래스 입학 준비 중…", { fontFamily: FONT_NUM, fontSize: "36px", color: CSS.parchment }).setOrigin(0.5);
    const barW = 460;
    this.add.rectangle(GAME_W / 2, GAME_H / 2, barW + 12, 34, COLORS.ink).setStrokeStyle(3, COLORS.gold);
    const bar = this.add.rectangle(GAME_W / 2 - barW / 2, GAME_H / 2, 1, 22, COLORS.mana).setOrigin(0, 0.5);
    this.load.on("progress", (p: number) => bar.setSize(Math.max(1, barW * p), 22));
    this.load.on("loaderror", (f: { key: string }) => console.warn("asset failed to load:", f.key));
    preloadAssets(this);
  }

  async create() {
    createTextures(this); // placeholder art only for textures the designer files didn't provide
    createAnims(this);
    await loadFonts();
    this.scene.start("Menu");
  }
}
