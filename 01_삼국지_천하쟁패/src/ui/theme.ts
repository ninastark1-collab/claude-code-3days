/**
 * 세력 색·무늬·한자 표기 (design/visual-bible.html v0.2).
 * 색 값은 tokens.css 의 --f-* 변수와 같다. 캔버스는 CSS 변수를 직접 못 읽으므로 같은 값을 여기서도 읽어 쓴다.
 */
export type Pattern = 'solid' | 'dot' | 'hatch' | 'cross' | 'stripe' | 'none';

interface FactionStyle {
  token: string; // CSS 변수 이름
  pattern: Pattern; // 색약 모드 무늬
}

/** 디자인 표(194년 안료 + 후속 세력) → 데이터 세력 ID. 표에 없는 세력은 군소·공백 */
const BY_FACTION_ID: Record<string, FactionStyle> = {
  han: { token: '--f-han', pattern: 'dot' },
  yellow: { token: '--f-yellow', pattern: 'cross' },
  liu_bei: { token: '--f-liu', pattern: 'solid' },
  gongsun_zan: { token: '--f-gongsun', pattern: 'hatch' },
  sun_jian: { token: '--f-sunjian', pattern: 'solid' },
  han_sui: { token: '--f-hansui', pattern: 'solid' },
  dong_zhuo: { token: '--f-dong', pattern: 'solid' },
  liu_yan: { token: '--f-liuyan', pattern: 'dot' },
  yuan_shao: { token: '--f-yshao', pattern: 'dot' },
  han_fu: { token: '--f-hanfu', pattern: 'solid' },
  cao: { token: '--f-cao', pattern: 'dot' },
  yuan_shu: { token: '--f-yshu', pattern: 'dot' },
  kong_rong: { token: '--f-kongrong', pattern: 'solid' },
  tao_qian: { token: '--f-taoqian', pattern: 'cross' },
  liu_yu: { token: '--f-liuyu', pattern: 'hatch' },
  gongsun_du: { token: '--f-gsd', pattern: 'solid' },
  zhang_miao: { token: '--f-zhangmiao', pattern: 'hatch' },
  kong_zhou: { token: '--f-kongzhou', pattern: 'stripe' },
  wang_kuang: { token: '--f-wangkuang', pattern: 'solid' },
  zhang_yang: { token: '--f-zhangyang', pattern: 'dot' },
  ma_teng: { token: '--f-ma', pattern: 'hatch' },
  liu_biao: { token: '--f-liubiao', pattern: 'cross' },
  zhang_lu: { token: '--f-zhanglu', pattern: 'dot' },
  liu_yao: { token: '--f-liuyao', pattern: 'dot' },
  yan_baihu: { token: '--f-yanbaihu', pattern: 'solid' },
  wang_lang: { token: '--f-wanglang', pattern: 'solid' },
  lu_bu: { token: '--f-lubu', pattern: 'solid' },
  li_jue: { token: '--f-lijue', pattern: 'solid' },
  liu_zhang: { token: '--f-liuzhang', pattern: 'solid' },
  zhang_yan: { token: '--f-zhangyan', pattern: 'hatch' },
  sun_ce: { token: '--f-sunce', pattern: 'cross' },
  sun_quan: { token: '--f-sun', pattern: 'cross' },
  gongsun_kang: { token: '--f-gongsunkang', pattern: 'solid' },
  meng_huo: { token: '--f-menghuo', pattern: 'solid' },
};
const NONE: FactionStyle = { token: '--f-none', pattern: 'none' };

export function factionStyle(id: string | null | undefined): FactionStyle {
  return (id && BY_FACTION_ID[id]) || NONE;
}

/** 표에 없어서 군소·공백 색으로 처리되는지 (보고용) */
export function isUnmappedFaction(id: string): boolean {
  return !BY_FACTION_ID[id];
}

