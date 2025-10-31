import React, { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { Container } from 'react-bootstrap';

// Components
import LoadingScreen from './components/ui/LoadingScreen';
import GameCanvas from './components/game/GameCanvas';
import TopBar from './components/ui/TopBar';
import SidePanel from './components/ui/SidePanel';
import BottomPanel from './components/ui/BottomPanel';
import GameModals from './components/ui/GameModals';

// Stores
import { gameStateAtom, gameActionsAtom } from './stores/gameStore';

// Game Engine
import GameEngine from './game/GameEngine';
import { useGameEngine } from './hooks/useGameEngine';

function App() {
  const [gameState] = useAtom(gameStateAtom);
  const [, gameActions] = useAtom(gameActionsAtom);
  const [gameEngine, setGameEngine] = useState(null);
  const [error, setError] = useState(null);

  // Initialize game engine
  useEffect(() => {
    const initializeGame = async () => {
      try {
        console.log('App: Starting initialization...');
        gameActions({ type: 'SET_LOADING', payload: true });
        
        // Create game engine instance
        const engine = new GameEngine();
        await engine.initialize();
        
        setGameEngine(engine);
        gameActions({ type: 'SET_LOADING', payload: false });
        console.log('App: Initialization complete');
        
      } catch (error) {
        console.error('Failed to initialize game:', error);
        setError(error.message);
        gameActions({ 
          type: 'ADD_NOTIFICATION', 
          payload: { 
            type: 'error', 
            message: 'Failed to initialize game. Please refresh and try again.' 
          } 
        });
      }
    };

    initializeGame();
  }, [gameActions]);

  // Connect game engine to React state management
  useGameEngine(gameEngine);

  // Show error state
  if (error) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100 bg-dark text-white">
        <div className="text-center">
          <h2>Error Loading Game</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (!gameEngine || gameState.isLoading) return;

      switch (event.key.toLowerCase()) {
        case 'h':
          gameActions({ type: 'SHOW_DIALOG', payload: 'help' });
          break;
        case 'escape':
          gameActions({ type: 'HIDE_DIALOG' });
          break;
        case 'enter':
        case ' ':
          if (gameState.gamePhase === 'playing') {
            gameActions({ type: 'NEXT_TURN' });
            gameEngine.processTurn();
          }
          break;
        case 'm':
          gameActions({ type: 'TOGGLE_UI', payload: 'showMinimap' });
          break;
        case 't':
          gameActions({ type: 'SHOW_DIALOG', payload: 'tech' });
          break;
        case 'd':
          gameActions({ type: 'SHOW_DIALOG', payload: 'diplomacy' });
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameEngine, gameState.isLoading, gameState.gamePhase, gameActions]);

  // Show loading screen during initialization
  if (gameState.isLoading || !gameEngine) {
    return <LoadingScreen />;
  }

  return (
    <div className="game-container">
      {/* Top Bar with resources and controls */}
      <TopBar gameEngine={gameEngine} />
      
      {/* Main game area */}
      <div className="d-flex flex-grow-1 position-relative">
        {/* Game Canvas */}
        <div className="flex-grow-1 position-relative overflow-hidden">
          <GameCanvas gameEngine={gameEngine} />
          
          {/* Bottom Panel for unit/city details - mobile responsive */}
          <BottomPanel gameEngine={gameEngine} />
        </div>
        
        {/* Side Panel for game info - responsive */}
        <SidePanel gameEngine={gameEngine} />
      </div>
      
      {/* Modal Dialogs */}
      <GameModals gameEngine={gameEngine} />
    </div>
  );
}

export default App;