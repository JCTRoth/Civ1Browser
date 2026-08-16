/**
 * EconomicManager — the Tax/Science/Luxury economic core for Civ1.
 *
 * Splits each city's commerce into gold (tax), research (science) and
 * happiness (luxury) based on the civ's adjustable rates (which always sum to
 * 100%), applies treasury upkeep (units + cities) with deficit disbanding, and
 * computes per-city happiness/disorder.
 *
 * Commerce source: real tile-based yields — each city works the city-center
 * tile (min 2F/1P/1T) plus the best (population−1) tiles within the city
 * radius, with terrain/resource/improvement and building bonuses applied.
 * Corruption is distance-from-capital based via CityUtils.calculateCorruption.
 *
 * Constructed with a reference to the GameEngine (same pattern as TurnManager),
 * so it can read `gameEngine.civilizations/cities/units` and the map.
 */

import { BUILDING_PROPERTIES } from '../../data/BuildingConstants';
import { getGovernment } from '../../data/GovernmentData';
import { CityUtils } from '../../utils/CityUtils';
import { UNIT_PROPS } from '../../utils/Constants';
import { TERRAIN_PROPERTIES, SPECIAL_RESOURCES } from '../../data/TerrainConstants';
import { IMPROVEMENT_PROPERTIES } from '../../data/TileImprovementConstants';
import type { City, Civilization, GameEngine, Unit } from '../../../types/game';

/** Minimal shape of a map tile as read by the economy (terrain + resource + improvement). */
interface EconomyTile {
  type?: string;
  terrain?: string;
  resource?: string | null;
  improvement?: string | null;
}

export interface CityEconomicOutputs {
  commerce: number; // trade after corruption & government penalty
  corruption: number;
  tax: number;
  science: number;
  luxury: number;
}

export interface CityHappinessResult {
  happiness: number;
  unhappiness: number;
  disorder: boolean;
}

export interface ProcessTurnResult {
  tax: number;
  science: number;
  luxury: number;
  commerce: number;
  upkeep: number;
  deficit: number;
  disbanded: number;
}

export const UNIT_MAINTENANCE = 1;
export const CITY_MAINTENANCE = 1;
/**
 * City-center minimum commerce per city. The engine's static yields hardcode
 * food=2/production=1 and trade=0; giving every city a floor of 2 trade keeps
 * the economy viable (and preserves the classic 50/50 gold/science split)
 * until real tile-based commerce lands.
 */
export const CITY_CENTER_COMMERCE = 2;
/**
 * Base contentment granted to every city. In a low-commerce economy (static
 * yields) luxury income is tiny, so without a base every city above the
 * government tolerance would be in permanent disorder and the whole economy
 * would collapse. With a base of 2, small/medium cities are content and only
 * genuinely large cities need luxury/buildings.
 */
export const BASE_CONTENTMENT = 2;
/**
 * Extra unhappiness a freshly captured city suffers (Civ1: resentful captured
 * citizens). The penalty decays via `city.capturedTurns` and pushes the city
 * into disorder until the new owner garrisons/manages it.
 */
export const CAPTURED_CITY_UNHAPPY = 3;
/** Manhattan distance of the tiles a city can work (Civ1: radius 2). */
export const CITY_RADIUS = 2;
/** Minimum yields of the city-center tile (Civ1 rule). */
export const CITY_CENTER_MIN = { food: 2, production: 1, trade: 1 };
/** Tax rate the AI drifts back down to when its treasury is healthy. */
export const AI_BALANCED_TAX = 40;
/**
 * Minimum science rate the AI keeps whenever it can afford to (unless it is
 * genuinely bankrupt) so AI-vs-AI games don't lock into 0% science forever.
 */
