import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@/stores/GameStore';
import { useShallow } from 'zustand/react/shallow';
import { TILE_SIZE } from '@/data/TerrainData';
import { MapRenderer, TerrainRenderGrid, TerrainTileRenderInfo, UnitPathStep, getUnitDisplayTile } from '@/game/rendering/MapRenderer';
import MoveAnimator from '@/game/engine/MoveAnimator';
import { MathUtils } from '@/utils/MathUtils';
import { centerCameraOnTile } from '@/utils/CameraUtils';
import { MiniMapRenderer } from '@/game/rendering/MiniMapRenderer';
import { TerrainTextureManager } from '@/game/rendering/TerrainTextureManager';
import type { City, GameState, MapState, Unit } from '../../../types/game';
import GameEngine from '@/game/engine/GameEngine';
import '../../styles/civ1GameCanvas.css';
import UnitActionsModal from './UnitActionsModal';
import { Pathfinding } from '@/game/engine/Pathfinding';
import { KeyboardHandler } from '@/game/engine/KeyboardHandler';

type HexCoordinates = { col: number; row: number };

interface GameCanvasProps {
  minimap?: boolean;
  onExamineHex?: (hex: HexCoordinates, tile: TerrainTileRenderInfo | null) => void;
  gameEngine?: GameEngine | null;
}

