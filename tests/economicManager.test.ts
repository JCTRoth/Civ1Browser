/**
 * Unit tests for the Tax/Science/Luxury economic system (EconomicManager).
 * Covers: rate invariant (sum=100), clamping, government caps/anarchy, per-city
 * commerce split, civ-level totals, upkeep + deficit disbanding, happiness /
 * disorder, and the research-compounding fix.
 */
import { describe, it, expect } from 'vitest';
import { EconomicManager } from '../src/game/engine/EconomicManager';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeEngine(overrides: any = {}): any {
  return {
    civilizations: [],
    cities: [],
    units: [],
    onStateChange: null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCiv(id: number, overrides: any = {}): any {
  return {
    id,
    name: `Civ${id}`,
    resources: { food: 0, production: 0, trade: 0, science: 0, gold: 50 },
    taxRate: 0,
    scienceRate: 50,
    luxuryRate: 50,
    government: 'despotism',
    technologies: [],
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCity(civId: number, trade: number, population = 1, overrides: any = {}): any {
  return {
    id: `city-${civId}-${trade}-${population}`,
    name: `City of Civ${civId}`,
    civilizationId: civId,
    col: 5,
    row: 5,
    population,
    yields: { food: 2, production: 1, trade },
    buildings: [],
    ...overrides,
  };
}

describe('EconomicManager.setRates', () => {
  it('enforces the sum of rates = 100 (proportional redistribution)', () => {
    const civ = makeCiv(0);
    const engine = makeEngine({ civilizations: [civ] });
    const econ = new EconomicManager(engine);

    // 160 total → normalize proportionally to 0 / 50 / 50
    econ.setRates(0, 0, 80, 80);
    expect(civ.taxRate + civ.scienceRate + civ.luxuryRate).toBe(100);
    expect(civ.taxRate).toBe(0);
    expect(civ.scienceRate).toBe(50);
    expect(civ.luxuryRate).toBe(50);

    // Already valid — unchanged
    econ.setRates(0, 30, 50, 20);
    expect(civ.taxRate).toBe(30);
    expect(civ.scienceRate).toBe(50);
    expect(civ.luxuryRate).toBe(20);
    expect(civ.taxRate + civ.scienceRate + civ.luxuryRate).toBe(100);
  });

  it('clamps values to 0..100', () => {
    const civ = makeCiv(0);
    const engine = makeEngine({ civilizations: [civ] });
    const econ = new EconomicManager(engine);

    econ.setRates(0, -20, 150, -5);
    const sum = civ.taxRate + civ.scienceRate + civ.luxuryRate;
    expect(sum).toBe(100);
    expect(civ.taxRate).toBeGreaterThanOrEqual(0);
    expect(civ.scienceRate).toBeLessThanOrEqual(100);
    expect(civ.luxuryRate).toBeGreaterThanOrEqual(0);
  });

  it('caps tax at the democracy max (10%)', () => {
    const civ = makeCiv(0, { government: 'democracy' });
    const engine = makeEngine({ civilizations: [civ] });
    const econ = new EconomicManager(engine);

    econ.setRates(0, 50, 25, 25);
    expect(civ.taxRate).toBe(10);
    expect(civ.taxRate + civ.scienceRate + civ.luxuryRate).toBe(100);
  });

  it('forces all rates to 0 during anarchy', () => {
    const civ = makeCiv(0, { government: 'anarchy' });
    const engine = makeEngine({ civilizations: [civ] });
    const econ = new EconomicManager(engine);

    econ.setRates(0, 30, 40, 30);
    expect(civ.taxRate).toBe(0);
    expect(civ.scienceRate).toBe(0);
    expect(civ.luxuryRate).toBe(0);
  });

  it('setGovernment switches government and re-applies caps', () => {
    const civ = makeCiv(0);
    const engine = makeEngine({ civilizations: [civ] });
    const econ = new EconomicManager(engine);

    econ.setRates(0, 50, 25, 25);
    econ.setGovernment(0, 'democracy');
    expect(civ.government).toBe('democracy');
    expect(civ.taxRate).toBe(10);
    expect(civ.taxRate + civ.scienceRate + civ.luxuryRate).toBe(100);
  });
});

describe('EconomicManager city commerce split', () => {
  it('splits city commerce by the civ rates (30/50/20 over trade 10)', () => {
    const civ = makeCiv(0, { taxRate: 30, scienceRate: 50, luxuryRate: 20 });
    const city = makeCity(0, 10);
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const econ = new EconomicManager(engine);

    const out = econ.cityOutputs(city, civ);
    expect(out.commerce).toBe(10); // no capital → no corruption
    expect(out.tax).toBe(3);
    expect(out.science).toBe(5);
    expect(out.luxury).toBe(2);
  });

  it('sums civ-level gold / science / luxury across cities', () => {
    const civ = makeCiv(0, { taxRate: 30, scienceRate: 50, luxuryRate: 20 });
    const cityA = makeCity(0, 10);
    const cityB = makeCity(0, 20);
    const engine = makeEngine({ civilizations: [civ], cities: [cityA, cityB] });
    const econ = new EconomicManager(engine);

    expect(econ.civGold(0)).toBe(9);      // 3 + 6
    expect(econ.civScience(0)).toBe(15);  // 5 + 10
    expect(econ.civLuxury(0)).toBe(6);    // 2 + 4
    expect(econ.civCommerce(0)).toBe(30);
  });
});

describe('EconomicManager upkeep & treasury', () => {
  it('adds tax income and subtracts unit + city upkeep', () => {
    const civ = makeCiv(0, { taxRate: 30, scienceRate: 50, luxuryRate: 20, isHuman: true });
    const city = makeCity(0, 10);
    const unit = { id: 'u1', civilizationId: 0, maintenance: 1 };
    const engine = makeEngine({ civilizations: [civ], cities: [city], units: [unit] });
    const econ = new EconomicManager(engine);

    const result = econ.processTurn(civ);
    // income +3 (tax); the single unit is free (1 city supports 1 unit), so
    // upkeep = 1 city only → gold 50 + 3 - 1 = 52
    expect(civ.resources.gold).toBe(52);
    expect(result.upkeep).toBe(1);
    expect(result.tax).toBe(3);
    expect(result.deficit).toBe(0);
    expect(result.disbanded).toBe(0);
  });

  it('charges upkeep for units beyond the free city support', () => {
    // isHuman: true so the AI auto-tax safeguard does not interfere.
    const civ = makeCiv(0, { taxRate: 30, scienceRate: 50, luxuryRate: 20, isHuman: true });
    const city = makeCity(0, 10);
    // 2 extra units beyond the 1 free unit supported by the city
    const units = [
      { id: 'u1', civilizationId: 0, maintenance: 1 },
      { id: 'u2', civilizationId: 0, maintenance: 1 },
      { id: 'u3', civilizationId: 0, maintenance: 1 },
    ];
    const engine = makeEngine({ civilizations: [civ], cities: [city], units });
    const econ = new EconomicManager(engine);

    const result = econ.processTurn(civ);
    // upkeep = 1 city + 2 extra units = 3 → gold 50 + 3 - 3 = 50
    expect(result.upkeep).toBe(3);
    expect(civ.resources.gold).toBe(50);
    expect(result.deficit).toBe(0);
  });

  it('allows ordinary deficits without disbanding', () => {
    // isHuman: true so the AI auto-tax safeguard does not interfere.
    const civ = makeCiv(0, { taxRate: 0, scienceRate: 50, luxuryRate: 50, isHuman: true });
    civ.resources.gold = 5;
    const city = makeCity(0, 5);
    const units = [
      { id: 'u1', civilizationId: 0, maintenance: 1 },
      { id: 'u2', civilizationId: 0, maintenance: 1 },
      { id: 'u3', civilizationId: 0, maintenance: 1 },
    ];
    const engine = makeEngine({ civilizations: [civ], cities: [city], units });
    const econ = new EconomicManager(engine);

    const result = econ.processTurn(civ);
    // upkeep = 1 city + 2 extra units = 3, income 0 → gold 5 - 3 = 2 (positive).
    expect(result.upkeep).toBe(3);
    expect(result.deficit).toBe(0);
    expect(result.disbanded).toBe(0);
    expect(civ.resources.gold).toBe(2);
  });

  it('disbands units only on a catastrophic deficit, then forgives the debt', () => {
    // isHuman: true so the AI auto-tax safeguard does not interfere.
    const civ = makeCiv(0, { taxRate: 0, scienceRate: 50, luxuryRate: 50, isHuman: true });
    civ.resources.gold = -30; // far below the -3×upkeep catastrophe threshold
    const city = makeCity(0, 5);
    const units = [
      { id: 'u1', civilizationId: 0, maintenance: 1 },
      { id: 'u2', civilizationId: 0, maintenance: 1 },
      { id: 'u3', civilizationId: 0, maintenance: 1 },
    ];
    const engine = makeEngine({ civilizations: [civ], cities: [city], units });
    const econ = new EconomicManager(engine);

    const result = econ.processTurn(civ);
    // upkeep = 1 city + 2 extra units = 3, income 0 → gold -33 < -9 → disband
    // enough units to bring upkeep ≤ income, keeping one garrison per city
    // (a civ that loses every unit to bankruptcy can never recover), and
    // forgive the debt.
    expect(result.upkeep).toBe(3);
    expect(result.deficit).toBeGreaterThan(0);
    expect(result.disbanded).toBe(2); // 3 units − 1 city garrison
    expect(civ.resources.gold).toBe(0); // debt forgiven, treasury reset
    expect(engine.units.filter((u: any) => u.civilizationId === 0).length).toBe(1);
  });
});

describe('EconomicManager happiness & disorder', () => {
  it('city is in disorder when crowding (beyond gov tolerance) exceeds happiness', () => {
    const civ = makeCiv(0, { taxRate: 100, scienceRate: 0, luxuryRate: 0 });
    // population 5, despotism tolerance 2 → 3 unhappy; 0% luxury → happiness
    // is only the base contentment (2) → 3 > 2 → disorder.
    const city = makeCity(0, 0, 5);
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const econ = new EconomicManager(engine);

    const happiness = econ.cityHappiness(city, civ);
    expect(happiness.unhappiness).toBe(3);
    expect(happiness.disorder).toBe(true);
  });

  it('small cities within the government tolerance are never in disorder', () => {
    const civ = makeCiv(0, { taxRate: 0, scienceRate: 0, luxuryRate: 100 });
    const city = makeCity(0, 0, 2); // pop 2 ≤ despotism tolerance 2
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const econ = new EconomicManager(engine);

    const happiness = econ.cityHappiness(city, civ);
    expect(happiness.disorder).toBe(false);
  });

  it('high luxury prevents disorder in a large city', () => {
    const civ = makeCiv(0, { taxRate: 0, scienceRate: 0, luxuryRate: 100 });
    const city = makeCity(0, 10, 3); // luxury 10 >> unhappiness 1
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const econ = new EconomicManager(engine);

    const happiness = econ.cityHappiness(city, civ);
    expect(happiness.disorder).toBe(false);
    expect(happiness.happiness).toBe(12); // 10 luxury + 2 base contentment
    expect(happiness.unhappiness).toBe(1);
  });

  it('applyCityOutputs writes outputs onto a content city', () => {
    const civ = makeCiv(0, { taxRate: 30, scienceRate: 50, luxuryRate: 20 });
    const city = makeCity(0, 10, 2); // pop 2 ≤ tolerance → content
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const econ = new EconomicManager(engine);

    econ.applyCityOutputs(city, civ);
    expect(city.tax).toBe(3);
    expect(city.science).toBe(5);
    expect(city.luxury).toBe(2);
    expect(city.disorder).toBe(false);
  });

  it('applyCityOutputs zeroes treasury/research but keeps luxury for a disordered city', () => {
    const civ = makeCiv(0, { taxRate: 30, scienceRate: 50, luxuryRate: 20 });
    // population 7 > tolerance 2 → 5 unhappy; luxury 2 + base 2 = 4 < 5 → disorder.
    const city = makeCity(0, 10, 7);
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const econ = new EconomicManager(engine);

    econ.applyCityOutputs(city, civ);
    expect(city.disorder).toBe(true);
    expect(city.tax).toBe(0);
    expect(city.science).toBe(0);
    // Luxury is preserved so the city can recover — zeroing it would trap the
    // city in a permanent disorder death spiral (even 100% luxury on a
    // low-commerce map could never calm the citizens).
    expect(city.luxury).toBe(2);
  });
});

describe('EconomicManager research (compounding fix)', () => {
  it('resources.science is the per-turn amount, not cumulative', () => {
    const civ = makeCiv(0, { taxRate: 30, scienceRate: 50, luxuryRate: 20 });
    const city = makeCity(0, 10);
    const engine = makeEngine({ civilizations: [civ], cities: [city] });
    const econ = new EconomicManager(engine);

    econ.processTurn(civ);
    expect(civ.resources.science).toBe(5); // 10 trade * 50% science
    econ.processTurn(civ);
    // Second turn: still 5 (per-turn), NOT 10 (would be cumulative / compounded)
    expect(civ.resources.science).toBe(5);
    expect(civ.resources.trade).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Tile-based commerce
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTileGrid(width = 10, height = 10): any {
  return {
    width,
    height,
    getSquaresInRange(col: number, row: number, range: number) {
      const out: Array<{ col: number; row: number }> = [];
      for (let c = col - range; c <= col + range; c++) {
        for (let r = row - range; r <= row + range; r++) {
          if (c >= 0 && c < width && r >= 0 && r < height) out.push({ col: c, row: r });
        }
      }
      return out;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTile(type: string, overrides: any = {}): any {
  return { type, resource: null, improvement: null, ...overrides };
}

describe('EconomicManager tile-based commerce', () => {
  it('computes tile yields from terrain, resources and improvements', () => {
    const civ = makeCiv(0);
    const engine = makeEngine({ civilizations: [civ], cities: [], units: [] });
    const econ = new EconomicManager(engine);

    // Coast: 2F/0P/1T
    expect(econ.tileYields(makeTile('coast'))).toEqual({ food: 2, production: 0, trade: 1 });
    // Ocean (1F/0P/2T) + fish resource (2F/1T)
    expect(econ.tileYields(makeTile('ocean', { resource: 'fish' }))).toEqual({ food: 3, production: 0, trade: 3 });
    // Plains + road (trade +0.5)
    expect(econ.tileYields(makeTile('plains', { improvement: 'road' }))).toEqual({ food: 1, production: 1, trade: 0.5 });
    // Generic 'bonus' resource adds +1 trade
    expect(econ.tileYields(makeTile('grassland', { resource: 'bonus' }))).toEqual({ food: 2, production: 1, trade: 1 });
  });

  it('works the city-center tile plus the best (pop-1) tiles in radius', () => {
    const civ = makeCiv(0);
    const tiles: Record<string, any> = {};
    // center at (5,5) on coast
    tiles['5,5'] = makeTile('coast');
    // a high-trade ocean tile with fish within radius (total 6 → clearly best)
    tiles['5,6'] = makeTile('ocean', { resource: 'fish' });
    // everything else defaults to grassland
    const grid = makeTileGrid();
    const engine = makeEngine({
      civilizations: [civ],
      cities: [],
      units: [],
      squareGrid: grid,
      getTileAt: (col: number, row: number) => tiles[`${col},${row}`] ?? makeTile('grassland'),
    });
    const econ = new EconomicManager(engine);

    const city = makeCity(0, 0, 2); // pop 2 → center + 1 worked tile
    city.col = 5;
    city.row = 5;
    // center (coast→1T) + fish ocean (3T) = 4 trade
    expect(econ.calculateCityTrade(city)).toBe(4);
  });

  it('recomputeCityYields writes real yields and building bonuses onto the city', () => {
    const civ = makeCiv(0);
    const tiles: Record<string, any> = {};
    tiles['5,5'] = makeTile('coast');
    tiles['5,6'] = makeTile('ocean', { resource: 'fish' }); // clearly best tile
    const engine = makeEngine({
      civilizations: [civ],
      cities: [],
      units: [],
      squareGrid: makeTileGrid(),
      getTileAt: (col: number, row: number) => tiles[`${col},${row}`] ?? makeTile('grassland'),
    });
    const econ = new EconomicManager(engine);

    const city = makeCity(0, 0, 2);
    city.col = 5;
    city.row = 5;
    city.buildings = ['marketplace']; // effects.trade: +1, science: 0
    econ.recomputeCityYields(city);

    // center 1T + fish ocean 3T + marketplace 1T = 5 trade
    expect(city.yields.trade).toBe(5);
    expect(city.yields.food).toBeGreaterThanOrEqual(2);
    expect(city.scienceBonus).toBe(0);
  });

  it('applies building science bonuses to the science output', () => {
    const civ = makeCiv(0, { taxRate: 0, scienceRate: 100, luxuryRate: 0 });
    const engine = makeEngine({ civilizations: [civ], cities: [], units: [] });
    const econ = new EconomicManager(engine);

    // No map → cityCommerce falls back to yields.trade (10) → science 10 + library 1
    const city = makeCity(0, 10, 2);
    city.scienceBonus = 1;
    city.buildings = ['library'];
    const out = econ.cityOutputs(city, civ);
    expect(out.science).toBe(11);
  });

  it('falls back to the stored yield when the map is unavailable', () => {
    const civ = makeCiv(0);
    const engine = makeEngine({ civilizations: [civ], cities: [], units: [] });
    const econ = new EconomicManager(engine);

    const city = makeCity(0, 10, 2);
    expect(econ.calculateCityTrade(city)).toBe(10); // max(10, floor 2)
  });
});
