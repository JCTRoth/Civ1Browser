import React from 'react';
import { useAtom } from 'jotai';
import { Navbar, Nav, Button, Badge } from 'react-bootstrap';
import { playerResourcesAtom, gameStatsAtom, gameActionsAtom, uiStateAtom } from '../../stores/gameStore';

const TopBar = ({ gameEngine }) => {
  const [resources] = useAtom(playerResourcesAtom);
  const [gameStats] = useAtom(gameStatsAtom);
  const [uiState] = useAtom(uiStateAtom);
  const [, gameActions] = useAtom(gameActionsAtom);

  const handleNextTurn = () => {
    gameActions({ type: 'NEXT_TURN' });
    if (gameEngine) {
      gameEngine.processTurn();
    }
  };

  const handleShowMenu = () => {
    gameActions({ type: 'SHOW_DIALOG', payload: 'game-menu' });
  };

  const handleShowTechTree = () => {
    gameActions({ type: 'SHOW_DIALOG', payload: 'tech' });
  };

  const handleShowDiplomacy = () => {
    gameActions({ type: 'SHOW_DIALOG', payload: 'diplomacy' });
  };

  const handleToggleSidePanel = () => {
    gameActions({ type: 'TOGGLE_UI', payload: 'sidebarCollapsed' });
  };

  return (
    <Navbar bg="dark" variant="dark" className="game-top-bar">
      {/* Left side - Game controls (Mobile: Hamburger menu) */}
      <Nav className="me-auto d-flex align-items-center">
        <Button 
          variant="outline-light" 
          size="sm" 
          className="me-2 d-md-inline-block"
          onClick={handleShowMenu}
        >
          <i className="bi bi-list"></i>
          <span className="d-none d-sm-inline ms-1">Menu</span>
        </Button>
        
        <Button 
          variant="outline-info" 
          size="sm" 
          className="me-2 d-none d-sm-inline-block"
          onClick={handleShowTechTree}
        >
          <i className="bi bi-lightbulb"></i>
          <span className="d-none d-md-inline ms-1">Tech</span>
        </Button>
        
        <Button 
          variant="outline-warning" 
          size="sm" 
          className="me-2 d-none d-sm-inline-block"
          onClick={handleShowDiplomacy}
        >
          <i className="bi bi-people"></i>
          <span className="d-none d-md-inline ms-1">Diplomacy</span>
        </Button>
      </Nav>

      {/* Center - Resources (Mobile: Full width, Desktop: Center) */}
      <div className="resource-display">
        <div className="resource-item">
          <i className="bi bi-apple text-success"></i>
          <span>{resources.food}</span>
        </div>
        
        <div className="resource-item">
          <i className="bi bi-gear-fill text-warning"></i>
          <span>{resources.production}</span>
        </div>
        
        <div className="resource-item">
          <i className="bi bi-arrow-left-right text-info"></i>
          <span>{resources.trade}</span>
        </div>
        
        <div className="resource-item">
          <i className="bi bi-mortarboard text-primary"></i>
          <span>{resources.science}</span>
        </div>
        
        <div className="resource-item">
          <i className="bi bi-coin text-warning"></i>
          <span>{resources.gold}</span>
        </div>
      </div>

      {/* Right side - Turn info and controls */}
      <Nav className="ms-auto d-flex align-items-center">
        <div className="d-flex align-items-center me-2">
          <Badge bg="secondary" className="me-2">
            T{gameStats.turn}
          </Badge>
          
          <small className="text-light me-2 d-none d-lg-block">
            Cities: {gameStats.totalCities} | Units: {gameStats.totalUnits}
          </small>
        </div>
        
        {/* Mobile sidebar toggle */}
        <Button 
          variant="outline-light" 
          size="sm"
          className="me-2 d-md-none mobile-nav-toggle"
          onClick={handleToggleSidePanel}
        >
          <i className="bi bi-info-circle"></i>
        </Button>
        
        <Button 
          variant="success" 
          size="sm"
          onClick={handleNextTurn}
        >
          <i className="bi bi-skip-end-fill"></i>
          <span className="d-none d-sm-inline ms-1">End Turn</span>
        </Button>
      </Nav>
    </Navbar>
  );
};

export default TopBar;