interface ContextMenuState {
  x: number;
  y: number;
  hex: HexCoordinates;
  tile: TerrainTileRenderInfo | null;
  unit: Unit | null;
  city: City | null;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ minimap = false, onExamineHex, gameEngine = null }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainTypesHashRef = useRef<string>('');
  const mapRendererRef = useRef<MapRenderer>(new MapRenderer());
  const miniMapRendererRef = useRef<MiniMapRenderer>(new MiniMapRenderer());
  const textureManagerRef = useRef<TerrainTextureManager | null>(null);
  const gameState = useGameStore(useShallow(state => state.gameState));
  const mapData = useGameStore(state => state.map);
  const camera = useGameStore(state => state.camera);
  const actions = useGameStore(state => state.actions);
  const cities = useGameStore(state => state.cities);
  const units = useGameStore(state => state.units);
  const currentPlayer = useGameStore(state => state.civilizations[state.gameState.activePlayer] || null);
  const civilizations = useGameStore(state => state.civilizations);
  const currentQueueUnitId = useGameStore(state => state.uiState.currentQueueUnitId);
  const combatAnimations = useGameStore(state => state.combatAnimations);
  const movementAnimations = useGameStore(state => state.movementAnimations);
  const cameraPanRequest = useGameStore(state => state.cameraPanRequest);
  const moveAnimator = useMemo(() => (gameEngine ? new MoveAnimator(gameEngine) : null), [gameEngine]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lastMousePos, setLastMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedHex, setSelectedHex] = useState<HexCoordinates>({ col: 5, row: 5 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [terrain, setTerrain] = useState<TerrainRenderGrid | null>(null);
  const storeGotoMode = useGameStore(state => state.uiState.goToMode);
  const storeGotoUnitId = useGameStore(state => state.uiState.goToUnit);
  const [gotoMode, setGotoMode] = useState<boolean>(false);
  const [gotoUnit, setGotoUnit] = useState<Unit | null>(null);
  const [unitPaths, setUnitPaths] = useState<Map<string, UnitPathStep[]>>(new Map());
  const [reachableTiles, setReachableTiles] = useState<Map<string, number>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const needsRender = useRef<boolean>(true);
  const cameraPanRafRef = useRef<number | null>(null);
  const lastGameState = useRef<Record<string, unknown> | null>(null);
  const animationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRenderedRef = useRef<boolean>(false);
  const terrainRebuildNeededRef = useRef<boolean>(false);
  // Tracks whether the starting settler has already been auto-selected for the
  // current game. Prevents the "select starting settler" effect from re-running
  // on every `units` change (load, unit movement, turn processing).
  const initialSettlerSelectionDoneRef = useRef<boolean>(false);
  const [texturesLoaded, setTexturesLoaded] = useState(false);

  // ---- Touch / gesture state (mobile support) ----
  const touchStartRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const lastTouchEndRef = useRef<number>(0);
  const TOUCH_TAP_SLOP = 10;
  const LONG_PRESS_MS = 500;
  const DOUBLE_TAP_MS = 300;

  // Trigger re-render when game state changes (turn-based optimization)
  const triggerRender = useCallback(() => {
    needsRender.current = true;
    staticRenderedRef.current = false;
  }, []);

  // Sync local GoTo state with store to ensure UI cursor updates correctly
  useEffect(() => {
    setGotoMode(!!storeGotoMode);
    if (storeGotoUnitId) {
      const unit = units.find(u => u.id === storeGotoUnitId) || null;
      setGotoUnit(unit);
    } else {
      setGotoUnit(null);
    }
  }, [storeGotoMode, storeGotoUnitId, units]);

  // Check if game state has changed significantly
  const hasGameStateChanged = useCallback(() => {
    const currentState = {
      activePlayer: gameState.activePlayer,
      currentTurn: gameState.currentTurn,
      units: units.length,
      cities: cities.length,
      selectedHex: selectedHex ? `${selectedHex.col},${selectedHex.row}` : null,
      selectedCity: gameState.selectedCity || null,
      selectedUnit: gameState.selectedUnit || null,
      reachableTilesSize: reachableTiles.size,
      cameraX: Math.round(camera.x),
      cameraY: Math.round(camera.y),
      cameraZoom: camera.zoom
    };

    if (!lastGameState.current) {
      lastGameState.current = currentState;
      return true;
    }

    // Compare each property individually to avoid expensive JSON.stringify
    const changed = currentState.activePlayer !== lastGameState.current.activePlayer ||
                    currentState.currentTurn !== lastGameState.current.currentTurn ||
                    currentState.units !== lastGameState.current.units ||
                    currentState.cities !== lastGameState.current.cities ||
                    currentState.selectedHex !== lastGameState.current.selectedHex ||
                    currentState.selectedCity !== lastGameState.current.selectedCity ||
                    currentState.selectedUnit !== lastGameState.current.selectedUnit ||
                    currentState.reachableTilesSize !== lastGameState.current.reachableTilesSize ||
                    currentState.cameraX !== lastGameState.current.cameraX ||
                    currentState.cameraY !== lastGameState.current.cameraY ||
                    currentState.cameraZoom !== lastGameState.current.cameraZoom;

    if (changed) {
      lastGameState.current = currentState;
      return true;
    }
    return false;
  }, [camera, cities.length, gameState.activePlayer, gameState.currentTurn, gameState.selectedCity, gameState.selectedUnit, reachableTiles.size, selectedHex, units.length]);

  /** Build a cheap hash of terrain types + exploration (not visibility). */
  const hashTerrainTypes = useCallback((grid: TerrainRenderGrid): string => {
    let h = 0;
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const t = row[c];
        if (!t) continue;
        // Simple hash: type char codes + explored flag
        const s = t.type + (t.explored ? '1' : '0');
        for (let i = 0; i < s.length; i++) {
          h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
      }
    }
    return String(h);
  }, []);

  const renderTerrainToOffscreen = useCallback((terrainGrid: TerrainRenderGrid | null) => {
    if (!terrainGrid || !mapData) return;
    const offscreenCanvas = terrainCanvasRef.current;
    const baseCanvas = terrainBaseCanvasRef.current;
    if (!offscreenCanvas || !baseCanvas) return;

    const mr = mapRendererRef.current;
    const newHash = hashTerrainTypes(terrainGrid);
    const typesChanged = newHash !== terrainTypesHashRef.current;

    if (typesChanged) {
      // Expensive path: terrain types or exploration changed — rebuild base
      terrainTypesHashRef.current = newHash;
      mr.renderTerrainBase({ offscreenCanvas: baseCanvas, map: mapData, terrainGrid });
    }

    // Always composite: base canvas + fog overlay (cheap)
    const mapWidth  = mapData.width  * (TILE_SIZE * 2);
    const mapHeight = mapData.height * (TILE_SIZE * 2);
    if (offscreenCanvas.width !== mapWidth || offscreenCanvas.height !== mapHeight) {
      offscreenCanvas.width  = mapWidth;
      offscreenCanvas.height = mapHeight;
    }
    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, mapWidth, mapHeight);
    ctx.drawImage(baseCanvas, 0, 0);
    mr.renderFogOverlay(ctx, mapData, terrainGrid);
  }, [mapData, hashTerrainTypes]);

  useEffect(() => {
    if (!terrainCanvasRef.current && typeof document !== 'undefined') {
      terrainCanvasRef.current = document.createElement('canvas');
    }
    if (!terrainBaseCanvasRef.current && typeof document !== 'undefined') {
      terrainBaseCanvasRef.current = document.createElement('canvas');
    }
    if (!animationCanvasRef.current && typeof document !== 'undefined') {
      animationCanvasRef.current = document.createElement('canvas');
    }
    // Initialize texture manager once and attach to renderer
    if (!textureManagerRef.current) {
      const tm = new TerrainTextureManager(() => {
        // Textures finished loading — force base canvas rebuild and re-render
        terrainTypesHashRef.current = '';  // invalidate cached base
        terrainRebuildNeededRef.current = true;
        needsRender.current = true;
        staticRenderedRef.current = false;
        setTexturesLoaded(true);
      });
      textureManagerRef.current = tm;
      mapRendererRef.current.textureManager = tm;
    }
  }, []);

  const createTerrainGrid = useCallback((
    tiles: Array<{ type?: string; resource?: string; improvement?: string; visible?: boolean; explored?: boolean; hasRoad?: boolean; hasRiver?: boolean; village?: boolean }> | undefined,
    width: number,
    height: number,
    visibility?: boolean[],
    revealed?: boolean[]
  ): TerrainRenderGrid => {
    const grid: TerrainRenderGrid = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
    if (!tiles) {
      return grid;
    }

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        const tile = tiles[idx];
        if (!tile) continue;
        grid[row][col] = {
          type: tile.type,
          resource: tile.resource ?? null,
          improvement: tile.improvement ?? null,
          visible: visibility?.[idx] ?? tile.visible ?? false,
          explored: revealed?.[idx] ?? tile.explored ?? false,
          hasRoad: tile.hasRoad ?? false,
          hasRiver: tile.hasRiver ?? false,
          village: tile.village ?? false
        };
      }
    }

    return grid;
  }, []);

  useEffect(() => {
    if (!mapData?.width || !mapData?.height) {
      return;
    }

    const totalTiles = mapData.width * mapData.height;

    if (Array.isArray(mapData.tiles) && mapData.tiles.length === totalTiles) {
      const terrainGrid = createTerrainGrid(mapData.tiles, mapData.width, mapData.height, mapData.visibility, mapData.revealed);
      setTerrain(terrainGrid);
      renderTerrainToOffscreen(terrainGrid);
      return;
    }

    const engineTiles = gameEngine?.map?.tiles;
    if (Array.isArray(engineTiles) && engineTiles.length >= totalTiles) {
      const terrainGrid = createTerrainGrid(engineTiles, mapData.width, mapData.height, mapData.visibility, mapData.revealed);
      setTerrain(terrainGrid);
      renderTerrainToOffscreen(terrainGrid);
      return;
    }

    if (!terrain) {
      const generatedTerrain = MapRenderer.generateFallbackTerrain(mapData.width || 20, mapData.height || 20);
      setTerrain(generatedTerrain);
      renderTerrainToOffscreen(generatedTerrain);
    }
  }, [createTerrainGrid, gameEngine, mapData.height, mapData.revealed, mapData.tiles, mapData.visibility, mapData.width, renderTerrainToOffscreen]);

  // Note: Improvements (roads, etc.) are now rendered directly from mapData.tiles
  // in MapRenderer.drawDynamicContent, so we don't need to update the terrain grid
  // or re-render the offscreen canvas when improvements change. This avoids
  // expensive re-renders and prevents infinite loops.

  // Update terrain visibility when game state changes
  useEffect(() => {
    console.log('[GameCanvas] Updating terrain visibility', {
      hasTerrain: !!terrain,
      hasVisibility: !!mapData.visibility,
      hasRevealed: !!mapData.revealed,
      visibilityLength: mapData.visibility?.length || 0,
      revealedLength: mapData.revealed?.length || 0,
      visibilityTrueCount: mapData.visibility?.filter(v => v).length || 0,
      revealedTrueCount: mapData.revealed?.filter(r => r).length || 0
    });

    // Defensive check: ensure terrain grid matches map dimensions
    const ensureTerrainMatchesMap = () => {
      if (!terrain) return false;
      if (!mapData || !mapData.width || !mapData.height) return false;
      if (terrain.length !== mapData.height) return false;
      for (let r = 0; r < mapData.height; r++) {
        if (!terrain[r] || terrain[r].length !== mapData.width) return false;
      }
      return true;
    };

    // Track current terrain (either existing or newly rebuilt)
    let currentTerrain = terrain;

    if (!ensureTerrainMatchesMap()) {
      console.warn('[GameCanvas] Terrain grid mismatch detected. Rebuilding terrain from mapData.tiles');
      // Rebuild terrain synchronously from mapData.tiles (best-effort)
      if (mapData && Array.isArray(mapData.tiles) && mapData.tiles.length === mapData.width * mapData.height) {
        const rebuilt = new Array(mapData.height);
        for (let row = 0; row < mapData.height; row++) {
          rebuilt[row] = new Array(mapData.width);
          for (let col = 0; col < mapData.width; col++) {
            const idx = row * mapData.width + col;
            const tile = mapData.tiles[idx] as { type?: string; resource?: string; improvement?: string; visible?: boolean; explored?: boolean } || {};
            rebuilt[row][col] = {
              type: tile.type || 'OCEAN',
              resource: tile.resource ?? null,
              improvement: tile.improvement ?? null,
              visible: mapData.visibility?.[idx] ?? tile.visible ?? false,
              explored: mapData.revealed?.[idx] ?? tile.explored ?? false
            };
          }
        }
        // Use rebuilt terrain immediately
        currentTerrain = rebuilt;
        setTerrain(rebuilt);
        console.log('[GameCanvas] Terrain rebuilt from mapData');
      } else {
        console.warn('[GameCanvas] Cannot rebuild terrain: invalid mapData.tiles length');
      }
    }

    // Update visibility using current terrain (either existing or just rebuilt)
    if (currentTerrain && mapData.visibility && mapData.revealed) {
      // Update visibility without recreating the entire grid
      const updatedTerrain = [...currentTerrain];
      for (let row = 0; row < mapData.height; row++) {
        if (!updatedTerrain[row]) updatedTerrain[row] = [];
        for (let col = 0; col < mapData.width; col++) {
          const tileIndex = row * mapData.width + col;
          if (updatedTerrain[row][col]) {
            updatedTerrain[row][col] = {
              ...updatedTerrain[row][col],
              visible: mapData.visibility[tileIndex] || false,
              explored: mapData.revealed[tileIndex] || false
            };
          }
        }
      }
      // Always update terrain visibility - don't use expensive JSON comparison
      renderTerrainToOffscreen(updatedTerrain);
      setTerrain(updatedTerrain);
      console.log('[GameCanvas] Terrain visibility updated');
    } else {
      console.log('[GameCanvas] Skipping terrain visibility update - missing data');
    }
  }, [mapData.visibility, mapData.revealed, mapData.height, mapData.width, mapData.tiles]);

  // Select player's starting settler when a game starts.
  // This runs ONLY once per new game. Without the guard it re-fires on every
  // `units` change (loading a save, each unit move, turn processing), which
  // re-selects the starting settler mid-game and overrides the unit-turn-queue's
  // correct selection while the camera stays on the queue unit — the
  // "settler is selected but the camera moves to another unit" bug.
  useEffect(() => {
    // Reset the one-time flag whenever no game is active (fresh game / quit),
    // so a newly started game can re-run the initial settler selection.
    if (!gameState.isGameStarted) {
      initialSettlerSelectionDoneRef.current = false;
      return;
    }
    // Only auto-select the starting settler once, and only on the first turn of
    // a game. Loading a mid-game save (currentTurn > 1) must NOT re-select the
    // settler — the unit-turn-queue owns unit selection from then on.
    if (initialSettlerSelectionDoneRef.current || gameState.currentTurn !== 1) {
      return;
    }
    if (units && units.length > 0) {
      const playerSettler = units.find(u => u.civilizationId === 0 && u.type === 'settler');
      if (playerSettler) {
        initialSettlerSelectionDoneRef.current = true;
        setSelectedHex({ col: playerSettler.col, row: playerSettler.row });
        // Also select the unit in the store
        if (actions && typeof actions.selectUnit === 'function') {
          actions.selectUnit(playerSettler.id);
        }
        // Auto-enter GoTo mode if unit has moves. Sync the store as well so the
        // store->local effect keeps both in agreement (otherwise the cursor can
        // stay stuck as "crosshair" when the goto is later cleared).
        if ((playerSettler.movesRemaining || 0) > 0) {
          setGotoMode(true);
          setGotoUnit(playerSettler);
          if (actions?.setGoToMode) {
            actions.setGoToMode(true, playerSettler.id);
          }
          if (actions?.addNotification) {
            actions.addNotification({
              type: 'info',
              message: `Click destination for ${playerSettler.type} to go to`
            });
          }
        }
        // Calculate reachable tiles for initial blue marking
        if (mapData && terrain) {
          const getTileAt = (col: number, row: number) => {
            if (row < 0 || row >= mapData.height || col < 0 || col >= mapData.width) {
              return null;
            }
            const tileIndex = row * mapData.width + col;
            return mapData.tiles?.[tileIndex] || null;
          };
          
          const reachable = Pathfinding.getReachableTiles(
            playerSettler.col,
            playerSettler.row,
            playerSettler.movesRemaining || 0,
            getTileAt,
            playerSettler.type,
            mapData.width,
            mapData.height,
            playerSettler
          );
          
          setReachableTiles(reachable);
        }
      }
    }
  }, [units, gameState.isGameStarted, gameState.currentTurn, actions, mapData, terrain]);

  // Focus the canvas when game engine is available for keyboard controls
  useEffect(() => {
    if (gameEngine && canvasRef.current && !minimap) {
      canvasRef.current.focus();
    }
  }, [gameEngine, minimap]);

  // Keyboard event handler for unit actions using KeyboardHandler class
  useEffect(() => {
    if (minimap) {
      console.log('[GameCanvas] Skipping keyboard handler - minimap mode');
      return;
    }

    if (!gameEngine || !actions) {
      console.log('[GameCanvas] Skipping keyboard handler - no gameEngine or actions');
      return;
    }

    console.log('[GameCanvas] Creating KeyboardHandler');

    const keyboardHandler = new KeyboardHandler(
      gameEngine,
      actions,
      () => {
        const selectedUnitId = gameState?.selectedUnit;
        return selectedUnitId ? units.find(u => u.id === selectedUnitId) || null : null;
      },
      () => getAllUnitsFromEngine(),
      () => minimap
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore unit-action keys while the game is paused.
      if (useGameStore.getState().uiState.activeDialog === 'pause') {
        return;
      }
      const handled = keyboardHandler.handleKeyDown(event);
      if (handled) {
        triggerRender();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      keyboardHandler.dispose();
    };
  }, [gameState?.selectedUnit, units, currentPlayer, minimap, gameEngine, actions, triggerRender]);

  // Sync unit paths from RoundManager when turn changes
  useEffect(() => {
    const roundManager = gameEngine?.roundManager;
    if (roundManager && typeof roundManager.getAllUnitPaths === 'function') {
      console.log('[GameCanvas] Syncing unit paths from RoundManager on turn change');
      const paths = roundManager.getAllUnitPaths();
      if (paths instanceof Map) {
        setUnitPaths(paths as Map<string, UnitPathStep[]>);
      }
    }
  }, [gameState.currentTurn, gameEngine]);

  // Calculate reachable tiles when selected unit changes
  useEffect(() => {
    const selectedUnitId = gameState.selectedUnit;
    
    // Clear reachable tiles if no unit selected or not human player's turn
    if (!selectedUnitId || gameState.activePlayer !== 0) {
      setReachableTiles(new Map());
      return;
    }
    
    // Find the selected unit
    const selectedUnit = units.find(u => u.id === selectedUnitId);
    if (!selectedUnit || selectedUnit.civilizationId !== 0) {
      // Only show for human player (civilization 0)
      setReachableTiles(new Map());
      return;
    }
    
    // Calculate reachable tiles
    if (mapData && terrain) {
      const getTileAt = (col: number, row: number) => {
        if (row < 0 || row >= mapData.height || col < 0 || col >= mapData.width) {
          return null;
        }
        const tileIndex = row * mapData.width + col;
        return mapData.tiles?.[tileIndex] || null;
      };
      
      const reachable = Pathfinding.getReachableTiles(
        selectedUnit.col,
        selectedUnit.row,
        selectedUnit.movesRemaining || 0,
        getTileAt,
        selectedUnit.type,
        mapData.width,
        mapData.height,
        selectedUnit
      );
      
      setReachableTiles(reachable);
    }
  }, [gameState.selectedUnit, gameState.activePlayer, units, mapData, terrain]);

  const squareToScreen = useCallback((col: number, row: number): { x: number; y: number } => {
    // Return the center of the tile, not the top-left corner
    const x = ((col + 0.5) * TILE_SIZE - camera.x) * camera.zoom;
    const y = ((row + 0.5) * TILE_SIZE - camera.y) * camera.zoom;
    return { x, y };
  }, [camera.x, camera.y, camera.zoom]);

  const screenToSquare = useCallback((screenX: number, screenY: number): HexCoordinates => {
    // Adjust for camera position and zoom
    const worldX = (screenX / camera.zoom) + camera.x;
    const worldY = (screenY / camera.zoom) + camera.y;

    // Simple square coordinate conversion - use floor so clicks map
    // to the tile that contains the point (avoid rounding at corners)
    let col = Math.floor(worldX / TILE_SIZE);
    let row = Math.floor(worldY / TILE_SIZE);

    // Clamp to map bounds
    col = Math.max(0, Math.min(mapData.width - 1, col));
    row = Math.max(0, Math.min(mapData.height - 1, row));

    return { col, row };
  }, [camera.x, camera.y, camera.zoom, mapData.height, mapData.width]);

  // Helper accessors: support multiple engine shapes (engine.getUnitAt or engine.map.getUnitAt or fallback to engine.units[])
  const getUnitAtFromEngine = (col: number, row: number): Unit | null => {
    if (!gameEngine) return null;
    try {
      if (typeof gameEngine.getUnitAt === 'function') return gameEngine.getUnitAt(col, row);
      const mapObj = gameEngine.map as { getUnitAt?: (c: number, r: number) => Unit | null } | null;
      if (mapObj && typeof mapObj.getUnitAt === 'function') return mapObj.getUnitAt(col, row);
      const unitsArr = gameEngine.units;
      if (Array.isArray(unitsArr)) return unitsArr.find((u: Unit) => u && u.col === col && u.row === row) || null;
    } catch (err) {
      console.error('[GameCanvas] getUnitAtFromEngine error', err);
    }
    return null;
  };

  const getCityAtFromEngine = (col: number, row: number): City | null => {
    if (!gameEngine) return null;
    try {
      if (typeof gameEngine.getCityAt === 'function') return gameEngine.getCityAt(col, row);
      const mapObj = gameEngine.map as { getCityAt?: (c: number, r: number) => City | null } | null;
      if (mapObj && typeof mapObj.getCityAt === 'function') return mapObj.getCityAt(col, row);
      const citiesArr = gameEngine.cities;
      if (Array.isArray(citiesArr)) return citiesArr.find((c: City) => c && c.col === col && c.row === row) || null;
    } catch (err) {
      console.error('[GameCanvas] getCityAtFromEngine error', err);
    }
    return null;
  };

  const getAllUnitsFromEngine = (): Unit[] => {
    if (!gameEngine) return [];
    try {
      if (typeof gameEngine.getAllUnits === 'function') return gameEngine.getAllUnits();
      const unitsArr = gameEngine.units;
      if (Array.isArray(unitsArr)) return unitsArr;
      const mapObj = gameEngine.map as { getAllUnits?: () => Unit[] } | null;
      if (mapObj && typeof mapObj.getAllUnits === 'function') return mapObj.getAllUnits();
    } catch (err) {
      console.error('[GameCanvas] getAllUnitsFromEngine error', err);
    }
    return [];
  };

  const getAllCitiesFromEngine = (): City[] => {
    if (!gameEngine) return [];
    try {
      if (typeof gameEngine.getAllCities === 'function') return gameEngine.getAllCities();
      const citiesArr = gameEngine.cities;
      if (Array.isArray(citiesArr)) return citiesArr;
      const mapObj = gameEngine.map as { getAllCities?: () => City[] } | null;
      if (mapObj && typeof mapObj.getAllCities === 'function') return mapObj.getAllCities();
    } catch (err) {
      console.error('[GameCanvas] getAllCitiesFromEngine error', err);
    }
    return [];
  };

  // Compute reachable tiles for a given unit and update local state
  const computeReachableForUnit = useCallback((unit: Unit | null) => {
    if (!unit || !mapData || !terrain) {
      setReachableTiles(new Map());
      return;
    }

    const getTileAt = (col: number, row: number) => {
      if (row < 0 || row >= mapData.height || col < 0 || col >= mapData.width) {
        return null;
      }
      const tileIndex = row * mapData.width + col;
      return mapData.tiles?.[tileIndex] || null;
    };

    try {
      const reachable = Pathfinding.getReachableTiles(
        unit.col,
        unit.row,
        unit.movesRemaining || 0,
        getTileAt,
        unit.type,
        mapData.width,
        mapData.height,
        unit
      );
      setReachableTiles(reachable);
    } catch (e) {
      console.error('[GameCanvas] computeReachableForUnit error', e);
      setReachableTiles(new Map());
    }
  }, [mapData, terrain]);

  const renderStaticContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Rebuild offscreen terrain canvas if textures just loaded
    if (terrainRebuildNeededRef.current) {
      terrainRebuildNeededRef.current = false;
      renderTerrainToOffscreen(terrain);
    }

    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    if (minimap) {
      miniMapRendererRef.current.renderMinimap({
        ctx,
        map: mapData as MapState,
        cssWidth: rect.width,
        cssHeight: rect.height,
        camera,
        units,
        cities,
        civilizations
      });
      return;
    }

    // Render static content (terrain, cities, units without animation)
    mapRendererRef.current.renderStaticFrame({
      ctx,
      canvas,
      map: mapData as MapState,
      terrainGrid: terrain,
      camera,
      selectedHex,
      gameState: gameState as GameState,
      units,
      cities,
      civilizations,
      unitPaths,
      offscreenCanvas: terrainCanvasRef.current,
      squareToScreen,
      cameraZoom: camera.zoom,
      reachableTiles,
      combatAnimations,
      movementAnimations
    });

    // Save the static content to animation canvas for efficient restoration
    if (animationCanvasRef.current) {
      const animCanvas = animationCanvasRef.current;
      if (animCanvas.width !== canvas.width || animCanvas.height !== canvas.height) {
        animCanvas.width = canvas.width;
        animCanvas.height = canvas.height;
      }
      const animCtx = animCanvas.getContext('2d');
      if (animCtx) {
        animCtx.clearRect(0, 0, animCanvas.width, animCanvas.height);
        animCtx.drawImage(canvas, 0, 0);
      }
    }

    staticRenderedRef.current = true;
    // console.log('[GameCanvas] Static content rendered and saved');
  }, [camera, canvasRef, civilizations, cities, combatAnimations, gameState, mapData, minimap, squareToScreen, selectedHex, terrain, unitPaths, units, texturesLoaded, renderTerrainToOffscreen, movementAnimations]);

  const renderAnimationLayer = useCallback((currentTime: number) => {
    if (!canvasRef.current || !animationCanvasRef.current) return;

    const canvas = canvasRef.current;
    const animCanvas = animationCanvasRef.current;
    const mainCtx = canvas.getContext('2d');
    if (!mainCtx || !staticRenderedRef.current) return;

    // Get units that need animation
    const activePlayerUnits = units.filter(u => 
      u.civilizationId === gameState.activePlayer && 
      (u.movesRemaining || 0) > 0
    );

    if (activePlayerUnits.length === 0) return;

    // Instead of redrawing the entire canvas, only update the unit regions
    // Calculate the size of unit circles
    const unitRadius = Math.round(20 * camera.zoom * 1.2); // Add margin for glow

    activePlayerUnits.forEach(unit => {
      const displayTile = getUnitDisplayTile(unit, movementAnimations);
      const { x, y } = squareToScreen(displayTile.col, displayTile.row);
      
      // Only restore and redraw this specific region
      const regionSize = unitRadius * 2;
      const regionX = x - unitRadius;
      const regionY = y - unitRadius;

      // Restore static content for this unit's region only
      mainCtx.drawImage(
        animCanvas,
        regionX, regionY, regionSize, regionSize,
        regionX, regionY, regionSize, regionSize
      );
    });

    // Draw only pulsing units on top (in their small regions)
    mapRendererRef.current.renderPulsingUnits({
      ctx: mainCtx,
      map: mapData as MapState,
      units,
      gameState: gameState as GameState,
      civilizations,
      currentTime,
      squareToScreen,
      cameraZoom: camera.zoom,
      currentQueueUnitId: currentQueueUnitId ?? undefined,
      combatAnimations,
      movementAnimations
    });
  }, [camera.zoom, civilizations, combatAnimations, currentQueueUnitId, gameState, mapData, movementAnimations, squareToScreen, units]);

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Cancel any in-progress camera pan when the user interacts directly.
    if (cameraPanRafRef.current) {
      cancelAnimationFrame(cameraPanRafRef.current);
      cameraPanRafRef.current = null;
    }
    actions.clearCameraPanRequest();

    // Only the primary (left) button starts a drag-pan. Right/middle clicks
    // open the context menu instead — starting a drag for them would leave
    // `isDragging` stuck as true (the context menu's backdrop swallows the
    // matching mouseup), fixating the cursor on the "grabbing" hand.
    if (e.button !== 0) {
      return;
    }
    // Don't allow dragging in Go To mode
    if (gotoMode) {
      return;
    }
    
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
    triggerRender(); // Immediate render for visual feedback
  };

  // Always show context menu when mouse is over a player unit
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging && !gotoMode) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      actions.updateCamera({
        x: camera.x - dx / camera.zoom,
        y: camera.y - dy / camera.zoom
      });
      setLastMousePos({ x: e.clientX, y: e.clientY });
      // Camera changes will trigger render via useEffect
      return;
    }

    // Removed hover functionality for context menu
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    triggerRender(); // Render to update cursor state
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Minimap click - jump to location
      if (minimap) {
        const canvas = canvasRef.current;
        const tileWidth = canvas.width / mapData.width;
        const tileHeight = canvas.height / mapData.height;
        
        const clickedCol = Math.floor(x / tileWidth);
        const clickedRow = Math.floor(y / tileHeight);
        
        console.log(`[CLICK] Minimap click at (${clickedCol}, ${clickedRow})`);
        
        // Center camera on clicked position
        actions.updateCamera({
          x: clickedCol * TILE_SIZE - (canvas.width / camera.zoom) / 2,
          y: clickedRow * TILE_SIZE - (canvas.height / camera.zoom) / 2
        });
      } else {
        const hex = screenToSquare(x, y);

        // Check if clicking on the currently selected unit - deselect it
        const currentSelectedUnitId = gameState.selectedUnit;
        const currentSelectedUnit = currentSelectedUnitId ? units.find(u => u.id === currentSelectedUnitId) : null;
        
        if (currentSelectedUnit && currentSelectedUnit.col === hex.col && currentSelectedUnit.row === hex.row) {
           console.log(`[CLICK] Clicked on currently selected unit - deselecting`);
           if (actions && typeof actions.selectUnit === 'function') {
             actions.selectUnit(null);
           }
           setGotoMode(false);
           setGotoUnit(null);
           setSelectedHex({ col: -1, row: -1 });
           setReachableTiles(new Map());
           triggerRender();
           return;
        }
        
        // Check if clicking on already selected hex - deselect everything
        if (selectedHex.col === hex.col && selectedHex.row === hex.row) {
          console.log(`[CLICK] Deselecting selected hex (${hex.col}, ${hex.row})`);
          if (actions && typeof actions.selectUnit === 'function') {
            actions.selectUnit(null);
          }
          if (actions && typeof actions.selectCity === 'function') {
            actions.selectCity(null);
          }
          setSelectedHex({ col: -1, row: -1 });
          return;
        }
        
        setSelectedHex(hex);
        setContextMenu(null); // Hide context menu on left click

        console.log(`[CLICK] Map click at hex (${hex.col}, ${hex.row})`);

        // Handle Go To mode
        if (gotoMode && gotoUnit) {
          // Clicking an adjacent enemy unit = attack, not a move order.
          // Handle it directly (moveUnit triggers combat, which auto-declares
          // war) instead of pathfinding onto the enemy tile.
          const destUnit = getUnitAtFromEngine(hex.col, hex.row);
          const adjacent = Math.abs(gotoUnit.col - hex.col) <= 1 && Math.abs(gotoUnit.row - hex.row) <= 1;
          if (destUnit && destUnit.civilizationId !== gotoUnit.civilizationId && adjacent && (gotoUnit.movesRemaining || 0) > 0) {
            console.log(`[CLICK] Attacking enemy ${destUnit.type} at (${hex.col},${hex.row})`);
            gameEngine?.moveUnit?.(gotoUnit.id, hex.col, hex.row);
            setGotoMode(false);
            setGotoUnit(null);
            triggerRender();
            return;
          }

          console.log(`[CLICK] Go To destination set for unit ${gotoUnit.id} to (${hex.col}, ${hex.row})`);
          
          // Use GoToManager to calculate and execute path
          const goToManager = gameEngine?.goToManager;
          if (goToManager) {
            const pathResult = goToManager.calculatePath(
              gotoUnit,
              hex.col,
              hex.row,
              (col: number, row: number) => {
                const tileIndex = row * mapData.width + col;
                return mapData.tiles?.[tileIndex] || null;
              },
              mapData.width,
              mapData.height
            );

            if (pathResult.success && pathResult.path.length > 0) {
              // Set the path using GoToManager
              goToManager.setUnitPath(gotoUnit.id, pathResult.path);
              
              // Update local state for rendering
              setUnitPaths(prev => {
                const next = new Map(prev);
                next.set(gotoUnit.id, pathResult.path);
                return next;
              });

              if (actions?.addNotification) {
                actions.addNotification({
                  type: 'success',
                  message: `${gotoUnit.type} will go to (${hex.col}, ${hex.row})`
                });
              }

              console.log(`[CLICK] Path calculated for unit ${gotoUnit.id}:`, pathResult.path);

              // Execute ALL steps until moves are exhausted using animation
              if (gotoUnit.movesRemaining > 0) {
                console.log(`[CLICK] Starting full path execution for unit ${gotoUnit.id}`);
                triggerRender();
                
                // Execute path with animation, moving until all moves are used
                setTimeout(() => {
                  goToManager.executePathWithAnimation(
                    gotoUnit.id,
                    300,
                    (remainingSteps: number) => {
                      // Update UI after each step
                      const path = goToManager.getUnitPath(gotoUnit.id);
                      setUnitPaths(prev => {
                        const next = new Map(prev);
                        if (path && path.length > 0) {
                          next.set(gotoUnit.id, path);
                        } else {
                          next.delete(gotoUnit.id);
                        }
                        return next;
                      });
                      triggerRender();
                      console.log(`[CLICK] Unit ${gotoUnit.id} continuing, ${remainingSteps} steps remaining`);
                    }
                  ).then(result => {
                    console.log(`[CLICK] Unit ${gotoUnit.id} completed GoTo movement, ${result.stepsCompleted} steps taken`);
                    triggerRender();
                  });
                }, 100);
              } else {
                triggerRender();
              }
            } else {
              if (actions?.addNotification) {
                actions.addNotification({
                  type: 'warning',
                  message: 'Cannot reach destination'
                });
              }
            }
          } else {
            console.error('[CLICK] GoToManager not available');
            if (actions?.addNotification) {
              actions.addNotification({
                type: 'error',
                message: 'GoTo system unavailable'
              });
            }
          }
          
          // Exit Go To mode
          setGotoMode(false);
          setGotoUnit(null);
          return;
        }

        // Select the hex in the global store
        if (actions && typeof actions.selectHex === 'function') {
          actions.selectHex(hex);
        }

        // Check for unit or city at this location
        let unitAt = null;
        let cityAt: { id: string; name: string; civilizationId: number; } | null;
         try {
           unitAt = getUnitAtFromEngine(hex.col, hex.row);
           cityAt = getCityAtFromEngine(hex.col, hex.row);
         } catch {
          unitAt = null;
          cityAt = undefined;
         }

        if (unitAt && currentPlayer && unitAt.civilizationId === currentPlayer.id) {
          console.log(`[CLICK] Selected unit ${unitAt.id} (${unitAt.type}) at (${hex.col}, ${hex.row})`);
          
          // Check if this unit is already selected - if so, deselect it
          const currentlySelectedUnitId = gameState?.selectedUnit;
          if (currentlySelectedUnitId === unitAt.id) {
            console.log(`[CLICK] Deselecting unit ${unitAt.id}`);
            if (actions && typeof actions.selectUnit === 'function') {
              actions.selectUnit(null);
            }
            // Exit GoTo mode when deselecting
            setGotoMode(false);
            setGotoUnit(null);
            return; // Don't proceed with normal selection
          }
          
          if (actions && typeof actions.selectUnit === 'function') {
            actions.selectUnit(unitAt.id);
          }
          
          // Automatically enter GoTo mode when unit is selected
          console.log(`[CLICK] Unit selected, entering GoTo mode`);
          setGotoMode(true);
          setGotoUnit(unitAt);
          // Compute reachable tiles immediately when a unit is selected
          computeReachableForUnit(unitAt);
          if (actions?.addNotification) {
            actions.addNotification({
              type: 'info',
              message: `Click destination for ${unitAt.type} to go to`
            });
          }
          
          // If the unit has a path and moves, continue following using GoToManager
          const goToManager = gameEngine?.goToManager;
          if (goToManager && goToManager.hasPath(unitAt.id) && unitAt.movesRemaining > 0) {
            try {
              const moveResult = goToManager.executeFirstStep(unitAt.id);
              if (moveResult.success) {
                setUnitPaths(prev => {
                  const next = new Map(prev);
                  if (moveResult.remainingPath.length > 0) {
                    next.set(unitAt.id, moveResult.remainingPath);
                  } else {
                    next.delete(unitAt.id);
                  }
                  return next;
                });
                console.log(`[CLICK] Unit ${unitAt.id} continued path, ${moveResult.remainingPath.length} steps remaining`);
              }
            } catch (e) {
              console.log(`[CLICK] Continue path error:`, e);
            }
          }
        } else if (unitAt && !currentPlayer || (unitAt && unitAt.civilizationId !== currentPlayer.id)) {
          // Enemy unit - check if we have a selected unit that can attack
          console.log(`[CLICK] Enemy unit at (${hex.col}, ${hex.row})`);
          const selectedUnitId = gameState?.selectedUnit;
          if (selectedUnitId) {
            const selectedUnit = units.find(u => u.id === selectedUnitId);
            if (selectedUnit && selectedUnit.civilizationId === currentPlayer?.id) {
              // Check if adjacent or use pathfinding to get there and attack
              const isAdjacent = Math.abs(selectedUnit.col - hex.col) <= 1 && Math.abs(selectedUnit.row - hex.row) <= 1;
              
              if (isAdjacent && (selectedUnit.movesRemaining || 0) > 0) {
                console.log(`[CLICK] Adjacent attack - attempting to move/attack`);
                try {
                  // MoveAnimator lunges toward the defender, then commits combat.
                  moveAnimator?.attack(selectedUnit.id, hex.col, hex.row);
                } catch (e) {
                  console.log(`[CLICK] Attack error:`, e);
                }
              } else {
                console.log(`[CLICK] Unit not adjacent to enemy - cannot attack`);
                if (actions?.addNotification) {
                  actions.addNotification({ type: 'warning', message: 'Unit must be adjacent to attack' });
                }
              }
            }
          } else {
            console.log(`[CLICK] No unit selected to attack with`);
          }
        } else if (cityAt) {
          console.log(`[CLICK] Selected city ${cityAt.id} (${cityAt.name}) at (${hex.col}, ${hex.row})`);
          console.log(`[CLICK] City debug - currentPlayer:`, currentPlayer, `cityAt.civilizationId:`, cityAt.civilizationId);
          if (actions && typeof actions.selectCity === 'function') {
            actions.selectCity(cityAt.id);
          }
          // Only open modal for player cities
          console.log(`[CLICK] Modal check - currentPlayer exists:`, !!currentPlayer, `civilizationId match:`, currentPlayer?.id === cityAt.civilizationId, `actions.showDialog exists:`, !!(actions && typeof actions.showDialog === 'function'));
          if (currentPlayer && cityAt.civilizationId === currentPlayer.id && actions && typeof actions.showDialog === 'function') {
            console.log(`[CLICK] Opening city modal for player city`);
            actions.showDialog('city-details');
          } else {
            console.log(`[CLICK] Not opening city modal - condition not met`);
          }
        } else {
          // Check if we have a selected unit and try to move it
          const selectedUnitId = gameState?.selectedUnit;
          if (selectedUnitId) {
            console.log(`[CLICK] Attempting to move selected unit ${selectedUnitId} to (${hex.col}, ${hex.row})`);

            // Find unit object
            const selectedUnit = units.find(u => u.id === selectedUnitId);

            // If we have reachableTiles computed, prefer using it to validate click
            const key = `${hex.col},${hex.row}`;
            const isReachable = reachableTiles && reachableTiles.has(key);

            if (!selectedUnit) {
              console.log('[CLICK] Selected unit not found in units array');
              return;
            }

            if (!isReachable) {
              // Not reachable within current movement points
              console.log('[CLICK] Destination not reachable with current moves');
              if (actions && typeof actions.addNotification === 'function') {
                actions.addNotification({ type: 'warning', message: 'Cannot reach destination with current movement points' });
              }
              return;
            }

            try {
              // Calculate path using Pathfinding
              const pathResult = Pathfinding.findPath(
                selectedUnit.col,
                selectedUnit.row,
                hex.col,
                hex.row,
                (col: number, row: number) => {
                  const tileIndex = row * mapData.width + col;
                  return mapData.tiles?.[tileIndex] || null;
                },
                selectedUnit.type,
                mapData.width,
                mapData.height
              );

              if (pathResult.success && pathResult.path.length > 1) {
                const pathToFollow: UnitPathStep[] = pathResult.path.slice(1).map((step: { col: number; row: number }) => ({ col: step.col, row: step.row }));

                // Use GoToManager to set the path and execute with animation
                const goToManager = gameEngine?.goToManager;
                if (goToManager) {
                  goToManager.setUnitPath(selectedUnit.id, pathToFollow);
                  
                  // Update local state for rendering
                  setUnitPaths(prev => {
                    const next = new Map(prev);
                    next.set(selectedUnit.id, pathToFollow);
                    return next;
                  });

                  if (actions?.addNotification) {
                    actions.addNotification({ 
                      type: 'success', 
                      message: `${selectedUnit.type} will go to (${hex.col}, ${hex.row})` 
                    });
                  }

                  triggerRender();

                  // Then, if unit has moves, start moving along the path using the
                  // deferred-commit MoveAnimator (glide each step, then commit).
                  if (pathToFollow.length > 0 && (selectedUnit.movesRemaining || 0) > 0) {
                    moveAnimator?.moveAlongPath(selectedUnit.id, pathToFollow).then(() => {
                      setUnitPaths(prev => {
                        const next = new Map(prev);
                        next.delete(selectedUnit.id);
                        return next;
                      });
                      triggerRender();
                    });
                  }
                } else {
                  console.error('[CLICK] GoToManager not available, falling back to old method');
                  // Fallback to old method if GoToManager not available
                  setUnitPaths(prev => {
                    const next = new Map(prev);
                    next.set(selectedUnit.id, pathToFollow);
                    return next;
                  });
                  
                  const roundManager = gameEngine?.roundManager;
                  if (roundManager && typeof roundManager.setUnitPath === 'function') {
                    roundManager.setUnitPath(selectedUnit.id, pathToFollow);
                  }
                  
                  if (actions?.addNotification) {
                    actions.addNotification({ 
                      type: 'success', 
                      message: `${selectedUnit.type} will go to (${hex.col}, ${hex.row})` 
                    });
                  }
                  
                  triggerRender();
                }
              } else {
                if (actions?.addNotification) actions.addNotification({ type: 'warning', message: 'Cannot reach destination' });
              }
            } catch (e) {
              console.log(`[CLICK] Pathfinding error:`, e);
              if (actions?.addNotification) actions.addNotification({ type: 'error', message: 'Pathfinding failed' });
            }
          } else {
            console.log(`[CLICK] Empty hex clicked at (${hex.col}, ${hex.row})`);
          }
        }
      }
    }
  };

  const handleRightClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // Right-click never starts a drag — ensure any stale drag state is cleared
    // so the cursor doesn't stay stuck on the "grabbing" hand.
    setIsDragging(false);

    // If in Go To mode, right click exits GoTo mode and deselects unit
    if (gotoMode) {
      console.log('[RightClick] Exiting GoTo mode');
      setGotoMode(false);
      setGotoUnit(null);
      if (actions && typeof actions.selectUnit === 'function') {
        actions.selectUnit(null);
      }
      return;
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hex = screenToSquare(x, y);
    
    if (!terrain) return;

    // Get unit at this location from gameEngine first (most reliable)
    let unitAtHex = null;
    try {
      unitAtHex = getUnitAtFromEngine(hex.col, hex.row);
    } catch (e) {
      console.error('[ContextMenu] Error getting unit from gameEngine:', e);
    }

    // Check if it's a player's unit
    if (!unitAtHex || unitAtHex.civilizationId !== currentPlayer?.id) {
      console.log('[ContextMenu] Not player unit, skipping menu');
      return;
    }

    console.log(`[ContextMenu] Right-clicked player unit ${unitAtHex.id} (${unitAtHex.type})`);

    // Select the unit
    if (actions && typeof actions.selectUnit === 'function') {
      actions.selectUnit(unitAtHex.id);
    }
    // Compute reachable tiles immediately when a unit is selected via right-click
    computeReachableForUnit(unitAtHex);

    // Get city at this location
    let cityAtHex = null;
    try {
      cityAtHex = getCityAtFromEngine(hex.col, hex.row);
    } catch {
      // City not found, that's OK
    }

    const tile = terrain[hex.row]?.[hex.col];

    // Set context menu with the actual unit/city objects
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hex: hex,
      tile: tile,
      unit: unitAtHex,
      city: cityAtHex
    });
  };

  // ---- Touch gestures (mobile) ----
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchLongPress = (clientX: number, clientY: number) => {
    // Reuse the right-click context menu flow for long-press
    handleRightClick({
      clientX,
      clientY,
      preventDefault: () => {},
    } as React.MouseEvent<HTMLCanvasElement>);
  };

  const handleDoubleTap = (clientX: number, clientY: number) => {
    if (gotoMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const newZoom = Math.min(camera.zoom * 1.5, 2.5);
    const worldXBefore = (x / camera.zoom) + camera.x;
    const worldYBefore = (y / camera.zoom) + camera.y;
    const worldXAfter = (x / newZoom) + camera.x;
    const worldYAfter = (y / newZoom) + camera.y;
    actions.updateCamera({
      zoom: newZoom,
      x: camera.x - (worldXAfter - worldXBefore),
      y: camera.y - (worldYAfter - worldYBefore)
    });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touches = e.touches;

    if (touches.length === 1) {
      const t = touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY, id: t.identifier };
      touchMovedRef.current = false;
      pinchStartRef.current = null;
      clearLongPressTimer();

      // Long-press opens the unit context menu
      longPressTimerRef.current = window.setTimeout(() => {
        if (!touchMovedRef.current && touchStartRef.current) {
          if (navigator.vibrate) {
            try { navigator.vibrate(20); } catch { /* unsupported */ }
          }
          handleTouchLongPress(touchStartRef.current.x, touchStartRef.current.y);
          touchMovedRef.current = true; // suppress tap on release
        }
      }, LONG_PRESS_MS);
    } else if (touches.length === 2) {
      // Begin pinch zoom
      clearLongPressTimer();
      touchStartRef.current = null;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      pinchStartRef.current = { distance: Math.hypot(dx, dy), zoom: camera.zoom };
      setIsDragging(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touches = e.touches;

    if (touches.length === 1 && touchStartRef.current) {
      const t = touches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;

      if (Math.abs(dx) > TOUCH_TAP_SLOP || Math.abs(dy) > TOUCH_TAP_SLOP) {
        touchMovedRef.current = true;
        clearLongPressTimer();
      }

      // One-finger pan (skip in Go To mode so taps place the destination)
      if (touchMovedRef.current && !gotoMode) {
        actions.updateCamera({
          x: camera.x - dx / camera.zoom,
          y: camera.y - dy / camera.zoom
        });
        touchStartRef.current = { x: t.clientX, y: t.clientY, id: t.identifier };
      }
    } else if (touches.length === 2 && pinchStartRef.current) {
      clearLongPressTimer();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const scale = distance / pinchStartRef.current.distance;
      const newZoom = Math.max(0.3, Math.min(2.5, pinchStartRef.current.zoom * scale));
      actions.updateCamera({ zoom: newZoom });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    clearLongPressTimer();

    if (e.touches.length === 0) {
      const now = Date.now();
      const wasTap = !!touchStartRef.current && !touchMovedRef.current && !pinchStartRef.current;

      if (wasTap && touchStartRef.current) {
        const { x, y } = touchStartRef.current;
        // Double-tap zoom, otherwise a plain tap acts like a click
        if (now - lastTouchEndRef.current < DOUBLE_TAP_MS) {
          handleDoubleTap(x, y);
          lastTouchEndRef.current = 0;
        } else {
          lastTouchEndRef.current = now;
          handleClick({
            clientX: x,
            clientY: y,
            preventDefault: () => {},
          } as React.MouseEvent<HTMLCanvasElement>);
        }
      }

      touchStartRef.current = null;
      pinchStartRef.current = null;
      touchMovedRef.current = false;
    } else if (e.touches.length === 1) {
      // One finger remains after a pinch — reset the pan base
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY, id: t.identifier };
      touchMovedRef.current = false;
      pinchStartRef.current = null;
    }
  };

  const handleTouchCancel = () => {
    clearLongPressTimer();
    touchStartRef.current = null;
    pinchStartRef.current = null;
    touchMovedRef.current = false;
  };

  /** "Road construction started (2 turns)" — Civ1 multi-turn construction feedback. */
  const buildStartedMessage = (engine: GameEngine, unit: Unit, improvement: string): string => {
    const tile = engine.getTileAt(unit.col, unit.row) as { terrain?: string; type?: string } | undefined;
    const terrain = tile?.terrain || tile?.type || '';
    const turns = engine.improvementBuildTurns?.(improvement, terrain) ?? 1;
    const label = improvement === 'mines' ? 'Mine' : improvement.charAt(0).toUpperCase() + improvement.slice(1);
    return `${label} construction started (${turns} turn${turns > 1 ? 's' : ''})`;
  };

  const executeContextAction = (action: string) => {
    console.log(`[ContextMenu] Executing action: ${action}`, { contextMenu });

    if (!contextMenu) return;

    const unit = contextMenu.unit;
    const city = contextMenu.city;

    switch (action) {
      // ===== UNIT ACTIONS =====
      case 'fortify':
        if (unit && gameEngine?.unitFortify) {
          console.log(`[ContextMenu] Fortifying unit ${unit.id}`);
          gameEngine.unitFortify(unit.id);
          if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
          if (actions?.addNotification) actions.addNotification({
            type: 'success',
            message: `${unit.type} fortified`
          });
        }
        break;

      case 'sleep':
        if (unit && gameEngine) {
          if (unit.isSleeping && gameEngine.unitWake) {
            console.log(`[ContextMenu] Wake action for unit ${unit.id}`);
            gameEngine.unitWake(unit.id);
            if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
            if (actions?.addNotification) actions.addNotification({
              type: 'success',
              message: `${unit.type} woke up`
            });
          } else if (gameEngine.unitSleep) {
            console.log(`[ContextMenu] Sleep action for unit ${unit.id}`);
            gameEngine.unitSleep(unit.id);
            if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
            if (actions?.addNotification) actions.addNotification({
              type: 'success',
              message: `${unit.type} sleeping`
            });
          }
        }
        break;

      case 'skip_turn':
        if (unit && gameEngine?.skipUnit) {
          console.log(`[ContextMenu] Skipping turn for unit ${unit.id}`);
          gameEngine.skipUnit(unit.id);
          if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
          if (actions?.addNotification) actions.addNotification({
            type: 'info',
            message: `${unit.type} turn skipped`
          });
          if (actions?.selectUnit) actions.selectUnit(null);
        }
        break;

      case 'goto':
        if (unit) {
          console.log(`[ContextMenu] Entering Go To mode for unit ${unit.id}`);
          setGotoMode(true);
          setGotoUnit(unit);
          if (actions?.selectUnit) actions.selectUnit(unit.id); // Ensure unit is selected
          // Compute reachable tiles immediately when selected from context menu
          computeReachableForUnit(unit);
          setContextMenu(null); // Close the context menu
          if (actions?.addNotification) actions.addNotification({
            type: 'info',
            message: `Click destination for ${unit.type} to go to`
          });
        }
        break;

      case 'goto_cancel':
        if (unit && gameEngine?.goToManager) {
          console.log(`[ContextMenu] Canceling Go To for unit ${unit.id}`);
          gameEngine.goToManager.clearUnitPath(unit.id);
          
          // Clear the path from local state to remove the rendered GoTo line
          setUnitPaths(prev => {
            const next = new Map(prev);
            next.delete(unit.id);
            return next;
          });
          
          if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
          if (actions?.addNotification) actions.addNotification({
            type: 'info',
            message: `GoTo cancelled for ${unit.type}`
          });
        }
        break;

      case 'found_city':
        if (unit && gameEngine?.foundCityWithSettler) {
          console.log(`[ContextMenu] Found city action for unit ${unit.id}`);
          // The settler is consumed — leave GoTo mode so the cursor isn't left
          // stuck in "crosshair"/drag state with no unit to move.
          if (actions?.setGoToMode) {
            actions.setGoToMode(false, null);
          }
          setGotoMode(false);
          setGotoUnit(null);
          const result = gameEngine.foundCityWithSettler(unit.id);
          if (result) {
            if (actions?.updateCities) actions.updateCities(getAllCitiesFromEngine());
            if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
            if (actions?.updateMap) actions.updateMap(gameEngine.map);
            if (actions?.addNotification) actions.addNotification({
              type: 'success',
              message: 'City founded!'
            });
          } else {
            if (actions?.addNotification) actions.addNotification({
              type: 'warning',
              message: 'Cannot found city here'
            });
          }
        }
        break;

      case 'build_road':
        if (unit && gameEngine?.buildImprovement) {
          console.log(`[ContextMenu] Build road action for unit ${unit.id}`);
          const result = gameEngine.buildImprovement(unit.id, 'road');
          if (result) {
            if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
            if (actions?.updateMap) actions.updateMap(gameEngine.map);
            if (actions?.addNotification) actions.addNotification({
              type: 'success',
              message: buildStartedMessage(gameEngine, unit, 'road'),
            });
          } else {
            if (actions?.addNotification) actions.addNotification({
              type: 'warning',
              message: 'Cannot build road here'
            });
          }
        }
        break;

      case 'build_irrigation':
        if (unit && gameEngine?.buildImprovement) {
          console.log(`[ContextMenu] Build irrigation action for unit ${unit.id}`);
          const result = gameEngine.buildImprovement(unit.id, 'irrigation');
          if (result) {
            if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
            if (actions?.updateMap) actions.updateMap(gameEngine.map);
            if (actions?.addNotification) actions.addNotification({
              type: 'success',
              message: buildStartedMessage(gameEngine, unit, 'irrigation'),
            });
          } else {
            if (actions?.addNotification) actions.addNotification({
              type: 'warning',
              message: 'Cannot build irrigation here'
            });
          }
        }
        break;

      case 'build_mine':
        if (unit && gameEngine?.buildImprovement) {
          console.log(`[ContextMenu] Build mine action for unit ${unit.id}`);
          const result = gameEngine.buildImprovement(unit.id, 'mine');
          if (result) {
            if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
            if (actions?.updateMap) actions.updateMap(gameEngine.map);
            if (actions?.addNotification) actions.addNotification({
              type: 'success',
              message: buildStartedMessage(gameEngine, unit, 'mines'),
            });
          } else {
            if (actions?.addNotification) actions.addNotification({
              type: 'warning',
              message: 'Cannot build mine here'
            });
          }
        }
        break;

      case 'build_railroad':
        if (unit && gameEngine?.buildImprovement) {
          console.log(`[ContextMenu] Build railroad action for unit ${unit.id}`);
          const result = gameEngine.buildImprovement(unit.id, 'railroad');
          if (result) {
            if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
            if (actions?.updateMap) actions.updateMap(gameEngine.map);
            if (actions?.addNotification) actions.addNotification({
              type: 'success',
              message: buildStartedMessage(gameEngine, unit, 'railroad'),
            });
          } else {
            if (actions?.addNotification) actions.addNotification({
              type: 'warning',
              message: 'Cannot build railroad here'
            });
          }
        }
        break;

      // ===== CITY ACTIONS =====
      case 'viewProduction':
        if (city) {
          console.log(`[ContextMenu] View production for city ${city.id}`);
          if (actions?.selectCity) actions.selectCity(city.id);
          if (actions?.showDialog) actions.showDialog('city-production');
        }
        break;

      case 'cityInfo':
        if (city) {
          console.log(`[ContextMenu] View info for city ${city.id}`);
          if (actions?.selectCity) actions.selectCity(city.id);
          if (actions?.showDialog) actions.showDialog('city-details');
        }
        break;

      // ===== DIPLOMAT ACTIONS =====
      case 'diplomat_propose_peace':
      case 'diplomat_propose_alliance':
      case 'diplomat_demand_tribute':
      case 'diplomat_bribe':
      case 'diplomat_gather_intel': {
        if (unit && gameEngine?.getDiplomatActions && gameEngine?.executeDiplomatAction) {
          const diplomatInfo = gameEngine.getDiplomatActions(unit.id);
          if (!diplomatInfo) {
            if (actions?.addNotification) actions.addNotification({
              type: 'warning',
              message: 'No adjacent foreign unit or city for diplomacy'
            });
            break;
          }
          const actionMap: Record<string, string> = {
            diplomat_propose_peace: 'propose_peace',
            diplomat_propose_alliance: 'propose_alliance',
            diplomat_demand_tribute: 'demand_tribute',
            diplomat_bribe: 'bribe_unit',
            diplomat_gather_intel: 'gather_intelligence',
          };
          const result = gameEngine.executeDiplomatAction(unit.id, actionMap[action], diplomatInfo.targetCivId);
          if (actions?.updateUnits) actions.updateUnits(getAllUnitsFromEngine());
          // Civ I behaviour: a diplomat's contact opens the negotiation screen
          // focused on the foreign civ so the player can continue bargaining.
          if (actions?.openDiplomacy && diplomatInfo?.targetCivId != null) {
            actions.openDiplomacy(diplomatInfo.targetCivId);
          }
          if (result?.success) {
            if (result.type === 'intelligence') {
              const r = result.report as Record<string, unknown> | undefined;
              if (actions?.addNotification) {
                actions.addNotification({
                  type: 'info',
                  message: `📜 Intel on ${r?.civName ?? 'Unknown'}: ${r?.numCities ?? '?'} cities, ${r?.numMilitaryUnits ?? '?'} military units, ${r?.gold ?? '?'} gold, researching ${r?.currentResearch ?? 'nothing'}, govt: ${r?.government ?? '?'}, attitude: ${r?.attitude ?? '?'}`
                });
              }
            } else if (result.type === 'proposal') {
              const resp = result.response as Record<string, unknown> | undefined;
              const accepted = resp?.accepted;
              if (actions?.addNotification) actions.addNotification({
                type: accepted ? 'success' : 'warning',
                message: accepted ? `Proposal accepted!` : `Proposal rejected: ${resp?.reason || 'unknown'}`
              });
            } else if (result.type === 'bribe') {
              const resp = result.response as Record<string, unknown> | undefined;
              if (actions?.addNotification) actions.addNotification({
                type: resp?.success ? 'success' : 'warning',
                message: resp?.success ? 'Unit bribed!' : `Bribe failed: ${resp?.reason || 'not enough gold'}`
              });
            }
          } else {
            if (actions?.addNotification) actions.addNotification({
              type: 'warning',
              message: result?.reason || 'Diplomat action failed'
            });
          }
        }
        break;
      }

      // ===== GENERAL ACTIONS =====
      case 'centerView':
        console.log(`[ContextMenu] Centering view on (${contextMenu.hex.col}, ${contextMenu.hex.row})`);
        actions.updateCamera({
          x: contextMenu.hex.col * TILE_SIZE - canvasRef.current.width / (2 * camera.zoom),
          y: contextMenu.hex.row * TILE_SIZE - canvasRef.current.height / (2 * camera.zoom)
        });
        break;

      case 'examineHex':
        console.log(`[ContextMenu] Examining hex (${contextMenu.hex.col}, ${contextMenu.hex.row})`);
        if (onExamineHex) {
          onExamineHex(contextMenu.hex, contextMenu.tile);
        }
        break;

      default:
        console.warn(`[ContextMenu] Unknown action: ${action}`);
    }
    
    setContextMenu(null);
    triggerRender();
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    // Don't allow zooming in Go To mode
    if (gotoMode) {
      return;
    }
    
    // Smoother zoom with smaller increments
    const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.max(0.3, Math.min(2.5, camera.zoom * zoomFactor));
    
    // Get mouse position for zoom centering
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate world position before zoom
    const worldXBefore = (mouseX / camera.zoom) + camera.x;
    const worldYBefore = (mouseY / camera.zoom) + camera.y;
    
    // Calculate world position after zoom
    const worldXAfter = (mouseX / newZoom) + camera.x;
    const worldYAfter = (mouseY / newZoom) + camera.y;
    
    // Adjust camera to keep mouse position stable
    actions.updateCamera({
      zoom: newZoom,
      x: camera.x - (worldXAfter - worldXBefore),
      y: camera.y - (worldYAfter - worldYBefore)
    });
  };

  // Render static content only when needed
  useEffect(() => {
    if (needsRender.current || hasGameStateChanged()) {
      renderStaticContent();
      needsRender.current = false;
    }
  }, [hasGameStateChanged, renderStaticContent]);

  // Separate animation loop only for pulsing units (only runs when needed)
  useEffect(() => {
    if (minimap || !gameState.isGameStarted) return;

    // Check if there are any units that need pulsing animation
    const hasUnitsWithMoves = units.some(u => 
      u.civilizationId === gameState.activePlayer && 
      (u.movesRemaining || 0) > 0
    );

    // Only start animation loop if there are units to animate
    if (!hasUnitsWithMoves) {
      // console.log('[GameCanvas] No units need animation, skipping animation loop');
      return;
    }

    // console.log('[GameCanvas] Starting animation loop for pulsing units');

    let lastAnimTime = 0;
    let lastFPSLog = 0;
    const animFPS = 5; // 5 FPS for pulsing (turn-based game doesn't need high FPS)
    const animInterval = 1000 / animFPS;

    const animate = (currentTime: number) => {
      animationFrameRef.current = requestAnimationFrame(animate);

      // Check if we need to render static content
      if (needsRender.current || hasGameStateChanged()) {
        renderStaticContent();
        needsRender.current = false;
      }

      // Render animation layer for pulsing units
      const elapsed = currentTime - lastAnimTime;
      if (elapsed > animInterval) {
        lastAnimTime = currentTime - (elapsed % animInterval);
        renderAnimationLayer(currentTime);

        if (currentTime - lastFPSLog > 5000) {
          lastFPSLog = currentTime;
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        // console.log('[GameCanvas] Stopped animation loop');
      }
    };
  }, [minimap, gameState.isGameStarted, gameState.activePlayer, units, hasGameStateChanged, renderStaticContent, renderAnimationLayer]);

  // Combat animation loop: while combat animations are active, re-render the
  // static frame at a modest FPS so the cloud shows and the survivor fades in.
  useEffect(() => {
    if (minimap || !gameState.isGameStarted) return;
    if (!combatAnimations || combatAnimations.length === 0) return;

    let raf = 0;
    let last = 0;
    const fps = 30;
    const interval = 1000 / fps;

    const loop = (currentTime: number) => {
      raf = requestAnimationFrame(loop);
      if (currentTime - last < interval) return;
      last = currentTime;
      renderStaticContent();

      // Stop once every animation has fully finished (cloud + death blink).
      const now = performance.now();
      const anyActive = (combatAnimations ?? []).some(a => {
        const totalDuration = a.duration + (a.deathBlinkDuration ?? 1000);
        return now - a.startTime < totalDuration;
      });
      if (!anyActive) {
        cancelAnimationFrame(raf);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [minimap, gameState.isGameStarted, combatAnimations, renderStaticContent]);

  // Movement animation loop: while a unit glide is active, re-render the static
  // frame at ~30 FPS so the interpolated position updates smoothly.
  useEffect(() => {
    if (minimap || !gameState.isGameStarted) return;
    if (!movementAnimations || movementAnimations.length === 0) return;

    let raf = 0;
    let last = 0;
    const fps = 30;
    const interval = 1000 / fps;

    const loop = (currentTime: number) => {
      raf = requestAnimationFrame(loop);
      if (currentTime - last < interval) return;
      last = currentTime;
      renderStaticContent();

      const now = performance.now();
      const anyActive = (movementAnimations ?? []).some(a => now - a.startTime < a.duration);
      if (!anyActive) {
        cancelAnimationFrame(raf);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [minimap, gameState.isGameStarted, movementAnimations, renderStaticContent]);

  // Smooth camera pan: when a focus request arrives, tween camera.x/y toward the
  // centered target tile (scaled by cameraGlideSpeed; instant when disabled).
  useEffect(() => {
    if (minimap || !gameState.isGameStarted) return;
    if (!cameraPanRequest) return;

    const state = useGameStore.getState();
    const cam = state.camera;
    const map = state.map;
    const rect = canvasRef.current?.getBoundingClientRect();
    const viewportWidth = rect?.width ?? window.innerWidth;
    const viewportHeight = rect?.height ?? window.innerHeight;
    const mapWidth = map?.width ?? 0;
    const mapHeight = map?.height ?? 0;
    const target = centerCameraOnTile({
      col: cameraPanRequest.col,
      row: cameraPanRequest.row,
      zoom: cam.zoom,
      viewportWidth,
      viewportHeight,
      mapWidth,
      mapHeight,
    });
    if (!isFinite(target.x) || !isFinite(target.y)) {
      actions.clearCameraPanRequest();
      return;
    }

    const settings = state.settings;
    const duration = !settings.enableAnimations || settings.cameraGlideSpeed <= 0
      ? 0
      : Math.round(400 * settings.cameraGlideSpeed);

    const startX = cam.x;
    const startY = cam.y;

    if (duration <= 0) {
      actions.updateCamera({ x: target.x, y: target.y });
      actions.clearCameraPanRequest();
      return;
    }

    const startTime = performance.now();
    const animate = (now: number) => {
      cameraPanRafRef.current = requestAnimationFrame(animate);
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = MathUtils.fade(t);
      actions.updateCamera({
        x: MathUtils.lerp(startX, target.x, eased),
        y: MathUtils.lerp(startY, target.y, eased),
      });
      if (t >= 1) {
        actions.updateCamera({ x: target.x, y: target.y });
        actions.clearCameraPanRequest();
        cancelAnimationFrame(cameraPanRafRef.current ?? 0);
        cameraPanRafRef.current = null;
      }
    };
    cameraPanRafRef.current = requestAnimationFrame(animate);
    return () => {
      if (cameraPanRafRef.current) cancelAnimationFrame(cameraPanRafRef.current);
      cameraPanRafRef.current = null;
    };
  }, [cameraPanRequest, minimap, gameState.isGameStarted, actions]);

  // Trigger render when camera changes (pan/zoom)
  useEffect(() => {
    // console.log('[GameCanvas] Camera changed, triggering render');
    triggerRender();
  }, [camera.x, camera.y, camera.zoom, triggerRender]);

  // Trigger render when selection changes
  useEffect(() => {
    triggerRender();
  }, [selectedHex, gameState.selectedCity]);

  // Trigger render when terrain changes
  useEffect(() => {
    triggerRender();
  }, [terrain]);

  // Trigger render when game state changes significantly
  useEffect(() => {
    triggerRender();
  }, [gameState.activePlayer, gameState.currentTurn, units.length, cities.length]);

  // Keep the canvas in sync with its container: when the window is resized
  // (desktop) or the layout changes, re-sync the backing store size and redraw
  // so the map is never stretched/blurry or left stale. We call the latest
  // render function directly (via a ref) so a plain CSS resize — which React
  // state doesn't see — still redraws immediately. A lightweight interval
  // covers environments where resize events / ResizeObserver are suppressed.
  const renderStaticRef = useRef<() => void>(() => {});
  useEffect(() => {
    renderStaticRef.current = renderStaticContent;
  }, [renderStaticContent]);

  useEffect(() => {
    if (minimap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Redraw only when the CSS size no longer matches the backing store.
    const check = () => {
      const c = canvasRef.current;
      if (!c) return;
      if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
        renderStaticRef.current();
      }
    };

    // Fast path: real browsers fire these on window/layout changes.
    const ro = new ResizeObserver(check);
    ro.observe(canvas);
    window.addEventListener('resize', check);

    // Reliable fallback (cheap: compares two integers twice a second).
    const interval = window.setInterval(check, 500);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', check);
      ro.disconnect();
    };
  }, [minimap]);


  return (
    <div className="position-relative w-100 h-100">
      <canvas
        ref={canvasRef}
        className="w-100 h-100 game-canvas-input"
        style={{ 
          cursor: minimap ? 'pointer' : 
                  gotoMode ? 'crosshair' : 
                  (isDragging ? 'grabbing' : 'grab'),
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none'
        }}
        tabIndex={minimap ? -1 : 0}
        onMouseDown={minimap ? null : handleMouseDown}
        onMouseMove={minimap ? null : handleMouseMove}
        onMouseUp={minimap ? null : handleMouseUp}
        onMouseLeave={minimap ? null : () => setIsDragging(false)}
        onClick={handleClick}
        onContextMenu={minimap ? null : handleRightClick}
        onWheel={minimap ? null : handleWheel}
        onTouchStart={minimap ? null : handleTouchStart}
        onTouchMove={minimap ? null : handleTouchMove}
        onTouchEnd={minimap ? null : handleTouchEnd}
        onTouchCancel={minimap ? null : handleTouchCancel}
      />
      
      {/* Context Menu (not shown on minimap) */}
      {!minimap && (
        <UnitActionsModal
          contextMenu={contextMenu}
          onExecuteAction={executeContextAction}
          onClose={() => setContextMenu(null)}
          gameEngine={gameEngine}
        />
      )}
    </div>
  );
};

export default GameCanvas;
