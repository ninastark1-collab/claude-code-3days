import * as Phaser from "phaser";
import { getCard } from "@bf/shared";
import { cardKey, uiKey } from "../assets";
import { iconKey } from "../art";
import { COLORS, CSS, FONT_NUM, FONT_TITLE } from "../layout";
import { play } from "../audio";

export type ButtonStyle = "gold" | "blue" | "parchment" | "red";
const DARK_TEXT: Record<ButtonStyle, boolean> = { gold: true, parchment: true, blue: false, red: false };

/**
 * Button from the UI kit (1080x210 PNG, normal + pressed). Label in Jua, no text baked in the art.
 * Falls back to a plain rectangle if the PNG is missing.
 */
export function makeButton(scene: Phaser.Scene, x: number, y: number, label: string, style: ButtonStyle, onClick: () => void,
  opts: { width?: number; height?: number; fontSize?: number; depth?: number; sound?: boolean } = {}) {
  const w = opts.width ?? 540;
  const h = opts.height ?? (w * 210) / 1080; // small buttons get an explicit height to stay thumb-sized
  const depth = opts.depth ?? 0;
  const key = uiKey(`button_${style}`), pressedKey = uiKey(`button_${style}_pressed`);
  const hasArt = scene.textures.exists(key);
  const bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = hasArt
    ? scene.add.image(x, y, key).setDisplaySize(w, h)
    : scene.add.rectangle(x, y, w, h, style === "gold" ? COLORS.gold : style === "blue" ? COLORS.me : style === "red" ? COLORS.enemy : COLORS.parchment).setStrokeStyle(5, COLORS.ink);
  bg.setDepth(depth);
  const text = scene.add.text(x, y - h * 0.04, label, {
    fontFamily: FONT_NUM, fontSize: `${opts.fontSize ?? Math.round(h * 0.4)}px`,
    color: DARK_TEXT[style] ? CSS.ink : "#ffffff",
  }).setOrigin(0.5).setDepth(depth + 0.1);
  if (!DARK_TEXT[style]) text.setStroke(CSS.ink, 5);
  const press = (down: boolean) => {
    if (hasArt && scene.textures.exists(pressedKey)) (bg as Phaser.GameObjects.Image).setTexture(down ? pressedKey : key).setDisplaySize(w, h);
    text.y = y - h * 0.04 + (down ? h * 0.04 : 0);
  };
  bg.setInteractive({ useHandCursor: true })
    .on("pointerdown", () => press(true))
    .on("pointerout", () => press(false))
    .on("pointerup", () => { press(false); if (opts.sound !== false) play("select"); onClick(); });
  return { bg, text, destroy: () => { bg.destroy(); text.destroy(); }, setEnabled(on: boolean) { bg.setAlpha(on ? 1 : 0.45); text.setAlpha(on ? 1 : 0.6); } };
}

/**
 * Card PNG (272x350 = 136x175 slot at 2x) with the cost on the ink drop and the name on the ribbon.
 * Positions follow the hand-off note: drop centre ~(19,31), ribbon y 128-150 in 136x175 coordinates.
 */
export class CardView {
  readonly img: Phaser.GameObjects.Image;
  readonly cost: Phaser.GameObjects.Text;
  readonly name: Phaser.GameObjects.Text;
  readonly frame: Phaser.GameObjects.Rectangle; // selection outline
  private cardId = "";
  private baseY: number;

  constructor(private scene: Phaser.Scene, private x: number, y: number, readonly w: number, depth = 0) {
    this.baseY = y;
    const k = w / 136;
    this.img = scene.add.image(x, y, "px").setOrigin(0, 0).setDepth(depth);
    this.frame = scene.add.rectangle(x + w / 2, y + (175 * k) / 2, w + 6, 175 * k + 6).setStrokeStyle(5, COLORS.gold).setFillStyle(0, 0).setDepth(depth + 0.2).setVisible(false);
    this.cost = scene.add.text(0, 0, "", { fontFamily: FONT_NUM, fontSize: `${Math.round(22 * k)}px`, color: "#ffffff" })
      .setOrigin(0.5).setStroke(CSS.ink, Math.max(2, Math.round(4 * k))).setDepth(depth + 0.1);
    this.name = scene.add.text(0, 0, "", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: `${Math.round(15 * k)}px`, color: CSS.ribbon })
      .setOrigin(0.5).setDepth(depth + 0.1);
    this.place(0);
  }

  get h() { return (175 * this.w) / 136; }

  set(id: string) {
    if (id === this.cardId) return;
    this.cardId = id;
    const c = getCard(id);
    const k = this.w / 136;
    if (this.scene.textures.exists(cardKey(id))) {
      this.img.setTexture(cardKey(id)).setDisplaySize(this.w, this.h);
    } else {
      // no card art (shouldn't happen once the designer files are in): placeholder icon
      this.img.setTexture(iconKey(id));
      this.img.setScale((this.h * 0.6) / Math.max(this.img.width, this.img.height));
    }
    this.cost.setText(String(c.cost));
    // fit the name on the ribbon (~112px wide at k=1)
    let size = Math.round(15 * k);
    this.name.setFontSize(size).setText(c.name);
    while (this.name.width > 112 * k && size > 8) this.name.setFontSize(--size);
  }

  /** lift > 0 raises the card (selected). */
  place(lift: number) {
    const k = this.w / 136;
    const y = this.baseY - lift;
    this.img.setPosition(this.x, y);
    this.cost.setPosition(this.x + 19 * k, y + 32 * k);
    this.name.setPosition(this.x + 68 * k, y + 139 * k);
    this.frame.setPosition(this.x + this.w / 2, y + this.h / 2);
  }

  setState(playable: boolean, selected: boolean) {
    this.place(selected ? 16 : 0);
    this.frame.setVisible(selected);
    if (playable) this.img.clearTint(); else this.img.setTint(0x8a8a9a);
    this.img.setAlpha(playable ? 1 : 0.85);
    this.cost.setColor(playable ? "#ffffff" : "#c9c4dd");
  }

  setVisible(v: boolean) { [this.img, this.cost, this.name].forEach((o) => o.setVisible(v)); if (!v) this.frame.setVisible(false); }
  destroy() { [this.img, this.cost, this.name, this.frame].forEach((o) => o.destroy()); }
}

/** Parchment dialog panel (ui/panel.png, 1120x704 -> 560x352 by default). */
export function makePanel(scene: Phaser.Scene, x: number, y: number, w = 560, depth = 0) {
  const h = (w * 704) / 1120;
  if (scene.textures.exists(uiKey("panel"))) return scene.add.image(x, y, uiKey("panel")).setDisplaySize(w, h).setDepth(depth);
  return scene.add.rectangle(x, y, w, h, COLORS.parchment).setStrokeStyle(6, COLORS.ink).setDepth(depth);
}
