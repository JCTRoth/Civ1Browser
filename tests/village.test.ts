/**
 * Civ1 villages (goody huts) — placement constraints, trigger rules, and the
 * five equal-weight outcomes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import GameEngine from '@/game/engine/GameEngine';
import { BARBARIAN_CIV_ID } from '@/data/VillageConstants';
import { TERRAIN_TYPES } from '@/data/TerrainConstants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTile = any;

describe('Civ1 village placement', () => {
  let engine: GameEngine | null = null;

  afterEach(() => {
    if (engine) {
      (engine as unknown as { units: unknown[] }).units = [];
      (engine as unknown as { cities: unknown[] }).cities = [];
      (engine as unknown as { civilizations: unknown[] }).civilizations = [];
      engine = null;
    }
  });

  async function setup(): Promise<GameEngine> {
    const e = new GameEngine(null);
    (e as unknown as { sleep: () => Promise<void> }).sleep = () => Promise.resolve();
    (e as unknown as { isPaused: boolean }).isPaused = true;
    await e.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 100,
    });
    engine = e;
    return e;
  }

  it('places villages on land (not water/mountains) away from starting settlers', async () => {
    const e = await setup();
    const tiles = (e as unknown as { map: { tiles: AnyTile[] } }).map.tiles;
    const villages = tiles.filter((t) => t && t.village);

    expect(villages.length).toBeGreaterThan(0);

    const settlers = (e as unknown as { units: Array<{ type: string; col: number; row: number }> }).units
      .filter((u) => u.type === 'settler');

    for (const tile of villages) {
      const type = String(tile.type ?? tile.terrain);
      expect([TERRAIN_TYPES.OCEAN, TERRAIN_TYPES.MOUNTAINS]).not.toContain(type);
      for (const s of settlers) {
        const dist = Math.max(Math.abs(tile.col - s.col), Math.abs(tile.row - s.row));
        expect(dist).toBeGreaterThan(2);
      }
    }
  });
});

describe('Civ1 village trigger & outcomes', () => {
  let engine: GameEngine | null = null;
  let unitCounter = 0;

  afterEach(() => {
    vi.restoreAllMocks();
    if (engine) {
      (engine as unknown as { units: unknown[] }).units = [];
      (engine as unknown as { cities: unknown[] }).cities = [];
      (engine as unknown as { civilizations: unknown[] }).civilizations = [];
      engine = null;
    }
  });

  async function setup(): Promise<GameEngine> {
    const e = new GameEngine(null);
    (e as unknown as { sleep: () => Promise<void> }).sleep = () => Promise.resolve();
    (e as unknown as { isPaused: boolean }).isPaused = true;
    await e.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 100,
    });
    engine = e;
    return e;
  }

  /** A plains/grassland tile, re-typed to `type`, with an empty adjacent tile. */
  function villageSpot(e: GameEngine, type = TERRAIN_TYPES.PLAINS): { col: number; row: number; adj: { col: number; row: number } } {
    const tiles = (e as unknown as { map: { tiles: AnyTile[] } }).map.tiles;
    for (const tile of tiles) {
      if (!tile) continue;
      const t = String(tile.type ?? tile.terrain);
      if (t !== type) continue;
      if ((e as unknown as { cities: Array<{ col: number; row: number }> }).cities.some(
        (c) => Math.abs(c.col - tile.col) + Math.abs(c.row - tile.row) < 3,
      )) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ac = tile.col + dc;
        const ar = tile.row + dr;
        const at = e.getTileAt(ac, ar);
        if (!at) continue;
        const atype = String(at.type ?? at.terrain);
        if (atype === TERRAIN_TYPES.OCEAN) continue;
        if ((e as unknown as { units: Array<{ col: number; row: number }> }).units.some((u) => u.col === ac && u.row === ar)) continue;
        if ((e as unknown as { cities: Array<{ col: number; row: number }> }).cities.some((c) => c.col === ac && c.row === ar)) continue;
        return { col: tile.col, row: tile.row, adj: { col: ac, row: ar } };
      }
    }
    throw new Error('No suitable village spot found');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function spawnUnit(e: GameEngine, type: string, col: number, row: number, civId = 0, attack = 1, defense = 1): any {
    unitCounter += 1;
    const unit = {
      id: `v_${type}_${unitCounter}`,
      civilizationId: civId,
      type,
      col,
      row,
      movesRemaining: 2,
      maxMoves: 2,
      health: 100,
      attack,
      defense,
      isFortified: false,
    };
    (e as unknown as { units: unknown[] }).units.push(unit);
    return unit;
  }

  function goldOf(e: GameEngine): number {
    return (e as unknown as { civilizations: Array<{ resources: { gold: number } }> }).civilizations[0].resources.gold;
  }

  it('a military unit claims a village and gets the Valuable Metals outcome (50 gold)', async () => {
    const e = await setup();
    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const warrior = spawnUnit(e, 'warrior', spot.adj.col, spot.adj.row);

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.49); // → valuable_metals
    const before = goldOf(e);
    const res = e.moveUnit(warrior.id, spot.col, spot.row);
    spy.mockRestore();

    expect(res.success).toBe(true);
    expect(tile.village).toBe(false);
    expect(goldOf(e)).toBe(before + 50);
  });

  it('a civilian unit does not trigger a village', async () => {
    const e = await setup();
    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const settler = spawnUnit(e, 'settler', spot.adj.col, spot.adj.row, 0, 0, 0);

    e.moveUnit(settler.id, spot.col, spot.row);

    expect(tile.village).toBe(true); // untouched
  });

  it('an air unit destroys a village with no effect', async () => {
    const e = await setup();
    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const bomber = spawnUnit(e, 'bomber', spot.adj.col, spot.adj.row, 0, 12, 1);

    const before = goldOf(e);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const res = e.moveUnit(bomber.id, spot.col, spot.row);
    spy.mockRestore();

    expect(res.success).toBe(true);
    expect(tile.village).toBe(false);
    expect(goldOf(e)).toBe(before); // no outcome
  });

  it('a barbarian unit destroys a village with no effect', async () => {
    const e = await setup();
    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const barb = spawnUnit(e, 'legion', spot.adj.col, spot.adj.row, BARBARIAN_CIV_ID, 3, 1);

    const before = goldOf(e);
    const res = e.moveUnit(barb.id, spot.col, spot.row);

    expect(res.success).toBe(true);
    expect(tile.village).toBe(false);
    expect(goldOf(e)).toBe(before);
  });

  it('Advanced Tribe founds a size-1 city with a random free building', async () => {
    const e = await setup();
    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const warrior = spawnUnit(e, 'warrior', spot.adj.col, spot.adj.row);

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.05); // advanced_tribe, building idx 0 (barracks)
    e.moveUnit(warrior.id, spot.col, spot.row);
    spy.mockRestore();

    expect(tile.village).toBe(false);
    const city = (e as unknown as { cities: Array<{ col: number; row: number; population: number; buildings: string[] }> }).cities
      .find((c) => c.col === spot.col && c.row === spot.row);
    expect(city).toBeDefined();
    expect(city?.population).toBe(1);
    expect(['barracks', 'granary', 'temple']).toContain(city?.buildings[0]);
  });

  it('Scroll of Ancient Wisdom grants a free researchable tech', async () => {
    const e = await setup();
    const civ = (e as unknown as { civilizations: Array<{ technologies: string[] }> }).civilizations[0];
    const techsBefore = [...civ.technologies];

    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const warrior = spawnUnit(e, 'warrior', spot.adj.col, spot.adj.row);

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.25); // → scroll
    e.moveUnit(warrior.id, spot.col, spot.row);
    spy.mockRestore();

    expect(tile.village).toBe(false);
    expect(civ.technologies.length).toBe(techsBefore.length + 1);
    const granted = civ.technologies.find((t) => !techsBefore.includes(t));
    expect(granted).toBeDefined();
  });

  it('Friendly Mercenaries spawn the strongest currently-buildable unit with full moves', async () => {
    const e = await setup();
    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const warrior = spawnUnit(e, 'warrior', spot.adj.col, spot.adj.row);

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.65); // → friendly_mercenaries
    e.moveUnit(warrior.id, spot.col, spot.row);
    spy.mockRestore();

    expect(tile.village).toBe(false);
    const units = (e as unknown as { units: Array<{ id: string; type: string; col: number; row: number; civilizationId: number; movesRemaining: number; maxMoves: number }> }).units;
    const merc = units.find((u) => u.id !== warrior.id && u.col === spot.col && u.row === spot.row && u.civilizationId === 0);
    expect(merc).toBeDefined();
    // Civ 0 starts with irrigation/mining/roads → the strongest buildable
    // military unit is the Archer (attack 3, no tech requirement).
    expect(merc?.type).toBe('archer');
    expect(merc?.movesRemaining).toBeGreaterThan(0);
  });

  it('Horde of Barbarians spawns 2–4 hostile legion/cavalry that act immediately', async () => {
    const e = await setup();
    const spot = villageSpot(e);
    const tile = e.getTileAt(spot.col, spot.row) as unknown as { village?: boolean };
    tile.village = true;
    const warrior = spawnUnit(e, 'warrior', spot.adj.col, spot.adj.row, 0, 2, 2);

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.9); // → barbarians
    const res = e.moveUnit(warrior.id, spot.col, spot.row);
    spy.mockRestore();

    expect(res.success).toBe(true);
    expect(tile.village).toBe(false);
    const barbarians = (e as unknown as { units: Array<{ civilizationId: number; type: string }> }).units
      .filter((u) => u.civilizationId === BARBARIAN_CIV_ID);
    expect(barbarians.length).toBeGreaterThanOrEqual(2);
    expect(barbarians.length).toBeLessThanOrEqual(4);
    for (const b of barbarians) {
      expect(['legion', 'cavalry']).toContain(b.type);
    }
  });
});
