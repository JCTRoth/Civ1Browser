/**
 * AutoProduction - Automatically manages production queues for cities
 * Uses tech-gated unit selection and integrates AIBuildingStrategy for
 * intelligent building/wonder production decisions.
 */

import { UNIT_PROPS, BUILDING_PROPS } from '@/utils/Constants';
import { BUILDING_PROPERTIES, WONDER_PROPERTIES } from '@/data/BuildingConstants';
import {
  assessCityThreat,
  calculateDangerThreshold,
  collectCityThreatSamples,
  computeCityGarrisonStrength,
  type CityThreatAssessment
} from './AIStrategy';
import { canBuildUnit, type StrategyProfile, type AIState, createDefaultAIState } from './AITypes';
import { AIBuildingStrategy } from './AIBuildingStrategy';
import type { City } from '../../../types/game';

export class AutoProduction {
  private gameEngine: any;

  constructor(gameEngine: any) {
    this.gameEngine = gameEngine;
  }

  /**
   * Set automatic production for a city based on its needs and current state
   */
  setAutoProduction(cityId: string): boolean {
    try {
      console.log('[AutoProduction] setAutoProduction called for city', cityId);
      
      const city = this.gameEngine.cities.find((c: any) => c.id === cityId);
      if (!city) {
        console.warn('[AutoProduction] City not found:', cityId);
        return false;
      }

      const threatAssessment = this.evaluateCityThreat(city);

      if (city.currentProduction) {
        if (threatAssessment?.needsDefense && !this.isDefensiveProduction(city.currentProduction)) {
          console.log('[AutoProduction] City under threat, overriding existing production');
          this.gameEngine.removeCurrentProduction(city.id);
        } else {
          console.log('[AutoProduction] City already has production:', city.currentProduction);
          return true;
        }
      }

      // Determine what the city should produce based on its state
      const productionItem = this.determineProductionItem(city, threatAssessment);
      
      if (productionItem) {
        console.log('[AutoProduction] Setting production item:', productionItem);
        
        // Use ProductionManager to set production
        if (this.gameEngine.productionManager) {
          const result = this.gameEngine.productionManager.setCityProduction(cityId, productionItem, false);
          return result.success || false;
        }
      }

      return false;
    } catch (e) {
      console.error('[AutoProduction] setAutoProduction error', e);
      return false;
    }
  }

