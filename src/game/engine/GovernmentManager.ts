/**
 * GovernmentManager — revolution (anarchy) switching and capital designation.
 *
 * - `startRevolution(civId, government)`: sets the civ to anarchy for
 *   ANARCHY_TURNS turns (rates forced to 0 by the anarchy government), then
 *   `processTurn` applies the pending government when the countdown finishes.
 * - Capital: the city holding the Palace is the seat of government. The first
 *   city gets a free Palace; building a Palace elsewhere moves the capital;
 *   if the capital is destroyed/captured, `ensureCapital` picks a replacement.
 */

import { getGovernment } from '../../data/GovernmentData';
import type { Civilization, City, Unit } from '../../../types/game';
import GameEngine from './GameEngine';

/** How many turns a revolution (anarchy) lasts before the new government applies. */
export const ANARCHY_TURNS = 3;

export class GovernmentManager {
  private gameEngine: GameEngine;

  constructor(gameEngine: GameEngine) {
    this.gameEngine = gameEngine;
  }

  // ------------------------------------------------------------------
  // Tech-gated government availability
  // ------------------------------------------------------------------

  private hasTech(civ: Civilization, techId: string): boolean {
    const techs = civ?.technologies;
    if (!techs) return false;
    if (techs instanceof Set) return techs.has(techId);
    if (Array.isArray(techs)) return techs.includes(techId);
    return false;
  }

  /**
   * Governments unlocked by the civ's researched technologies.
   * Despotism is always available (the starting government).
   */
  getAvailableGovernments(civ: Civilization): string[] {
    const unlocked: string[] = ['despotism'];
    if (this.hasTech(civ, 'monarchy')) unlocked.push('monarchy');
    if (this.hasTech(civ, 'republic')) unlocked.push('republic');
    if (this.hasTech(civ, 'democracy')) unlocked.push('democracy');
    if (this.hasTech(civ, 'communism')) unlocked.push('communism');
    return unlocked;
  }

  /** Whether a civ is currently in anarchy (revolution in progress). */
  isInRevolution(civ: Civilization): boolean {
    return !!civ && civ.government === 'anarchy' && (civ.revolutionTurns ?? 0) > 0;
  }

  /** The government a civ should adopt next, or null if it has the best one. */
  bestGovernmentForCiv(civ: Civilization): string | null {
    const available = this.getAvailableGovernments(civ);
    if (available.length <= 1) return null;
    const current = civ?.government ?? 'despotism';
    const preference = ['despotism', 'monarchy', 'republic', 'communism', 'democracy'];
    const currentRank = preference.indexOf(current);
    let best = current;
    let bestRank = currentRank;
    for (const gov of available) {
      const rank = preference.indexOf(gov);
      if (rank > bestRank) {
        bestRank = rank;
        best = gov;
      }
    }
    return best === current ? null : best;
  }

  /**
   * Situational score for a government given a civ's current empire. Higher is
   * a better fit. Factors (weighted by empire size / personality):
   *  - corruption saving (more valuable the bigger the empire),
   *  - commerce penalty (Communism -25% hurts a big economy),
   *  - happiness bonus & population tolerance (keep big cities content),
   *  - tax need — a civ that must raise taxes dislikes Democracy's low cap
   *    (and a commerce penalty that cuts gold), and
   *  - settler shield cost of Republic/Democracy for expansionist civs.
   */
  scoreGovernmentForCiv(civ: Civilization, govId: string): number {
    const current = getGovernment(civ.government);
    const candidate = getGovernment(govId);

    const cities = (this.gameEngine.cities ?? []).filter(
      (c: City) => c.civilizationId === civ.id,
    );
    const units = (this.gameEngine.units ?? []).filter(
      (u: Unit) => u.civilizationId === civ.id,
    );
    const numCities = cities.length;
    const totalPop = cities.reduce((sum: number, c: City) => sum + (c.population ?? 1), 0);
    const avgPop = numCities > 0 ? totalPop / numCities : 0;
    const army = units.filter((u: Unit) => (u.attack ?? 0) >= 1).length;

    const p = civ.personality ?? {};
    const science = p.science ?? 0;
    const military = p.military ?? 0;
    const economy = p.economy ?? 0;
    const expansion = p.expansion ?? 0;
    const aggression = p.aggression ?? 0;

    // Corruption saving matters more the bigger the empire.
    const empireScale = 1 + numCities * 0.6 + totalPop * 0.05;
    let score = (current.corruptionRate - candidate.corruptionRate) * empireScale * 18;

    // A commerce penalty hurts in proportion to the economy's size.
    score -= candidate.commercePenalty * (10 + totalPop * 0.6 + economy * 1.2);

    // Happiness bonus keeps a large city network content.
    score += (candidate.happinessBonus - current.happinessBonus) * (5 + numCities * 2);
    // Tolerance lets large populations stay content under the crowding rule.
    score +=
      (candidate.tolerance - current.tolerance) *
      (3 + Math.max(0, avgPop - 2) * 2 + totalPop * 0.04);

    // A civ that must raise taxes (upkeep / at war / militarist-economist)
    // dislikes a low tax cap (Democracy) or a commerce penalty that cuts gold.
    const taxNeed = Math.min(
      10,
      military * 0.5 + economy * 0.5 + aggression * 0.3 + Math.min(army, 10) * 0.3,
    );
    score -= Math.max(0, current.maxTaxRate - candidate.maxTaxRate) * taxNeed * 0.6;

    // Science-focused civs value low corruption and no commerce penalty.
    score += science * 0.35 * (0.4 - candidate.commercePenalty);
    score += science * 0.25 * (current.corruptionRate - candidate.corruptionRate);

    // Republic/Democracy make Settlers cost shields — penalise expansionists.
    const settlerCostGov = govId === 'republic' || govId === 'democracy';
    if (settlerCostGov) score -= Math.max(0, expansion - 3) * 1.2;

    return score;
  }

