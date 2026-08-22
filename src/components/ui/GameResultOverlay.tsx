import React, { useMemo } from 'react';
import type { GameResult } from '../../../types/game';
import '@/styles/gameResultOverlay.css';

type GameResultOverlayProps = {
  result: GameResult | null;
  onClose: () => void;
  onRestart: () => void;
  onQuit: () => void;
};

const GameResultOverlay: React.FC<GameResultOverlayProps> = ({
  result,
  onClose,
  onRestart,
  onQuit
}) => {
  const isVictory = result?.outcome === 'victory';
  const reasonDescription = useMemo(() => {
    if (!result) {
      return '';
    }
    if (result.outcome === 'victory') {
      if (result.reason === 'moonshot') {
        return 'Your civilization is entering a new golden age with this new technology.';
      }
      if (result.reason === 'domination') {
        return 'Your empire now controls every city on the map.';
      }
      return 'The last rival civilization has fallen beneath your banner.';
    }
    return 'Your empire has crumbled. Only stories of your once great cities remain.';
  }, [result]);

  if (!result) {
    return null;
  }

  return (
    <div className={`game-result-overlay ${isVictory ? 'victory' : 'defeat'}`} role="dialog" aria-modal="true">
      <div className="game-result-panel">
        <header className="game-result-header">
          <h1>{isVictory ? 'Victory Achieved!' : 'Defeat'}</h1>
          <p className="game-result-subtitle">{result.civName}</p>
        </header>

        <section className="game-result-body">
          <p>{reasonDescription}</p>
          {isVictory && result.reason === 'moonshot' && (
            <p className="game-result-highlight">The Moonshot project has ignited celebrations across your lands.</p>
          )}
        </section>

        <footer className="game-result-actions">
          {isVictory ? (
            <>
              <button className="gr-btn secondary" onClick={onRestart}>Restart</button>
              <button className="gr-btn" onClick={onClose}>Close</button>
              <button className="gr-btn danger" onClick={onQuit}>Quit</button>
            </>
          ) : (
            <>
              <button className="gr-btn primary" onClick={onRestart}>Restart</button>
              <button className="gr-btn danger" onClick={onQuit}>Quit</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};

export default GameResultOverlay;
