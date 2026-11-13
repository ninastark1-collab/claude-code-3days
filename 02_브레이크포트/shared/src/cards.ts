import data from "../data/cards.json";
import type { CardDef } from "./types";

export const CARDS: CardDef[] = data.cards as CardDef[];
export const TOWER_STATS = data.towers;
export const DECK_SIZE = 8;
const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}

export const DEFAULT_DECK: string[] = [...data.defaultDeck];

/** A deck is 8 distinct, existing cards. */
export function isValidDeck(deck: unknown): deck is string[] {
  return Array.isArray(deck) && deck.length === DECK_SIZE && new Set(deck).size === DECK_SIZE
    && deck.every((id) => typeof id === "string" && byId.has(id));
}

export const averageCost = (deck: string[]) => deck.reduce((s, id) => s + getCard(id).cost, 0) / deck.length;

/** Random 8-card deck that always contains something able to hit air units (used by the AI). */
export function randomDeck(): string[] {
  for (;;) {
    const ids = CARDS.map((c) => c.id).sort(() => Math.random() - 0.5).slice(0, DECK_SIZE);
    if (ids.some((id) => getCard(id).targetsAir)) return ids;
  }
}
