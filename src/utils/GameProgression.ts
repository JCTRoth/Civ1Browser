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
 * carries them forward. The per-round scoreboard (score/gold/science/trade/
 * production/food/population/military/wonders) and `cityData` are always
 * emitted — they are the core progression signal.
 */
export function computeCivDelta(
  full: ProgressionCivSnapshot,
  prev: ProgressionCivSnapshot | undefined,
): ProgressionCivDelta {
  const delta: ProgressionCivDelta = {
    id: full.id,
    score: full.score,
    gold: full.gold,
    goldPerTurn: full.goldPerTurn,
    science: full.science,
    trade: full.trade,
    production: full.production,
    food: full.food,
    population: full.population,
    military: full.military,
    wonders: full.wonders,
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

/** Reconstruct a civ's full state by carrying a delta forward from the previous round. */
export function hydrateCiv(
  prev: ProgressionCivSnapshot | undefined,
  delta: ProgressionCivDelta,
): ProgressionCivSnapshot {
  return {
    id: delta.id,
    name: delta.name ?? prev?.name ?? `Civ ${delta.id}`,
    leaderName: delta.leaderName ?? prev?.leaderName ?? '',
    color: delta.color ?? prev?.color ?? '#888888',
    isHuman: delta.isHuman ?? prev?.isHuman ?? false,
    alive: delta.alive ?? prev?.alive ?? true,
    score: delta.score ?? prev?.score ?? 0,
    gold: delta.gold ?? prev?.gold ?? 0,
    goldPerTurn: delta.goldPerTurn ?? prev?.goldPerTurn ?? 0,
    science: delta.science ?? prev?.science ?? 0,
    trade: delta.trade ?? prev?.trade ?? 0,
    production: delta.production ?? prev?.production ?? 0,
    food: delta.food ?? prev?.food ?? 0,
    taxRate: delta.taxRate ?? prev?.taxRate ?? 0,
    scienceRate: delta.scienceRate ?? prev?.scienceRate ?? 50,
    luxuryRate: delta.luxuryRate ?? prev?.luxuryRate ?? 50,
    government: delta.government ?? prev?.government ?? 'despotism',
    cities: delta.cities ?? prev?.cities ?? 0,
    cityData: delta.cityData ?? prev?.cityData ?? [],
    population: delta.population ?? prev?.population ?? 0,
    units: delta.units ?? prev?.units ?? 0,
    military: delta.military ?? prev?.military ?? 0,
    technologies: delta.technologies ?? prev?.technologies ?? 0,
    techList: delta.techList ?? prev?.techList ?? [],
    currentResearch:
      delta.currentResearch !== undefined ? delta.currentResearch : (prev?.currentResearch ?? null),
    researchProgress: delta.researchProgress ?? prev?.researchProgress ?? 0,
    warWith: delta.warWith ?? prev?.warWith ?? [],
    wonders: delta.wonders ?? prev?.wonders ?? 0,
    personality: delta.personality ?? prev?.personality ?? {},
    priorities: delta.priorities ?? prev?.priorities ?? {},
  };
}

/** Quote a CSV cell when it contains a comma, quote, or newline. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

  /**
   * Strongly reduced export: a single CSV scoreboard (one row per civ per
   * round) with the per-round key metrics only. Drops the event log, the
   * per-city detail and the personality/rates/tech-list noise — the result is
   * orders of magnitude smaller than the full JSON (≈ KBs for hundreds of
   * moves) while still carrying the full game-state timeline an LLM needs to
   * optimise the computer player.
   */
  async buildCompactCsv(engine: GameEngine | null): Promise<string> {
    this.recordIfNewRound(engine);
    const meta = this.meta ?? this.defaultMeta();
    const lines: string[] = [];
    lines.push(
      `# Civ1Browser progression (compact) — session ${meta.sessionId} | map ${meta.mapType} | difficulty ${meta.difficulty} | civs ${meta.numberOfCivilizations} | rounds ${this.snapshots.length}`,
    );
    lines.push(
      'round,year,civId,civ,human,alive,score,gold,goldPerTurn,science,trade,production,food,cities,population,units,military,techs,research,researchProgress,government,tax,scirate,lux,warWith,wonders',
    );

    // Carry each civ's state forward across rounds (the snapshots are
    // delta-encoded: omitted fields stay unchanged from the previous round).
    const carried: Record<string, ProgressionCivSnapshot> = {};
    for (const round of this.snapshots) {
      for (const [civId, delta] of Object.entries(round.civs)) {
        const full = hydrateCiv(carried[civId], delta);
        carried[civId] = full;
        lines.push(
          [
            round.round,
            round.year,
            full.id,
            full.name,
            full.isHuman,
            full.alive,
            full.score,
            full.gold,
            full.goldPerTurn,
            full.science,
            full.trade,
            full.production,
            full.food,
            full.cities,
            full.population,
            full.units,
            full.military,
            full.technologies,
            full.currentResearch ?? '',
            full.researchProgress,
            full.government,
            full.taxRate,
            full.scienceRate,
            full.luxuryRate,
            (full.warWith ?? []).join('|'),
            full.wonders,
          ]
            .map(csvCell)
            .join(','),
        );
      }
    }
    return `${lines.join('\n')}\n`;
  }

  /** Trigger a browser download of the compact CSV progression scoreboard. */
  async downloadCompact(engine: GameEngine | null): Promise<void> {
    const csv = await this.buildCompactCsv(engine);
    const sessionId = this.meta?.sessionId ?? gameLogger.getSessionId() ?? 'game';
    DomUtils.downloadTextFile(csv, `civ1-progression-compact-${sessionId}.csv`);
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
      const civUnitList = units.filter((u) => String(u?.civilizationId) === civId);
      const techList: string[] = [...(civ?.technologies ?? [])].map(String);

      // `currentResearch` is the tech OBJECT on engine civs — reduce it to its
      // id (fall back to name) so exports carry a plain string, not
      // "[object Object]".
      const researchRaw = civ?.currentResearch;
      const currentResearch = researchRaw == null
        ? null
        : typeof researchRaw === 'object'
          ? String(researchRaw.id ?? researchRaw.name ?? '')
          : String(researchRaw);

      // Real per-turn outputs / treasury live under `civ.resources` on the
      // engine's plain-object civs (there is no top-level `civ.gold`).
      const resources = civ?.resources ?? {};

      const full: ProgressionCivSnapshot = {
        id: civ?.id ?? Number(civId),
        name: civ?.name ?? `Civ ${civId}`,
        leaderName: civ?.leader ?? civ?.leaderName ?? '',
        color: civ?.color ?? '#888888',
        isHuman: civ?.isHuman === true,
        alive: civ?.isAlive !== false,
        score: civ?.score ?? 0,
        gold: resources.gold ?? 0,
        goldPerTurn: civCities.reduce((sum, c) => sum + (c.tax ?? 0), 0),
        science: resources.science ?? 0,
        trade: resources.trade ?? civCities.reduce((sum, c) => sum + (c.trade ?? 0), 0),
        production: civCities.reduce((sum, c) => sum + (c.yields?.production ?? 0), 0),
        food: civCities.reduce((sum, c) => sum + (c.yields?.food ?? 0), 0),
        taxRate: civ?.taxRate ?? 0,
        scienceRate: civ?.scienceRate ?? 50,
        luxuryRate: civ?.luxuryRate ?? 50,
        government: civ?.government ?? 'despotism',
        cities: civCities.length,
        cityData: civCities.map((c) => serializeCityCompact(c)),
        population: civCities.reduce((sum, c) => sum + (c.population ?? 0), 0),
        units: civUnitList.length,
        military: civUnitList.reduce(
          (sum, u) => sum + (u.attack ?? 0) + (u.defense ?? 0) * 0.5,
          0,
        ),
        technologies: techList.length,
        techList,
        currentResearch,
        researchProgress: civ?.researchProgress ?? 0,
        // Plain civs don't carry `warWith` — ask the diplomacy manager.
        warWith: [
          ...(engineAny?.diplomacyManager?.getEnemies?.(civ?.id) ?? [...(civ?.warWith ?? [])]),
        ].map(String),
        wonders: civCities.reduce(
          (sum, c) => sum + (Array.isArray(c?.wonders) ? c.wonders.length : 0),
          0,
        ),
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
