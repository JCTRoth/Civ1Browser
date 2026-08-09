import { describe, it, expect, beforeEach } from 'vitest';
import GameEngine from '@/game/engine/GameEngine';
import { EngineEventRouter } from '@/utils/EngineEventHandlers';
import { useGameStore } from '@/stores/GameStore';

/**
 * Auto End Turn must NOT fire while a screen is open (combat animation or a
 * city management / production dialog). It is deferred until that screen
 * closes, then re-checked.
 *
 * The guard lives in EngineEventHandlers.onCheckAutoEndTurn, which consults
 * the store's `uiState.activeDialog` and `combatAnimations`.
 */
describe('Auto End Turn defers while a screen is open', () => {
  let engine: GameEngine;
  let router: EngineEventRouter;
  let endTurnCalls: number;

  beforeEach(async () => {
    engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();

    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'MANY_CITIES',
      devMode: false,
      startingGold: 100
    });

    // Wire the engine to the router exactly like UseGameEngine does.
    router = new EngineEventRouter(engine as GameEngine);
    engine.onStateChange = (type: string, data?: any) => {
      router.handle(type, data);
    };

    // Spy on the turn-ending path.
    endTurnCalls = 0;
    const tm = (engine as any).roundManager;
    if (tm && typeof tm.endHumanTurn === 'function') {
      const orig = tm.endHumanTurn.bind(tm);
      tm.endHumanTurn = async () => {
        endTurnCalls += 1;
        await orig();
      };
    }

    // Reset store UI state between tests.
    useGameStore.getState().actions.hideDialog();
    useGameStore.getState().actions.updateSettings({ autoEndTurn: true });
    // Remove any combat animations.
    const anims = useGameStore.getState().combatAnimations || [];
    for (const a of anims) {
      useGameStore.getState().actions.removeCombatAnimation(a.id);
    }
  });

  it('does NOT auto-end while a city management dialog is open', () => {
    useGameStore.getState().actions.showDialog('city-details');
    // All human units done → auto-end would otherwise trigger.
    const units = (engine as any).units.filter((u: any) => u.civilizationId === 0);
    for (const u of units) {
      u.movesRemaining = 0;
      u.areTurnsDone = true;
    }

    router.handle('CHECK_AUTO_END_TURN', { civilizationId: 0 });

    expect(endTurnCalls).toBe(0);
  });

  it('does NOT auto-end while a combat animation is active', () => {
    useGameStore.getState().actions.addCombatAnimation({
      id: 'test-combat',
      attackerId: 'a',
      defenderId: 'd',
      attackerCol: 5,
      attackerRow: 5,
      defenderCol: 6,
      defenderRow: 5,
      attackerSurvived: true,
      defenderSurvived: false,
      startTime: performance.now(),
      duration: 2000,
    });
    const units = (engine as any).units.filter((u: any) => u.civilizationId === 0);
    for (const u of units) {
      u.movesRemaining = 0;
      u.areTurnsDone = true;
    }

    router.handle('CHECK_AUTO_END_TURN', { civilizationId: 0 });

    expect(endTurnCalls).toBe(0);
  });

  it('auto-ends once the city dialog is closed', () => {
    useGameStore.getState().actions.showDialog('city-details');
    const units = (engine as any).units.filter((u: any) => u.civilizationId === 0);
    for (const u of units) {
      u.movesRemaining = 0;
      u.areTurnsDone = true;
    }

    // While open → deferred.
    router.handle('CHECK_AUTO_END_TURN', { civilizationId: 0 });
    expect(endTurnCalls).toBe(0);

    // Close the dialog → re-check → auto-end fires.
    useGameStore.getState().actions.hideDialog();
    router.handle('CHECK_AUTO_END_TURN', { civilizationId: 0 });

    expect(endTurnCalls).toBeGreaterThan(0);
  });
});
