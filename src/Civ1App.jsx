import React, { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { gameStateAtom, gameActionsAtom } from './stores/gameStore';
import GameEngine from './game/GameEngine';
import Civ1GameCanvas from './components/game/Civ1GameCanvas';
import HexDetailModal from './components/ui/HexDetailModal';

function Civ1App() {
  const [gameState, setGameState] = useAtom(gameStateAtom);
  const [, gameActions] = useAtom(gameActionsAtom);
  const [gameEngine, setGameEngine] = useState(null);
  const [error, setError] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [showHexDetail, setShowHexDetail] = useState(false);
  const [detailHex, setDetailHex] = useState(null);
  const [terrainData, setTerrainData] = useState(null);

  // Initialize game engine
  useEffect(() => {
    const initializeGame = async () => {
      try {
        console.log('Civ1App: Starting initialization...');
        const engine = new GameEngine();
        setGameEngine(engine);
        
        // Auto-start the game for development
        setGameState(prev => ({
          ...prev,
          gamePhase: 'playing',
          isGameStarted: true,
          mapGenerated: true,
          currentTurn: 1
        }));
        
      } catch (error) {
        console.error('Civ1App: Initialization error:', error);
        setError(error.message);
      }
    };

    initializeGame();
  }, [setGameState]);

  // Handle menu actions
  const handleMenuClick = (menu) => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  // Handle hex examination (called from canvas)
  const handleExamineHex = (hex, terrain) => {
    setDetailHex(hex);
    setTerrainData(terrain);
    setShowHexDetail(true);
  };

  if (error) {
    return (
      <div className="vh-100 bg-danger text-white d-flex align-items-center justify-content-center">
        <div className="text-center">
          <h1>🚨 Game Error</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!gameEngine) {
    return (
      <div className="vh-100 bg-primary text-white d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border mb-3"></div>
          <h2>🏛️ Loading Civilization...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="vh-100 d-flex flex-column bg-dark text-white" style={{ fontFamily: 'monospace' }}>
      {/* Top Menu Bar */}
      <div className="bg-secondary border-bottom border-light d-flex" style={{ height: '32px' }}>
        {/* Menu items */}
        <div className="d-flex flex-grow-1 h-100">
          {['GAME', 'ORDERS', 'ADVISORS', 'WORLD', 'CIVILOPEDIA'].map((item) => (
            <button
              key={item}
              className={`btn btn-sm px-3 text-white border-0 rounded-0 ${
                activeMenu === item ? 'bg-primary' : 'bg-transparent'
              }`}
              style={{ fontSize: '12px', height: '100%' }}
              onClick={() => handleMenuClick(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-grow-1 d-flex">
        {/* Left Sidebar with CSS Grid */}
        <div 
          className="bg-info text-dark border-end border-light"
          style={{ 
            width: '200px',
            display: 'grid',
            gridTemplateRows: '100px auto auto 1fr auto',
            gridTemplateColumns: '1fr',
            height: '100%'
          }}
        >
          {/* Minimap */}
          <div 
            className="border-bottom border-dark bg-dark"
            style={{ 
              gridRow: '1',
              overflow: 'hidden'
            }}
          >
            <Civ1GameCanvas minimap={true} />
          </div>

          {/* Civilization Info */}
          <div 
            className="border-bottom border-dark p-2" 
            style={{ 
              backgroundColor: '#87CEEB',
              gridRow: '2'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>
              <div>22002</div>
              <div>20,000</div>
              <div>3220 BC</div>
              <div>Monarch</div>
              <div style={{ color: '#8B4513' }}>
                End of Turn<br/>
                Press Enter<br/>
                to continue
              </div>
            </div>
          </div>

          {/* City List */}
          <div 
            className="border-bottom border-dark p-1" 
            style={{ 
              backgroundColor: '#B0C4DE',
              gridRow: '3',
              maxHeight: '150px',
              overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>
              CITIES (4)
            </div>
            {['Washington', 'New York', 'Boston', 'Philadelphia'].map((city, idx) => (
              <div 
                key={city}
                className={`p-1 ${selectedCity === city ? 'bg-warning' : ''}`}
                style={{ 
                  fontSize: '10px', 
                  cursor: 'pointer',
                  backgroundColor: selectedCity === city ? '#FFD700' : 'transparent'
                }}
                onClick={() => setSelectedCity(city)}
              >
                📍 {city} ({idx + 1})
              </div>
            ))}
          </div>

          {/* Unit Info */}
          <div 
            className="border-bottom border-dark p-1" 
            style={{ 
              backgroundColor: '#B0C4DE',
              gridRow: '4',
              overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>
              UNITS
            </div>
            <div style={{ fontSize: '10px' }}>
              <div>🏹 Archer</div>
              <div>⚔️ Warrior</div>
              <div>🚢 Trireme</div>
              <div>👨‍🌾 Settler</div>
            </div>
          </div>

          {/* Current Selection */}
          <div 
            className="p-2" 
            style={{ 
              backgroundColor: '#B0C4DE',
              gridRow: '5'
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
              FORTIFIED UNIT
            </div>
            <div style={{ fontSize: '10px' }}>
              Archer<br/>
              Veteran<br/>
              Moves: 0/1<br/>
              <div className="mt-1">
                <button className="btn btn-xs btn-warning me-1" style={{ fontSize: '8px' }}>
                  Fortify
                </button>
                <button className="btn btn-xs btn-info" style={{ fontSize: '8px' }}>
                  Sentry
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Map Area */}
        <div className="flex-grow-1 position-relative bg-dark">
          <Civ1GameCanvas onExamineHex={handleExamineHex} />
          
          {/* Map overlay info */}
          <div 
            className="position-absolute text-white p-2"
            style={{ 
              top: '10px', 
              right: '10px', 
              backgroundColor: 'rgba(0,0,0,0.7)', 
              fontSize: '12px',
              fontFamily: 'monospace',
              zIndex: 10
            }}
          >
            <div>Turn: {gameState?.currentTurn || 1}</div>
            <div>Year: 4000 BC</div>
            <div>Treasury: 50 💰</div>
            <div>Science: 2 🧪</div>
          </div>
        </div>
      </div>

      {/* Bottom Status Panel */}
      <div 
        className="bg-secondary border-top border-light p-2 d-flex align-items-center"
        style={{ height: '60px', fontSize: '11px' }}
      >
        <div className="flex-grow-1">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <strong>Plains</strong> (River) - Move cost: 1
            </div>
            <div className="me-3">
              🌾 Food: 2 | ⚒️ Production: 1 | 💰 Trade: 1
            </div>
            <div className="me-3">
              Special: None
            </div>
          </div>
        </div>
        
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-warning">
            🏗️ Build
          </button>
          <button className="btn btn-sm btn-info">
            📜 Science
          </button>
          <button className="btn btn-sm btn-success">
            💰 Tax
          </button>
          <button className="btn btn-sm btn-primary">
            🗺️ Map
          </button>
        </div>
      </div>

      {/* Dropdown Menus */}
      {activeMenu && (
        <div 
          className="position-absolute bg-dark border border-light"
          style={{ 
            top: '32px', 
            left: ['GAME', 'ORDERS', 'ADVISORS', 'WORLD', 'CIVILOPEDIA'].indexOf(activeMenu) * 80 + 'px',
            zIndex: 1000,
            minWidth: '150px'
          }}
        >
          {activeMenu === 'GAME' && (
            <div>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🆕 New Game</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">💾 Save Game</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">📁 Load Game</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">⚙️ Options</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🚪 Quit</button>
            </div>
          )}
          {activeMenu === 'ORDERS' && (
            <div>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🏰 Build City</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🛣️ Build Road</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🌾 Irrigate</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🗿 Mine</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🏹 Fortify</button>
            </div>
          )}
          {activeMenu === 'ADVISORS' && (
            <div>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">👑 Foreign Minister</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">💰 Trade Advisor</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">🧪 Science Advisor</button>
              <button className="btn btn-sm btn-dark text-start w-100 border-0">⚔️ Military Advisor</button>
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
    </div>
  );
}

export default Civ1App;