import { describe, it, expect, vi } from 'vitest';
import { AutoProduction } from '@/game/engine/AutoProduction';

const createMockEngine = () => {
  const city = {
    id: 'city-1',
    name: 'Testopolis',
    civilizationId: 1,
    col: 0,
    row: 0,
    population: 3,
    buildings: [],
    currentProduction: null,
    autoProduction: true
  };

  const units = [
    { id: 'def', type: 'warrior', civilizationId: 1, col: 0, row: 0, attack: 1, defense: 1 }
  ];

  const productionManager = {
    setCityProduction: vi.fn().mockReturnValue({ success: true })
  };

  const storage = {
    turnData: {
      offensivePlan: {
        requiredUnits: 4
      }
    }
  };

  const engine: any = {
    cities: [city],
    units,
    civilizations: [
      null,
      {
        id: 1,
        name: 'TestCiv',
        technologies: new Set(['warrior_code']),
        personality: { aggression: 5, expansion: 5, diplomacy: 5, science: 5, military: 5, economy: 5 },
        warWith: new Set(),
      }
    ],
    productionManager,
    getPlayerStorage: () => storage,
    squareGrid: {
      squareDistance: () => 1
    },
    roundManager: {
      getRoundNumber: () => 0
    },
    currentYear: -500,
    gameSettings: { difficulty: 'PRINCE' },
    getCityAt: () => null,
    getUnitAt: () => null,
    map: { width: 20, height: 20 }
  };

  return { engine, productionManager };
};

describe('AutoProduction offensive support', () => {
  it('builds offensive units when a campaign requires reinforcements', () => {
    const { engine, productionManager } = createMockEngine();
    const autoProduction = new AutoProduction(engine);

    autoProduction.setAutoProduction('city-1');

    expect(productionManager.setCityProduction).toHaveBeenCalled();
    const item = productionManager.setCityProduction.mock.calls[0][1];
    expect(item.type).toBe('unit');
    expect(item.itemType).toBe('archer');
  });
});

/**
 * Scout corps maintenance: the AI builds 1–3 scouts depending on total troop
 * count (<6 → 1, 6–11 → 2, >=12 → 3), always ranking below city defense.
 */
describe('AutoProduction scout corps', () => {
  const createScoutMockEngine = (totalTroops: number, scoutCount: number) => {
    const city = {
      id: 'city-1',
      name: 'Testopolis',
      civilizationId: 1,
      col: 0,
      row: 0,
      population: 3,
      buildings: [],
      currentProduction: null,
      autoProduction: true
    };

    const units: any[] = [];
    // One defender in the city so the "needs defender" step is satisfied.
    units.push({ id: 'def', type: 'warrior', civilizationId: 1, col: 0, row: 0, attack: 1, defense: 1 });
    // Fill the remaining troop budget with warriors (military type).
    const extraTroops = Math.max(0, totalTroops - 1 - scoutCount);
    for (let i = 0; i < extraTroops; i++) {
      units.push({ id: `troop${i}`, type: 'warrior', civilizationId: 1, col: 10, row: 10, attack: 1, defense: 1 });
    }
    for (let i = 0; i < scoutCount; i++) {
      units.push({ id: `scout${i}`, type: 'scout', civilizationId: 1, col: 12, row: 12, attack: 0.5, defense: 1 });
    }

    const productionManager = { setCityProduction: vi.fn().mockReturnValue({ success: true }) };
    // No offensive plan → the scout step is reachable (step 4 skipped).
    const storage = { turnData: {} };

    const engine: any = {
      cities: [city],
      units,
      civilizations: [
        null,
        {
          id: 1,
          name: 'TestCiv',
          technologies: new Set(['warrior_code']),
          personality: { aggression: 5, expansion: 5, diplomacy: 5, science: 5, military: 5, economy: 5 },
          warWith: new Set(),
        }
      ],
      productionManager,
      getPlayerStorage: () => storage,
      squareGrid: { squareDistance: () => 1 },
      roundManager: { getRoundNumber: () => 0 },
      currentYear: -500,
      gameSettings: { difficulty: 'PRINCE' },
      getCityAt: () => null,
      getUnitAt: () => null,
      map: { width: 20, height: 20 }
    };

    return { engine, productionManager };
  };

  const producedItem = (pm: any) => pm.setCityProduction.mock.calls[0][1];

  it('builds a scout for a small army (< 6 troops) with no scouts yet', () => {
    const { engine, productionManager } = createScoutMockEngine(2, 0);
    new AutoProduction(engine).setAutoProduction('city-1');

    expect(productionManager.setCityProduction).toHaveBeenCalled();
    expect(producedItem(productionManager).itemType).toBe('scout');
  });

  it('builds a scout when 6+ troops want a second scout', () => {
    const { engine, productionManager } = createScoutMockEngine(6, 0);
    new AutoProduction(engine).setAutoProduction('city-1');

    expect(producedItem(productionManager).itemType).toBe('scout');
  });

  it('builds a scout when 12+ troops want a third scout', () => {
    const { engine, productionManager } = createScoutMockEngine(12, 0);
    new AutoProduction(engine).setAutoProduction('city-1');

    expect(producedItem(productionManager).itemType).toBe('scout');
  });

  it('does not build more scouts when already at the target count', () => {
    // 2 troops → wants 1 scout; already has 1 → falls through to settlers.
    const { engine, productionManager } = createScoutMockEngine(2, 1);
    new AutoProduction(engine).setAutoProduction('city-1');

    expect(producedItem(productionManager).itemType).not.toBe('scout');
    expect(producedItem(productionManager).itemType).toBe('settler');
  });

  it('defender need outranks scout production', () => {
    const { engine, productionManager } = createScoutMockEngine(6, 0);
    // Remove the defender from the city tile → city needs a defender first.
    engine.units = engine.units.filter((u: any) => u.id !== 'def');
    new AutoProduction(engine).setAutoProduction('city-1');

    const item = producedItem(productionManager);
    expect(item.type).toBe('unit');
    expect(item.itemType).not.toBe('scout');
  });
});