export const AI_SCIENCE_FLOOR = 20;
/** Absolute floor the AI never drops tax below while commerce exists. */
export const AI_MIN_TAX = 10;

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export class EconomicManager {
  private gameEngine: GameEngine;

  constructor(gameEngine: GameEngine) {
    this.gameEngine = gameEngine;
  }

  // ------------------------------------------------------------------
  // Rates
  // ------------------------------------------------------------------

  /**
   * Set a civ's Tax/Science/Luxury rates. Clamps to 0..100, forces the sum to
   * exactly 100 (proportional redistribution), and applies the government's
   * max tax cap / anarchy rule.
   */
  setRates(civId: number, tax: number, science: number, luxury: number): void {
    const civ = this.gameEngine?.civilizations?.[civId];
    if (!civ) return;

    let t = clamp(Math.round(tax), 0, 100);
    let s = clamp(Math.round(science), 0, 100);
    let l = clamp(Math.round(luxury), 0, 100);

    // Normalise so t + s + l === 100 (proportional redistribution).
    const sum = t + s + l;
    if (sum > 0 && sum !== 100) {
      const scale = 100 / sum;
      t = Math.round(t * scale);
      s = Math.round(s * scale);
      l = 100 - t - s; // absorb rounding drift
      if (l < 0) {
        l = 0;
        s = 100 - t; // if still over, drop science instead
        if (s < 0) {
          s = 0;
          t = 100;
        }
      }
    } else if (sum === 0) {
      t = s = l = 0;
    }

    // Government modifiers.
    const gov = getGovernment(civ.government);
    if (gov.forcesZeroRates) {
      t = 0;
      s = 0;
      l = 0;
    } else if (t > gov.maxTaxRate) {
      const excess = t - gov.maxTaxRate;
      t = gov.maxTaxRate;
      // Redistribute the excess proportionally over science & luxury.
      if (s + l > 0) {
        const ratio = s / (s + l);
        s = clamp(s + Math.round(excess * ratio), 0, 100 - t);
        l = 100 - t - s;
      } else {
        l = 100 - t;
      }
    }

    civ.taxRate = t;
    civ.scienceRate = s;
    civ.luxuryRate = l;
  }

  getRates(civId: number): { tax: number; science: number; luxury: number } {
    const civ = this.gameEngine?.civilizations?.[civId];
    return {
      tax: civ?.taxRate ?? 50,
      science: civ?.scienceRate ?? 50,
      luxury: civ?.luxuryRate ?? 0,
    };
  }

  /** Switch a civ's government and re-apply rate caps/anarchy rules. */
  setGovernment(civId: number, government: string): void {
    const civ = this.gameEngine?.civilizations?.[civId];
    if (!civ) return;
    civ.government = government;
    const rates = this.getRates(civId);
    this.setRates(civId, rates.tax, rates.science, rates.luxury);
  }

  // ------------------------------------------------------------------
  // Per-city commerce split
  // ------------------------------------------------------------------

  /**
   * A city's commerce: real tile-based trade (after recompute) with the
   * city-center floor as a safety net.
   */
  cityCommerce(city: City): number {
    return Math.max(city?.yields?.trade ?? 0, CITY_CENTER_COMMERCE);
  }

  /**
   * Split one city's commerce into tax/science/luxury using the civ's rates,
   * applying the government commerce penalty and distance-from-capital
   * corruption first. Direct science bonuses (e.g. library `effects.science`)
   * are added on top of the rate-based science share.
   */
  cityOutputs(city: City, civ: Civilization): CityEconomicOutputs {
    const commerce = this.cityCommerce(city);
    const gov = getGovernment(civ?.government);
    const effective = commerce * (1 - gov.commercePenalty);
    const corruption = CityUtils.calculateCorruption(city, civ, effective);
    const afterCorruption = Math.max(0, Math.floor(effective - corruption));
    const rates = this.getRates(civ?.id);
    const scienceBonus = city?.scienceBonus ?? 0;
    return {
      commerce: afterCorruption,
      corruption,
      tax: Math.floor(afterCorruption * (rates.tax / 100)),
      // Round (not floor) the science share so the Science Rate slider visibly
      // affects research even for tiny economies — flooring made 1–2 commerce
      // cities produce the same 0–1 science across most slider positions.
      science: Math.round(afterCorruption * (rates.science / 100)) + scienceBonus,
      luxury: Math.floor(afterCorruption * (rates.luxury / 100)),
    };
  }

  /**
   * A civ's maximum per-turn tax income — every city's post-corruption
   * commerce at 100% tax. Used by the AI to decide how many units it can
   * actually afford to maintain (upkeep = max(units, cityCount)).
   */
  maxTaxIncome(civ: Civilization): number {
    const civId = civ?.id;
    if (civId == null) return 0;
    const cities = (this.gameEngine?.cities ?? []).filter((c: City) => c.civilizationId === civId);
    return cities.reduce((total: number, city: City) => {
      const commerce = this.cityCommerce(city);
      const gov = getGovernment(civ.government);
      const effective = commerce * (1 - gov.commercePenalty);
      const corruption = CityUtils.calculateCorruption(city, civ, effective);
      return total + Math.max(0, Math.floor(effective - corruption));
    }, 0);
  }

  // ------------------------------------------------------------------
  // Real tile-based yields
  // ------------------------------------------------------------------

  private getTile(col: number, row: number): EconomyTile | null {
    try {
      return this.gameEngine?.getTileAt?.(col, row) ?? null;
    } catch {
      return null;
    }
  }

  /** Food/production/trade of a single map tile (terrain + resource + improvement). */
  tileYields(tile: EconomyTile | null | undefined): { food: number; production: number; trade: number } {
    if (!tile) return { food: 0, production: 0, trade: 0 };
    const terrainType = tile.type ?? tile.terrain;
    const base = TERRAIN_PROPERTIES[terrainType];
    let food = base?.food ?? 0;
    let production = base?.production ?? 0;
    let trade = base?.trade ?? 0;

    const resName = tile.resource;
    if (resName) {
      const special = SPECIAL_RESOURCES.find(
        (r) => r.name.toLowerCase() === String(resName).toLowerCase(),
      );
      if (special) {
        food += special.food ?? 0;
        production += special.production ?? 0;
        trade += special.trade ?? 0;
      } else if (String(resName).toLowerCase() === 'bonus') {
        trade += 1;
      }
    }

    const imp = tile.improvement ? IMPROVEMENT_PROPERTIES[tile.improvement] : null;
    if (imp?.effects) {
      food += imp.effects.food ?? 0;
      production += imp.effects.production ?? 0;
      trade += imp.effects.trade ?? 0;
    }

    return { food, production, trade };
  }

  /**
   * The tiles a city works: the city-center tile (min 2F/1P/1T) plus the best
   * (population − 1) tiles within the city radius, ranked by total yield.
   * Returns null when the map isn't available (e.g. unit tests).
   */
  private cityWorkedTiles(city: City): Array<{ yields: { food: number; production: number; trade: number } }> | null {
    if (!city || typeof this.gameEngine?.getTileAt !== 'function' || !this.gameEngine?.squareGrid) {
      return null;
    }
    const centerTile = this.getTile(city.col, city.row);
    if (!centerTile) return null;

    const center = this.tileYields(centerTile);
    const centerYields = {
      food: Math.max(CITY_CENTER_MIN.food, center.food),
      production: Math.max(CITY_CENTER_MIN.production, center.production),
      trade: Math.max(CITY_CENTER_MIN.trade, center.trade),
    };

    const grid = this.gameEngine.squareGrid;
    const candidates: Array<{ yields: { food: number; production: number; trade: number } }> = [];
    const range = typeof grid.getSquaresInRange === 'function'
      ? grid.getSquaresInRange(city.col, city.row, CITY_RADIUS)
      : [];
    for (const sq of range) {
      if (sq.col === city.col && sq.row === city.row) continue;
      const tile = this.getTile(sq.col, sq.row);
      if (!tile) continue;
      candidates.push({ yields: this.tileYields(tile) });
    }
    const total = (y: { food: number; production: number; trade: number }): number =>
      y.food + y.production + y.trade;
    candidates.sort((a, b) => total(b.yields) - total(a.yields));

    const pop = Math.max(1, city.population ?? 1);
    return [{ yields: centerYields }, ...candidates.slice(0, pop - 1)];
  }

  private buildingBonuses(city: City): { trade: number; science: number } {
    const buildings = city?.buildings ?? [];
    let trade = 0;
    let science = 0;
    for (const b of buildings) {
      const id = typeof b === 'string' ? b : (b as { id?: string; type?: string })?.id
        ?? (b as { type?: string })?.type
        ?? '';
      const effects = BUILDING_PROPERTIES[id]?.effects;
      if (effects) {
        trade += effects.trade ?? 0;
        science += effects.science ?? 0;
      }
    }
    return { trade, science };
  }

  /**
   * Pure: a city's real per-turn trade from its worked tiles + building bonuses.
   * Falls back to the stored yield (floor) when the map isn't available.
   */
  calculateCityTrade(city: City): number {
    const worked = this.cityWorkedTiles(city);
    if (!worked) {
      return Math.max(city?.yields?.trade ?? 0, CITY_CENTER_COMMERCE);
    }
    const { trade } = this.computeYieldsFromWorked(city, worked);
    return Math.max(trade, CITY_CENTER_COMMERCE);
  }

  /** Sum yields of the worked tiles plus building trade bonuses. */
  private computeYieldsFromWorked(
    city: City,
    worked: Array<{ yields: { food: number; production: number; trade: number } }>,
  ): { food: number; production: number; trade: number } {
    let food = 0;
    let production = 0;
    let trade = 0;
    for (const t of worked) {
      food += t.yields.food;
      production += t.yields.production;
      trade += t.yields.trade;
    }
    trade += this.buildingBonuses(city).trade;
    return { food, production, trade };
  }

  /**
   * Recompute a city's yields from its worked tiles and write them onto the
   * city (food/production feed the turn loop; trade feeds the economy split).
   * No-op when the map isn't available (keeps existing yields).
   */
  recomputeCityYields(city: City): void {
    const worked = this.cityWorkedTiles(city);
    if (!worked) return;
    const { food, production, trade } = this.computeYieldsFromWorked(city, worked);
    city.yields = {
      food,
      production,
      trade: Math.max(trade, CITY_CENTER_COMMERCE),
    };
    city.scienceBonus = this.buildingBonuses(city).science;
  }

  /** Happiness for one city (base + luxury + buildings + government bonus). */
  cityHappiness(city: City, civ: Civilization): CityHappinessResult {
    const out = this.cityOutputs(city, civ);
    const gov = getGovernment(civ?.government);
    // Civ1 crowding rule: citizens beyond the government's tolerance are
    // unhappy; luxury / buildings / government bonuses plus a base contentment
    // add happiness (the base keeps small/medium cities content in this
    // low-commerce economy). Freshly captured cities also suffer a temporary
    // unrest penalty while `capturedTurns` is active.
    const population = city?.population ?? 1;
    const capturedUnrest = city?.capturedTurns && city.capturedTurns > 0
      ? CAPTURED_CITY_UNHAPPY
      : 0;
    const unhappiness = Math.max(0, population - gov.tolerance) + capturedUnrest;
    const happiness = out.luxury + this.buildingHappiness(city) + gov.happinessBonus + BASE_CONTENTMENT;
    return { happiness, unhappiness, disorder: unhappiness > happiness };
  }

  /**
   * Write per-city outputs + happiness back onto the city object. Returns the
   * combined outputs/happiness so callers can react without recomputing.
   *
   * When a city is in disorder its tax/science are lost to unrest (nothing
   * reaches the treasury or the research pool), but LUXURY commerce is kept —
   * otherwise the disorder self-reinforces into a permanent death spiral: the
   * next turn would have even less luxury to calm the citizens, and a large
   * city could never recover even at 100% luxury on a low-commerce map.
   */
  applyCityOutputs(city: City, civ: Civilization): CityEconomicOutputs & CityHappinessResult {
    const out = this.cityOutputs(city, civ);
    const happiness = this.cityHappiness(city, civ);
    const effective = happiness.disorder
      ? { ...out, tax: 0, science: 0, commerce: 0 }
      : out;
    city.tax = effective.tax;
    city.science = effective.science;
    city.luxury = effective.luxury;
    city.happiness = happiness.happiness;
    city.unhappiness = happiness.unhappiness;
    city.disorder = happiness.disorder;
    return { ...effective, ...happiness };
  }

  /** Sum of `effects.happiness` for all buildings in a city. */
  private buildingHappiness(city: City): number {
    const buildings = city?.buildings ?? [];
    return buildings.reduce((total: number, b: unknown) => {
      const id = typeof b === 'string' ? b : (b as { id?: string; type?: string })?.id
        ?? (b as { type?: string })?.type
        ?? '';
      return total + (BUILDING_PROPERTIES[id]?.effects?.happiness ?? 0);
    }, 0);
  }

  // ------------------------------------------------------------------
  // Civ-level totals
  // ------------------------------------------------------------------

  civScience(civId: number): number {
    return this.sumCityOutput(civId, 'science');
  }

  civGold(civId: number): number {
    return this.sumCityOutput(civId, 'tax');
  }

  civLuxury(civId: number): number {
    return this.sumCityOutput(civId, 'luxury');
  }

  civCommerce(civId: number): number {
    const civ = this.gameEngine?.civilizations?.[civId];
    if (!civ) return 0;
    const cities = this.gameEngine?.cities?.filter((c: City) => c.civilizationId === civId) ?? [];
    return cities.reduce((total: number, city: City) => total + this.cityOutputs(city, civ).commerce, 0);
  }

  private sumCityOutput(civId: number, key: 'tax' | 'science' | 'luxury'): number {
    const civ = this.gameEngine?.civilizations?.[civId];
    if (!civ) return 0;
    const cities = this.gameEngine?.cities?.filter((c: City) => c.civilizationId === civId) ?? [];
    return cities.reduce((total: number, city: City) => total + this.cityOutputs(city, civ)[key], 0);
  }

  // ------------------------------------------------------------------
  // Upkeep
  // ------------------------------------------------------------------

  unitUpkeep(civId: number): number {
    const units = this.gameEngine?.units?.filter((u: Unit) => u.civilizationId === civId) ?? [];
    const cityCount = (this.gameEngine?.cities ?? []).filter((c: City) => c.civilizationId === civId).length;
    // Free unit support: each city supports one unit free; extra units cost
    // 1 gold/turn each. Keeps a small standing army sustainable while still
    // punishing over-expansion (a low-commerce economy can't afford a huge one).
    const totalMaintenance = units.reduce((total: number, u: Unit) => total + (u.maintenance ?? UNIT_MAINTENANCE), 0);
    const freeBudget = cityCount * UNIT_MAINTENANCE;
    return Math.max(0, totalMaintenance - freeBudget);
  }

  cityUpkeep(civId: number): number {
    const cities = this.gameEngine?.cities?.filter((c: City) => c.civilizationId === civId) ?? [];
    return cities.length * CITY_MAINTENANCE;
  }

  totalUpkeep(civId: number): number {
    return this.unitUpkeep(civId) + this.cityUpkeep(civId);
  }

  /**
   * Disband a civ's most expensive units until the treasury is non-negative.
   * Sorted by maintenance, then by shield cost (descending) so cheap units
   * (scouts, warriors) survive a bankruptcy while expensive ones go first.
   * Exploration units (scouts) are kept absolutely last — they're the civ's
   * eyes on the map and nearly free to run, so they're never the first to go.
   */
  private disbandUnitsToCoverDeficit(civId: number, deficit: number): number {
    const units = (this.gameEngine?.units ?? []).filter((u: Unit) => u.civilizationId === civId);
    const costOf = (u: Unit): number => UNIT_PROPS[u?.type]?.cost ?? 0;
    const isScout = (u: Unit): number => (u?.type === 'scout' ? 1 : 0);
    units.sort((a: Unit, b: Unit) =>
      isScout(a) - isScout(b) // scouts kept last
      || (b.maintenance ?? UNIT_MAINTENANCE) - (a.maintenance ?? UNIT_MAINTENANCE)
      || costOf(b) - costOf(a),
    );
    let remaining = deficit;
    let disbanded = 0;
    for (const unit of units) {
      if (remaining <= 0) break;
      remaining -= unit.maintenance ?? UNIT_MAINTENANCE;
      disbanded++;
      this.gameEngine.units = this.gameEngine.units.filter((u: Unit) => u.id !== unit.id);
      if (typeof this.gameEngine.onStateChange === 'function') {
        this.gameEngine.onStateChange('UNIT_DISBANDED', { unit, reason: 'upkeep_deficit' });
      }
    }
    return disbanded;
  }

  // ------------------------------------------------------------------
  // Turn orchestration
  // ------------------------------------------------------------------

  /**
   * Process a civ's economy for one turn:
   *  - compute per-city outputs & happiness (via applyCityOutputs)
   *  - reset per-turn resource accumulators (fixes the research compounding bug)
   *  - add tax income to the treasury, subtract upkeep, disband on deficit
   *
   * Returns totals for logging / UI.
   */
  processTurn(civ: Civilization): ProcessTurnResult {
    const civId = civ?.id;
    if (!civ || civId == null) {
      return { tax: 0, science: 0, luxury: 0, commerce: 0, upkeep: 0, deficit: 0, disbanded: 0 };
    }
    const cities = (this.gameEngine?.cities ?? []).filter((c: City) => c.civilizationId === civId);

    // AI safeguard: AI civs don't manage rates themselves (out of scope this
    // pass), so auto-raise tax to cover upkeep before it starves/disbands.
    if (civ.isHuman !== true) {
      this.raiseTaxForAI(civ, cities);
    }

    let taxTotal = 0;
    let scienceTotal = 0;
    let luxuryTotal = 0;
    let commerceTotal = 0;
    for (const city of cities) {
      // Recompute the city's real tile-based yields before splitting commerce.
      this.recomputeCityYields(city);
      const out = this.applyCityOutputs(city, civ);
      taxTotal += out.tax;
      scienceTotal += out.science;
      luxuryTotal += out.luxury;
      commerceTotal += out.commerce;
    }

    // Per-turn income (NOT cumulative) — fixes the compounding research bug.
    civ.resources.trade = commerceTotal;
    civ.resources.science = scienceTotal;
    civ.resources.production = 0;
    civ.resources.food = 0;

    // Treasury: tax income minus upkeep. Ordinary deficits are allowed to go
    // negative (the AI auto-tax / player rate adjustment recovers them);
    // only a catastrophic deficit (can't pay ~3 turns of upkeep) disbands
    // units — most expensive first — and the debt is then forgiven so the
    // civ gets a fresh start instead of a permanent death spiral.
    civ.resources.gold = (civ.resources.gold ?? 0) + taxTotal;
    const upkeep = this.totalUpkeep(civId);
    civ.resources.gold -= upkeep;
    let deficit = 0;
    let disbanded = 0;
    if (civ.resources.gold < -upkeep * 3) {
      deficit = -civ.resources.gold;
      // Disband just enough units (expensive first) to bring upkeep ≤ income,
      // but never below one garrison unit per city — a civ that loses every
      // unit to bankruptcy is defenceless and can never recover.
      const cityCount = cities.length;
      const maxDisbandable = (): number => {
        const totalUnits = (this.gameEngine?.units ?? []).filter(
          (u: Unit) => u.civilizationId === civId,
        ).length;
        return Math.max(0, totalUnits - cityCount);
      };
      let unitsToRemove = Math.min(
        maxDisbandable(),
        Math.max(0, this.totalUpkeep(civId) - taxTotal),
      );
      while (unitsToRemove > 0) {
        const removed = this.disbandUnitsToCoverDeficit(civId, unitsToRemove);
        if (removed === 0) break;
        disbanded += removed;
        unitsToRemove = Math.min(
          maxDisbandable(),
          Math.max(0, this.totalUpkeep(civId) - taxTotal),
        );
      }
      // Forgive the accumulated deficit so the civ recovers.
      civ.resources.gold = 0;
    }

    return {
      tax: taxTotal,
      science: scienceTotal,
      luxury: luxuryTotal,
      commerce: commerceTotal,
      upkeep,
      deficit,
      disbanded,
    };
  }

  /**
   * The luxury rate (0..100) needed to keep every city out of disorder:
   * unhappiness beyond non-luxury happiness must be covered by luxury, and a
   * single luxury point costs the lowest-commercing city a full percentage of
   * its commerce. Returns 0 when all cities are content.
   */
  private luxuryNeedPct(civ: Civilization, cities: City[]): number {
    const gov = getGovernment(civ?.government);
    let maxNeed = 0;
    let minAfterCommerce = Infinity;
    for (const city of cities) {
      const population = city?.population ?? 1;
      const unhappiness = Math.max(0, population - gov.tolerance);
      const nonLuxHappiness =
        this.buildingHappiness(city) + (gov.happinessBonus ?? 0) + BASE_CONTENTMENT;
      maxNeed = Math.max(maxNeed, Math.max(0, unhappiness - nonLuxHappiness));
      const commerce = this.cityCommerce(city);
      const effective = commerce * (1 - (gov.commercePenalty ?? 0));
      const after = Math.max(
        0,
        Math.floor(effective - CityUtils.calculateCorruption(city, civ, effective)),
      );
      if (after > 0) minAfterCommerce = Math.min(minAfterCommerce, after);
    }
    if (maxNeed <= 0 || !Number.isFinite(minAfterCommerce)) return 0;
    return Math.min(100, Math.ceil((maxNeed * 100) / minAfterCommerce));
  }

  /**
   * The number of units a civ can sustain without a permanent upkeep deficit:
   * upkeep = max(units, cityCount), paid from the commerce left after luxury.
   * Used by AutoProduction to cap the AI army before it churns (produce →
   * disband) and by the AI rate logic.
   */
  sustainableUnits(civ: Civilization): number {
    const civId = civ?.id;
    if (civId == null) return 0;
    const cities = (this.gameEngine?.cities ?? []).filter((c: City) => c.civilizationId === civId);
    const cityCount = cities.length;
    const luxuryPct = this.luxuryNeedPct(civ, cities);
    const maxIncome = this.maxTaxIncome(civ);
    const affordable = Math.floor(maxIncome * (1 - luxuryPct / 100));
    return Math.max(cityCount, affordable);
  }

  /**
   * AI dynamic-rate fallback (spec: "allow AI to auto-adjust rates based on
   * gold reserve"). Priorities:
   *  1. Luxury: keep cities out of disorder (disorder zeroes their commerce).
   *  2. Tax: cover upkeep with the treasury as a cushion.
   *  3. Science: keep a floor so the AI keeps researching when it can.
   *
   * The old policy oscillated between 100% tax (→ disorder → zero income) and
   * 100% luxury (→ bankruptcy → unit disbanding) on consecutive turns because
   * it reacted to each turn's snapshot with extreme swings and no hysteresis.
   * This version moves rates gradually (≤10 pts/turn) toward a stable target,
   * never zeroes luxury, and only sacrifices science when genuinely bankrupt.
   */
  private raiseTaxForAI(civ: Civilization, cities: City[]): void {
    const gov = getGovernment(civ?.government);
    const rates = this.getRates(civ.id);
    const gold = civ.resources?.gold ?? 0;
    const upkeep = this.totalUpkeep(civ.id);
    const commerce = cities.reduce((t: number, c: City) => t + this.cityCommerce(c), 0);
    if (commerce <= 0) return;

    // ── Luxury needed to prevent disorder (the most valuable use of
    //    commerce — a disorder city contributes nothing). Never spend more on
    //    luxury than leaves room for the tax + science floors. ──
    const luxuryNeed = this.luxuryNeedPct(civ, cities);
    const luxury = Math.min(luxuryNeed, 100 - AI_MIN_TAX - AI_SCIENCE_FLOOR);

    // ── Tax target: cover this turn's upkeep (treasury cushions it). While
    //    the treasury is non-negative keep the science floor; in a genuine
    //    deficit let tax take science's share (luxury still wins). ──
    const taxNeed = Math.ceil((Math.max(0, upkeep - Math.max(0, gold)) / commerce) * 100);
    const scienceAllowance = gold < 0 ? 0 : AI_SCIENCE_FLOOR;
    const targetTax = Math.max(
      AI_MIN_TAX,
      Math.min(gov.maxTaxRate, 100 - luxury - scienceAllowance, taxNeed),
    );

    // ── Move gradually toward the target (never jump 0↔100 between turns,
    //    which is what made the old policy oscillate). ──
    const MAX_DELTA = 10;
    const newTax = targetTax >= rates.tax
      ? Math.min(targetTax, rates.tax + MAX_DELTA)
      : Math.max(targetTax, rates.tax - MAX_DELTA);

    // ── Fill the luxury need first, science gets the rest. If that starves
    //    science below its floor while luxury sits above its need, trim the
    //    surplus luxury back into science. ──
    let newLuxury = Math.min(luxury, 100 - newTax);
    let newScience = 100 - newTax - newLuxury;
    if (newScience < AI_SCIENCE_FLOOR && newLuxury > luxuryNeed) {
      const trim = Math.min(newLuxury - luxuryNeed, AI_SCIENCE_FLOOR - newScience);
      newLuxury -= trim;
      newScience += trim;
    }

    civ.taxRate = Math.max(0, Math.min(gov.maxTaxRate, Math.round(newTax)));
    civ.scienceRate = Math.max(0, Math.round(newScience));
    civ.luxuryRate = Math.max(0, Math.round(newLuxury));
  }
}
