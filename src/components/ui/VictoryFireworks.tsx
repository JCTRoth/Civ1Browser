import { useEffect } from 'react';

/**
 * Victory fireworks — fires confetti bursts above the game-result overlay.
 *
 * This is a separate component (not inside GameResultOverlay) so the confetti
 * canvas is appended to document.body *outside* the overlay's stacking context,
 * letting it render above the dark backdrop with z-index: 99999.
 */
export default function VictoryFireworks({ show }: { show: boolean }) {
  useEffect(() => {
    if (!show) return;

    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let confettiCleanup: (() => void) | null = null;

    const runConfetti = async () => {
      try {
        const module = await import('canvas-confetti');
        const confetti = module.default;
        // 20-second celebration — longer than the old 15s.
        const endTime = Date.now() + 20_000;

        const fire = () => {
          if (isCancelled) return;

          // Alternate burst styles for variety.
          const burst = Math.random();
          if (burst < 0.35) {
            // Gold burst from the left.
            confetti({
              particleCount: 140,
              spread: 90,
              angle: 50,
              origin: { x: 0.15, y: 0.35 },
              colors: ['#ffd700', '#ffffff', '#ff4500'],
              gravity: 0.9,
              scalar: 1.2,
            });
          } else if (burst < 0.7) {
            // Silver burst from the right.
            confetti({
              particleCount: 120,
              spread: 100,
              angle: 130,
              origin: { x: 0.85, y: 0.35 },
              colors: ['#c0c0c0', '#ffffff', '#87ceeb'],
              gravity: 0.85,
              scalar: 1.1,
            });
          } else {
            // Centre rain.
            confetti({
              particleCount: 200,
              spread: 160,
              angle: 90,
              origin: { x: 0.5, y: 0.1 },
              colors: ['#ffd700', '#ffffff', '#ff4500', '#87ceeb'],
              gravity: 1.1,
              scalar: 1.3,
              drift: (Math.random() - 0.5) * 2,
            });
          }

          if (Date.now() < endTime) {
            timer = setTimeout(fire, 800 + Math.random() * 400);
          }
        };

        fire();

        // Let canvas-confetti know how to clean up (it doesn't expose one,
        // so we just remove any canvases it creates).
        confettiCleanup = () => {
          document.querySelectorAll('canvas').forEach((c) => {
            if (c.style.position === 'fixed' && parseInt(c.style.zIndex, 10) >= 9000) {
              c.remove();
            }
          });
        };
      } catch (error) {
        console.warn('[VictoryFireworks] Confetti failed to load', error);
      }
    };

    runConfetti();

    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
      confettiCleanup?.();
    };
  }, [show]);

  return null;
}
