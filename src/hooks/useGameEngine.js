import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';

/**
 * Custom hook to integrate GameEngine with Zustand state
 */
export const useGameEngine = (gameEngine) => {
  const actions = useGameStore(state => state.actions);

  useEffect(() => {
    if (!gameEngine) return;

    // Set up state change callback
    gameEngine.onStateChange = (eventType, eventData) => {
      switch (eventType) {
        case 'NEW_GAME':
          console.log('[useGameEngine] NEW_GAME: Updating map and initial visibility');
          // Update all game state
          actions.updateMap(eventData.map);
          actions.updateUnits(eventData.units);
          actions.updateCities(eventData.cities);
          actions.updateCivilizations(eventData.civilizations);
          actions.updateTechnologies(eventData.technologies);
          actions.updateVisibility(); // Calculate initial visibility around starting units
          actions.startGame();
          console.log('[useGameEngine] NEW_GAME: Initial game state updated');
          break;

        case 'UNIT_MOVED': {
          // Sync units and visibility
          actions.updateUnits(gameEngine.getAllUnits());
          actions.updateVisibility();

          // eventData.unit is the moved unit
          const moved = eventData && eventData.unit ? eventData.unit : null;
          if (moved) {
            // If unit has moves remaining, keep it as active; otherwise advance to next unit
            const movesLeft = moved.movesRemaining || 0;
            if (movesLeft > 0) {
              actions.selectUnit(moved.id);
            } else {
              // Move to next unit that can act
              actions.focusOnNextUnit();
            }
          }

          break;
        }

        case 'COMBAT_VICTORY':
        case 'COMBAT_DEFEAT':
          actions.updateUnits(gameEngine.getAllUnits());
          actions.updateVisibility();
          actions.addNotification({
            type: eventType === 'COMBAT_VICTORY' ? 'success' : 'warning',
            message: eventType === 'COMBAT_VICTORY' ? 'Victory in combat!' : 'Unit defeated in combat!'
          });
          break;

        case 'CITY_FOUNDED':
          actions.updateCities(gameEngine.getAllCities());
          actions.updateUnits(gameEngine.getAllUnits());
          actions.updateVisibility();
          actions.addNotification({
            type: 'info',
            message: `${eventData.city.name} founded!`
          });
          break;

        case 'TURN_PROCESSED':
          actions.updateCivilizations(gameEngine.civilizations);
          actions.updateCities(gameEngine.getAllCities());
          actions.updateUnits(gameEngine.getAllUnits());
          actions.updateTechnologies(gameEngine.technologies);
          actions.updateVisibility();
          // Focus camera on next unit for active player
          actions.focusOnNextUnit();
          break;

        default:
          console.log('Unhandled game engine event:', eventType, eventData);
      }
    };

    // Initial state sync
    if (gameEngine.isInitialized) {
      console.log('[useGameEngine] Initial sync starting...');
      actions.updateMap(gameEngine.map);
      actions.updateUnits(gameEngine.getAllUnits());
      actions.updateCities(gameEngine.getAllCities());
      actions.updateCivilizations(gameEngine.civilizations);
      actions.updateTechnologies(gameEngine.technologies);
      
      // Reveal starting area around player's settler
      const playerSettler = gameEngine.units.find(u => u.civilizationId === 0 && u.type === 'settlers');
      console.log('[useGameEngine] Player settler found:', playerSettler);
      if (playerSettler) {
        console.log('[useGameEngine] Revealing area around settler at', playerSettler.col, playerSettler.row);
        actions.revealArea(playerSettler.col, playerSettler.row, 2);
      }
      
      console.log('[useGameEngine] Calling updateVisibility...');
      actions.updateVisibility();
      // Focus camera on player's first movable unit at start
      actions.focusOnNextUnit();
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
export const useGameControls = (gameEngine) => {
  const actions = useGameStore(state => state.actions);

  const controls = {
    newGame: () => {
      if (gameEngine) {
        gameEngine.newGame();
      }
    },

    nextTurn: () => {
      actions.nextTurn();
      if (gameEngine) {
        gameEngine.processTurn();
      }
    },

    selectUnit: (unitId) => {
      actions.selectUnit(unitId);
    },

    selectCity: (cityId) => {
      actions.selectCity(cityId);
    },

    moveUnit: (unitId, col, row) => {
      if (gameEngine) {
        return gameEngine.moveUnit(unitId, col, row);
      }
      return false;
    },

    foundCity: (settlerId) => {
      if (gameEngine) {
        return gameEngine.foundCity(settlerId);
      }
      return false;
    },

    setResearch: (civId, techId) => {
      if (gameEngine) {
        gameEngine.setResearch(civId, techId);
      }
    },

    unitAction: (unitId, action) => {
      if (!gameEngine) return;

      switch (action) {
        case 'sleep':
          gameEngine.unitSleep(unitId);
          break;
        case 'fortify':
          gameEngine.unitFortify(unitId);
          break;
        case 'skip':
          gameEngine.skipUnit(unitId);
          break;
        case 'build_road':
          gameEngine.buildImprovement(unitId, 'road');
          break;
        default:
          console.warn('Unknown unit action:', action);
      }

      // Update units state
      actions.updateUnits(gameEngine.getAllUnits());
    }
  };

  return controls;
};

export default { useGameEngine, useGameControls };