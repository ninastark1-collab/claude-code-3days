import { getCard } from "@bf/shared";

const TYPE_NAME = { unit: "유닛", spell: "주문", building: "건물" } as const;

/** Human-readable stat lines for a card (deck editor and in-battle long-press). */
export function cardInfo(id: string): { title: string; lines: string[] } {
  const c = getCard(id);
  const lines: string[] = [c.desc ?? ""];
  if (c.type === "spell") {
    lines.push(`피해 ${c.damage} · 범위 ${c.spellRadius} · 타워 피해 ${Math.round((c.towerDamagePct ?? 1) * 100)}%`);
  } else {
    const count = c.count && c.count > 1 ? ` ×${c.count}` : "";
    const dps = Math.round(c.damage / (c.hitSpeed ?? 1));
    const target = c.buildingsOnly ? "건물만" : c.targetsAir ? "지상+공중" : "지상만";
    lines.push(`체력 ${c.hp}${count} · 공격 ${c.damage} (초당 ${dps})${c.splash ? " · 범위공격" : ""}`);
    lines.push(`사거리 ${(c.range ?? 0) <= 1.5 ? "근접" : c.range} · 공격 대상 ${target}${c.air ? " · 비행" : ""}${c.lifetime ? ` · ${c.lifetime}초 유지` : ""}`);
  }
  return { title: `${c.name}  ·  ${TYPE_NAME[c.type]}  ·  잉크 ${c.cost}`, lines };
}
