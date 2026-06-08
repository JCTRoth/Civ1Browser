/// <reference types="vite/client" />

import { create } from 'zustand';
import { Constants } from '../utils/Constants';
import { SquareGrid } from '../game/HexGrid';
import { UNIT_TYPES } from '../data/GameData';
import { UNIT_PROPERTIES } from '../data/UnitConstants';
import type { GameStoreState, GameState, MapState, CameraState, Unit, City, Civilization, UIState, Settings, Technology, GameActions, GameResult } from '../../types/game';

const createInitialGameState = (): GameState => ({
  isLoading: false,
  isGameStarted: false,
  currentTurn: 1,
  gamePhase: 'menu',
  selectedHex: null,
  selectedUnit: null,
  activeUnit: null,
  selectedCity: null,
  activePlayer: 0,
  mapGenerated: false,
  winner: null,
  currentYear: -4000,
  gameResult: null
});

const createInitialMapState = (): MapState => ({
  width: Constants.MAP_WIDTH,
  height: Constants.MAP_HEIGHT,
  tiles: [],
  visibility: [],
  revealed: []
});

const createInitialCameraState = (): CameraState => ({
  x: 0,
  y: 0,
  zoom: 2.0,
  minZoom: 0.5,
  maxZoom: 3.0
});

const createInitialUIState = (): UIState => ({
  showMinimap: true,
  showUnitPanel: false,
  showCityPanel: false,
  showTechTree: false,
  showDiplomacy: false,
  showGameMenu: false,
  activeDialog: null,
  sidebarCollapsed: false,
  notifications: [],
  goToMode: false,
  goToUnit: '',
  turnButtonDisabled: false,
  currentQueueUnitId: null,
  turnFlashTrigger: 0
});

// Helper function for visibility calculations
const setVisibilityAreaInternal = (visibility, revealed, centerCol, centerRow, radius, mapWidth, mapHeight) => {
  const squareGrid = new SquareGrid(mapWidth, mapHeight);

  for (let row = centerRow - radius; row <= centerRow + radius; row++) {
    for (let col = centerCol - radius; col <= centerCol + radius; col++) {
      if (row >= 0 && row < mapHeight && col >= 0 && col < mapWidth) {
        const index = row * mapWidth + col;
        if (squareGrid.squareDistance(centerCol, centerRow, col, row) <= radius) {
          visibility[index] = true;
          // Also mark as explored when first seen
          revealed[index] = true;
        }
      }
    }
  }
};

