import React from 'react';
import { useAtom } from 'jotai';
import { Card, Button, ButtonGroup, ProgressBar, ListGroup } from 'react-bootstrap';
import { 
  selectedUnitAtom, 
  selectedCityAtom, 
  uiStateAtom,
  gameActionsAtom 
} from '../../stores/gameStore';
import { UNIT_PROPS, BUILDING_PROPS } from '../../utils/constants';

const BottomPanel = ({ gameEngine }) => {
  const [selectedUnit] = useAtom(selectedUnitAtom);
  const [selectedCity] = useAtom(selectedCityAtom);
  const [uiState] = useAtom(uiStateAtom);
  const [, gameActions] = useAtom(gameActionsAtom);

  // Don't show panel if nothing is selected
  if (!uiState.showUnitPanel && !uiState.showCityPanel) {
    return null;
  }

  const handleUnitAction = (action) => {
    if (!selectedUnit || !gameEngine) return;

    switch (action) {
      case 'move':
        // Unit movement is handled by canvas clicks
        break;
      case 'sleep':
        gameEngine.unitSleep(selectedUnit.id);
        break;
      case 'fortify':
        gameEngine.unitFortify(selectedUnit.id);
        break;
      case 'found_city':
        if (selectedUnit.type === 'settler') {
          gameEngine.foundCity(selectedUnit.id);
        }
        break;
      case 'build_road':
        gameEngine.buildImprovement(selectedUnit.id, 'road');
        break;
      case 'skip_turn':
        gameEngine.skipUnit(selectedUnit.id);
        break;
      default:
        console.log('Unknown unit action:', action);
    }
  };

  const handleCityAction = (action) => {
    if (!selectedCity || !gameEngine) return;

    switch (action) {
      case 'change_production':
        gameActions({ type: 'SHOW_DIALOG', payload: 'city-production' });
        break;
      case 'buy_unit':
        gameActions({ type: 'SHOW_DIALOG', payload: 'city-purchase' });
        break;
      case 'manage_citizens':
        gameActions({ type: 'SHOW_DIALOG', payload: 'city-citizens' });
        break;
      default:
        console.log('Unknown city action:', action);
    }
  };

  const renderUnitPanel = () => {
    if (!selectedUnit) return null;

    const unitProps = UNIT_PROPS[selectedUnit.type] || {};

    return (
      <Card bg="dark" text="white" className="m-2">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <span className="me-2" style={{ fontSize: '1.2em' }}>
              {unitProps.icon || '🔸'}
            </span>
            <strong>{unitProps.name || selectedUnit.type}</strong>
            {selectedUnit.isVeteran && (
              <span className="badge bg-success ms-2">Veteran</span>
            )}
          </div>
          <Button 
            variant="outline-secondary" 
            size="sm"
            onClick={() => gameActions({ type: 'SELECT_UNIT', payload: null })}
          >
            <i className="bi bi-x"></i>
          </Button>
        </Card.Header>
        
        <Card.Body>
          <div className="row">
            {/* Unit Stats */}
            <div className="col-md-6">
              <div className="unit-stats mb-3">
                <div className="row text-center">
                  <div className="col-4">
                    <div className="h6 mb-0 text-danger">
                      <i className="bi bi-sword"></i> {unitProps.attack || 0}
                    </div>
                    <small className="text-muted">Attack</small>
                  </div>
                  <div className="col-4">
                    <div className="h6 mb-0 text-primary">
                      <i className="bi bi-shield"></i> {unitProps.defense || 0}
                    </div>
                    <small className="text-muted">Defense</small>
                  </div>
                  <div className="col-4">
                    <div className="h6 mb-0 text-success">
                      <i className="bi bi-arrow-right"></i> {selectedUnit.movesRemaining || 0}
                    </div>
                    <small className="text-muted">Moves</small>
                  </div>
                </div>
              </div>

              {/* Health Bar */}
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <small>Health</small>
                  <small>{selectedUnit.health || 100}/100</small>
                </div>
                <ProgressBar 
                  now={selectedUnit.health || 100} 
                  variant={selectedUnit.health > 75 ? "success" : selectedUnit.health > 25 ? "warning" : "danger"}
                />
              </div>

              {/* Position */}
              <div className="mb-2">
                <small className="text-muted">
                  <i className="bi bi-geo-alt"></i> Position: ({selectedUnit.col}, {selectedUnit.row})
                </small>
              </div>
            </div>

            {/* Unit Actions */}
            <div className="col-md-6">
              <div className="unit-actions">
                <ButtonGroup vertical className="w-100">
                  {selectedUnit.type === 'settler' && (
                    <Button 
                      variant="outline-primary" 
                      size="sm"
                      onClick={() => handleUnitAction('found_city')}
                      disabled={(selectedUnit.movesRemaining || 0) === 0}
                    >
                      <i className="bi bi-building"></i> Found City
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline-secondary" 
                    size="sm"
                    onClick={() => handleUnitAction('sleep')}
                  >
                    <i className="bi bi-moon"></i> Sleep
                  </Button>
                  
                  {unitProps.type === 'military' && (
                    <Button 
                      variant="outline-warning" 
                      size="sm"
                      onClick={() => handleUnitAction('fortify')}
                    >
                      <i className="bi bi-shield-check"></i> Fortify
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline-info" 
                    size="sm"
                    onClick={() => handleUnitAction('build_road')}
                    disabled={(selectedUnit.movesRemaining || 0) === 0}
                  >
                    <i className="bi bi-arrow-bar-right"></i> Build Road
                  </Button>
                  
                  <Button 
                    variant="outline-light" 
                    size="sm"
                    onClick={() => handleUnitAction('skip_turn')}
                  >
                    <i className="bi bi-skip-end"></i> Skip Turn
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  };

  const renderCityPanel = () => {
    if (!selectedCity) return null;

    return (
      <Card bg="dark" text="white" className="m-2">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <i className="bi bi-building me-2"></i>
            <strong>{selectedCity.name}</strong>
            {selectedCity.isCapital && (
              <span className="badge bg-warning text-dark ms-2">
                <i className="bi bi-star-fill"></i> Capital
              </span>
            )}
          </div>
          <Button 
            variant="outline-secondary" 
            size="sm"
            onClick={() => gameActions({ type: 'SELECT_CITY', payload: null })}
          >
            <i className="bi bi-x"></i>
          </Button>
        </Card.Header>
        
        <Card.Body>
          <div className="row">
            {/* City Stats */}
            <div className="col-md-6">
              <div className="city-stats mb-3">
                <div className="row text-center">
                  <div className="col-3">
                    <div className="h6 mb-0 text-success">
                      <i className="bi bi-people"></i> {selectedCity.population || 1}
                    </div>
                    <small className="text-muted">Pop</small>
                  </div>
                  <div className="col-3">
                    <div className="h6 mb-0 text-success">
                      <i className="bi bi-apple"></i> {selectedCity.yields?.food || 0}
                    </div>
                    <small className="text-muted">Food</small>
                  </div>
                  <div className="col-3">
                    <div className="h6 mb-0 text-warning">
                      <i className="bi bi-gear"></i> {selectedCity.yields?.production || 0}
                    </div>
                    <small className="text-muted">Prod</small>
                  </div>
                  <div className="col-3">
                    <div className="h6 mb-0 text-info">
                      <i className="bi bi-arrow-left-right"></i> {selectedCity.yields?.trade || 0}
                    </div>
                    <small className="text-muted">Trade</small>
                  </div>
                </div>
              </div>

              {/* Growth Progress */}
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <small>Growth</small>
                  <small>{selectedCity.foodStored || 0}/{selectedCity.foodNeeded || 20}</small>
                </div>
                <ProgressBar 
                  now={((selectedCity.foodStored || 0) / (selectedCity.foodNeeded || 20)) * 100} 
                  variant="success"
                />
              </div>

              {/* Production Progress */}
              {selectedCity.currentProduction && (
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <small>{selectedCity.currentProduction.name}</small>
                    <small>{selectedCity.productionStored || 0}/{selectedCity.currentProduction.cost}</small>
                  </div>
                  <ProgressBar 
                    now={((selectedCity.productionStored || 0) / selectedCity.currentProduction.cost) * 100} 
                    variant="warning"
                  />
                </div>
              )}
            </div>

            {/* City Actions */}
            <div className="col-md-6">
              <div className="city-actions">
                <ButtonGroup vertical className="w-100">
                  <Button 
                    variant="outline-primary" 
                    size="sm"
                    onClick={() => handleCityAction('change_production')}
                  >
                    <i className="bi bi-gear"></i> Change Production
                  </Button>
                  
                  <Button 
                    variant="outline-success" 
                    size="sm"
                    onClick={() => handleCityAction('buy_unit')}
                  >
                    <i className="bi bi-cart"></i> Buy Unit/Building
                  </Button>
                  
                  <Button 
                    variant="outline-info" 
                    size="sm"
                    onClick={() => handleCityAction('manage_citizens')}
                  >
                    <i className="bi bi-people"></i> Manage Citizens
                  </Button>
                  
                  <Button 
                    variant="outline-warning" 
                    size="sm"
                    onClick={() => gameActions({ type: 'SHOW_DIALOG', payload: 'city-details' })}
                  >
                    <i className="bi bi-info-circle"></i> City Details
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          </div>

          {/* Buildings List */}
          {selectedCity.buildings && selectedCity.buildings.length > 0 && (
            <div className="mt-3">
              <h6 className="mb-2">Buildings:</h6>
              <div className="d-flex flex-wrap gap-1">
                {selectedCity.buildings.map((buildingType, index) => {
                  const building = BUILDING_PROPS[buildingType];
                  return (
                    <span 
                      key={index}
                      className="badge bg-secondary"
                      title={building?.description}
                    >
                      {building?.name || buildingType}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    );
  };

  return (
    <div className="game-bottom-panel position-absolute bottom-0 w-100" style={{ zIndex: 10 }}>
      {uiState.showUnitPanel && renderUnitPanel()}
      {uiState.showCityPanel && renderCityPanel()}
    </div>
  );
};

export default BottomPanel;