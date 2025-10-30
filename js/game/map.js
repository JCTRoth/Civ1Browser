// Game Map - Central game state manager
class GameMap extends EventEmitter {
    constructor(width, height, seed = null) {
        super();
        
        this.width = width;
        this.height = height;
        this.seed = seed || Math.random();
        
        // Initialize grid system
        this.grid = new HexGrid(width, height);
        
        // Generate terrain
        const terrainGenerator = new TerrainGenerator(width, height, this.seed);
        this.tiles = terrainGenerator.generateTerrain();
        
        // Game entities
        this.unitManager = new UnitManager();
        this.cityManager = new CityManager();
        this.civilizations = new Map();
        
        // Game state
        this.currentTurn = 1;
        this.currentYear = CONSTANTS.STARTING_YEAR;
        this.activeCivilization = null;
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Unit events
        this.unitManager.on('unitMoved', (data) => {
            this.updateVisibility(data.unit);
            this.emit('unitMoved', data);
        });
        
        this.unitManager.on('unitDestroyed', (data) => {
            this.removeUnitFromCiv(data.unit);
            this.emit('unitDestroyed', data);
        });
        
        // City events
        this.cityManager.on('cityAdded', (data) => {
            this.addCityToCiv(data.city);
            this.emit('cityAdded', data);
        });
        
        this.cityManager.on('cityUnitCreated', (data) => {
            this.addUnit(data.unit);
            this.emit('cityUnitCreated', data);
        });
    }
    
