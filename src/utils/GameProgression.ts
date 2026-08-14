/**
 * GameProgression – records a per-round snapshot of the game (the
 * "progression list") and exports it as a downloadable JSON file together
 * with the full game log.
 *
 * Purpose: post-game / post-session analysis and AI improvement. Each round
 * captures every civilisation's key metrics (cities, units, techs, gold,
 * science, research, diplomacy, AI personality/priorities) and the log field
 * contains the raw event stream (moves, combat, city actions, AI decisions).
 *
 * It is a singleton so the engine hook, AI and UI can all share one buffer.
 */

import { gameLogger } from './GameLogger';
import { GameUtils } from './GameUtils';
import { DomUtils } from './DomUtils';
import { serializeCity } from './CitySnapshots';
import type { CitySnapshot } from './CitySnapshots';
import type { GameEngine } from '../../types/game';

export interface ProgressionCivSnapshot {
  id: string;
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
  /** Full per-player city JSONs (one entry per city owned by this civ). */
  cityData: CitySnapshot[];
  units: number;
  technologies: number;
  techList: string[];
  currentResearch: string | null;
  researchProgress: number;
  warWith: string[];
  personality: Record<string, number>;
  priorities: Record<string, number>;
}

export interface ProgressionRound {
  round: number;
  year: number;
  yearLabel: string;
  civs: Record<string, ProgressionCivSnapshot>;
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

export interface GameProgressionPayload {
  meta: GameProgressionMeta;
  summary: {
    roundsRecorded: number;
    civilizations: string[];
    eventCounts: Record<string, number>;
  };
  progression: ProgressionRound[];
  log: unknown[];
}

class GameProgression {
  private snapshots: ProgressionRound[] = [];
  private lastRecordedRound = -1;
  private meta: GameProgressionMeta | null = null;

  /** Start a new session (call right after the engine is initialized). */
  startSession(engine: GameEngine | null, settings: Record<string, unknown> = {}): void {
    this.snapshots = [];
    this.lastRecordedRound = -1;
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

  /** Build a downloadable payload combining round snapshots + full game log. */
  async buildDownloadPayload(engine: GameEngine | null): Promise<GameProgressionPayload> {
    this.recordIfNewRound(engine);
    const log = await gameLogger.getAllEntries();

    const eventCounts: Record<string, number> = {};
    for (const entry of log) {
      const event = (entry as { event?: string })?.event ?? 'unknown';
      eventCounts[event] = (eventCounts[event] ?? 0) + 1;
    }

    const lastRound = this.snapshots[this.snapshots.length - 1];
    return {
      meta: {
        ...(this.meta ?? this.defaultMeta()),
        exportedAt: new Date().toISOString(),
      },
      summary: {
        roundsRecorded: this.snapshots.length,
        civilizations: lastRound
          ? Object.values(lastRound.civs).map((c) => c.name)
          : [],
        eventCounts,
      },
      progression: this.snapshots,
      log,
    };
  }

  /** Trigger a browser download of the progression list. */
  async download(engine: GameEngine | null): Promise<void> {
    const payload = await this.buildDownloadPayload(engine);
    const filename = `civ1-progression-${payload.meta.sessionId}.json`;
    DomUtils.downloadTextFile(JSON.stringify(payload, null, 2), filename);
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
    const civs: Record<string, ProgressionCivSnapshot> = {};
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

      civs[civId] = {
        id: civ?.id ?? civId,
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
        cityData: civCities.map((c) => serializeCity(c)),
        units: civUnits,
        technologies: techList.length,
        techList,
        currentResearch: civ?.currentResearch ?? null,
        researchProgress: civ?.researchProgress ?? 0,
        warWith: [...(civ?.warWith ?? [])].map(String),
        personality: { ...(civ?.personality ?? {}) },
        priorities: { ...(civ?.priorities ?? {}) },
      };
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
