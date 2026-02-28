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
