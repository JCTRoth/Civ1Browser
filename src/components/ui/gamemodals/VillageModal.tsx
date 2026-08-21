import { Modal } from 'react-bootstrap';
import { useGameStore } from '@/stores/GameStore';
import VillageGoldModal from './village/VillageGoldModal';
import VillageTechModal from './village/VillageTechModal';
import VillageUnitModal from './village/VillageUnitModal';
import VillageCityModal from './village/VillageCityModal';
import VillageBarbarianModal from './village/VillageBarbarianModal';

interface VillageModalProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Dispatcher for Civ1 village (goody hut) encounters. Every event opens its
 * OWN dedicated modal — gold, technology, mercenary unit, new settlement, or
 * barbarian ambush — so each outcome is presented distinctly.
 */
function VillageModal({ show, onHide }: VillageModalProps) {
  const result = useGameStore((state) => state.villageResult);
  if (!show || !result) return null;

  switch (result.outcome) {
    case 'valuable_metals':
      return <VillageGoldModal result={result} onHide={onHide} />;
    case 'scroll_of_ancient_wisdom':
      return <VillageTechModal result={result} onHide={onHide} />;
    case 'friendly_mercenaries':
      return <VillageUnitModal result={result} onHide={onHide} />;
    case 'advanced_tribe':
      return <VillageCityModal result={result} onHide={onHide} />;
    case 'barbarians':
      return <VillageBarbarianModal result={result} onHide={onHide} />;
    default:
      // Fallback for unknown/destroyed outcomes — a plain village notice.
      return (
        <Modal show onHide={onHide} centered>
          <Modal.Header closeButton className="bg-dark text-white">
            <Modal.Title>
              <span style={{ fontSize: '1.4em', marginRight: '0.15em' }} aria-hidden="true">💨</span>
              The Village
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark text-white">
            <p className="mb-0">The village is destroyed with nothing to be gained.</p>
          </Modal.Body>
          <Modal.Footer className="bg-dark">
            <button type="button" className="btn btn-primary" onClick={onHide}>OK</button>
          </Modal.Footer>
        </Modal>
      );
  }
}

export default VillageModal;
