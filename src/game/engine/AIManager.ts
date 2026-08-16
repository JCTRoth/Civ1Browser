/**
 * AIManager - Manages AI behavior for civilizations
 * 
 * Coordinates all AI subsystems: strategy selection, technology research,
 * army coordination, building production, and unit targeting.
 */

import { AIUtility, scanAreaForEnemies, findInterceptPosition, findPatrolWaypoint, type ThreatAlert } from './AIUtility';
import { EnemySearcher } from './EnemySearcher';
import { UNIT_PROPS, TERRAIN_PROPS } from '@/utils/Constants';
import { SettlementEvaluator } from './SettlementEvaluator';
import { AIStrategySelector } from './AIStrategySelector';
import { AICoordinator } from './AICoordinator';
import { AIResearch } from './AIResearch';
import {
  createDefaultAIState,
  type AIState,
  type StrategyProfile,
} from './AITypes';
import {
  assessCityThreat,
  calculateDangerThreshold,
  collectCityThreatSamples,
  computeCityGarrisonStrength,
  scoreEnemyTarget,
  type CityThreatAssessment
} from './AIStrategy';
import type { DiplomatAction } from './DiplomacyTypes';
import type { Unit, City } from '../../../types/game';

// How much better (in settlement-score points) the best location must be for a
// settler to keep walking instead of founding at its current tile. Prevents
// settlers from chasing the 10x10 window maximum forever — as the settler
// moves, the window re-centers and the "best" spot keeps moving ahead.
const SETTLE_SCORE_THRESHOLD = 12;
// If the best settlement location is farther than this Chebyshev distance,
// found at the current tile instead of walking across the map.
const MAX_SETTLE_WALK_DISTANCE = 4;

export class AIManager {
  private gameEngine: any;

  constructor(gameEngine: any) {
    this.gameEngine = gameEngine;
  }

  /**
   * Process AI turn for a civilization
   */
  async processAITurn(civilizationId: number) {
    const civ = this.gameEngine.civilizations[civilizationId];
    if (!civ) {
      console.warn(`[AI] processAITurn: Civilization ${civilizationId} not found`);
      return;
    }
    if (civ.isHuman) {
      console.log(`[AI] processAITurn: Skipping civilization ${civilizationId} - is human player`);
      return;
    }
    // Don't run AI while the game is paused
    if (this.gameEngine.isPaused) {
      console.warn(`[AI] processAITurn: Skipping civilization ${civilizationId} - game is paused`);
      return;
    }
    // CRITICAL: Only allow AI to act during its own turn
    if (this.gameEngine.activePlayer !== civilizationId) {
      console.warn(`[AI] processAITurn: Civilization ${civilizationId} attempted to act outside its turn (active player: ${this.gameEngine.activePlayer})`);
      return;
    }
    // Return promise so RoundManager can coordinate timeouts/end-of-turn
    return this.runAITurn(civilizationId).catch(err => console.error('AI turn error', err));
  }

