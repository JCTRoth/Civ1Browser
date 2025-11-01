import { create } from 'zustand';
import { CONSTANTS } from '../utils/constants.js';
import { HexGrid } from '../game/hexGrid.js';
import { UNIT_TYPES } from '../game/gameData.js';

// Helper function for visibility calculations
const setVisibilityAreaInternal = (visibility, revealed, centerCol, centerRow, radius, mapWidth, mapHeight) => {
  const hexGrid = new HexGrid(mapWidth, mapHeight);

  for (let row = centerRow - radius; row <= centerRow + radius; row++) {
    for (let col = centerCol - radius; col <= centerCol + radius; col++) {
      if (row >= 0 && row < mapHeight && col >= 0 && col < mapWidth) {
        const index = row * mapWidth + col;
        if (hexGrid.hexDistance(centerCol, centerRow, col, row) <= radius) {
          visibility[index] = true;
          // Also mark as explored when first seen
          revealed[index] = true;
        }
      }
    }
  }
};

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

    updateMap: (mapUpdate) => set(state => {
      const newMap = { ...state.map, ...mapUpdate };

      // Initialize visibility arrays if tiles are provided and arrays don't exist or are wrong size
      if (mapUpdate.tiles && mapUpdate.tiles.length > 0) {
        const totalTiles = mapUpdate.tiles.length;
        if (!newMap.visibility || newMap.visibility.length !== totalTiles) {
          newMap.visibility = new Array(totalTiles).fill(false);
        }
        if (!newMap.revealed || newMap.revealed.length !== totalTiles) {
          newMap.revealed = new Array(totalTiles).fill(false);
        }
        console.log('[Store] updateMap: Initialized visibility arrays', {
          totalTiles,
          visibilityLength: newMap.visibility.length,
          revealedLength: newMap.revealed.length,
          visibilityTrueCount: newMap.visibility.filter(v => v).length,
          revealedTrueCount: newMap.revealed.filter(r => r).length
        });
      }

      console.log('[Store] updateMap: Final map state', {
        width: newMap.width,
        height: newMap.height,
        tilesLength: newMap.tiles?.length || 0,
        visibilityLength: newMap.visibility?.length || 0,
        revealedLength: newMap.revealed?.length || 0
      });

      return {
        map: newMap
      };
    }),

    // Visibility management actions
    updateVisibility: () => set(state => {
      const { map, units, cities } = state;
      if (!map.tiles || map.tiles.length === 0) {
        console.log('[Store] updateVisibility: No tiles to update visibility for');
        return state;
      }

      console.log('[Store] updateVisibility: Starting visibility update', {
        unitsCount: units.length,
        citiesCount: cities.length,
        mapSize: `${map.width}x${map.height}`
      });

      // Create new visibility arrays
      const newVisibility = new Array(map.tiles.length).fill(false);
      const newRevealed = [...(map.revealed || new Array(map.tiles.length).fill(false))];

      // Clear current visibility (but keep revealed status)
      // Revealed tiles stay permanently visible

      // Reveal around all units that have sight capabilities
      for (const unit of units) {
        // Check if unit has sight range > 0
        const unitTypeKey = unit.type.toUpperCase();
        const unitType = UNIT_TYPES[unitTypeKey];
        const sightRange = unitType?.sightRange || 0;
        
        if (sightRange > 0) {
          console.log('[Store] updateVisibility: Processing unit with sight', {
            unitType: unit.type,
            sightRange,
            position: `${unit.col},${unit.row}`,
            civilizationId: unit.civilizationId
          });
          setVisibilityAreaInternal(newVisibility, newRevealed, unit.col, unit.row, sightRange, map.width, map.height);
        }
      }

      // Reveal around all player cities (civilizationId === 0)
      for (const city of cities) {
        if (city.civilizationId === 0) {
          const cityViewRadius = 2; // Cities can see 2 tiles away
          console.log('[Store] updateVisibility: Processing player city', {
            cityName: city.name,
            position: `${city.col},${city.row}`,
            viewRadius: cityViewRadius
          });
          setVisibilityAreaInternal(newVisibility, newRevealed, city.col, city.row, cityViewRadius, map.width, map.height);
        }
      }

      console.log('[Store] updateVisibility: Final visibility state', {
        visibilityTrueCount: newVisibility.filter(v => v).length,
        revealedTrueCount: newRevealed.filter(r => r).length,
        totalTiles: map.tiles.length
      });

      return {
        ...state,
        map: {
          ...map,
          visibility: newVisibility,
          revealed: newRevealed
        }
      };
    }),

    revealArea: (centerCol, centerRow, radius) => set(state => {
      const { map } = state;
      if (!map.tiles || map.tiles.length === 0) {
        console.log('[Store] revealArea: No tiles to reveal');
        return state;
      }

      const newVisibility = [...map.visibility];
      const newRevealed = [...(map.revealed || new Array(map.tiles.length).fill(false))];

      setVisibilityAreaInternal(newVisibility, newRevealed, centerCol, centerRow, radius, map.width, map.height);

      // Also mark as explored (revealed)
      for (let row = centerRow - radius; row <= centerRow + radius; row++) {
        for (let col = centerCol - radius; col <= centerCol + radius; col++) {
          if (row >= 0 && row < map.height && col >= 0 && col < map.width) {
            const index = row * map.width + col;
            // Simple distance check (could be improved with hex distance)
            const distance = Math.sqrt((col - centerCol) ** 2 + (row - centerRow) ** 2);
            if (distance <= radius) {
              newRevealed[index] = true;
            }
          }
        }
      }

      console.log('[Store] revealArea: Revealed area', {
        centerCol, centerRow, radius,
        visibilityTrueCount: newVisibility.filter(v => v).length,
        revealedTrueCount: newRevealed.filter(r => r).length
      });

      return {
        ...state,
        map: {
          ...map,
          visibility: newVisibility,
          revealed: newRevealed
        }
      };
    }),

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