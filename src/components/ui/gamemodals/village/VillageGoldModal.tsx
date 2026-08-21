import { Modal } from 'react-bootstrap';
import type { VillageResult } from '../../../../../types/game';

interface VillageGoldModalProps {
  result: VillageResult;
  onHide: () => void;
}

/**
 * "Valuable Metals" village outcome — the villagers gift a lump sum of gold
 * (Civ1: 25, 50, or 100).
 */
function VillageGoldModal({ result, onHide }: VillageGoldModalProps) {
  const gold = result.goldAmount ?? 50;
  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <span style={{ fontSize: '1.4em', marginRight: '0.15em' }} aria-hidden="true">🪙</span>
          Valuable Metals
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white text-center">
        <div style={{ fontSize: '3em', lineHeight: 1 }} aria-hidden="true">💰</div>
        <p className="mt-3 mb-1" style={{ fontSize: '1.25em', fontWeight: 600 }}>
          +{gold} Gold
        </p>
        <p className="mb-0 text-secondary">The villagers present you with {gold} gold in tribute.</p>
      </Modal.Body>
      <Modal.Footer className="bg-dark">
        <button type="button" className="btn btn-primary" onClick={onHide}>OK</button>
      </Modal.Footer>
    </Modal>
  );
}

export default VillageGoldModal;
