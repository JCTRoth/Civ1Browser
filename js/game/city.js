// City System
class City extends EventEmitter {
    constructor(name, civilization, col, row) {
        super();
        
        this.id = GameUtils.generateId();
        this.name = name;
        this.civilization = civilization;
        this.col = col;
        this.row = row;
        
        // City stats
        this.population = 1;
        this.maxPopulation = 4; // Base limit, increased by buildings
        this.food = 0;
        this.production = 0;
        this.trade = 0;
        this.science = 0;
        this.gold = 0;
        
        // Storage
        this.foodStorage = 10;
        this.maxFoodStorage = 20;
        
        // Buildings and improvements
        this.buildings = new Set();
        this.buildQueue = [];
        this.currentProduction = null;
        this.productionProgress = 0;
        
        // Working tiles
        this.workingTiles = new Set();
        this.assignedTiles = new Map(); // tile -> specialist type
        
        // City state
        this.founded = 0; // Turn when city was founded
        this.happiness = 50;
        this.unhappiness = 0;
        this.disorder = false;
        
        // Initialize with city center
        this.workingTiles.add(`${col},${row}`);
    }
    
    // Process city turn
    processTurn(gameMap, turn) {
        // Calculate yields from worked tiles
        this.calculateYields(gameMap);
        
        // Process food
        this.processFood();
        
        // Process production
        this.processProduction();
        
        // Calculate happiness
        this.calculateHappiness();
        
        // Update city state
        this.updateCityState();
        
        this.emit('turnProcessed', { city: this, turn });
    }
    
    // Calculate yields from all worked tiles
    calculateYields(gameMap) {
        let totalFood = 0;
        let totalProduction = 0;
        let totalTrade = 0;
        
        for (const tileKey of this.workingTiles) {
            const [col, row] = tileKey.split(',').map(Number);
            const tile = gameMap.getTile(col, row);
            
            if (tile) {
                const yields = tile.getYields();
                totalFood += yields.food;
                totalProduction += yields.production;
                totalTrade += yields.trade;
            }
        }
        
        // Apply building bonuses
        totalFood = this.applyBuildingBonuses('food', totalFood);
        totalProduction = this.applyBuildingBonuses('production', totalProduction);
        totalTrade = this.applyBuildingBonuses('trade', totalTrade);
        
        // Calculate derived values
        this.food = totalFood;
        this.production = totalProduction;
        this.trade = totalTrade;
        
        // Split trade between gold and science
        this.gold = Math.floor(totalTrade * 0.5);
        this.science = Math.floor(totalTrade * 0.5);
        
        // Apply building effects to gold and science
        this.gold = this.applyBuildingBonuses('gold', this.gold);
        this.science = this.applyBuildingBonuses('science', this.science);
    }
    
    // Apply building bonuses to yields
    applyBuildingBonuses(yieldType, baseYield) {
        let modifiedYield = baseYield;
        
        for (const buildingType of this.buildings) {
            const building = CONSTANTS.BUILDING_PROPS[buildingType];
            if (!building || !building.effects) continue;
            
            switch (yieldType) {
                case 'food':
                    if (building.effects.foodBonus) {
                        modifiedYield = Math.floor(modifiedYield * (1 + building.effects.foodBonus));
                    }
                    break;
                case 'production':
                    if (building.effects.productionBonus) {
                        modifiedYield = Math.floor(modifiedYield * (1 + building.effects.productionBonus));
                    }
                    break;
                case 'trade':
                    if (building.effects.tradeBonus) {
                        modifiedYield = Math.floor(modifiedYield * (1 + building.effects.tradeBonus));
                    }
                    break;
                case 'gold':
                    if (building.effects.goldBonus) {
                        modifiedYield = Math.floor(modifiedYield * (1 + building.effects.goldBonus));
                    }
                    break;
                case 'science':
                    if (building.effects.scienceBonus) {
                        modifiedYield = Math.floor(modifiedYield * (1 + building.effects.scienceBonus));
                    }
                    break;
            }
        }
        
        return modifiedYield;
    }
    
