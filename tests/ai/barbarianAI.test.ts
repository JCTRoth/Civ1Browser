import { describe, expect, it } from 'vitest';
import { BarbarianManager } from '@/game/engine/BarbarianManager';

/**
 * Barbarian AI regression tests. Barbarians are the phantom civ (−1): they
 * raid cities, and captured cities become troop pumps (scout first, then
 * raiders). No GameEngine is needed — the manager only talks to the public
 * engine surface (units/cities, squareGrid, moveUnit, combatUnit,
 * spawnBarbarianUnit).
 */
const createMockEngine = () => {
  const units: any[] = [];
  const cities: any[] = [];
  const moveCalls: Array<{ id: string; col: number; row: number }> = [];
  const combatCalls: Array<{ a: any; d: any }> = [];
  const spawned: string[] = [];

  const engine: any = {
    units,
    cities,
    squareGrid: {
      squareDistance: (c1: number, r1: number, c2: number, r2: number) =>
        Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2)),
      getNeighbors: (c: number, r: number) => [
        { col: c + 1, row: r }, { col: c - 1, row: r },
        { col: c, row: r + 1 }, { col: c, row: r - 1 },
      ],
      // path[1] == target, so a unit "steps" straight onto its target.
      findPath: (_c: number, _r: number, tc: number, tr: number) => [
        { col: tc, row: tr }, { col: tc, row: tr },
      ],
    },
    getTileAt: () => ({ type: 'grassland', movement: 1, passable: true }),
    getUnitAt: (c: number, r: number) =>
      units.find((u) => u.col === c && u.row === r && u.civilizationId !== -1) ?? null,
    getCityAt: (c: number, r: number) => cities.find((ci) => ci.col === c && ci.row === r) ?? null,
    getPassabilityFilter: () => () => true,
    moveUnit: (id: string, col: number, row: number) => {
      moveCalls.push({ id, col, row });
      const u = units.find((x) => x.id === id);
      if (u) { u.col = col; u.row = row; u.movesRemaining = 0; }
      return { success: true };
    },
    combatUnit: (a: any, d: any) => { combatCalls.push({ a, d }); a.movesRemaining = 0; },
    spawnBarbarianUnit: (type: string, col: number, row: number) => {
      spawned.push(`${type}@${col},${row}`);
    },
  };

  return { engine, units, cities, moveCalls, combatCalls, spawned };
};

const barb = (id: string, col: number, row: number, type = 'legion') => ({
  id, type, civilizationId: -1, col, row, movesRemaining: 1, maxMoves: 1, health: 100,
  attack: 3, defense: 1,
});

describe('Barbarian AI — aggression', () => {
  it('with more than 3 units and a weaker target, ALL troops converge on the weakest city', () => {
    const { engine, units, cities, moveCalls } = createMockEngine();
    units.push(barb('b1', 10, 10), barb('b2', 10, 11), barb('b3', 11, 10), barb('b4', 11, 11));
    // A strong city (pop 8 + walls) and a weak city (pop 2, no walls).
    cities.push({ id: 'cA', civilizationId: 0, col: 30, row: 30, population: 8, buildings: ['city_walls'], name: 'A' });
    cities.push({ id: 'cB', civilizationId: 1, col: 2, row: 2, population: 2, buildings: [], name: 'B' });

    new BarbarianManager(engine).processBarbarians();

    expect(moveCalls.length).toBeGreaterThan(0);
    for (const call of moveCalls) {
      // Much aggression → every unit marches at the WEAKEST city (B), not A.
      expect(call).toMatchObject({ col: 2, row: 2 });
    }
  });

  it('with a small horde each unit raids its NEAREST city instead of the weakest', () => {
    const { engine, units, cities, moveCalls } = createMockEngine();
    units.push(barb('b1', 10, 10));
    cities.push({ id: 'cA', civilizationId: 0, col: 12, row: 10, population: 8, buildings: [], name: 'A' }); // nearest
    cities.push({ id: 'cB', civilizationId: 1, col: 2, row: 2, population: 2, buildings: [], name: 'B' }); // weakest but far

    new BarbarianManager(engine).processBarbarians();

    expect(moveCalls.length).toBe(1);
    expect(moveCalls[0]).toMatchObject({ col: 12, row: 10 });
  });

  it('attacks an adjacent enemy unit before moving', () => {
    const { engine, units, combatCalls } = createMockEngine();
    units.push(barb('b1', 5, 5));
    units.push({ id: 'e1', type: 'warrior', civilizationId: 0, col: 6, row: 5, movesRemaining: 1, health: 100, attack: 1, defense: 1 });

    new BarbarianManager(engine).processBarbarians();

    expect(combatCalls.length).toBe(1);
    expect(combatCalls[0].d.id).toBe('e1');
  });
});

describe('Barbarian AI — captured cities', () => {
  it('captured cities sell everything, produce a SCOUT first, then raiders', () => {
    const { engine, cities, spawned } = createMockEngine();
    cities.push({
      id: 'cap', civilizationId: -1, col: 5, row: 5, population: 4, name: 'Captured',
      buildings: ['granary', 'marketplace'], yields: { production: 40 },
      currentProduction: null, productionStored: 0,
    });

    const manager = new BarbarianManager(engine);

    // Round 1: buildings sold, scout (cost 15) completed at 40 shields/turn.
    manager.processBarbarians();
    expect(cities[0].buildings).toEqual([]);
    expect(spawned[0]).toBe('scout@5,5');
    expect(cities[0].barbarianScoutBuilt).toBe(true);

    // Round 2: now it pumps out a raider (chariot).
    manager.processBarbarians();
    expect(spawned[1]).toBe('chariot@5,5');
  });

  it('a slow captured city keeps a scout queued until it is produced', () => {
    const { engine, cities, spawned } = createMockEngine();
    cities.push({
      id: 'cap', civilizationId: -1, col: 5, row: 5, population: 4, name: 'Captured',
      buildings: [], yields: { production: 5 },
      currentProduction: null, productionStored: 0,
    });

    const manager = new BarbarianManager(engine);

    manager.processBarbarians(); // starts scout, 5/15 shields
    expect(spawned).toEqual([]);
    expect(cities[0].currentProduction.itemType).toBe('scout');
    expect(cities[0].productionStored).toBe(5);

    manager.processBarbarians(); // 10/15
    manager.processBarbarians(); // 15/15 → scout produced
    expect(spawned).toEqual(['scout@5,5']);
    expect(cities[0].barbarianScoutBuilt).toBe(true);
  });
});
