/**
 * DiplomacyManager - Manages all diplomatic relations between civilizations.
 *
 * Responsibilities:
 *  - Track diplomatic status between every pair of civilizations
 *  - Process proposals (peace, ceasefire, alliance, tribute, bribery)
 *  - Calculate AI willingness to accept proposals
 *  - Maintain reputation tracking
 *  - Generate intelligence reports
 *  - Provide AI diplomatic decision-making each turn
 */

import type {
  DiplomaticStatus,
  DiplomaticRelation,
  Attitude,
  DiplomacyProposal,
  DiplomacyResponse,
  DiplomacyEvent,
  IntelligenceReport,
  DiplomatAction,
} from './DiplomacyTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum turns a ceasefire must last before war can be declared again */
const CEASEFIRE_COOLDOWN = 5;
/** Reputation penalty for breaking a peace treaty */
const PEACE_BREAK_PENALTY = -30;
/** Reputation penalty for breaking an alliance */
const ALLIANCE_BREAK_PENALTY = -50;
/** Reputation penalty for surprise attack (declaring war from peace) */
const SURPRISE_ATTACK_PENALTY = -20;
/** Reputation recovered per turn toward 0 */
const REPUTATION_RECOVERY_PER_TURN = 1;
/** Base gold cost to bribe a unit (multiplied by unit attack+defense) */
const BRIBE_UNIT_BASE_COST = 25;
/** Base gold cost to bribe a city (multiplied by city population) */
const BRIBE_CITY_BASE_COST = 100;
/** How many turns before AI re-evaluates diplomatic stance */
const AI_DIPLOMACY_INTERVAL = 5;

// ---------------------------------------------------------------------------
// DiplomacyManager
// ---------------------------------------------------------------------------

export class DiplomacyManager {
  private gameEngine: any;
  /** Canonical relation map keyed as "civA_civB" where civA < civB */
  private relations: Map<string, DiplomaticRelation> = new Map();
  /** Log of diplomatic events (most recent first, capped at 50) */
  private eventLog: DiplomacyEvent[] = [];

  constructor(gameEngine: any) {
    this.gameEngine = gameEngine;
  }

  // ─── Initialization ────────────────────────────────────────────────

  /** Initialize relations between all civilization pairs (call after civs are created) */
  initialize(civIds: number[]): void {
    this.relations.clear();
    this.eventLog = [];
    for (let i = 0; i < civIds.length; i++) {
      for (let j = i + 1; j < civIds.length; j++) {
        const key = this.key(civIds[i], civIds[j]);
        this.relations.set(key, {
          civA: civIds[i],
          civB: civIds[j],
          status: 'peace',
          since: 0,
          reputationModifier: 0,
          treatiesBrokenByA: 0,
          treatiesBrokenByB: 0,
        });
      }
    }
  }

  /** Reset for new game */
  reset(): void {
    this.relations.clear();
    this.eventLog = [];
  }

  // ─── Key helpers ───────────────────────────────────────────────────

