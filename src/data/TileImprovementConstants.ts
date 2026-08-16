// Improvement Constants - Terrain improvements and their properties

export interface ImprovementDisplayConfig {
    glyph?: string;
    label?: string;
    color?: string;
    font?: string;
    offsetX?: number;
    offsetY?: number;
    skipLabel?: boolean;
}

export interface TileImprovementConstants {
    name: string;
    turns: number;
    effects: Record<string, number>;
    terrainRestrictions?: string[];
    requiredTech?: string;
    display?: ImprovementDisplayConfig;
    /** Terrain the tile converts to when built on a `convertibleTerrains` tile (e.g. jungle -> grassland). */
    convertsTo?: string;
    /** Terrains on which building this transforms the tile instead of leaving an improvement. */
    convertibleTerrains?: string[];
    /** Terrain the tile clears to (e.g. forest -> plains). */
    clearsTo?: string;
    /** Terrains on which building this clears the tile. */
    clearableTerrains?: string[];
    /** Per-terrain yield effects (Civ1 mines: hills +3 production, mountains +1). */
    effectsByTerrain?: Record<string, Record<string, number>>;
    /** Terrains on which this improvement grants +1 trade (Civ1 road on grassland/plains/desert). */
    tradeBonusTerrains?: string[];
    /** Movement cost to enter a tile carrying this improvement (Civ1 road = 1/3, railroad = free). */
    movementCost?: number;
    /** Roads on rivers require the bridge-building tech. */
    riverBridgeRequired?: boolean;
    /** Final multiplicative defense bonus in combat (Civ1 fortress = 2 -> +100%). */
    defenseMultiplier?: number;
}

export const IMPROVEMENT_TYPES = {
    // Basic Improvements
    IRRIGATION: 'irrigation',
    ROAD: 'road',
    RAILROAD: 'railroad',
    MINES: 'mines',
    FORTRESS: 'fortress',
    POLLUTION: 'pollution',
} as const;

export const IMPROVEMENT_PROPERTIES: Record<string, TileImprovementConstants> = {
    [IMPROVEMENT_TYPES.IRRIGATION]: {
        name: 'Irrigation',
        turns: 2,
        effects: {
            food: 1,
        },
        terrainRestrictions: ['grassland', 'plains', 'desert'],
        convertsTo: 'grassland',
        convertibleTerrains: ['jungle', 'swamp'],
        display: {
            label: 'I',
            color: '#00ff77ff',
            font: 'bold 12px monospace',
            offsetX: 10,
            offsetY: -10
        }
    },
    [IMPROVEMENT_TYPES.ROAD]: {
        name: 'Road',
        turns: 1,
        effects: {
            trade: 0
        },
        // Civ1: roads give +1 trade only on grassland/plains/desert (never on rivers).
        tradeBonusTerrains: ['grassland', 'plains', 'desert'],
        // Civ1: moving road-to-road costs 1/3 of a movement point.
        movementCost: 1 / 3,
        // Civ1: roads on rivers require the Bridge Building tech.
        riverBridgeRequired: true,
        display: {
            glyph: 'R',
            color: '#ff0000ff',
            font: 'bold 14px monospace',
            offsetX: 0,
            offsetY: 12,
            skipLabel: true
        }
    },
    [IMPROVEMENT_TYPES.RAILROAD]: {
        name: 'Railroad',
        turns: 1,
        effects: {
            movement: 0,
            food: 0.5,
            production: 0.5,
            trade: 0.5
        },
        requiredTech: 'railroad',
        // Civ1: moving railroad-to-road costs no movement point (tiny epsilon for A*).
        movementCost: 0.05,
        display: {
            glyph: 'RR',
            color: '#830000ff',
            font: 'bold 14px monospace',
            offsetX: 0,
            offsetY: 12,
            skipLabel: true
        }
    },
    [IMPROVEMENT_TYPES.MINES]: {
        name: 'Mines',
        turns: 5,
        effects: {
            production: 0
        },
        // Civ1: +1 shield on mountains, +3 shields on hills.
        effectsByTerrain: {
            mountains: { production: 1 },
            hills: { production: 3 }
        },
        terrainRestrictions: ['mountains', 'hills'],
        // Civ1: mining converts jungle/swamp to forest; "clear" turns forest into plains.
        convertsTo: 'forest',
        convertibleTerrains: ['jungle', 'swamp'],
        clearsTo: 'plains',
        clearableTerrains: ['forest'],
        display: {
            label: 'M',
            color: '#444444',
            font: 'bold 12px monospace',
            offsetX: 10,
            offsetY: -10
        }
    },
    [IMPROVEMENT_TYPES.FORTRESS]: {
        name: 'Fortress',
        turns: 6,
        effects: {
            defense: 0,
        },
        // Civ1: +100% defense, applied last in the combat calculation.
        defenseMultiplier: 2,
        requiredTech: 'construction',
        display: {
            label: 'F',
            color: '#ffffffff',
            font: 'bold 12px monospace',
            offsetX: 10,
            offsetY: -10
        }
    },
    [IMPROVEMENT_TYPES.POLLUTION]: {
        name: 'Pollution',
        turns: 0,
        effects: {
            food: -1,
            production: -1,
            trade: -1,
            health: -1
        },
        display: {
            label: 'P',
            color: '#000000ff',
            font: 'bold 12px monospace',
            offsetX: 10,
            offsetY: -10
        }
    },
};


export const IMPROVEMENT_REQUIREMENTS = {
    [IMPROVEMENT_TYPES.RAILROAD]: IMPROVEMENT_TYPES.ROAD,
} as const;