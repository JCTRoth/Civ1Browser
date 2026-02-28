/**
 * AITypes - Shared type definitions for the AI system
 * 
 * Provides typed interfaces to replace `any` across AI modules,
 * shared state types for cross-module communication, and
 * strategy/coordination types.
 */

import type { Unit, City, Civilization } from '../../../types/game';
import type { EnemyLocation } from './EnemySearcher';

// ---------------------------------------------------------------------------
// Strategy profiles
// ---------------------------------------------------------------------------

/** High-level strategy the AI is pursuing this evaluation period */
export type StrategyProfile =
  | 'military_expansion'
  | 'science_focus'
  | 'balanced_growth'
  | 'defensive_turtle'
  | 'wonder_rush'
  | 'early_expansion';

// ---------------------------------------------------------------------------
// Personality (mirrors Civilization.ts but typed for AI consumption)
// ---------------------------------------------------------------------------

export interface Personality {
  aggression: number;   // 1-10
  expansion: number;    // 1-10
  diplomacy: number;    // 1-10
  science: number;      // 1-10
  military: number;     // 1-10
  economy: number;      // 1-10
}

// ---------------------------------------------------------------------------
// AI State — stored in PlayerTurnStorage.turnData (replacing Record<string,any>)
// ---------------------------------------------------------------------------

export interface OffensivePlan {
  target: { col: number; row: number };
  targetType: 'city' | 'unit';
  score: number;
  requiredUnits: number;
  assignedUnitIds: string[];
  roundPrepared: number;
}

export interface ArmyGroup {
  id: string;
  unitIds: string[];
  targetLocation: { col: number; row: number };
  rallyPoint: { col: number; row: number };
  status: 'forming' | 'marching' | 'attacking';
  requiredStrength: number;
  currentStrength: number;
}

export interface BuildingPlan {
  buildingType: string;
  priority: number;
  reason: string;
}

export interface ResearchPriority {
  techId: string;
  score: number;
  reason: string;
}

export interface AIState {
  /** Current overall strategy profile */
  strategyProfile: StrategyProfile;
  /** Round when strategy was last evaluated */
  lastStrategyEvaluation: number;
  /** Offensive plans (up to 2 concurrent fronts) */
  offensivePlans: OffensivePlan[];
  /** Legacy single plan compat — points to offensivePlans[0] or null */
  offensivePlan: OffensivePlan | null;
  /** Army groups for coordinated movement */
  armyGroups: ArmyGroup[];
  /** Per-city building priorities (cityId -> plans) */
  buildingPriorities: Record<string, BuildingPlan[]>;
  /** Current tech research rationale */
  researchPriority: ResearchPriority | null;
}

/** Create a fresh default AIState */
export function createDefaultAIState(): AIState {
  return {
    strategyProfile: 'balanced_growth',
    lastStrategyEvaluation: 0,
    offensivePlans: [],
    offensivePlan: null,
    armyGroups: [],
    buildingPriorities: {},
    researchPriority: null,
  };
}

// ---------------------------------------------------------------------------
// Technology category mapping for AI research scoring
// ---------------------------------------------------------------------------

export type TechCategory = 'military' | 'economy' | 'science' | 'culture' | 'expansion' | 'infrastructure' | 'government';

