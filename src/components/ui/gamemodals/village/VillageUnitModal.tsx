import { Modal } from 'react-bootstrap';
import type { VillageResult } from '../../../../../types/game';

interface VillageUnitModalProps {
  result: VillageResult;
  onHide: () => void;
}

/**
 * "Friendly Mercenaries" village outcome — a free unit (home city NONE).
 * When a Settler triggered the hut the Civ1 "NONE" hack awards a Settler.
 */
function VillageUnitModal({ result, onHide }: VillageUnitModalProps) {
  const unitName = result.unitName ?? 'warrior';
  const isSettler = (result.unitType ?? '').toLowerCase() === 'settler' || unitName.toLowerCase() === 'settler';
  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <span style={{ fontSize: '1.4em', marginRight: '0.15em' }} aria-hidden="true">⚔️</span>
          Friendly Mercenaries
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white text-center">
        <div style={{ fontSize: '3em', lineHeight: 1 }} aria-hidden="true">{isSettler ? '🚶' : '🛡️'}</div>
        <p className="mt-3 mb-1" style={{ fontSize: '1.25em', fontWeight: 600 }}>{unitName}</p>
        <p className="mb-0 text-secondary">
          {isSettler
            ? 'A settler from a friendly tribe joins your empire.'
            : `A ${unitName} from a nearby tribe joins your empire.`}
        </p>
      </Modal.Body>
      <Modal.Footer className="bg-dark">
        <button type="button" className="btn btn-primary" onClick={onHide}>OK</button>
      </Modal.Footer>
    </Modal>
  );
}

export default VillageUnitModal;
