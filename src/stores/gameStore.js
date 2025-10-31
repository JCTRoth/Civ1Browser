import { atom } from 'jotai';
import { CONSTANTS } from '../utils/constants.js';

// Game State Atoms
export const gameStateAtom = atom({
  isLoading: false,
  isGameStarted: false,
  currentTurn: 1,
  gamePhase: 'menu', // 'menu', 'loading', 'playing', 'paused'
  selectedHex: null,
  selectedUnit: null,
  selectedCity: null,
  activePlayer: 0,
  mapGenerated: false,
  winner: null
});

// Map State Atoms
export const mapAtom = atom({
  width: CONSTANTS.MAP_WIDTH,
  height: CONSTANTS.MAP_HEIGHT,
  tiles: [],
  visibility: [], // Fog of war
  revealed: []    // Permanently revealed tiles
});

// Camera State Atoms
export const cameraAtom = atom({
  x: 0,
  y: 0,
  zoom: 1.0,
  minZoom: 0.5,
  maxZoom: 3.0
});

// Units State Atoms
export const unitsAtom = atom([]);

// Cities State Atoms
export const citiesAtom = atom([]);

// Civilizations State Atoms
export const civilizationsAtom = atom([]);

// Current Player Atom (derived)
export const currentPlayerAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  const civilizations = get(civilizationsAtom);
  return civilizations[gameState.activePlayer] || null;
});

// Player Resources Atom (derived)
export const playerResourcesAtom = atom((get) => {
  const currentPlayer = get(currentPlayerAtom);
  if (!currentPlayer) {
    return {
      food: 0,
      production: 0,
      trade: 0,
      science: 0,
      gold: 0
    };
  }
  return {
    food: currentPlayer.resources?.food || 0,
    production: currentPlayer.resources?.production || 0,
    trade: currentPlayer.resources?.trade || 0,
    science: currentPlayer.resources?.science || 0,
    gold: currentPlayer.resources?.gold || 0
  };
});

// UI State Atoms
export const uiStateAtom = atom({
  showMinimap: true,
  showUnitPanel: false,
  showCityPanel: false,
  showTechTree: false,
  showDiplomacy: false,
  showGameMenu: false,
  activeDialog: null, // 'city', 'tech', 'diplomacy', 'game-menu', null
  sidebarCollapsed: false,
  notifications: []
});

// Selected Unit Details Atom (derived)
export const selectedUnitAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  const units = get(unitsAtom);
  
  if (!gameState.selectedUnit) return null;
  
  return units.find(unit => unit.id === gameState.selectedUnit) || null;
});

// Selected City Details Atom (derived)
export const selectedCityAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  const cities = get(citiesAtom);
  
  if (!gameState.selectedCity) return null;
  
  return cities.find(city => city.id === gameState.selectedCity) || null;
});

// Player Units Atom (derived)
export const playerUnitsAtom = atom((get) => {
  const currentPlayer = get(currentPlayerAtom);
  const units = get(unitsAtom);
  
  if (!currentPlayer) return [];
  
  return units.filter(unit => unit.civilizationId === currentPlayer.id);
});

// Player Cities Atom (derived)
export const playerCitiesAtom = atom((get) => {
  const currentPlayer = get(currentPlayerAtom);
  const cities = get(citiesAtom);
  
  if (!currentPlayer) return [];
  
  return cities.filter(city => city.civilizationId === currentPlayer.id);
});

// Technology State Atoms
export const technologiesAtom = atom([]);

