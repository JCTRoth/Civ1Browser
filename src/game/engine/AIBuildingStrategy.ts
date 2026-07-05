/**
 * AIBuildingStrategy - Building selection AI for city production
 * 
 * Evaluates all available buildings for a city and returns scored/prioritized
 * building plans. Handles tech gating, prerequisite chains, wonder evaluation,
 * and building-vs-unit priority decisions.
 */

import { BUILDING_PROPERTIES, BUILDING_PREREQUISITES, WONDER_PROPERTIES } from '@/data/BuildingConstants';
import {
  type StrategyProfile,
  type Personality,
  type BuildingPlan,
  canBuildBuilding,
} from './AITypes';

// ---------------------------------------------------------------------------
// Building priority weights per strategy
// ---------------------------------------------------------------------------

const STRATEGY_BUILDING_BIAS: Record<StrategyProfile, Partial<Record<string, number>>> = {
  military_expansion: {
    barracks: 2.0, city_walls: 1.5, forge: 1.5,
    library: 0.5, temple: 0.6, marketplace: 0.8,
  },
  science_focus: {
    library: 2.5, university: 2.5, courthouse: 1.2,
    barracks: 0.3, city_walls: 0.5, temple: 1.0, marketplace: 1.5,
  },
  balanced_growth: {
    granary: 1.5, library: 1.3, marketplace: 1.3,
    barracks: 1.0, temple: 1.2, courthouse: 1.0, city_walls: 1.0,
  },
  defensive_turtle: {
    city_walls: 2.5, barracks: 1.5, temple: 1.5,
    library: 0.8, marketplace: 0.8, courthouse: 1.2,
  },
  wonder_rush: {
    library: 1.8, forge: 1.5, marketplace: 1.2,
    barracks: 0.4, city_walls: 0.6,
  },
  early_expansion: {
    granary: 2.0, marketplace: 1.5, temple: 1.0,
    barracks: 0.8, library: 1.0, city_walls: 0.5,
  },
};

// ---------------------------------------------------------------------------
// AIBuildingStrategy class
// ---------------------------------------------------------------------------

export class AIBuildingStrategy {
  /**
   * Evaluate all available buildings for a city and return prioritized plans.
   * 
   * @param city - The city object
   * @param civ - The civilization object
   * @param strategy - Current AI strategy profile
   * @param gameState - Game state snapshot
   * @returns Sorted array of building plans (highest priority first)
   */
  static evaluateBuildings(
    city: any,
    civ: any,
    strategy: StrategyProfile,
    gameState: { currentYear: number; roundNumber: number; isBorderCity: boolean; isUnderThreat: boolean; numCities: number }
  ): BuildingPlan[] {
    const plans: BuildingPlan[] = [];
    const cityBuildings: string[] = city.buildings || [];
    const personality: Personality = civ.personality || {
      aggression: 5, expansion: 5, diplomacy: 5, science: 5, military: 5, economy: 5
    };

    for (const [buildingType, props] of Object.entries(BUILDING_PROPERTIES)) {
      // Skip if already built
      if (cityBuildings.includes(buildingType)) continue;

      // Check tech + building prerequisites
      if (!canBuildBuilding(civ, buildingType, props, cityBuildings, BUILDING_PREREQUISITES as Record<string, readonly string[]>)) {
        continue;
      }

      const plan = AIBuildingStrategy.scoreBuilding(
        buildingType, props, city, personality, strategy, gameState
      );

      if (plan.priority > 0) {
        plans.push(plan);
      }
    }

    // Sort by priority descending
    plans.sort((a, b) => b.priority - a.priority);
    return plans;
  }

