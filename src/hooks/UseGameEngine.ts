import { useEffect } from 'react';
import { useGameStore } from '../stores/GameStore';
import type { GameEngine } from '../../types/game';
import { EngineEventRouter } from '../utils/EngineEventHandlers';

/**
 * Custom hook to integrate GameEngine with Zustand state
 */
export const useGameEngine = (gameEngine: GameEngine | null) => {
  const actions = useGameStore(state => state.actions);

  useEffect(() => {
    if (!gameEngine) return;

    // Set up state change callback via router
    const router = new EngineEventRouter(gameEngine as GameEngine);
    gameEngine.onStateChange = (eventType, eventData) => router.handle(eventType, eventData);

    // Initial state sync
    if (gameEngine.isInitialized) {
      console.log('[useGameEngine] Initial sync starting...');
      actions.updateMap(gameEngine.map);
      actions.updateUnits(gameEngine.getAllUnits());
      actions.updateCities(gameEngine.getAllCities());
      actions.updateCivilizations(gameEngine.civilizations);
      actions.updateTechnologies(gameEngine.technologies);

      const playerSettler = gameEngine.units.find(u => u.civilizationId === 0 && u.type === 'settler');
      console.log('[useGameEngine] Player settler found:', playerSettler);
      if (playerSettler) {
        console.log('[useGameEngine] Revealing area around settler at', playerSettler.col, playerSettler.row);
        actions.revealArea(playerSettler.col, playerSettler.row, 2);
      }

      console.log('[useGameEngine] Calling updateVisibility...');
      actions.updateVisibility();
      actions.focusOnNextUnit();
      
      // Register human player if their turn has started but wasn't registered
      // (This happens because startTurn is called before the event router is connected)
      const tm = (gameEngine as any).turnManager || (gameEngine as any).roundManager;
      const activePlayer = (gameEngine as any).activePlayer;
      const activeCiv = gameEngine.civilizations?.[activePlayer];
      if (activeCiv?.isHuman && tm && typeof tm.registerPlayer === 'function') {
        console.log('[useGameEngine] Registering human player for initial turn', activePlayer);
        tm.registerPlayer(activePlayer);
      }
      
      console.log('[useGameEngine] Initial sync complete');
    }

    return () => {
      // Cleanup
      if (gameEngine) {
        gameEngine.onStateChange = null;
      }
    };
  }, [gameEngine, actions]);
};

/**
 * Custom hook for game controls
 */
// useGameControls removed (unused)

