// Terrain and Tile System
class Tile {
    constructor(col, row, terrain) {
        this.col = col;
        this.row = row;
        this.terrain = terrain;
        this.improvements = [];
        this.resources = null;
        this.visibility = {}; // Per-civilization visibility
        this.explored = {}; // Per-civilization exploration
        this.pollution = false;
        
        // Calculate base yields
        this.calculateYields();
    }
    
    calculateYields() {
        const terrainProps = CONSTANTS.TERRAIN_PROPS[this.terrain];
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
    getYields() {
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
            const improvementProps = CONSTANTS.IMPROVEMENT_PROPS[improvement.type];
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
    canImprove(improvementType) {
        const improvement = CONSTANTS.IMPROVEMENT_PROPS[improvementType];
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
        
        return true;
    }
    
    // Add improvement to tile
    addImprovement(improvementType) {
        if (!this.canImprove(improvementType)) return false;
        
        const improvement = {
            type: improvementType,
            turns: 0,
            complete: false
        };
        
        this.improvements.push(improvement);
        return true;
    }
    
    // Check if tile has specific improvement
    hasImprovement(improvementType) {
        return this.improvements.some(imp => imp.type === improvementType && imp.complete);
    }
    
    // Remove improvement from tile
    removeImprovement(improvementType) {
        this.improvements = this.improvements.filter(imp => imp.type !== improvementType);
    }
    
    // Set tile visibility for civilization
    setVisibility(civId, visible) {
        this.visibility[civId] = visible;
    }
    
    // Check if tile is visible to civilization
    isVisible(civId) {
        return this.visibility[civId] || false;
    }
    
    // Set tile exploration status for civilization
    setExplored(civId, explored) {
        this.explored[civId] = explored;
    }
    
    // Check if tile is explored by civilization
    isExplored(civId) {
        return this.explored[civId] || false;
    }
    
    // Get movement cost for unit
    getMovementCost(unit) {
        let cost = this.movementCost;
        
        // Apply unit-specific modifiers
        const unitProps = CONSTANTS.UNIT_PROPS[unit.type];
        if (unitProps.naval && this.terrain !== CONSTANTS.TERRAIN.OCEAN) {
            return Infinity; // Naval units can't enter land
        }
        
        if (!unitProps.naval && this.terrain === CONSTANTS.TERRAIN.OCEAN) {
            return Infinity; // Land units can't enter ocean
        }
        
        // Roads reduce movement cost
        if (this.hasImprovement('road')) {
            cost = Math.min(cost, 1/3);
        }
        
        return cost;
    }
    
    // Get defense bonus for unit on this tile
    getDefenseBonus() {
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
const RESOURCE_TYPES = {
    WHEAT: 'wheat',
    CATTLE: 'cattle',
    FISH: 'fish',
    COAL: 'coal',
    IRON: 'iron',
    GOLD: 'gold',
    GEMS: 'gems',
    SILK: 'silk',
    SPICES: 'spices',
    WHALES: 'whales'
};

const RESOURCE_PROPS = {
    wheat: { food: 1, production: 0, trade: 0, terrain: ['grassland', 'plains'] },
    cattle: { food: 1, production: 0, trade: 0, terrain: ['grassland', 'plains'] },
    fish: { food: 2, production: 0, trade: 0, terrain: ['ocean'] },
    coal: { food: 0, production: 1, trade: 0, terrain: ['hills', 'mountains'] },
    iron: { food: 0, production: 1, trade: 0, terrain: ['hills', 'mountains'] },
    gold: { food: 0, production: 0, trade: 3, terrain: ['hills', 'mountains'] },
    gems: { food: 0, production: 0, trade: 4, terrain: ['hills', 'mountains'] },
    silk: { food: 0, production: 0, trade: 2, terrain: ['forest', 'grassland'] },
    spices: { food: 0, production: 0, trade: 3, terrain: ['grassland', 'plains'] },
    whales: { food: 1, production: 0, trade: 2, terrain: ['ocean'] }
};

// Improvement types and properties
const IMPROVEMENT_TYPES = {
    ROAD: 'road',
    RAILROAD: 'railroad',
    IRRIGATION: 'irrigation',
    MINE: 'mine',
    FORTRESS: 'fortress',
    AIRBASE: 'airbase'
};

CONSTANTS.IMPROVEMENT_PROPS = {
    road: {
        name: 'Road',
        food: 0,
        production: 0,
        trade: 1,
        buildTurns: 3,
        allowedTerrain: null, // Can be built on any terrain
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
    airbase: {
        name: 'Airbase',
        food: 0,
        production: 0,
        trade: 0,
        buildTurns: 10,
        allowedTerrain: null,
        requiresResource: null
    }
};

// Terrain Generator
class TerrainGenerator {
    constructor(width, height, seed = null) {
        this.width = width;
        this.height = height;
        this.seed = seed || Math.random();
        this.noise = new SimplexNoise(this.seed);
    }
    
    generateTerrain() {
        const tiles = ArrayUtils.create2D(this.width, this.height);
        
        // Generate base terrain using noise
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const terrain = this.getTerrainAtPosition(col, row);
                tiles[row][col] = new Tile(col, row, terrain);
            }
        }
        
        // Post-process to ensure realistic terrain distribution
        this.postProcessTerrain(tiles);
        
        // Add resources
        this.addResources(tiles);
        
        return tiles;
    }
    
    getTerrainAtPosition(col, row) {
        const scale = 0.05;
        const elevation = this.noise.noise2D(col * scale, row * scale);
        const temperature = this.noise.noise2D((col + 1000) * scale, (row + 1000) * scale);
        const humidity = this.noise.noise2D((col + 2000) * scale, (row + 2000) * scale);
        
        // Ocean (lowest elevation)
        if (elevation < -0.3) {
            return CONSTANTS.TERRAIN.OCEAN;
        }
        
        // Mountains (highest elevation)
        if (elevation > 0.4) {
            return CONSTANTS.TERRAIN.MOUNTAINS;
        }
        
        // Hills (high elevation)
        if (elevation > 0.2) {
            return CONSTANTS.TERRAIN.HILLS;
        }
        
        // Temperature and humidity based terrain
        if (temperature < -0.2) {
            return CONSTANTS.TERRAIN.TUNDRA;
        }
        
        if (temperature > 0.3 && humidity < -0.2) {
            return CONSTANTS.TERRAIN.DESERT;
        }
        
        // Forest (moderate temperature and high humidity)
        if (humidity > 0.2 && temperature > -0.1 && temperature < 0.3) {
            return CONSTANTS.TERRAIN.FOREST;
        }
        
        // Plains (moderate conditions)
        if (humidity < 0.1) {
            return CONSTANTS.TERRAIN.PLAINS;
        }
        
        // Default to grassland
        return CONSTANTS.TERRAIN.GRASSLAND;
    }
    
    postProcessTerrain(tiles) {
        // Ensure continents are formed properly
        this.smoothCoastlines(tiles);
        
        // Add some rivers (simplified)
        this.addRivers(tiles);
    }
    
    smoothCoastlines(tiles) {
        const newTiles = ArrayUtils.create2D(this.width, this.height);
        
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const currentTile = tiles[row][col];
                let oceanNeighbors = 0;
                let landNeighbors = 0;
                
                // Count ocean vs land neighbors
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const newRow = row + dr;
                        const newCol = col + dc;
                        
                        if (newRow >= 0 && newRow < this.height && 
                            newCol >= 0 && newCol < this.width) {
                            if (tiles[newRow][newCol].terrain === CONSTANTS.TERRAIN.OCEAN) {
                                oceanNeighbors++;
                            } else {
                                landNeighbors++;
                            }
                        }
                    }
                }
                
                // Smooth isolated tiles
                if (currentTile.terrain === CONSTANTS.TERRAIN.OCEAN && oceanNeighbors < 3) {
                    newTiles[row][col] = new Tile(col, row, CONSTANTS.TERRAIN.GRASSLAND);
                } else if (currentTile.terrain !== CONSTANTS.TERRAIN.OCEAN && landNeighbors < 3) {
                    newTiles[row][col] = new Tile(col, row, CONSTANTS.TERRAIN.OCEAN);
                } else {
                    newTiles[row][col] = currentTile;
                }
            }
        }
        
