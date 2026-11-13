import { z } from 'zod';

/**
 * 세이브 상태 검증 (QA-DEV-04): 불러오기 단계에서 필수 필드가 빠지거나 형이 틀린 세이브를 거른다.
 * 게임이 진행 중 읽는 필드만 엄격히 보고, 나중에 붙은 선택 필드는 그대로 통과시킨다(passthrough).
 */
const num = z.number().finite();
const officer = z
  .object({
    id: z.string(),
    faction: z.string().nullable(),
    city: z.string(),
    status: z.enum(['unborn', 'free', 'serving', 'captive', 'dead']),
    troops: num,
    training: num,
    loyalty: num,
    acted: z.boolean(),
  })
  .passthrough();
const city = z
  .object({
    id: z.string(),
    faction: z.string().nullable(),
    population: num,
    gold: num,
    food: num,
    agriculture: num,
    commerce: num,
    walls: num,
    order: num,
    support: num,
    governor: z.string().nullable(),
  })
  .passthrough();
const faction = z
  .object({ id: z.string(), name: z.string(), ruler: z.string(), color: z.string(), capital: z.string(), alive: z.boolean() })
  .passthrough();
const relation = z.object({ friendship: num, treaty: z.enum(['none', 'alliance', 'truce']), treatyMonths: num }).passthrough();

export const gameStateSchema = z
  .object({
    scenarioId: z.string(),
    year: num,
    month: num.int().min(1).max(12),
    playerFaction: z.string(),
    rngState: num,
    officers: z.record(officer),
    cities: z.record(city),
    factions: z.record(faction),
    relations: z.record(relation),
    flags: z.record(z.union([z.number(), z.boolean(), z.string()])),
    log: z.array(z.object({ date: z.string(), text: z.string() }).passthrough()),
    messages: z.array(z.object({ title: z.string(), text: z.string() }).passthrough()),
    proposals: z.array(z.object({ from: z.string(), type: z.string(), envoy: z.string() }).passthrough()),
    pendingBattles: z.array(z.object({ id: z.string(), city: z.string(), units: z.array(z.unknown()) }).passthrough()),
    historicalEvents: z.boolean(),
    difficulty: z.enum(['easy', 'normal', 'hard']),
  })
  .passthrough()
  .superRefine((s, ctx) => {
    if (!s.factions[s.playerFaction]) ctx.addIssue({ code: 'custom', message: `플레이어 세력 없음: ${s.playerFaction}` });
  });

const battleSchema = z
  .object({
    state: z.object({ units: z.array(z.unknown()), tiles: z.array(z.unknown()) }).passthrough(),
    isDefense: z.boolean(),
  })
  .passthrough();

/** 검증 실패 시 사람이 읽을 첫 문제 위치 (예: "state.officers.liubei.loyalty") */
export function validateSaveState(state: unknown, battle?: unknown): string | null {
  const r = gameStateSchema.safeParse(state);
  if (!r.success) return `state.${r.error.issues[0]!.path.join('.')}`;
  if (battle !== undefined) {
    const b = battleSchema.safeParse(battle);
    if (!b.success) return `battle.${b.error.issues[0]!.path.join('.')}`;
  }
  return null;
}