  private key(a: number, b: number): string {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  // ─── Queries ───────────────────────────────────────────────────────

  getRelation(civA: number, civB: number): DiplomaticRelation | undefined {
    return this.relations.get(this.key(civA, civB));
  }

  getStatus(civA: number, civB: number): DiplomaticStatus {
    return this.getRelation(civA, civB)?.status ?? 'peace';
  }

  isAtWar(civA: number, civB: number): boolean {
    return this.getStatus(civA, civB) === 'war';
  }

  isAllied(civA: number, civB: number): boolean {
    return this.getStatus(civA, civB) === 'alliance';
  }

  /** Get all civilizations at war with the given civ */
  getEnemies(civId: number): number[] {
    const enemies: number[] = [];
    for (const rel of this.relations.values()) {
      if (rel.status !== 'war') continue;
      if (rel.civA === civId) enemies.push(rel.civB);
      else if (rel.civB === civId) enemies.push(rel.civA);
    }
    return enemies;
  }

  /** Get all civilizations allied with the given civ */
  getAllies(civId: number): number[] {
    const allies: number[] = [];
    for (const rel of this.relations.values()) {
      if (rel.status !== 'alliance') continue;
      if (rel.civA === civId) allies.push(rel.civB);
      else if (rel.civB === civId) allies.push(rel.civA);
    }
    return allies;
  }

  /** Get all relations for a given civ (for UI display) */
  getRelationsForCiv(civId: number): Array<DiplomaticRelation & { otherCivId: number }> {
    const result: Array<DiplomaticRelation & { otherCivId: number }> = [];
    for (const rel of this.relations.values()) {
      if (rel.civA === civId) result.push({ ...rel, otherCivId: rel.civB });
      else if (rel.civB === civId) result.push({ ...rel, otherCivId: rel.civA });
    }
    return result;
  }

  /** Get the recent event log */
  getEventLog(): DiplomacyEvent[] {
    return [...this.eventLog];
  }

  // ─── Attitude calculation ──────────────────────────────────────────

  /** Calculate AI attitude toward another civilization */
  getAttitude(fromCivId: number, towardCivId: number): Attitude {
    const rel = this.getRelation(fromCivId, towardCivId);
    if (!rel) return 'neutral';

    const fromCiv = this.gameEngine.civilizations?.[fromCivId];
    const personality = fromCiv?.personality;

    let score = 0;

    // Base disposition from personality
    if (personality) {
      score += (personality.diplomacy - 5) * 3; // diplomatic civs start friendlier
      score -= (personality.aggression - 5) * 2; // aggressive civs are meaner
    }

    // Reputation impact
    const broken = fromCivId < towardCivId ? rel.treatiesBrokenByB : rel.treatiesBrokenByA;
    score -= broken * 15;
    score += rel.reputationModifier;

    // Current status impact
    if (rel.status === 'alliance') score += 20;
    else if (rel.status === 'war') score -= 30;
    else if (rel.status === 'ceasefire') score -= 10;

    // Military strength comparison
    const ownStrength = this.estimateMilitaryStrength(fromCivId);
    const theirStrength = this.estimateMilitaryStrength(towardCivId);
    if (theirStrength > ownStrength * 1.5) score -= 10; // fear
    if (ownStrength > theirStrength * 2) score += 5; // contempt → more aggressive but not hostile

    if (score >= 15) return 'friendly';
    if (score >= -5) return 'neutral';
    if (score >= -20) return 'annoyed';
    return 'hostile';
  }

  // ─── State changes ─────────────────────────────────────────────────

  /** Declare war between two civilizations */
  declareWar(aggressorId: number, targetId: number): void {
    const rel = this.getRelation(aggressorId, targetId);
    if (!rel || rel.status === 'war') return;

    const previousStatus = rel.status;
    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;

    // Apply reputation penalties for treaty-breaking
    if (previousStatus === 'peace') {
      this.applyReputationPenalty(aggressorId, targetId, SURPRISE_ATTACK_PENALTY);
      this.incrementBroken(aggressorId, targetId);
    } else if (previousStatus === 'alliance') {
      this.applyReputationPenalty(aggressorId, targetId, ALLIANCE_BREAK_PENALTY);
      this.incrementBroken(aggressorId, targetId);
    } else if (previousStatus === 'ceasefire') {
      const turnsSince = roundNumber - rel.since;
      if (turnsSince < CEASEFIRE_COOLDOWN) {
        this.applyReputationPenalty(aggressorId, targetId, PEACE_BREAK_PENALTY);
        this.incrementBroken(aggressorId, targetId);
      }
    }

    rel.status = 'war';
    rel.since = roundNumber;

    this.logEvent({
      type: 'war_declared',
      fromCivId: aggressorId,
      toCivId: targetId,
      details: `War declared (was: ${previousStatus})`,
    });

    console.log(`[DIPLOMACY] Civ ${aggressorId} declared war on Civ ${targetId}`);
    this.emitEvent('WAR_DECLARED', { aggressorId, targetId });
  }

  /** Establish peace between two civilizations */
  makePeace(civA: number, civB: number): void {
    const rel = this.getRelation(civA, civB);
    if (!rel || rel.status === 'peace') return;

    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    rel.status = 'peace';
    rel.since = roundNumber;

    this.logEvent({
      type: 'peace_made',
      fromCivId: civA,
      toCivId: civB,
    });

    console.log(`[DIPLOMACY] Peace between Civ ${civA} and Civ ${civB}`);
    this.emitEvent('PEACE_MADE', { civA, civB });
  }

  /** Establish ceasefire */
  signCeasefire(civA: number, civB: number): void {
    const rel = this.getRelation(civA, civB);
    if (!rel || rel.status !== 'war') return;

    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    rel.status = 'ceasefire';
    rel.since = roundNumber;

    this.logEvent({
      type: 'ceasefire_signed',
      fromCivId: civA,
      toCivId: civB,
    });

    console.log(`[DIPLOMACY] Ceasefire between Civ ${civA} and Civ ${civB}`);
    this.emitEvent('CEASEFIRE_SIGNED', { civA, civB });
  }

  /** Form alliance */
  formAlliance(civA: number, civB: number): void {
    const rel = this.getRelation(civA, civB);
    if (!rel || rel.status === 'war') return;

    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    rel.status = 'alliance';
    rel.since = roundNumber;

    this.logEvent({
      type: 'alliance_formed',
      fromCivId: civA,
      toCivId: civB,
    });

    console.log(`[DIPLOMACY] Alliance between Civ ${civA} and Civ ${civB}`);
    this.emitEvent('ALLIANCE_FORMED', { civA, civB });
  }

  // ─── Proposals (human or AI initiated) ─────────────────────────────

  /** Process a diplomatic proposal. Returns whether accepted. */
  processProposal(proposal: DiplomacyProposal): DiplomacyResponse {
    const { fromCivId, toCivId, action, goldAmount } = proposal;
    const attitude = this.getAttitude(toCivId, fromCivId);
    const willingness = this.calculateWillingness(toCivId, fromCivId, action, attitude);
    const roll = Math.random() * 100;
    const accepted = roll < willingness;

    console.log(`[DIPLOMACY] Proposal: ${action} from Civ ${fromCivId} to Civ ${toCivId}, willingness=${willingness.toFixed(0)}%, roll=${roll.toFixed(0)}, accepted=${accepted}`);

    if (!accepted) {
      this.logEvent({
        type: 'treaty_rejected',
        fromCivId,
        toCivId,
        details: `${action} rejected`,
      });
      return { accepted: false, reason: this.getRejectReason(attitude) };
    }

    // Execute the accepted action
    switch (action) {
      case 'propose_peace':
        this.makePeace(fromCivId, toCivId);
        return { accepted: true };

      case 'propose_ceasefire':
        this.signCeasefire(fromCivId, toCivId);
        return { accepted: true };

      case 'propose_alliance':
        this.formAlliance(fromCivId, toCivId);
        return { accepted: true };

      case 'demand_tribute': {
        const demanded = goldAmount ?? 50;
        const targetCiv = this.gameEngine.civilizations?.[toCivId];
        const fromCiv = this.gameEngine.civilizations?.[fromCivId];
        const available = targetCiv?.resources?.gold ?? 0;
        const paid = Math.min(demanded, available);

        if (targetCiv?.resources) targetCiv.resources.gold -= paid;
        if (fromCiv?.resources) fromCiv.resources.gold += paid;

        this.logEvent({
          type: 'tribute_paid',
          fromCivId: toCivId,
          toCivId: fromCivId,
          goldAmount: paid,
        });
        return { accepted: true, goldTransferred: paid };
      }

      case 'gather_intelligence':
        return { accepted: true };

      default:
        return { accepted: false, reason: 'Unknown action' };
    }
  }

  /** Generate an intelligence report on a civilization */
  gatherIntelligence(spyCivId: number, targetCivId: number): IntelligenceReport {
    const civ = this.gameEngine.civilizations?.[targetCivId];
    const cities = this.gameEngine.cities?.filter((c: any) => c.civilizationId === targetCivId) ?? [];
    const military = this.gameEngine.units?.filter(
      (u: any) => u.civilizationId === targetCivId && (u.attack || 0) > 0
    ) ?? [];

    this.logEvent({
      type: 'intelligence_gathered',
      fromCivId: spyCivId,
      toCivId: targetCivId,
    });

    return {
      civId: targetCivId,
      civName: civ?.name ?? 'Unknown',
      gold: civ?.resources?.gold ?? 0,
      numCities: cities.length,
      numMilitaryUnits: military.length,
      currentResearch: civ?.currentResearch?.id ?? civ?.currentResearch ?? null,
      government: civ?.government ?? 'despotism',
      attitude: this.getAttitude(targetCivId, spyCivId),
    };
  }

  /** Attempt to bribe an enemy unit with a diplomat */
  bribeUnit(diplomatCivId: number, targetUnitId: string): DiplomacyResponse {
    const unit = this.gameEngine.units?.find((u: any) => u.id === targetUnitId);
    if (!unit) return { accepted: false, reason: 'Unit not found' };
    if (unit.civilizationId === diplomatCivId) return { accepted: false, reason: 'Cannot bribe own unit' };

    const cost = BRIBE_UNIT_BASE_COST * ((unit.attack || 1) + (unit.defense || 1));
    const fromCiv = this.gameEngine.civilizations?.[diplomatCivId];
    const gold = fromCiv?.resources?.gold ?? 0;

    if (gold < cost) {
      return { accepted: false, reason: `Requires ${cost} gold (have ${gold})` };
    }

    // Bribe success chance: 60% base, modified by attitude
    const attitude = this.getAttitude(unit.civilizationId, diplomatCivId);
    let chance = 60;
    if (attitude === 'friendly') chance += 20;
    else if (attitude === 'hostile') chance -= 20;

    if (Math.random() * 100 >= chance) {
      return { accepted: false, reason: 'Bribe failed — the unit refused' };
    }

    // Success: transfer the unit
    fromCiv.resources.gold -= cost;
    unit.civilizationId = diplomatCivId;
    unit.movesRemaining = 0;

    this.logEvent({
      type: 'unit_bribed',
      fromCivId: diplomatCivId,
      toCivId: unit.civilizationId,
      goldAmount: cost,
      details: `Bribed ${unit.type}`,
    });

    console.log(`[DIPLOMACY] Civ ${diplomatCivId} bribed unit ${targetUnitId} for ${cost} gold`);
    this.emitEvent('UNIT_BRIBED', { diplomatCivId, unitId: targetUnitId, cost });
    return { accepted: true, goldTransferred: -cost };
  }

  // ─── Turn processing ───────────────────────────────────────────────

  /** Called once per round to recover reputation and handle AI decisions */
  processTurn(roundNumber: number): void {
    // Recover reputation toward 0
    for (const rel of this.relations.values()) {
      if (rel.reputationModifier < 0) {
        rel.reputationModifier = Math.min(0, rel.reputationModifier + REPUTATION_RECOVERY_PER_TURN);
      } else if (rel.reputationModifier > 0) {
        rel.reputationModifier = Math.max(0, rel.reputationModifier - REPUTATION_RECOVERY_PER_TURN);
      }
    }
  }

  /** AI diplomacy: decide whether to propose peace, declare war, etc. */
  processAIDiplomacy(civId: number): void {
    const civ = this.gameEngine.civilizations?.[civId];
    if (!civ || civ.isHuman) return;

    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    if (roundNumber % AI_DIPLOMACY_INTERVAL !== 0 && roundNumber > 1) return;

    const personality = civ.personality || { aggression: 5, diplomacy: 5, military: 5 };
    const ownStrength = this.estimateMilitaryStrength(civId);

    for (const rel of this.getRelationsForCiv(civId)) {
      const otherId = rel.otherCivId;
      const otherCiv = this.gameEngine.civilizations?.[otherId];
      if (!otherCiv || !otherCiv.isAlive) continue;

      const attitude = this.getAttitude(civId, otherId);
      const theirStrength = this.estimateMilitaryStrength(otherId);
      const turnsSince = roundNumber - rel.since;

      if (rel.status === 'war') {
        // Consider peace if losing or war has gone on long enough
        if (theirStrength > ownStrength * 1.3 && turnsSince > 5) {
          console.log(`[AI-DIPLO] Civ ${civId} proposing ceasefire to Civ ${otherId} (outmatched)`);
          this.processProposal({ fromCivId: civId, toCivId: otherId, action: 'propose_ceasefire' });
        } else if (turnsSince > 15 && attitude !== 'hostile') {
          console.log(`[AI-DIPLO] Civ ${civId} proposing peace to Civ ${otherId} (long war)`);
          this.processProposal({ fromCivId: civId, toCivId: otherId, action: 'propose_peace' });
        }
      } else if (rel.status === 'peace' || rel.status === 'ceasefire') {
        // Consider declaring war if aggressive and strong enough
        if (personality.aggression >= 7 && ownStrength > theirStrength * 1.5 && attitude === 'hostile') {
          console.log(`[AI-DIPLO] Civ ${civId} declaring war on Civ ${otherId} (aggressive & strong)`);
          this.declareWar(civId, otherId);
        }
        // Consider demanding tribute if much stronger
        else if (personality.aggression >= 6 && ownStrength > theirStrength * 2 && turnsSince > 10) {
          const demand = Math.floor(ownStrength * 5);
          console.log(`[AI-DIPLO] Civ ${civId} demanding ${demand} gold tribute from Civ ${otherId}`);
          this.processProposal({ fromCivId: civId, toCivId: otherId, action: 'demand_tribute', goldAmount: demand });
        }
        // Consider alliance if friendly and similar strength
        else if (rel.status === 'peace' && attitude === 'friendly' && personality.diplomacy >= 6) {
          const strengthRatio = Math.min(ownStrength, theirStrength) / Math.max(ownStrength, theirStrength, 1);
          if (strengthRatio > 0.5) {
            console.log(`[AI-DIPLO] Civ ${civId} proposing alliance to Civ ${otherId}`);
            this.processProposal({ fromCivId: civId, toCivId: otherId, action: 'propose_alliance' });
          }
        }
      }
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────

  private calculateWillingness(
    decidingCivId: number,
    proposerCivId: number,
    action: DiplomatAction,
    attitude: Attitude
  ): number {
    const attitudeBase: Record<Attitude, number> = {
      friendly: 75,
      neutral: 50,
      annoyed: 30,
      hostile: 10,
    };

    let willingness = attitudeBase[attitude];

    // Action-specific modifiers
    switch (action) {
      case 'propose_peace':
        // AI usually wants peace when attitude is not hostile
        willingness += 15;
        break;
      case 'propose_ceasefire':
        willingness += 20; // Ceasefires are easier to accept
        break;
      case 'propose_alliance':
        willingness -= 10; // Alliances require more trust
        break;
      case 'demand_tribute':
        willingness -= 20; // Nobody likes demands
        // Weaker civs more likely to comply
        const ownStr = this.estimateMilitaryStrength(decidingCivId);
        const proposerStr = this.estimateMilitaryStrength(proposerCivId);
        if (proposerStr > ownStr * 1.5) willingness += 25;
        break;
    }

    // Reputation modifier
    const rel = this.getRelation(decidingCivId, proposerCivId);
    if (rel) {
      const broken = decidingCivId < proposerCivId ? rel.treatiesBrokenByB : rel.treatiesBrokenByA;
      willingness -= broken * 15;
    }

    return Math.max(0, Math.min(100, willingness));
  }

  private estimateMilitaryStrength(civId: number): number {
    const units = this.gameEngine.units?.filter(
      (u: any) => u.civilizationId === civId && (u.attack || 0) > 0
    ) ?? [];
    return units.reduce((sum: number, u: any) => sum + (u.attack || 0) + (u.defense || 0) * 0.5, 0);
  }

  private applyReputationPenalty(aggressorId: number, targetId: number, penalty: number): void {
    const rel = this.getRelation(aggressorId, targetId);
    if (rel) {
      rel.reputationModifier += penalty;
    }
  }

  private incrementBroken(aggressorId: number, targetId: number): void {
    const rel = this.getRelation(aggressorId, targetId);
    if (!rel) return;
    if (aggressorId === rel.civA) rel.treatiesBrokenByA++;
    else rel.treatiesBrokenByB++;
  }

  private getRejectReason(attitude: Attitude): string {
    switch (attitude) {
      case 'hostile': return 'We have no interest in dealing with you!';
      case 'annoyed': return 'We are not inclined to accept your offer.';
      case 'neutral': return 'We must decline at this time.';
      case 'friendly': return 'Perhaps another time.';
    }
  }

  private logEvent(event: DiplomacyEvent): void {
    this.eventLog.unshift(event);
    if (this.eventLog.length > 50) this.eventLog.length = 50;
  }

  private emitEvent(type: string, data: any): void {
    if (this.gameEngine.onStateChange) {
      this.gameEngine.onStateChange(type, data);
    }
  }
}