// Zustand store replacing Jotai atoms
export const useGameStore = create<GameStoreState>((set, get) => ({
  // Game State
  gameState: createInitialGameState(),

  // Map State
  map: createInitialMapState(),

  // Camera State
  camera: createInitialCameraState(),

  // Internal helper to track last active player to avoid noisy camera pans
  _lastActivePlayer: null,

  // Units State
  units: [],

  // Cities State
  cities: [],

  // Civilizations State
  civilizations: [],

  // UI State
  uiState: createInitialUIState(),

  // Settings
  settings: {
    uiScale: 1.0,        // Overall UI scale multiplier (0.5 to 2.0)
    menuFontSize: 12,    // Top menu font size in pixels
    sidebarWidth: 140,   // Left sidebar width in pixels
    minimapHeight: 120,  // Minimap height in pixels
    civListFontSize: 10, // Civilization list font size
    skipEndTurnConfirmation: false, // Skip showing end turn confirmation modal
    autoEndTurn: false,  // Automatically end turn when all human player units are done (default disabled)
    devMode: false       // Developer mode: see all players on minimap and switch between them
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
      gameState: { ...state.gameState, selectedUnit: unitId, activeUnit: unitId, selectedCity: null },
      uiState: { 
        ...state.uiState, 
        showUnitPanel: !!unitId, 
        showCityPanel: false
      }
    })),

    selectCity: (cityId) => set(state => ({
      gameState: { ...state.gameState, selectedCity: cityId, selectedUnit: null },
      uiState: { ...state.uiState, showCityPanel: !!cityId, showUnitPanel: false }
    })),

    nextTurn: () => set(state => {
      // Get only active (alive) civilizations for turn cycling
      const activeCivs = state.civilizations.filter(civ => civ.isAlive !== false);
      const currentActiveIndex = activeCivs.findIndex(civ => civ.id === state.gameState.activePlayer);
      const nextActiveIndex = (currentActiveIndex + 1) % activeCivs.length;
      const nextPlayer = activeCivs[nextActiveIndex]?.id ?? 0;
      
      // A new round starts when we wrap back to the first active player
      const isNewRound = nextActiveIndex === 0 && currentActiveIndex !== -1;
      const nextTurn = isNewRound ? state.gameState.currentTurn + 1 : state.gameState.currentTurn;
      
      // Use era-based year progression (only advance on new round)
      const currentYear = state.gameState.currentYear || -4000;
      let nextYear = currentYear;
      if (isNewRound) {
        // Era-based increments
        if (currentYear < 1000) {
          nextYear = currentYear + 20;
        } else if (currentYear < 1500) {
          nextYear = currentYear + 10;
        } else if (currentYear < 1750) {
          nextYear = currentYear + 5;
        } else if (currentYear < 1850) {
          nextYear = currentYear + 2;
        } else {
          nextYear = currentYear + 1;
        }
        // Skip year 0 (1 BC -> 1 AD)
        if (currentYear < 0 && nextYear >= 0) {
          nextYear = nextYear === 0 ? 1 : nextYear;
        }
      }

      return {
        gameState: {
          ...state.gameState,
          activePlayer: nextPlayer,
          currentTurn: nextTurn,
          currentYear: nextYear,
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

    focusOnNextUnit: () => set(state => {
      // Prevent multiple calls in quick succession
      const now = Date.now();
      if (state._lastFocusCall && now - state._lastFocusCall < 100) {
        return state;
      }

      // Find next unit belonging to active player that still has moves and is not sleeping
      const activeId = state.gameState.activePlayer;
      const lastActive = (state as any)._lastActivePlayer;
      const devMode = !!state.settings?.devMode;
      const candidate = state.units.find(u => u.civilizationId === activeId && (u.movesRemaining || 0) > 0 && !u.isSleeping);

      if (candidate) {
        // Focus on the unit
        const TILE_SIZE = Constants.HEX_SIZE || 32; // world pixels per tile
        const zoom = Math.max(0.1, state.camera.zoom || 2.0); // Prevent division by zero


        // Safe window dimension access with fallbacks
        const windowWidth = (typeof window !== 'undefined' && window.innerWidth) || 800;
        const windowHeight = (typeof window !== 'undefined' && window.innerHeight) || 600;

        const startX = candidate.col * TILE_SIZE;
        const startY = candidate.row * TILE_SIZE;

        // Calculate camera position with bounds checking
        const centerOffsetX = windowWidth / 2 / zoom;
        const centerOffsetY = windowHeight / 2 / zoom;

        const newCameraX = startX - centerOffsetX;
        const newCameraY = startY - centerOffsetY;

        // Ensure camera position is valid (not NaN or infinite)
        const safeCameraX = isFinite(newCameraX) ? newCameraX : 0;
        const safeCameraY = isFinite(newCameraY) ? newCameraY : 0;

        const newCamera = {
          x: safeCameraX,
          y: safeCameraY,
          zoom: zoom
        };

        // Only update the camera position if either the same player retained control or developer mode is enabled
        const shouldMoveCamera = devMode || lastActive === null || lastActive === activeId;

        return {
          ...state,
          _lastFocusCall: now,
          _lastActivePlayer: activeId,
          gameState: { ...state.gameState, selectedUnit: candidate.id, activeUnit: candidate.id, selectedCity: null },
          camera: shouldMoveCamera ? { ...state.camera, ...newCamera } : { ...state.camera }
        };
      } else {
        // No unit found, focus on the capital city of the active player
        const activeCivilization = state.civilizations.find(c => c.id === activeId);
        const capitalCity = activeCivilization?.capital;

        if (capitalCity) {
          const TILE_SIZE = Constants.HEX_SIZE || 32; // world pixels per tile
          const zoom = Math.max(0.1, state.camera.zoom || 2.0); // Prevent division by zero


          // Safe window dimension access with fallbacks
          const windowWidth = (typeof window !== 'undefined' && window.innerWidth) || 800;
          const windowHeight = (typeof window !== 'undefined' && window.innerHeight) || 600;

          const startX = capitalCity.col * TILE_SIZE;
          const startY = capitalCity.row * TILE_SIZE;

          // Calculate camera position with bounds checking
          const centerOffsetX = windowWidth / 2 / zoom;
          const centerOffsetY = windowHeight / 2 / zoom;

          const newCameraX = startX - centerOffsetX;
          const newCameraY = startY - centerOffsetY;

          // Ensure camera position is valid (not NaN or infinite)
          const safeCameraX = isFinite(newCameraX) ? newCameraX : 0;
          const safeCameraY = isFinite(newCameraY) ? newCameraY : 0;

          const newCamera = {
            x: safeCameraX,
            y: safeCameraY,
            zoom: zoom
          };

          const lastActive = (state as any)._lastActivePlayer;
          const devMode = !!state.settings?.devMode;
          const shouldMoveCamera = devMode || lastActive === null || lastActive === activeId;

          return {
            ...state,
            _lastFocusCall: now,
            _lastActivePlayer: activeId,
            gameState: { ...state.gameState, selectedUnit: null, activeUnit: null, selectedCity: capitalCity.id },
            camera: shouldMoveCamera ? { ...state.camera, ...newCamera } : { ...state.camera }
          };
        }
      }

      // No unit or capital found, return unchanged state
      return state;
    }),

    updateCamera: (cameraUpdate) => set(state => ({
      camera: { ...state.camera, ...cameraUpdate }
    })),

    toggleUI: (key) => set(state => ({
      uiState: { ...state.uiState, [key]: !state.uiState[key] }
    })),

    setTurnButtonDisabled: (disabled: boolean) => set(state => ({
      uiState: { ...state.uiState, turnButtonDisabled: disabled }
    })),

    setCurrentQueueUnitId: (unitId: string | null) => set(state => ({
      uiState: { ...state.uiState, currentQueueUnitId: unitId }
    })),

    incrementTurnFlash: () => set(state => ({
      uiState: { ...state.uiState, turnFlashTrigger: state.uiState.turnFlashTrigger + 1 }
    })),

    showDialog: (dialog) => set(state => ({
      uiState: { ...state.uiState, activeDialog: dialog }
    })),

    hideDialog: () => set(state => ({
      uiState: { ...state.uiState, activeDialog: null }
    })),

    addNotification: (notification) => {
      const id = Date.now();
      set(state => ({
        uiState: {
          ...state.uiState,
          notifications: [
            ...state.uiState.notifications,
            { id, ...notification }
          ]
        }
      }));
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        set(state => ({
          uiState: {
            ...state.uiState,
            notifications: state.uiState.notifications.filter(n => n.id !== id)
          }
        }));
      }, 5000);
    },

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
      // Clone tiles to ensure React detects changes when individual tiles are updated
      if (mapUpdate.tiles) {
        newMap.tiles = mapUpdate.tiles.map(tile => ({ ...tile }));
      }
      // For development-only forced fog disable, read from env (Vite exposes VITE_* vars)
      const disableFog = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DISABLE_FOG === 'true';
      const tilesArray = Array.isArray(mapUpdate.tiles) && mapUpdate.tiles.length > 0
        ? mapUpdate.tiles
        : Array.isArray(newMap.tiles) ? newMap.tiles : [];
      const totalTiles = tilesArray.length;

      // Initialize visibility arrays if tiles are provided and arrays don't exist or are wrong size
      if (totalTiles > 0) {
        if (!newMap.visibility || newMap.visibility.length !== totalTiles) {
          newMap.visibility = new Array(totalTiles).fill(false);
        }
        if (!newMap.revealed || newMap.revealed.length !== totalTiles) {
          newMap.revealed = new Array(totalTiles).fill(false);
        }

        // No development-only mutations here; visibility arrays will be updated independently
      }

      // Minimal logging for map initialization
      console.log('[Store] updateMap: Map updated', { width: newMap.width, height: newMap.height });

      return {
        map: newMap
      };
    }),

    // Visibility management actions
    updateVisibility: () => set(state => {
      const { map, units, cities, settings } = state;
      const disableFog = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DISABLE_FOG === 'true') || settings.devMode;

      if (!map.tiles || map.tiles.length === 0) {
        return state;
      }

      if (disableFog) {
        // If developer mode enabled or fog disabled via env var, mark everything visible
        const totalTiles = map.tiles.length;
        return {
          ...state,
          map: {
            ...map,
            visibility: new Array(totalTiles).fill(true),
            revealed: new Array(totalTiles).fill(true),
            tiles: Array.isArray(map.tiles) ? map.tiles.map(t => t ? { ...t, visible: true, explored: true } : t) : map.tiles
          }
        };
      }

      // Create new visibility arrays
      const newVisibility = new Array(map.tiles.length).fill(false);
      const newRevealed = [...(map.revealed || new Array(map.tiles.length).fill(false))];

      // Clear current visibility (but keep revealed status)
      // Revealed tiles stay permanently visible
      // Reveal around all of the active player's units only
      for (const unit of units) {
        if (unit.civilizationId !== state.gameState.activePlayer) {
          continue;
        }

        // Resolve unit sight range robustly. Unit.type is usually an id like 'warrior' or 'scout'.
        const unitTypeId = unit.type ? String(unit.type).toLowerCase() : null;

        // Try to find the game data UNIT_TYPES entry by matching its inner `id` field
        let gameTypeDef: any = null;
        if (unitTypeId && UNIT_TYPES && typeof UNIT_TYPES === 'object') {
          try {
            // First try exact match
            gameTypeDef = Object.values(UNIT_TYPES).find((t: any) => t && String(t.id).toLowerCase() === unitTypeId) || null;
            
            // If not found and ends with 's', try singular form
            if (!gameTypeDef && unitTypeId.endsWith('s')) {
              const singularType = unitTypeId.slice(0, -1);
              gameTypeDef = Object.values(UNIT_TYPES).find((t: any) => t && String(t.id).toLowerCase() === singularType) || null;
            }
          } catch (e) {
            gameTypeDef = null;
          }
        }

        const sightRange = (typeof (unit as any).sightRange === 'number') 
          ? (unit as any).sightRange 
          : (gameTypeDef?.sightRange ?? 1); // Default to 1 if not found

        if (sightRange > 0) {
          setVisibilityAreaInternal(newVisibility, newRevealed, unit.col, unit.row, sightRange, map.width, map.height);
        }
      }

      // Reveal around all player cities (civilizationId === active player)
      for (const city of cities) {
        if (city.civilizationId === state.gameState.activePlayer) {
          const cityViewRadius = 2; // Cities can see 2 tiles away
          setVisibilityAreaInternal(newVisibility, newRevealed, city.col, city.row, cityViewRadius, map.width, map.height);
        }
      }

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
      const disableFog = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DISABLE_FOG === 'true') || state.settings.devMode;
      if (disableFog) {
        return state;
      }

      const { map } = state;
      if (!map.tiles || map.tiles.length === 0) {
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

      return {
        ...state,
        map: {
          ...map,
          visibility: newVisibility,
          revealed: newRevealed
        }
      };
    }),

    updateUnits: (units) => set(state => {
      // Enrich units with canonical data (icon, attack, defense, movement) when engine
      // provides only a minimal unit object. Prefer engine values when present.
      const enriched = (units || []).map(u => {
        const unitTypeId = u.type ? String(u.type) : null;

        // Try to find gameData UNIT_TYPES entry by its inner `id` field
        let gameTypeDef: any = null;
        if (unitTypeId && UNIT_TYPES && typeof UNIT_TYPES === 'object') {
          try {
            gameTypeDef = Object.values(UNIT_TYPES).find((t: any) => t && String(t.id).toLowerCase() === String(unitTypeId).toLowerCase()) || null;
          } catch (e) {
            gameTypeDef = null;
          }
        }

        // Fallback to UNIT_PROPERTIES (unitConstants) keyed by lowercase id
        const constDef = unitTypeId ? (UNIT_PROPERTIES[String(unitTypeId).toLowerCase()] || null) : null;

        const icon = u.icon || gameTypeDef?.icon || constDef?.icon || '🔸';
        const attack = (typeof u.attack === 'number') ? u.attack : (gameTypeDef?.attack ?? constDef?.attack ?? 0);
        const defense = (typeof u.defense === 'number') ? u.defense : (gameTypeDef?.defense ?? constDef?.defense ?? 0);
        const movesRemaining = (typeof u.movesRemaining === 'number') ? u.movesRemaining : (typeof (u as any).movement === 'number' ? (u as any).movement : (constDef?.movement ?? 0));
        const maxMoves = (typeof u.maxMoves === 'number') ? u.maxMoves : (constDef?.movement ?? gameTypeDef?.movement ?? movesRemaining);

        return { ...u, icon, attack, defense, movesRemaining, maxMoves };
      });
      return { units: enriched };
    }),

    updateCities: (cities) => set({ cities }),

    updateCivilizations: (civilizations) => set({ civilizations }),

    updateTechnologies: (technologies) => set({ technologies }),

    updateGameState: (updates) => set(state => ({
      gameState: { ...state.gameState, ...updates }
    })),

    updateSettings: (updates) => set(state => ({
      settings: { ...state.settings, ...updates }
    })),
    setGoToMode: (enabled: boolean, unitId?: string | null) => set(state => ({
      uiState: {
        ...state.uiState,
        goToMode: !!enabled,
        goToUnit: enabled ? (unitId || state.gameState.selectedUnit || '') : ''
      }
    })),

    setGameResult: (result: GameResult | null) => set(state => ({
      gameState: {
        ...state.gameState,
        gameResult: result,
        winner: result && result.outcome === 'victory' ? result.civName : null,
        gamePhase: result ? 'completed' : state.gameState.gamePhase
      }
    })),

    clearGameResult: () => set(state => ({
      gameState: {
        ...state.gameState,
        gameResult: null
      }
    })),

    resetGameState: () => set(state => ({
      gameState: createInitialGameState(),
      map: createInitialMapState(),
      camera: createInitialCameraState(),
      units: [],
      cities: [],
      civilizations: [],
      technologies: [],
      uiState: createInitialUIState()
    })),

    resetFogOfWar: () => set(state => {
      const { map } = state;
      if (!map.tiles || map.tiles.length === 0) {
        console.log('[Store] resetFogOfWar: No tiles to reset');
        return state;
      }

      const totalTiles = map.tiles.length;
      console.log(`[Store] resetFogOfWar: Resetting fog of war for ${totalTiles} tiles`);

      // Reset all visibility and revealed arrays to false
      const newVisibility = new Array(totalTiles).fill(false);
      const newRevealed = new Array(totalTiles).fill(false);

      // Also reset tile-level visibility flags
      const newTiles = map.tiles.map(tile => ({
        ...tile,
        visible: false,
        explored: false
      }));

      return {
        ...state,
        map: {
          ...map,
          tiles: newTiles,
          visibility: newVisibility,
          revealed: newRevealed
        }
      };
    })
  },

  // Computed selectors (equivalent to derived atoms)
  get currentPlayer() {
    const { gameState, civilizations } = get();
    return civilizations[gameState.activePlayer] || null;
  },

  // Cached player resources to avoid new object references on every access
  _cachedPlayerResources: { food: 0, production: 0, trade: 0, science: 0, gold: 0 },

  get playerResources() {
    const currentPlayer = get().currentPlayer;
    const res = currentPlayer?.resources;
    const food = res?.food || 0;
    const production = res?.production || 0;
    const trade = res?.trade || 0;
    const science = res?.science || 0;
    const gold = res?.gold || 0;
    
    const cached = (get() as any)._cachedPlayerResources;
    if (cached.food === food && cached.production === production && cached.trade === trade && cached.science === science && cached.gold === gold) {
      return cached;
    }
    const newRes = { food, production, trade, science, gold };
    (get() as any)._cachedPlayerResources = newRes;
    return newRes;
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

  // Cached game stats
  _cachedGameStats: { turn: 0, totalCities: 0, totalUnits: 0, aliveCivilizations: 0, gameStarted: false },

  get gameStats() {
    const { gameState, civilizations, cities, units } = get();
    const turn = gameState.currentTurn;
    const totalCities = cities.length;
    const totalUnits = units.length;
    const aliveCivilizations = civilizations.filter(civ => civ.isAlive).length;
    const gameStarted = gameState.isGameStarted;

    const cached = (get() as any)._cachedGameStats;
    if (cached.turn === turn && cached.totalCities === totalCities && cached.totalUnits === totalUnits && cached.aliveCivilizations === aliveCivilizations && cached.gameStarted === gameStarted) {
      return cached;
    }
    const newStats = { turn, totalCities, totalUnits, aliveCivilizations, gameStarted };
    (get() as any)._cachedGameStats = newStats;
    return newStats;
  }
}));