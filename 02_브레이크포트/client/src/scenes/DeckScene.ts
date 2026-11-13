import * as Phaser from "phaser";
import { CARDS, DECK_SIZE, averageCost, getCard, isValidDeck } from "@bf/shared";
import { COLORS, CSS, FONT, FONT_NUM, FONT_TITLE, GAME_H, GAME_W } from "../layout";
import { getProfile, saveProfile } from "../profile";
import { cardInfo } from "../ui/cardInfo";
import { CardView, makeButton } from "../ui/widgets";
import { play } from "../audio";

const COLS = 5, CW = 120, GAP = 14, TOP = 176;
const CH = (175 * CW) / 136;
const RARITY_NAME = { c: "일반", r: "희귀", e: "영웅", l: "전설" } as const;

/** Pick 8 of the available cards. Tap = toggle + show details. */
export class DeckScene extends Phaser.Scene {
  private deck: string[] = [];
  private focus = "";
  private cells = new Map<string, { view: CardView; badge: Phaser.GameObjects.Text; hit: Phaser.GameObjects.Zone }>();
  private header!: Phaser.GameObjects.Text;
  private infoTitle!: Phaser.GameObjects.Text;
  private infoBody!: Phaser.GameObjects.Text;
  private save!: ReturnType<typeof makeButton>;

  constructor() { super("Deck"); }

  create() {
    this.deck = [...getProfile().deck];
    this.focus = this.deck[0];
    this.cells = new Map();

    const g = this.add.graphics();
    g.fillGradientStyle(0x262050, 0x262050, 0x141129, 0x141129, 1).fillRect(0, 0, GAME_W, GAME_H);
    this.add.text(GAME_W / 2, 64, "덱 편집", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "54px", color: CSS.gold }).setOrigin(0.5);
    this.header = this.add.text(GAME_W / 2, 128, "", { fontFamily: FONT_NUM, fontSize: "28px", color: CSS.text }).setOrigin(0.5);

    const left = (GAME_W - (COLS * CW + (COLS - 1) * GAP)) / 2;
    CARDS.forEach((c, i) => {
      const x = left + (i % COLS) * (CW + GAP);
      const y = TOP + Math.floor(i / COLS) * (CH + GAP);
      const view = new CardView(this, x, y, CW);
      view.set(c.id);
      const badge = this.add.text(x + CW - 4, y + 6, "", { fontFamily: FONT_NUM, fontSize: "22px", color: CSS.ink, backgroundColor: CSS.gold, padding: { x: 7, y: 1 } }).setOrigin(1, 0).setDepth(1);
      const hit = this.add.zone(x + CW / 2, y + CH / 2, CW, CH).setInteractive({ useHandCursor: true });
      hit.on("pointerup", () => this.toggle(c.id));
      this.cells.set(c.id, { view, badge, hit });
    });

    const infoY = TOP + Math.ceil(CARDS.length / COLS) * (CH + GAP) + 8;
    this.add.rectangle(GAME_W / 2, infoY + 108, GAME_W - 36, 216, COLORS.parchment, 0.97).setStrokeStyle(5, COLORS.ink);
    this.infoTitle = this.add.text(42, infoY + 16, "", { fontFamily: FONT_TITLE, fontStyle: "bold", fontSize: "27px", color: CSS.ink });
    this.infoBody = this.add.text(42, infoY + 60, "", { fontFamily: FONT, fontSize: "23px", color: "#3a2a14", lineSpacing: 8, wordWrap: { width: GAME_W - 84 } });

    makeButton(this, GAME_W / 2 - 140, GAME_H - 80, "취소", "parchment", () => this.scene.start("Menu"), { width: 260 });
    this.save = makeButton(this, GAME_W / 2 + 140, GAME_H - 80, "저장", "gold", () => this.saveDeck(), { width: 260, sound: false });
    this.refresh();
  }

  private toggle(id: string) {
    this.focus = id;
    const i = this.deck.indexOf(id);
    if (i >= 0) this.deck.splice(i, 1);
    else if (this.deck.length < DECK_SIZE) this.deck.push(id);
    else { play("error"); this.refresh(); return; } // full: just show details
    play("select");
    this.refresh();
  }

  private refresh() {
    for (const [id, cell] of this.cells) {
      const n = this.deck.indexOf(id);
      cell.view.setState(true, false);
      cell.view.frame.setVisible(n >= 0);
      cell.view.img.setAlpha(n >= 0 ? 1 : 0.55);
      cell.badge.setText(n >= 0 ? String(n + 1) : "").setVisible(n >= 0);
    }
    const ok = isValidDeck(this.deck);
    const avg = this.deck.length ? averageCost(this.deck).toFixed(1) : "-";
    const air = this.deck.some((id) => getCard(id).targetsAir || getCard(id).type === "spell");
    this.header.setText(`${this.deck.length} / ${DECK_SIZE}장 · 평균 잉크 ${avg}${ok && !air ? "  · 공중 대응 카드 없음!" : ""}`)
      .setColor(ok ? (air ? CSS.text : "#ffb4a2") : CSS.gold);
    const info = cardInfo(this.focus);
    const rar = getCard(this.focus).rarity;
    this.infoTitle.setText(info.title + (rar ? `  ·  ${RARITY_NAME[rar]}` : ""));
    this.infoBody.setText(info.lines.join("\n"));
    this.save.setEnabled(ok);
  }

  private saveDeck() {
    if (!isValidDeck(this.deck)) { play("error"); return; }
    saveProfile({ deck: [...this.deck] });
    play("deploy");
    this.scene.start("Menu");
  }
}
