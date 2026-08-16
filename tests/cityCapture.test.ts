import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import GameEngine from '@/game/engine/GameEngine';

/**
 * City capture & destruction mechanics (Civ I–style).
 *
 * When a military unit moves onto an enemy city tile (`moveUnit`), the engine
 * resolves city combat:
 *  - win vs pop>1  → city changes hands (captured), attacker consumed
 *  - win vs pop==1 → city is destroyed, attacker consumed
 *  - loss          → attacker takes damage / is defeated
 * City walls double the city's defense.
 * Civilian units (settler/worker/caravan/diplomat/scout) cannot attack cities.
 */
describe('City capture & destruction', () => {
  let engine: GameEngine;
  let emitted: string[];
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    emitted = [];
    engine.onStateChange = (type: string, _data?: any) => { emitted.push(type); };
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'MANY_CITIES',
      devMode: false,
      startingGold: 100,
    });
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
    (engine as any).units = [];
    (engine as any).cities = [];
    (engine as any).civilizations = [];
  });

  let cityCounter = 0;

  const isLand = (col: number, row: number): boolean => {
    const tile = (engine as any).getTileAt?.(col, row);
    if (!tile) return false;
    const type = String(tile.type ?? '').toLowerCase();
    return type !== 'ocean' && type !== 'water';
  };

  /** Find a land tile adjacent to the given city (no unit on it). */
  const adjacentLand = (city: any): { col: number; row: number } => {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const col = city.col + dc;
      const row = city.row + dr;
      if (isLand(col, row) && !(engine as any).getUnitAt(col, row)) {
        return { col, row };
      }
    }
    throw new Error('No adjacent land tile for city');
  };

  const addUnit = (id: string, civId: number, pos: { col: number; row: number }, type = 'warrior', attack = 2) => {
    const unit: any = {
      id,
      civilizationId: civId,
      type,
      col: pos.col,
      row: pos.row,
      movesRemaining: 1,
      maxMoves: 1,
      health: 100,
      attack,
      defense: 1,
      icon: type,
      orders: 'none',
      areTurnsDone: false,
      isSkipped: false,
    };
    (engine as any).units.push(unit);
    return unit;
  };

  /** Make an enemy city of civ 1 (returns the created city). */
  const makeEnemyCity = (population: number, opts: { walls?: boolean; isCapital?: boolean } = {}): any => {
    const civ1 = engine.civilizations[1];
    // Reuse a tile far from all existing cities.
    const width = (engine as any).map?.width ?? 80;
    const height = (engine as any).map?.height ?? 50;
    let spot: { col: number; row: number } | null = null;
    for (let row = 2; row < height - 2 && !spot; row++) {
      for (let col = 2; col < width - 2; col++) {
        if (!isLand(col, row)) continue;
        if (engine.cities.some((c: any) => Math.abs(c.col - col) + Math.abs(c.row - row) < 4)) continue;
        spot = { col, row };
        break;
      }
    }
    if (!spot) throw new Error('No free spot for enemy city');
    const city: any = {
      id: `enemy_city_${Date.now()}_${cityCounter++}`,
      name: 'Enemy City',
      civilizationId: civ1.id,
      col: spot.col,
      row: spot.row,
      population,
      foodStored: 0,
      foodNeeded: population * 20,
      yields: { food: 0, production: 0, trade: 0, gold: 0, science: 0 },
      buildings: opts.walls ? ['city_walls'] : [],
      isCapital: opts.isCapital === true,
      buildQueue: [],
    };
    (engine as any).cities.push(city);
    return city;
  };

  it('captures a size-2 enemy city and consumes the attacker', () => {
    const city = makeEnemyCity(2);
    const pos = adjacentLand(city);
    addUnit('atk1', 0, pos);

    randomSpy.mockReturnValue(0.05); // attacker wins

    const result = (engine as any).moveUnit('atk1', city.col, city.row);

    expect(result.success).toBe(true);
    expect(result.reason).toBe('city_captured');
    // City changed hands.
    expect(engine.cities.find((c: any) => c.id === city.id)?.civilizationId).toBe(0);
    // Population dropped by one.
    expect(engine.cities.find((c: any) => c.id === city.id)?.population).toBe(1);
    // Attacker consumed.
    expect(engine.units.some((u: any) => u.id === 'atk1')).toBe(false);
    expect(emitted).toContain('CITY_CAPTURED');
  });

  it('destroys a size-1 enemy city', () => {
    const city = makeEnemyCity(1);
    const pos = adjacentLand(city);
    addUnit('atk2', 0, pos);

    randomSpy.mockReturnValue(0.05); // attacker wins

    const result = (engine as any).moveUnit('atk2', city.col, city.row);

    expect(result.success).toBe(true);
    expect(engine.cities.some((c: any) => c.id === city.id)).toBe(false);
    expect(emitted).toContain('CITY_DESTROYED');
  });

  it('destroys a size-1 capital and re-establishes government', () => {
    const city = makeEnemyCity(1, { isCapital: true });
    const pos = adjacentLand(city);
    addUnit('atk3', 0, pos);

    randomSpy.mockReturnValue(0.05);

    (engine as any).moveUnit('atk3', city.col, city.row);

    expect(engine.cities.some((c: any) => c.id === city.id)).toBe(false);
    // GovernmentManager should have ensured a replacement capital for civ 1.
    const civ1 = engine.civilizations[1];
    expect(civ1.capital || (civ1 as any).hasCapital).toBeDefined();
  });

  it('civilian units cannot attack or capture a city', () => {
    const city = makeEnemyCity(2);
    const pos = adjacentLand(city);
    addUnit('stl1', 0, pos, 'settler', 0);

    randomSpy.mockReturnValue(0.05);

    const result = (engine as any).moveUnit('stl1', city.col, city.row);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('civilian_cannot_attack_city');
    expect(engine.cities.find((c: any) => c.id === city.id)?.civilizationId).toBe(1);
  });

  it('a weak attacker loses and the city keeps its owner', () => {
    const city = makeEnemyCity(3);
    const pos = adjacentLand(city);
    addUnit('weak1', 0, pos, 'warrior', 1);

    randomSpy.mockReturnValue(0.99); // attacker loses

    const result = (engine as any).moveUnit('weak1', city.col, city.row);

    expect(result.success).toBe(false);
    expect(engine.cities.find((c: any) => c.id === city.id)?.civilizationId).toBe(1);
    // Attacker took damage.
    const attacker = engine.units.find((u: any) => u.id === 'weak1');
    expect(attacker).toBeDefined();
    expect(attacker.health).toBeLessThan(100);
  });

  it('city walls make capture harder (defense doubled)', () => {
    const walled = makeEnemyCity(2, { walls: true });
    const open = makeEnemyCity(2);
    const walledPos = adjacentLand(walled);
    const openPos = adjacentLand(open);

    // Same attacker vs open city: wins at 0.5 threshold region.
    // Walled: defense 4 vs attack 2 → attacker wins only if random < 2/6 ≈ 0.333.
    // Open:   defense 2 vs attack 2 → attacker wins only if random < 2/4 = 0.5.
    // At random = 0.4 the open city is captured, the walled one is not.
    addUnit('wA', 0, walledPos);
    addUnit('oA', 0, openPos);

    randomSpy.mockReturnValue(0.4);

    const rw = (engine as any).moveUnit('wA', walled.col, walled.row);
    const ro = (engine as any).moveUnit('oA', open.col, open.row);
    void rw; void ro;

    expect(engine.cities.find((c: any) => c.id === open.id)?.civilizationId).toBe(0);
    expect(engine.cities.find((c: any) => c.id === walled.id)?.civilizationId).toBe(1);
  });
});

