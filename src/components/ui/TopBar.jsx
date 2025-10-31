import React from 'react';
import { useAtom } from 'jotai';
import { Navbar, Nav, Button, Badge } from 'react-bootstrap';
import { playerResourcesAtom, gameStatsAtom, gameActionsAtom } from '../../stores/gameStore';

const TopBar = ({ gameEngine }) => {
  const [resources] = useAtom(playerResourcesAtom);
  const [gameStats] = useAtom(gameStatsAtom);
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

  return (
    <Navbar bg="dark" variant="dark" className="game-top-bar px-3">
      {/* Left side - Game controls */}
      <Nav className="me-auto">
        <Button 
          variant="outline-light" 
          size="sm" 
          className="me-2"
          onClick={handleShowMenu}
        >
          <i className="bi bi-list"></i> Menu
        </Button>
        
        <Button 
          variant="outline-info" 
          size="sm" 
          className="me-2"
          onClick={handleShowTechTree}
        >
          <i className="bi bi-lightbulb"></i> Tech
        </Button>
        
        <Button 
          variant="outline-warning" 
          size="sm" 
          className="me-2"
          onClick={handleShowDiplomacy}
        >
          <i className="bi bi-people"></i> Diplomacy
        </Button>
      </Nav>

      {/* Center - Resources */}
      <div className="resource-display mx-auto">
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
      <Nav>
        <div className="d-flex align-items-center me-3">
          <Badge bg="secondary" className="me-2">
            Turn {gameStats.turn}
          </Badge>
          
          <small className="text-light me-3">
            Cities: {gameStats.totalCities} | Units: {gameStats.totalUnits}
          </small>
        </div>
        
        <Button 
          variant="success" 
          size="sm"
          onClick={handleNextTurn}
        >
          <i className="bi bi-skip-end-fill"></i> End Turn
        </Button>
      </Nav>
    </Navbar>
  );
};

export default TopBar;