// Actions for updating state
export const gameActionsAtom = atom(
  null,
  (get, set, action) => {
    switch (action.type) {
      case 'START_GAME':
        set(gameStateAtom, prev => ({
          ...prev,
          isGameStarted: true,
          gamePhase: 'playing'
        }));
        break;

      case 'SELECT_HEX':
        set(gameStateAtom, prev => ({
          ...prev,
          selectedHex: action.payload
        }));
        break;

      case 'SELECT_UNIT':
        set(gameStateAtom, prev => ({
          ...prev,
          selectedUnit: action.payload,
          selectedCity: null
        }));
        set(uiStateAtom, prev => ({
          ...prev,
          showUnitPanel: !!action.payload,
          showCityPanel: false
        }));
        break;

      case 'SELECT_CITY':
        set(gameStateAtom, prev => ({
          ...prev,
          selectedCity: action.payload,
          selectedUnit: null
        }));
        set(uiStateAtom, prev => ({
          ...prev,
          showCityPanel: !!action.payload,
          showUnitPanel: false
        }));
        break;

      case 'NEXT_TURN':
        const gameState = get(gameStateAtom);
        const civilizations = get(civilizationsAtom);
        const nextPlayer = (gameState.activePlayer + 1) % civilizations.length;
        const nextTurn = nextPlayer === 0 ? gameState.currentTurn + 1 : gameState.currentTurn;
        
        set(gameStateAtom, prev => ({
          ...prev,
          activePlayer: nextPlayer,
          currentTurn: nextTurn,
          selectedUnit: null,
          selectedCity: null,
          selectedHex: null
        }));
        
        set(uiStateAtom, prev => ({
          ...prev,
          showUnitPanel: false,
          showCityPanel: false
        }));
        break;

      case 'UPDATE_CAMERA':
        set(cameraAtom, prev => ({
          ...prev,
          ...action.payload
        }));
        break;

      case 'TOGGLE_UI':
        set(uiStateAtom, prev => ({
          ...prev,
          [action.payload]: !prev[action.payload]
        }));
        break;

      case 'SHOW_DIALOG':
        set(uiStateAtom, prev => ({
          ...prev,
          activeDialog: action.payload
        }));
        break;

      case 'HIDE_DIALOG':
        set(uiStateAtom, prev => ({
          ...prev,
          activeDialog: null
        }));
        break;

      case 'ADD_NOTIFICATION':
        set(uiStateAtom, prev => ({
          ...prev,
          notifications: [
            ...prev.notifications,
            {
              id: Date.now(),
              ...action.payload
            }
          ]
        }));
        break;

      case 'REMOVE_NOTIFICATION':
        set(uiStateAtom, prev => ({
          ...prev,
          notifications: prev.notifications.filter(n => n.id !== action.payload)
        }));
        break;

      case 'SET_LOADING':
        set(gameStateAtom, prev => ({
          ...prev,
          isLoading: action.payload
        }));
        break;

      case 'UPDATE_MAP':
        set(mapAtom, prev => ({
          ...prev,
          ...action.payload
        }));
        break;

      case 'UPDATE_UNITS':
        set(unitsAtom, action.payload);
        break;

      case 'UPDATE_CITIES':
        set(citiesAtom, action.payload);
        break;

      case 'UPDATE_CIVILIZATIONS':
        set(civilizationsAtom, action.payload);
        break;

      case 'UPDATE_TECHNOLOGIES':
        set(technologiesAtom, action.payload);
        break;

      default:
        console.warn('Unknown action type:', action.type);
    }
  }
);

// Selectors for complex derived state
export const visibleTilesAtom = atom((get) => {
  const map = get(mapAtom);
  const camera = get(cameraAtom);
  
  // Calculate which tiles are visible based on camera position and zoom
  // This would be used by the renderer to optimize drawing
  const viewportTiles = [];
  
  // Simple implementation - in a real game you'd calculate the actual viewport
  for (let x = 0; x < map.width; x++) {
    for (let y = 0; y < map.height; y++) {
      viewportTiles.push({ x, y });
    }
  }
  
  return viewportTiles;
});

export const gameStatsAtom = atom((get) => {
  const gameState = get(gameStateAtom);
  const civilizations = get(civilizationsAtom);
  const cities = get(citiesAtom);
  const units = get(unitsAtom);
  
  return {
    turn: gameState.currentTurn,
    totalCities: cities.length,
    totalUnits: units.length,
    aliveCivilizations: civilizations.filter(civ => civ.isAlive).length,
    gameStarted: gameState.isGameStarted
  };
});

// Export all atoms
export default {
  gameStateAtom,
  mapAtom,
  cameraAtom,
  unitsAtom,
  citiesAtom,
  civilizationsAtom,
  currentPlayerAtom,
  playerResourcesAtom,
  uiStateAtom,
  selectedUnitAtom,
  selectedCityAtom,
  playerUnitsAtom,
  playerCitiesAtom,
  technologiesAtom,
  gameActionsAtom,
  visibleTilesAtom,
  gameStatsAtom
};