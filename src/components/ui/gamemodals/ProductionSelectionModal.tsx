import React from 'react';
import { Modal, Button, Tab, Tabs } from 'react-bootstrap';
import { UNIT_PROPS, BUILDING_PROPS } from '../../../utils/Constants';

interface ProductionSelectionModalProps {
  show: boolean;
  onHide: () => void;
  onSelectProduction: (key: string) => void;
  /** The owning civilization (must expose `technologies` as an array of tech ids). */
  currentPlayer?: { technologies?: Array<string | Set<string>> | Set<string> } | null;
}

/** True when the civ has researched every tech in the (possibly single) requirement. */
function hasRequiredTechs(
  civ: { technologies?: Array<string | Set<string>> | Set<string> } | null | undefined,
  requirement: string | string[] | null | undefined,
): boolean {
  if (!requirement) return true; // No tech required
  if (!civ) return true; // Unknown civ → don't block
  const techs = civ.technologies;
  const techSet = new Set<string>();
  if (Array.isArray(techs)) {
    for (const t of techs) {
      if (typeof t === 'string') {
        techSet.add(t);
      } else if (t instanceof Set) {
        for (const inner of t) techSet.add(inner);
      } else {
        techSet.add(String(t));
      }
    }
  } else if (techs instanceof Set) {
    for (const t of techs) techSet.add(String(t));
  }
  const requirements = Array.isArray(requirement) ? requirement : [requirement];
  return requirements.every((tech: string) => techSet.has(tech));
}

const ProductionSelectionModal: React.FC<ProductionSelectionModalProps> = ({
  show,
  onHide,
  onSelectProduction,
  currentPlayer
}) => {
  const handleSelect = (key: string) => {
    onSelectProduction(key);
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" dialogClassName="city-details-modal production-selection-modal hex-detail-modal">
      <Modal.Header className="hex-detail-modal-header text-white">
        <Modal.Title>Select Production</Modal.Title>
        <Button variant="outline-light" size="sm" onClick={onHide} className="hex-detail-close-button">
          <i className="bi bi-x-lg"></i>
        </Button>
      </Modal.Header>
      <Modal.Body className="hex-detail-modal-body text-white">
        <Tabs defaultActiveKey="units" id="production-selection-tabs">
          <Tab eventKey="units" title="Units">
            <div className="table-responsive">
              <table className="table table-dark table-striped">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Required Technology</th>
                    <th>Stats</th>
                    <th>Cost</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(UNIT_PROPS).map(key => {
                    const unit = UNIT_PROPS[key];
                    const requires = (unit as { requires?: string | string[] }).requires;
                    const canBuild = hasRequiredTechs(currentPlayer, requires);
                    const requiredTech = Array.isArray(requires) ? requires.join(', ') : requires || 'None';
                    const stats = `${unit.attack}/${unit.defense} (${unit.movement} moves)`;
                    return (
                      <tr key={key} className={canBuild ? '' : 'text-muted'}>
                        <td>{unit.name}</td>
                        <td>{requiredTech}</td>
                        <td>{stats}</td>
                        <td>{unit.cost}</td>
                        <td>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            disabled={!canBuild}
                            title={canBuild ? '' : `Requires ${requiredTech} technology`}
                            onClick={() => handleSelect(key)}
                          >
                            {canBuild ? 'Select' : `Requires ${requiredTech}`}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tab>
          <Tab eventKey="buildings" title="Buildings">
            <div className="table-responsive">
              <table className="table table-dark table-striped">
                <thead>
                  <tr>
                    <th>Building</th>
                    <th>Required Technology</th>
                    <th>Effect</th>
                    <th>Cost</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(BUILDING_PROPS).map(key => {
                    const building = BUILDING_PROPS[key];
                    const requiredTech = (building as { requiredTechnology?: string }).requiredTechnology || null;
                    const canBuild = hasRequiredTechs(currentPlayer, requiredTech);
                    return (
                      <tr key={key} className={canBuild ? '' : 'text-muted'}>
                        <td>{building.name}</td>
                        <td>{requiredTech || 'None'}</td>
                        <td>{building.description}</td>
                        <td>{building.cost}</td>
                        <td>
                          <Button
                            variant="outline-success"
                            size="sm"
                            disabled={!canBuild}
                            title={canBuild ? '' : `Requires ${requiredTech} technology`}
                            onClick={() => handleSelect(key)}
                          >
                            {canBuild ? 'Select' : `Requires ${requiredTech}`}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tab>
        </Tabs>
      </Modal.Body>
    </Modal>
  );
};

export default ProductionSelectionModal;