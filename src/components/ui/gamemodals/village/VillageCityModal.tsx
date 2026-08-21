import { Modal } from 'react-bootstrap';
import type { VillageResult } from '../../../../../types/game';

interface VillageCityModalProps {
  result: VillageResult;
  onHide: () => void;
}

/**
 * "Advanced Tribe" / New Settlement village outcome — the hut instantly
 * becomes a size-1 city named after the civ's next available city name.
 */
function VillageCityModal({ result, onHide }: VillageCityModalProps) {
  const cityName = result.cityName ?? 'a new city';
  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <span style={{ fontSize: '1.4em', marginRight: '0.15em' }} aria-hidden="true">🏠</span>
          New Settlement
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white text-center">
        <div style={{ fontSize: '3em', lineHeight: 1 }} aria-hidden="true">🏘️</div>
        <p className="mt-3 mb-1" style={{ fontSize: '1.25em', fontWeight: 600 }}>{cityName}</p>
        <p className="mb-0 text-secondary">
          A friendly tribe settles here and founds the city of {cityName}!
        </p>
      </Modal.Body>
      <Modal.Footer className="bg-dark">
        <button type="button" className="btn btn-primary" onClick={onHide}>OK</button>
      </Modal.Footer>
    </Modal>
  );
}

export default VillageCityModal;
