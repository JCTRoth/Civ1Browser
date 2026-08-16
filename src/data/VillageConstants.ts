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

/** Gold granted by a Valuable Metals village. */
export const VILLAGE_GOLD_AMOUNT = 50;

/** Barbarian unit types spawned by a Barbarians village (equal chance each). */
export const VILLAGE_BARBARIAN_TYPES: string[] = ['legion', 'cavalry'];

/** Barbarian horde size range (inclusive). */
export const VILLAGE_BARBARIAN_MIN = 2;
export const VILLAGE_BARBARIAN_MAX = 4;
