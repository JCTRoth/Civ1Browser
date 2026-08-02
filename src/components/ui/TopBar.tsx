import React from 'react';
import type { GameMenuName } from './GameMenuSheet';

interface TopBarProps {
  activeMenu: GameMenuName | null;
  onMenuClick: (menu: GameMenuName, e: React.MouseEvent<HTMLButtonElement>) => void;
  currentTurn: number;
  currentYear: string;
  onEndTurn: () => void;
  endTurnDisabled?: boolean;
  topBarRef?: React.Ref<HTMLDivElement>;
}

const MENU_ITEMS: GameMenuName[] = ['GAME', 'WORLD', 'INFO'];

/**
 * Top navigation bar. Compact on phones (scrollable, 44px targets),
 * full-size on desktop.
 */
const TopBar: React.FC<TopBarProps> = ({
  activeMenu,
  onMenuClick,
  currentTurn,
  currentYear,
  onEndTurn,
  endTurnDisabled = false,
  topBarRef,
}) => (
  <div ref={topBarRef} className="game-top-bar" role="banner">
    <div className="d-flex align-items-center gap-1">
      {MENU_ITEMS.map((item) => (
        <button
          key={item}
          type="button"
          className={`topbar-menu-btn ${activeMenu === item ? 'is-active' : ''}`}
          aria-haspopup="menu"
          aria-expanded={activeMenu === item}
          onClick={(e) => onMenuClick(item, e)}
        >
          {item}
        </button>
      ))}
    </div>

    <div className="d-flex align-items-center gap-2 topbar-turn ms-auto">
      <span className="topbar-turn">
        Turn <strong>{currentTurn}</strong>
      </span>
      <span className="text-muted-ui" aria-hidden="true">•</span>
      <span className="topbar-turn">{currentYear}</span>
    </div>

    <button
      type="button"
      className="touch-btn touch-btn--success topbar-endturn"
      onClick={onEndTurn}
      disabled={endTurnDisabled}
      aria-label="End Turn"
    >
      <i className="bi bi-skip-end-fill" aria-hidden="true"></i>
      <span className="d-none d-lg-inline" aria-hidden="true">End Turn</span>
    </button>
  </div>
);

export default TopBar;
