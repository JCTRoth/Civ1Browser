/**
 * Unit tests for the Government/Palace/Capital system (GovernmentManager).
 * Covers: tech-gated government availability, revolution (anarchy) switching,
 * the AI's best-government pick, and capital designation / relocation / loss.
 */
import { describe, it, expect } from 'vitest';
import { GovernmentManager, ANARCHY_TURNS } from '../src/game/engine/GovernmentManager';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeEngine(overrides: any = {}): any {
  const engine: any = {
    civilizations: [],
    cities: [],
    economicManager: {
      setGovernment: () => {},
    },
    log: () => {},
    ...overrides,
  };
  return engine;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCiv(id: number, overrides: any = {}): any {
  return {
    id,
    name: `Civ${id}`,
    government: 'despotism',
    technologies: [],
    capital: null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCity(civId: number, id = `city-${civId}-1`, overrides: any = {}): any {
  return {
    id,
    name: `City ${id}`,
    civilizationId: civId,
    col: 5,
    row: 5,
    population: 1,
    buildings: [],
    isCapital: false,
    ...overrides,
  };
}

describe('GovernmentManager.getAvailableGovernments', () => {
  it('returns only despotism when no government techs are researched', () => {
    const civ = makeCiv(0);
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    expect(mgr.getAvailableGovernments(civ)).toEqual(['despotism']);
  });

  it('unlocks each government as its tech is researched', () => {
    const civ = makeCiv(0, { technologies: ['monarchy', 'republic'] });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    const available = mgr.getAvailableGovernments(civ);
    expect(available).toContain('monarchy');
    expect(available).toContain('republic');
    expect(available).not.toContain('democracy');
  });

  it('handles Set<string> technologies', () => {
    const civ = makeCiv(0, { technologies: new Set(['democracy', 'communism']) });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    const available = mgr.getAvailableGovernments(civ);
    expect(available).toContain('democracy');
    expect(available).toContain('communism');
  });
});

describe('GovernmentManager.startRevolution / processTurn', () => {
  it('rejects a government that is not unlocked', () => {
    const civ = makeCiv(0); // no techs
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    expect(mgr.startRevolution(0, 'monarchy')).toBe(false);
    expect(civ.government).toBe('despotism');
  });

  it('enters anarchy and counts down to the pending government', () => {
    const civ = makeCiv(0, { technologies: ['monarchy'] });
    const setGovernmentCalls: string[] = [];
    const engine = makeEngine({
      civilizations: [civ],
      economicManager: {
        setGovernment: (id: number, gov: string) => {
          setGovernmentCalls.push(gov);
          const target = engine.civilizations.find((c: any) => c.id === id);
          if (target) target.government = gov;
        },
      },
    });
    const mgr = new GovernmentManager(engine);

    expect(mgr.startRevolution(0, 'monarchy')).toBe(true);
    expect(civ.government).toBe('anarchy');
    expect(civ.revolutionTurns).toBe(ANARCHY_TURNS);
    expect(civ.pendingGovernment).toBe('monarchy');
    expect(mgr.isInRevolution(civ)).toBe(true);

    // Advance the countdown; the pending government applies when it reaches 0.
    for (let i = 0; i < ANARCHY_TURNS; i++) {
      expect(mgr.isInRevolution(civ)).toBe(true);
      mgr.processTurn(civ);
    }
    expect(mgr.isInRevolution(civ)).toBe(false);
    expect(civ.government).toBe('monarchy');
    expect(civ.pendingGovernment).toBeUndefined();
    expect(setGovernmentCalls).toContain('anarchy');
    expect(setGovernmentCalls).toContain('monarchy');
  });

  it('ignores a startRevolution while already revolting', () => {
    const civ = makeCiv(0, { technologies: ['monarchy', 'republic'] });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    expect(mgr.startRevolution(0, 'monarchy')).toBe(true);
    expect(mgr.startRevolution(0, 'republic')).toBe(false); // already in anarchy
    expect(civ.pendingGovernment).toBe('monarchy');
  });
});

describe('GovernmentManager.bestGovernmentForCiv (AI)', () => {
  it('returns null when only despotism is available', () => {
    const civ = makeCiv(0);
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    expect(mgr.bestGovernmentForCiv(civ)).toBeNull();
  });

  it('prefers the highest-ranked unlocked government', () => {
    const civ = makeCiv(0, { technologies: ['monarchy', 'republic'] });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    expect(mgr.bestGovernmentForCiv(civ)).toBe('republic');
  });

  it('returns null when already in the best government', () => {
    const civ = makeCiv(0, { technologies: ['monarchy', 'republic', 'democracy'], government: 'democracy' });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    expect(mgr.bestGovernmentForCiv(civ)).toBeNull();
  });
});

describe('GovernmentManager.evaluateGovernmentForCiv (situational AI pick)', () => {
  function empireCiv(id: number, techs: string[], personality: Record<string, number>) {
    return makeCiv(id, { technologies: techs, personality });
  }

  function threeCities() {
    return [
      makeCity(0, 'city-a', { population: 5 }),
      makeCity(0, 'city-b', { population: 5 }),
      makeCity(0, 'city-c', { population: 5 }),
    ];
  }

  it('returns null when only despotism is available', () => {
    const civ = makeCiv(0);
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ] }));
    expect(mgr.evaluateGovernmentForCiv(civ)).toBeNull();
  });

  it('upgrades to republic for a growing, science-minded empire', () => {
    const civ = empireCiv(0, ['monarchy', 'republic'], { science: 5 });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ], cities: threeCities() }));
    expect(mgr.evaluateGovernmentForCiv(civ)).toBe('republic');
  });

  it('does NOT pick democracy when the civ is tax-constrained (military)', () => {
    const civ = empireCiv(0, ['monarchy', 'republic', 'democracy'], { military: 10 });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ], cities: threeCities() }));
    const best = mgr.evaluateGovernmentForCiv(civ);
    expect(best).not.toBe('democracy');
    expect(['monarchy', 'republic']).toContain(best);
  });

  it('keeps the current government when it is already the best', () => {
    // Democracy unlocked and already in use — only despotism is "below" it.
    const civ = makeCiv(0, {
      technologies: ['democracy'],
      government: 'democracy',
      personality: { science: 6 },
    });
    const mgr = new GovernmentManager(makeEngine({ civilizations: [civ], cities: threeCities() }));
    expect(mgr.evaluateGovernmentForCiv(civ)).toBeNull();
  });
});

