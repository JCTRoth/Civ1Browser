// Civilization I villages (goody huts) — implementation constants.

/** Phantom civ id used for barbarian units (never present in civilizations[]). */
export const BARBARIAN_CIV_ID = -1;

export const VILLAGE_OUTCOME = {
  ADVANCED_TRIBE: 'advanced_tribe',
  SCROLL_OF_ANCIENT_WISDOM: 'scroll_of_ancient_wisdom',
  VALUABLE_METALS: 'valuable_metals',
  FRIENDLY_MERCENARIES: 'friendly_mercenaries',
  BARBARIANS: 'barbarians',
} as const;

/** All outcomes in equal weight (20 each → 20% chance each). */
export const VILLAGE_OUTCOMES: string[] = [
  VILLAGE_OUTCOME.ADVANCED_TRIBE,
  VILLAGE_OUTCOME.SCROLL_OF_ANCIENT_WISDOM,
  VILLAGE_OUTCOME.VALUABLE_METALS,
  VILLAGE_OUTCOME.FRIENDLY_MERCENARIES,
  VILLAGE_OUTCOME.BARBARIANS,
];

/** Free building granted by an Advanced Tribe village (equal chance each). */
export const VILLAGE_FREE_BUILDINGS: string[] = ['barracks', 'granary', 'temple'];

/**
 * Possible gold amounts granted by a Valuable Metals village (Civ1: a lump
 * sum of 25, 50, or 100 gold, drawn randomly).
 */
export const VILLAGE_GOLD_AMOUNTS: number[] = [25, 50, 100];

/**
 * Barbarian unit types spawned by a Barbarian Ambush village (equal chance
 * each) — Civ1 basic land military (Warriors or Legions).
 */
export const VILLAGE_BARBARIAN_TYPES: string[] = ['warrior', 'legion'];

/** Barbarian ambush horde size range (inclusive) — Civ1 spawns 1–3. */
export const VILLAGE_BARBARIAN_MIN = 1;
export const VILLAGE_BARBARIAN_MAX = 3;
