/** BGM 미리듣기 페이지 (design/bgm-preview.html). 게임 번들에는 들어가지 않는다 */
import { bgmDebug, playStinger, preloadBgm, setBgm, setBgmVolume, type BgmId, type StingerId } from './bgm';
import { songLength, songToSpec } from './score';
import { SONGS } from './tracks';

const GROUPS: { title: string; items: [BgmId | StingerId, string, BgmId?][] }[] = [
  {
    title: '시작',
    items: [
      ['title', '타이틀 화면'],
      ['prologue', '시나리오 · 군주 선택'],
    ],
  },
  {
    title: '전략 (천하 지도)',
    items: [
      ['map_peace', '지도 · 평시'],
      ['map_war', '지도 · 전시 (적 침공 임박, 교전 중)'],
      ['city', '도시 내정 (3D 도시)'],
      ['court', '외교 · 사신 · 무장 · 연대기'],
      ['st_season', '새 계절 (1·4·7·10월)'],
      ['st_event', '역사 이벤트 팝업'],
      ['st_death', '장수 사망'],
      ['st_alarm', '적 침공 알림'],
    ],
  },
  {
    title: '전투',
    items: [
      ['council', '작전 회의'],
      ['battle', '야전 (자동 전투 관전)'],
      ['siege', '공성전 (성벽·성문이 있는 전장)'],
      ['st_duel', '일기토 개시 → 일기토', 'duel'],
      ['duel', '일기토'],
      ['st_victory', '전투 승리 → 개선', 'result_win'],
      ['st_defeat', '전투 패배 → 패주', 'result_lose'],
      ['result_win', '전투 결과 · 승리'],
      ['result_lose', '전투 결과 · 패배'],
    ],
  },
  {
    title: '엔딩',
    items: [
      ['ending_win', '천하통일'],
      ['ending_lose', '멸망'],
    ],
  },
];

const INST_COLOR: Record<string, string> = {
  zheng: '#c9822b', pipa: '#d4a23a', qin: '#8a6a3a', erhu: '#c0392b', cello: '#6b4a3a', pad: '#7d8a99',
  dizi: '#2e86ab', xiao: '#4f9d8f', suona: '#e0603a', bell: '#9b7ec8',
};

const list = document.getElementById('list')!;
const status = document.getElementById('status')!;
const roll = document.getElementById('roll') as HTMLCanvasElement;
const rollTitle = document.getElementById('roll-title')!;

function drawRoll(id: BgmId | StingerId): void {
  const song = SONGS[id];
  const spec = songToSpec(song, 8000);
  const len = songLength(song);
  const dpr = window.devicePixelRatio || 1;
  const w = roll.clientWidth;
  const h = roll.clientHeight;
  roll.width = w * dpr;
  roll.height = h * dpr;
  const g = roll.getContext('2d')!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const lo = 30;
  const hi = 96;
  const y = (f: number) => h - ((12 * Math.log2(f / 440) + 69 - lo) / (hi - lo)) * h;
  // 마디줄
  const bar = (60 / song.bpm) * (song.meter ?? 4);
  g.strokeStyle = 'rgba(128,128,128,.25)';
  for (let t = 0; t <= len + 1e-6; t += bar) {
    const x = (t / len) * w;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  spec.parts.forEach((p, i) => {
    const inst = song.layers[i]?.inst ?? '';
    const c = INST_COLOR[inst];
    for (const v of p.voices) {
      const x = (v.t / len) * w;
      if (!c) {
        g.fillStyle = 'rgba(128,128,128,.55)';
        g.fillRect(x, h - 6 - (i % 4) * 4, 2, 3);
        continue;
      }
      g.fillStyle = c;
      g.fillRect(x, y(v.freq) - 1.5, Math.max(2, (v.dur / len) * w - 1), 3);
    }
  });
  const legend = [...new Set(song.layers.map((l) => l.inst))].map((i) => `<span style="color:${INST_COLOR[i] ?? '#888'}">■</span> ${i}`).join('  ');
  rollTitle.innerHTML = `<b>${song.title}</b> · ${song.bpm} BPM · ${len.toFixed(1)}초 ${song.loop ? '반복' : '한 번'}<br><small>${legend}</small>`;
}

for (const grp of GROUPS) {
  const h = document.createElement('h2');
  h.textContent = grp.title;
  list.appendChild(h);
  for (const [id, label, then] of grp.items) {
    const song = SONGS[id];
    const b = document.createElement('button');
    b.className = id.startsWith('st_') ? 'cue stinger' : 'cue';
    b.dataset.id = id;
    b.innerHTML = `<span class="name">${song.title}</span><span class="when">${label}</span><span class="len">${songLength(song).toFixed(0)}s</span>`;
    b.onclick = () => {
      document.querySelectorAll('.cue.on').forEach((e) => e.classList.remove('on'));
      b.classList.add('on');
      drawRoll(id);
      if (id.startsWith('st_')) playStinger(id as StingerId, then);
      else setBgm(id as BgmId);
    };
    list.appendChild(b);
  }
}

document.getElementById('stop')!.onclick = () => setBgm(null);
const vol = document.getElementById('vol') as HTMLInputElement;
vol.oninput = () => setBgmVolume(Number(vol.value));
setBgmVolume(Number(vol.value));
preloadBgm(['title']);
drawRoll('title');

setInterval(() => {
  const d = bgmDebug();
  status.textContent = `오디오: ${d.state} · 재생 중: ${d.playing ?? '-'} · 합성해 둔 곡: ${d.cached.join(', ') || '-'} · 작업자: ${d.worker ? '사용' : '없음'}`;
}, 300);

(window as unknown as { bgmDebug: typeof bgmDebug }).bgmDebug = bgmDebug;
