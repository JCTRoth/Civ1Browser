import { describe, it, expect, beforeEach } from 'vitest';
import GameEngine from '@/game/engine/GameEngine';

/**
 * Auto End Turn + city founding behavior.
 *
 * Requirements under test:
 * 1. After a settler founds a city, the settler is removed from the turn queue
 *    so the queue can empty (previously the ghost settler blocked auto-end).
 * 2. A newly founded city must NOT duplicate its current production in the
 *    build queue (Warrior was both currentProduction AND queue[0]).
 * 3. Auto End Turn triggers when no unit has moves left — including when the
 *    player has ZERO units (e.g. their only settler just founded a city).
 * 4. Auto End Turn does NOT trigger while any unit still has moves.
 * 5. Skipped / sleeping / fortified units do not block auto end turn.
 */
describe('Auto End Turn + city founding', () => {
  let engine: GameEngine;
  let emitted: string[];

  beforeEach(async () => {
    engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    emitted = [];
    engine.onStateChange = (type: string, _data?: any) => {
      emitted.push(type);
    };

    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'MANY_CITIES',
      devMode: false,
      startingGold: 100
    });
  });

  /** Find a non-ocean tile far enough from all cities for a valid settlement. */
  const findValidTile = (): { col: number; row: number } => {
    const width = (engine as any).map?.width ?? 80;
    const height = (engine as any).map?.height ?? 50;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const tile = (engine as any).getTileAt?.(col, row);
        if (!tile || tile.type === 'OCEAN' || tile.type === 'ocean') continue;
        const tooClose = engine.cities.some((c: any) => {
          const d = Math.abs(c.col - col) + Math.abs(c.row - row);
          return d < 3;
        });
        if (!tooClose) return { col, row };
      }
    }
    throw new Error('No valid tile found');
  };

  const addSettler = (civId = 0) => {
    const pos = findValidTile();
    const settler = {
      id: `settler_test_${civId}`,
      civilizationId: civId,
      type: 'settler',
      col: pos.col,
      row: pos.row,
      movesRemaining: 1,
      attack: 0,
      defense: 1,
      maxMoves: 1,
      isSleeping: false,
      isFortified: false,
      isSkipped: false,
      areTurnsDone: false
    };
    (engine as any).units.push(settler);
    return settler;
  };

  it('founding a city removes the settler from the turn queue', () => {
    const settler = addSettler(0);
    const queue = (engine as any).unitTurnQueue;
    if (!queue) throw new Error('unitTurnQueue missing');

    queue.initializeQueue(0);
    expect(queue.getQueue(0)).toContain(settler.id);

    engine.foundCityWithSettler(settler.id);

    expect(engine.units.find((u: any) => u.id === settler.id)).toBeUndefined();
    expect(queue.getQueue(0)).not.toContain(settler.id);
  });

  it('a newly founded city does not duplicate current production in the queue', () => {
    const settler = addSettler(0);
    const beforeCount = engine.cities.length;
    engine.foundCityWithSettler(settler.id);

    const city = engine.cities.find((c: any) => c.civilizationId === 0 && engine.cities.indexOf(c) >= beforeCount);
    expect(city).toBeTruthy();
    expect(city!.currentProduction).toBeTruthy();
    expect(Array.isArray(city!.buildQueue)).toBe(true);
    // The current production (Warrior) must NOT also sit at the front of the queue.
    expect(city!.buildQueue).toHaveLength(0);
  });

  it('auto-end turn fires when the player has no units left (founded last settler)', () => {
    // Clear all human units, leaving only the settler to found the city.
    (engine as any).units = (engine as any).units.filter((u: any) => u.civilizationId !== 0);
    const settler = addSettler(0);
    emitted = [];
    engine.foundCityWithSettler(settler.id);

    expect(emitted).toContain('CHECK_AUTO_END_TURN');
  });

  it('auto-end turn does NOT fire while any unit still has moves', () => {
    // Ensure the human player has a unit with moves left.
    const units = (engine as any).units.filter((u: any) => u.civilizationId === 0);
    for (const u of units) {
      u.movesRemaining = 1;
      u.isSleeping = false;
      u.isFortified = false;
      u.isSkipped = false;
      u.areTurnsDone = false;
    }
    expect(units.length).toBeGreaterThan(0);

    emitted = [];
    (engine as any).checkAndEndTurnIfNoMoves();

    expect(emitted).not.toContain('CHECK_AUTO_END_TURN');
  });

  it('skipped / sleeping / fortified units do not block auto end turn', () => {
    const units = (engine as any).units.filter((u: any) => u.civilizationId === 0);
    for (const u of units) {
      u.isSleeping = true;
      u.areTurnsDone = true;
      u.movesRemaining = 1; // sleeping keeps moves but is not actionable
    }
    expect(units.length).toBeGreaterThan(0);

    emitted = [];
    (engine as any).checkAndEndTurnIfNoMoves();

    expect(emitted).toContain('CHECK_AUTO_END_TURN');
  });
});