describe('GovernmentManager capital management', () => {
  it('designates the first city as capital with a free Palace', () => {
    const civ = makeCiv(0);
    const city = makeCity(0);
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const mgr = new GovernmentManager(engine);

    mgr.designateCapital(0, city);
    expect(city.isCapital).toBe(true);
    expect(city.buildings).toContain('palace');
    expect(civ.capital).toBe(city);
  });

  it('moving the capital demotes the old one and relocates the Palace', () => {
    const oldCap = makeCity(0, 'city-a', { isCapital: true, buildings: ['palace', 'granary'] });
    const newCap = makeCity(0, 'city-b');
    const civ = makeCiv(0, { capital: oldCap });
    const engine = makeEngine({ civilizations: [civ], cities: [oldCap, newCap] });
    const mgr = new GovernmentManager(engine);

    mgr.designateCapital(0, newCap);
    expect(oldCap.isCapital).toBe(false);
    expect(oldCap.buildings).not.toContain('palace');
    expect(oldCap.buildings).toContain('granary'); // other buildings stay
    expect(newCap.isCapital).toBe(true);
    expect(newCap.buildings).toContain('palace');
    expect(civ.capital).toBe(newCap);
  });

  it('ensureCapital replaces a destroyed capital with a city holding a Palace', () => {
    const destroyed = makeCity(0, 'city-destroyed', { isCapital: true, buildings: ['palace'] });
    const withPalace = makeCity(0, 'city-palace', { buildings: ['palace', 'temple'] });
    const civ = makeCiv(0, { capital: destroyed });
    const engine = makeEngine({ civilizations: [civ], cities: [withPalace] });
    const mgr = new GovernmentManager(engine);

    mgr.ensureCapital(0);
    expect(civ.capital).toBe(withPalace);
    expect(withPalace.isCapital).toBe(true);
    expect(withPalace.buildings).toContain('palace');
  });

  it('ensureCapital grants a free Palace to the first remaining city if none has one', () => {
    const destroyed = makeCity(0, 'city-destroyed', { isCapital: true, buildings: ['palace'] });
    const fallback = makeCity(0, 'city-fallback');
    const civ = makeCiv(0, { capital: destroyed });
    const engine = makeEngine({ civilizations: [civ], cities: [fallback] });
    const mgr = new GovernmentManager(engine);

    mgr.ensureCapital(0);
    expect(civ.capital).toBe(fallback);
    expect(fallback.isCapital).toBe(true);
    expect(fallback.buildings).toContain('palace');
  });
});
