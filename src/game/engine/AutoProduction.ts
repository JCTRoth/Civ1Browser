/**
 * AutoProduction - Automatically manages production queues for cities
 * Used by AI and can be enabled for player cities via city modal
 */

import { UNIT_PROPS, BUILDING_PROPS } from '@/utils/Constants';
import {
  assessCityThreat,
  calculateDangerThreshold,
  collectCityThreatSamples,
  computeCityGarrisonStrength,
  type CityThreatAssessment
} from './AIStrategy';
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
    // 1. Basic military unit if city has no defenders
    // 2. Emergency reinforcements for threatened cities
    // 3. Offensive campaign reinforcements
    // 4. Essential buildings (granary, barracks)
    // 5. Worker/Settler if needed
    // 6. Military units as default

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

    if (this.shouldSupportOffensivePlan(city)) {
      console.log('[AutoProduction] Supporting offensive plan with new attacker');
      return this.buildOffensiveProduction(city);
    }

    // 4. Check for essential buildings
    const hasGranary = city.buildings?.some((b: any) => b === 'granary' || b.type === 'granary');
    if (!hasGranary && BUILDING_PROPS.granary) {
      console.log('[AutoProduction] City needs granary');
      return {
        type: 'building',
        itemType: 'granary',
        name: BUILDING_PROPS.granary.name,
        cost: BUILDING_PROPS.granary.cost
      };
    }

    const hasBarracks = city.buildings?.some((b: any) => b === 'barracks' || b.type === 'barracks');
    if (!hasBarracks && BUILDING_PROPS.barracks) {
      console.log('[AutoProduction] City needs barracks');
      return {
        type: 'building',
        itemType: 'barracks',
        name: BUILDING_PROPS.barracks.name,
        cost: BUILDING_PROPS.barracks.cost
      };
    }

    // 5. Build settlers if civilization has few cities
    const civCities = this.gameEngine.cities.filter((c: any) => c.civilizationId === city.civilizationId);
    if (civCities.length < 3 && city.population >= 2) {
      console.log('[AutoProduction] Civilization needs more cities');
      return {
        type: 'unit',
        itemType: 'settler',
        name: UNIT_PROPS.settlers.name,
        cost: UNIT_PROPS.settlers.cost
      };
    }

    // 6. Build military units (default to warrior)
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
    const unitType = this.selectDefenderType(this.gameEngine.currentYear ?? -4000);
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

  private selectDefenderType(currentYear: number): string {
    const modern = ['riflemen', 'musketeer', 'phalanx', 'warrior'];
    const medieval = ['musketeer', 'phalanx', 'warrior'];
    const ancient = ['phalanx', 'warrior'];

    const preference = currentYear >= 1750 ? modern : currentYear >= 500 ? medieval : ancient;

    for (const unitType of preference) {
      if (UNIT_PROPS[unitType]) {
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
    const unitType = this.selectOffensiveUnitType(this.gameEngine.currentYear ?? -4000);
    const unitProps = UNIT_PROPS[unitType];
    return {
      type: 'unit',
      itemType: unitType,
      name: unitProps.name,
      cost: unitProps.cost
    };
  }

  private selectOffensiveUnitType(currentYear: number): string {
    const modern = ['cavalry', 'knights', 'archer', 'warrior'];
    const medieval = ['knights', 'archer', 'warrior'];
    const ancient = ['archer', 'warrior'];

    const preference = currentYear >= 1500 ? modern : currentYear >= 500 ? medieval : ancient;

    for (const unitType of preference) {
      if (UNIT_PROPS[unitType]) {
        return unitType;
      }
    }

    return 'warrior';
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
