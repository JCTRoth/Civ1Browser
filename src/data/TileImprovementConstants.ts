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
}

export const IMPROVEMENT_TYPES = {
    // Basic Improvements
    IRRIGATION: 'irrigation',
    ROAD: 'road',
    RAILROAD: 'railroad',
    MINES: 'mines',
    FORTRESS: 'fortress',
    POLLUTION: 'pollution',
    // Advanced Improvements
    FARMLAND: 'farmland',
    PORT: 'port',
    AIRPORT: 'airport',
    SUPERHIGHWAYS: 'superhighways',
} as const;

export const IMPROVEMENT_PROPERTIES: Record<string, TileImprovementConstants> = {
    [IMPROVEMENT_TYPES.IRRIGATION]: {
        name: 'Irrigation',
        turns: 2,
        effects: {
            food: 1,
        },
        terrainRestrictions: ['grassland', 'plains', 'desert'],
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
            trade: 0.5
        },
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
        turns: 8,
        effects: {
            production: 1
        },
        terrainRestrictions: ['mountains', 'hills'],
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
            defense: 1.8,
        },
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
    [IMPROVEMENT_TYPES.FARMLAND]: {
        name: 'Farmland',
        turns: 4,
        effects: {
            food: 2,
        },
        terrainRestrictions: ['grassland', 'plains', 'desert'],
        requiredTech: 'refrigeration',
        display: {
            label: 'Fm',
            color: '#00cc55ff',
            font: 'bold 12px monospace',
            offsetX: 10,
            offsetY: -10
        }
    },
    [IMPROVEMENT_TYPES.PORT]: {
        name: 'Port',
        turns: 3,
        effects: {
            food: 1,
            trade: 1,
        },
        terrainRestrictions: ['coast'],
        requiredTech: 'navigation',
        display: {
            label: 'Po',
            color: '#4488ffff',
            font: 'bold 12px monospace',
            offsetX: 10,
            offsetY: -10
        }
    },
    [IMPROVEMENT_TYPES.AIRPORT]: {
        name: 'Airport',
        turns: 4,
        effects: {
            trade: 1,
        },
        terrainRestrictions: ['grassland', 'plains', 'desert', 'tundra'],
        requiredTech: 'flight',
        display: {
            label: 'Ap',
            color: '#cc88ffff',
            font: 'bold 12px monospace',
            offsetX: 10,
            offsetY: -10
        }
    },
    [IMPROVEMENT_TYPES.SUPERHIGHWAYS]: {
        name: 'Superhighways',
        turns: 3,
        effects: {
            trade: 1.5,
            movement: 0,
        },
        requiredTech: 'automobile',
        display: {
            glyph: 'SH',
            color: '#ff4400ff',
            font: 'bold 14px monospace',
            offsetX: 0,
            offsetY: 12,
            skipLabel: true
        }
    },
};


export const IMPROVEMENT_REQUIREMENTS = {
    [IMPROVEMENT_TYPES.RAILROAD]: IMPROVEMENT_TYPES.ROAD,
    [IMPROVEMENT_TYPES.FARMLAND]: IMPROVEMENT_TYPES.IRRIGATION,
    [IMPROVEMENT_TYPES.SUPERHIGHWAYS]: IMPROVEMENT_TYPES.ROAD,
} as const;