  /**
   * Run an asynchronous AI turn for civilizationId
   */
  private async runAITurn(civilizationId: number) {
    const civ = this.gameEngine.civilizations[civilizationId];
    if (!civ || civ.isHuman) {
      console.log(`[AI] runAITurn: Skipping civilization ${civilizationId} - not AI or is human`);
      return;
    }
    // CRITICAL: Verify this is still the active player before proceeding
    if (this.gameEngine.activePlayer !== civilizationId) {
      console.warn(`[AI] runAITurn: Turn changed before AI could act (expected: ${civilizationId}, actual: ${this.gameEngine.activePlayer})`);
      return;
    }
    // Don't run AI while the game is paused
    if (this.gameEngine.isPaused) {
      console.warn(`[AI] runAITurn: Skipping civilization ${civilizationId} - game is paused`);
      return;
    }
    console.log(`[AI] 🤖 Starting AI turn for civilization ${civilizationId} (${civ.name})`);
    this.gameEngine.log('ai', `🤖 AI turn start — ${civ.name} (civ ${civilizationId})`);

    // Small delay before AI starts so player can observe
    await this.gameEngine.sleep(250);

    // The turn may have moved on during the delay (another path advanced the
    // phase chain). If we're no longer the active player, stop immediately —
    // continuing would process THIS civ's units on the WRONG player's turn
    // (turn-overlap), and the stale completion would advance the new player's
    // phases prematurely.
    if (this.gameEngine.activePlayer !== civilizationId) {
      console.warn(`[AI] runAITurn: Turn changed during AI start delay (expected: ${civilizationId}, actual: ${this.gameEngine.activePlayer}) — aborting stale AI turn`);
      return;
    }
    if (this.gameEngine.isPaused) {
      console.warn(`[AI] runAITurn: Game paused during AI start delay — aborting AI turn for civ ${civilizationId}`);
      return;
    }

    // ─── Phase 0: Initialize / retrieve AI state ───────────────────────
    const storage = this.gameEngine.getPlayerStorage?.(civilizationId);
    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;

    if (storage) {
      if (!storage.turnData) storage.turnData = {};
      if (!storage.turnData.aiState) {
        storage.turnData.aiState = createDefaultAIState();
        // Seed the research strategy from the civ's fixed production profile so
        // the AI researches in the same direction it produces.
        storage.turnData.aiState.strategyProfile =
          this.gameEngine.civilizations?.[civilizationId]?.productionProfile ?? 'balanced_growth';
      }
    }
    const aiState: AIState = storage?.turnData?.aiState ?? createDefaultAIState();

    // ─── Phase 1: Strategy evaluation ──────────────────────────────────
    const gameState = this.buildGameState(civilizationId);
    const newStrategy = AIStrategySelector.evaluateStrategy(civ, gameState, aiState);
    if (newStrategy !== aiState.strategyProfile) {
      console.log(`[AI] Strategy changed: ${aiState.strategyProfile} -> ${newStrategy} for civ ${civilizationId}`);
      this.gameEngine.log('ai', `Strategy change — ${civ.name}: ${aiState.strategyProfile} → ${newStrategy}`, { from: aiState.strategyProfile, to: newStrategy });
      aiState.strategyProfile = newStrategy;
      aiState.lastStrategyEvaluation = roundNumber;
    }

    // ─── Phase 2: Technology research ──────────────────────────────────
    if (!civ.currentResearch) {
      // selectResearch returns the chosen techId (string) or null.
      const techChoice = AIResearch.selectResearch(civ, aiState.strategyProfile, gameState);
      if (techChoice) {
        this.gameEngine.log('ai', `Research — ${civ.name} selects ${techChoice} (${aiState.strategyProfile})`, { tech: techChoice });
        console.log(`[AI] Research selected: ${techChoice}`);
        aiState.researchPriority = { techId: techChoice, score: 0, reason: 'strategy' };
        // Use GameEngine's setResearch to properly set the tech
        if (typeof this.gameEngine.setResearch === 'function') {
          this.gameEngine.setResearch(civilizationId, techChoice);
        }
      }
    }

    // ─── Phase 2b: Government upgrade ───────────────────────────────
    // When the civ has researched a better government tech, start a revolution.
    // (No-op while already in anarchy / revolting.)
    if (this.gameEngine.governmentManager) {
      const govManager = this.gameEngine.governmentManager;
      if (!govManager.isInRevolution(civ)) {
        const bestGov = govManager.bestGovernmentForCiv(civ);
        if (bestGov) {
          console.log(`[AI] ${civ.name} adopts ${bestGov} government (revolution)`);
          this.gameEngine.startRevolution(civilizationId, bestGov);
        }
      }
    }

    // ─── Phase 2c: AI Diplomacy ─────────────────────────────────────
    if (this.gameEngine.diplomacyManager) {
      this.gameEngine.diplomacyManager.processAIDiplomacy(civilizationId);
    }

    // ─── Phase 3: Update offensive plan & army groups ──────────────────
    this.updateOffensivePlan(civilizationId, storage, roundNumber);

    // Build army groups from known enemy positions
    const combatUnits = this.gameEngine.units.filter(
      (u: Unit) => u.civilizationId === civilizationId && this.isCombatUnit(u)
    );
    const targets = this.getKnownEnemyTargets(civilizationId, storage);

    if (combatUnits.length >= 3 && targets.length > 0) {
      const distFn = (c1: number, r1: number, c2: number, r2: number) =>
        this.gameEngine.squareGrid?.squareDistance(c1, r1, c2, r2) ?? Infinity;

      aiState.armyGroups = AICoordinator.formArmyGroups(
        combatUnits, targets, aiState.armyGroups, distFn
      );
      AICoordinator.updateGroupStatuses(
        aiState.armyGroups, combatUnits, distFn
      );
    }

    // Save updated state back
    if (storage?.turnData) {
      storage.turnData.aiState = aiState;
    }

    // ─── Phase 4: Process units ────────────────────────────────────────
    const aiUnits = this.gameEngine.units.filter((u: Unit) => u.civilizationId === civilizationId && (u.movesRemaining || 0) > 0);
    console.log(`[AI] Found ${aiUnits.length} units with moves remaining for civilization ${civilizationId}`);

    for (const unit of aiUnits) {
      // If the game was paused mid-AI-turn, stop processing further units.
      if (this.gameEngine.isPaused) {
        console.warn(`[AI] runAITurn: Game paused mid-turn — stopping AI for civ ${civilizationId}`);
        return;
      }

      // Skip units that no longer exist (died in combat, disbanded for upkeep,
      // or consumed by founding a city) — prevents the "Skip: Unit not found"
      // warning spam and wasted processing on ghost units.
      if (!this.gameEngine.units.includes(unit)) {
        continue;
      }

      console.log(`[AI] Processing unit ${unit.id} (${unit.type}) at (${unit.col},${unit.row}) with ${unit.movesRemaining} moves remaining`);

      // Safety: Prevent infinite loops by limiting iterations per unit
      let movementAttempts = 0;
      const MAX_MOVEMENT_ATTEMPTS = 50; // Reasonable limit for movement attempts
      let previousMoves = unit.movesRemaining;
      let stuckCounter = 0;
      const MAX_STUCK_ITERATIONS = 3; // If moves don't change for 3 iterations, unit is stuck

      // While this unit can move, pick targets and attempt actions
      while ((unit.movesRemaining || 0) > 0) {
        movementAttempts++;

        // Turn-overlap guard: if the TurnManager force-ended our turn (AI
        // timeout) and the next turn already started, STOP — otherwise we keep
        // moving units on the next player's turn (teleporting, moves reset, and
        // the stuck detector fires every turn).
        if (this.gameEngine.activePlayer !== civilizationId || this.gameEngine.isPaused) {
          console.log(`[AI] Turn ${civilizationId} ended mid-processing — stopping unit ${unit.id}`);
          break;
        }

        // Check if unit is stuck (moves not decreasing)
        if (unit.movesRemaining === previousMoves) {
          stuckCounter++;
          if (stuckCounter >= MAX_STUCK_ITERATIONS) {
            console.warn(`[AI] ⚠️ Unit ${unit.id} stuck - moves not decreasing after ${stuckCounter} iterations, forcing skip`);
            this.gameEngine.skipUnit(unit.id);
            break;
          }
        } else {
          stuckCounter = 0; // Reset stuck counter if moves changed
        }
        previousMoves = unit.movesRemaining;

        if (movementAttempts > MAX_MOVEMENT_ATTEMPTS) {
          console.warn(`[AI] ⚠️ Unit ${unit.id} exceeded maximum movement attempts (${MAX_MOVEMENT_ATTEMPTS}), forcing skip`);
          this.gameEngine.skipUnit(unit.id);
          break;
        }

        // Diplomats negotiate instead of fighting: the moment one stands next
        // to a foreign city or unit it performs its diplomatic action rather
        // than attacking (Civ I: diplomacy is initiated on physical contact).
        // The action consumes the diplomat's moves, ending its processing.
        if (unit.type === 'diplomat') {
          const diplomatInfo = this.gameEngine.getDiplomatActions?.(unit.id);
          if (diplomatInfo) {
            this.executeAIDiplomatAction(unit, diplomatInfo);
            break;
          }
        }

        // Civ1: an AI settler founds a city, improves its tile, or explores.
        // The settlement search runs here (cached for chooseAITarget below) so
        // founding takes priority; without a settlement spot the settler builds
        // a road/irrigation/mine/railroad on its current tile instead of
        // wandering. Multi-turn construction continues automatically each turn
        // (advanceUnitWork), so starting is enough.
        if (unit.type === 'settler' && !unit.workTarget) {
          let settlement: { col: number; row: number; score: number } | null = null;
          try {
            settlement = this.findBestSettlementForSettler(unit, aiState.strategyProfile);
          } catch (error) {
            console.error('[AI-SETTLER] Error in settlement search:', error);
          }
          if (!this.gameEngine.units.includes(unit)) break; // consumed by founding
          (unit as any)._aiSettlement = settlement;

          if (!settlement) {
            const improvement = this.chooseImprovementForSettler(unit);
            if (improvement) {
              const started = this.gameEngine.buildImprovement(unit.id, improvement);
              if (started) {
                console.log(`[AI-SETTLER] ${civ.name} settler ${unit.id} builds ${improvement} at (${unit.col},${unit.row})`);
                this.gameEngine.log('ai', `Settler improves — ${civ.name} builds ${improvement} at (${unit.col},${unit.row})`);
                break; // the settler worked its turn
              }
            }
          }
        }

        const target = this.chooseAITarget(unit);
        if (!target) {
          // No valid target, skip the unit's turn
          console.log(`[AI] No target found for unit ${unit.id}, skipping`);
          this.gameEngine.log('ai', `No target — ${civ.name} ${unit.type}(${unit.id}) skipped at (${unit.col},${unit.row})`);
          this.gameEngine.skipUnit(unit.id);
          break;
        }

        // Highlight chosen target
        this.highlightAITarget(target.col, target.row);

        // Special handling for settlers: found city when at target location.
        // MUST run before the generic "already at target" skip below — that
        // block (identical condition) used to shadow this one, turning a
        // settler that reached its spot into a skipped, never-founding unit.
        if (unit.type === 'settler' && unit.col === target.col && unit.row === target.row) {
          console.log(`[AI-SETTLER] Settler ${unit.id} has reached settlement location (${target.col}, ${target.row}), founding city`);
          this.gameEngine.log('ai', `Settler settles — ${civ.name} founds city at (${target.col},${target.row})`);
          const result = this.gameEngine.foundCityWithSettler(unit.id);
          if (result) {
            console.log(`[AI-SETTLER] City founded successfully`);
            break; // Settler consumed, end this unit's processing
          } else {
            console.log(`[AI-SETTLER] Failed to found city, skipping settler`);
            this.gameEngine.skipUnit(unit.id);
            break;
          }
        }

        // Target is the unit's own tile — it's already where it wants to be
        // (e.g. a scout garrisoning a threatened city via findScoutDefenseTarget).
        // Trying to "move" there makes the AI loop pathfind-to-self forever and
        // trip the stuck detector. Skip the unit cleanly instead.
        if (target.col === unit.col && target.row === unit.row) {
          console.log(`[AI] Unit ${unit.id} already at target (${target.col},${target.row}), skipping`);
          this.gameEngine.log('ai', `Already at target — ${civ.name} ${unit.type}(${unit.id}) holds (${target.col},${target.row})`);
          this.gameEngine.skipUnit(unit.id);
          break;
        }

        // If target is adjacent, try to move or attack
        const dist = this.gameEngine.squareGrid.squareDistance(unit.col, unit.row, target.col, target.row);
        console.log(`[AI] Target distance: ${dist} for unit ${unit.id} to (${target.col},${target.row})`);
        if (dist === 1) {
          const targetUnit = this.gameEngine.getUnitAt(target.col, target.row);
          if (targetUnit && targetUnit.civilizationId !== unit.civilizationId) {
            // Attack
            console.log(`[AI] Unit ${unit.id} attacking unit at (${target.col},${target.row})`);
            this.gameEngine.log('ai', `Attack — ${civ.name} ${unit.type}(${unit.id}) attacks enemy ${targetUnit.type} at (${target.col},${target.row})`);
            // Check move cost before attempting attack
            const tt = this.gameEngine.getTileAt(target.col, target.row);
            const attackCost = Math.max(1, TERRAIN_PROPS[tt?.type ?? '']?.movement ?? 1);
            if ((unit.movesRemaining || 0) >= attackCost) {
              this.gameEngine.combatUnit(unit, targetUnit);
            } else {
              console.log(`[AI] Not enough moves for attack (${unit.movesRemaining} < ${attackCost}), skipping`);
              this.gameEngine.skipUnit(unit.id);
              break;
            }
          } else {
            // Move into the tile
            const tt = this.gameEngine.getTileAt(target.col, target.row);
            const moveCost = Math.max(1, TERRAIN_PROPS[tt?.type ?? '']?.movement ?? 1);
            if ((unit.movesRemaining || 0) >= moveCost) {
              const r = this.gameEngine.moveUnit(unit.id, target.col, target.row);
              if (!r || !r.success) {
                console.log(`[AI] Move failed, skipping unit`);
                this.gameEngine.log('ai', `Move failed — ${civ.name} ${unit.type}(${unit.id}) to (${target.col},${target.row})`);
                this.gameEngine.skipUnit(unit.id);
                break;
              }
              this.gameEngine.log('ai', `Move — ${civ.name} ${unit.type}(${unit.id}) → (${target.col},${target.row})`);
            } else {
              console.log(`[AI] Not enough moves for move (${unit.movesRemaining} < ${moveCost}), skipping`);
              this.gameEngine.skipUnit(unit.id);
              break;
            }
          }
        } else {
          // Pathfind towards target and take next step
          console.log(`[AI] Pathfinding to non-adjacent target (${target.col},${target.row})`);
          const path = this.gameEngine.squareGrid.findPath(unit.col, unit.row, target.col, target.row, new Set());
          if (path.length > 1) {
            let next = path[1];
            console.log(`[AI] Path found, next step to (${next.col},${next.row}), path length: ${path.length}`);
            const tt = this.gameEngine.getTileAt(next.col, next.row);
            const moveCost = Math.max(1, TERRAIN_PROPS[tt?.type ?? '']?.movement ?? 1);
            if ((unit.movesRemaining || 0) < moveCost) {
              // A* routed the first step through a tile this unit cannot afford
              // (Civ1: a unit must pay the full movement cost of the tile it
              // enters). Fall back to the best affordable neighbor instead of
              // getting permanently stuck on the first step.
              const affordable = this.findAffordableStep(unit, target);
              if (!affordable) {
                console.log(`[AI] No affordable step for unit ${unit.id}, skipping`);
                this.gameEngine.skipUnit(unit.id);
                break;
              }
              next = affordable;
            }
            const r = this.gameEngine.moveUnit(unit.id, next.col, next.row);
            if (!r || !r.success) {
              console.log(`[AI] Path step failed, skipping unit`);
              this.gameEngine.skipUnit(unit.id);
              break;
            }
            this.gameEngine.log('ai', `Move — ${civ.name} ${unit.type}(${unit.id}) → (${next.col},${next.row}) toward (${target.col},${target.row})`);
          } else {
            console.log(`[AI] No path found to target, skipping unit`);
            this.gameEngine.skipUnit(unit.id);
            break;
          }
        }

        // Wait a little so moves are visible (skip in headless AI-vs-AI — the
        // 200ms per move adds up and trips the TurnManager AI timeout).
        const isAIVsAI = this.gameEngine.gameSettings?.mapType === 'AI_VS_AI';
        if (!isAIVsAI) {
          await this.gameEngine.sleep(200);
        }
      }
      console.log(`[AI] Finished processing unit ${unit.id}, final moves remaining: ${unit.movesRemaining}`);
    }

    console.log(`[AI] Finished all units for civilization ${civilizationId}`);
    // Emit event to clear highlights (UI decides how to handle)
    if (this.gameEngine.onStateChange) {
      this.gameEngine.onStateChange('AI_CLEAR_HIGHLIGHTS', { civilizationId });
    }

    // Process auto-production for AI cities
    console.log(`[AI] Processing auto-production for civilization ${civilizationId}`);
    this.gameEngine.autoProduction.processAutoProductionForCivilization(civilizationId);

    // Signal AI finished (for UI updates)
    console.log(`[AI] AI turn completed for civilization ${civilizationId}`);
    if (this.gameEngine.onStateChange) {
      this.gameEngine.onStateChange('AI_FINISHED', { civilizationId });
    }

    // RoundManager now responsible for evaluating end-of-turn and timeouts
  }

