import React, { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { Container } from 'react-bootstrap';
import { gameStateAtom, gameActionsAtom } from './stores/gameStore';
import GameEngine from './game/GameEngine';

function SimpleGameApp() {
  const [gameState, setGameState] = useAtom(gameStateAtom);
  const [, gameActions] = useAtom(gameActionsAtom);
  const [gameEngine, setGameEngine] = useState(null);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Initialize game engine
  useEffect(() => {
    const initializeGame = async () => {
      try {
        console.log('SimpleGameApp: Starting initialization...');
        
        // Create game engine
        const engine = new GameEngine();
        console.log('SimpleGameApp: GameEngine created:', engine);
        
        setGameEngine(engine);
        console.log('SimpleGameApp: Initialization complete!');
        
      } catch (error) {
        console.error('SimpleGameApp: Initialization error:', error);
        setError(error.message);
      }
    };

    initializeGame();
  }, []);

  // Game actions
  const handleStartGame = () => {
    console.log('Starting new game...');
    setGameState(prev => ({
      ...prev,
      gamePhase: 'loading',
      isLoading: true
    }));
    
    // Simulate game start
    setTimeout(() => {
      setGameState(prev => ({
        ...prev,
        gamePhase: 'playing',
        isLoading: false,
        isGameStarted: true,
        mapGenerated: true
      }));
      console.log('Game started!');
    }, 2000);
  };

  const handleSettings = () => {
    console.log('Opening settings...');
    setShowSettings(!showSettings);
  };

  // Handle errors
  if (error) {
    return (
      <Container fluid className="vh-100 bg-danger text-white d-flex align-items-center justify-content-center">
        <div className="text-center">
          <h1>🚨 Game Error</h1>
          <p>{error}</p>
          <button 
            className="btn btn-light" 
            onClick={() => window.location.reload()}
          >
            Reload Game
          </button>
        </div>
      </Container>
    );
  }

  // Show loading while initializing
  if (!gameEngine || gameState?.isLoading) {
    return (
      <Container fluid className="vh-100 bg-info text-white d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <h2>🏛️ {gameState?.isLoading ? 'Starting Game...' : 'Initializing Civilization...'}</h2>
          <p>{gameState?.isLoading ? 'Generating world map and civilizations...' : 'Setting up the ancient world...'}</p>
        </div>
      </Container>
    );
  }

  // Main game interface
  return (
    <Container fluid className="vh-100 bg-success text-white p-0">
      <div className="h-100 d-flex flex-column">
        {/* Top Bar */}
        <div className="bg-dark text-white p-2">
          <div className="row align-items-center">
            <div className="col">
              <h4 className="mb-0">🏛️ Civilization Browser</h4>
            </div>
            <div className="col-auto">
              <span className="badge bg-primary">Turn {gameState?.currentTurn || 1}</span>
              <span className="badge bg-secondary ms-2">{gameState?.gamePhase || 'menu'}</span>
            </div>
          </div>
        </div>
        
        {/* Game Area */}
        <div className="flex-grow-1 d-flex">
          {/* Main Game Content */}
          <div className={`flex-grow-1 ${gameState?.gamePhase === 'playing' ? 'bg-success' : 'bg-primary'} d-flex align-items-center justify-content-center`}>
            <div className="text-center text-white">
              {gameState?.gamePhase === 'playing' ? (
                <>
                  <h2>�️ Ancient World Awaits!</h2>
                  <p>Your civilization has been founded!</p>
                  <p><strong>Turn:</strong> {gameState?.currentTurn}</p>
                  <p><strong>Status:</strong> {gameState?.mapGenerated ? 'World Generated' : 'Preparing...'}</p>
                  
                  <div className="mt-4">
                    <button className="btn btn-warning me-2">
                      <i className="bi bi-arrow-right-circle"></i> Next Turn
                    </button>
                    <button className="btn btn-info me-2">
                      <i className="bi bi-map"></i> View Map
                    </button>
                    <button className="btn btn-secondary" onClick={handleSettings}>
                      <i className="bi bi-gear-fill"></i> Settings
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2>🎮 Civilization Browser Ready!</h2>
                  <p>Game engine initialized successfully</p>
                  <p><strong>Phase:</strong> {gameState?.gamePhase}</p>
                  <p><strong>Turn:</strong> {gameState?.currentTurn}</p>
                  
                  <div className="mt-4">
                    <button className="btn btn-light me-2" onClick={handleStartGame}>
                      <i className="bi bi-play-fill"></i> Start New Game
                    </button>
                    <button className="btn btn-outline-light" onClick={handleSettings}>
                      <i className="bi bi-gear-fill"></i> Settings
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-dark text-white p-3" style={{width: '300px'}}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">⚙️ Settings</h5>
                <button 
                  className="btn btn-sm btn-outline-light"
                  onClick={() => setShowSettings(false)}
                >
                  ✕
                </button>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Map Size</label>
                <select className="form-select form-select-sm">
                  <option>Small (60x40)</option>
                  <option selected>Medium (80x50)</option>
                  <option>Large (100x60)</option>
                </select>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Difficulty</label>
                <select className="form-select form-select-sm">
                  <option>Easy</option>
                  <option selected>Normal</option>
                  <option>Hard</option>
                </select>
              </div>
              
              <div className="mb-3">
                <label className="form-label">Number of Civilizations</label>
                <select className="form-select form-select-sm">
                  <option>2</option>
                  <option selected>4</option>
                  <option>6</option>
                  <option>8</option>
                </select>
              </div>
              
              <hr />
              
              <div className="d-grid gap-2">
                <button className="btn btn-primary btn-sm">
                  💾 Save Settings
                </button>
                <button className="btn btn-secondary btn-sm">
                  🔄 Reset to Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}

export default SimpleGameApp;