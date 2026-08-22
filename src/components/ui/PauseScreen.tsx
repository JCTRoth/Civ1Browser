import React from 'react';
import '../../styles/pauseScreen.css';

interface PauseScreenProps {
  show: boolean;
  onResume: () => void;
  currentTurn?: number;
  currentYear?: string;
  gameOver?: boolean;
}

/**
 * Full-screen pause overlay. Shown while the game is paused (triggered from the
 * GAME menu or Ctrl+P). Blocks interaction with the map while visible and offers
 * a Resume action.
 */
const PauseScreen: React.FC<PauseScreenProps> = ({
  show,
  onResume,
  currentTurn,
  currentYear,
  gameOver = false,
}) => {
  if (!show) {
    return null;
  }

  const gameOverTitle = 'Game Over';
  const gameOverMessage = 'The game has ended. The board is frozen in its final state.';

  return (
    <div className="pause-screen" role="dialog" aria-modal="true" aria-label={gameOver ? gameOverTitle : 'Game Paused'}>
      <div className="pause-screen__content">
        <div className="pause-screen__icon" aria-hidden="true">{gameOver ? '🏆' : '⏸️'}</div>
        <h2 className="pause-screen__title">{gameOver ? gameOverTitle : 'Game Paused'}</h2>
        {currentTurn !== undefined && (
          <p className="pause-screen__status">
            Turn {currentTurn}{currentYear ? ` · ${currentYear}` : ''}
          </p>
        )}
        {gameOver ? (
          <p className="pause-screen__hint">{gameOverMessage}</p>
        ) : (
          <p className="pause-screen__hint">Press Ctrl+P or click Resume to continue</p>
        )}

        <div className="pause-screen__actions">
          {!gameOver && (
            <button
              type="button"
              className="pause-screen__button pause-screen__button--primary"
              onClick={onResume}
              autoFocus
            >
              ▶ Resume
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PauseScreen;
