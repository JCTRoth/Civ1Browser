import { Modal } from 'react-bootstrap';
import { useGameStore } from '@/stores/GameStore';
import type { VillageResult } from '../../../../types/game';

interface VillageModalProps {
  show: boolean;
  onHide: () => void;
}

const OUTCOME_META: Record<string, { icon: string; title: string }> = {
  advanced_tribe: { icon: '🏠', title: 'Advanced Tribe' },
  scroll_of_ancient_wisdom: { icon: '📜', title: 'Scroll of Ancient Wisdom' },
  valuable_metals: { icon: '🪙', title: 'Valuable Metals' },
  friendly_mercenaries: { icon: '⚔️', title: 'Friendly Mercenaries' },
  barbarians: { icon: '🐎', title: 'Horde of Barbarians' },
  destroyed: { icon: '💨', title: 'The Village Is Destroyed' },
};

function describe(result: VillageResult): string {
  switch (result.outcome) {
    case 'advanced_tribe':
      return `A friendly tribe joins your civilization and founds the city of ${result.cityName ?? 'a new city'} here.`;
    case 'scroll_of_ancient_wisdom':
      return `Your people learn ${result.techName ?? result.techId ?? 'a new technology'} from the scroll.`;
    case 'valuable_metals':
      return `The villagers gift you ${result.goldAmount ?? 50} gold.`;
    case 'friendly_mercenaries':
      return `A ${result.unitName ?? 'warrior'} joins your army.`;
    case 'barbarians':
      return `${result.barbarianCount ?? 0} barbarians burst out of the village and attack!`;
    case 'destroyed':
      return 'The village is destroyed with nothing to be gained.';
    default:
      return '';
  }
}

/**
 * Result of a Civ1 village (goody hut) encounter — shown when a military unit
 * steps onto a hut tile.
 */
function VillageModal({ show, onHide }: VillageModalProps) {
  const result = useGameStore((state) => state.villageResult);
  if (!show || !result) return null;

  const meta = OUTCOME_META[result.outcome] ?? { icon: '❓', title: 'Village' };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <span style={{ fontSize: '1.4em', marginRight: '0.15em' }} aria-hidden="true">
            {meta.icon}
          </span>
          {meta.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white">
        <p className="mb-0">{describe(result)}</p>
      </Modal.Body>
      <Modal.Footer className="bg-dark">
        <button type="button" className="btn btn-primary" onClick={onHide}>
          OK
        </button>
      </Modal.Footer>
    </Modal>
  );
}

export default VillageModal;