  /**
   * Pick the best government for a civ BEFORE the AI commits to a revolution.
   * Returns the government to switch to, or null to keep the current one.
   * Unlike `bestGovernmentForCiv` (which always takes the next unlocked tech on
   * a fixed ladder), this weighs the civ's actual situation — empire size,
   * happiness pressure, tax need and personality — and only switches when the
   * best candidate is meaningfully better (anarchy costs ~3 dead turns).
   */
  evaluateGovernmentForCiv(civ: Civilization): string | null {
    if (!civ) return null;
    const available = this.getAvailableGovernments(civ);
    if (available.length <= 1) return null;
    const current = civ.government ?? 'despotism';

    const currentScore = this.scoreGovernmentForCiv(civ, current);
    let bestGov: string | null = null;
    let bestScore = currentScore;
    for (const gov of available) {
      if (gov === current) continue;
      const s = this.scoreGovernmentForCiv(civ, gov);
      if (s > bestScore) {
        bestScore = s;
        bestGov = gov;
      }
    }

    // Don't revolt for a negligible gain (anarchy wastes ~3 turns of output).
    const SWITCH_MARGIN = 5;
    if (bestGov && bestScore - currentScore >= SWITCH_MARGIN) {
      return bestGov;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Revolution
  // ------------------------------------------------------------------

  /**
   * Begin a revolution toward `government`: the civ enters anarchy (all rates
   * forced to 0) for ANARCHY_TURNS turns, after which the new government takes
   * effect. Returns false if already revolting or the government isn't unlocked.
   */
  startRevolution(civId: number, government: string): boolean {
    const civ = this.gameEngine.civilizations?.[civId];
    if (!civ) return false;
    if (this.isInRevolution(civ)) return false;
    if (!this.getAvailableGovernments(civ).includes(government)) return false;

    civ.government = 'anarchy';
    civ.revolutionTurns = ANARCHY_TURNS;
    civ.pendingGovernment = government;
    // Anarchy forces all rates to 0 via the government's forcesZeroRates rule.
    this.gameEngine.economicManager?.setGovernment(civId, 'anarchy');
    this.gameEngine.log?.('government',
      `${civ.name} begins a revolution — anarchy for ${ANARCHY_TURNS} turns, adopting ${government}`,
      { civId, government, turns: ANARCHY_TURNS });
    return true;
  }

  /**
   * Advance a civ's revolution countdown. Called once per civ per turn; when the
   * countdown reaches 0 the pending government is applied and rates re-apply.
   */
  processTurn(civ: Civilization): void {
    if (!civ || (civ.revolutionTurns ?? 0) <= 0) return;
    civ.revolutionTurns! -= 1;
    if (civ.revolutionTurns! <= 0) {
      const gov = civ.pendingGovernment ?? 'despotism';
      civ.revolutionTurns = 0;
      civ.pendingGovernment = undefined;
      this.gameEngine.economicManager?.setGovernment(civ.id, gov);
      this.gameEngine.log?.('government',
        `${civ.name} revolution complete — adopts ${getGovernment(gov).name}`,
        { civId: civ.id, government: gov });
    }
  }

  // ------------------------------------------------------------------
  // Capital (Palace) management
  // ------------------------------------------------------------------

  /** Make `city` the seat of government: set flags, move the Palace, update the civ ref. */
  designateCapital(civId: number, city: City): void {
    const civ = this.gameEngine.civilizations?.[civId];
    if (!civ || !city || city.civilizationId !== civId) return;

    // Demote any other capital of this civ (one Palace per civilization).
    for (const c of this.gameEngine.cities ?? []) {
      if (c.civilizationId === civId && c.isCapital && c.id !== city.id) {
        c.isCapital = false;
        if (Array.isArray(c.buildings)) {
          const idx = c.buildings.indexOf('palace');
          if (idx !== -1) c.buildings.splice(idx, 1);
        }
      }
    }

    city.isCapital = true;
    if (!Array.isArray(city.buildings)) city.buildings = [];
    if (!city.buildings.includes('palace')) city.buildings.push('palace');
    civ.capital = city;
    this.gameEngine.log?.('government',
      `${civ.name} moves its capital to ${city.name}`, { civId, cityId: city.id });
  }

  /**
   * If the civ's capital was destroyed/captured, designate a replacement:
   * a city still holding a Palace, else the civ's first remaining city
   * (which gets a free Palace so the civ always has a capital).
   */
  ensureCapital(civId: number): void {
    const civ = this.gameEngine.civilizations?.[civId];
    if (!civ) return;
    const capital = civ.capital;
    if (capital && (this.gameEngine.cities ?? []).some((c: City) => c.id === capital.id)) return;

    const withPalace = (this.gameEngine.cities ?? []).find(
      (c: City) => c.civilizationId === civId && Array.isArray(c.buildings) && c.buildings.includes('palace'),
    );
    const first = (this.gameEngine.cities ?? []).find((c: City) => c.civilizationId === civId);
    const replacement = withPalace ?? first;
    if (replacement) {
      this.designateCapital(civId, replacement);
      this.gameEngine.log?.('government',
        `${civ.name} establishes a new capital at ${replacement.name}`, { civId, cityId: replacement.id });
    } else {
      civ.capital = null;
    }
  }
}
