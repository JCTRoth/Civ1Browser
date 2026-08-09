import { describe, expect, it, beforeEach } from 'vitest';
import { VictoryManager } from '@/game/engine/VictoryManager';
import type { Civilization, GameActions } from '@/../types/game';

/**
 * DOMINATION VICTORY TESTS
 *
 * Verifies that a civilization wins by "domination" when it owns every city
 * on the map (while at least two civilizations are still alive). This is what
 * lets AI-vs-AI games conclude instead of stalling forever because civs with
 * stray units but zero cities never get eliminated.
 */

interface MockEngine {
  civilizations: Civilization[];
  units: Array<{ civilizationId: number }>;
  cities: Array<{ civilizationId: number; id: string }>;
  isGameOver: boolean;
  currentTurn: number;
  currentYear: number | string;
  onStateChange: ((event: string, data: Record<string, unknown>) => void) | null;
  storeActions: GameActions | null;
}

function makeCiv(id: number, name: string, isHuman = false): Civilization {
  return {
    id,
    name,
    color: '#000',
    isAlive: true,
    isHuman,
    isAI: !isHuman,
    leader: name,
    leaderName: name,
    resources: { food: 0, production: 0, trade: 0, science: 0, gold: 0 },
  } as Civilization;
}

function makeManager(engine: MockEngine): VictoryManager {
  // VictoryManager expects the full GameEngine; the mock covers only the
  // surface it reads during evaluateEndOfTurn.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const victory = new VictoryManager(engine as any);
  victory.reset();
  return victory;
}

let engine: MockEngine;
let emitted: Array<{ event: string; data: Record<string, unknown> }> = [];

beforeEach(() => {
  emitted = [];
  engine = {
    civilizations: [makeCiv(0, 'Germans'), makeCiv(1, 'Americans')],
    units: [
      { civilizationId: 0 },
      { civilizationId: 1 },
    ],
    cities: [
      { civilizationId: 0, id: 'city_0_0' },
      { civilizationId: 0, id: 'city_0_1' },
    ],
    isGameOver: false,
    currentTurn: 10,
    currentYear: '3000 BC',
    onStateChange: (event: string, data: Record<string, unknown>) => emitted.push({ event, data }),
    storeActions: null,
  };
});

describe('VictoryManager — domination', () => {
  it('declares a domination victory when one civ owns ALL cities', () => {
    const victory = makeManager(engine);
    const ended = victory.evaluateEndOfTurn();

    expect(ended).toBe(true);
    expect(engine.isGameOver).toBe(true);
    expect(emitted.some((e) => e.event === 'GAME_WON')).toBe(true);
    const won = emitted.find((e) => e.event === 'GAME_WON');
    expect(won?.data.reason).toBe('domination');
    expect(won?.data.civName).toBe('Germans');
  });

  it('does NOT declare domination while cities are split between civs', () => {
    engine.cities = [
      { civilizationId: 0, id: 'city_0_0' },
      { civilizationId: 1, id: 'city_1_0' },
    ];
    const victory = makeManager(engine);
    const ended = victory.evaluateEndOfTurn();

    expect(ended).toBe(false);
    expect(engine.isGameOver).toBe(false);
    expect(emitted.some((e) => e.event === 'GAME_WON')).toBe(false);
  });

  it('prefers domination over elimination when both could apply', () => {
    // Civ 1 has units but no cities: alive by "operational" rules, but civ 0
    // owns all cities → domination (not elimination) should fire.
    engine.cities = [
      { civilizationId: 0, id: 'city_0_0' },
    ];
    engine.units = [
      { civilizationId: 0 },
      { civilizationId: 1 }, // stray unit, no city
    ];
    const victory = makeManager(engine);
    const ended = victory.evaluateEndOfTurn();

    expect(ended).toBe(true);
    const won = emitted.find((e) => e.event === 'GAME_WON');
    expect(won?.data.reason).toBe('domination');
    expect(won?.data.civName).toBe('Germans');
  });

  it('still triggers elimination when only one civ survives', () => {
    engine.civilizations = [makeCiv(0, 'Germans')];
    engine.units = [{ civilizationId: 0 }];
    engine.cities = [{ civilizationId: 0, id: 'city_0_0' }];
    const victory = makeManager(engine);
    const ended = victory.evaluateEndOfTurn();

    expect(ended).toBe(true);
    const won = emitted.find((e) => e.event === 'GAME_WON');
    expect(won?.data.reason).toBe('elimination');
  });

  it('does not fire when no cities exist yet', () => {
    engine.cities = [];
    const victory = makeManager(engine);
    const ended = victory.evaluateEndOfTurn();

    expect(ended).toBe(false);
    expect(emitted.some((e) => e.event === 'GAME_WON')).toBe(false);
  });

  it('is a one-shot: after the game ends, further evaluations are no-ops', () => {
    const victory = makeManager(engine);
    expect(victory.evaluateEndOfTurn()).toBe(true);
    // Second call must not re-emit or re-evaluate.
    emitted = [];
    expect(victory.evaluateEndOfTurn()).toBe(true);
    expect(emitted.length).toBe(0);
  });
});
