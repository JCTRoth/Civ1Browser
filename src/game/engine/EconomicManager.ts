/**
 * EconomicManager — the Tax/Science/Luxury economic core for Civ1.
 *
 * Splits each city's commerce into gold (tax), research (science) and
 * happiness (luxury) based on the civ's adjustable rates (which always sum to
 * 100%), applies treasury upkeep (units + cities) with deficit disbanding, and
 * computes per-city happiness/disorder.
 *
 * Commerce source: the existing `city.yields.trade` figure (no tile recompute).
 * Corruption is distance-from-capital based via CityUtils.calculateCorruption.
 *
 * Constructed with a reference to the GameEngine (same pattern as TurnManager),
 * so it can read `gameEngine.civilizations/cities/units`.
 */

import { BUILDING_PROPERTIES } from '../../data/BuildingConstants';
import { getGovernment } from '../../data/GovernmentData';
import { CityUtils } from '../../utils/CityUtils';
import { UNIT_PROPS } from '../../utils/Constants';

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

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export class EconomicManager {
  private gameEngine: any;

  constructor(gameEngine: any) {
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

  /** A city's raw commerce — city-center floor, then the existing `yields.trade`. */
  cityCommerce(city: any): number {
    return Math.max(city?.yields?.trade ?? 0, CITY_CENTER_COMMERCE);
  }

  /**
   * Split one city's commerce into tax/science/luxury using the civ's rates,
   * applying the government commerce penalty and distance-from-capital
   * corruption first.
   */
  cityOutputs(city: any, civ: any): CityEconomicOutputs {
    const commerce = this.cityCommerce(city);
    const gov = getGovernment(civ?.government);
    const effective = commerce * (1 - gov.commercePenalty);
    const corruption = CityUtils.calculateCorruption(city, civ, effective);
    const afterCorruption = Math.max(0, Math.floor(effective - corruption));
    const rates = this.getRates(civ?.id);
    return {
      commerce: afterCorruption,
      corruption,
      tax: Math.floor(afterCorruption * (rates.tax / 100)),
      science: Math.floor(afterCorruption * (rates.science / 100)),
      luxury: Math.floor(afterCorruption * (rates.luxury / 100)),
    };
  }

  /** Happiness for one city (base + luxury + buildings + government bonus). */
  cityHappiness(city: any, civ: any): CityHappinessResult {
    const out = this.cityOutputs(city, civ);
    const gov = getGovernment(civ?.government);
    // Civ1 crowding rule: citizens beyond the government's tolerance are
    // unhappy; luxury / buildings / government bonuses plus a base contentment
    // add happiness (the base keeps small/medium cities content in this
    // low-commerce economy).
    const population = city?.population ?? 1;
    const unhappiness = Math.max(0, population - gov.tolerance);
    const happiness = out.luxury + this.buildingHappiness(city) + gov.happinessBonus + BASE_CONTENTMENT;
    return { happiness, unhappiness, disorder: unhappiness > happiness };
  }

  /**
   * Write per-city outputs + happiness back onto the city object. Returns the
   * combined outputs/happiness so callers can react without recomputing.
   *
   * When a city is in disorder its commerce is lost to unrest (tax/science/
   * luxury are zeroed) — the disorder self-reinforces until the player raises
   * luxury or builds happiness buildings.
   */
  applyCityOutputs(city: any, civ: any): CityEconomicOutputs & CityHappinessResult {
    const out = this.cityOutputs(city, civ);
    const happiness = this.cityHappiness(city, civ);
    const effective = happiness.disorder
      ? { ...out, tax: 0, science: 0, luxury: 0, commerce: 0 }
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
  private buildingHappiness(city: any): number {
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
    const cities = this.gameEngine?.cities?.filter((c: any) => c.civilizationId === civId) ?? [];
    return cities.reduce((total: number, city: any) => total + this.cityOutputs(city, civ).commerce, 0);
  }

  private sumCityOutput(civId: number, key: 'tax' | 'science' | 'luxury'): number {
    const civ = this.gameEngine?.civilizations?.[civId];
    const cities = this.gameEngine?.cities?.filter((c: any) => c.civilizationId === civId) ?? [];
    return cities.reduce((total: number, city: any) => total + this.cityOutputs(city, civ)[key], 0);
  }

  // ------------------------------------------------------------------
  // Upkeep
  // ------------------------------------------------------------------

  unitUpkeep(civId: number): number {
    const units = this.gameEngine?.units?.filter((u: any) => u.civilizationId === civId) ?? [];
    const cityCount = (this.gameEngine?.cities ?? []).filter((c: any) => c.civilizationId === civId).length;
    // Free unit support: each city supports one unit free; extra units cost
    // 1 gold/turn each. Keeps a small standing army sustainable while still
    // punishing over-expansion (a low-commerce economy can't afford a huge one).
    const totalMaintenance = units.reduce((total: number, u: any) => total + (u.maintenance ?? UNIT_MAINTENANCE), 0);
    const freeBudget = cityCount * UNIT_MAINTENANCE;
    return Math.max(0, totalMaintenance - freeBudget);
  }

  cityUpkeep(civId: number): number {
    const cities = this.gameEngine?.cities?.filter((c: any) => c.civilizationId === civId) ?? [];
    return cities.length * CITY_MAINTENANCE;
  }

  totalUpkeep(civId: number): number {
    return this.unitUpkeep(civId) + this.cityUpkeep(civId);
  }

  /**
   * Disband a civ's most expensive units until the treasury is non-negative.
   * Sorted by maintenance, then by shield cost (descending) so cheap units
   * (scouts, warriors) survive a bankruptcy while expensive ones go first.
   */
  private disbandUnitsToCoverDeficit(civId: number, deficit: number): number {
    const units = (this.gameEngine?.units ?? []).filter((u: any) => u.civilizationId === civId);
    const costOf = (u: any): number => UNIT_PROPS[u?.type]?.cost ?? 0;
    units.sort((a: any, b: any) =>
      (b.maintenance ?? UNIT_MAINTENANCE) - (a.maintenance ?? UNIT_MAINTENANCE)
      || costOf(b) - costOf(a),
    );
    let remaining = deficit;
    let disbanded = 0;
    for (const unit of units) {
      if (remaining <= 0) break;
      remaining -= unit.maintenance ?? UNIT_MAINTENANCE;
      disbanded++;
      this.gameEngine.units = this.gameEngine.units.filter((u: any) => u.id !== unit.id);
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
  processTurn(civ: any): ProcessTurnResult {
    const civId = civ?.id;
    if (!civ || civId == null) {
      return { tax: 0, science: 0, luxury: 0, commerce: 0, upkeep: 0, deficit: 0, disbanded: 0 };
    }
    const cities = (this.gameEngine?.cities ?? []).filter((c: any) => c.civilizationId === civId);

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
      // Disband just enough units (expensive first) to bring upkeep ≤ income.
      let unitsToRemove = Math.max(0, this.totalUpkeep(civId) - taxTotal);
      while (unitsToRemove > 0) {
        const removed = this.disbandUnitsToCoverDeficit(civId, unitsToRemove);
        if (removed === 0) break;
        disbanded += removed;
        unitsToRemove = Math.max(0, this.totalUpkeep(civId) - taxTotal);
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
   * AI dynamic-rate fallback (spec: "allow AI to auto-adjust rates based on
   * gold reserve"): raise the AI's tax rate just enough that income plus the
   * current treasury covers this turn's upkeep.
   */
  private raiseTaxForAI(civ: any, cities: any[]): void {
    const gov = getGovernment(civ?.government);
    const rates = this.getRates(civ.id);
    const gold = civ.resources?.gold ?? 0;
    const upkeep = this.totalUpkeep(civ.id);
    const currentTax = cities.reduce((t: number, c: any) => t + this.cityOutputs(c, civ).tax, 0);
    if (gold + currentTax >= upkeep) return;

    const commerce = cities.reduce((t: number, c: any) => t + this.cityCommerce(c), 0);
    if (commerce <= 0) return;
    const shortfall = upkeep - gold - currentTax;
    const neededPct = Math.min(gov.maxTaxRate, Math.ceil((shortfall / commerce) * 100));
    if (neededPct <= rates.tax) return;

    // Raise tax, redistribute the remaining 100% proportionally over
    // science/luxury (do NOT re-normalise tax — it must stay at neededPct).
    let t = neededPct;
    let s = rates.science;
    let l = rates.luxury;
    const otherSum = s + l;
    if (t + otherSum > 100 && otherSum > 0) {
      const scale = (100 - t) / otherSum;
      s = Math.round(s * scale);
      l = 100 - t - s;
    }
    civ.taxRate = t;
    civ.scienceRate = s;
    civ.luxuryRate = l;
  }
}
