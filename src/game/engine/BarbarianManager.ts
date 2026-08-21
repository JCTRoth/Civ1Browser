import type { Unit } from '../../../types/game';
import { UNIT_PROPS } from '@/utils/Constants';
import { BARBARIAN_CIV_ID } from '@/data/VillageConstants';

/**
 * Barbarian AI — a dedicated, aggressive controller for the phantom
 * barbarian civ (id −1). Barbarians are NOT a normal civilization: they have
 * no entry in `civilizations[]` (no diplomacy, no victory, no research), they
 * simply spawn from villages or captured cities and raid the real civs.
 *
 * Behaviour (runs once per round, hooked into the turn cycle):
 *  - Every barbarian unit hunts: it attacks adjacent enemies, assaults
 *    adjacent enemy cities, and otherwise marches toward an enemy city.
 *  - When the horde is large (> 3 units) AND the weakest enemy city's
 *    defense is expected to be weaker than the horde's strength, the AI is
 *    MUCH more aggressive: ALL troops converge on the weakest city.
 *  - Cities the barbarians capture become troop pumps: all buildings are
 *    sold off, the FIRST produced unit is a SCOUT (to find the next target),
 *    and then the city produces raiders every round.
 */
export class BarbarianManager {
  constructor(private readonly gameEngine: any) {}

  /** Called once per round from the turn cycle. */
  processBarbarians(): void {
    const engine = this.gameEngine;
    const units = (engine.units ?? []).filter((u: Unit) => u.civilizationId === BARBARIAN_CIV_ID);
    const barbarianCities = (engine.cities ?? []).filter((c: any) => c.civilizationId === BARBARIAN_CIV_ID);
    if (units.length === 0 && barbarianCities.length === 0) return;

    // Global read of the battlefield.
    const weakest = this.chooseWeakestCity();
    const hordeStrength = units.reduce(
      (sum, u) => sum + Math.max(0, u.attack ?? 0) + (u.defense ?? 0) * 0.5,
      0,
    );
    const muchAggression = units.length > 3 && weakest !== null && hordeStrength > weakest.defense;

    // Move & fight with every unit.
    for (const unit of units) {
      this.activateUnit(unit);
      const target = muchAggression
        ? { col: weakest!.col, row: weakest!.row }          // all troops → weakest city
        : this.nearestEnemyCity(unit) ?? this.nearestEnemyUnit(unit); // else nearest raid
      this.act(unit, target);
    }

    // Captured cities: sell everything, produce a scout first, then raiders.
    this.manageCities(barbarianCities);
  }

  /** Reset a barbarian unit's move budget for this round. */
  private activateUnit(unit: Unit): void {
    const props = UNIT_PROPS[unit.type];
    unit.movesRemaining = props?.movement ?? 1;
    unit.hasMovedThisTurn = false;
    unit.isSkipped = false;
    unit.isFortified = false;
    unit.isSleeping = false;
  }

  /** The weakest enemy city (lowest estimated defense). */
  private chooseWeakestCity(): { col: number; row: number; defense: number } | null {
    const engine = this.gameEngine;
    const cities = (engine.cities ?? []).filter(
      (c: any) => c.civilizationId >= 0 && c.civilizationId !== BARBARIAN_CIV_ID,
    );
    if (cities.length === 0) return null;

    let weakest: { col: number; row: number; defense: number } | null = null;
    for (const city of cities) {
      const defense = this.estimateCityDefense(city);
      if (!weakest || defense < weakest.defense) {
        weakest = { col: city.col, row: city.row, defense };
      }
    }
    return weakest;
  }

  /** Civ1-style city defense: population (×3 with walls) + nearby garrison. */
  private estimateCityDefense(city: any): number {
    const engine = this.gameEngine;
    let defense = Math.max(1, city.population ?? 1);
    const hasWalls =
      (city.buildings?.includes?.('city_walls') ?? false) ||
      (city.buildings?.includes?.('walls') ?? false);
    if (hasWalls) defense *= 3;
    if (engine?.squareGrid?.squareDistance) {
      for (const unit of engine.units ?? []) {
        if (unit.civilizationId !== city.civilizationId || unit.civilizationId === BARBARIAN_CIV_ID) continue;
        const dist = engine.squareGrid.squareDistance(unit.col, unit.row, city.col, city.row);
        if (dist <= 2) {
          defense += Math.max(1, unit.attack || 0) + (unit.defense || 0) * 0.5;
        }
      }
    }
    return defense;
  }

