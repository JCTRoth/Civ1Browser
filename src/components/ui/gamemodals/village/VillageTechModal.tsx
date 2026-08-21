import { Modal } from 'react-bootstrap';
import type { VillageResult } from '../../../../../types/game';

interface VillageTechModalProps {
  result: VillageResult;
  onHide: () => void;
}

/**
 * "Scroll of Ancient Wisdom" village outcome — an instant free technology.
 */
function VillageTechModal({ result, onHide }: VillageTechModalProps) {
  const techName = result.techName ?? result.techId ?? 'a new technology';
  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <span style={{ fontSize: '1.4em', marginRight: '0.15em' }} aria-hidden="true">📜</span>
          Scroll of Ancient Wisdom
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white text-center">
        <div style={{ fontSize: '3em', lineHeight: 1 }} aria-hidden="true">🧠</div>
        <p className="mt-3 mb-1" style={{ fontSize: '1.25em', fontWeight: 600 }}>{techName}</p>
        <p className="mb-0 text-secondary">Your scholars decipher an ancient scroll and learn {techName}!</p>
      </Modal.Body>
      <Modal.Footer className="bg-dark">
        <button type="button" className="btn btn-primary" onClick={onHide}>OK</button>
      </Modal.Footer>
    </Modal>
  );
}

export default VillageTechModal;
