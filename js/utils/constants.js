// Game Constants
const CONSTANTS = {
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
            color: '#f59e0b',
            passable: true 
        },
        tundra: { 
            movement: 1, 
            defense: 0, 
            food: 1, 
            production: 0, 
            trade: 0,
            color: '#64748b',
            passable: true 
        },
        hills: { 
            movement: 2, 
            defense: 2, 
            food: 1, 
            production: 0, 
            trade: 0,
            color: '#a3a3a3',
            passable: true 
        },
        mountains: { 
            movement: 3, 
            defense: 3, 
            food: 0, 
            production: 1, 
            trade: 0,
            color: '#525252',
            passable: true 
        },
        forest: { 
            movement: 2, 
            defense: 1, 
            food: 1, 
            production: 1, 
            trade: 0,
            color: '#166534',
            passable: true 
        }
    },
    
    // Unit Types
    UNIT_TYPES: {
        SETTLER: 'settler',
        MILITIA: 'militia',
        PHALANX: 'phalanx',
        LEGION: 'legion',
        CATAPULT: 'catapult',
        TRIREME: 'trireme',
        CAVALRY: 'cavalry',
        CHARIOT: 'chariot'
    },
    
    // Unit Properties
    UNIT_PROPS: {
        settler: {
            name: 'Settler',
            attack: 0,
            defense: 1,
            movement: 1,
            cost: 40,
            canSettle: true,
            canWork: true
        },
        militia: {
            name: 'Militia',
            attack: 1,
            defense: 1,
            movement: 1,
            cost: 10,
            canSettle: false,
            canWork: false
        },
        phalanx: {
            name: 'Phalanx',
            attack: 1,
            defense: 2,
            movement: 1,
            cost: 20,
            canSettle: false,
            canWork: false
        },
        legion: {
            name: 'Legion',
            attack: 4,
            defense: 2,
            movement: 1,
            cost: 40,
            canSettle: false,
            canWork: false
        },
        catapult: {
            name: 'Catapult',
            attack: 6,
            defense: 1,
            movement: 1,
            cost: 40,
            canSettle: false,
            canWork: false
        },
        trireme: {
            name: 'Trireme',
            attack: 1,
            defense: 1,
            movement: 3,
            cost: 40,
            canSettle: false,
            canWork: false,
            naval: true
        },
        cavalry: {
            name: 'Cavalry',
            attack: 2,
            defense: 1,
            movement: 2,
            cost: 20,
            canSettle: false,
            canWork: false
        },
        chariot: {
            name: 'Chariot',
            attack: 3,
            defense: 1,
            movement: 2,
            cost: 30,
            canSettle: false,
            canWork: false
        }
    },
    
    // City Buildings
    BUILDINGS: {
        GRANARY: 'granary',
        BARRACKS: 'barracks',
        TEMPLE: 'temple',
        MARKETPLACE: 'marketplace',
        LIBRARY: 'library',
        WALLS: 'walls',
        AQUEDUCT: 'aqueduct',
        BANK: 'bank'
    },
    
    // Building Properties
    BUILDING_PROPS: {
        granary: {
            name: 'Granary',
            cost: 60,
            maintenance: 1,
            effects: { foodStorage: 2 }
        },
        barracks: {
            name: 'Barracks',
            cost: 40,
            maintenance: 1,
            effects: { unitExperience: 1 }
        },
        temple: {
            name: 'Temple',
            cost: 40,
            maintenance: 1,
            effects: { happiness: 1 }
        },
        marketplace: {
            name: 'Marketplace',
            cost: 80,
            maintenance: 1,
            effects: { tradeBonus: 0.5 }
        },
        library: {
            name: 'Library',
            cost: 80,
            maintenance: 1,
            effects: { scienceBonus: 0.5 }
        },
        walls: {
            name: 'City Walls',
            cost: 80,
            maintenance: 2,
            effects: { defense: 3 }
        },
        aqueduct: {
            name: 'Aqueduct',
            cost: 80,
            maintenance: 2,
            effects: { maxPopulation: 8 }
        },
        bank: {
            name: 'Bank',
            cost: 120,
            maintenance: 3,
            effects: { goldBonus: 0.5 }
        }
    },
    
    // Game Settings
    INITIAL_GOLD: 50,
    INITIAL_SCIENCE: 2,
    TURNS_PER_YEAR: 20,
    STARTING_YEAR: -4000,
    
    // Colors
    COLORS: {
        PLAYER: '#ff0000',
        AI_1: '#0000ff',
        AI_2: '#00ff00',
        AI_3: '#ffff00',
        AI_4: '#ff00ff',
        AI_5: '#00ffff',
        NEUTRAL: '#808080',
        SELECTED: '#ffffff',
        HIGHLIGHT: '#ffff80'
    }
};