  private nearestEnemyCity(unit: Unit): { col: number; row: number } | null {
    const engine = this.gameEngine;
    let best: { col: number; row: number; dist: number } | null = null;
    for (const city of engine.cities ?? []) {
      if (city.civilizationId < 0 || city.civilizationId === BARBARIAN_CIV_ID) continue;
      const dist = engine.squareGrid?.squareDistance?.(unit.col, unit.row, city.col, city.row) ?? Infinity;
      if (!best || dist < best.dist) best = { col: city.col, row: city.row, dist };
    }
    return best ? { col: best.col, row: best.row } : null;
  }

  private nearestEnemyUnit(unit: Unit): { col: number; row: number } | null {
    const engine = this.gameEngine;
    let best: { col: number; row: number; dist: number } | null = null;
    for (const other of engine.units ?? []) {
      if (other.civilizationId < 0 || other.civilizationId === BARBARIAN_CIV_ID) continue;
      const dist = engine.squareGrid?.squareDistance?.(unit.col, unit.row, other.col, other.row) ?? Infinity;
      if (!best || dist < best.dist) best = { col: other.col, row: other.row, dist };
    }
    return best ? { col: best.col, row: best.row } : null;
  }

  /** One unit's turn: attack adjacent threats, otherwise step toward target. */
  private act(unit: Unit, target: { col: number; row: number } | null): void {
    const engine = this.gameEngine;
    if ((unit.movesRemaining ?? 0) <= 0 || (unit as any).isDefeated) return;
    const neighbors = engine.squareGrid?.getNeighbors?.(unit.col, unit.row) ?? [];

    // 1. Attack an adjacent enemy unit.
    for (const n of neighbors) {
      const enemy = engine.getUnitAt?.(n.col, n.row);
      if (enemy && enemy.civilizationId !== BARBARIAN_CIV_ID) {
        console.log(`[BARB] ${unit.type} attacks enemy ${enemy.type} at (${n.col},${n.row})`);
        engine.combatUnit?.(unit, enemy);
        return; // spent the move either way
      }
    }

    // 2. Assault an adjacent enemy city (moveUnit resolves the capture).
    for (const n of neighbors) {
      const city = engine.getCityAt?.(n.col, n.row);
      if (city && city.civilizationId !== BARBARIAN_CIV_ID) {
        console.log(`[BARB] ${unit.type} assaults city ${city.name} at (${n.col},${n.row})`);
        engine.moveUnit?.(unit.id, n.col, n.row);
        return;
      }
    }

    // 3. Otherwise take one pathfinding step toward the target.
    if (!target) return;
    const path = engine.squareGrid?.findPath?.(
      unit.col,
      unit.row,
      target.col,
      target.row,
      new Set<string>(),
      engine.getPassabilityFilter?.(),
    );
    if (path && path.length > 1) {
      const next = path[1];
      engine.moveUnit?.(unit.id, next.col, next.row);
    }
  }

  /**
   * Captured cities become barbarian troop pumps:
   *  - "sell everything": no buildings survive barbarian occupation.
   *  - the FIRST unit produced after a capture is a SCOUT (finds the next
   *    city), then the city produces raiders every round.
   */
  private manageCities(cities: any[]): void {
    const engine = this.gameEngine;
    for (const city of cities) {
      // Sell everything — raiders, not improvements.
      if (Array.isArray(city.buildings) && city.buildings.length > 0) {
        console.log(`[BARB] Selling ${city.buildings.length} building(s) in ${city.name}`);
        city.buildings = [];
      }

      // Pick what to produce: scout first, then a raider.
      if (!city.currentProduction) {
        city.currentProduction = city.barbarianScoutBuilt === true
          ? this.raiderProduction()
          : this.scoutProduction();
      }

      // Apply the city's shields.
      const gross = Math.max(1, city.yields?.production ?? city.population ?? 1);
      city.productionStored = (city.productionStored ?? 0) + gross;
      city.productionProgress = city.productionStored;

      if (city.productionStored >= (city.currentProduction.cost ?? 10)) {
        const item = city.currentProduction;
        city.productionStored = 0;
        city.productionProgress = 0;
        console.log(`[BARB] ${city.name} produced ${item.itemType}`);
        engine.spawnBarbarianUnit?.(item.itemType, city.col, city.row);
        if (item.itemType === 'scout') {
          city.barbarianScoutBuilt = true;
        }
        city.currentProduction = null; // re-picked next round
      }
    }
  }

  private scoutProduction(): any {
    const props = UNIT_PROPS.scout ?? { cost: 15 };
    return { type: 'unit', itemType: 'scout', name: 'Scout', cost: props.cost ?? 15 };
  }

  /** The barbarian raider: a fast, strong attacker (chariot if present). */
  private raiderProduction(): any {
    const type = UNIT_PROPS.chariot ? 'chariot' : 'legion';
    const props = (UNIT_PROPS as any)[type] ?? { name: type, cost: 40 };
    return { type: 'unit', itemType: type, name: props.name ?? type, cost: props.cost ?? 40 };
  }
}