/**
 * The AI should actively assault and capture enemy cities: when an AI combat
 * unit is at war and adjacent to an enemy city, its target scan returns the
 * city and stepping onto the tile triggers the same city combat that the
 * human uses (capture on win, destruction at size 1).
 */
describe('AI captures cities', () => {
  let engine: GameEngine;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'MANY_CITIES',
      devMode: false,
      startingGold: 100,
    });
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
    (engine as any).units = [];
    (engine as any).cities = [];
    (engine as any).civilizations = [];
  });

  it('an AI warrior captures an undefended enemy city', async () => {
    const civ0 = engine.civilizations[0];
    const civ1 = engine.civilizations[1];
    civ0.isHuman = true;
    civ0.isAI = false;
    civ1.isHuman = false;
    civ1.isAI = true;

    // Pick an undefended civ-0 city (no unit standing on it) and make it
    // size 2 so the outcome is a capture (not destruction).
    const targetCity = engine.cities.find(
      (c: any) => c.civilizationId === 0 && !(engine as any).getUnitAt(c.col, c.row)
    );
    expect(targetCity).toBeDefined();
    targetCity.population = 2;

    // Strip all units so the only actors are the AI's own warriors.
    (engine as any).units = [];

    const isLand = (col: number, row: number): boolean => {
      const tile = (engine as any).getTileAt?.(col, row);
      if (!tile) return false;
      const type = String(tile.type ?? '').toLowerCase();
      return type !== 'ocean' && type !== 'water';
    };
    let spot: { col: number; row: number } | null = null;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const col = targetCity.col + dc;
      const row = targetCity.row + dr;
      if (isLand(col, row)) { spot = { col, row }; break; }
    }
    expect(spot).toBeTruthy();

    // A small AI army. Civ 1 is `military_expansion` (aggression 8 via its
    // profile personality) and the human has no units, so the AI's own
    // diplomacy declares war this turn — no manual declareWar needed.
    (engine as any).units.push(
      { id: 'ai_attacker', civilizationId: 1, type: 'warrior', col: spot!.col, row: spot!.row, movesRemaining: 2, maxMoves: 2, health: 100, attack: 2, defense: 1, icon: 'warrior', orders: 'none', areTurnsDone: false, isSkipped: false },
      { id: 'ai_2', civilizationId: 1, type: 'warrior', col: Math.max(0, spot!.col + 3), row: spot!.row, movesRemaining: 2, maxMoves: 2, health: 100, attack: 2, defense: 1, icon: 'warrior', orders: 'none', areTurnsDone: false, isSkipped: false },
      { id: 'ai_3', civilizationId: 1, type: 'warrior', col: spot!.col, row: Math.max(0, spot!.row + 3), movesRemaining: 2, maxMoves: 2, health: 100, attack: 2, defense: 1, icon: 'warrior', orders: 'none', areTurnsDone: false, isSkipped: false },
    );

    randomSpy.mockReturnValue(0.05); // attacker always wins city combat

    // Run the AI turn (Phase 2c of the turn runs AI diplomacy → declares war,
    // then the unit phase marches the adjacent warrior onto the city).
    (engine as any).activePlayer = 1;
    await engine.processAITurn(1);

    // The AI declared war on its own and captured the city.
    expect(engine.diplomacyManager.isAtWar(1, 0)).toBe(true);
    const cityAfter = engine.cities.find((c: any) => c.id === targetCity.id);
    expect(cityAfter).toBeDefined();
    expect(cityAfter!.civilizationId).toBe(1);
    // Attacker consumed on capture.
    expect(engine.units.some((u: any) => u.id === 'ai_attacker')).toBe(false);
  });
});