const cache = new Map<string, string>();
/** CSS 변수 값을 읽는다 (캔버스용) */
export function tokenValue(name: string): string {
  let v = cache.get(name);
  if (!v) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
    cache.set(name, v);
  }
  return v;
}

export function factionColor(id: string | null | undefined): string {
  return tokenValue(factionStyle(id).token);
}

export function factionVar(id: string | null | undefined): string {
  return `var(${factionStyle(id).token})`;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 세력색 위 글자색: 밝은 바탕엔 먹, 어두운 바탕엔 한지색 (디자인 문서의 inkOn) */
export function inkOn(hex: string): string {
  const [r, g, b] = rgb(hex);
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255 > 0.62 ? tokenValue('--g-ink') : tokenValue('--g-text');
}

/** 무늬 색: 밝은 바탕엔 어두운 무늬, 어두운 바탕엔 밝은 무늬 */
function patternInk(hex: string): string {
  const [r, g, b] = rgb(hex);
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255 > 0.55 ? 'rgba(26,25,22,.45)' : 'rgba(238,232,215,.45)';
}

/** DOM 배경: 색약 모드면 무늬를 얹는다 */
export function factionBackground(id: string | null | undefined, colorBlind: boolean): string {
  const st = factionStyle(id);
  const c = tokenValue(st.token);
  if (!colorBlind) return c;
  const k = patternInk(c);
  if (st.pattern === 'hatch') return `repeating-linear-gradient(45deg,${k} 0 2px,transparent 2px 7px),${c}`;
  if (st.pattern === 'dot') return `radial-gradient(circle,${k} 1.6px,transparent 2px) 0 0/7px 7px,${c}`;
  if (st.pattern === 'stripe') return `repeating-linear-gradient(0deg,${k} 0 2px,transparent 2px 7px),${c}`;
  if (st.pattern === 'cross')
    return `repeating-linear-gradient(45deg,${k} 0 1.5px,transparent 1.5px 8px),repeating-linear-gradient(-45deg,${k} 0 1.5px,transparent 1.5px 8px),${c}`;
  return c;
}

/** 캔버스 무늬 채우기 (색약 모드) */
export function canvasPattern(ctx: CanvasRenderingContext2D, id: string | null | undefined): CanvasPattern | null {
  const st = factionStyle(id);
  if (st.pattern === 'solid' || st.pattern === 'none') return null;
  const c = tokenValue(st.token);
  const tile = document.createElement('canvas');
  tile.width = tile.height = 8;
  const t = tile.getContext('2d')!;
  t.fillStyle = patternInk(c);
  t.strokeStyle = patternInk(c);
  t.lineWidth = 1.5;
  if (st.pattern === 'dot') {
    t.beginPath();
    t.arc(4, 4, 1.6, 0, Math.PI * 2);
    t.fill();
  } else if (st.pattern === 'stripe') {
    t.fillRect(0, 3, 8, 2);
  } else {
    t.beginPath();
    t.moveTo(0, 8);
    t.lineTo(8, 0);
    if (st.pattern === 'cross') {
      t.moveTo(0, 0);
      t.lineTo(8, 8);
    }
    t.stroke();
  }
  return ctx.createPattern(tile, 'repeat');
}

// ───────────────────────────── 한자 표기 ─────────────────────────────

/** 무장 ID(병음 성씨) → 낙관용 한자 한 글자 */
const SURNAME_HANZI: Record<string, string> = {
  liu: '劉', cao: '曹', sun: '孫', zhang: '張', guan: '關', zhao: '趙', zhuge: '諸', lu: '呂', yuan: '袁', ma: '馬',
  xiahou: '夏', xun: '荀', guo: '郭', chen: '陳', huang: '黃', wei: '魏', xu: '許', dian: '典', yu: '于', le: '樂',
  li: '李', man: '滿', mao: '毛', gongsun: '公', kong: '孔', wang: '王', mi: '糜', jian: '簡', song: '宋', hou: '侯',
  diao: '貂', ji: '紀', yan: '顏', lei: '雷', yang: '楊', cheng: '程', han: '韓', zhou: '周', taishi: '太', ze: '笮',
  kuai: '蒯', cai: '蔡', wen: '文', jin: '金', xing: '邢', gan: '甘', su: '蘇', yi: '伊', jia: '賈', fan: '樊',
  hu: '胡', pang: '龐', dong: '董', sima: '司', fa: '法', meng: '孟', deng: '鄧', leng: '冷', wu: '吳', tian: '田',
  ju: '沮', shen: '審', feng: '逢', gao: '高', chunyu: '淳', jiang: '姜', zang: '臧', hua: '華', he: '何', tao: '陶',
  zhu: '朱', ding: '丁', ling: '凌', pan: '潘', bu: '步', quan: '全', lv: '呂', xie: '謝', xiang: '向', fei: '費',
  qiao: '喬', tang: '唐', shi: '士', shan: '單', bao: '鮑', qin: '秦', fu: '傅', dun: '頓', liao: '廖', zhong: '鍾',
  huangfu: '皇', lou: '婁', luo: '駱', mu: '穆', ruan: '阮', bian: '卞', ren: '任', yin: '尹', lian: '廉', xin: '辛',
};

/** 병음이 같은 다른 성씨 (呂/陸/魯, 許/徐, 姜/蔣 …) */
const ID_HANZI: Record<string, string> = {
  lu_xun: '陸', lu_kang: '陸', lu_ji: '陸', lu_su: '魯', lu_zhi: '盧', xu_huang: '徐', xu_shu: '徐', xu_sheng: '徐',
  jiang_qin: '蔣', jiang_wan: '蔣', jiang_ji: '蔣', yu_fan: '虞', cheng_yi: '成', zhurong: '祝', zhou_cang: '周',
  han_dang: '韓', zhu_zhi: '朱', zhu_ran: '朱', zhu_huan: '朱', zhang_zhao: '張', sun_qian: '孫', mi_zhu: '糜', mi_fang: '糜',
  wei_yan: '魏', wei_xu: '魏', fu_shiren: '傅', shi_xie: '士', bu_zhi: '步', ruan_yu: '阮',
};

/** 낙관 글자: ID의 성씨 병음으로 한자, 모르면 한글 첫 글자 */
export function sealChar(officerId: string, name: string): string {
  if (ID_HANZI[officerId]) return ID_HANZI[officerId]!;
  const parts = officerId.split('_');
  for (let n = Math.min(2, parts.length - 1); n >= 1; n--) {
    const key = parts.slice(0, n).join('');
    if (SURNAME_HANZI[key]) return SURNAME_HANZI[key]!;
  }
  return name.slice(0, 1);
}

/** 도시 한자 이름 (도시 시트 제목 옆) */
export const CITY_HANZI: Record<string, string> = {
  xiangping: '襄平', beiping: '北平', ji: '薊', nanpi: '南皮', ye: '鄴', pingyuan: '平原', jinyang: '晉陽', shangdang: '上黨',
  beihai: '北海', puyang: '濮陽', chenliu: '陳留', xuchang: '許昌', xiaopei: '小沛', xiapi: '下邳', langya: '琅邪', runan: '汝南',
  qiao: '譙', luoyang: '洛陽', hongnong: '弘農', changan: '長安', tianshui: '天水', anding: '安定', wuwei: '武威', xiliang: '西涼',
  hanzhong: '漢中', wan: '宛', xinye: '新野', xiangyang: '襄陽', jiangling: '江陵', jiangxia: '江夏', changsha: '長沙', wuling: '武陵',
  lingling: '零陵', guiyang: '桂陽', shouchun: '壽春', lujiang: '廬江', jianye: '建業', wu: '吳', kuaiji: '會稽', chaisang: '柴桑',
  zitong: '梓潼', chengdu: '成都', jiangzhou: '江州', yongan: '永安', jianning: '建寧', yunnan: '雲南',
};
