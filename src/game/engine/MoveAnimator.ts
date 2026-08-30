import { useGameStore } from '../../stores/GameStore';
import type { Unit } from '../../../types/game';

/** The narrow slice of the engine MoveAnimator needs, so the engine class
 * instance is assignable without inheriting the unrelated interface mismatch
 * (e.g. `foundCity().currentProduction.type`) that already exists in the repo. */
interface MoveEngine {
  units: Unit[];
  moveUnit(unitId: string, col: number, row: number): { success: boolean; reason?: string };
  canUnitMoveTo(unitId: string, col: number, row: number): boolean;
}

/**
 * Base animation durations (ms), scaled by `Settings.animationSpeed` (or zeroed
 * when `Settings.enableAnimations` is false). MoveAnimator drives the *visual*
 * glide and only commits the engine move once the glide has finished, so the
 * game state updates after the animation completes.
 */
const BASE_MOVE_DURATION = 250; // per-tile glide
const BASE_LUNGE_DURATION = 300; // attacker moves toward the defender
const BASE_RECOIL_DURATION = 250; // attacker retreats after a failed attack

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deferred-commit controller for human-initiated unit movement and attacks.
 *
 * For each move it: (1) registers a `MovementAnimation` so the renderer can
 * glide the unit, (2) waits for the glide to finish, (3) commits the engine
 * move (which may resolve combat). When animations are disabled / set to
 * instant (`enableAnimations=false` or `animationSpeed=0`) every duration is 0,
 * so the move commits immediately — which the unit tests rely on.
 */
export class MoveAnimator {
  private engine: MoveEngine;

  constructor(engine: MoveEngine) {
    this.engine = engine;
  }

  /** Resolved duration (ms) for a base animation given current settings. */
  private duration(base: number): number {
    const s = useGameStore.getState().settings;
    if (!s.enableAnimations || s.animationSpeed <= 0) return 0;
    return Math.round(base * s.animationSpeed);
  }

  /**
   * Register a glide for `unitId` from (fromCol,fromRow)→(toCol,toRow), wait for
   * it to finish, and return the animation id (or null when instant). The caller
   * is responsible for removing the animation AFTER committing the engine move,
   * so the unit never snaps back to its old tile.
   */
  private async glide(
    unitId: string,
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number,
    baseDuration: number
  ): Promise<string | null> {
    const duration = this.duration(baseDuration);
    if (duration <= 0) return null;
    const id = `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    useGameStore.getState().actions.addMovementAnimation({
      id,
      unitId,
      fromCol,
      fromRow,
      toCol,
      toRow,
      startTime: performance.now(),
      duration,
    });
    await sleep(duration);
    return id;
  }

  /** Remove a movement animation by id (best-effort). */
  private removeAnimation(id: string | null): void {
    if (id) useGameStore.getState().actions.removeMovementAnimation(id);
  }

  /** Move a unit along a path (plain moves only), committing each step after its glide. */
  async moveAlongPath(
    unitId: string,
    steps: Array<{ col: number; row: number }>
  ): Promise<{ success: boolean; stepsCompleted: number }> {
    const store = useGameStore.getState();
    store.actions.setUnitAnimating(true);
    store.actions.setTurnButtonDisabled(true);
    let stepsCompleted = 0;
    try {
      for (const step of steps) {
        const unit = this.engine.units.find((u: Unit) => u.id === unitId);
        if (!unit || (unit.movesRemaining || 0) <= 0) break;
        if (!this.engine.canUnitMoveTo(unitId, step.col, step.row)) break;

        const animId = await this.glide(unitId, unit.col, unit.row, step.col, step.row, BASE_MOVE_DURATION);
        const result = this.engine.moveUnit(unitId, step.col, step.row);
        this.removeAnimation(animId);

        if (!result.success || result.reason === 'combat_victory' || result.reason === 'combat_defeat') break;
        stepsCompleted++;
      }
    } finally {
      store.actions.setUnitAnimating(false);
      store.actions.setTurnButtonDisabled(false);
    }
    return { success: stepsCompleted > 0, stepsCompleted };
  }

  /**
   * Attack an adjacent (or same-tile) enemy: lunge toward the target, commit the
   * combat, and recoil back if the attacker didn't advance (repelled/lost).
   */
  async attack(attackerId: string, targetCol: number, targetRow: number): Promise<{ success: boolean; reason?: string }> {
    const store = useGameStore.getState();
    const attacker = this.engine.units.find((u: Unit) => u.id === attackerId);
    if (!attacker) return { success: false, reason: 'unit_not_found' };
    if ((attacker.movesRemaining || 0) <= 0) return { success: false, reason: 'no_moves_left' };

    store.actions.setUnitAnimating(true);
    store.actions.setTurnButtonDisabled(true);
    try {
      const fromCol = attacker.col;
      const fromRow = attacker.row;
      const lungeId = await this.glide(attackerId, fromCol, fromRow, targetCol, targetRow, BASE_LUNGE_DURATION);
      const result = this.engine.moveUnit(attackerId, targetCol, targetRow);
      this.removeAnimation(lungeId);

      // If the attacker did not advance onto the target tile (it was repelled or
      // lost the attack), animate a short recoil back to its actual tile so it
      // doesn't snap from the lunge-end position.
      const after = this.engine.units.find((u: Unit) => u.id === attackerId);
      const advanced = !!after && after.col === targetCol && after.row === targetRow;
      if (!advanced && after && !(after as Unit).isDefeated) {
        const recoilId = await this.glide(attackerId, targetCol, targetRow, after.col, after.row, BASE_RECOIL_DURATION);
        this.removeAnimation(recoilId);
      }
      return result;
    } finally {
      store.actions.setUnitAnimating(false);
      store.actions.setTurnButtonDisabled(false);
    }
  }
}

export default MoveAnimator;
