import React, { useEffect, useState, useCallback } from 'react';
import { useGameStore } from './stores/GameStore';
import GameEngine from '@/game/engine/GameEngine';
import GameCanvas from './components/game/GameCanvas';
import HexDetailModal from './components/ui/HexDetailModal';
import SettingsModal from './components/ui/SettingsModal';
import GameSetupModal from './components/ui/GameSetupModal';
import EndTurnConfirmModal from './components/ui/EndTurnConfirmModal';
import GameModals from './components/ui/GameModals';
import GameResultOverlay from './components/ui/GameResultOverlay';
import { useGameEngine } from './hooks/UseGameEngine';
import SidePanel from './components/ui/SidePanel';
import {GameUtils} from "@/utils/GameUtils";
import { DomUtils } from '@/utils/DomUtils';
import { enrichMapForExport } from '@/utils/MapExportUtils';
import { preloadAllUnitIcons } from '@/utils/UnitIconLoader';

function App() {
  const gameState = useGameStore(state => state.gameState);
  const actions = useGameStore(state => state.actions);
  const settings = useGameStore(state => state.settings);
  const camera = useGameStore(state => state.camera);
  const gameResult = useGameStore(state => state.gameState.gameResult);
  const setCamera = useGameStore(state => state.actions.updateCamera);
  const [gameEngine, setGameEngine] = useState(null);
  const [error, setError] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [showHexDetail, setShowHexDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGameSetup, setShowGameSetup] = useState(true);
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);
  const [isEndTurnAutomatic, setIsEndTurnAutomatic] = useState(false);
  const [detailHex, setDetailHex] = useState(null);
  const [terrainData, setTerrainData] = useState(null);
  const menuRefs = React.useRef({});

  // Turn flash effect on top bar
  const turnFlashTrigger = useGameStore(state => state.uiState.turnFlashTrigger);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    if (turnFlashTrigger === 0) return;
    setIsFlashing(true);
    const timer = setTimeout(() => setIsFlashing(false), 400);
    return () => clearTimeout(timer);
  }, [turnFlashTrigger]);

  // Simple toast notification (DOM-based for immediate feedback)
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    try {
      const colors: Record<string, string> = {
        success: '#4caf50',
        error: '#f44336',
        warning: '#ff9800',
      };
      const toast = document.createElement('div');
      toast.textContent = message;
      Object.assign(toast.style, {
        position: 'fixed',
        top: '60px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: colors[type] || '#333',
        color: '#fff',
        padding: '12px 24px',
        borderRadius: '4px',
        zIndex: '99999',
        fontFamily: 'monospace',
        fontSize: '14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        opacity: '0',
        transition: 'opacity 0.3s ease',
        maxWidth: '80vw',
        textAlign: 'center' as const,
      });
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; });
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
      }, 3000);
    } catch (e) {
      console.warn('[App] showToast failed:', e);
    }
  };

  // Preload unit icons on mount
  useEffect(() => {
    preloadAllUnitIcons().catch(err => {
      console.warn('Failed to preload some unit icons:', err);
    });
  }, []);

  // Connect game engine to React state management
  useGameEngine(gameEngine);

  // Handle game start with chosen settings
  const handleGameStart = async (gameSettings) => {
    try {
      console.log('Starting new game with settings:', gameSettings);
      setShowGameSetup(false);

      // Update devMode setting if provided
      if (typeof gameSettings.devMode === 'boolean') {
        actions.updateSettings({ devMode: gameSettings.devMode });
        console.log('[App] Developer mode:', gameSettings.devMode);
      }

      const engine = new GameEngine(actions);
      await engine.initialize(gameSettings);

      // Mark the game as started once engine state is ready in the store
      actions.startGame();
      actions.updateGameState({
        mapGenerated: true,
        currentTurn: engine.currentTurn,
        currentYear: engine.currentYear
      });

      setGameEngine(engine);

      // Get player's starting settler position
      const playerSettler = engine.units.find(
        (u) => u.civilizationId === 0 && u.type === 'settler'
      );

      console.log('Game started with units:', engine.units);
      console.log('Player settler at:', playerSettler);

      // Update visibility to apply dev mode fog of war settings
      if (typeof gameSettings.devMode === 'boolean') {
        console.log('[App] Updating visibility after dev mode change');
        actions.updateVisibility();
      }

      // Focus camera on player's starting unit using the store action so the same
      // centering logic is used everywhere (keeps canvas and minimap in sync).
      if (playerSettler) {
        // This will select/focus the next unit for the active player and update camera
        actions.focusOnNextUnit();
      }
      
    } catch (error) {
      console.error('Game start error:', error);
      setError(error.message);
    }
  };

  // Handle end turn confirmation
  const handleEndTurnConfirm = useCallback(() => {
    console.log('[App] End turn confirmed');
    setShowEndTurnConfirm(false);
    setIsEndTurnAutomatic(false);
    
    // Always process the turn when confirmed
    if (gameEngine) {
      console.log('[App] Processing turn via gameEngine.processTurn()');
      gameEngine.processTurn();
    } else {
      console.warn('[App] Cannot process turn - gameEngine is null');
    }
  }, [gameEngine]);

  // Initialize game engine
  useEffect(() => {
    // Game initialization now happens in handleGameStart after setup modal
    // No auto-initialization

    // Listen for end turn confirmation requests (automatic from engine)
    const handleShowEndTurnConfirmation = () => {
      console.log('[App] Received showEndTurnConfirmation event - automatic trigger');
      setIsEndTurnAutomatic(true);
      
      // Get fresh setting value from store to avoid stale closure
      const currentSettings = useGameStore.getState().settings;
      
      // If skipEndTurnConfirmation is enabled, bypass modal and end turn immediately
      if (currentSettings.skipEndTurnConfirmation) {
        console.log('[App] Skipping end turn confirmation modal due to user preference');
        // Directly process turn without showing modal
        if (gameEngine) {
          gameEngine.processTurn();
        }
      } else {
        // Show confirmation modal
        setShowEndTurnConfirm(true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('showEndTurnConfirmation', handleShowEndTurnConfirmation);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('showEndTurnConfirmation', handleShowEndTurnConfirmation);
      }
    };
  }, [handleEndTurnConfirm]);

  // Handle menu actions
  const handleMenuClick = (menu: string, event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    console.log(`[CLICK] Menu click: ${menu}`);
    if (activeMenu === menu) {
      setActiveMenu(null);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom,
        left: rect.left
      });
      setActiveMenu(menu);
    }
  };

  const handleDownloadMap = () => {
    try {
      const map = useGameStore.getState().map;
      const gameStats = useGameStore.getState().gameStats;
      if (!map) {
        console.warn('No map data available to download');
        return;
      }

      const enriched = enrichMapForExport(map);
      const exportObj = {
        meta: {
          width: map.width,
          height: map.height,
          turn: gameStats?.turn ?? gameState.currentTurn
        },
        map: enriched
      };

      const text = JSON.stringify(exportObj, null, 2);
      const filename = `civ1-map-turn-${gameStats?.turn ?? gameState.currentTurn}.json`;
      DomUtils.downloadTextFile(text, filename);
    } catch (e) {
      console.error('handleDownloadMap error', e);
    }
  };

  const handleResultClose = useCallback(() => {
    actions.clearGameResult();
  }, [actions]);

  const handleResultRestart = useCallback(async () => {
    if (!gameEngine) {
      return;
    }
    try {
      await gameEngine.restartCurrentGame();
      actions.clearGameResult();
      setActiveMenu(null);
      setShowHexDetail(false);
      setShowSettings(false);
      setShowEndTurnConfirm(false);
    } catch (err) {
      console.error('[App] Failed to restart game', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [actions, gameEngine]);

  const handleResultQuit = useCallback(() => {
    if (gameEngine) {
      gameEngine.shutdownToMenu();
    }
    actions.clearGameResult();
    actions.resetGameState();
    setActiveMenu(null);
    setShowHexDetail(false);
    setShowSettings(false);
    setShowEndTurnConfirm(false);
    setIsEndTurnAutomatic(false);
    setGameEngine(null);
    setShowGameSetup(true);
  }, [actions, gameEngine]);

  // Handle hex examination (called from canvas)
  const handleExamineHex = (hex, terrain) => {
    setDetailHex(hex);
    setTerrainData(terrain);
    setShowHexDetail(true);
  };

  // Handle new game
  const handleNewGame = () => {
    console.log(`[CLICK] New game button clicked`);
    const confirmed = window.confirm(
      '🏛️ Start a New Game?\n\n' +
      'Are you sure you want to end the current game and start over?\n\n' +
      'All progress will be lost.'
    );
    
    if (confirmed) {
      console.log(`[CLICK] New game confirmed - reloading page`);
      // Reload the page to start fresh
      window.location.reload();
    } else {
      console.log(`[CLICK] New game cancelled`);
    }
  };

  // Handle end turn request - show modal (manual button click)
  const handleEndTurnRequest = useCallback(() => {
    console.log('[App] End turn requested manually - showing confirmation modal');
    setIsEndTurnAutomatic(false);
    
    // Get fresh setting value from store to avoid stale closure
    const currentSettings = useGameStore.getState().settings;
    
    // If skipEndTurnConfirmation is enabled, bypass modal and end turn immediately
    if (currentSettings.skipEndTurnConfirmation) {
      console.log('[App] Skipping end turn confirmation modal due to user preference');
      // Directly process turn without showing modal
      if (gameEngine) {
        gameEngine.processTurn();
      }
    } else {
      // Show confirmation modal
      setShowEndTurnConfirm(true);
    }
  }, [gameEngine]);

  // Handle end turn cancellation
  const handleEndTurnCancel = () => {
    console.log('[App] End turn cancelled');
    setShowEndTurnConfirm(false);
    setIsEndTurnAutomatic(false);
    // Re-enable the turn button since the turn wasn't ended
    actions.setTurnButtonDisabled(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't handle shortcuts if user is typing in an input field
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.contentEditable === 'true') {
        return;
      }

      const { key, shiftKey, ctrlKey, altKey } = event;

      // Prevent default browser behavior for navigation and specific shortcuts only
      // Unit action keys (i, m, b, f, s, g) are now handled in GameCanvas
      const shouldPreventDefault = [
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Enter', ' ', 
        't', 'Escape', 'F1', 'F2', 'F3', 'F4', 'F11'
      ].includes(key) ||
      (ctrlKey && ['1','2','3','4','5','6','7','8','9','s','l','z'].includes(key)) ||
      (key === '+' || key === '-');

      if (shouldPreventDefault) {
        event.preventDefault();
      }

      // Navigation shortcuts
      if (!ctrlKey && !altKey) {
        switch (key) {
          case 'ArrowUp':
            if (shiftKey) {
              // Shift + Arrow: Scroll map
              setCamera({ y: camera.y - 50 });
            } else {
              // Arrow Keys: Move cursor
              if (gameEngine && gameEngine.moveCursor) {
                gameEngine.moveCursor(0, -1);
              }
            }
            break;
          case 'ArrowDown':
            if (shiftKey) {
              setCamera({ y: camera.y + 50 });
            } else {
              if (gameEngine && gameEngine.moveCursor) {
                gameEngine.moveCursor(0, 1);
              }
            }
            break;
          case 'ArrowLeft':
            if (shiftKey) {
              setCamera({ x: camera.x - 50 });
            } else {
              if (gameEngine && gameEngine.moveCursor) {
                gameEngine.moveCursor(-1, 0);
              }
            }
            break;
          case 'ArrowRight':
            if (shiftKey) {
              setCamera({ x: camera.x + 50 });
            } else {
              if (gameEngine && gameEngine.moveCursor) {
                gameEngine.moveCursor(1, 0);
              }
            }
            break;
          case '+':
          case '=':
            // Zoom in
            setCamera({ zoom: Math.min(camera.zoom * 1.2, 3.0) });
            break;
          case '-':
            // Zoom out
            setCamera({ zoom: Math.max(camera.zoom / 1.2, 0.5) });
            break;
        }
      }

      // Action shortcuts
      if (!ctrlKey && !altKey && !shiftKey) {
        switch (key) {
          case 'Enter':
            // End turn
            handleEndTurnRequest();
            break;
          case ' ':
            // Cycle through units in a tile
            if (gameEngine && gameState.selectedUnit) {
              gameEngine.cycleUnitsInTile(gameState.selectedUnit);
            }
            break;
          
          // NOTE: Unit action keys (s, f, g, b, i, m) are now handled in GameCanvas.tsx
          // Keeping only the global UI shortcuts here
          
          /*
          case 's':
          case 'S':
            // Skip current unit's turn - NOW IN GAMECANVAS
            if (gameEngine && gameEngine.skipUnitTurn) {
              gameEngine.skipUnitTurn();
            }
            break;
          case 'f':
          case 'F':
            // Fortify selected unit - NOW IN GAMECANVAS
            if (gameEngine && gameEngine.fortifyUnit) {
              gameEngine.fortifyUnit();
            }
            break;
          */
          case 'r':
          case 'R':
            // Rush production in a city
            {
              const selCity = gameState.selectedCity;
              if (selCity && gameEngine) {
                gameEngine.rushCityProduction(selCity);
              }
            }
            break;
          case 'c':
          case 'C':
            // Center map on selected unit
            {
              const selUnitId = gameState.selectedUnit;
              if (selUnitId && gameEngine) {
                const selUnit = gameEngine.units.find(u => u.id === selUnitId);
                if (selUnit) {
                  const tileSize = 32 * (camera.zoom || 1);
                  setCamera({
                    x: selUnit.col * tileSize - window.innerWidth / 2,
                    y: selUnit.row * tileSize - window.innerHeight / 2,
                  });
                }
              }
            }
            break;
          case 'd':
          case 'D':
            // Open diplomacy report
            actions.showDialog('diplomacy-report');
            break;
          // 'a' key not bound
          case 'w':
          case 'W':
            // Wait (unit stays in place)
            if (gameEngine && gameEngine.waitUnit) {
              gameEngine.waitUnit();
            }
            break;
          /*
          case 'g':
          case 'G':
            // Move unit to specific location (enter goto mode) - NOW IN GAMECANVAS
            if (gameEngine && gameEngine.enterGotoMode) {
              gameEngine.enterGotoMode();
            }
            break;
          case 'b':
          case 'B':
            // Build road - NOW IN GAMECANVAS (handled via buildImprovement)
            if (gameEngine && gameEngine.buildRoad) {
              gameEngine.buildRoad();
            }
            break;
          case 'i':
          case 'I':
            // Irrigate - NOW IN GAMECANVAS (handled via buildImprovement)
            if (gameEngine && gameEngine.irrigage) {
              gameEngine.irrigage();
            }
            break;
          case 'm':
          case 'M':
            // Mine - NOW IN GAMECANVAS (handled via buildImprovement)
            if (gameEngine && gameEngine.mine) {
              gameEngine.mine();
            }
            break;
          */
          case 'p':
          case 'P':
            // Clean pollution with selected unit
            {
              const pUnitId = gameState.selectedUnit;
              if (pUnitId && gameEngine) {
                gameEngine.cleanPollution(pUnitId);
              }
            }
            break;
          case 't':
          case 'T':
            // Open tax/science/luxury slider
            setShowSettings(true);
            break;
          case 'Escape':
            // Cancel action or close menus
            setActiveMenu(null);
            setShowHexDetail(false);
            setShowSettings(false);
            // Deselect unit and exit GoTo mode
            if (actions && typeof actions.selectUnit === 'function') {
              actions.selectUnit(null);
            }
            // Add more modal closures as needed
            break;
          case 'F1':
            // Open help
            actions.showDialog('help');
            break;
          case 'F2':
            // Open tech tree
            actions.showDialog('tech');
            break;
          case 'F3':
            // Open settings
            setShowSettings(true);
            break;
          case 'F4':
            // Open diplomacy report
            actions.showDialog('diplomacy-report');
            break;
          case 'F11':
            // Toggle fullscreen
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
            break;
          // 'h' key not bound
        }
      }

      // Ctrl shortcuts
      if (ctrlKey && !altKey && !shiftKey) {
        switch (key) {
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            // Select specific city
            const cityIndex = parseInt(key) - 1;
            if (gameEngine && gameEngine.selectCityByIndex) {
              gameEngine.selectCityByIndex(cityIndex);
            }
            break;
          case 's':
            // Save game
            if (gameEngine && gameEngine.saveGame) {
              gameEngine.saveGame();
            }
            break;
          case 'l':
            // Load game
            if (gameEngine && gameEngine.loadGame) {
              gameEngine.loadGame();
            }
            break;
          case 'z':
            // Undo last action
            if (gameEngine && gameEngine.undoLastAction) {
              gameEngine.undoLastAction();
            }
            break;
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [gameEngine, camera, setCamera, handleEndTurnRequest, activeMenu, showHexDetail, showSettings]);

  if (error) {
    return (
      <div id="gameContainer" className="vh-100 d-flex align-items-center justify-content-center text-white">
        <div className="text-center">
          <h1>🚨 Game Error</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Show game setup modal before game engine is created
  if (!gameEngine && showGameSetup) {
    return (
      <div id="gameContainer" className="vh-100 d-flex align-items-center justify-content-center text-white">
        <GameSetupModal
          show={showGameSetup}
          onStart={handleGameStart}
        />
      </div>
    );
  }

  // Show loading only during actual initialization
  const isInitializing = !gameEngine && !showGameSetup;

  if (isInitializing) {
    return (
      <div id="gameContainer" className="vh-100 d-flex align-items-center justify-content-center text-white">
        <div className="text-center">
          <div className="spinner-border mb-3"></div>
          <h2>🏛️ Loading Civilization...</h2>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="game-container vh-100 d-flex flex-column text-white" 
      style={{ 
        fontFamily: 'monospace',
        fontSize: `${settings.uiScale}rem`
      }}
    >
      {/* Top Menu Bar */}
      <div 
        className={`game-top-bar border-bottom border-light d-flex${isFlashing ? ' flash' : ''}`} 
        style={{ 
          height: `${48 * settings.uiScale}px`
        }}
      >
        {/* Menu items */}
        <div className="d-flex flex-grow-1 h-100 justify-content-center align-items-center">
          {['GAME', 'WORLD', 'INFO'].map((item) => (
            <button
              key={item}
              ref={(el) => menuRefs.current[item] = el}
              className={`btn px-4 text-white border-0 rounded-0 position-relative d-flex align-items-center justify-content-center ${
                activeMenu === item ? '' : ''
              }`}
              style={{ 
                fontSize: `${settings.menuFontSize * 1.4}px`,
                height: '100%',
                fontWeight: 'bold',
                letterSpacing: '1px',
                background: activeMenu === item 
                  ? '#333333'
                  : 'transparent',
                textShadow: 'none',
                transition: 'all 0.2s ease',
                transform: 'none',
                borderLeft: 'none',
                borderRight: 'none'
              }}
              onMouseEnter={(e) => {
                if (activeMenu !== item) {
                  (e.target as HTMLElement).style.background = '#2a2a2a';
                  (e.target as HTMLElement).style.transform = 'none';
                }
              }}
              onMouseLeave={(e) => {
                if (activeMenu !== item) {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.transform = 'none';
                }
              }}
              onClick={(e) => handleMenuClick(item, e)}
            >
              {item}
              {activeMenu === item && (
                <div 
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: '#ffffff',
                    boxShadow: 'none'
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Right side - Turn info and End Turn button */}
        <div className="d-flex align-items-center ms-auto pe-3">
          <div className="text-white me-3" style={{ fontSize: `${settings.menuFontSize * 1.2}px` }}>
            <span className="me-2">Turn {gameState.currentTurn}</span>
            <span className="text-muted">|</span>
            <span className="ms-2">{GameUtils.formatYear(gameState.currentYear ?? -4000)}</span>
          </div>
          <button
            className="btn btn-success"
            style={{
              fontSize: `${settings.menuFontSize * 1.1}px`,
              padding: '8px 16px',
              fontWeight: 'bold'
            }}
            onClick={handleEndTurnRequest}
          >
            <i className="bi bi-skip-end-fill me-1"></i>
            End Turn
          </button>
        </div>
      </div>

  {/* Main Game Area */}
  <div className="game-area flex-grow-1 d-flex">
  {/* Left Sidebar - use centralized SidePanel component */}
  <div className="game-side-panel" style={{ width: `${settings.sidebarWidth * 2}px` }}>
          <SidePanel gameEngine={gameEngine} />
        </div>

  {/* Main Map Area */}
  <div className="game-canvas flex-grow-1 position-relative">
          <GameCanvas
            onExamineHex={handleExamineHex} 
            gameEngine={gameEngine}
          />
        </div>
  </div>

  {/* Dropdown Menus */}
      {activeMenu && (
        <div 
          className="position-fixed border border-light"
          style={{ 
            top: `${menuPosition.top}px`, 
            left: `${menuPosition.left}px`,
            zIndex: 1000,
            minWidth: '220px',
            background: 'linear-gradient(180deg, #2d3748 0%, #1a202c 100%)',
            boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
            borderRadius: '0 0 8px 8px',
            overflow: 'hidden'
          }}
        >
          {activeMenu === 'GAME' && (
            <div>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #3182ce 0%, #2c5aa0 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={handleNewGame}
              >
                🆕 New Game
              </button>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #3182ce 0%, #2c5aa0 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  if (!gameEngine) {
                    setActiveMenu(null);
                    return;
                  }
                  try {
                    // Get save JSON
                    let json: string | null = null;
                    if (typeof gameEngine.getSaveJSON === 'function') {
                      json = gameEngine.getSaveJSON();
                    } else if (typeof gameEngine.saveGame === 'function') {
                      gameEngine.saveGame();
                      json = localStorage.getItem('civ1_savegame');
                    }
                    if (!json) {
                      showToast('Failed to generate save data', 'error');
                      setActiveMenu(null);
                      return;
                    }
                    // Trigger file download
                    const filename = `civ1-save-turn-${gameState.currentTurn}.json`;
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                    showToast(`Game saved to ${filename}`, 'success');
                  } catch (e) {
                    console.error('[App] Save failed:', e);
                    showToast('Save failed: ' + (e as Error).message, 'error');
                  }
                  setActiveMenu(null);
                }}
              >
                💾 Save Game
              </button>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #3182ce 0%, #2c5aa0 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  if (!gameEngine || typeof gameEngine.loadGame !== 'function') {
                    showToast('Load not available', 'warning');
                    setActiveMenu(null);
                    return;
                  }
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json,application/json';
                  input.style.display = 'none';
                  input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) {
                      setActiveMenu(null);
                      return;
                    }
                    try {
                      const text = await file.text();
                      const saveData = JSON.parse(text);
                      if (!saveData || saveData.version !== 1) {
                        showToast('Invalid or incompatible save file.', 'error');
                        setActiveMenu(null);
                        return;
                      }
                      localStorage.setItem('civ1_savegame', text);
                      const success = await gameEngine.loadGame();
                      if (success) {
                        // Force a full store sync
                        actions.updateMap(gameEngine.map);
                        actions.updateUnits(gameEngine.getAllUnits());
                        actions.updateCities(gameEngine.getAllCities());
                        actions.updateCivilizations(gameEngine.civilizations);
                        actions.updateTechnologies(gameEngine.technologies);
                        actions.updateVisibility();
                        showToast(`Game loaded from ${file.name}`, 'success');
                      } else {
                        showToast('Failed to load game state.', 'error');
                      }
                    } catch (e) {
                      console.error('[App] Load failed:', e);
                      showToast('Failed to read save file: ' + (e as Error).message, 'error');
                    }
                    setActiveMenu(null);
                  };
                  document.body.appendChild(input);
                  input.click();
                  setTimeout(() => {
                    if (document.body.contains(input)) document.body.removeChild(input);
                  }, 1000);
                }}
              >
                📁 Load Game
              </button>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #3182ce 0%, #2c5aa0 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  console.log('App: Settings button clicked');
                  setShowSettings(true);
                  setActiveMenu(null);
                }}
              >
                ⚙️ Settings
              </button>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #e53e3e 0%, #c53030 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  const confirmed = window.confirm('Are you sure you want to quit to the main menu?');
                  if (confirmed && gameEngine) {
                    gameEngine.shutdownToMenu();
                    actions.resetGameState();
                    setActiveMenu(null);
                    setGameEngine(null);
                    setShowGameSetup(true);
                  }
                }}
              >
                🚪 Quit
              </button>
            </div>
          )}
          {activeMenu === 'INFO' && (
            <div>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #63b3ed 0%, #4299e1 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  console.log('App: Download Map clicked');
                  handleDownloadMap();
                  setActiveMenu(null);
                }}
              >
                🗺️ Download Map
              </button>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #3182ce 0%, #2c5aa0 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  actions.showDialog('help');
                  setActiveMenu(null);
                }}
              >
                ❓ Help
              </button>
            </div>
          )}
          {activeMenu === 'WORLD' && (
            <div>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #d69e2e 0%, #b7791f 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  actions.showDialog('diplomacy-report');
                  setActiveMenu(null);
                }}
              >
                ⚖️ Diplomacy
              </button>
              <button 
                className="btn btn-dark text-start w-100 border-0"
                style={{
                  fontSize: `${settings.menuFontSize * 1.1}px`,
                  padding: '12px 16px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'linear-gradient(90deg, #3182ce 0%, #2c5aa0 100%)';
                  (e.target as HTMLElement).style.paddingLeft = '24px';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                  (e.target as HTMLElement).style.paddingLeft = '16px';
                }}
                onClick={() => {
                  actions.showDialog('tech');
                  setActiveMenu(null);
                }}
              >
                🌳 Tech Tree
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hex Detail Modal */}
      <HexDetailModal
        show={showHexDetail}
        onHide={() => setShowHexDetail(false)}
        hex={detailHex}
        terrain={terrainData}
      />

      {/* Settings Modal */}
      <SettingsModal
        show={showSettings}
        onHide={() => setShowSettings(false)}
      />

      {/* End Turn Confirmation Modal */}
      <EndTurnConfirmModal
        show={showEndTurnConfirm}
        onConfirm={handleEndTurnConfirm}
        onCancel={handleEndTurnCancel}
        currentTurn={gameState.currentTurn}
        currentYear={gameState.currentYear ?? -4000}
        isAutomatic={isEndTurnAutomatic}
      />

      {/* Game Modals */}
      <GameModals gameEngine={gameEngine} />

      <GameResultOverlay
        result={gameResult}
        onClose={handleResultClose}
        onRestart={handleResultRestart}
        onQuit={handleResultQuit}
      />
    </div>
  );
}

export default App;