    // Process food consumption and growth
    processFood() {
        const foodNeeded = this.population * 2;
        const foodSurplus = this.food - foodNeeded;
        
        if (foodSurplus > 0) {
            // City is growing
            this.foodStorage += foodSurplus;
            
            const growthThreshold = this.getGrowthThreshold();
            if (this.foodStorage >= growthThreshold && this.population < this.maxPopulation) {
                this.grow();
            }
        } else if (foodSurplus < 0) {
            // City is starving
            this.foodStorage += foodSurplus; // Will be negative
            
            if (this.foodStorage < 0) {
                this.starve();
            }
        }
        
        // Clamp food storage
        this.foodStorage = MathUtils.clamp(this.foodStorage, 0, this.maxFoodStorage);
    }
    
    // Get food needed to grow to next population level
    getGrowthThreshold() {
        return this.population * 10;
    }
    
    // Grow city population
    grow() {
        this.population++;
        this.foodStorage = 0;
        
        // Update max population based on buildings
        this.updateMaxPopulation();
        
        // Automatically assign new citizen to work best available tile
        this.autoAssignWorker();
        
        this.emit('grown', { city: this, newPopulation: this.population });
    }
    
    // Handle starvation
    starve() {
        if (this.population > 1) {
            this.population--;
            this.foodStorage = 0;
            
            // Remove a worker from the least productive tile
            this.removeWorker();
            
            this.emit('starved', { city: this, newPopulation: this.population });
        }
    }
    
    // Process production
    processProduction() {
        if (!this.currentProduction) {
            this.selectNextProduction();
        }
        
        if (this.currentProduction) {
            this.productionProgress += this.production;
            
            const cost = this.getProductionCost(this.currentProduction);
            if (this.productionProgress >= cost) {
                this.completeProduction();
            }
        }
    }
    
    // Get cost of production item
    getProductionCost(item) {
        if (item.type === 'unit') {
            return CONSTANTS.UNIT_PROPS[item.unitType].cost;
        } else if (item.type === 'building') {
            return CONSTANTS.BUILDING_PROPS[item.buildingType].cost;
        }
        return 0;
    }
    
    // Complete current production
    completeProduction() {
        const item = this.currentProduction;
        const excessProduction = this.productionProgress - this.getProductionCost(item);
        
        if (item.type === 'unit') {
            this.createUnit(item.unitType);
        } else if (item.type === 'building') {
            this.addBuilding(item.buildingType);
        }
        
        // Reset production
        this.currentProduction = null;
        this.productionProgress = excessProduction; // Carry over excess
        
        this.emit('productionCompleted', { city: this, item });
        
        // Start next production
        this.selectNextProduction();
    }
    
    // Select next production from queue
    selectNextProduction() {
        if (this.buildQueue.length > 0) {
            this.currentProduction = this.buildQueue.shift();
        }
    }
    
    // Create unit in city
    createUnit(unitType) {
        const unit = new Unit(unitType, this.civilization, this.col, this.row);
        
        // Find adjacent tile if city center is occupied
        const gameMap = this.civilization.gameMap;
        const existingUnit = gameMap.getUnitAt(this.col, this.row);
        
        if (existingUnit) {
            const neighbors = gameMap.grid.getNeighbors(this.col, this.row);
            for (const neighbor of neighbors) {
                if (!gameMap.getUnitAt(neighbor.col, neighbor.row)) {
                    unit.col = neighbor.col;
                    unit.row = neighbor.row;
                    break;
                }
            }
        }
        
        gameMap.addUnit(unit);
        this.emit('unitCreated', { city: this, unit });
        
        return unit;
    }
    
    // Add building to city
    addBuilding(buildingType) {
        if (this.hasBuilding(buildingType)) {
            return false; // Already has this building
        }
        
        this.buildings.add(buildingType);
        this.updateMaxPopulation();
        this.updateBuildingEffects(buildingType);
        
        this.emit('buildingAdded', { city: this, buildingType });
        
        return true;
    }
    
    // Check if city has building
    hasBuilding(buildingType) {
        return this.buildings.has(buildingType);
    }
    
    // Update max population based on buildings
    updateMaxPopulation() {
        this.maxPopulation = 4; // Base
        
        if (this.hasBuilding(CONSTANTS.BUILDINGS.AQUEDUCT)) {
            this.maxPopulation = 8;
        }
        
        // Add other population-affecting buildings
    }
    
    // Update building effects
    updateBuildingEffects(buildingType) {
        const building = CONSTANTS.BUILDING_PROPS[buildingType];
        if (!building || !building.effects) return;
        
        // Apply immediate effects
        if (building.effects.maxPopulation) {
            this.maxPopulation = Math.max(this.maxPopulation, building.effects.maxPopulation);
        }
    }
    
