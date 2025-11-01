import { create } from 'zustand';
import { CONSTANTS } from '../utils/constants.js';

// Zustand store replacing Jotai atoms
export const useGameStore = create((set, get) => ({
  // Game State
  gameState: {
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
  },

  // Map State
  map: {
    width: CONSTANTS.MAP_WIDTH,
    height: CONSTANTS.MAP_HEIGHT,
    tiles: [],
    visibility: [], // Fog of war
    revealed: []    // Permanently revealed tiles
  },

  // Camera State
  camera: {
    x: 0,
    y: 0,
    zoom: 2.0,
    minZoom: 0.5,
    maxZoom: 3.0
  },

  // Units State
  units: [],

  // Cities State
  cities: [],

  // Civilizations State
  civilizations: [],

  // UI State
  uiState: {
    showMinimap: true,
    showUnitPanel: false,
    showCityPanel: false,
    showTechTree: false,
    showDiplomacy: false,
    showGameMenu: false,
    activeDialog: null, // 'city', 'tech', 'diplomacy', 'game-menu', null
    sidebarCollapsed: false,
    notifications: []
  },

  // Settings
  settings: {
    uiScale: 1.0,        // Overall UI scale multiplier (0.5 to 2.0)
    menuFontSize: 12,    // Top menu font size in pixels
    sidebarWidth: 140,   // Left sidebar width in pixels
    minimapHeight: 120,  // Minimap height in pixels
    civListFontSize: 10  // Civilization list font size
  },

  // Technology State
  technologies: [],

  // Actions
  actions: {
    startGame: () => set(state => ({
      gameState: { ...state.gameState, isGameStarted: true, gamePhase: 'playing' }
    })),

    selectHex: (hex) => set(state => ({
      gameState: { ...state.gameState, selectedHex: hex }
    })),

    selectUnit: (unitId) => set(state => ({
      gameState: { ...state.gameState, selectedUnit: unitId, selectedCity: null },
      uiState: { ...state.uiState, showUnitPanel: !!unitId, showCityPanel: false }
    })),

    selectCity: (cityId) => set(state => ({
      gameState: { ...state.gameState, selectedCity: cityId, selectedUnit: null },
      uiState: { ...state.uiState, showCityPanel: !!cityId, showUnitPanel: false }
    })),

    nextTurn: () => set(state => {
      const nextPlayer = (state.gameState.activePlayer + 1) % state.civilizations.length;
      const nextTurn = nextPlayer === 0 ? state.gameState.currentTurn + 1 : state.gameState.currentTurn;

      return {
        gameState: {
          ...state.gameState,
          activePlayer: nextPlayer,
          currentTurn: nextTurn,
          selectedUnit: null,
          selectedCity: null,
          selectedHex: null
        },
        uiState: {
          ...state.uiState,
          showUnitPanel: false,
          showCityPanel: false
        }
      };
    }),

    updateCamera: (cameraUpdate) => set(state => ({
      camera: { ...state.camera, ...cameraUpdate }
    })),

    toggleUI: (key) => set(state => ({
      uiState: { ...state.uiState, [key]: !state.uiState[key] }
    })),

    showDialog: (dialog) => set(state => ({
      uiState: { ...state.uiState, activeDialog: dialog }
    })),

    hideDialog: () => set(state => ({
      uiState: { ...state.uiState, activeDialog: null }
    })),

    addNotification: (notification) => set(state => ({
      uiState: {
        ...state.uiState,
        notifications: [
          ...state.uiState.notifications,
          { id: Date.now(), ...notification }
        ]
      }
    })),

    removeNotification: (id) => set(state => ({
      uiState: {
        ...state.uiState,
        notifications: state.uiState.notifications.filter(n => n.id !== id)
      }
    })),

    setLoading: (isLoading) => set(state => ({
      gameState: { ...state.gameState, isLoading }
    })),

    updateMap: (mapUpdate) => set(state => ({
      map: { ...state.map, ...mapUpdate }
    })),

    updateUnits: (units) => set({ units }),

    updateCities: (cities) => set({ cities }),

    updateCivilizations: (civilizations) => set({ civilizations }),

    updateTechnologies: (technologies) => set({ technologies }),

    updateGameState: (updates) => set(state => ({
      gameState: { ...state.gameState, ...updates }
    })),

    updateSettings: (updates) => set(state => ({
      settings: { ...state.settings, ...updates }
    }))
  },

  // Computed selectors (equivalent to derived atoms)
  get currentPlayer() {
    const { gameState, civilizations } = get();
    return civilizations[gameState.activePlayer] || null;
  },

  get playerResources() {
    const currentPlayer = get().currentPlayer;
    if (!currentPlayer) {
      return { food: 0, production: 0, trade: 0, science: 0, gold: 0 };
    }
    return {
      food: currentPlayer.resources?.food || 0,
      production: currentPlayer.resources?.production || 0,
      trade: currentPlayer.resources?.trade || 0,
      science: currentPlayer.resources?.science || 0,
      gold: currentPlayer.resources?.gold || 0
    };
  },

  get selectedUnit() {
    const { gameState, units } = get();
    if (!gameState.selectedUnit) return null;
    return units.find(unit => unit.id === gameState.selectedUnit) || null;
  },

  get selectedCity() {
    const { gameState, cities } = get();
    if (!gameState.selectedCity) return null;
    return cities.find(city => city.id === gameState.selectedCity) || null;
  },

  get playerUnits() {
    const { currentPlayer, units } = get();
    if (!currentPlayer) return [];
    return units.filter(unit => unit.civilizationId === currentPlayer.id);
  },

  get playerCities() {
    const { currentPlayer, cities } = get();
    if (!currentPlayer) return [];
    return cities.filter(city => city.civilizationId === currentPlayer.id);
  },

  get visibleTiles() {
    const { map, camera } = get();

    // Calculate which tiles are visible based on camera position and zoom
    const viewportTiles = [];

    // Simple implementation - in a real game you'd calculate the actual viewport
    for (let x = 0; x < map.width; x++) {
      for (let y = 0; y < map.height; y++) {
        viewportTiles.push({ x, y });
      }
    }

    return viewportTiles;
  },

  get gameStats() {
    const { gameState, civilizations, cities, units } = get();

    return {
      turn: gameState.currentTurn,
      totalCities: cities.length,
      totalUnits: units.length,
      aliveCivilizations: civilizations.filter(civ => civ.isAlive).length,
      gameStarted: gameState.isGameStarted
    };
  }
}));