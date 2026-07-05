// Terrain and Tile System - Legacy Implementation (Converted to TypeScript)

import { Constants, SpecialResource } from '@/utils/Constants';
import { IMPROVEMENT_REQUIREMENTS } from '@/data/TileImprovementConstants';

// Type definitions
interface Improvement {
    type: string;
    turns: number;
    complete: boolean;
}

interface Resource {
    type?: string;
    food: number;
    production: number;
    trade: number;
    terrain: string;
}

interface ImprovementProperties {
    name: string;
    food: number;
    production: number;
    trade: number;
    buildTurns: number;
    allowedTerrain: string[] | null;
    requiresResource: string | null;
    prerequisite?: string;
    defenseBonus?: number;
    convertsTo?: string;
}

interface TerrainPropsValue {
    food: number;
    production: number;
    trade: number;
    movement: number;
    defense: number;
    passable: boolean;
    description?: string;
    buildModifier?: number;
}

interface TerrainConstants {
    TERRAIN_PROPS: Record<string, TerrainPropsValue>;
    RESOURCE_PROPS: SpecialResource[];
    IMPROVEMENT_PROPS: Record<string, ImprovementProperties>;
}

// Extend Constants with terrain-specific properties
const TERRAIN_CONSTANTS: TerrainConstants = {
    TERRAIN_PROPS: Constants.TERRAIN_PROPS,
    RESOURCE_PROPS: Constants.RESOURCE_PROPS,
    IMPROVEMENT_PROPS: {
        road: {
            name: 'Road',
            food: 0,
            production: 0,
            trade: 1,
            buildTurns: 3,
            allowedTerrain: null,
            requiresResource: null
        },
        railroad: {
            name: 'Railroad',
            food: 0,
            production: 1,
            trade: 0,
            buildTurns: 6,
            allowedTerrain: null,
            requiresResource: null,
            prerequisite: 'road'
        },
        irrigation: {
            name: 'Irrigation',
            food: 1,
            production: 0,
            trade: 0,
            buildTurns: 5,
            allowedTerrain: ['grassland', 'plains', 'desert'],
            requiresResource: null
        },
        mine: {
            name: 'Mine',
            food: 0,
            production: 1,
            trade: 0,
            buildTurns: 5,
            allowedTerrain: ['hills', 'mountains'],
            requiresResource: null
        },
        fortress: {
            name: 'Fortress',
            food: 0,
            production: 0,
            trade: 0,
            buildTurns: 8,
            allowedTerrain: null,
            requiresResource: null,
            defenseBonus: 2
        },
        // Terrain conversion improvements
        convertToGrassland: {
            name: 'Convert to Grassland',
            food: 0,
            production: 0,
            trade: 0,
            buildTurns: 8,
            allowedTerrain: ['jungle', 'swamp'],
            requiresResource: null,
            convertsTo: 'grassland'
        },
        convertToForest: {
            name: 'Convert to Forest',
            food: 0,
            production: 0,
            trade: 0,
            buildTurns: 8,
            allowedTerrain: ['jungle', 'swamp', 'grassland'],
            requiresResource: null,
            convertsTo: 'forest'
        },
        convertToPlains: {
            name: 'Convert to Plains',
            food: 0,
            production: 0,
            trade: 0,
            buildTurns: 8,
            allowedTerrain: ['forest'],
            requiresResource: null,
            convertsTo: 'plains'
        }
    }
};

// Terrain and Tile System
export class Tile {
    public col: number;
    public row: number;
    public terrain: string;
    public improvements: Improvement[];
    public resources: Resource | null;
    public visibility: Record<string, boolean>;
    public explored: Record<string, boolean>;
    public pollution: boolean;

    public baseFood: number;
    public baseProduction: number;
    public baseTrade: number;
    public movementCost: number;
    public defenseBonus: number;

    constructor(col: number, row: number, terrain: string) {
        this.col = col;
        this.row = row;
        this.terrain = terrain;
        this.improvements = [];
        this.resources = null;
        this.visibility = {};
        this.explored = {};
        this.pollution = false;

        // Calculate base yields
        this.calculateYields();

        // Generate special resources
        this.generateSpecialResource();
    }

    // Generate special resources based on terrain type
    generateSpecialResource(): void {
        // Check each resource type to see if it can appear on this terrain
        for (const [resourceType, resourceProps] of Object.entries(TERRAIN_CONSTANTS.RESOURCE_PROPS)) {
            if (resourceProps.terrain.includes(this.terrain)) {
                // Random chance for resource to appear (adjust probability as needed)
                const probability = 0.15; // 15% chance for any resource
                if (Math.random() < probability) {
                    this.resources = {
                        type: resourceType,
                        food: resourceProps.food,
                        production: resourceProps.production,
                        trade: resourceProps.trade,
                        terrain: resourceProps.terrain
                    };
                    break; // Only one special resource per tile
                }
            }
        }
    }

    calculateYields(): void {
        const terrainProps = TERRAIN_CONSTANTS.TERRAIN_PROPS[this.terrain];
        if (!terrainProps) {
            console.warn(`Unknown terrain type: ${this.terrain}`);
            return;
        }

        this.baseFood = terrainProps.food;
        this.baseProduction = terrainProps.production;
        this.baseTrade = terrainProps.trade;
        this.movementCost = terrainProps.movement;
        this.defenseBonus = terrainProps.defense;
    }

