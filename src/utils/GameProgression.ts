/**
 * GameProgression – records a per-round snapshot of the game (the
 * "progression list") and exports it as a downloadable JSON file together
 * with a filtered, AI-optimised game log.
 *
 * Purpose: post-game / post-session analysis and AI improvement. Each round
 * captures every civilisation's key metrics (cities, units, techs, gold,
 * science, research, diplomacy, AI personality/priorities) and the log field
 * contains the analysis-relevant event stream (moves, combat, city actions,
 * AI decisions).
 *
 * The export is compact by design so an LLM can analyse it:
 *  - `progression` is delta-encoded: civ fields that did not change since the
 *    previous round are omitted (see `summary.encoding: "delta"`).
 *  - Cities use the slim `CompactCity` shape (redundant / derivable fields are
 *    dropped; itemTypes reference the game's constant tables).
 *  - `log` keeps only analysis-relevant events; the duplicated per-turn city
 *    payloads are removed (city state lives in `progression`).
 *  - The file is written as minified JSON (fewer tokens for the LLM).
 *
 * It is a singleton so the engine hook, AI and UI can all share one buffer.
 */

import { gameLogger } from './GameLogger';
import { GameUtils } from './GameUtils';
import { DomUtils } from './DomUtils';
import { serializeCityCompact } from './CitySnapshots';
import type {
  GameProgressionMeta,
  GameProgressionPayload,
  GameProgressionSummary,
  ProgressionCivDelta,
  ProgressionCivSnapshot,
  ProgressionLogEntry,
  ProgressionRound,
} from '../../types/progression';
import type { GameEngine } from '../../types/game';

/**
 * Events kept in the AI-optimised log. Everything else is engine-internal
 * noise (PHASE_CHANGE, AI_FINISHED, RESEARCH_PHASE, …) with no signal for
 * improving the computer player. Kept events cover the per-move trace, war,
 * city lifecycle, combat, economy, diplomacy and rates.
 */
const LOG_EVENT_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  'app',
  'TURN_START',
  'TURN_END',
  'UNIT_MOVED',
  'UNIT_SKIPPED',
  'UNIT_SLEPT',
  'UNIT_FORTIFIED',
  'COMBAT_VICTORY',
  'COMBAT_DEFEAT',
  'UNIT_DEFEATED',
  'CITY_FOUNDED',
  'CITY_CAPTURED',
  'CITY_DESTROYED',
  'CITY_ATTACKED',
  'CITY_PRODUCTION_CHANGED',
  'CITY_DISORDER',
  'BUILDING_COMPLETED',
  'BUILDING_PURCHASED',
  'UNIT_PRODUCED',
  'UNIT_PURCHASED',
  'RATES_CHANGED',
  'UNIT_DISBANDED',
  'WAR_DECLARED',
  'DIPLOMACY_EVENT',
  'GAME_WON',
  'GAME_LOST',
]);

/** GAME_LOG categories that are pure announcements (redundant with progression). */
const GAME_LOG_DROP_CATEGORIES: ReadonlySet<string> = new Set<string>(['turn', 'map', 'phase', 'round']);

/** Extract the `[category]` prefix of a GAME_LOG entry, if present. */
function logCategory(entry: ProgressionLogEntry): string {
  const dataCategory = (entry.detail?.data as { category?: unknown } | undefined)?.category;
  if (typeof dataCategory === 'string' && dataCategory.length > 0) return dataCategory.toLowerCase();
  const match = /^\[([^\]]+)\]/.exec(entry.message ?? '');
  return match ? match[1].toLowerCase() : '';
}

/**
 * Filter the raw session log down to analysis-relevant events and strip the
 * duplicated full-city payloads (city state already lives in `progression`).
 * `detail.data` (sanitised scalars) is kept — it carries structured fields
 * such as tech, upkeep, deficit and coordinates.
 */
