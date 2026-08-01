import React from 'react';
import type { GameMenuName } from './GameMenuSheet';

interface MobileBottomBarProps {
  activeMenu: GameMenuName | null;
  onOpenMenu: (menu: GameMenuName) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onEndTurn: () => void;
}

interface BarButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  endTurn?: boolean;
  ariaLabel?: string;
}

const BarButton: React.FC<BarButtonProps> = ({
  icon,
  label,
  onClick,
  active = false,
  endTurn = false,
  ariaLabel,
}) => (
  <button
    type="button"
    className={`mobile-bottom-bar__btn ${active ? 'is-active' : ''} ${endTurn ? 'mobile-bottom-bar__btn--endturn' : ''}`}
    onClick={onClick}
    aria-label={ariaLabel ?? label}
  >
    <i className={icon} aria-hidden="true" />
    <span>{label}</span>
  </button>
);

/**
 * Mobile-only primary action bar (thumb zone).
 * Provides one-handed access to menus, the info panel, and End Turn.
 */
const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activeMenu,
  onOpenMenu,
  panelOpen,
  onTogglePanel,
  onEndTurn,
}) => (
  <nav className="mobile-bottom-bar d-md-none" aria-label="Primary actions">
    <BarButton
      icon="bi bi-list"
      label="Menu"
      ariaLabel="Game menu"
      active={activeMenu === 'GAME'}
      onClick={() => onOpenMenu('GAME')}
    />
    <BarButton
      icon="bi bi-globe-americas"
      label="World"
      ariaLabel="World menu"
      active={activeMenu === 'WORLD'}
      onClick={() => onOpenMenu('WORLD')}
    />
    <BarButton
      icon="bi bi-info-circle"
      label="Info"
      ariaLabel="Info menu"
      active={activeMenu === 'INFO'}
      onClick={() => onOpenMenu('INFO')}
    />
    <BarButton
      icon="bi bi-layout-sidebar-inset"
      label="Panel"
      ariaLabel="Toggle information panel"
      active={panelOpen}
      onClick={onTogglePanel}
    />
    <BarButton
      icon="bi bi-skip-end-fill"
      label="End Turn"
      endTurn
      onClick={onEndTurn}
    />
  </nav>
);

export default MobileBottomBar;
