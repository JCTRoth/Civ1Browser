/**
 * Verifies the compact AI-optimised progression export helpers:
 *  - filterLogEntries drops engine-internal noise + noisy GAME_LOG categories
 *    and strips the duplicated full-city payloads.
 *  - computeCivDelta delta-encodes unchanged civ fields across rounds.
 *  - serializeCityCompact produces the slim city snapshot.
 */
import { describe, it, expect } from 'vitest';
import { filterLogEntries, computeCivDelta } from '../src/utils/GameProgression';
import { serializeCityCompact } from '../src/utils/CitySnapshots';
import type { ProgressionCivSnapshot, ProgressionLogEntry } from '../types/progression';

function entry(event: string, message = '', detail: Record<string, unknown> = {}): ProgressionLogEntry {
  return { ts: '2026-01-01T00:00:00.000Z', round: 1, player: 0, event, message, detail };
}

describe('filterLogEntries', () => {
  it('drops engine-internal noise events', () => {
    const entries = [
      entry('PHASE_CHANGE', '  phase → moving (civ 0)'),
      entry('AI_FINISHED', '🤖 AI turn finished — civ 0'),
      entry('RESEARCH_PHASE', '🔬 Research phase — civ 0'),
      entry('UNIT_MOVED', 'Move: warrior(5) → (12,8)'),
    ];
    const filtered = filterLogEntries(entries);
    expect(filtered.map((e) => e.event)).toEqual(['UNIT_MOVED']);
  });

  it('drops noisy GAME_LOG categories but keeps AI/economy decisions', () => {
    const entries = [
      entry('GAME_LOG', '[turn] ROUND 100 | Year: 2000 BC', { data: { category: 'turn' } }),
      entry('GAME_LOG', '[map] exploring terrain', { data: { category: 'map' } }),
      entry('GAME_LOG', '[ai] Research — Germans selects pottery (balanced_growth)', {
        data: { category: 'ai', tech: 'pottery' },
      }),
      entry('GAME_LOG', '[economy] Upkeep −5 gold (deficit 0)', {
        data: { category: 'economy', upkeep: 5, deficit: 0 },
      }),
    ];
    const filtered = filterLogEntries(entries);
    expect(filtered.map((e) => e.message)).toEqual([
      '[ai] Research — Germans selects pottery (balanced_growth)',
      '[economy] Upkeep −5 gold (deficit 0)',
    ]);
  });

  it('strips duplicated full-city payloads from kept entries', () => {
    const entries = [
      entry('TURN_END', '■ Turn end — civ 0 (round 1)', {
        data: { civilizationId: 0, roundNumber: 1, cities: '[array:1]' },
        cities: [{ id: 'city_1', name: 'Berlin', civilizationId: 0, col: 5, row: 7, population: 2 }],
      }),
      entry('CITY_FOUNDED', '🏙 City founded: Berlin at (5,7)', {
        data: { city: '{id,name,...}' },
        city: { id: 'city_1', name: 'Berlin', civilizationId: 0, col: 5, row: 7, population: 1 },
      }),
    ];
    const filtered = filterLogEntries(entries);
    expect(filtered).toHaveLength(2);
    for (const e of filtered) {
      expect(e.detail).not.toHaveProperty('city');
      expect(e.detail).not.toHaveProperty('cities');
      expect(e.detail.data).toBeDefined();
    }
  });
});

