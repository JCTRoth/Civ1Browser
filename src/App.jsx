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

  // Initialize game engine
  useEffect(() => {
    const initializeGame = async () => {
      try {
        gameActions({ type: 'SET_LOADING', payload: true });
        
        // Create game engine instance
        const engine = new GameEngine();
        await engine.initialize();
        
        setGameEngine(engine);
        gameActions({ type: 'SET_LOADING', payload: false });
        
      } catch (error) {
        console.error('Failed to initialize game:', error);
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
      <div className="d-flex flex-grow-1">
        {/* Game Canvas */}
        <div className="flex-grow-1 position-relative">
          <GameCanvas gameEngine={gameEngine} />
          
          {/* Bottom Panel for unit/city details */}
          <BottomPanel gameEngine={gameEngine} />
        </div>
        
        {/* Side Panel for game info */}
        <SidePanel gameEngine={gameEngine} />
      </div>
      
      {/* Modal Dialogs */}
      <GameModals gameEngine={gameEngine} />
    </div>
  );
}

export default App;