  /**
   * Find the best affordable next step toward a target for a unit whose
   * remaining movement cannot cover the A* path's first step. Civ1 units can
   * only enter tiles whose movement cost they can pay, so the AI picks the
   * cheapest affordable neighbor that reduces (or best limits) the distance to
   * the target. Returns null when the unit is genuinely boxed in.
   */
  private findAffordableStep(
    unit: { col: number; row: number; movesRemaining?: number; civilizationId?: number },
    target: { col: number; row: number },
  ): { col: number; row: number } | null {
    const grid = this.gameEngine.squareGrid;
    const movesLeft = unit.movesRemaining ?? 0;
    if (!grid || !grid.getNeighbors) return null;
    const neighbors = grid.getNeighbors(unit.col, unit.row);
    let best: { col: number; row: number } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const n of neighbors) {
      const tile = this.gameEngine.getTileAt(n.col, n.row);
      if (!tile) continue;
      const moveCost = Math.max(1, TERRAIN_PROPS[tile.type ?? '']?.movement ?? 1);
      if (moveCost > movesLeft) continue;
      // Avoid stepping onto an allied unit.
      const occupant = this.gameEngine.getUnitAt(n.col, n.row);
      if (occupant && occupant.civilizationId === unit.civilizationId) continue;
      // Prefer tiles that move closer to the target; tie-break by cost.
      const dist = grid.squareDistance(n.col, n.row, target.col, target.row);
      const score = dist * 10 + moveCost;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  /**
   * Choose a target for AI unit
   */
  private chooseAITarget(unit: any): { col: number; row: number } | null {
    if (!this.gameEngine.map || !this.gameEngine.squareGrid) return null;

    const storage = this.gameEngine.getPlayerStorage?.(unit.civilizationId);
    const aiState: AIState = storage?.turnData?.aiState ?? createDefaultAIState();

    // ── Retreat check for combat units ──
    if (this.isCombatUnit(unit)) {
      const localEnemyStrength = this.estimateLocalEnemyStrength(unit);
      const unitStrength = Math.max(1, unit.attack || 0) + (unit.defense || 0) * 0.5;
      const isInGroup = aiState.armyGroups.some(g => g.unitIds.includes(unit.id));

      if (AICoordinator.shouldRetreat(unitStrength, localEnemyStrength, isInGroup)) {
        console.log(`[AI] Unit ${unit.id} retreating (own: ${unitStrength.toFixed(1)}, enemy: ${localEnemyStrength.toFixed(1)})`);
        const friendlyCities = this.gameEngine.cities.filter((c: City) => c.civilizationId === unit.civilizationId);
        const distFn = (c1: number, r1: number, c2: number, r2: number) =>
          this.gameEngine.squareGrid?.squareDistance(c1, r1, c2, r2) ?? Infinity;
        const retreat = AICoordinator.getRetreatTarget(
          unit.col, unit.row, friendlyCities, aiState.armyGroups, distFn
        );
        if (retreat) return retreat;
      }
    }

    // ── Army group targeting for combat units ──
    if (this.isCombatUnit(unit)) {
      const groupTarget = AICoordinator.getGroupTarget(unit.id, aiState.armyGroups);
      if (groupTarget) {
        console.log(`[AI] Army group target for ${unit.id}: (${groupTarget.col},${groupTarget.row}) [${groupTarget.groupStatus}]`);
        return { col: groupTarget.col, row: groupTarget.row };
      }

      // ── Wide-area enemy scan (5-tile radius, respects diplomacy) ──
      const distFn = (c1: number, r1: number, c2: number, r2: number) =>
        this.gameEngine.squareGrid?.squareDistance(c1, r1, c2, r2) ?? Infinity;
      const dm = this.gameEngine.diplomacyManager;
      const nearbyEnemies = scanAreaForEnemies(
        unit.col, unit.row, unit.civilizationId, 5,
        () => this.gameEngine.units,
        () => this.gameEngine.cities,
        distFn
      ).filter(e => {
        // Only target civs we are at war with
        const targetCivId = this.getOwnerCivId(e);
        return targetCivId !== undefined && (!dm || dm.isAtWar(unit.civilizationId, targetCivId));
      });

      if (nearbyEnemies.length > 0) {
        const closest = nearbyEnemies[0];
        console.log(`[AI] Area scan found ${nearbyEnemies.length} enemies near ${unit.id}, closest: ${closest.type} at (${closest.col},${closest.row}) dist=${closest.distance}`);

        // Broadcast threat alert so other nearby units rally
        this.broadcastThreatAlert(unit.civilizationId, closest.col, closest.row, closest.strength, storage);

        // If enemy is adjacent, attack directly
        if (closest.distance === 1) {
          return { col: closest.col, row: closest.row };
        }

        // Move toward enemy using terrain-aware intercept
        const intercept = findInterceptPosition(
          unit.col, unit.row, closest.col, closest.row,
          (c, r) => this.gameEngine.squareGrid!.getNeighbors(c, r),
          (c, r) => this.gameEngine.getTileAt(c, r),
          (c, r) => this.gameEngine.getUnitAt(c, r),
          distFn
        );
        if (intercept) {
          console.log(`[AI] Intercepting enemy via defensive terrain at (${intercept.col},${intercept.row})`);
          return intercept;
        }

        // Direct move toward enemy
        return { col: closest.col, row: closest.row };
      }

      // ── Respond to threat alerts from allied units ──
      const alertTarget = this.getActiveAlertTarget(unit, storage);
      if (alertTarget) {
        console.log(`[AI] Unit ${unit.id} responding to threat alert at (${alertTarget.col},${alertTarget.row})`);
        return alertTarget;
      }

      // ── Defend threatened cities ──
      const strategicTarget = this.selectStrategicTarget(unit as Unit);
      if (strategicTarget) {
        console.log(`[AI] Strategic target chosen for ${unit.type} ${unit.id} -> (${strategicTarget.col}, ${strategicTarget.row})`);
        return strategicTarget;
      }

      // ── Patrol between cities when idle ──
      const patrolTarget = findPatrolWaypoint(
        unit, unit.col, unit.row,
        this.gameEngine.cities,
        unit.civilizationId,
        distFn
      );
      if (patrolTarget) {
        console.log(`[AI] Patrol waypoint for ${unit.id}: (${patrolTarget.col},${patrolTarget.row})`);
        return patrolTarget;
      }
    }

    // Diplomats head to a known foreign city to open negotiations (Civ I).
    if (unit.type === 'diplomat') {
      const diplomatTarget = this.chooseDiplomatTarget(unit);
      if (diplomatTarget) {
        console.log(`[AI-DIPLOMAT] Diplomat ${unit.id} heading to foreign city (${diplomatTarget.col},${diplomatTarget.row})`);
        return diplomatTarget;
      }
      // No known foreign city — fall through and explore like other civilians.
    }

    // Special handling for settlers: the movement loop's settler interception
    // already ran the settlement search this turn and cached the result here,
    // so founding a city takes priority over everything else. When no spot was
    // found (and no improvement to build) the settler falls through and
    // explores like any other civilian.
    if (unit.type === 'settler') {
      const cached = (unit as any)._aiSettlement;
      if (cached) {
        console.log(`[AI-SETTLER] Settler ${unit.id} heading to settlement (${cached.col},${cached.row})`);
        return { col: cached.col, row: cached.row };
      }
    }

    // Special handling for scouts: use EnemySearcher to find enemies
    if (unit.type === 'scout') {
      console.log(`[AI-SCOUT] Scout detected at (${unit.col}, ${unit.row}), checking for enemies`);

      // Defense override: exploration is less important than garrisoning an
      // undefended friendly city while an enemy is close. When the threat
      // clears (enemy gone or other troops arrive) this returns null and the
      // scout resumes exploring.
      try {
        const defenseTarget = this.findScoutDefenseTarget(unit);
        if (defenseTarget) {
          console.log(`[AI-SCOUT] Defending undefended city at (${defenseTarget.col},${defenseTarget.row}) — enemy close`);
          return defenseTarget;
        }
      } catch (error) {
        console.error(`[AI-SCOUT] Error in scout defense check:`, error);
      }

      try {
        // Check if scout already found an enemy (stored in unit state)
        if (unit.enemyFound) {
          console.log(`[AI-SCOUT] Scout ${unit.id} has found enemy, returning to nearest city`);
          const nearestCity = AIUtility.findNearestOwnCity(
            unit.col,
            unit.row,
            unit.civilizationId,
            this.gameEngine.cities,
            (col1, row1, col2, row2) => this.gameEngine.squareGrid!.squareDistance(col1, row1, col2, row2)
          );
          if (nearestCity) {
            console.log(`[AI-SCOUT] Scout returning to nearest city at (${nearestCity.col}, ${nearestCity.row})`);
            return { col: nearestCity.col, row: nearestCity.row };
          }
        }

        // Phase 1: Initialize scout zones for this civilization
        this.gameEngine.assignScoutZones(unit.civilizationId);

        // Find this scout's zone index
        const scouts = this.gameEngine.units.filter((u: Unit) => u.civilizationId === unit.civilizationId && u.type === 'scout');
        const scoutIndex = scouts.findIndex(s => s.id === unit.id);
        console.log(`[AI-SCOUT] Scout ${scoutIndex + 1}/${scouts.length} searching zone ${scoutIndex}`);

        // Get visibility check function - use per-player visibility storage
        const playerStorage = this.gameEngine.getPlayerStorage(unit.civilizationId);
        const isVisible = (col: number, row: number) => {
          if (playerStorage) {
            const idx = row * this.gameEngine.map!.width + col;
            return playerStorage.visibility[idx] || playerStorage.explored[idx] || false;
          }
          // Fallback to tile visibility if storage not available
          const tile = this.gameEngine.getTileAt(col, row);
          return tile && (tile.visible || tile.explored);
        };

        // Phase 1 & 4: Search only within scout's assigned zone with performance monitoring
        const enemyResult = this.gameEngine.measurePerformance('Scout enemy search', () =>
          EnemySearcher.findNearestEnemy(
            unit.col,
            unit.row,
            this.gameEngine.map.width,
            this.gameEngine.map.height,
            (col, row) => {
              // Filter getUnitAt results to zone boundary
              if (scoutIndex >= 0 && !this.gameEngine.isInScoutZone(unit.civilizationId, scoutIndex, col, row)) return null;
              return this.gameEngine.getUnitAt(col, row);
            },
            (col, row) => {
              // Filter getCityAt results to zone boundary
              if (scoutIndex >= 0 && !this.gameEngine.isInScoutZone(unit.civilizationId, scoutIndex, col, row)) return null;
              return this.gameEngine.getCityAt(col, row);
            },
            isVisible,
            unit.civilizationId
          )
        );

        if (enemyResult) {
          console.log(`[AI-SCOUT] Enemy ${enemyResult.targetType} found at (${enemyResult.col}, ${enemyResult.row}), distance: ${enemyResult.distance}`);

          // Phase 3.3: Check if this enemy was already discovered by another scout
          const storage = this.gameEngine.getPlayerStorage(unit.civilizationId);
          let alreadyKnown = false;
          if (storage) {
            // Get enemy civilization ID
            let enemyCivId = -1;
            if (enemyResult.targetType === 'unit') {
              const unit = this.gameEngine.getUnitAt(enemyResult.col, enemyResult.row);
              if (unit) enemyCivId = unit.civilizationId;
            } else if (enemyResult.targetType === 'city') {
              const city = this.gameEngine.getCityAt(enemyResult.col, enemyResult.row);
              if (city) enemyCivId = city.civilizationId;
            }

            if (enemyCivId >= 0 && storage.enemyLocations.has(enemyCivId)) {
              const existing = storage.enemyLocations.get(enemyCivId)!.find(e => e.id === enemyResult.targetId);
              if (existing) {
                alreadyKnown = true;
                console.log(`[AI-SCOUT] Enemy ${enemyResult.targetType} at (${enemyResult.col}, ${enemyResult.row}) already known, updating last seen`);
                existing.lastSeenRound = this.gameEngine.roundManager.getRoundNumber();
              }
            }
          }

          if (!alreadyKnown) {
            // Store enemy location in player storage for civilization-wide decision making
            this.gameEngine.recordEnemyLocation(unit.civilizationId, enemyResult);

            // Civ1: a scout that spots a lone enemy UNIT keeps exploring — the
            // army handles units. Only an enemy CITY is valuable enough to
            // report home (it feeds the offensive plan so the army can
            // besiege it). Previously the scout returned home on ANY enemy
            // contact, so enemy cities were never recorded and the AI never
            // laid siege (its armies only ever chased dead unit locations).
            if (enemyResult.targetType === 'city') {
              // Mark that scout found enemy
              unit.enemyFound = true;
              unit.enemyLocation = { col: enemyResult.col, row: enemyResult.row };

              // Start returning to nearest city
              const nearestCity = AIUtility.findNearestOwnCity(
                unit.col,
                unit.row,
                unit.civilizationId,
                this.gameEngine.cities,
                (col1, row1, col2, row2) => this.gameEngine.squareGrid!.squareDistance(col1, row1, col2, row2)
              );
              if (nearestCity) {
                console.log(`[AI-SCOUT] Scout returning to nearest city at (${nearestCity.col}, ${nearestCity.row})`);
                return { col: nearestCity.col, row: nearestCity.row };
              }
            }
            // Enemy unit spotted: record it for the army, then keep exploring
            // (fall through to the zone search below) to find their cities.
          }
        } else {
          console.log(`[AI-SCOUT] No enemy found near (${unit.col}, ${unit.row}), continuing exploration`);
        }
      } catch (error) {
        console.error(`[AI-SCOUT] Error using EnemySearcher:`, error);
      }
    }

    // 1) Nearby enemy unit (check before exploration for combat awareness)
    const enemy = AIUtility.findNearbyEnemy(
      unit.col,
      unit.row,
      unit.civilizationId,
      (col, row) => this.gameEngine.squareGrid!.getNeighbors(col, row),
      (col, row) => this.gameEngine.getUnitAt(col, row)
    );
    if (enemy) {
      console.log(`[AI] Chose enemy unit at (${enemy.col},${enemy.row})`);
      return { col: enemy.col, row: enemy.row };
    }

    // 2) Nearby unexplored tile
    const unexplored = AIUtility.findNearbyUnexplored(
      unit.col,
      unit.row,
      (col, row) => this.gameEngine.squareGrid!.getNeighbors(col, row),
      (col, row) => this.gameEngine.getTileAt(col, row),
      (col, row) => this.gameEngine.isTilePassable?.(col, row) ?? true,
      (col, row) => typeof this.gameEngine.isExploredByPlayer === 'function'
        ? this.gameEngine.isExploredByPlayer(unit.civilizationId, col, row)
        : !!this.gameEngine.getTileAt(col, row)?.explored
    );
    if (unexplored) {
      console.log(`[AI] Chose unexplored tile at (${unexplored.col},${unexplored.row})`);
      return { col: unexplored.col, row: unexplored.row };
    }

    // ScoutMemory: re-scout stale enemy positions if no immediate exploration targets.
    // Scans discoveries of ALL enemy civs (previously it searched the scout's OWN
    // civ id, which never matched anything).
    if (unit.type === 'scout' && this.gameEngine.scoutMemory) {
      const staleTarget = this.gameEngine.scoutMemory.getNearestStaleTarget?.(
        unit.col, unit.row, unit.civilizationId
      );
      if (staleTarget) {
        console.log(`[AI-SCOUT] ScoutMemory target at (${staleTarget.col},${staleTarget.row})`);
        return { col: staleTarget.col, row: staleTarget.row };
      }
    }

    // Special exploration logic for scouts when no immediate unexplored tiles
    if (unit.type === 'scout') {
      const scoutExplorationTarget = this.findScoutExplorationTarget(unit);
      if (scoutExplorationTarget) {
        console.log(`[AI-SCOUT] Chose exploration target at (${scoutExplorationTarget.col},${scoutExplorationTarget.row})`);
        return { col: scoutExplorationTarget.col, row: scoutExplorationTarget.row };
      }
    }

    // 3) Choose best neighbor based on terrain cost
    console.log(`[AI] No unexplored or enemy targets found, choosing best neighbor`);

    const neighbors = this.gameEngine.squareGrid.getNeighbors(unit.col, unit.row);
    const terrainAnalysis = AIUtility.analyzeSurroundingTerrain(
      unit.col,
      unit.row,
      neighbors,
      (col, row) => this.gameEngine.getTileAt(col, row),
      (col, row) => this.gameEngine.getUnitAt(col, row),
      (col, row) => this.gameEngine.squareGrid!.isValidSquare(col, row)
    );

    if (terrainAnalysis.passableMoves.length > 0) {
      console.log(`[AI] Terrain analysis: ${terrainAnalysis.passableMoves.length} passable tiles, min cost: ${terrainAnalysis.minCost}, avg cost: ${terrainAnalysis.averageCost.toFixed(1)}`);

      const bestMove = AIUtility.chooseBestMove(terrainAnalysis);
      if (bestMove) {
        const terrainName = AIUtility.getTerrainName(bestMove.terrainType);
        console.log(`[AI] Chose best neighbor at (${bestMove.col},${bestMove.row}) - ${terrainName} (cost: ${bestMove.moveCost})`);
        return { col: bestMove.col, row: bestMove.row };
      }
    }

    console.log(`[AI] No valid target found for unit ${unit.id}`);
    return null;
  }

  // ─── AI diplomat units (Civ I: diplomats move to an enemy city/unit to
  //      initiate diplomacy) ───────────────────────────────────────────

  /**
   * Pick a destination for an AI diplomat: the nearest foreign city the civ
   * knows about. Civs we are NOT at war with are preferred (a diplomat walking
   * into a war zone is wasted); among those, pick the nearest.
   */
  private chooseDiplomatTarget(unit: any): { col: number; row: number } | null {
    const civId = unit.civilizationId;
    const storage = this.gameEngine.getPlayerStorage?.(civId);
    const dm = this.gameEngine.diplomacyManager;
    const squareDistance = (c1: number, r1: number, c2: number, r2: number) =>
      this.gameEngine.squareGrid?.squareDistance(c1, r1, c2, r2) ?? Infinity;

    const candidates: Array<{ col: number; row: number; civId: number; distance: number }> = [];

    // 1) Known enemy cities recorded by scouts.
    if (storage?.enemyLocations instanceof Map) {
      for (const [enemyCivId, locations] of storage.enemyLocations.entries()) {
        if (enemyCivId === civId) continue;
        for (const loc of locations) {
          if (loc.type !== 'city') continue;
          candidates.push({
            col: loc.col,
            row: loc.row,
            civId: enemyCivId,
            distance: squareDistance(unit.col, unit.row, loc.col, loc.row),
          });
        }
      }
    }

    // 2) Foreign cities this civ has already explored (belt & braces — scouts
    //    may not have recorded every one).
    if (this.gameEngine.cities) {
      for (const city of this.gameEngine.cities) {
        if (city.civilizationId === civId) continue;
        if (typeof this.gameEngine.isExploredByPlayer === 'function' &&
            !this.gameEngine.isExploredByPlayer(civId, city.col, city.row)) continue;
        if (candidates.some(c => c.col === city.col && c.row === city.row)) continue;
        candidates.push({
          col: city.col,
          row: city.row,
          civId: city.civilizationId,
          distance: squareDistance(unit.col, unit.row, city.col, city.row),
        });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.distance - b.distance);
    const atPeace = candidates.filter(c => !dm?.isAtWar(civId, c.civId));
    return (atPeace.length > 0 ? atPeace : candidates)[0];
  }

  /**
   * Choose which diplomatic action an AI diplomat performs on contact with a
   * foreign civ — mirrors `processAIDiplomacy`'s decision logic (peace when
   * outmatched, alliance when friendly, tribute when dominant, else intel).
   */
  private chooseDiplomatAction(unit: any, targetCivId: number, available: string[]): string {
    const civId = unit.civilizationId;
    const dm = this.gameEngine.diplomacyManager;
    const ownStrength = dm?.estimateMilitaryStrength?.(civId) ?? 0;
    const theirStrength = dm?.estimateMilitaryStrength?.(targetCivId) ?? 0;
    const attitude = dm?.getAttitude?.(civId, targetCivId) ?? 'neutral';
    const status = dm?.getStatus?.(civId, targetCivId) ?? 'peace';
    const personality = (this.gameEngine.civilizations?.[civId] as any)?.personality
      ?? { aggression: 5, diplomacy: 5, military: 5 };
    const has = (a: string) => available.includes(a);

    if (status === 'war') {
      // Outmatched → sue for peace outright; otherwise a ceasefire.
      if (theirStrength > ownStrength * 1.3 && has('propose_peace')) return 'propose_peace';
      if (has('propose_ceasefire')) return 'propose_ceasefire';
      if (has('propose_peace')) return 'propose_peace';
    } else if (status === 'ceasefire') {
      if (has('propose_peace')) return 'propose_peace';
    } else if (status === 'peace') {
      // Alliance if friendly + comparable strength + a diplomatic leader.
      const ratio = Math.min(ownStrength, theirStrength) / Math.max(ownStrength, theirStrength, 1);
      if (attitude === 'friendly' && ratio > 0.5 && personality.diplomacy >= 6 && has('propose_alliance')) return 'propose_alliance';
      // Otherwise demand tribute when clearly stronger.
      if (personality.aggression >= 6 && ownStrength > theirStrength * 2 && has('demand_tribute')) return 'demand_tribute';
    }

    return 'gather_intelligence';
  }

  /**
   * The tribute an AI diplomat demands (same formula as processAIDiplomacy).
   */
  private diplomatTributeDemand(unit: any, targetCivId: number): number {
    const dm = this.gameEngine.diplomacyManager;
    const ownStrength = dm?.estimateMilitaryStrength?.(unit.civilizationId) ?? 0;
    const theirStrength = dm?.estimateMilitaryStrength?.(targetCivId) ?? 0;
    return Math.max(25, Math.floor((ownStrength / Math.max(theirStrength, 1)) * 20));
  }

  /**
   * Execute an AI diplomat's action when adjacent to a foreign city/unit.
   * Human targets get an interactive offer (negotiation screen); AI targets
   * resolve through the normal proposal path.
   */
  private executeAIDiplomatAction(unit: any, info: { targetCivId: number; actions: string[] }): void {
    const civId = unit.civilizationId;
    const targetCivId = info.targetCivId;
    const civ = this.gameEngine.civilizations?.[civId];
    const targetCiv = this.gameEngine.civilizations?.[targetCivId];
    const civName = civ?.name ?? `Civ ${civId}`;
    const action = this.chooseDiplomatAction(unit, targetCivId, info.actions);

    console.log(`[AI-DIPLOMAT] ${civName} diplomat at (${unit.col},${unit.row}) contacting ${targetCiv?.name ?? targetCivId} → ${action}`);

    if (targetCiv?.isHuman === true) {
      // The human decides — surface an interactive offer, consume the move.
      if (action === 'gather_intelligence') {
        this.gameEngine.executeDiplomatAction?.(unit.id, 'gather_intelligence', targetCivId);
      } else {
        const gold = action === 'demand_tribute' ? this.diplomatTributeDemand(unit, targetCivId) : undefined;
        this.gameEngine.diplomacyManager?.presentOffer?.(
          civId, targetCivId, action as unknown as DiplomatAction, gold,
          `${civName}'s diplomat proposes ${action.replace(/_/g, ' ')}.`,
        );
        unit.movesRemaining = 0;
      }
    } else {
      this.gameEngine.executeDiplomatAction?.(unit.id, action, targetCivId);
    }

    this.gameEngine.log?.('ai', `Diplomat — ${civName} ${action.replace(/_/g, ' ')} with ${targetCiv?.name ?? targetCivId}`);
  }

  /**
   * Decide whether an AI settler should improve the tile it stands on (Civ1),
   * returning the improvement type or null. Only tiles near a friendly city
   * are improved (so the effort feeds the economy instead of decorating the
   * wilderness), and the civ keeps an improvement budget so settlers don't
   * spend forever re-rolling the same tiles.
   *
   * Priority: production (mines on hills/mountains) > food (irrigation near
   * fresh water on fertile tiles) > railroad > road.
   */
  private chooseImprovementForSettler(unit: any): string | null {
    const civId = unit.civilizationId;
    const tile = this.gameEngine.getTileAt(unit.col, unit.row);
    if (!tile) return null;
    const terrain = tile.terrain || tile.type || '';
    if (terrain === 'ocean' || terrain === 'arctic') return null;

    // Only improve tiles within a few tiles of a friendly city (working radius
    // plus a small margin) — roads/farms/mines there actually feed the civ.
    const nearCity = this.gameEngine.cities.some((c: City) =>
      c.civilizationId === civId &&
      this.gameEngine.squareGrid.squareDistance(unit.col, unit.row, c.col, c.row) <= 4
    );
    if (!nearCity) return null;

    // Improvement budget: at most ~2 improvements per city, so a big civ does
    // not funnel every spare settler into endless road building.
    const friendlyCities = this.gameEngine.cities.filter((c: City) => c.civilizationId === civId).length;
    const budget = Math.max(2, friendlyCities * 2);
    const ownImprovements = (this.gameEngine.map?.tiles ?? []).filter((t: any) =>
      !!t.improvement && ['road', 'railroad', 'mines', 'irrigation', 'fortress'].includes(t.improvement) &&
      this.gameEngine.cities.some((c: City) =>
        c.civilizationId === civId &&
        this.gameEngine.squareGrid.squareDistance(t.col, t.row, c.col, c.row) <= 4
      )
    ).length;
    if (ownImprovements >= budget) return null;

    if ((terrain === 'hills' || terrain === 'mountains') &&
        this.gameEngine.canBuildImprovement(unit.id, 'mine')) {
      return 'mine';
    }
    if (['grassland', 'plains', 'desert', 'jungle', 'swamp'].includes(terrain) &&
        this.gameEngine.canBuildImprovement(unit.id, 'irrigation')) {
      return 'irrigation';
    }
    if (this.gameEngine.canBuildImprovement(unit.id, 'railroad')) return 'railroad';
    if (this.gameEngine.canBuildImprovement(unit.id, 'road')) return 'road';
    return null;
  }

  /**
   * Find best settlement location for a settler
   */
  private findBestSettlementForSettler(unit: any, strategy: StrategyProfile = 'balanced_growth'): { col: number; row: number; score: number } | null {
    console.log(`[AI-SETTLER] Evaluating settlement locations for settler at (${unit.col}, ${unit.row})`);

    // Track position history to detect oscillation
    if (!(unit as any)._positionHistory) {
      (unit as any)._positionHistory = [];
    }
    const history = (unit as any)._positionHistory;
    const currentPos = `${unit.col},${unit.row}`;

    // Add current position to history
    history.push(currentPos);

    // Keep only last 6 positions
    if (history.length > 6) {
      history.shift();
    }

    // Detect oscillation: if we've visited the same position 3+ times in last 6 moves, we're oscillating
    const positionCounts = history.reduce((acc: Record<string, number>, pos: string) => {
      acc[pos] = (acc[pos] || 0) + 1;
      return acc;
    }, {});

    const isOscillating = Object.values(positionCounts).some((count: number) => count >= 3);

    // First, check if current location is a good settlement spot
    const currentTile = this.gameEngine.getTileAt(unit.col, unit.row);
    const currentCity = this.gameEngine.getCityAt(unit.col, unit.row);

    // Check if current position is valid for settling
    const currentPosValid = currentTile &&
        currentTile.type !== 'ocean' &&
        currentTile.type !== 'mountains' &&
        !currentCity;

    if (currentPosValid && isOscillating) {
      console.log(`[AI-SETTLER] 🔄 Oscillation detected! Position history: ${history.join(' -> ')}`);
      console.log(`[AI-SETTLER] Founding city at current location to break oscillation`);
      // Directly found city here instead of returning target
      this.gameEngine.foundCityWithSettler(unit.id);
      return null;
    }

    // Choose appropriate weights based on strategy
    const weights = this.getSettlementWeightsForStrategy(strategy);
    console.log(`[AI-SETTLER] Using strategy: ${strategy} with weights:`, weights);

    // Use SettlementEvaluator to find best location
    const bestLocation = SettlementEvaluator.findBestSettlementLocation(
      unit.col,
      unit.row,
      (col, row) => this.gameEngine.getTileAt(col, row),
      (col, row) => this.gameEngine.getCityAt(col, row),
      (col, row) => this.gameEngine.getUnitAt(col, row),
      weights,
      3, // minDistanceFromOtherCities
      unit.civilizationId,
      (col, row) => {
        // Check visibility - AI can only settle on visible tiles
        const tile = this.gameEngine.getTileAt(col, row);
        return tile && (tile.visible || tile.explored);
      },
      (fromCol, fromRow, toCol, toRow) => {
        // Check if settler can reach the location (simple path check)
        if (!this.gameEngine.squareGrid) return false;
        const path = this.gameEngine.squareGrid.findPath(fromCol, fromRow, toCol, toRow, new Set());
        return path.length > 0;
      }
    );

    if (bestLocation) {
      console.log(`[AI-SETTLER] Best settlement location found: (${bestLocation.col}, ${bestLocation.row})`);
      console.log(`[AI-SETTLER] Score: ${bestLocation.score}, Yields:`, bestLocation.yields);
      console.log(`[AI-SETTLER] Water access: ${bestLocation.hasWaterAccess}`);

      // ── "Good enough" settling ────────────────────────────────────────────
      // The 10x10 search re-centers on the settler every turn, so the best
      // tile keeps moving ahead as the settler walks toward it — the old code
      // chased that moving maximum forever and only founded via the 3-visit
      // oscillation breaker (cities appeared after 100+ rounds, if at all).
      // Instead: found at the current tile unless the best location is clearly
      // better AND close enough to bother walking to.
      if (currentPosValid) {
        const currentScore = SettlementEvaluator.scoreLocation(
          unit.col,
          unit.row,
          (col, row) => this.gameEngine.getTileAt(col, row),
          (col, row) => this.gameEngine.getCityAt(col, row),
          (col, row) => this.gameEngine.getUnitAt(col, row),
          weights,
          unit.civilizationId,
          unit.col,
          unit.row
        );
        const bestDist = Math.max(
          Math.abs(bestLocation.col - unit.col),
          Math.abs(bestLocation.row - unit.row)
        );
        const bestClearlyBetter = currentScore !== null &&
          bestLocation.score - currentScore > SETTLE_SCORE_THRESHOLD;
        const bestIsFar = bestDist > MAX_SETTLE_WALK_DISTANCE;

        if (currentScore !== null && (!bestClearlyBetter || bestIsFar)) {
          console.log(`[AI-SETTLER] 🏙 Current tile good enough (current=${currentScore.toFixed(1)}, best=${bestLocation.score.toFixed(1)}, bestDist=${bestDist}) — founding city here`);
          this.gameEngine.foundCityWithSettler(unit.id);
          return null;
        }
        console.log(`[AI-SETTLER] Best location clearly better (current=${currentScore?.toFixed(1)}, best=${bestLocation.score.toFixed(1)}, bestDist=${bestDist}) — walking there`);
      }

      // If we have a pathfinding grid available, precompute and store a path
      try {
        if (this.gameEngine.squareGrid && this.gameEngine.roundManager) {
          const path = this.gameEngine.squareGrid.findPath(unit.col, unit.row, bestLocation.col, bestLocation.row, new Set());
          if (path && path.length > 0) {
            console.log(`[AI-SETTLER] Precomputed path for settler ${unit.id} with ${path.length} steps`);
            this.gameEngine.roundManager.setUnitPath(unit.id, path);
          } else {
            console.log(`[AI-SETTLER] No path found to best location for settler ${unit.id}`);
          }
        }
      } catch (e) {
        console.error('[AI-SETTLER] Error while precomputing path for settler:', e);
      }

      // Check if settler is already at the best location
      if (bestLocation.col === unit.col && bestLocation.row === unit.row) {
        console.log(`[AI-SETTLER] Settler is already at best location, will found city`);
        // Found city immediately
        this.gameEngine.foundCityWithSettler(unit.id);
        return null; // No need to move
      }

      // Store target to detect oscillation on next evaluation
      (unit as any)._lastSettlementTarget = { col: bestLocation.col, row: bestLocation.row };

      return bestLocation;
    }

    // No suitable location found in the window — if the settler is standing on
    // a valid tile (the window search can fail due to the reachability check,
    // e.g. findPath to the settler's own tile returning empty), just found the
    // city here instead of wandering forever.
    if (currentPosValid) {
      console.log(`[AI-SETTLER] No better location found, founding city at current tile (${unit.col}, ${unit.row})`);
      this.gameEngine.foundCityWithSettler(unit.id);
      return null;
    }

    console.log(`[AI-SETTLER] No suitable settlement location found`);
    return null;
  }

  /**
   * Scout defense override: if a friendly city within response range has no
   * other defender and an enemy is close, garrison the city tile. Exploration
   * is lower priority than defending an exposed city. Returns null (so the
   * scout keeps exploring) when the city is defended, no enemy is near, or
   * the scout is too far away. Re-evaluated every turn, so the scout resumes
   * exploring automatically once the enemy leaves or other troops arrive.
   */
  public findScoutDefenseTarget(unit: Unit): { col: number; row: number } | null {
    if (!this.gameEngine.squareGrid || !this.gameEngine.map) return null;

    const civId = unit.civilizationId;
    const storage = this.gameEngine.getPlayerStorage?.(civId);
    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    const distFn = (c1: number, r1: number, c2: number, r2: number) =>
      this.gameEngine.squareGrid.squareDistance(c1, r1, c2, r2);

    const SCOUT_DEFENSE_RESPONSE_RADIUS = 8;
    const SCOUT_DEFENSE_ENEMY_RADIUS = 3;

    const friendlyCities = this.gameEngine.cities.filter((c: City) => c.civilizationId === civId);
    let bestTarget: { col: number; row: number } | null = null;
    let bestThreat = -Infinity;

    for (const city of friendlyCities) {
      // The scout must be reasonably close to respond (no cross-map teleport).
      const scoutDist = distFn(unit.col, unit.row, city.col, city.row);
      if (scoutDist > SCOUT_DEFENSE_RESPONSE_RADIUS) continue;

      // City already has another defender (non-scout) in/near it.
      const hasOtherDefender = this.gameEngine.units.some((u: Unit) =>
        u.civilizationId === civId &&
        u.id !== unit.id &&
        u.type !== 'scout' &&
        this.isDefensiveUnit(u) &&
        distFn(u.col, u.row, city.col, city.row) <= 1
      );
      if (hasOtherDefender) continue;

      // Is an enemy close to the city? (visible units + recent known locations)
      const samples = collectCityThreatSamples(this.gameEngine, city, civId, storage, roundNumber);
      const closeEnemy = samples.find(s => s.distance <= SCOUT_DEFENSE_ENEMY_RADIUS);
      if (!closeEnemy) continue;

      // Prefer the most threatened city we can respond to.
      const threat = Math.max(0, SCOUT_DEFENSE_ENEMY_RADIUS - closeEnemy.distance);
      if (threat <= bestThreat) continue;
      bestThreat = threat;

      // Garrison the city tile when free; otherwise the nearest passable neighbor.
      const cityUnit = this.gameEngine.getUnitAt?.(city.col, city.row);
      const cityOccupied = !!cityUnit && cityUnit.civilizationId !== civId;
      if (!cityOccupied) {
        bestTarget = { col: city.col, row: city.row };
      } else {
        const neighbors = this.gameEngine.squareGrid.getNeighbors(city.col, city.row);
        const passable = neighbors.find((n: { col: number; row: number }) => {
          const tile = this.gameEngine.getTileAt?.(n.col, n.row);
          return tile && tile.passable !== false && !this.gameEngine.getUnitAt?.(n.col, n.row);
        });
        if (passable) bestTarget = { col: passable.col, row: passable.row };
      }
    }

    return bestTarget;
  }

  /** A unit that can actually defend a city (non-civilian, non-scout, has defense). */
  private isDefensiveUnit(u: Unit): boolean {
    const civilian = new Set(['settler', 'worker', 'caravan', 'diplomat', 'scout']);
    if (civilian.has(u.type)) return false;
    const props = UNIT_PROPS[u.type];
    return !!props && (props.defense || 0) > 0;
  }

  /**
   * Find exploration target for scouts within their zone
   */
  private findScoutExplorationTarget(unit: any): any {
    if (!this.gameEngine.map || !this.gameEngine.squareGrid) return null;

    // Get scout's zone
    const scouts = this.gameEngine.units.filter((u: Unit) => u.civilizationId === unit.civilizationId && u.type === 'scout');
    const scoutIndex = scouts.findIndex(s => s.id === unit.id);

    if (scoutIndex < 0) return null;

    const storage = this.gameEngine.getPlayerStorage(unit.civilizationId);
    if (!storage || !storage.scoutZones[scoutIndex]) return null;

    const zone = storage.scoutZones[scoutIndex];

    // Find the nearest unexplored, passable tiles within the scout's zone.
    // Ties are broken RANDOMLY: the previous code kept the first (smallest
    // row) — a systematic bias that made every scout drift toward the TOP map
    // edge, where it then got stuck trying to reach impassable row-0 tiles.
    let nearestCandidates: Array<{ col: number; row: number }> = [];
    let minDistance = Infinity;

    // Search within zone boundaries (limit search to avoid performance issues)
    const searchRadius = 10; // Search up to 10 tiles away
    const startCol = Math.max(zone.minCol, unit.col - searchRadius);
    const endCol = Math.min(zone.maxCol, unit.col + searchRadius);
    const startRow = Math.max(zone.minRow, unit.row - searchRadius);
    const endRow = Math.min(zone.maxRow, unit.row + searchRadius);

    for (let col = startCol; col < endCol; col++) {
      for (let row = startRow; row < endRow; row++) {
        // Check if tile is in zone
        if (!this.gameEngine.isInScoutZone(unit.civilizationId, scoutIndex, col, row)) continue;

        const tile = this.gameEngine.getTileAt(col, row);
        if (!tile) continue;

        // Prefer per-player explored state so each scout targets ITS OWN
        // unexplored areas. (AI reveals are stored per-player; the global
        // `tile.explored` is never set for AI moves, so we must not fall back
        // to it — that made every tile look unexplored and the scout oscillate
        // between two tiles at the map edge.)
        const isExplored = typeof this.gameEngine.isExploredByPlayer === 'function'
          ? this.gameEngine.isExploredByPlayer(unit.civilizationId, col, row)
          : !!tile.explored;
        if (isExplored) continue;

        // Skip impassable targets (e.g. ocean) — sending scouts after them only
        // wastes turns on failed moves (the old "move failed to row 0" spam).
        if (typeof this.gameEngine.isTilePassable === 'function' && !this.gameEngine.isTilePassable(col, row)) continue;

        const distance = Math.max(Math.abs(col - unit.col), Math.abs(row - unit.row));
        if (distance < minDistance) {
          minDistance = distance;
          nearestCandidates = [{ col, row }];
        } else if (distance === minDistance) {
          nearestCandidates.push({ col, row });
        }
      }
    }

    if (nearestCandidates.length > 0) {
      // Random tie-break so exploration fans out in all directions instead of
      // always heading for the lowest row.
      const pick = nearestCandidates[Math.floor(Math.random() * nearestCandidates.length)];
      console.log(`[AI-SCOUT] Found unexplored tile at (${pick.col},${pick.row}) in zone, distance: ${minDistance}`);
      return pick;
    }

    // If no unexplored tiles found in zone, move toward zone center to explore systematically
    const zoneCenterCol = Math.floor((zone.minCol + zone.maxCol) / 2);
    const zoneCenterRow = Math.floor((zone.minRow + zone.maxRow) / 2);

    // If scout is not at zone center, move toward it
    if (unit.col !== zoneCenterCol || unit.row !== zoneCenterRow) {
      // Find path toward zone center, preferring unexplored directions
      const neighbors = this.gameEngine.squareGrid.getNeighbors(unit.col, unit.row);
      let bestNeighbor: { col: number; row: number } | null = null;
      let bestDistanceToCenter = Math.max(Math.abs(unit.col - zoneCenterCol), Math.abs(unit.row - zoneCenterRow));

      for (const neighbor of neighbors) {
        if (!this.gameEngine.isInScoutZone(unit.civilizationId, scoutIndex, neighbor.col, neighbor.row)) continue;

        // NOTE: MapTile has no `passable` field; use the engine's terrain check
        // (the old `tile.passable` was always undefined, so this fallback never
        // found a valid neighbor).
        if (typeof this.gameEngine.isTilePassable !== 'function' || !this.gameEngine.isTilePassable(neighbor.col, neighbor.row)) continue;

        const distanceToCenter = Math.max(Math.abs(neighbor.col - zoneCenterCol), Math.abs(neighbor.row - zoneCenterRow));
        if (distanceToCenter < bestDistanceToCenter) {
          bestDistanceToCenter = distanceToCenter;
          bestNeighbor = neighbor;
        }
      }

      if (bestNeighbor) {
        console.log(`[AI-SCOUT] Moving toward zone center at (${zoneCenterCol},${zoneCenterRow}) via (${bestNeighbor.col},${bestNeighbor.row})`);
        return bestNeighbor;
      }
    }

    console.log(`[AI-SCOUT] No exploration targets found in zone ${scoutIndex}`);
    return null;
  }

  private isCombatUnit(unit: Unit): boolean {
    const nonCombatTypes = new Set(['settler', 'caravan', 'diplomat', 'worker']);
    if (nonCombatTypes.has(unit.type)) {
      return false;
    }
    return (unit.attack || 0) > 0.5;
  }

  private selectStrategicTarget(unit: Unit): { col: number; row: number } | null {
    if (!this.gameEngine.squareGrid) {
      return null;
    }

    const storage = this.gameEngine.getPlayerStorage(unit.civilizationId);
    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;

    // The explicit offensive plan (a deliberate siege decision, already gated
    // on army strength and NOT when a city is critically threatened) takes
    // priority over generic defensive shuffling. Previously defense ran first,
    // so minor border pressure permanently pulled units away from the attack
    // and the AI sat in an AI-vs-AI stalemate, never besieging enemy cities.
    const offensivePlanTarget = this.getOffensivePlanTarget(unit, storage);
    if (offensivePlanTarget) {
      return offensivePlanTarget;
    }

    const defensiveTarget = this.findDefensiveAssignment(unit, storage, roundNumber);
    if (defensiveTarget) {
      return defensiveTarget;
    }

    const offensiveTarget = this.findOffensiveAssignment(unit, storage, roundNumber);
    if (offensiveTarget) {
      return offensiveTarget;
    }

    return null;
  }

  private updateOffensivePlan(civilizationId: number, storage: any, roundNumber: number): void {
    if (!storage) {
      return;
    }

    storage.turnData = storage.turnData || {};

    const threatenedCities = this.identifyThreatenedCities(civilizationId, storage, roundNumber);
    // A genuinely besieged city (garrison clearly overwhelmed) takes priority
    // over any offense. But minor border pressure must NOT permanently cancel
    // the offensive plan — that left AI-vs-AI stuck in a defensive stalemate
    // where neither side ever attacked the other's cities.
    const criticalThreats = threatenedCities.filter((t) => (t.assessment?.netThreat ?? 0) >= 2.5);
    if (criticalThreats.length > 0) {
      storage.turnData.offensivePlan = null;
      return;
    }

    const bestTarget = this.findBestOffensiveTarget(civilizationId, storage, roundNumber);
    if (!bestTarget) {
      storage.turnData.offensivePlan = null;
      return;
    }

    const availableStrength = this.calculateAvailableArmyStrength(civilizationId);
    const requiredStrength = this.estimateRequiredStrength(bestTarget.location.type);

    if (availableStrength < requiredStrength) {
      storage.turnData.offensivePlan = null;
      return;
    }

    const combatUnits = this.gameEngine.units.filter((unit: Unit) => unit.civilizationId === civilizationId && this.isCombatUnit(unit));
    const requiredUnits = Math.min(combatUnits.length, Math.max(3, Math.ceil(requiredStrength / 2)));

    storage.turnData.offensivePlan = {
      target: { col: bestTarget.location.col, row: bestTarget.location.row },
      targetType: bestTarget.location.type,
      score: bestTarget.score,
      requiredUnits,
      assignedUnitIds: [] as string[],
      roundPrepared: roundNumber
    };
  }

  private getOffensivePlanTarget(unit: Unit, storage: any): { col: number; row: number } | null {
    const plan = storage?.turnData?.offensivePlan;
    if (!plan || !plan.target) {
      return null;
    }

    plan.assignedUnitIds = plan.assignedUnitIds || [];

    if (plan.assignedUnitIds.includes(unit.id)) {
      return plan.target;
    }

    if (plan.assignedUnitIds.length < plan.requiredUnits) {
      plan.assignedUnitIds.push(unit.id);
      return plan.target;
    }

    return null;
  }

  private findBestOffensiveTarget(civilizationId: number, storage: any, roundNumber: number): { location: any; score: number } | null {
    if (!storage || !storage.enemyLocations || storage.enemyLocations.size === 0) {
      return null;
    }

    const friendlyCities = this.gameEngine.cities.filter((city: City) => city.civilizationId === civilizationId);
    let best: { location: any; score: number } | null = null;

    for (const enemyList of storage.enemyLocations.values()) {
      for (const location of enemyList) {
        const reference = friendlyCities.length > 0
          ? friendlyCities
          : this.gameEngine.units.filter((u: Unit) => u.civilizationId === civilizationId);
        if (reference.length === 0) {
          continue;
        }

        const estimatedDistance = reference.reduce((min: number, entity: any) => {
          const distance = this.gameEngine.squareGrid!.squareDistance(entity.col, entity.row, location.col, location.row);
          return Math.min(min, distance);
        }, Infinity);

        const isVisible = typeof this.gameEngine.isVisibleToPlayer === 'function'
          ? this.gameEngine.isVisibleToPlayer(civilizationId, location.col, location.row)
          : false;

        const { score } = scoreEnemyTarget({
          location,
          distance: isFinite(estimatedDistance) ? estimatedDistance : 0,
          currentRound: roundNumber,
          isCurrentlyVisible: isVisible
        });

        if (score < 25) {
          continue;
        }

        if (!best || score > best.score) {
          best = { location, score };
        }
      }
    }

    return best;
  }

  private calculateAvailableArmyStrength(civilizationId: number): number {
    return this.gameEngine.units
      .filter((unit: Unit) => unit.civilizationId === civilizationId && this.isCombatUnit(unit))
      .reduce((total: number, unit: Unit) => {
        const attackStrength = Math.max(1, unit.attack || 0);
        const defenseSupport = Math.max(0, (unit.defense || 0) * 0.5); // count half of defensive stat for offensive push
        return total + attackStrength + defenseSupport;
      }, 0);
  }

  private estimateRequiredStrength(targetType: 'city' | 'unit' | undefined): number {
    // A sizeable but not overwhelming force: ~3 units can mount a siege.
    // (The old base of 10 needed ~4+ units AND a completely calm border, so
    // the AI almost never attacked — it sat in a defensive stalemate.)
    const base = targetType === 'city' ? 7 : 5;
    const difficulty = this.gameEngine.gameSettings?.difficulty ?? 'PRINCE';
    const modifiers: Record<string, number> = {
      CHIEFTAIN: 1.1,
      WARLORD: 1.05,
      PRINCE: 1,
      KING: 0.9,
      EMPEROR: 0.85
    };
    const modifier = modifiers[difficulty.toUpperCase()] ?? 1;
    return base * modifier;
  }

  private findOffensiveAssignment(unit: Unit, storage: any, roundNumber: number): { col: number; row: number } | null {
    if (!storage || !storage.enemyLocations || storage.enemyLocations.size === 0) {
      return null;
    }

    let bestTarget: { col: number; row: number; score: number } | null = null;

    for (const enemyList of storage.enemyLocations.values()) {
      for (const location of enemyList) {
        const distance = this.gameEngine.squareGrid!.squareDistance(unit.col, unit.row, location.col, location.row);
        const isVisible = typeof this.gameEngine.isVisibleToPlayer === 'function'
          ? this.gameEngine.isVisibleToPlayer(unit.civilizationId, location.col, location.row)
          : false;

        // Count allied combat units near the target to favor convergence
        const nearbyAllied = this.gameEngine.units.filter(
          (u: Unit) => u.civilizationId === unit.civilizationId && u.id !== unit.id && this.isCombatUnit(u)
            && this.gameEngine.squareGrid!.squareDistance(u.col, u.row, location.col, location.row) <= 5
        ).length;

        const { score } = scoreEnemyTarget({
          location,
          distance,
          currentRound: roundNumber,
          isCurrentlyVisible: isVisible,
          nearbyAlliedUnits: nearbyAllied,
        });

        if (score < 10) {
          continue;
        }

        if (!bestTarget || score > bestTarget.score) {
          bestTarget = { col: location.col, row: location.row, score };
        }
      }
    }

    return bestTarget ? { col: bestTarget.col, row: bestTarget.row } : null;
  }

  private findDefensiveAssignment(unit: Unit, storage: any, roundNumber: number): { col: number; row: number } | null {
    const threatenedCities = this.identifyThreatenedCities(unit.civilizationId, storage, roundNumber);
    if (threatenedCities.length === 0) {
      return null;
    }

    const ranked = threatenedCities
      .map(entry => ({
        ...entry,
        distance: this.gameEngine.squareGrid!.squareDistance(unit.col, unit.row, entry.city.col, entry.city.row)
      }))
      .sort((a, b) => {
        if (b.assessment.netThreat !== a.assessment.netThreat) {
          return b.assessment.netThreat - a.assessment.netThreat;
        }
        return a.distance - b.distance;
      });

    const best = ranked[0];
    if (!best) {
      return null;
    }

    if (best.assessment.closestSample && typeof best.assessment.closestSample.col === 'number' && typeof best.assessment.closestSample.row === 'number') {
      return { col: best.assessment.closestSample.col, row: best.assessment.closestSample.row };
    }

    return { col: best.city.col, row: best.city.row };
  }

  private identifyThreatenedCities(civilizationId: number, storage: any, roundNumber: number): Array<{ city: City; assessment: CityThreatAssessment }> {
    if (!this.gameEngine.squareGrid) {
      return [];
    }

    const threatened: Array<{ city: City; assessment: CityThreatAssessment }> = [];
    const friendlyCities = this.gameEngine.cities.filter(city => city.civilizationId === civilizationId);

    const currentYear = this.gameEngine.currentYear ?? -4000;
    const difficulty = this.gameEngine.gameSettings?.difficulty ?? 'PRINCE';
    const dynamicThreshold = calculateDangerThreshold(currentYear, difficulty);

    for (const city of friendlyCities) {
      const garrisonStrength = computeCityGarrisonStrength(this.gameEngine, city, civilizationId);
      const samples = collectCityThreatSamples(this.gameEngine, city, civilizationId, storage, roundNumber);
      if (samples.length === 0) {
        continue;
      }

      const assessment = assessCityThreat({
        city: { id: city.id, col: city.col, row: city.row },
        samples,
        garrisonStrength,
        defensiveBonus: 0,
        dangerThreshold: dynamicThreshold
      });

      if (assessment.needsDefense) {
        threatened.push({ city, assessment });
      }
    }

    return threatened;
  }
  /**
   * Emit event for AI target highlighting
   */
  private highlightAITarget(col: number, row: number, color: string = 'rgba(255,0,0,0.4)') {
    // Emit event for UI layer to handle highlighting
    if (this.gameEngine.onStateChange) {
      this.gameEngine.onStateChange('AI_TARGET_HIGHLIGHT', { col, row, color });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // New integrated helpers
  // ──────────────────────────────────────────────────────────────────────

  /** Build a snapshot of game state for strategy/research evaluation */
  private buildGameState(civilizationId: number): {
    currentYear: number;
    roundNumber: number;
    numCities: number;
    numOwnCities: number;
    totalPopulation: number;
    numMilitaryUnits: number;
    numOwnMilitaryUnits: number;
    numOwnCivilianUnits: number;
    averageEnemyStrength: number;
    ownMilitaryStrength: number;
    numTechnologies: number;
    isAtWar: boolean;
    knownEnemyCities: number;
    numEnemyCitiesKnown: number;
    threatenedCitiesCount: number;
    hasLibrary: boolean;
    totalScience: number;
  } {
    const cities = this.gameEngine.cities?.filter((c: any) => c.civilizationId === civilizationId) || [];
    const civ = this.gameEngine.civilizations?.[civilizationId];
    const storage = this.gameEngine.getPlayerStorage?.(civilizationId);

    let knownEnemyCities = 0;
    if (storage?.enemyLocations) {
      for (const enemies of storage.enemyLocations.values()) {
        knownEnemyCities += enemies.filter((e: any) => e.type === 'city').length;
      }
    }

    const militaryUnits = this.gameEngine.units?.filter(
      (u: any) => u.civilizationId === civilizationId && this.isCombatUnit(u as Unit)
    ) ?? [];
    const civilianUnits = this.gameEngine.units?.filter(
      (u: any) => u.civilizationId === civilizationId && !this.isCombatUnit(u as Unit)
    ) ?? [];
    const ownStrength = militaryUnits.reduce(
      (sum: number, u: any) => sum + Math.max(1, u.attack || 0) + (u.defense || 0) * 0.5, 0
    );

    // Estimate average enemy military strength from known info
    const enemyUnits = this.gameEngine.units?.filter(
      (u: any) => u.civilizationId !== civilizationId && this.isCombatUnit(u as Unit)
    ) ?? [];
    const enemyCivIds = new Set(enemyUnits.map((u: any) => u.civilizationId));
    const avgEnemyStrength = enemyCivIds.size > 0
      ? enemyUnits.reduce((sum: number, u: any) => sum + Math.max(1, u.attack || 0) + (u.defense || 0) * 0.5, 0) / enemyCivIds.size
      : 0;

    // Count threatened cities
    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    const threatened = this.identifyThreatenedCities(civilizationId, storage, roundNumber);

    // Check for library in any city
    const hasLibrary = cities.some((c: any) => c.buildings?.includes('library'));
    const totalScience = cities.reduce((sum: number, c: any) => sum + (c.science || 0), 0);

    return {
      currentYear: this.gameEngine.currentYear ?? -4000,
      roundNumber,
      numCities: cities.length,
      numOwnCities: cities.length,
      totalPopulation: cities.reduce((sum: number, c: any) => sum + (c.population || 1), 0),
      numMilitaryUnits: militaryUnits.length,
      numOwnMilitaryUnits: militaryUnits.length,
      numOwnCivilianUnits: civilianUnits.length,
      averageEnemyStrength: avgEnemyStrength,
      ownMilitaryStrength: ownStrength,
      numTechnologies: civ?.technologies?.length ?? 0,
      isAtWar: civ?.warWith?.size > 0,
      knownEnemyCities,
      numEnemyCitiesKnown: knownEnemyCities,
      threatenedCitiesCount: threatened.length,
      hasLibrary,
      totalScience,
    };
  }

  /** Estimate total enemy combat strength in 4-tile radius around a unit.
   *  Closer enemies contribute more to the threat estimate. */
  private estimateLocalEnemyStrength(unit: Unit): number {
    if (!this.gameEngine.squareGrid) return 0;

    const radius = 4;
    let enemyStrength = 0;
    const dm = this.gameEngine.diplomacyManager;

    for (const other of this.gameEngine.units) {
      if (other.civilizationId === unit.civilizationId) continue;
      // Only count units from civs we're at war with
      if (dm && !dm.isAtWar(unit.civilizationId, other.civilizationId)) continue;
      const dist = this.gameEngine.squareGrid.squareDistance(unit.col, unit.row, other.col, other.row);
      if (dist <= radius) {
        const raw = Math.max(1, other.attack || 0) + (other.defense || 0) * 0.5;
        // Weight by proximity: adjacent enemies count full, distant ones less
        const proximityWeight = 1 - (dist - 1) / (radius + 1);
        enemyStrength += raw * proximityWeight;
      }
    }

    return enemyStrength;
  }

  /** Resolve the owning civId from a scan result (unit or city) */
  private getOwnerCivId(scanResult: { type: 'unit' | 'city'; id: string }): number | undefined {
    if (scanResult.type === 'unit') {
      return this.gameEngine.units?.find((u: any) => u.id === scanResult.id)?.civilizationId;
    }
    return this.gameEngine.cities?.find((c: any) => c.id === scanResult.id)?.civilizationId;
  }

  /** Get known enemy targets from player storage for army group formation */
  private getKnownEnemyTargets(
    _civilizationId: number,
    storage: any
  ): Array<{ col: number; row: number; type: 'city' | 'unit'; estimatedStrength: number }> {
    const targets: Array<{ col: number; row: number; type: 'city' | 'unit'; estimatedStrength: number }> = [];
    if (!storage?.enemyLocations) return targets;

    for (const enemyList of storage.enemyLocations.values()) {
      for (const loc of enemyList) {
        // Estimate strength: cities have higher estimated defense
        const estimatedStrength = loc.type === 'city' ? 8 : 3;
        targets.push({
          col: loc.col,
          row: loc.row,
          type: loc.type,
          estimatedStrength,
        });
      }
    }

    // Sort: prioritize cities over units
    return targets.sort((a, b) => {
      if (a.type === 'city' && b.type !== 'city') return -1;
      if (a.type !== 'city' && b.type === 'city') return 1;
      return b.estimatedStrength - a.estimatedStrength;
    });
  }

  /** Map strategy to settlement evaluation weights */
  private getSettlementWeightsForStrategy(strategy: StrategyProfile) {
    switch (strategy) {
      case 'military_expansion':
        return SettlementEvaluator.productionPowerhouseWeights();
      case 'science_focus':
      case 'wonder_rush':
        return SettlementEvaluator.tradeCommerceWeights();
      case 'early_expansion':
        return SettlementEvaluator.balancedGrowthWeights();
      case 'defensive_turtle':
        return SettlementEvaluator.productionPowerhouseWeights();
      case 'balanced_growth':
      default:
        return SettlementEvaluator.balancedGrowthWeights();
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Threat alert system — rally nearby combat units to detected threats
  // ──────────────────────────────────────────────────────────────────────

  /** Store a threat alert in player storage so other units can respond */
  private broadcastThreatAlert(_civilizationId: number, col: number, row: number, enemyStrength: number, storage: any): void {
    if (!storage) return;
    storage.turnData = storage.turnData || {};
    if (!storage.turnData.threatAlerts) {
      storage.turnData.threatAlerts = [];
    }
    const alerts: ThreatAlert[] = storage.turnData.threatAlerts;
    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;

    // Don't duplicate alerts at the same location this round
    const existing = alerts.find((a: ThreatAlert) => a.col === col && a.row === row && a.round === roundNumber);
    if (existing) {
      existing.enemyStrength = Math.max(existing.enemyStrength, enemyStrength);
      return;
    }

    alerts.push({ col, row, enemyStrength, round: roundNumber });

    // Keep only recent alerts (last 3 rounds)
    storage.turnData.threatAlerts = alerts.filter((a: ThreatAlert) => roundNumber - a.round <= 3);
    console.log(`[AI] Threat alert broadcast at (${col},${row}), strength=${enemyStrength.toFixed(1)}`);
  }

  /** Find the closest active threat alert this unit should respond to */
  private getActiveAlertTarget(unit: any, storage: any): { col: number; row: number } | null {
    if (!storage?.turnData?.threatAlerts || !this.gameEngine.squareGrid) return null;

    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    const alerts: ThreatAlert[] = storage.turnData.threatAlerts;
    const ALERT_RESPONSE_RADIUS = 8;

    let bestAlert: ThreatAlert | null = null;
    let bestScore = -Infinity;

    for (const alert of alerts) {
      if (roundNumber - alert.round > 2) continue; // Skip stale alerts

      const dist = this.gameEngine.squareGrid.squareDistance(unit.col, unit.row, alert.col, alert.row);
      if (dist > ALERT_RESPONSE_RADIUS || dist === 0) continue;

      // Score = urgency (enemy strength) minus distance cost
      const score = alert.enemyStrength * 2 - dist;
      if (score > bestScore) {
        bestScore = score;
        bestAlert = alert;
      }
    }

    if (bestAlert) {
      return { col: bestAlert.col, row: bestAlert.row };
    }
    return null;
  }
}