  /**
   * Determine what production item a city should build
   */
  private determineProductionItem(city: any, threatAssessment?: CityThreatAssessment | null): any | null {
    // Priority order:
    // 1. Urgent defender if city has none
    // 2. Emergency reinforcements for threatened cities
    // 3. High-priority building (from AIBuildingStrategy)
    // 4. Offensive campaign reinforcements
    // 5. Standard building or settler
    // 6. Wonder (if safe)
    // 7. Default military unit

    const civ = this.gameEngine.civilizations?.[city.civilizationId];
    const storage = typeof this.gameEngine.getPlayerStorage === 'function'
      ? this.gameEngine.getPlayerStorage(city.civilizationId)
      : undefined;
    const aiState: AIState = storage?.turnData?.aiState ?? createDefaultAIState();
    const strategy: StrategyProfile = aiState.strategyProfile ?? 'balanced_growth';

    // Check for city defenders
    const unitsInCity = this.gameEngine.units.filter(
      (u: any) => u.col === city.col && u.row === city.row && u.civilizationId === city.civilizationId
    );
    
    const hasDefender = unitsInCity.some((u: any) => {
      const unitProps = UNIT_PROPS[u.type];
      return unitProps && unitProps.defense > 0;
    });

    // 1. Build a defender if none exists
    if (!hasDefender || threatAssessment?.needsDefense) {
      console.log('[AutoProduction] City needs defender (threat-triggered:', !!threatAssessment?.needsDefense, ')');
      return this.buildDefenderProduction(city, threatAssessment);
    }

    if (threatAssessment && threatAssessment.netThreat > 0) {
      console.log('[AutoProduction] Elevated threat detected, reinforcing garrison');
      return this.buildDefenderProduction(city, threatAssessment);
    }

    // 3. Evaluate buildings via AIBuildingStrategy
    const gameState = this.buildGameState(city.civilizationId);
    gameState.isUnderThreat = !!threatAssessment?.needsDefense;
    const buildingPlans = civ
      ? AIBuildingStrategy.evaluateBuildings(city, civ, strategy, gameState)
      : [];
    const buildingPlan = buildingPlans.length > 0 ? buildingPlans[0] : null;

    const civCities = this.gameEngine.cities.filter((c: any) => c.civilizationId === city.civilizationId);
    const numMilitary = this.gameEngine.units.filter(
      (u: any) => u.civilizationId === city.civilizationId && this.isOffensiveUnitType(u.type)
    ).length;

    // Check if building is high-priority enough to build over a unit
    if (buildingPlan && AIBuildingStrategy.shouldBuildOverUnit(
      buildingPlan, hasDefender, !!threatAssessment?.needsDefense, numMilitary, civCities.length
    )) {
      const bProps = BUILDING_PROPS[buildingPlan.buildingType] || BUILDING_PROPERTIES[buildingPlan.buildingType];
      if (bProps) {
        console.log(`[AutoProduction] Building strategy chose: ${buildingPlan.buildingType} (priority: ${buildingPlan.priority}, reason: ${buildingPlan.reason})`);
        return {
          type: 'building',
          itemType: buildingPlan.buildingType,
          name: bProps.name,
          cost: bProps.cost
        };
      }
    }

    // 4. Support offensive plan
    if (this.shouldSupportOffensivePlan(city)) {
      console.log('[AutoProduction] Supporting offensive plan with new attacker');
      return this.buildOffensiveProduction(city);
    }

    // 5. Build settlers if civilization has few cities
    if (civCities.length < 4 && city.population >= 2 && strategy !== 'defensive_turtle') {
      const settlerCount = this.gameEngine.units.filter(
        (u: any) => u.civilizationId === city.civilizationId && u.type === 'settler'
      ).length;
      
      if (settlerCount === 0) {
        console.log('[AutoProduction] Civilization needs more cities, building settler');
        return {
          type: 'unit',
          itemType: 'settler',
          name: UNIT_PROPS.settler?.name || 'Settler',
          cost: UNIT_PROPS.settler?.cost || 40
        };
      }
    }

    // 5b. Build the building even if not "high-priority"
    if (buildingPlan) {
      const bProps = BUILDING_PROPS[buildingPlan.buildingType] || BUILDING_PROPERTIES[buildingPlan.buildingType];
      if (bProps) {
        console.log(`[AutoProduction] Building: ${buildingPlan.buildingType} (reason: ${buildingPlan.reason})`);
        return {
          type: 'building',
          itemType: buildingPlan.buildingType,
          name: bProps.name,
          cost: bProps.cost
        };
      }
    }

    // 6. Wonder (only if not threatened and strategy favors it)
    if (!threatAssessment?.needsDefense && civ) {
      const wonderPlans = AIBuildingStrategy.evaluateWonders(city, civ, strategy, gameState);
      const wonderPlan = wonderPlans.length > 0 ? wonderPlans[0] : null;
      if (wonderPlan) {
        const wProps = WONDER_PROPERTIES[wonderPlan.buildingType];
        if (wProps) {
          console.log(`[AutoProduction] Wonder strategy chose: ${wonderPlan.buildingType} (priority: ${wonderPlan.priority})`);
          return {
            type: 'building',
            itemType: wonderPlan.buildingType,
            name: wProps.name,
            cost: wProps.cost
          };
        }
      }
    }

    // 7. Build military units (default)
    console.log('[AutoProduction] Building default military unit');
    return this.buildDefenderProduction(city, threatAssessment);
  }

  private evaluateCityThreat(city: City): CityThreatAssessment | null {
    if (!this.gameEngine.squareGrid) {
      return null;
    }

    const storage = typeof this.gameEngine.getPlayerStorage === 'function'
      ? this.gameEngine.getPlayerStorage(city.civilizationId)
      : undefined;
    const roundNumber = this.gameEngine.roundManager?.getRoundNumber?.() ?? 0;
    const samples = collectCityThreatSamples(this.gameEngine, city, city.civilizationId, storage, roundNumber);
    if (samples.length === 0) {
      return null;
    }

    const garrisonStrength = computeCityGarrisonStrength(this.gameEngine, city, city.civilizationId);
    const dangerThreshold = calculateDangerThreshold(this.gameEngine.currentYear ?? -4000, this.gameEngine.gameSettings?.difficulty ?? 'PRINCE');

    return assessCityThreat({
      city: { id: city.id, col: city.col, row: city.row },
      samples,
      garrisonStrength,
      defensiveBonus: 0,
      dangerThreshold
    });
  }

  private isDefensiveProduction(currentProduction: any): boolean {
    if (!currentProduction || currentProduction.type !== 'unit') {
      return false;
    }
    const unitProps = UNIT_PROPS[currentProduction.itemType];
    if (!unitProps) {
      return false;
    }
    return (unitProps.defense || 0) >= (unitProps.attack || 0);
  }

  private buildDefenderProduction(city: City, threatAssessment?: CityThreatAssessment | null) {
    const civ = this.gameEngine.civilizations?.[city.civilizationId];
    const unitType = this.selectDefenderTypeForCiv(civ);
    const unitProps = UNIT_PROPS[unitType];
    const production = {
      type: 'unit',
      itemType: unitType,
      name: unitProps.name,
      cost: unitProps.cost
    };

    if (threatAssessment) {
      console.log('[AutoProduction] Threat level', threatAssessment.netThreat.toFixed(2), '-> producing', unitProps.name);
    }

    return production;
  }

  /** Tech-gated defender selection using the given civ's technologies */
  private selectDefenderTypeForCiv(civ: any): string {
    const defenderPreference = ['riflemen', 'musketeer', 'phalanx', 'archer', 'warrior'];
    for (const unitType of defenderPreference) {
      if (UNIT_PROPS[unitType] && (!civ || canBuildUnit(civ, unitType))) {
        return unitType;
      }
    }
    return 'warrior';
  }

