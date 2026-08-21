import { Modal } from 'react-bootstrap';
import type { VillageResult } from '../../../../../types/game';

interface VillageBarbarianModalProps {
  result: VillageResult;
  onHide: () => void;
}

/**
 * "Barbarian Ambush" village outcome — the hut reveals a hostile barbarian
 * village: 1–3 barbarians spawn in adjacent tiles and attack immediately.
 */
function VillageBarbarianModal({ result, onHide }: VillageBarbarianModalProps) {
  const count = result.barbarianCount ?? 0;
  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton className="bg-danger text-white">
        <Modal.Title>
          <span style={{ fontSize: '1.4em', marginRight: '0.15em' }} aria-hidden="true">🐎</span>
          Barbarian Ambush!
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white text-center">
        <div style={{ fontSize: '3em', lineHeight: 1 }} aria-hidden="true">⚔️</div>
        <p className="mt-3 mb-1" style={{ fontSize: '1.25em', fontWeight: 600 }}>
          {count} {count === 1 ? 'barbarian' : 'barbarians'}
        </p>
        <p className="mb-0 text-secondary">
          The village was a trap! Barbarians burst out and attack!
        </p>
      </Modal.Body>
      <Modal.Footer className="bg-dark">
        <button type="button" className="btn btn-danger" onClick={onHide}>OK</button>
      </Modal.Footer>
    </Modal>
  );
}

export default VillageBarbarianModal;