        // Copy smoothed tiles back
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                tiles[row][col] = newTiles[row][col];
            }
        }
    }
    
    addRivers(tiles) {
        // Simple river generation - find paths from mountains to ocean
        const riverSources = [];
        
        // Find potential river sources (mountains)
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                if (tiles[row][col].terrain === CONSTANTS.TERRAIN.MOUNTAINS) {
                    riverSources.push({ col, row });
                }
            }
        }
        
        // Generate rivers from some sources
        const riverCount = Math.floor(riverSources.length * 0.1);
        for (let i = 0; i < riverCount; i++) {
            const source = MathUtils.randomChoice(riverSources);
            this.generateRiver(tiles, source.col, source.row);
        }
    }
    
    generateRiver(tiles, startCol, startRow) {
        // Simple river generation - not implemented in detail for this demo
        // Would involve pathfinding toward lower elevation or ocean
    }
    
    addResources(tiles) {
        const resourceChance = 0.15; // 15% of tiles get resources
        
        for (let row = 0; row < this.height; row++) {
            for (let col = 0; col < this.width; col++) {
                const tile = tiles[row][col];
                
                if (Math.random() < resourceChance) {
                    const compatibleResources = this.getCompatibleResources(tile.terrain);
                    if (compatibleResources.length > 0) {
                        const resourceType = MathUtils.randomChoice(compatibleResources);
                        tile.resources = {
                            type: resourceType,
                            ...RESOURCE_PROPS[resourceType]
                        };
                    }
                }
            }
        }
    }
    
    getCompatibleResources(terrain) {
        const compatible = [];
        
        for (const [resourceType, props] of Object.entries(RESOURCE_PROPS)) {
            if (props.terrain.includes(terrain)) {
                compatible.push(resourceType);
            }
        }
        
        return compatible;
    }
}

// Simplified Simplex Noise implementation
class SimplexNoise {
    constructor(seed) {
        this.p = [];
        this.perm = [];
        
        // Initialize permutation table with seed
        for (let i = 0; i < 256; i++) {
            this.p[i] = Math.floor(Math.random() * 256);
        }
        
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
        }
    }
    
    noise2D(x, y) {
        // Simplified noise function
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        
        const u = this.fade(xf);
        const v = this.fade(yf);
        
        const aa = this.perm[this.perm[xi] + yi];
        const ab = this.perm[this.perm[xi] + yi + 1];
        const ba = this.perm[this.perm[xi + 1] + yi];
        const bb = this.perm[this.perm[xi + 1] + yi + 1];
        
        const x1 = MathUtils.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
        const x2 = MathUtils.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
        
        return MathUtils.lerp(x1, x2, v);
    }
    
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
}