    // Calculate city happiness
    calculateHappiness() {
        this.happiness = 50; // Base happiness
        this.unhappiness = 0;
        
        // Population unhappiness
        if (this.population > 4) {
            this.unhappiness += (this.population - 4) * 10;
        }
        
        // Building happiness bonuses
        for (const buildingType of this.buildings) {
            const building = CONSTANTS.BUILDING_PROPS[buildingType];
            if (building && building.effects && building.effects.happiness) {
                this.happiness += building.effects.happiness * 10;
            }
        }
        
        // Check for disorder
        this.disorder = this.unhappiness > this.happiness;
    }
    
    // Update city state based on calculations
    updateCityState() {
        if (this.disorder) {
            // No production or growth during disorder
            this.production = 0;
            this.food = Math.max(0, this.food - 1);
        }
    }
    
    // Get available tiles for working
    getAvailableTiles(gameMap) {
        const availableTiles = [];
        const cityRadius = 2;
        
        // Get all tiles within city radius
        const tilesInRange = gameMap.grid.getHexesInRange(this.col, this.row, cityRadius);
        
        for (const tilePos of tilesInRange) {
            const tile = gameMap.getTile(tilePos.col, tilePos.row);
            if (!tile) continue;
            
            const tileKey = `${tilePos.col},${tilePos.row}`;
            
            // Skip if already worked by this or another city
            if (this.workingTiles.has(tileKey)) continue;
            if (this.isWorkedByOtherCity(tilePos.col, tilePos.row, gameMap)) continue;
            
            // Skip if not suitable for working
            if (tile.terrain === CONSTANTS.TERRAIN.OCEAN && !this.hasBuilding('harbor')) continue;
            
            availableTiles.push({ col: tilePos.col, row: tilePos.row, tile });
        }
        
        return availableTiles;
    }
    