describe('computeCivDelta', () => {
  const baseCiv = (): ProgressionCivSnapshot => ({
    id: 0,
    name: 'Germans',
    leaderName: '',
    color: '#949494',
    isHuman: false,
    alive: true,
    gold: 50,
    science: 12,
    taxRate: 50,
    scienceRate: 50,
    luxuryRate: 0,
    government: 'despotism',
    cities: 2,
    cityData: [],
    units: 3,
    technologies: 3,
    techList: ['irrigation', 'mining', 'roads'],
    currentResearch: 'pottery',
    researchProgress: 20,
    warWith: [],
    personality: { aggression: 50 },
    priorities: { militaryUnits: 20 },
  });

  it('emits the full state on the first round', () => {
    const delta = computeCivDelta(baseCiv(), undefined);
    expect(delta.id).toBe(0);
    expect(delta.name).toBe('Germans');
    expect(delta.techList).toEqual(['irrigation', 'mining', 'roads']);
    expect(delta.personality).toEqual({ aggression: 50 });
    expect(delta.government).toBe('despotism');
  });

  it('omits unchanged fields in later rounds but always emits gold/science/cityData', () => {
    const prev = baseCiv();
    const next = { ...baseCiv(), gold: 62, science: 18 };
    const delta = computeCivDelta(next, prev);
    expect(delta.gold).toBe(62);
    expect(delta.science).toBe(18);
    expect(delta.cityData).toEqual([]);
    expect(delta).not.toHaveProperty('techList');
    expect(delta).not.toHaveProperty('personality');
    expect(delta).not.toHaveProperty('priorities');
    expect(delta).not.toHaveProperty('government');
    expect(delta).not.toHaveProperty('name');
    expect(delta).not.toHaveProperty('warWith');
  });

  it('emits only the changed fields', () => {
    const prev = baseCiv();
    const next = {
      ...baseCiv(),
      techList: ['irrigation', 'mining', 'roads', 'pottery'],
      cities: 3,
      currentResearch: 'code_of_laws',
      researchProgress: 35,
    };
    const delta = computeCivDelta(next, prev);
    expect(delta.techList).toEqual(['irrigation', 'mining', 'roads', 'pottery']);
    expect(delta.cities).toBe(3);
    expect(delta.currentResearch).toBe('code_of_laws');
    expect(delta.researchProgress).toBe(35);
    expect(delta).not.toHaveProperty('warWith');
    expect(delta).not.toHaveProperty('priorities');
  });
});

describe('serializeCityCompact', () => {
  it('produces a slim city snapshot with itemTypes instead of full item objects', () => {
    const city = {
      id: 'city_1',
      name: 'Berlin',
      civilizationId: 0,
      col: 5,
      row: 7,
      population: 8,
      production: 0,
      food: 0,
      gold: 0,
      science: 0,
      productionProgress: 27,
      productionStored: 27,
      currentProduction: { type: 'unit', itemType: 'phalanx', name: 'Phalanx', cost: 50 },
      buildQueue: [
        { type: 'building', itemType: 'granary', name: 'Granary', cost: 60 },
        { type: 'building', itemType: 'barracks', name: 'Barracks', cost: 40 },
      ],
      isCapital: true,
      yields: { food: 12, production: 9, trade: 4 },
      foodStored: 48,
      foodNeeded: 160,
      buildings: ['palace', 'granary'],
      autoProduction: true,
      processTurn: () => {},
    };
    const compact = serializeCityCompact(city);
    expect(compact).toEqual({
      id: 'city_1',
      name: 'Berlin',
      civilizationId: 0,
      col: 5,
      row: 7,
      population: 8,
      productionStored: 27,
      currentProduction: 'phalanx',
      buildQueue: ['granary', 'barracks'],
      isCapital: true,
      yields: { food: 12, production: 9, trade: 4 },
      foodStored: 48,
      foodNeeded: 160,
      buildings: ['palace', 'granary'],
      autoProduction: true,
    });
    expect(JSON.stringify(compact)).not.toContain('processTurn');
    expect(JSON.stringify(compact)).not.toContain('"cost"');
  });

  it('falls back to productionProgress when productionStored is missing', () => {
    const compact = serializeCityCompact({ id: 'c', name: 'X', civilizationId: 0, col: 1, row: 1, population: 1, productionProgress: 12 });
    expect(compact.productionStored).toBe(12);
  });
});