    // Tile access methods
    getTile(col, row) {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height) {
            return null;
        }
        return this.tiles[row][col];
    }
    
    setTile(col, row, tile) {
        if (col >= 0 && col < this.width && row >= 0 && row < this.height) {
            this.tiles[row][col] = tile;
        }
    }
    
    // Unit management
    addUnit(unit) {
        this.unitManager.addUnit(unit);
        this.addUnitToCiv(unit);
        this.updateVisibility(unit);
    }
    
    removeUnit(unitId) {
        const unit = this.unitManager.getUnit(unitId);
        if (unit) {
            this.removeUnitFromCiv(unit);
            this.unitManager.removeUnit(unitId);
        }
    }
    
    getUnit(unitId) {
        return this.unitManager.getUnit(unitId);
    }
    
    getUnitAt(col, row) {
        return this.unitManager.getUnitAt(col, row);
    }
    
    getUnitsAt(col, row) {
        return this.unitManager.getUnitsAt(col, row);
    }
    
    getUnitsByCivilization(civId) {
        return this.unitManager.getUnitsByCivilization(civId);
    }
    
    getAllUnits() {
        return this.unitManager.getAllUnits();
    }
    
    // City management
    foundCity(col, row, civilization, name = null) {
        // Check if location is valid for city
        const tile = this.getTile(col, row);
        if (!tile || tile.terrain === CONSTANTS.TERRAIN.OCEAN) {
            return null;
        }
        
        // Check minimum distance from other cities
        const minDistance = 2;
        const existingCity = this.findNearestCity(col, row);
        if (existingCity && this.grid.distance(col, row, existingCity.col, existingCity.row) < minDistance) {
            return null;
        }
        
        // Generate city name if not provided
        if (!name) {
            name = this.cityManager.getNextCityName(civilization.id);
        }
        
        // Create city
        const city = new City(name, civilization, col, row);
        city.founded = this.currentTurn;
        
        // Set as capital if first city
        if (!civilization.capital) {
            civilization.capital = city;
        }
        
        this.cityManager.addCity(city);
        
        // Update visibility around city
        this.updateCityVisibility(city);
        
        return city;
    }
    
    getCity(cityId) {
        return this.cityManager.getCity(cityId);
    }
    
    getCityAt(col, row) {
        return this.cityManager.getCityAt(col, row);
    }
    
    getCitiesByCivilization(civId) {
        return this.cityManager.getCitiesByCivilization(civId);
    }
    
    getCities() {
        return this.cityManager.getAllCities();
    }
    
    findNearestCity(col, row) {
        const cities = this.getCities();
        let nearest = null;
        let minDistance = Infinity;
        
        for (const city of cities) {
            const distance = this.grid.distance(col, row, city.col, city.row);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = city;
            }
        }
        
        return nearest;
    }
    
    // Civilization management
    addCivilization(civilization) {
        this.civilizations.set(civilization.id, civilization);
        civilization.gameMap = this; // Reference back to game map
        
        // Listen to civilization events
        civilization.on('defeated', (data) => {
            this.handleCivilizationDefeated(data.civilization);
        });
        
        this.emit('civilizationAdded', { civilization });
    }
    
    getCivilization(civId) {
        return this.civilizations.get(civId);
    }
    
    getAllCivilizations() {
        return Array.from(this.civilizations.values());
    }
    
    getAliveCivilizations() {
        return Array.from(this.civilizations.values()).filter(civ => civ.alive);
    }
    
    addUnitToCiv(unit) {
        const civ = unit.civilization;
        if (!civ.units.includes(unit)) {
            civ.units.push(unit);
        }
    }
    
    removeUnitFromCiv(unit) {
        const civ = unit.civilization;
        const index = civ.units.indexOf(unit);
        if (index !== -1) {
            civ.units.splice(index, 1);
        }
        
        // Check if civilization is defeated
        civ.checkDefeat();
    }
    
    addCityToCiv(city) {
        const civ = city.civilization;
        if (!civ.cities.includes(city)) {
            civ.cities.push(city);
        }
    }
    
    removeCityFromCiv(city) {
        const civ = city.civilization;
        const index = civ.cities.indexOf(city);
        if (index !== -1) {
            civ.cities.splice(index, 1);
        }
        
        // Check if civilization is defeated
        civ.checkDefeat();
    }
    
    handleCivilizationDefeated(civilization) {
        this.emit('civilizationDefeated', { civilization });
        
        // Check for game end conditions
        const aliveCivs = this.getAliveCivilizations();
        if (aliveCivs.length <= 1) {
            this.emit('gameEnd', { winner: aliveCivs[0] || null });
        }
    }
    
    // Visibility and exploration
    updateVisibility(unit) {
        const sightRange = 2; // Base sight range
        const visibleTiles = this.grid.getHexesInRange(unit.col, unit.row, sightRange);
        
        for (const tilePos of visibleTiles) {
            const tile = this.getTile(tilePos.col, tilePos.row);
            if (tile) {
                tile.setVisibility(unit.civilization.id, true);
                tile.setExplored(unit.civilization.id, true);
            }
        }
    }
    
    updateCityVisibility(city) {
        const sightRange = 2; // Cities can see 2 tiles away
        const visibleTiles = this.grid.getHexesInRange(city.col, city.row, sightRange);
        
        for (const tilePos of visibleTiles) {
            const tile = this.getTile(tilePos.col, tilePos.row);
            if (tile) {
                tile.setVisibility(city.civilization.id, true);
                tile.setExplored(city.civilization.id, true);
            }
        }
    }
    
    // Turn management
    nextTurn() {
        // End current civilization's turn
        if (this.activeCivilization) {
            this.activeCivilization.endTurn();
            this.unitManager.endTurnForCivilization(this.activeCivilization.id);
        }
        
        // Get next civilization
        const aliveCivs = this.getAliveCivilizations();
        if (aliveCivs.length === 0) return;
        
        const currentIndex = this.activeCivilization ? 
            aliveCivs.findIndex(civ => civ.id === this.activeCivilization.id) : -1;
        
        const nextIndex = (currentIndex + 1) % aliveCivs.length;
        
        // If we've cycled through all civilizations, advance turn
        if (nextIndex === 0 && this.activeCivilization) {
            this.currentTurn++;
            this.currentYear = GameUtils.turnToYear(this.currentTurn);
            
            // Process all cities
            this.processCityTurns();
            
            this.emit('newTurn', { 
                turn: this.currentTurn, 
                year: this.currentYear 
            });
        }
        
        // Start next civilization's turn
        this.activeCivilization = aliveCivs[nextIndex];
        this.activeCivilization.startTurn(this, this.currentTurn);
        this.unitManager.startTurnForCivilization(this.activeCivilization.id);
        
        this.emit('civilizationTurnStarted', { 
            civilization: this.activeCivilization,
            turn: this.currentTurn
        });
    }
    
    processCityTurns() {
        // Process each civilization's cities
        for (const civilization of this.civilizations.values()) {
            if (!civilization.alive) continue;
            
            this.cityManager.processTurnForCivilization(
                civilization.id, 
                this, 
                this.currentTurn
            );
        }
    }
    
    // Game initialization
    static createGame(options = {}) {
        const {
            mapWidth = CONSTANTS.MAP_WIDTH,
            mapHeight = CONSTANTS.MAP_HEIGHT,
            civilizations = ['romans', 'babylonians', 'germans', 'egyptians'],
            humanPlayer = 'romans',
            seed = null
        } = options;
        
        // Create map
        const gameMap = new GameMap(mapWidth, mapHeight, seed);
        
        // Add civilizations
        const civs = [];
        for (let i = 0; i < civilizations.length; i++) {
            const civTemplate = CIVILIZATION_TEMPLATES[civilizations[i]];
            if (!civTemplate) continue;
            
            const isHuman = civilizations[i] === humanPlayer;
            const civilization = new Civilization(
                civilizations[i],
                civTemplate.name,
                civTemplate.leaderName,
                civTemplate.color,
                isHuman
            );
            
            gameMap.addCivilization(civilization);
            civs.push(civilization);
        }
        
        // Place starting positions
        gameMap.placeStartingPositions(civs);
        
        // Start first turn
        if (civs.length > 0) {
            gameMap.activeCivilization = civs[0];
            gameMap.activeCivilization.startTurn(gameMap, 1);
            gameMap.unitManager.startTurnForCivilization(gameMap.activeCivilization.id);
        }
        
        return gameMap;
    }
    
    placeStartingPositions(civilizations) {
        const startingPositions = this.findStartingPositions(civilizations.length);
        
        for (let i = 0; i < civilizations.length; i++) {
            const civ = civilizations[i];
            const pos = startingPositions[i];
            
            if (pos) {
                // Found city
                const cityName = CITY_NAMES[civ.id] ? CITY_NAMES[civ.id][0] : 'Capital';
                const city = this.foundCity(pos.col, pos.row, civ, cityName);
                
                // Create starting units
                const settler = new Unit(CONSTANTS.UNIT_TYPES.SETTLER, civ, pos.col, pos.row);
                const warrior = new Unit(CONSTANTS.UNIT_TYPES.MILITIA, civ, pos.col, pos.row);
                
                // Move warrior to adjacent tile if possible
                const neighbors = this.grid.getNeighbors(pos.col, pos.row);
                for (const neighbor of neighbors) {
                    const tile = this.getTile(neighbor.col, neighbor.row);
                    if (tile && tile.terrain !== CONSTANTS.TERRAIN.OCEAN) {
                        warrior.col = neighbor.col;
                        warrior.row = neighbor.row;
                        break;
                    }
                }
                
                this.addUnit(settler);
                this.addUnit(warrior);
            }
        }
    }
    
    findStartingPositions(count) {
        const positions = [];
        const minDistance = 10; // Minimum distance between starting positions
        const maxAttempts = 1000;
        
        for (let civIndex = 0; civIndex < count; civIndex++) {
            let attempt = 0;
            let found = false;
            
            while (attempt < maxAttempts && !found) {
                const col = MathUtils.randomInt(5, this.width - 5);
                const row = MathUtils.randomInt(5, this.height - 5);
                
                const tile = this.getTile(col, row);
                if (!tile || tile.terrain === CONSTANTS.TERRAIN.OCEAN || 
                    tile.terrain === CONSTANTS.TERRAIN.MOUNTAINS) {
                    attempt++;
                    continue;
                }
                
                // Check distance from other starting positions
                let tooClose = false;
                for (const existingPos of positions) {
                    if (this.grid.distance(col, row, existingPos.col, existingPos.row) < minDistance) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    positions.push({ col, row });
                    found = true;
                }
                
                attempt++;
            }
            
            // If we couldn't find a good spot, just place randomly
            if (!found) {
                let col, row;
                do {
                    col = MathUtils.randomInt(0, this.width - 1);
                    row = MathUtils.randomInt(0, this.height - 1);
                } while (this.getTile(col, row)?.terrain === CONSTANTS.TERRAIN.OCEAN);
                
                positions.push({ col, row });
            }
        }
        
        return positions;
    }
    
    // Save/Load functionality
    serialize() {
        return {
            width: this.width,
            height: this.height,
            seed: this.seed,
            currentTurn: this.currentTurn,
            currentYear: this.currentYear,
            activeCivilizationId: this.activeCivilization?.id,
            tiles: this.tiles.map(row => 
                row.map(tile => ({
                    col: tile.col,
                    row: tile.row,
                    terrain: tile.terrain,
                    improvements: tile.improvements,
                    resources: tile.resources,
                    visibility: tile.visibility,
                    explored: tile.explored,
                    pollution: tile.pollution
                }))
            ),
            civilizations: Array.from(this.civilizations.values()).map(civ => ({
                // Civilization serialization would go here
                id: civ.id,
                name: civ.name,
                // ... other properties
            })),
            units: this.getAllUnits().map(unit => unit.serialize()),
            cities: this.getCities().map(city => city.serialize())
        };
    }
    
    // Game information for UI
    getGameInfo() {
        return {
            currentTurn: this.currentTurn,
            currentYear: this.currentYear,
            activeCivilization: this.activeCivilization?.getInfo(),
            civilizations: Array.from(this.civilizations.values()).map(civ => civ.getInfo()),
            totalCities: this.getCities().length,
            totalUnits: this.getAllUnits().length
        };
    }
}