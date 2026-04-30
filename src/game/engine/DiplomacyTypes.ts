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
  | 'gather_intelligence';

export interface DiplomacyProposal {
  fromCivId: number;
  toCivId: number;
  action: DiplomatAction;
  /** Gold offered / demanded */
  goldAmount?: number;
}

export interface DiplomacyResponse {
  accepted: boolean;
  reason?: string;
  /** Gold transferred (positive = to proposer, negative = from proposer) */
  goldTransferred?: number;
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
      | 'intelligence_gathered' | 'treaty_rejected';
  fromCivId: number;
  toCivId: number;
  details?: string;
  goldAmount?: number;
}
