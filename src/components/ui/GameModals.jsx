import React from 'react';
import { useAtom } from 'jotai';
import { Modal, Button, Tab, Tabs, Card, ListGroup } from 'react-bootstrap';
import { uiStateAtom, gameActionsAtom, technologiesAtom, currentPlayerAtom } from '../../stores/gameStore';

const GameModals = ({ gameEngine }) => {
  const [uiState] = useAtom(uiStateAtom);
  const [, gameActions] = useAtom(gameActionsAtom);
  const [technologies] = useAtom(technologiesAtom);
  const [currentPlayer] = useAtom(currentPlayerAtom);

  const handleCloseDialog = () => {
    gameActions({ type: 'HIDE_DIALOG' });
  };

  const handleNewGame = () => {
    if (gameEngine) {
      gameEngine.newGame();
    }
    handleCloseDialog();
  };

  const handleResearchTechnology = (techId) => {
    if (gameEngine && currentPlayer) {
      gameEngine.setResearch(currentPlayer.id, techId);
    }
    handleCloseDialog();
  };

  // Game Menu Modal
  const renderGameMenu = () => (
    <Modal show={uiState.activeDialog === 'game-menu'} onHide={handleCloseDialog} centered>
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-gear"></i> Game Menu
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white">
        <div className="d-grid gap-2">
          <Button variant="primary" size="lg" onClick={handleNewGame}>
            <i className="bi bi-plus-circle"></i> New Game
          </Button>
          
          <Button variant="info" size="lg">
            <i className="bi bi-download"></i> Save Game
          </Button>
          
          <Button variant="warning" size="lg">
            <i className="bi bi-upload"></i> Load Game
          </Button>
          
          <Button variant="secondary" size="lg">
            <i className="bi bi-gear"></i> Settings
          </Button>
          
          <Button 
            variant="outline-light" 
            size="lg"
            onClick={() => gameActions({ type: 'SHOW_DIALOG', payload: 'help' })}
          >
            <i className="bi bi-question-circle"></i> Help
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );

  // Technology Tree Modal
  const renderTechTree = () => (
    <Modal 
      show={uiState.activeDialog === 'tech'} 
      onHide={handleCloseDialog} 
      centered
      size="lg"
    >
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-lightbulb"></i> Technology Tree
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <Tabs defaultActiveKey="available" className="mb-3">
          <Tab eventKey="available" title="Available">
            <div className="tech-tree">
              {technologies.filter(tech => tech.available && !tech.researched).map(tech => (
                <Card 
                  key={tech.id} 
                  className="tech-node available mb-2"
                  onClick={() => handleResearchTechnology(tech.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <Card.Body>
                    <Card.Title className="h6">{tech.name}</Card.Title>
                    <Card.Text className="small">{tech.description}</Card.Text>
                    <div className="d-flex justify-content-between">
                      <small>Cost: {tech.cost} science</small>
                      {currentPlayer?.currentResearch?.id === tech.id && (
                        <small className="text-warning">Researching...</small>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              ))}
            </div>
          </Tab>
          
          <Tab eventKey="researched" title="Researched">
            <div className="tech-tree">
              {technologies.filter(tech => tech.researched).map(tech => (
                <Card key={tech.id} className="tech-node researched mb-2">
                  <Card.Body>
                    <Card.Title className="h6">{tech.name}</Card.Title>
                    <Card.Text className="small">{tech.description}</Card.Text>
                    <small className="text-success">
                      <i className="bi bi-check-circle"></i> Complete
                    </small>
                  </Card.Body>
                </Card>
              ))}
            </div>
          </Tab>
          
          <Tab eventKey="locked" title="Future">
            <div className="tech-tree">
              {technologies.filter(tech => !tech.available && !tech.researched).map(tech => (
                <Card key={tech.id} className="tech-node locked mb-2">
                  <Card.Body>
                    <Card.Title className="h6">{tech.name}</Card.Title>
                    <Card.Text className="small">{tech.description}</Card.Text>
                    <small className="text-muted">
                      Prerequisites: {tech.prerequisites?.join(', ') || 'None'}
                    </small>
                  </Card.Body>
                </Card>
              ))}
            </div>
          </Tab>
        </Tabs>
      </Modal.Body>
    </Modal>
  );

  // Diplomacy Modal
  const renderDiplomacy = () => (
    <Modal 
      show={uiState.activeDialog === 'diplomacy'} 
      onHide={handleCloseDialog} 
      centered
      size="lg"
    >
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-people"></i> Diplomacy
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white">
        <p>Diplomacy system coming soon...</p>
        <p>Features will include:</p>
        <ul>
          <li>Trade agreements</li>
          <li>Peace treaties</li>
          <li>Military alliances</li>
          <li>Technology exchanges</li>
          <li>Territorial negotiations</li>
        </ul>
      </Modal.Body>
    </Modal>
  );

  // Help Modal
  const renderHelp = () => (
    <Modal 
      show={uiState.activeDialog === 'help'} 
      onHide={handleCloseDialog} 
      centered
      size="lg"
    >
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-question-circle"></i> Help & Controls
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <Tabs defaultActiveKey="controls" className="mb-3">
          <Tab eventKey="controls" title="Controls">
            <h6>Mouse Controls:</h6>
            <ListGroup variant="flush" className="mb-3">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Left Click:</strong> Select units, cities, or hexes
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Right Click:</strong> Context menu (coming soon)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Drag:</strong> Pan the camera around the map
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Scroll Wheel:</strong> Zoom in and out
              </ListGroup.Item>
            </ListGroup>

            <h6>Keyboard Shortcuts:</h6>
            <ListGroup variant="flush">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Space/Enter:</strong> End turn
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>H:</strong> Show this help dialog
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>T:</strong> Open technology tree
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>D:</strong> Open diplomacy
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>M:</strong> Toggle minimap
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Escape:</strong> Close dialogs
              </ListGroup.Item>
            </ListGroup>
          </Tab>
          
          <Tab eventKey="gameplay" title="Gameplay">
            <h6>Getting Started:</h6>
            <ol>
              <li>Move your settler to a good location near water and resources</li>
              <li>Found your first city by selecting the settler and clicking "Found City"</li>
              <li>Explore with your warrior to find other civilizations and resources</li>
              <li>Build more units and buildings in your cities</li>
              <li>Research technologies to unlock new capabilities</li>
              <li>Expand your civilization and compete with others!</li>
            </ol>

            <h6>Resources:</h6>
            <ul>
              <li><strong>Food:</strong> Grows city population</li>
              <li><strong>Production:</strong> Builds units and structures</li>
              <li><strong>Trade:</strong> Generates gold and science</li>
              <li><strong>Science:</strong> Researches new technologies</li>
              <li><strong>Gold:</strong> Maintains units and buildings</li>
            </ul>
          </Tab>
          
          <Tab eventKey="about" title="About">
            <h5>Civilization Browser</h5>
            <p>A browser-based recreation of the classic Civilization game.</p>
            
            <h6>Built With:</h6>
            <ul>
              <li>React.js with hooks and modern patterns</li>
              <li>Jotai for state management</li>
              <li>Bootstrap for UI components</li>
              <li>HTML5 Canvas for game rendering</li>
              <li>Vite for fast development and building</li>
            </ul>

            <h6>Features:</h6>
            <ul>
              <li>Hexagonal grid map system</li>
              <li>Turn-based gameplay with AI opponents</li>
              <li>City building and management</li>
              <li>Unit movement and combat</li>
              <li>Technology research tree</li>
              <li>Resource management</li>
              <li>Responsive design for desktop and mobile</li>
            </ul>

            <p className="mt-3">
              <small className="text-muted">
                This is a fan-made recreation for educational purposes.
                Original Civilization © MicroProse/Firaxis Games
              </small>
            </p>
          </Tab>
        </Tabs>
      </Modal.Body>
    </Modal>
  );

  return (
    <>
      {renderGameMenu()}
      {renderTechTree()}
      {renderDiplomacy()}
      {renderHelp()}
    </>
  );
};

export default GameModals;