export function filterLogEntries(entries: ProgressionLogEntry[]): ProgressionLogEntry[] {
  return entries
    .filter((entry) => {
      if (entry.event === 'GAME_LOG') {
        return !GAME_LOG_DROP_CATEGORIES.has(logCategory(entry));
      }
      return LOG_EVENT_ALLOWLIST.has(entry.event);
    })
    .map((entry) => {
      const detail = { ...(entry.detail ?? {}) };
      delete detail.city; // full city snapshot — duplicated in progression.cityData
      delete detail.cities; // full city list — duplicated in progression.cityData
      return { ...entry, detail };
    });
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Build the delta-encoded civ entry for one round. `prev` is the previous
 * round's full state; fields that did not change are omitted so the reader
 * carries them forward. `gold`, `science` and `cityData` are always emitted
 * (the per-round scoreboard and city growth timeline are the core signal).
 */
export function computeCivDelta(
  full: ProgressionCivSnapshot,
  prev: ProgressionCivSnapshot | undefined,
): ProgressionCivDelta {
  const delta: ProgressionCivDelta = {
    id: full.id,
    gold: full.gold,
    science: full.science,
    cityData: full.cityData,
  };
  if (!prev) {
    // First recorded round: emit the full state.
    delta.name = full.name;
    delta.leaderName = full.leaderName;
    delta.color = full.color;
    delta.isHuman = full.isHuman;
    delta.alive = full.alive;
    delta.taxRate = full.taxRate;
    delta.scienceRate = full.scienceRate;
    delta.luxuryRate = full.luxuryRate;
    delta.government = full.government;
    delta.cities = full.cities;
    delta.units = full.units;
    delta.technologies = full.technologies;
    delta.techList = full.techList;
    delta.currentResearch = full.currentResearch;
    delta.researchProgress = full.researchProgress;
    delta.warWith = full.warWith;
    delta.personality = full.personality;
    delta.priorities = full.priorities;
    return delta;
  }
  if (full.name !== prev.name) delta.name = full.name;
  if (full.leaderName !== prev.leaderName) delta.leaderName = full.leaderName;
  if (full.color !== prev.color) delta.color = full.color;
  if (full.isHuman !== prev.isHuman) delta.isHuman = full.isHuman;
  if (full.alive !== prev.alive) delta.alive = full.alive;
  if (full.taxRate !== prev.taxRate) delta.taxRate = full.taxRate;
  if (full.scienceRate !== prev.scienceRate) delta.scienceRate = full.scienceRate;
  if (full.luxuryRate !== prev.luxuryRate) delta.luxuryRate = full.luxuryRate;
  if (full.government !== prev.government) delta.government = full.government;
  if (full.cities !== prev.cities) delta.cities = full.cities;
  if (full.units !== prev.units) delta.units = full.units;
  if (full.technologies !== prev.technologies) delta.technologies = full.technologies;
  if (!valuesEqual(full.techList, prev.techList)) delta.techList = full.techList;
  if (full.currentResearch !== prev.currentResearch) delta.currentResearch = full.currentResearch;
  if (full.researchProgress !== prev.researchProgress) delta.researchProgress = full.researchProgress;
  if (!valuesEqual(full.warWith, prev.warWith)) delta.warWith = full.warWith;
  if (!valuesEqual(full.personality, prev.personality)) delta.personality = full.personality;
  if (!valuesEqual(full.priorities, prev.priorities)) delta.priorities = full.priorities;
  return delta;
}

class GameProgression {
  private snapshots: ProgressionRound[] = [];
  private lastRecordedRound = -1;
  private meta: GameProgressionMeta | null = null;
  /** Previous round's full per-civ state, used to compute delta snapshots. */
  private lastCivState: Record<string, ProgressionCivSnapshot> = {};

  /** Start a new session (call right after the engine is initialized). */
  startSession(engine: GameEngine | null, settings: Record<string, unknown> = {}): void {
    this.snapshots = [];
    this.lastRecordedRound = -1;
    this.lastCivState = {};
    this.meta = {
      sessionId: gameLogger.getSessionId() ?? `game-${Date.now()}`,
      mapType: String(settings.mapType ?? 'NORMAL_SKIRMISH'),
      difficulty: String(settings.difficulty ?? 'CHIEFTAIN'),
      numberOfCivilizations: Number(settings.numberOfCivilizations ?? 0),
      playerCivilization: Number(settings.playerCivilization ?? 0),
      startedAt: new Date().toISOString(),
      exportedAt: '',
    };
    this.recordIfNewRound(engine);
  }

  /** Clear all recorded snapshots (e.g. when a game is restarted). */
  reset(): void {
    this.snapshots = [];
    this.lastRecordedRound = -1;
    this.lastCivState = {};
    this.meta = null;
  }

  /**
   * Record one snapshot per round. Called on every engine event; it is a
   * cheap no-op unless the engine has advanced to a new round.
   */
  recordIfNewRound(engine: GameEngine | null): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const round = (engine as any)?.currentTurn ?? 0;
    if (round === this.lastRecordedRound) return;
    this.lastRecordedRound = round;
    this.snapshots.push(this.buildRound(engine, round));
  }

  getSnapshotCount(): number {
    return this.snapshots.length;
  }

  /** Build a downloadable payload combining delta round snapshots + filtered log. */
  async buildDownloadPayload(engine: GameEngine | null): Promise<GameProgressionPayload> {
    this.recordIfNewRound(engine);
    const log = filterLogEntries(
      (await gameLogger.getAllEntries()) as unknown as ProgressionLogEntry[],
    );

    const eventCounts: Record<string, number> = {};
    for (const entry of log) {
      eventCounts[entry.event] = (eventCounts[entry.event] ?? 0) + 1;
    }

    const civNames = Object.values(this.lastCivState).map((c) => c.name);
    const lastRound = this.snapshots[this.snapshots.length - 1];
    const summary: GameProgressionSummary = {
      roundsRecorded: this.snapshots.length,
      civilizations:
        civNames.length > 0
          ? civNames
          : lastRound
            ? Object.values(lastRound.civs).map((c) => String(c.name ?? c.id))
            : [],
      encoding: 'delta',
      eventCounts,
    };
    return {
      meta: {
        ...(this.meta ?? this.defaultMeta()),
        exportedAt: new Date().toISOString(),
      },
      summary,
      progression: this.snapshots,
      log,
    };
  }

  /** Trigger a browser download of the progression list (minified JSON). */
  async download(engine: GameEngine | null): Promise<void> {
    const payload = await this.buildDownloadPayload(engine);
    const filename = `civ1-progression-${payload.meta.sessionId}.json`;
    DomUtils.downloadTextFile(JSON.stringify(payload), filename);
  }

  private defaultMeta(): GameProgressionMeta {
    return {
      sessionId: gameLogger.getSessionId() ?? 'game',
      mapType: 'NORMAL_SKIRMISH',
      difficulty: 'CHIEFTAIN',
      numberOfCivilizations: 0,
      playerCivilization: 0,
      startedAt: new Date().toISOString(),
      exportedAt: '',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildRound(engine: GameEngine | null, round: number): ProgressionRound {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const year = engineAny?.currentYear ?? 0;
    const civs: Record<string, ProgressionCivDelta> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cities: any[] = engine?.getAllCities?.() ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const units: any[] = engine?.getAllUnits?.() ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const civList: any[] = engineAny?.civilizations ?? [];

    for (const civ of civList) {
      const civId = String(civ?.id ?? '?');
      const civCities = cities.filter((c) => String(c?.civilizationId) === civId);
      const civUnits = units.filter((u) => String(u?.civilizationId) === civId).length;
      const techList: string[] = [...(civ?.technologies ?? [])].map(String);

      const full: ProgressionCivSnapshot = {
        id: civ?.id ?? Number(civId),
        name: civ?.name ?? `Civ ${civId}`,
        leaderName: civ?.leaderName ?? '',
        color: civ?.color ?? '#888888',
        isHuman: civ?.isHuman === true,
        alive: civ?.alive !== false,
        gold: civ?.gold ?? 0,
        science: civ?.science ?? 0,
        taxRate: civ?.taxRate ?? 0,
        scienceRate: civ?.scienceRate ?? 50,
        luxuryRate: civ?.luxuryRate ?? 50,
        government: civ?.government ?? 'despotism',
        cities: civCities.length,
        cityData: civCities.map((c) => serializeCityCompact(c)),
        units: civUnits,
        technologies: techList.length,
        techList,
        currentResearch: civ?.currentResearch ?? null,
        researchProgress: civ?.researchProgress ?? 0,
        warWith: [...(civ?.warWith ?? [])].map(String),
        personality: { ...(civ?.personality ?? {}) },
        priorities: { ...(civ?.priorities ?? {}) },
      };

      civs[civId] = computeCivDelta(full, this.lastCivState[civId]);
      this.lastCivState[civId] = full;
    }

    return {
      round,
      year,
      yearLabel: GameUtils.formatYear(year),
      civs,
    };
  }
}

export const gameProgression = new GameProgression();
