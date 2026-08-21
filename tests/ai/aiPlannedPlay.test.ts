import { describe, expect, it } from 'vitest';
import { AIManager } from '@/game/engine/AIManager';
import { AutoProduction } from '@/game/engine/AutoProduction';

/**
 * Regression tests for the "no planned play" blockers found in the 160-round
 * AI-vs-AI log:
 *  1. Combat units never recorded what they saw → no global intelligence →
 *     no war plan ever formed.
 *  2. Idle military units sat in their capital → the two civs never contacted.
 *  3. Scouts re-targeted the same unreachable tile forever (10+ move_failed
 *     rounds), starving exploration.
 *  4. Produced settlers merged back into the capital → civs never expanded.
 *  5. Aggressive civs never built an army (only buildings/wonders).
 */

const createMockEngine = () => {
  const storage = {
    enemyLocations: new Map<number, any[]>(),
    visibility: [],
    explored: [],
    turnData: {},
    scoutZones: [] as Array<{ minCol: number; maxCol: number; minRow: number; maxRow: number }>,
  } as any;

  const squareGrid = {
    squareDistance: (c1: number, r1: number, c2: number, r2: number) =>
      Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2)),
    getNeighbors: () => [],
    isValidSquare: () => true,
    findPath: () => [] as { col: number; row: number }[],
  };

  const engine: any = {
    civilizations: [undefined, { id: 1, productionProfile: 'military_expansion', personality: { aggression: 8 } }],
    cities: [],
    units: [],
    map: { width: 20, height: 20 },
    squareGrid,
    gameSettings: { difficulty: 'PRINCE' },
    currentYear: -4000,
    diplomacyManager: { isAtWar: () => false },
    getTileAt: () => ({ type: 'grassland', movement: 1, passable: true }),
    getUnitAt: () => null,
    getCityAt: () => null,
    getPlayerStorage: () => storage,
    isVisibleToPlayer: () => true,
    isExploredByPlayer: () => true,
    isTilePassable: () => true,
    isInScoutZone: () => true,
    assignScoutZones: () => {},
    recordEnemyLocation: (civId: number, enemy: any) => {
      const owner = engine.units.find((u: any) => u.id === enemy.targetId)?.civilizationId
        ?? engine.cities.find((c: any) => c.id === enemy.targetId)?.civilizationId;
      if (owner === undefined) return;
      const list = storage.enemyLocations.get(owner) ?? [];
      const existing = list.find((e: any) => e.id === enemy.targetId);
      if (existing) {
        existing.lastSeenRound = 10;
      } else {
        list.push({
          col: enemy.col, row: enemy.row, type: enemy.targetType, id: enemy.targetId,
          discoveredRound: 10, lastSeenRound: 10,
        });
        storage.enemyLocations.set(owner, list);
      }
    },
    autoProduction: { processAutoProductionForCivilization: () => {} },
    sleep: () => Promise.resolve(),
    onStateChange: () => {},
    log: () => {},
    measurePerformance: (_: string, fn: () => any) => fn(),
    roundManager: {
      getRoundNumber: () => 10,
      setUnitPath: () => {},
    },
  };

  return { engine, storage };
};

const combatUnit = (id: string, civId: number, col: number, row: number, type = 'archer') => ({
  id, type, civilizationId: civId, col, row, attack: 3, defense: 2, movesRemaining: 1,
});

describe('AI planned play — intelligence', () => {
  it('combat units record enemies they see into global intelligence, even at peace', () => {
    const { engine, storage } = createMockEngine();
    engine.cities = [{ id: 'friendly', civilizationId: 1, col: 0, row: 0 }];
    engine.units = [
      combatUnit('u1', 1, 0, 0),
      { id: 'enemy', type: 'warrior', civilizationId: 2, col: 3, row: 0, attack: 1, defense: 1 },
    ];

    const aiManager = new AIManager(engine);
    (aiManager as any).chooseAITarget(engine.units[0]);

    // The planner now knows about the enemy city/unit even though the civ is
    // still at peace — this is what lets the offensive plan (and war) form.
    const list = storage.enemyLocations.get(2) ?? [];
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({ col: 3, row: 0, type: 'unit', id: 'enemy' });
  });
});