  /**
   * Score a single building for a specific city.
   */
  private static scoreBuilding(
    buildingType: string,
    props: any,
    city: any,
    personality: Personality,
    strategy: StrategyProfile,
    gameState: { currentYear: number; isBorderCity: boolean; isUnderThreat: boolean; numCities: number }
  ): BuildingPlan {
    let priority = 5; // Base priority
    const reasons: string[] = [];

    // Strategy bias
    const bias = STRATEGY_BUILDING_BIAS[strategy]?.[buildingType] ?? 1.0;
    priority *= bias;

    // Building-specific scoring
    switch (buildingType) {
      case 'granary':
        priority += 15;
        if (city.population <= 3) { priority += 10; reasons.push('early-growth'); }
        priority += personality.expansion * 0.5;
        reasons.push('food-storage');
        break;

      case 'barracks':
        priority += 8;
        if (gameState.isUnderThreat) { priority += 12; reasons.push('threat'); }
        priority += personality.military * 0.8;
        reasons.push('veteran-units');
        break;

      case 'temple':
        priority += 10;
        if (city.population >= 4) { priority += 5; reasons.push('happiness-need'); }
        priority += personality.diplomacy * 0.3;
        reasons.push('happiness');
        break;

      case 'marketplace':
        priority += 10;
        if (city.population >= 3) { priority += 3; }
        priority += personality.economy * 0.6;
        reasons.push('economy');
        break;

      case 'library':
        priority += 12;
        if (city.population >= 3) { priority += 5; }
        priority += personality.science * 0.8;
        reasons.push('science');
        break;

      case 'courthouse':
        priority += 6;
        // More valuable in distant cities
        priority += Math.min(8, gameState.numCities * 1.5);
        reasons.push('corruption');
        break;

      case 'city_walls':
        priority += 8;
        if (gameState.isBorderCity) { priority += 10; reasons.push('border-defense'); }
        if (gameState.isUnderThreat) { priority += 15; reasons.push('threat-defense'); }
        priority += personality.military * 0.4;
        reasons.push('defense');
        break;

      case 'aqueduct':
        // Critical when pop is approaching 10
        if (city.population >= 8) {
          priority += 30;
          reasons.push('growth-cap');
        } else if (city.population >= 5) {
          priority += 15;
          reasons.push('future-growth');
        } else {
          priority += 4;
        }
        break;

      case 'bank':
        priority += 8;
        priority += personality.economy * 0.5;
        reasons.push('economy-boost');
        break;

      case 'university':
        priority += 10;
        priority += personality.science * 0.7;
        reasons.push('science-boost');
        break;

      case 'cathedral':
        priority += 8;
        if (city.population >= 8) { priority += 8; reasons.push('large-city-happiness'); }
        reasons.push('happiness');
        break;

      case 'colosseum':
        priority += 6;
        if (city.population >= 6) { priority += 5; reasons.push('happiness'); }
        break;

      case 'forge':
        priority += 8;
        priority += personality.military * 0.3;
        reasons.push('production');
        break;

      case 'factory':
        priority += 12;
        if (gameState.currentYear >= 1500) { priority += 5; }
        reasons.push('late-production');
        break;

      case 'hospital':
        priority += 6;
        if (city.population >= 6) { priority += 4; }
        reasons.push('health');
        break;

      default:
        // Moderate base for unhandled buildings
        priority += 3;
        reasons.push('general');
        break;
    }

    // Cost penalty — prefer cheaper buildings when production is low
    const cityProduction = city.yields?.production || city.production || 2;
    const turnsToComplete = (props.cost || 80) / Math.max(1, cityProduction);
    if (turnsToComplete > 30) {
      priority -= 5;
      reasons.push('expensive');
    }

    return {
      buildingType,
      priority: Math.max(0, priority),
      reason: reasons.join(', '),
    };
  }

  /**
   * Evaluate available wonders for a city.
   * Only the top production city should consider wonders.
   */
  static evaluateWonders(
    city: any,
    _civ: any,
    strategy: StrategyProfile,
    gameState: { currentYear: number; isUnderThreat: boolean; builtWonders: string[] }
  ): BuildingPlan[] {
    const plans: BuildingPlan[] = [];

    // Don't build wonders when under threat
    if (gameState.isUnderThreat) return plans;

    for (const [wonderType, props] of Object.entries(WONDER_PROPERTIES)) {
      // Skip already built (globally or in this city)
      if (gameState.builtWonders.includes(wonderType)) continue;
      const cityBuildings: string[] = city.buildings || [];
      if (cityBuildings.includes(wonderType)) continue;

      let priority = 5;
      const reasons: string[] = [];

      // Wonder-specific scoring
      switch (wonderType) {
        case 'pyramids':
          priority += 15;
          if (strategy === 'early_expansion' || strategy === 'balanced_growth') priority += 10;
          reasons.push('granary-everywhere');
          break;

        case 'hanging_gardens':
          priority += 12;
          reasons.push('global-happiness');
          break;

        case 'oracle':
          priority += 10;
          if (strategy === 'science_focus') priority += 8;
          reasons.push('science+culture');
          break;

        case 'great_wall':
          priority += 8;
          if (strategy === 'defensive_turtle') priority += 10;
          reasons.push('global-defense');
          break;

        case 'lighthouse':
          priority += 6;
          reasons.push('naval');
          break;

        case 'newton':
          priority += 14;
          if (strategy === 'science_focus') priority += 10;
          reasons.push('science-boost');
          break;

        default:
          priority += 5;
          reasons.push('wonder');
          break;
      }

      // Wonder rush strategy gets blanket bonus
      if (strategy === 'wonder_rush') {
        priority += 8;
      }

      // Cost penalty for wonders (they're expensive)
      const cityProduction = city.yields?.production || city.production || 2;
      const turnsToComplete = (props.cost || 300) / Math.max(1, cityProduction);
      if (turnsToComplete > 50) {
        priority -= 10;
        reasons.push('too-expensive');
      }

      if (priority > 0) {
        plans.push({
          buildingType: wonderType,
          priority,
          reason: reasons.join(', '),
        });
      }
    }

    plans.sort((a, b) => b.priority - a.priority);
    return plans;
  }

  /**
   * Decide if a building should be built over a military unit.
   * Returns true if the building is more valuable than producing a unit right now.
   */
  static shouldBuildOverUnit(
    buildingPlan: BuildingPlan,
    hasDefender: boolean,
    isUnderThreat: boolean,
    numMilitaryUnits: number,
    numCities: number
  ): boolean {
    // Always build a defender first if none exists
    if (!hasDefender) return false;

    // Don't build if under active threat and building priority isn't critical
    if (isUnderThreat && buildingPlan.priority < 25) return false;

    // Critical buildings (aqueduct at pop cap, city walls under threat) always build
    if (buildingPlan.priority >= 30) return true;

    // If we have a healthy military (at least 1.5 units per city), prefer buildings
    const militaryRatio = numMilitaryUnits / Math.max(1, numCities);
    if (militaryRatio >= 1.5 && buildingPlan.priority >= 10) return true;

    // Moderate military + moderate building value: flip based on priority
    if (militaryRatio >= 1.0 && buildingPlan.priority >= 15) return true;

    return false;
  }
}