    // Check if tile is worked by another city
    isWorkedByOtherCity(col, row, gameMap) {
        const cities = gameMap.getCities();
        const tileKey = `${col},${row}`;
        
        for (const city of cities) {
            if (city.id !== this.id && city.workingTiles.has(tileKey)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Automatically assign worker to best available tile
    autoAssignWorker() {
        const availableTiles = this.getAvailableTiles(this.civilization.gameMap);
        if (availableTiles.length === 0) return;
        
        // Score tiles based on yield
        const scoredTiles = availableTiles.map(tileData => {
            const yields = tileData.tile.getYields();
            const score = yields.food * 2 + yields.production + yields.trade;
            return { ...tileData, score };
        });
        
        // Sort by score and assign best tile
        scoredTiles.sort((a, b) => b.score - a.score);
        const bestTile = scoredTiles[0];
        
        this.assignWorker(bestTile.col, bestTile.row);
    }
    
    // Assign worker to specific tile
    assignWorker(col, row) {
        if (this.workingTiles.size >= this.population) {
            return false; // No available workers
        }
        
        const tileKey = `${col},${row}`;
        
        // Check if tile is available
        if (this.workingTiles.has(tileKey)) return false;
        if (this.isWorkedByOtherCity(col, row, this.civilization.gameMap)) return false;
        
        this.workingTiles.add(tileKey);
        
        this.emit('workerAssigned', { city: this, col, row });
        
        return true;
    }
    
    // Remove worker from tile
    removeWorker(col = null, row = null) {
        let tileKey;
        
        if (col !== null && row !== null) {
            tileKey = `${col},${row}`;
        } else {
            // Remove from least productive tile (excluding city center)
            const workingTiles = Array.from(this.workingTiles);
            const centerKey = `${this.col},${this.row}`;
            
            let worstTile = null;
            let worstScore = Infinity;
            
            for (const key of workingTiles) {
                if (key === centerKey) continue; // Don't remove city center
                
                const [tileCol, tileRow] = key.split(',').map(Number);
                const tile = this.civilization.gameMap.getTile(tileCol, tileRow);
                if (tile) {
                    const yields = tile.getYields();
                    const score = yields.food * 2 + yields.production + yields.trade;
                    
                    if (score < worstScore) {
                        worstScore = score;
                        worstTile = key;
                    }
                }
            }
            
            tileKey = worstTile;
        }
        
        if (tileKey && this.workingTiles.has(tileKey)) {
            this.workingTiles.delete(tileKey);
            
            const [tileCol, tileRow] = tileKey.split(',').map(Number);
            this.emit('workerRemoved', { city: this, col: tileCol, row: tileRow });
            
            return true;
        }
        
        return false;
    }
    
    // Add item to production queue
    addToQueue(item) {
        this.buildQueue.push(item);
        
        if (!this.currentProduction) {
            this.selectNextProduction();
        }
        
        this.emit('queueUpdated', { city: this, queue: this.buildQueue });
    }
    
    // Remove item from production queue
    removeFromQueue(index) {
        if (index >= 0 && index < this.buildQueue.length) {
            const removed = this.buildQueue.splice(index, 1)[0];
            this.emit('queueUpdated', { city: this, queue: this.buildQueue });
            return removed;
        }
        return null;
    }
    
    // Get city information for UI
    getInfo() {
        return {
            id: this.id,
            name: this.name,
            civilization: this.civilization.name,
            position: { col: this.col, row: this.row },
            population: this.population,
            maxPopulation: this.maxPopulation,
            food: this.food,
            production: this.production,
            trade: this.trade,
            science: this.science,
            gold: this.gold,
            foodStorage: this.foodStorage,
            maxFoodStorage: this.maxFoodStorage,
            happiness: this.happiness,
            unhappiness: this.unhappiness,
            disorder: this.disorder,
            buildings: Array.from(this.buildings),
            currentProduction: this.currentProduction,
            productionProgress: this.productionProgress,
            buildQueue: [...this.buildQueue],
            workingTiles: Array.from(this.workingTiles)
        };
    }
    
    // Serialize city for saving
    serialize() {
        return {
            id: this.id,
            name: this.name,
            civilizationId: this.civilization.id,
            col: this.col,
            row: this.row,
            population: this.population,
            food: this.food,
            foodStorage: this.foodStorage,
            buildings: Array.from(this.buildings),
            currentProduction: this.currentProduction,
            productionProgress: this.productionProgress,
            buildQueue: [...this.buildQueue],
            workingTiles: Array.from(this.workingTiles),
            founded: this.founded,
            happiness: this.happiness
        };
    }
    
    // Deserialize city from save data
    static deserialize(data, civilization) {
        const city = new City(data.name, civilization, data.col, data.row);
        city.id = data.id;
        city.population = data.population;
        city.food = data.food;
        city.foodStorage = data.foodStorage;
        city.buildings = new Set(data.buildings);
        city.currentProduction = data.currentProduction;
        city.productionProgress = data.productionProgress;
        city.buildQueue = [...data.buildQueue];
        city.workingTiles = new Set(data.workingTiles);
        city.founded = data.founded;
        city.happiness = data.happiness;
        
        city.updateMaxPopulation();
        
        return city;
    }
}

// City Names for different civilizations
const CITY_NAMES = {
    romans: ['Rome', 'Antium', 'Cumae', 'Neapolis', 'Ravenna', 'Arretium', 'Mediolanum', 'Arpinum'],
    babylonians: ['Babylon', 'Ur', 'Nineveh', 'Ashur', 'Ellipi', 'Akkad', 'Eridu', 'Kish'],
    germans: ['Berlin', 'Leipzig', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Nuremberg', 'Dresden'],
    egyptians: ['Thebes', 'Memphis', 'Oryx', 'Elephantine', 'Alexandria', 'Cairo', 'Coptos', 'Edfu'],
    americans: ['Washington', 'New York', 'Boston', 'Philadelphia', 'Atlanta', 'Chicago', 'Seattle', 'San Francisco'],
    greeks: ['Athens', 'Sparta', 'Corinth', 'Thebes', 'Argos', 'Delphi', 'Olympia', 'Mycenae'],
    indians: ['Delhi', 'Bombay', 'Madras', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Calcutta', 'Lucknow'],
    russians: ['Moscow', 'St. Petersburg', 'Kiev', 'Minsk', 'Smolensk', 'Odessa', 'Sevastopol', 'Tula'],
    zuluids: ['Zimbabwe', 'Ulundi', 'Bapedi', 'Hlobane', 'Isandhlwana', 'Intombe', 'Mpondo', 'Ngome'],
    french: ['Paris', 'Orleans', 'Lyon', 'Tours', 'Marseilles', 'Chartres', 'Avignon', 'Rouen'],
    aztecs: ['Tenochtitlan', 'Texcoco', 'Tlatelolco', 'Teotihuacan', 'Tlaxcala', 'Calixtlahuaca', 'Xochicalco', 'Tula'],
    chinese: ['Beijing', 'Shanghai', 'Guangzhou', 'Xian', 'Nanjing', 'Chengdu', 'Luoyang', 'Tianjin'],
    english: ['London', 'York', 'Nottingham', 'Hastings', 'Canterbury', 'Coventry', 'Warwick', 'Dover'],
    mongols: ['Samarkand', 'Bokhara', 'Nishapur', 'Karakorum', 'Kashgar', 'Tabriz', 'Otrar', 'Bukhara']
};

// City Manager - handles collections of cities
class CityManager extends EventEmitter {
    constructor() {
        super();
        this.cities = new Map();
        this.citiesByPosition = new Map();
        this.citiesByCivilization = new Map();
    }
    
    // Add city to manager
    addCity(city) {
        this.cities.set(city.id, city);
        this.updatePositionIndex(city);
        this.updateCivilizationIndex(city);
        
        // Listen to city events
        city.on('grown', (data) => this.emit('cityGrown', data));
        city.on('starved', (data) => this.emit('cityStarved', data));
        city.on('productionCompleted', (data) => this.emit('cityProductionCompleted', data));
        city.on('unitCreated', (data) => this.emit('cityUnitCreated', data));
        city.on('buildingAdded', (data) => this.emit('cityBuildingAdded', data));
        
        this.emit('cityAdded', { city });
    }
    
    // Remove city from manager
    removeCity(cityId) {
        const city = this.cities.get(cityId);
        if (!city) return false;
        
        this.cities.delete(cityId);
        this.removeFromPositionIndex(city);
        this.removeFromCivilizationIndex(city);
        
        this.emit('cityRemoved', { city });
        
        return true;
    }
    
    // Get city by ID
    getCity(cityId) {
        return this.cities.get(cityId);
    }
    
    // Get city at position
    getCityAt(col, row) {
        const key = `${col},${row}`;
        return this.citiesByPosition.get(key);
    }
    
    // Get cities by civilization
    getCitiesByCivilization(civilizationId) {
        return this.citiesByCivilization.get(civilizationId) || [];
    }
    
    // Get all cities
    getAllCities() {
        return Array.from(this.cities.values());
    }
    
    // Update position index
    updatePositionIndex(city) {
        const key = `${city.col},${city.row}`;
        this.citiesByPosition.set(key, city);
    }
    
    // Remove from position index
    removeFromPositionIndex(city) {
        const key = `${city.col},${city.row}`;
        this.citiesByPosition.delete(key);
    }
    
    // Update civilization index
    updateCivilizationIndex(city) {
        const civId = city.civilization.id;
        if (!this.citiesByCivilization.has(civId)) {
            this.citiesByCivilization.set(civId, []);
        }
        
        const civCities = this.citiesByCivilization.get(civId);
        if (!civCities.includes(city)) {
            civCities.push(city);
        }
    }
    
    // Remove from civilization index
    removeFromCivilizationIndex(city) {
        const civId = city.civilization.id;
        const civCities = this.citiesByCivilization.get(civId);
        
        if (civCities) {
            const index = civCities.indexOf(city);
            if (index !== -1) {
                civCities.splice(index, 1);
                
                if (civCities.length === 0) {
                    this.citiesByCivilization.delete(civId);
                }
            }
        }
    }
    
    // Process turn for all cities of civilization
    processTurnForCivilization(civilizationId, gameMap, turn) {
        const cities = this.getCitiesByCivilization(civilizationId);
        cities.forEach(city => city.processTurn(gameMap, turn));
    }
    
    // Get next city name for civilization
    getNextCityName(civilizationId) {
        const civCities = this.getCitiesByCivilization(civilizationId);
        const usedNames = new Set(civCities.map(city => city.name));
        
        const availableNames = CITY_NAMES[civilizationId] || CITY_NAMES.romans;
        
        for (const name of availableNames) {
            if (!usedNames.has(name)) {
                return name;
            }
        }
        
        // If all names used, generate numbered names
        const baseName = availableNames[0];
        let counter = 2;
        while (usedNames.has(`${baseName} ${counter}`)) {
            counter++;
        }
        
        return `${baseName} ${counter}`;
    }
}