/** Maps technology IDs to categories for AI scoring */
export const TECH_CATEGORIES: Record<string, TechCategory> = {
  // Military
  bronze_working: 'military',
  iron_working: 'military',
  horseback_riding: 'military',
  the_wheel: 'military',
  mathematics: 'military',
  metallurgy: 'military',
  gunpowder: 'military',
  steel: 'military',
  combustion: 'military',
  flight: 'military',

  // Economy
  currency: 'economy',
  trade: 'economy',
  banking: 'economy',
  industrialization: 'economy',
  railroad: 'economy',
  mass_production: 'economy',

  // Science
  alphabet: 'science',
  writing: 'science',
  literacy: 'science',
  philosophy: 'science',
  university: 'science',
  science_theory: 'science',
  electricity: 'science',
  electronics: 'science',
  computers: 'science',

  // Culture / Happiness
  ceremonial_burial: 'culture',
  polytheism: 'culture',
  monotheism: 'culture',
  theology: 'culture',

  // Expansion / Infrastructure
  pottery: 'expansion',
  masonry: 'infrastructure',
  construction: 'infrastructure',
  engineering: 'infrastructure',
  sailing: 'expansion',
  map_making: 'expansion',
  navigation: 'expansion',
  astronomy: 'science',

  // Government
  code_of_laws: 'government',
  monarchy: 'government',
  republic: 'government',
  democracy: 'government',

  // Late game
  nuclear_power: 'science',
  space_flight: 'science',
  moonshot: 'science',
};

// ---------------------------------------------------------------------------
// Unit technology requirements
// ---------------------------------------------------------------------------

/** Maps unit types to the technology required to build them */
export const UNIT_TECH_REQUIREMENTS: Record<string, string | null> = {
  warrior: null,
  scout: null,
  archer: null,
  phalanx: 'bronze_working',
  chariot: 'the_wheel',
  knights: 'horseback_riding',
  legion: 'iron_working',
  catapult: 'mathematics',
  musketeer: 'gunpowder',
  riflemen: 'gunpowder',
  cavalry: 'horseback_riding',
  mech_inf: 'combustion',
  cannon: 'metallurgy',
  artillery: 'steel',
  tank: 'combustion',
  settler: null,
  diplomat: 'writing',
  caravan: 'trade',
  ferry: 'sailing',
  sail: 'sailing',
  trireme: 'map_making',
  caravel: 'navigation',
  frigate: 'navigation',
  ironclad: 'steel',
  destroyer: 'combustion',
  cruiser: 'combustion',
  battleship: 'steel',
  submarine: 'combustion',
  carrier: 'flight',
  fighter: 'flight',
  bomber: 'flight',
  nuclear: 'nuclear_power',
};

// ---------------------------------------------------------------------------
// Helper - check if a civ has a technology
// ---------------------------------------------------------------------------

/** 
 * Check if a civilization has researched a specific technology.
 * Handles both Set<string> and string[] formats.
 */
export function civHasTech(civ: any, techId: string): boolean {
  if (!civ || !techId) return false;
  if (civ.technologies instanceof Set) {
    return civ.technologies.has(techId);
  }
  if (Array.isArray(civ.technologies)) {
    return civ.technologies.includes(techId);
  }
  return false;
}

/**
 * Check if a civ can build a specific unit type given its technologies.
 */
export function canBuildUnit(civ: any, unitType: string): boolean {
  const requiredTech = UNIT_TECH_REQUIREMENTS[unitType];
  if (!requiredTech) return true; // No tech required
  return civHasTech(civ, requiredTech);
}

/**
 * Check if a civ can build a specific building given its technologies and prerequisites.
 * @param civ - Civilization object
 * @param buildingType - Building type key
 * @param buildingProps - BUILDING_PROPERTIES entry
 * @param cityBuildings - Current buildings in the city (array or Set)
 * @param buildingPrereqs - BUILDING_PREREQUISITES map
 */
export function canBuildBuilding(
  civ: any,
  buildingType: string,
  buildingProps: { requiredTechnology?: string } | undefined,
  cityBuildings: string[] | Set<string>,
  buildingPrereqs: Record<string, readonly string[]>
): boolean {
  // Check tech requirement
  if (buildingProps?.requiredTechnology && !civHasTech(civ, buildingProps.requiredTechnology)) {
    return false;
  }
  // Check building prerequisites
  const prereqs = buildingPrereqs[buildingType];
  if (prereqs) {
    for (const prereq of prereqs) {
      const has = cityBuildings instanceof Set
        ? cityBuildings.has(prereq)
        : Array.isArray(cityBuildings) && cityBuildings.includes(prereq);
      if (!has) return false;
    }
  }
  return true;
}
