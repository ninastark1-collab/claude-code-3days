import * as Phaser from "phaser";
import { AI_FALLBACK_SEC } from "@bf/shared";
import { COLORS, CSS, FONT, FONT_NUM, FONT_TITLE, GAME_H, GAME_W } from "../layout";
import { makeButton, makePanel } from "../ui/widgets";
import { OnlineSession, pendingResumeToken, type JoinMode } from "../net/session";

type LobbyMode = JoinMode | "resume";

export class LobbyScene extends Phaser.Scene {
  private session: OnlineSession | null = null;
  private status!: Phaser.GameObjects.Text;
  private codeText!: Phaser.GameObjects.Text;
  private mode: LobbyMode = "quick";
  private code?: string;
  private dots = 0;
  private joinedAt = 0;

  constructor() { super("Lobby"); }

  init(data: { mode: LobbyMode; code?: string }) {
    this.mode = data.mode;
    this.code = data.code;
    this.session = null;
  }

  create() {
    if (this.textures.exists("bg_menu")) this.add.image(0, 0, "bg_menu").setOrigin(0, 0).setDisplaySize(GAME_W, GAME_H);
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, COLORS.uiDark, 0.45);
    makePanel(this, GAME_W / 2, 660, 640);
    const title = { quick: "빠른 매칭", create: "친구 대전 - 방 만들기", join: "친구 대전 - 참가", resume: "경기 복귀" }[this.mode];
    this.add.text(GAME_W / 2, 300, title, { fontFamily: FONT_TITLE, fontSize: "56px", fontStyle: "bold", color: "#fff6dc" }).setOrigin(0.5).setStroke("#3a2a6a", 10);
    this.status = this.add.text(GAME_W / 2, 600, "서버 연결 중", { fontFamily: FONT, fontSize: "32px", color: CSS.ink, align: "center", lineSpacing: 8 }).setOrigin(0.5);
    this.codeText = this.add.text(GAME_W / 2, 720, "", { fontFamily: FONT_NUM, fontSize: "96px", color: CSS.ink })
      .setOrigin(0.5).setLetterSpacing(10);

    makeButton(this, GAME_W / 2, 1150, "취소", "red", () => this.cancel(), { width: 420 });

    this.time.addEvent({ delay: 400, loop: true, callback: () => this.tickDots() });
    this.connect();
  }

  private async connect() {
    try {
      if (this.mode === "resume") this.status.setText("진행 중이던 경기에\n다시 접속하는 중");
      const s = this.mode === "resume"
        ? await OnlineSession.resume(pendingResumeToken() ?? "")
        : await OnlineSession.connect(this.mode, this.code);
      if (!this.scene.isActive()) { s.leave(); return; }
      this.session = s;
      this.joinedAt = this.time.now;
      s.onStart = () => this.scene.start("Battle", { mode: "online", session: s });
      s.onClosed = () => this.fail("서버와 연결이 끊어졌습니다");
      if (s.started) s.onStart();
    } catch (e) {
      console.warn(e);
      if (this.mode === "resume") { this.scene.start("Menu"); return; } // match is gone: back to menu
      this.fail(this.mode === "join" ? "방을 찾을 수 없습니다\n(코드를 확인하세요)" : "서버에 연결할 수 없습니다");
    }
  }

  private tickDots() {
    const s = this.session;
    if (!s) return;
    this.dots = (this.dots + 1) % 4;
    const d = ".".repeat(this.dots);
    if (s.isPrivate) {
      this.status.setText(`친구에게 코드를 알려주세요\n상대를 기다리는 중${d}`);
      this.codeText.setText(s.roomId);
    } else {
      const left = Math.max(0, Math.ceil(AI_FALLBACK_SEC - (this.time.now - this.joinedAt) / 1000));
      this.status.setText(left > 0 ? `상대를 찾는 중${d}\n${left}초 안에 못 찾으면 AI와 대전합니다` : `AI 상대를 준비하는 중${d}`);
    }
  }

  private fail(msg: string) {
    this.session = null;
    this.status.setText(msg).setColor("#c8442c");
    this.codeText.setText("");
  }

  private cancel() {
    this.session?.leave();
    this.session = null;
    this.scene.start("Menu");
  }
}
