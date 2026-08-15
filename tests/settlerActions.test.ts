/**
 * Verifies the engine availability checks used to gate the settler context
 * menu, so only options that can actually succeed are shown:
 *  - canBuildImprovement: terrain restrictions + upgrade prerequisite +
 *    existing-improvement checks (mirrors buildImprovement).
 *  - hasMovesForImprovement: movement cost / fortified gating.
 *  - canFoundCity: land tile + minimum spacing from other cities.
 */
import { describe, it, expect, afterEach } from 'vitest';
import GameEngine from '@/game/engine/GameEngine';
import { TERRAIN_TYPES } from '@/data/TerrainConstants';

describe('settler action availability (context menu gating)', () => {
  let engine: GameEngine | null = null;

  afterEach(() => {
    if (engine) {
      (engine as unknown as { units: unknown[] }).units = [];
      (engine as unknown as { cities: unknown[] }).cities = [];
      (engine as unknown as { civilizations: unknown[] }).civilizations = [];
      engine = null;
    }
  });

  async function setupEngine(): Promise<GameEngine> {
    const e = new GameEngine(null);
    (e as unknown as { sleep: () => Promise<void> }).sleep = () => Promise.resolve();
    (e as unknown as { isPaused: boolean }).isPaused = true;
    await e.initialize({
      numberOfCivilizations: 2,
      mapType: 'AI_VS_AI',
      devMode: false,
      startingGold: 100,
    });
    engine = e;
    return e;
  }

  /** Find a valid (col,row) on the map and re-type it. */
  function prepareTile(e: GameEngine, type: string, improvement: string | null = null) {
    const width = (e as unknown as { map: { width: number } }).map.width;
    const tiles = (e as unknown as { map: { tiles: Array<{ type?: string }> } }).map.tiles;
    const index = tiles.findIndex((t) => t && t.type && t.type !== TERRAIN_TYPES.OCEAN);
    if (index < 0) throw new Error('no land tile found');
    const col = index % width;
    const row = Math.floor(index / width);
    const tile = e.getTileAt(col, row) as unknown as { type: string; improvement: string | null };
    tile.type = type;
    tile.improvement = improvement;
    return { col, row, tile };
  }

  let settlerCounter = 0;

  function spawnSettler(e: GameEngine, col: number, row: number, moves = 2, fortified = false) {
    settlerCounter += 1;
    const id = `test_settler_${settlerCounter}`;
    const settler = {
      id,
      type: 'settler',
      civilizationId: 0,
      col,
      row,
      movesRemaining: moves,
      isFortified: fortified,
    };
    (e as unknown as { units: unknown[] }).units.push(settler);
    return settler;
  }

  describe('canBuildImprovement', () => {
    it('respects terrain restrictions (irrigation on grassland, mine only on hills/mountains)', async () => {
      const e = await setupEngine();

      const grassland = prepareTile(e, TERRAIN_TYPES.GRASSLAND);
      const onGrass = spawnSettler(e, grassland.col, grassland.row);
      expect(e.canBuildImprovement(onGrass.id, 'irrigation')).toBe(true);
      expect(e.canBuildImprovement(onGrass.id, 'mine')).toBe(false);

      const mountains = prepareTile(e, TERRAIN_TYPES.MOUNTAINS);
      const onMountains = spawnSettler(e, mountains.col, mountains.row);
      expect(e.canBuildImprovement(onMountains.id, 'mine')).toBe(true);
      expect(e.canBuildImprovement(onMountains.id, 'irrigation')).toBe(false);
    });

    it('road is possible on any land tile that has no improvement yet', async () => {
      const e = await setupEngine();
      const tile = prepareTile(e, TERRAIN_TYPES.GRASSLAND);
      const s = spawnSettler(e, tile.col, tile.row);
      expect(e.canBuildImprovement(s.id, 'road')).toBe(true);
    });

    it('is blocked by an existing improvement unless there is an upgrade path', async () => {
      const e = await setupEngine();

      // Road already built → road not possible again; railroad upgrade is.
      const withRoad = prepareTile(e, TERRAIN_TYPES.GRASSLAND, 'road');
      const onRoad = spawnSettler(e, withRoad.col, withRoad.row);
      expect(e.canBuildImprovement(onRoad.id, 'road')).toBe(false);
      expect(e.canBuildImprovement(onRoad.id, 'railroad')).toBe(true);

      // No road yet → railroad is not possible.
      const bare = prepareTile(e, TERRAIN_TYPES.GRASSLAND);
      const onBare = spawnSettler(e, bare.col, bare.row);
      expect(e.canBuildImprovement(onBare.id, 'railroad')).toBe(false);

      // Non-upgradeable improvement blocks irrigation on valid terrain.
      const withMine = prepareTile(e, TERRAIN_TYPES.MOUNTAINS, 'mines');
      const onMine = spawnSettler(e, withMine.col, withMine.row);
      expect(e.canBuildImprovement(onMine.id, 'irrigation')).toBe(false);
      expect(e.canBuildImprovement(onMine.id, 'mine')).toBe(false);
    });

    it('is false when the unit does not exist or the tile is missing', async () => {
      const e = await setupEngine();
      expect(e.canBuildImprovement('missing_unit', 'road')).toBe(false);
    });
  });

  describe('hasMovesForImprovement', () => {
    it('requires enough moves for the build cost (road=1, irrigation=2)', async () => {
      const e = await setupEngine();
      const tile = prepareTile(e, TERRAIN_TYPES.GRASSLAND);

      const oneMove = spawnSettler(e, tile.col, tile.row, 1);
      expect(e.hasMovesForImprovement(oneMove.id, 'road')).toBe(true);
      expect(e.hasMovesForImprovement(oneMove.id, 'irrigation')).toBe(false);

      const twoMoves = spawnSettler(e, tile.col, tile.row, 2);
      expect(e.hasMovesForImprovement(twoMoves.id, 'irrigation')).toBe(true);
    });

    it('is false for a fortified unit', async () => {
      const e = await setupEngine();
      const tile = prepareTile(e, TERRAIN_TYPES.GRASSLAND);
      const fortified = spawnSettler(e, tile.col, tile.row, 2, true);
      expect(e.hasMovesForImprovement(fortified.id, 'road')).toBe(false);
    });
  });

  describe('canFoundCity', () => {
    it('is true on land away from other cities', async () => {
      const e = await setupEngine();
      const tile = prepareTile(e, TERRAIN_TYPES.GRASSLAND);
      const s = spawnSettler(e, tile.col, tile.row);
      expect(e.canFoundCity(s.id)).toBe(true);
    });

    it('is false on ocean', async () => {
      const e = await setupEngine();
      const tile = prepareTile(e, TERRAIN_TYPES.OCEAN);
      const s = spawnSettler(e, tile.col, tile.row);
      expect(e.canFoundCity(s.id)).toBe(false);
    });

    it('is false within 3 tiles of an existing city', async () => {
      const e = await setupEngine();
      const tile = prepareTile(e, TERRAIN_TYPES.GRASSLAND);
      (e as unknown as { cities: Array<{ id: string; col: number; row: number }> }).cities.push({
        id: 'city_near',
        col: tile.col,
        row: tile.row,
      });
      const near = spawnSettler(e, tile.col + 1, tile.row);
      expect(e.canFoundCity(near.id)).toBe(false);

      const far = spawnSettler(e, tile.col + 10, tile.row);
      expect(e.canFoundCity(far.id)).toBe(true);
    });

    it('is false for a non-settler unit', async () => {
      const e = await setupEngine();
      const tile = prepareTile(e, TERRAIN_TYPES.GRASSLAND);
      const warrior = {
        id: 'test_warrior',
        type: 'warriors',
        civilizationId: 0,
        col: tile.col,
        row: tile.row,
        movesRemaining: 2,
      };
      (e as unknown as { units: unknown[] }).units.push(warrior);
      expect(e.canFoundCity('test_warrior')).toBe(false);
    });
  });
});
