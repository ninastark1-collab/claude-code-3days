/** DOM overlay for entering a room code (window.prompt is unavailable in some webviews). */
export function askRoomCode(): Promise<string | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:10;font-family:'Gowun Dodum',sans-serif";
    wrap.innerHTML = `
      <form style="background:linear-gradient(#fbf1d8,#ead8b0);border:4px solid #2a2350;border-radius:18px;padding:22px;width:min(80vw,320px);text-align:center;color:#2a2350">
        <div style="font-family:'Gowun Batang',serif;font-size:20px;font-weight:bold;margin-bottom:14px">친구에게 받은 방 코드</div>
        <input name="code" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false"
          style="width:100%;box-sizing:border-box;font-family:'Jua',sans-serif;font-size:32px;letter-spacing:8px;text-align:center;text-transform:uppercase;padding:8px;border-radius:10px;border:3px solid #2a2350;background:#fffaf0;color:#2a2350" />
        <div style="display:flex;gap:10px;margin-top:16px">
          <button type="button" data-cancel style="flex:1;padding:12px;font-family:'Jua',sans-serif;font-size:18px;border:3px solid #2a2350;border-radius:12px;background:#f4e9d2;color:#2a2350">취소</button>
          <button type="submit" style="flex:1;padding:12px;font-family:'Jua',sans-serif;font-size:18px;border:3px solid #2a2350;border-radius:12px;background:#f2c14e;color:#2a2350">참가</button>
        </div>
      </form>`;
    const form = wrap.querySelector("form")!;
    const input = wrap.querySelector("input")!;
    const done = (v: string | null) => { wrap.remove(); resolve(v); };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim().toUpperCase();
      if (v.length === 5) done(v);
      else input.focus();
    });
    wrap.querySelector("[data-cancel]")!.addEventListener("click", () => done(null));
    document.body.appendChild(wrap);
    input.focus();
  });
}
