// Game Constants
export const CONSTANTS = {
    // Hex Grid Configuration
    HEX_SIZE: 32,
    HEX_WIDTH: 56,  // HEX_SIZE * Math.sqrt(3)
    HEX_HEIGHT: 64, // HEX_SIZE * 2
    
    // Map Dimensions
    MAP_WIDTH: 80,
    MAP_HEIGHT: 50,
    
    // Terrain Types
    TERRAIN: {
        OCEAN: 'ocean',
        GRASSLAND: 'grassland',
        PLAINS: 'plains',
        DESERT: 'desert',
        TUNDRA: 'tundra',
        HILLS: 'hills',
        MOUNTAINS: 'mountains',
        FOREST: 'forest'
    },
    
    // Terrain Properties
    TERRAIN_PROPS: {
        ocean: { 
            movement: 1, 
            defense: 0, 
            food: 1, 
            production: 0, 
            trade: 2,
            color: '#1e3a8a',
            passable: false 
        },
        grassland: { 
            movement: 1, 
            defense: 0, 
            food: 2, 
            production: 0, 
            trade: 0,
            color: '#22c55e',
            passable: true 
        },
        plains: { 
            movement: 1, 
            defense: 0, 
            food: 1, 
            production: 1, 
            trade: 0,
            color: '#84cc16',
            passable: true 
        },
        desert: { 
            movement: 1, 
            defense: 0, 
            food: 0, 
            production: 1, 
            trade: 0,
            color: '#fbbf24',
            passable: true 
        },
        tundra: { 
            movement: 1, 
            defense: 0, 
            food: 1, 
            production: 0, 
            trade: 0,
            color: '#e5e7eb',
            passable: true 
        },
        hills: { 
            movement: 2, 
            defense: 2, 
            food: 1, 
            production: 2, 
            trade: 0,
            color: '#a78bfa',
            passable: true 
        },
        mountains: { 
            movement: 3, 
            defense: 3, 
            food: 0, 
            production: 1, 
            trade: 0,
            color: '#6b7280',
            passable: true 
        },
        forest: { 
            movement: 2, 
            defense: 1, 
            food: 1, 
            production: 2, 
            trade: 0,
            color: '#059669',
            passable: true 
        }
    },

    // Unit Types
    UNIT_TYPES: {
        SETTLER: 'settler',
        WARRIOR: 'warrior',
        PHALANX: 'phalanx',
        ARCHER: 'archer',
        LEGION: 'legion',
        CATAPULT: 'catapult',
        CAVALRY: 'cavalry',
        KNIGHT: 'knight',
        CANNON: 'cannon',
        MUSKETEER: 'musketeer',
        RIFLEMAN: 'rifleman',
        CAVALRY_II: 'cavalry_ii',
        BATTLESHIP: 'battleship',
        TRIREME: 'trireme',
        CARAVEL: 'caravel'
    },

    // Unit Properties
    UNIT_PROPS: {
        settler: {
            name: 'Settler',
            attack: 0,
            defense: 1,
            movement: 1,
            cost: 40,
            canFound: true,
            type: 'civilian',
            icon: '🏘️'
        },
        warrior: {
            name: 'Warrior',
            attack: 1,
            defense: 1,
            movement: 1,
            cost: 10,
            type: 'military',
            icon: '⚔️'
        },
        phalanx: {
            name: 'Phalanx',
            attack: 1,
            defense: 2,
            movement: 1,
            cost: 20,
            type: 'military',
            icon: '🛡️'
        },
        archer: {
            name: 'Archer',
            attack: 3,
            defense: 2,
            movement: 1,
            cost: 30,
            type: 'military',
            icon: '🏹'
        },
        legion: {
            name: 'Legion',
            attack: 4,
            defense: 2,
            movement: 1,
            cost: 40,
            type: 'military',
            icon: '🗡️'
        },
        catapult: {
            name: 'Catapult',
            attack: 6,
            defense: 1,
            movement: 1,
            cost: 40,
            type: 'siege',
            icon: '💥'
        },
        cavalry: {
            name: 'Cavalry',
            attack: 2,
            defense: 1,
            movement: 2,
            cost: 20,
            type: 'military',
            icon: '🐎'
        },
        knight: {
            name: 'Knight',
            attack: 4,
            defense: 2,
            movement: 2,
            cost: 40,
            type: 'military',
            icon: '♞'
        },
        trireme: {
            name: 'Trireme',
            attack: 1,
            defense: 1,
            movement: 3,
            cost: 40,
            type: 'naval',
            icon: '⛵'
        }
    },

    // Building Types
    BUILDING_TYPES: {
        BARRACKS: 'barracks',
        GRANARY: 'granary',
        TEMPLE: 'temple',
        MARKETPLACE: 'marketplace',
        LIBRARY: 'library',
        WALLS: 'walls',
        AQUEDUCT: 'aqueduct',
        COLOSSEUM: 'colosseum',
        COURTHOUSE: 'courthouse',
        UNIVERSITY: 'university',
        CATHEDRAL: 'cathedral',
        BANK: 'bank'
    },

    // Building Properties
    BUILDING_PROPS: {
        barracks: {
            name: 'Barracks',
            cost: 40,
            maintenance: 1,
            effect: 'Veteran units',
            description: 'All land units built here are veterans'
        },
        granary: {
            name: 'Granary',
            cost: 60,
            maintenance: 1,
            effect: 'Food storage',
            description: 'Retains half food when city grows'
        },
        temple: {
            name: 'Temple',
            cost: 40,
            maintenance: 1,
            effect: 'Makes 1 unhappy citizen content',
            description: 'Increases happiness in the city'
        },
        marketplace: {
            name: 'Marketplace',
            cost: 80,
            maintenance: 1,
            effect: '+50% trade',
            description: 'Increases trade output'
        },
        library: {
            name: 'Library',
            cost: 80,
            maintenance: 1,
            effect: '+50% science',
            description: 'Increases science output'
        },
        walls: {
            name: 'City Walls',
            cost: 80,
            maintenance: 2,
            effect: 'Triples defense vs land units',
            description: 'Greatly increases city defense'
        }
    },

    // Resource Types
    RESOURCES: {
        FOOD: 'food',
        PRODUCTION: 'production',
        TRADE: 'trade',
        SCIENCE: 'science',
        GOLD: 'gold'
    },

    // Technology Categories
    TECH_CATEGORIES: {
        ANCIENT: 'ancient',
        CLASSICAL: 'classical',
        MEDIEVAL: 'medieval',
        RENAISSANCE: 'renaissance',
        INDUSTRIAL: 'industrial',
        MODERN: 'modern'
    },

    // Civilization Colors
    CIVILIZATION_COLORS: [
        '#e74c3c', // Red (Roman)
        '#3498db', // Blue (Greek)
        '#f39c12', // Orange (Egyptian)
        '#27ae60', // Green (Chinese)
        '#9b59b6', // Purple (Babylonian)
        '#e67e22', // Orange-Red (Indian)
        '#1abc9c', // Turquoise (Aztec)
        '#34495e'  // Dark Blue-Gray (German)
    ],

    // Game Settings
    GAME: {
        MAX_CIVILIZATIONS: 8,
        STARTING_UNITS: 2, // Settler + Warrior
        STARTING_TECHNOLOGIES: 1,
        INITIAL_GOLD: 50,
        TECH_COST_BASE: 20,
        CITY_GROWTH_BASE: 20
    },

    // UI Constants
    UI: {
        SIDEBAR_WIDTH: 300,
        TOPBAR_HEIGHT: 60,
        BOTTOM_PANEL_HEIGHT: 200,
        ANIMATION_DURATION: 300
    }
};

// Export individual constants for convenience
export const {
    TERRAIN,
    TERRAIN_PROPS,
    UNIT_TYPES,
    UNIT_PROPS,
    BUILDING_TYPES,
    BUILDING_PROPS,
    RESOURCES,
    TECH_CATEGORIES,
    CIVILIZATION_COLORS
} = CONSTANTS;

export default CONSTANTS;