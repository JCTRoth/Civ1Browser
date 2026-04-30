/**
 * DiplomacyTypes - Shared type definitions for the Civ I–style diplomacy system.
 *
 * Diplomatic relations between two civilizations are always symmetric:
 * if A is at war with B then B is at war with A.
 */

// ---------------------------------------------------------------------------
// Diplomatic state between two civilizations
// ---------------------------------------------------------------------------

/** Possible diplomatic states (ordered by hostility, low → high) */
export type DiplomaticStatus = 'alliance' | 'peace' | 'ceasefire' | 'war';

/** AI attitude toward another civilization */
export type Attitude = 'friendly' | 'neutral' | 'annoyed' | 'hostile';

// ---------------------------------------------------------------------------
// Per-pair relation record
// ---------------------------------------------------------------------------

/** Active treaty types beyond basic diplomatic status */
export type TreatyType = 'open_borders' | 'trade_agreement' | 'mutual_defense' | 'non_aggression' | 'embargo_target';

export interface DiplomaticRelation {
  /** The two civilization IDs involved (sorted ascending for canonical key) */
  civA: number;
  civB: number;
  status: DiplomaticStatus;
  /** Turn the current status was established */
  since: number;
  /** Accumulated reputation modifier (negative = bad reputation) */
  reputationModifier: number;
  /** Number of treaties broken by civA toward civB */
  treatiesBrokenByA: number;
  /** Number of treaties broken by civB toward civA */
  treatiesBrokenByB: number;
  /** Active treaties beyond the basic status */
  activeTreaties: TreatyType[];
  /** Turn each treaty was established */
  treatySince: Record<string, number>;
  /** Gold-per-turn from trade agreement (positive = A receives, negative = B receives) */
  tradeGoldPerTurn: number;
  /** Embargo target civ id (if either side has an embargo agreement) */
  embargoTargetCivId?: number;
}

// ---------------------------------------------------------------------------
// Diplomat unit action results
// ---------------------------------------------------------------------------

export type DiplomatAction =
  | 'propose_peace'
  | 'propose_ceasefire'
  | 'propose_alliance'
  | 'demand_tribute'
  | 'bribe_unit'
  | 'bribe_city'
  | 'gather_intelligence'
  | 'offer_open_borders'
  | 'propose_trade_agreement'
  | 'offer_tech_exchange'
  | 'propose_mutual_defense'
  | 'propose_embargo'
  | 'propose_non_aggression';

export interface DiplomacyProposal {
  fromCivId: number;
  toCivId: number;
  action: DiplomatAction;
  /** Gold offered / demanded */
  goldAmount?: number;
  /** Technology id offered in exchange */
  techOffered?: string;
  /** Technology id requested in exchange */
  techRequested?: string;
  /** Target civ for embargo */
  embargoTargetId?: number;
}

export interface DiplomacyResponse {
  accepted: boolean;
  reason?: string;
  /** Gold transferred (positive = to proposer, negative = from proposer) */
  goldTransferred?: number;
  /** Counter-proposal (AI may suggest alternative terms) */
  counterProposal?: DiplomacyProposal;
}

// ---------------------------------------------------------------------------
// Intelligence report (from diplomat spy action)
// ---------------------------------------------------------------------------

export interface IntelligenceReport {
  civId: number;
  civName: string;
  gold: number;
  numCities: number;
  numMilitaryUnits: number;
  currentResearch: string | null;
  government: string;
  attitude: Attitude;
}

// ---------------------------------------------------------------------------
// Diplomacy event (emitted via onStateChange)
// ---------------------------------------------------------------------------

export interface DiplomacyEvent {
  type: 'war_declared' | 'peace_made' | 'ceasefire_signed' | 'alliance_formed'
      | 'alliance_broken' | 'tribute_demanded' | 'tribute_paid' | 'unit_bribed'
      | 'intelligence_gathered' | 'treaty_rejected'
      | 'open_borders_signed' | 'trade_agreement_signed' | 'mutual_defense_signed'
      | 'non_aggression_signed' | 'embargo_declared' | 'treaty_cancelled'
      | 'tech_exchanged' | 'counter_proposal';
  fromCivId: number;
  toCivId: number;
  details?: string;
  goldAmount?: number;
}
