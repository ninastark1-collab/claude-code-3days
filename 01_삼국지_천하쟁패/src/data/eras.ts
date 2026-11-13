import { z } from 'zod';
import rawEras from '../../data/eras.json';

/** 연호표 (설계노트 32-2). start = 원년, from = 이 연호로 표기하기 시작하는 해 */
const EraSchema = z.object({
  name: z.string(),
  hanja: z.string(),
  start: z.number().int(),
  from: z.number().int(),
  camp: z.enum(['wei', 'shu', 'wu']).optional(),
  note: z.string(),
});
export type Era = z.infer<typeof EraSchema>;
export const ERAS: Era[] = z.array(EraSchema).parse(rawEras);

export type Camp = 'wei' | 'shu' | 'wu';

/** 세력 표기 진영: 촉(유비 일가)·오(손씨)만 자체 연호, 나머지는 위(한) 연호 */
export function campOf(factionId: string, rulerId: string): Camp {
  if (rulerId.startsWith('liu_bei') || rulerId === 'liu_shan' || factionId === 'shu') return 'shu';
  if (rulerId.startsWith('sun_') || factionId.startsWith('sun') || factionId === 'wu') return 'wu';
  return 'wei';
}

/** 해당 연도의 연호. 220년 이후는 진영별 연호 */
export function eraOf(year: number, camp: Camp = 'wei'): Era | null {
  const latest = (pred: (e: Era) => boolean) =>
    ERAS.filter((e) => e.from <= year && pred(e)).reduce<Era | null>((a, e) => (!a || e.from >= a.from ? e : a), null);
  // 촉·오는 자체 연호를 세운 뒤에는 그것을, 그전에는 한(위) 연호를 따른다
  if (camp !== 'wei') {
    const own = latest((e) => e.camp === camp);
    if (own) return own;
  }
  return latest((e) => !e.camp || e.camp === 'wei');
}

/** "흥평 원년" / "건안 13년" 형식 */
export function eraLabel(year: number, camp: Camp = 'wei'): string {
  const e = eraOf(year, camp);
  if (!e) return '';
  const n = year - e.start + 1;
  return `${e.name} ${n === 1 ? '원' : n}년`;
}