    // Get effective yields considering improvements and resources
    getYields(): { food: number; production: number; trade: number } {
        let food = this.baseFood;
        let production = this.baseProduction;
        let trade = this.baseTrade;

        // Apply resource bonuses
        if (this.resources) {
            food += this.resources.food || 0;
            production += this.resources.production || 0;
            trade += this.resources.trade || 0;
        }

        // Apply improvement bonuses
        this.improvements.forEach(improvement => {
            const improvementProps = TERRAIN_CONSTANTS.IMPROVEMENT_PROPS[improvement.type];
            if (improvementProps) {
                food += improvementProps.food || 0;
                production += improvementProps.production || 0;
                trade += improvementProps.trade || 0;
            }
        });

        // Apply pollution penalty
        if (this.pollution) {
            food = Math.max(0, food - 1);
            production = Math.max(0, production - 1);
        }

        return { food, production, trade };
    }

    // Check if tile can be improved
    canImprove(improvementType: string): boolean {
        const improvement = TERRAIN_CONSTANTS.IMPROVEMENT_PROPS[improvementType];
        if (!improvement) return false;

        // Check if already has this improvement
        if (this.hasImprovement(improvementType)) return false;

        // Check terrain compatibility
        if (improvement.allowedTerrain &&
            !improvement.allowedTerrain.includes(this.terrain)) {
            return false;
        }

        // Check resource compatibility
        if (improvement.requiresResource &&
            (!this.resources || this.resources.type !== improvement.requiresResource)) {
            return false;
        }

        // Check improvement requirements (e.g., railroads require roads)
        const requiredImprovement = IMPROVEMENT_REQUIREMENTS[improvementType];
        if (requiredImprovement && !this.hasImprovement(requiredImprovement)) {
            return false;
        }

        return true;
    }

    // Add improvement to tile
    addImprovement(improvementType: string): boolean {
        if (!this.canImprove(improvementType)) return false;

        const improvement: Improvement = {
            type: improvementType,
            turns: 0,
            complete: false
        };

        this.improvements.push(improvement);
        return true;
    }

    // Complete an improvement on this tile
    completeImprovement(improvementType: string): boolean {
        const improvement = this.improvements.find(imp => imp.type === improvementType && !imp.complete);
        if (!improvement) return false;

        improvement.complete = true;
        improvement.turns = TERRAIN_CONSTANTS.IMPROVEMENT_PROPS[improvementType].buildTurns;

        // Handle terrain conversion if this is a conversion improvement
        const improvementProps = TERRAIN_CONSTANTS.IMPROVEMENT_PROPS[improvementType];
        if (improvementProps.convertsTo) {
            this.convertTerrain(improvementProps.convertsTo);
        }

        return true;
    }

    // Convert terrain to a new type
    convertTerrain(newTerrainType: string): void {
        // Check if the new terrain type exists
        if (!TERRAIN_CONSTANTS.TERRAIN_PROPS[newTerrainType]) {
            console.warn(`Unknown terrain type for conversion: ${newTerrainType}`);
            return;
        }

        // Store old terrain for potential resource loss
        // Convert terrain
        this.terrain = newTerrainType;

        // Recalculate yields for new terrain
        this.calculateYields();

        // Check if special resource is still valid on new terrain
        if (this.resources) {
            const resourceProps = TERRAIN_CONSTANTS.RESOURCE_PROPS[this.resources.type!];
            if (!resourceProps.terrain.includes(newTerrainType)) {
                // Resource is lost when terrain is converted
                this.resources = null;
            }
        }

        // Remove incompatible improvements
        this.improvements = this.improvements.filter(improvement => {
            const improvementProps = TERRAIN_CONSTANTS.IMPROVEMENT_PROPS[improvement.type];
            if (!improvementProps.allowedTerrain) return true; // Improvement works on any terrain
            return improvementProps.allowedTerrain.includes(newTerrainType);
        });
    }

    // Check if tile has specific improvement
    hasImprovement(improvementType: string): boolean {
        return this.improvements.some(imp => imp.type === improvementType && imp.complete);
    }

    // Remove improvement from tile
    removeImprovement(improvementType: string): void {
        this.improvements = this.improvements.filter(imp => imp.type !== improvementType);
    }

    // Set tile visibility for civilization
    setVisibility(civId: string, visible: boolean): void {
        this.visibility[civId] = visible;
    }

    // Check if tile is visible to civilization
    isVisible(civId: string): boolean {
        return this.visibility[civId] || false;
    }

    // Set tile exploration status for civilization
    setExplored(civId: string, explored: boolean): void {
        this.explored[civId] = explored;
    }

    // Check if tile is explored by civilization
    isExplored(civId: string): boolean {
        return this.explored[civId] || false;
    }

    // Get movement cost for unit
    getMovementCost(unit: { type: string; isNaval: boolean }): number {
        let cost = this.movementCost;

        // Apply unit-specific modifiers
        const unitProps = Constants.UNIT_PROPS[unit.type];
        if (unitProps.naval && this.terrain !== Constants.TERRAIN.OCEAN) {
            return Infinity; // Naval units can't enter land
        }

        if (!unitProps.naval && this.terrain === Constants.TERRAIN.OCEAN) {
            return Infinity; // Land units can't enter ocean
        }

        // Roads reduce movement cost
        if (this.hasImprovement('road')) {
            cost = Math.min(cost, 1/3);
        }

        return cost;
    }

    // Get defense bonus for unit on this tile
    getDefenseBonus(): number {
        let bonus = this.defenseBonus;

        // City walls provide additional defense
        if (this.hasImprovement('walls')) {
            bonus += 2;
        }

        // Fortifications provide defense bonus
        if (this.hasImprovement('fortress')) {
            bonus += 1;
        }

        return bonus;
    }
}

// Resource types and properties
// RESOURCE_PROPS constant removed (unused)

// TerrainGenerator and SimplexNoise classes removed (unused)