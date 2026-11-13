import { z } from 'zod';

/** 능력치는 1~100 범위 */
const stat = z.number().int().min(1).max(100);
const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id는 소문자/숫자/밑줄만 사용');

/** 무장 특기 */
export const SkillSchema = z.enum([
  'fire', // 화계
  'cavalry', // 기마
  'archery', // 궁술
  'navy', // 수군
  'siege', // 공성
  'ambush', // 매복
  'rumor', // 유언
  'sow_discord', // 이간
  'inspire', // 고무
  'duel', // 일기토
  'medicine', // 의술
  'agriculture', // 농업 전문
  'commerce', // 상업 전문
  'diplomacy', // 외교
  'recruit', // 등용
]);
export type Skill = z.infer<typeof SkillSchema>;

/** 무장 원본 데이터 (시나리오와 무관한 고정 정보) */
export const OfficerSchema = z.object({
  id,
  name: z.string().min(1), // 이름 (예: 조조)
  courtesy: z.string().optional(), // 자 (예: 맹덕)
  leadership: stat, // 통솔
  war: stat, // 무력
  intelligence: stat, // 지력
  politics: stat, // 정치
  charisma: stat, // 매력
  /**
   * 가치관 2축 좌표 [가로, 세로], 각 -100~100.
   * 가로: 대의(+) ↔ 실리(-), 세로: 인정(+) ↔ 법치(-). 군주와 가까울수록 등용·충성에 유리.
   */
  values: z.tuple([z.number().int().min(-100).max(100), z.number().int().min(-100).max(100)]),
  loyaltyTrait: z.number().int().min(1).max(15), // 의리 (높을수록 배신 안함)
  ambition: z.number().int().min(1).max(15), // 야망
  birthYear: z.number().int(),
  debutYear: z.number().int(), // 등장 연도
  deathYear: z.number().int(),
  skills: z.array(SkillSchema).default([]),
  /** 혈연 (부모 무장 id) */
  father: id.optional(),
  /** 의형제 그룹 id (같은 그룹끼리 의형제) */
  sworn: z.string().optional(),
  spouse: id.optional(),
  /** 고향 도시: 시나리오에 배치되지 않은 무장이 등장 연도에 재야로 나타나는 곳 */
  homeCity: id.optional(),
  /** 초상 특징 (선택). 없으면 화면 쪽 생성기가 능력치로 자동 생성. 게임 규칙에는 쓰이지 않는다 */
  face: z
    .object({
      skin: z.string(),
      shape: z.string(),
      eyes: z.string(),
      eyeColor: z.string(),
      brows: z.string(),
      beard: z.string(),
      beardColor: z.string(),
      keepBeard: z.boolean(),
      hairColor: z.string(),
      head: z.string(),
      body: z.string(),
      mouth: z.string(),
      metal: z.string(),
      scarf: z.string(),
      robe: z.string(),
      border: z.string(),
      plume: z.string(),
      hoodColor: z.string(),
      bandColor: z.string(),
      band2: z.string(),
      patch: z.string(),
      bigEars: z.boolean(),
      earring: z.boolean(),
      fan: z.boolean(),
      whisk: z.boolean(),
      scar: z.boolean(),
    })
    .partial()
    .optional(),
  /** 초상 등급 (선택): S 특급 · A 일급 · gen 조립식 */
  portraitTier: z.enum(['S', 'A', 'gen']).optional(),
});
export type Officer = z.infer<typeof OfficerSchema>;

export const TerrainSchema = z.enum(['plain', 'mountain', 'river', 'coast', 'frontier']);

/** 도시 원본 데이터 */
export const CitySchema = z.object({
  id,
  name: z.string().min(1),
  /** 전략맵 좌표 (0~1000 정규화) */
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(1000),
  region: z.string(), // 주 (예: 연주, 기주)
  terrain: TerrainSchema,
  maxPopulation: z.number().int().positive(),
  maxAgriculture: z.number().int().positive(),
  maxCommerce: z.number().int().positive(),
  maxWalls: z.number().int().positive(),
});
export type City = z.infer<typeof CitySchema>;

/** 도시 간 길 (양방향). [도시A, 도시B, 종류] — land=육로, water=수로 */
export const RoadSchema = z.tuple([id, id, z.enum(['land', 'water'])]);
export type Road = z.infer<typeof RoadSchema>;

/** 시나리오 시작 시 도시 상태 */
export const CityStartSchema = z.object({
  city: id,
  faction: id.nullable(), // null = 공백지
  population: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  food: z.number().int().nonnegative(),
  agriculture: z.number().int().nonnegative(),
  commerce: z.number().int().nonnegative(),
  walls: z.number().int().nonnegative(),
  order: z.number().int().min(0).max(100), // 치안
  support: z.number().int().min(0).max(100), // 민심
});

export const OfficerStartSchema = z.object({
  officer: id,
  /** null = 재야(무소속) */
  faction: id.nullable(),
  city: id,
  troops: z.number().int().nonnegative().default(0),
  loyalty: z.number().int().min(0).max(100).default(80),
  /** 미등장 무장은 등장 연도에 해당 도시에 재야로 나타남 */
});

export const FactionStartSchema = z.object({
  id,
  name: z.string(),
  ruler: id,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  capital: id,
  personality: z.enum(['aggressive', 'defensive', 'diplomatic', 'balanced']).default('balanced'),
});

export const RelationStartSchema = z.object({
  a: id,
  b: id,
  /** 우호도 0~100 */
  friendship: z.number().int().min(0).max(100),
  treaty: z.enum(['none', 'alliance', 'truce']).default('none'),
});

export const ScenarioSchema = z.object({
  id,
  name: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  description: z.string(),
  factions: z.array(FactionStartSchema).min(1),
  cities: z.array(CityStartSchema),
  officers: z.array(OfficerStartSchema),
  relations: z.array(RelationStartSchema).default([]),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
export type FactionStart = z.infer<typeof FactionStartSchema>;
