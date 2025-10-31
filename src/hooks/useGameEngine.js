import { useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  gameActionsAtom,
  mapAtom,
  unitsAtom,
  citiesAtom,
  civilizationsAtom,
  technologiesAtom
} from '../stores/gameStore';

/**
 * Custom hook to integrate GameEngine with Jotai state
 */
export const useGameEngine = (gameEngine) => {
  const [, gameActions] = useAtom(gameActionsAtom);

  useEffect(() => {
    if (!gameEngine) return;

    // Set up state change callback
    gameEngine.onStateChange = (eventType, eventData) => {
      switch (eventType) {
        case 'NEW_GAME':
          // Update all game state atoms
          gameActions({ type: 'UPDATE_MAP', payload: eventData.map });
          gameActions({ type: 'UPDATE_UNITS', payload: eventData.units });
          gameActions({ type: 'UPDATE_CITIES', payload: eventData.cities });
          gameActions({ type: 'UPDATE_CIVILIZATIONS', payload: eventData.civilizations });
          gameActions({ type: 'UPDATE_TECHNOLOGIES', payload: eventData.technologies });
          gameActions({ type: 'START_GAME' });
          break;

        case 'UNIT_MOVED':
          gameActions({ type: 'UPDATE_UNITS', payload: gameEngine.getAllUnits() });
          break;

        case 'COMBAT_VICTORY':
        case 'COMBAT_DEFEAT':
          gameActions({ type: 'UPDATE_UNITS', payload: gameEngine.getAllUnits() });
          gameActions({ 
            type: 'ADD_NOTIFICATION', 
            payload: { 
              type: eventType === 'COMBAT_VICTORY' ? 'success' : 'warning',
              message: eventType === 'COMBAT_VICTORY' ? 'Victory in combat!' : 'Unit defeated in combat!'
            } 
          });
          break;

        case 'CITY_FOUNDED':
          gameActions({ type: 'UPDATE_CITIES', payload: gameEngine.getAllCities() });
          gameActions({ type: 'UPDATE_UNITS', payload: gameEngine.getAllUnits() });
          gameActions({ 
            type: 'ADD_NOTIFICATION', 
            payload: { 
              type: 'info',
              message: `${eventData.city.name} founded!`
            } 
          });
          break;

        case 'TURN_PROCESSED':
          gameActions({ type: 'UPDATE_CIVILIZATIONS', payload: gameEngine.civilizations });
          gameActions({ type: 'UPDATE_CITIES', payload: gameEngine.getAllCities() });
          gameActions({ type: 'UPDATE_UNITS', payload: gameEngine.getAllUnits() });
          gameActions({ type: 'UPDATE_TECHNOLOGIES', payload: gameEngine.technologies });
          break;

        default:
          console.log('Unhandled game engine event:', eventType, eventData);
      }
    };

    // Initial state sync
    if (gameEngine.isInitialized) {
      gameActions({ type: 'UPDATE_MAP', payload: gameEngine.map });
      gameActions({ type: 'UPDATE_UNITS', payload: gameEngine.getAllUnits() });
      gameActions({ type: 'UPDATE_CITIES', payload: gameEngine.getAllCities() });
      gameActions({ type: 'UPDATE_CIVILIZATIONS', payload: gameEngine.civilizations });
      gameActions({ type: 'UPDATE_TECHNOLOGIES', payload: gameEngine.technologies });
    }

    return () => {
      // Cleanup
      if (gameEngine) {
        gameEngine.onStateChange = null;
      }
    };
  }, [gameEngine, gameActions]);
};

/**
 * Custom hook for game controls
 */
export const useGameControls = (gameEngine) => {
  const [, gameActions] = useAtom(gameActionsAtom);

  const controls = {
    newGame: () => {
      if (gameEngine) {
        gameEngine.newGame();
      }
    },

    nextTurn: () => {
      gameActions({ type: 'NEXT_TURN' });
      if (gameEngine) {
        gameEngine.processTurn();
      }
    },

    selectUnit: (unitId) => {
      gameActions({ type: 'SELECT_UNIT', payload: unitId });
    },

    selectCity: (cityId) => {
      gameActions({ type: 'SELECT_CITY', payload: cityId });
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
      gameActions({ type: 'UPDATE_UNITS', payload: gameEngine.getAllUnits() });
    }
  };

  return controls;
};

export default { useGameEngine, useGameControls };