describe('AI planned play — probing', () => {
  it('idle combat units probe unexplored tiles instead of idling at the capital', () => {
    const { engine } = createMockEngine();
    engine.cities = [{ id: 'friendly', civilizationId: 1, col: 0, row: 0 }];
    engine.units = [
      combatUnit('u1', 1, 0, 0),
      combatUnit('u2', 1, 5, 5),
    ];
    // Everything except the unit's own tile is unexplored → a probe target exists.
    engine.isExploredByPlayer = (_civ: number, col: number, row: number) => col === 5 && row === 5;

    const aiManager = new AIManager(engine);
    const target = (aiManager as any).chooseAITarget(engine.units[1]);

    expect(target).not.toBeNull();
    // Probe target must be a passable tile within the bounded search radius.
    const dist = Math.max(Math.abs(target.col - 5), Math.abs(target.row - 5));
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThanOrEqual(12);
  });
});

describe('AI planned play — scouts', () => {
  it('scouts skip blacklisted (previously unreachable) exploration tiles', () => {
    const { engine, storage } = createMockEngine();
    engine.cities = [{ id: 'friendly', civilizationId: 1, col: 0, row: 0 }];
    storage.scoutZones = [{ minCol: 0, maxCol: 10, minRow: 0, maxRow: 10 }];
    const scout = {
      id: 'scout1', type: 'scout', civilizationId: 1, col: 2, row: 2, attack: 0.5, defense: 1,
      _blockedScoutTargets: new Set(['3,2']),
    };
    engine.units = [scout];
    // Only the scout's own tile is explored; (3,2) is blacklisted.
    engine.isExploredByPlayer = (_civ: number, col: number, row: number) => col === 2 && row === 2;

    const aiManager = new AIManager(engine);
    const target = (aiManager as any).findScoutExplorationTarget(scout);

    expect(target).not.toBeNull();
    expect(`${target.col},${target.row}`).not.toBe('3,2');
    expect(`${target.col},${target.row}`).not.toBe('2,2');
  });

  it('blacklisting a failed move target prevents repeating it', () => {
    const { engine } = createMockEngine();
    const scout = { id: 'scout2', type: 'scout', civilizationId: 1, col: 2, row: 2, attack: 0.5, defense: 1 };
    engine.units = [scout];

    const aiManager = new AIManager(engine);
    (aiManager as any).blacklistScoutTarget(scout, 3, 2);
    (aiManager as any).blacklistScoutTarget(scout, 3, 2);

    const blocked = (scout as any)._blockedScoutTargets as Set<string>;
    expect(blocked.has('3,2')).toBe(true);
    expect(blocked.size).toBe(1);
  });
});

describe('AI planned play — army buildup', () => {
  it('aggressive civs build attackers to a standing army before buildings', () => {
    const { engine } = createMockEngine();
    engine.cities = [{ id: 'capital', civilizationId: 1, col: 0, row: 0, population: 2 }];
    // One defender on the city + one settler + one scout (satisfies the scout
    // corps so the standing-army branch runs), but only 1 offensive unit →
    // the aggressive civ must build an attacker.
    engine.units = [
      { id: 'guard', type: 'warrior', civilizationId: 1, col: 0, row: 0, attack: 1, defense: 1 },
      { id: 'set', type: 'settler', civilizationId: 1, col: 1, row: 0, attack: 0, defense: 1 },
      { id: 'scout1', type: 'scout', civilizationId: 1, col: 2, row: 0, attack: 0.5, defense: 1 },
    ];

    const auto = new AutoProduction(engine);
    const item = (auto as any).determineProductionItem(engine.cities[0], undefined, []);

    expect(item).toBeTruthy();
    expect(item.type).toBe('unit');
    expect((auto as any).isOffensiveUnitType(item.itemType)).toBe(true);
  });
});
