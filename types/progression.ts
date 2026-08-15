// Types for the Game Progression export (INFO menu → Download Game Progression List).
// Kept in types/ per repo convention; consumed by src/utils/GameProgression.ts.
// The export is compact by design so an LLM can analyse it:
//  - progression is delta-encoded (summary.encoding === 'delta')
//  - cities use the slim CompactCity shape
//  - log contains only analysis-relevant, de-duplicated events
import type { CompactCity } from '../src/utils/CitySnapshots';

/** Full per-civ state for one round (used as the delta baseline). */
export interface ProgressionCivSnapshot {
  id: number;
  name: string;
  leaderName: string;
  color: string;
  isHuman: boolean;
  alive: boolean;
  gold: number;
  science: number;
  taxRate: number;
  scienceRate: number;
  luxuryRate: number;
  government: string;
  cities: number;
  /** Slim per-player city list (one entry per city owned by this civ). */
  cityData: CompactCity[];
  units: number;
  technologies: number;
  techList: string[];
  currentResearch: string | null;
  researchProgress: number;
  warWith: string[];
  personality: Record<string, number>;
  priorities: Record<string, number>;
}

/**
 * Delta-encoded per-round civ entry: fields omitted in a round are carried
 * forward unchanged from the previous round. `gold`, `science` and `cityData`
 * are always emitted (per-round scoreboard + city growth timeline).
 */
export interface ProgressionCivDelta {
  id: number;
  name?: string;
  leaderName?: string;
  color?: string;
  isHuman?: boolean;
  alive?: boolean;
  gold: number;
  science: number;
  taxRate?: number;
  scienceRate?: number;
  luxuryRate?: number;
  government?: string;
  cities?: number;
  cityData: CompactCity[];
  units?: number;
  technologies?: number;
  techList?: string[];
  currentResearch?: string | null;
  researchProgress?: number;
  warWith?: string[];
  personality?: Record<string, number>;
  priorities?: Record<string, number>;
}

export interface ProgressionRound {
  round: number;
  year: number;
  yearLabel: string;
  civs: Record<string, ProgressionCivDelta>;
}

export interface GameProgressionMeta {
  sessionId: string;
  mapType: string;
  difficulty: string;
  numberOfCivilizations: number;
  playerCivilization: number;
  startedAt: string;
  exportedAt: string;
}

export interface GameProgressionSummary {
  roundsRecorded: number;
  civilizations: string[];
  /** 'delta' — civ fields omitted in a round are carried forward. */
  encoding: 'delta';
  eventCounts: Record<string, number>;
}

export interface GameProgressionPayload {
  meta: GameProgressionMeta;
  summary: GameProgressionSummary;
  progression: ProgressionRound[];
  log: ProgressionLogEntry[];
}

/** A log entry after export-time filtering/slimming (city payloads stripped). */
export interface ProgressionLogEntry {
  ts: string;
  round: number;
  player: number;
  event: string;
  message: string;
  detail: Record<string, unknown>;
}
