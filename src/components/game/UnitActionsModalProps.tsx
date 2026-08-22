import type { Unit, City } from '../../../types/game';

type MapTile = { terrain?: string; type?: string; resource?: string; improvement?: string | Record<string, unknown>; village?: boolean; visible?: boolean; explored?: boolean; col?: number; row?: number };

interface ContextMenuData {
  x: number;
  y: number;
  hex: { col: number; row: number };
  tile?: MapTile | null;
  unit?: Unit | null;
  city?: City | null;
}

export interface UnitActionsModalProps {
  contextMenu: ContextMenuData | null;
  onExecuteAction: (action: string, data?: Record<string, unknown>) => void;
  onClose: () => void;
  gameEngine?: import('../../../types/game').GameEngine;
}