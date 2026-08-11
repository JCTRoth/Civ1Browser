import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '@/stores/GameStore';
import type { Unit } from '../types/game';

/**
 * Camera-focus rule: the camera only follows the human player's own unit
 * movement, or enemy/AI units whose tile the human player can currently see
 * (fog of war). Hidden AI movement must never yank the camera or leak unit
 * info through the selection panel. Dev mode overrides the fog check.
 */
describe('focusOnNextUnit — camera follows only human/visible units', () => {
  const MAP_WIDTH = 40;
  const MAP_HEIGHT = 30;
  const tileIndex = (col: number, row: number) => row * MAP_WIDTH + col;

  const setup = (opts: {
    activePlayer: number;
    units: Unit[];
    devMode?: boolean;
    visibleTiles?: number[];
  }) => {
    const visibility = new Array<boolean>(MAP_WIDTH * MAP_HEIGHT).fill(false);
    for (const idx of opts.visibleTiles ?? []) visibility[idx] = true;

    useGameStore.setState((state) => ({
      ...state,
      _lastFocusCall: 0,
      gameState: {
        ...state.gameState,
        activePlayer: opts.activePlayer,
        selectedUnit: null,
        activeUnit: null,
        selectedCity: null,
      },
      map: {
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        tiles: [],
        visibility,
        revealed: visibility.slice(),
      },
      camera: { x: 0, y: 0, zoom: 2.0, minZoom: 0.5, maxZoom: 3.0 },
      units: opts.units,
      cities: [],
      civilizations: [],
      settings: { ...state.settings, devMode: !!opts.devMode },
    }));
  };

  const unit = (id: string, civilizationId: number, col: number, row: number): Unit => ({
    id,
    type: 'warrior',
    civilizationId,
    col,
    row,
    movesRemaining: 1,
    health: 100,
    icon: 'warrior',
    isSleeping: false,
    isFortified: false,
    isSkipped: false,
    areTurnsDone: false,
  });

  beforeEach(() => {
    // Reset to a known default before each test.
    setup({ activePlayer: 0, units: [], visibleTiles: [] });
  });

  it('follows the human player’s own unit and selects it', () => {
    setup({ activePlayer: 0, units: [unit('human-1', 0, 20, 15)] });

    useGameStore.getState().actions.focusOnNextUnit();

    const { camera, gameState } = useGameStore.getState();
    expect(gameState.selectedUnit).toBe('human-1');
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.y).toBeGreaterThan(0);
  });

  it('does NOT follow an AI unit hidden by fog of war', () => {
    setup({ activePlayer: 1, units: [unit('ai-hidden', 1, 20, 15)], visibleTiles: [] });

    useGameStore.getState().actions.focusOnNextUnit();

    const { camera, gameState } = useGameStore.getState();
    expect(gameState.selectedUnit).toBeNull();
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
  });

  it('follows an AI unit on a tile visible to the human player', () => {
    setup({
      activePlayer: 1,
      units: [unit('ai-visible', 1, 20, 15)],
      visibleTiles: [tileIndex(20, 15)],
    });

    useGameStore.getState().actions.focusOnNextUnit();

    const { camera, gameState } = useGameStore.getState();
    expect(gameState.selectedUnit).toBe('ai-visible');
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.y).toBeGreaterThan(0);
  });

  it('dev mode reveals hidden AI movement (fog overridden)', () => {
    setup({
      activePlayer: 1,
      units: [unit('ai-dev', 1, 20, 15)],
      visibleTiles: [],
      devMode: true,
    });

    useGameStore.getState().actions.focusOnNextUnit();

    const { camera, gameState } = useGameStore.getState();
    expect(gameState.selectedUnit).toBe('ai-dev');
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.y).toBeGreaterThan(0);
  });
});
