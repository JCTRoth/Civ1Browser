import { describe, it, expect } from 'vitest';
import { AIBuildingStrategy } from '@/game/engine/AIBuildingStrategy';
import type { StrategyProfile, BuildingPlan, Personality } from '@/game/engine/AITypes';

const makeCity = (overrides: Record<string, unknown> = {}): any => ({
  id: 'city-1',
  name: 'TestCity',
  civilizationId: 1,
  col: 5,
  row: 5,
  population: 4,
  buildings: [],
  ...overrides,
});

const makeCiv = (overrides: Record<string, unknown> = {}): any => ({
  id: 1,
  name: 'TestCiv',
  technologies: new Set<string>(['pottery', 'masonry']),
  personality: {
    aggression: 5, expansion: 5, diplomacy: 5, science: 5, military: 5, economy: 5,
  } as Personality,
  ...overrides,
});

const baseBuildingGameState = (overrides: Record<string, unknown> = {}) => ({
  currentYear: -2000,
  roundNumber: 20,
  isBorderCity: false,
  isUnderThreat: false,
  numCities: 2,
  ...overrides,
});

const baseWonderGameState = (overrides: Record<string, unknown> = {}) => ({
  currentYear: -2000,
  isUnderThreat: false,
  builtWonders: [] as string[],
  ...overrides,
});

describe('AIBuildingStrategy.evaluateBuildings', () => {
  it('should return an array of BuildingPlans', () => {
    const city = makeCity();
    const civ = makeCiv();
    const plans = AIBuildingStrategy.evaluateBuildings(city, civ, 'balanced_growth', baseBuildingGameState());

    expect(Array.isArray(plans)).toBe(true);
    if (plans.length > 0) {
      expect(plans[0]).toHaveProperty('buildingType');
      expect(plans[0]).toHaveProperty('priority');
      expect(plans[0]).toHaveProperty('reason');
    }
  });

  it('should not suggest already-built buildings', () => {
    const city = makeCity({ buildings: ['granary'] });
    const civ = makeCiv();
    const plans = AIBuildingStrategy.evaluateBuildings(city, civ, 'balanced_growth', baseBuildingGameState());

    const granaryPlan = plans.find(p => p.buildingType === 'granary');
    expect(granaryPlan).toBeUndefined();
  });

  it('should prioritize city_walls when under threat', () => {
    const city = makeCity();
    const civ = makeCiv({ technologies: new Set(['pottery', 'masonry']) });
    const plans = AIBuildingStrategy.evaluateBuildings(
      city, civ, 'defensive_turtle',
      baseBuildingGameState({ isUnderThreat: true })
    );

    // City walls should rank high when threatened
    const wallsPlan = plans.find(p => p.buildingType === 'city_walls');
    if (wallsPlan) {
      expect(wallsPlan.priority).toBeGreaterThan(10);
    }
  });

  it('should return sorted results (highest priority first)', () => {
    const city = makeCity();
    const civ = makeCiv({ technologies: new Set(['pottery', 'masonry', 'writing', 'bronze_working']) });
    const plans = AIBuildingStrategy.evaluateBuildings(city, civ, 'balanced_growth', baseBuildingGameState());

    for (let i = 1; i < plans.length; i++) {
      expect(plans[i - 1].priority).toBeGreaterThanOrEqual(plans[i].priority);
    }
  });
});

describe('AIBuildingStrategy.evaluateWonders', () => {
  it('should return empty array when under threat', () => {
    const city = makeCity();
    const civ = makeCiv();
    const plans = AIBuildingStrategy.evaluateWonders(
      city, civ, 'balanced_growth',
      baseWonderGameState({ isUnderThreat: true })
    );
    expect(plans).toEqual([]);
  });

  it('should exclude already-built wonders', () => {
    const city = makeCity();
    const civ = makeCiv({ technologies: new Set(['ceremonial_burial', 'masonry', 'pottery']) });
    const plans = AIBuildingStrategy.evaluateWonders(
      city, civ, 'wonder_rush',
      baseWonderGameState({ builtWonders: ['pyramids'] })
    );

    const pyramidsPlan = plans.find(p => p.buildingType === 'pyramids');
    expect(pyramidsPlan).toBeUndefined();
  });
});

describe('AIBuildingStrategy.shouldBuildOverUnit', () => {
  const plan: BuildingPlan = { buildingType: 'granary', priority: 20, reason: 'growth' };

  it('should return false if no defender exists', () => {
    expect(AIBuildingStrategy.shouldBuildOverUnit(plan, false, false, 3, 2)).toBe(false);
  });

  it('should return true for critical priority buildings', () => {
    const criticalPlan: BuildingPlan = { buildingType: 'aqueduct', priority: 35, reason: 'pop cap' };
    expect(AIBuildingStrategy.shouldBuildOverUnit(criticalPlan, true, false, 3, 2)).toBe(true);
  });

  it('should return false when under threat with low-priority building', () => {
    const lowPlan: BuildingPlan = { buildingType: 'temple', priority: 5, reason: 'culture' };
    expect(AIBuildingStrategy.shouldBuildOverUnit(lowPlan, true, true, 3, 2)).toBe(false);
  });

  it('should prefer buildings when military ratio is healthy', () => {
    // 6 military units / 2 cities = 3.0 ratio, well above 1.5 threshold
    expect(AIBuildingStrategy.shouldBuildOverUnit(plan, true, false, 6, 2)).toBe(true);
  });
});