  private shouldSupportOffensivePlan(city: City): boolean {
    const storage = typeof this.gameEngine.getPlayerStorage === 'function'
      ? this.gameEngine.getPlayerStorage(city.civilizationId)
      : undefined;
    const plan = storage?.turnData?.offensivePlan;
    if (!plan || city.population < 2) {
      return false;
    }

    const offensiveUnits = this.countOffensiveUnits(city.civilizationId);
    return offensiveUnits < plan.requiredUnits;
  }

  private countOffensiveUnits(civilizationId: number): number {
    return this.gameEngine.units.filter((unit: any) => unit.civilizationId === civilizationId && this.isOffensiveUnitType(unit.type)).length;
  }

  private isOffensiveUnitType(unitType: string): boolean {
    const props = UNIT_PROPS[unitType];
    if (!props) {
      return false;
    }
    return (props.attack || 0) >= (props.defense || 0);
  }

  private buildOffensiveProduction(city: City) {
    const civ = this.gameEngine.civilizations?.[city.civilizationId];
    const unitType = this.selectOffensiveUnitTypeForCiv(civ);
    const unitProps = UNIT_PROPS[unitType];
    return {
      type: 'unit',
      itemType: unitType,
      name: unitProps.name,
      cost: unitProps.cost
    };
  }

  /** Tech-gated offensive unit selection */
  private selectOffensiveUnitTypeForCiv(civ: any): string {
    const offensivePreference = ['tank', 'cavalry', 'knights', 'chariot', 'legion', 'archer', 'warrior'];
    for (const unitType of offensivePreference) {
      if (UNIT_PROPS[unitType] && (!civ || canBuildUnit(civ, unitType))) {
        return unitType;
      }
    }
    return 'warrior';
  }

  // findCivForYear removed (unused)

  /** Build a game state summary for AIBuildingStrategy */
  private buildGameState(civilizationId: number): {
    currentYear: number;
    roundNumber: number;
    numCities: number;
    totalPopulation: number;
    numMilitaryUnits: number;
    isAtWar: boolean;
    knownEnemyCities: number;
    isBorderCity: boolean;
    isUnderThreat: boolean;
    builtWonders: string[];
  } {
    const cities = this.gameEngine.cities?.filter((c: any) => c.civilizationId === civilizationId) || [];
    const civ = this.gameEngine.civilizations?.[civilizationId];
    const storage = typeof this.gameEngine.getPlayerStorage === 'function'
      ? this.gameEngine.getPlayerStorage(civilizationId)
      : undefined;

    let knownEnemyCities = 0;
    if (storage?.enemyLocations) {
      for (const enemies of storage.enemyLocations.values()) {
        knownEnemyCities += enemies.filter((e: any) => e.type === 'city').length;
      }
    }

    // Collect globally built wonders
    const builtWonders: string[] = [];
    for (const c of (this.gameEngine.cities || [])) {
      for (const b of (c.buildings || [])) {
        if (WONDER_PROPERTIES[b]) {
          builtWonders.push(b);
        }
      }
    }

    return {
      currentYear: this.gameEngine.currentYear ?? -4000,
      roundNumber: this.gameEngine.roundManager?.getRoundNumber?.() ?? 0,
      numCities: cities.length,
      totalPopulation: cities.reduce((sum: number, c: any) => sum + (c.population || 1), 0),
      numMilitaryUnits: this.gameEngine.units?.filter(
        (u: any) => u.civilizationId === civilizationId && (UNIT_PROPS[u.type]?.attack || 0) > 0
      ).length ?? 0,
      isAtWar: civ?.warWith?.size > 0,
      knownEnemyCities,
      isBorderCity: false, // default, overridden per-city in determineProductionItem
      isUnderThreat: false,
      builtWonders,
    };
  }

  /**
   * Process auto-production for all cities belonging to a civilization
   */
  processAutoProductionForCivilization(civilizationId: number): void {
    try {
      console.log('[AutoProduction] Processing auto-production for civilization', civilizationId);
      
      const civCities = this.gameEngine.cities.filter((c: any) => c.civilizationId === civilizationId);
      
      for (const city of civCities) {
        // Only set production if city has auto-production enabled
        if ((city as any).autoProduction) {
          this.setAutoProduction(city.id);
        }
      }
    } catch (e) {
      console.error('[AutoProduction] processAutoProductionForCivilization error', e);
    }
  }

  /**
   * Process auto-production for all AI civilizations
   */
  processAutoProductionForAI(): void {
    try {
      console.log('[AutoProduction] Processing auto-production for all AI');
      
      const aiCivilizations = this.gameEngine.civilizations.filter(
        (civ: any) => civ.isAI || civ.id !== 0
      );
      
      for (const civ of aiCivilizations) {
        this.processAutoProductionForCivilization(civ.id);
      }
    } catch (e) {
      console.error('[AutoProduction] processAutoProductionForAI error', e);
    }
  }
}
