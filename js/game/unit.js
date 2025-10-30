// Unit System
class Unit extends EventEmitter {
    constructor(type, civilization, col, row) {
        super();
        
        this.id = GameUtils.generateId();
        this.type = type;
        this.civilization = civilization;
        this.col = col;
        this.row = row;
        
        // Initialize unit properties from constants
        const unitProps = CONSTANTS.UNIT_PROPS[type];
        if (!unitProps) {
            throw new Error(`Unknown unit type: ${type}`);
        }
        
        this.name = unitProps.name;
        this.attack = unitProps.attack;
        this.defense = unitProps.defense;
        this.maxMovement = unitProps.movement;
        this.cost = unitProps.cost;
        this.canSettle = unitProps.canSettle || false;
        this.canWork = unitProps.canWork || false;
        this.naval = unitProps.naval || false;
        
        // Current state
        this.health = 100;
        this.maxHealth = 100;
        this.movement = this.maxMovement;
        this.experience = 0;
        this.veteran = false;
        this.fortified = false;
        this.orders = null;
        this.workTurns = 0;
        this.workTarget = null;
        
        // Status flags
        this.active = true;
        this.moved = false;
    }
    
    // Move unit to new position
    moveTo(col, row, gameMap) {
        if (!this.canMoveTo(col, row, gameMap)) {
            return false;
        }
        
        const tile = gameMap.getTile(col, row);
        const moveCost = tile.getMovementCost(this);
        
        if (this.movement < moveCost) {
            return false;
        }
        
        // Store old position
        const oldCol = this.col;
        const oldRow = this.row;
        
        // Update position
        this.col = col;
        this.row = row;
        this.movement -= moveCost;
        this.moved = true;
        
        // Clear fortification
        this.fortified = false;
        
        // Emit movement event
        this.emit('moved', { 
            unit: this, 
            from: { col: oldCol, row: oldRow }, 
            to: { col, row },
            moveCost
        });
        
        return true;
    }
    
    // Check if unit can move to position
    canMoveTo(col, row, gameMap) {
        const tile = gameMap.getTile(col, row);
        if (!tile) return false;
        
        const moveCost = tile.getMovementCost(this);
        if (moveCost === Infinity) return false;
        
        // Check if there's a friendly unit already there
        const existingUnit = gameMap.getUnitAt(col, row);
        if (existingUnit && existingUnit.civilization.id === this.civilization.id) {
            return false;
        }
        
        return true;
    }
    
    // Get possible moves for this unit
    getPossibleMoves(gameMap, grid) {
        const moves = [];
        const visited = new Set();
        const queue = [{ col: this.col, row: this.row, movement: this.movement }];
        
        while (queue.length > 0) {
            const current = queue.shift();
            const key = `${current.col},${current.row}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            if (current.col !== this.col || current.row !== this.row) {
                moves.push({ col: current.col, row: current.row, moveCost: this.movement - current.movement });
            }
            
            // Get neighbors
            const neighbors = grid.getNeighbors(current.col, current.row);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.col},${neighbor.row}`;
                if (visited.has(neighborKey)) continue;
                
                if (this.canMoveTo(neighbor.col, neighbor.row, gameMap)) {
                    const tile = gameMap.getTile(neighbor.col, neighbor.row);
                    const moveCost = tile.getMovementCost(this);
                    const remainingMovement = current.movement - moveCost;
                    
                    if (remainingMovement >= 0) {
                        queue.push({ 
                            col: neighbor.col, 
                            row: neighbor.row, 
                            movement: remainingMovement 
                        });
                    }
                }
            }
        }
        
        return moves;
    }
    
    // Attack another unit
    attack(target, gameMap) {
        if (!this.canAttack(target, gameMap)) {
            return null;
        }
        
        const distance = gameMap.grid.distance(this.col, this.row, target.col, target.row);
        if (distance > 1) {
            return null; // Can only attack adjacent units
        }
        
        const result = this.resolveCombat(target, gameMap);
        
        // Apply combat results
        this.health -= result.attackerDamage;
        target.health -= result.defenderDamage;
        
        // Handle unit destruction
        if (this.health <= 0) {
            this.destroy();
        }
        
        if (target.health <= 0) {
            target.destroy();
            
            // Attacker moves into defender's tile if victorious
            if (this.health > 0) {
                this.col = target.col;
                this.row = target.row;
            }
        }
        
        // Gain experience
        this.addExperience(10);
        target.addExperience(5);
        
        // End movement for attacker
        this.movement = 0;
        this.moved = true;
        
        this.emit('attacked', { attacker: this, defender: target, result });
        
        return result;
    }
    
    // Check if this unit can attack target
    canAttack(target, gameMap) {
        if (!target || target.civilization.id === this.civilization.id) {
            return false;
        }
        
        if (this.attack === 0) {
            return false; // Non-combat units can't attack
        }
        
        const distance = gameMap.grid.distance(this.col, this.row, target.col, target.row);
        return distance <= 1;
    }
    
    // Resolve combat between this unit and target
    resolveCombat(target, gameMap) {
        let attackStrength = this.attack;
        let defenseStrength = target.defense;
        
        // Apply veteran bonuses
        if (this.veteran) attackStrength = Math.floor(attackStrength * 1.5);
        if (target.veteran) defenseStrength = Math.floor(defenseStrength * 1.5);
        
        // Apply terrain defense bonus
        const targetTile = gameMap.getTile(target.col, target.row);
        const terrainBonus = targetTile.getDefenseBonus();
        defenseStrength += terrainBonus;
        
        // Apply fortification bonus
        if (target.fortified) {
            defenseStrength = Math.floor(defenseStrength * 1.5);
        }
        
        // Apply health penalties
        const attackerHealthFactor = this.health / this.maxHealth;
        const defenderHealthFactor = target.health / target.maxHealth;
        
        attackStrength = Math.floor(attackStrength * attackerHealthFactor);
        defenseStrength = Math.floor(defenseStrength * defenderHealthFactor);
        
        // Calculate combat odds
        const totalStrength = attackStrength + defenseStrength;
        const attackerWinChance = attackStrength / totalStrength;
        
        // Determine winner
        const random = Math.random();
        const attackerWins = random < attackerWinChance;
        
        // Calculate damage
        let attackerDamage = 0;
        let defenderDamage = 0;
        
        if (attackerWins) {
            defenderDamage = Math.min(target.health, 30 + Math.floor(Math.random() * 40));
            attackerDamage = Math.floor(defenderDamage * 0.3);
        } else {
            attackerDamage = Math.min(this.health, 30 + Math.floor(Math.random() * 40));
            defenderDamage = Math.floor(attackerDamage * 0.3);
        }
        
        return {
            attackerWins,
            attackerDamage,
            defenderDamage,
            attackStrength,
            defenseStrength,
            attackerWinChance
        };
    }
    
    // Settle a city (for settler units)
    settle(gameMap) {
        if (!this.canSettle) {
            return null;
        }
        
        const tile = gameMap.getTile(this.col, this.row);
        if (!tile || !this.canSettleAt(tile, gameMap)) {
            return null;
        }
        
        // Create new city
        const city = gameMap.foundCity(this.col, this.row, this.civilization);
        
        if (city) {
            // Remove settler unit
            this.destroy();
            this.emit('settled', { unit: this, city });
        }
        
        return city;
    }
    
    // Check if unit can settle at current location
    canSettleAt(tile, gameMap) {
        if (!tile || tile.terrain === CONSTANTS.TERRAIN.OCEAN) {
            return false;
        }
        
        // Check if there's already a city nearby
        const minDistance = 2;
        const cities = gameMap.getCities();
        
        for (const city of cities) {
            const distance = gameMap.grid.distance(this.col, this.row, city.col, city.row);
            if (distance < minDistance) {
                return false;
            }
        }
        
        return true;
    }
    
    // Start working on tile improvement
    startWork(improvementType, gameMap) {
        if (!this.canWork) {
            return false;
        }
        
        const tile = gameMap.getTile(this.col, this.row);
        if (!tile || !tile.canImprove(improvementType)) {
            return false;
        }
        
        const improvementProps = CONSTANTS.IMPROVEMENT_PROPS[improvementType];
        if (!improvementProps) {
            return false;
        }
        
        this.workTarget = improvementType;
        this.workTurns = improvementProps.buildTurns;
        
        this.emit('startedWork', { unit: this, improvementType, turns: this.workTurns });
        
        return true;
    }
    
    // Continue work on current project
    doWork(gameMap) {
        if (!this.workTarget || this.workTurns <= 0) {
            return false;
        }
        
        this.workTurns--;
        
        if (this.workTurns === 0) {
            // Complete the improvement
            const tile = gameMap.getTile(this.col, this.row);
            tile.addImprovement(this.workTarget);
            
            this.emit('completedWork', { 
                unit: this, 
                improvementType: this.workTarget 
            });
            
            this.workTarget = null;
        }
        
        return true;
    }
    
    // Fortify unit for defense bonus
    fortify() {
        if (this.moved) {
            return false;
        }
        
        this.fortified = !this.fortified;
        this.movement = 0;
        
        this.emit('fortified', { unit: this, fortified: this.fortified });
        
        return true;
    }
    
    // Add experience and check for promotion
    addExperience(amount) {
        this.experience += amount;
        
        if (!this.veteran && this.experience >= 100) {
            this.veteran = true;
            this.emit('promoted', { unit: this });
        }
    }
    
    // Heal unit
    heal(amount = 10) {
        const oldHealth = this.health;
        this.health = Math.min(this.maxHealth, this.health + amount);
        
        if (this.health > oldHealth) {
            this.emit('healed', { unit: this, amount: this.health - oldHealth });
        }
    }
    
    // Destroy unit
    destroy() {
        this.active = false;
        this.emit('destroyed', { unit: this });
    }
    
    // Reset movement points for new turn
    startTurn() {
        this.movement = this.maxMovement;
        this.moved = false;
        
        // Heal if fortified or in city
        if (this.fortified) {
            this.heal(5);
        }
        
        // Continue work if working
        if (this.workTarget) {
            this.doWork();
        }
        
        this.emit('turnStarted', { unit: this });
    }
    
    // End turn for this unit
    endTurn() {
        this.movement = 0;
        this.emit('turnEnded', { unit: this });
    }
    
    // Get unit information for UI
    getInfo() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            position: { col: this.col, row: this.row },
            health: this.health,
            maxHealth: this.maxHealth,
            movement: this.movement,
            maxMovement: this.maxMovement,
            attack: this.attack,
            defense: this.defense,
            experience: this.experience,
            veteran: this.veteran,
            fortified: this.fortified,
            workTarget: this.workTarget,
            workTurns: this.workTurns,
            civilization: this.civilization.name
        };
    }
    
    // Serialize unit for saving
    serialize() {
        return {
            id: this.id,
            type: this.type,
            civilizationId: this.civilization.id,
            col: this.col,
            row: this.row,
            health: this.health,
            movement: this.movement,
            experience: this.experience,
            veteran: this.veteran,
            fortified: this.fortified,
            workTarget: this.workTarget,
            workTurns: this.workTurns,
            moved: this.moved,
            active: this.active
        };
    }
    
    // Deserialize unit from save data
    static deserialize(data, civilization) {
        const unit = new Unit(data.type, civilization, data.col, data.row);
        unit.id = data.id;
        unit.health = data.health;
        unit.movement = data.movement;
        unit.experience = data.experience;
        unit.veteran = data.veteran;
        unit.fortified = data.fortified;
        unit.workTarget = data.workTarget;
        unit.workTurns = data.workTurns;
        unit.moved = data.moved;
        unit.active = data.active;
        return unit;
    }
}

// Unit Manager - handles collections of units
class UnitManager extends EventEmitter {
    constructor() {
        super();
        this.units = new Map();
        this.unitsByPosition = new Map();
        this.unitsByCivilization = new Map();
    }
    
    // Add unit to manager
    addUnit(unit) {
        this.units.set(unit.id, unit);
        this.updatePositionIndex(unit);
        this.updateCivilizationIndex(unit);
        
        // Listen to unit events
        unit.on('moved', (data) => {
            this.updatePositionIndex(unit);
            this.emit('unitMoved', data);
        });
        
        unit.on('destroyed', (data) => {
            this.removeUnit(unit.id);
            this.emit('unitDestroyed', data);
        });
        
        this.emit('unitAdded', { unit });
    }
    
    // Remove unit from manager
    removeUnit(unitId) {
        const unit = this.units.get(unitId);
        if (!unit) return false;
        
        this.units.delete(unitId);
        this.removeFromPositionIndex(unit);
        this.removeFromCivilizationIndex(unit);
        
        this.emit('unitRemoved', { unit });
        
        return true;
    }
    
    // Get unit by ID
    getUnit(unitId) {
        return this.units.get(unitId);
    }
    
    // Get unit at position
    getUnitAt(col, row) {
        const key = `${col},${row}`;
        const unitsAtPosition = this.unitsByPosition.get(key);
        return unitsAtPosition ? unitsAtPosition[0] : null;
    }
    
    // Get all units at position
    getUnitsAt(col, row) {
        const key = `${col},${row}`;
        return this.unitsByPosition.get(key) || [];
    }
    
    // Get units by civilization
    getUnitsByCivilization(civilizationId) {
        return this.unitsByCivilization.get(civilizationId) || [];
    }
    
    // Get all units
    getAllUnits() {
        return Array.from(this.units.values());
    }
    
    // Update position index
    updatePositionIndex(unit) {
        // Remove from old position
        this.removeFromPositionIndex(unit);
        
        // Add to new position
        const key = `${unit.col},${unit.row}`;
        if (!this.unitsByPosition.has(key)) {
            this.unitsByPosition.set(key, []);
        }
        this.unitsByPosition.get(key).push(unit);
    }
    
    // Remove from position index
    removeFromPositionIndex(unit) {
        for (const [key, units] of this.unitsByPosition.entries()) {
            const index = units.indexOf(unit);
            if (index !== -1) {
                units.splice(index, 1);
                if (units.length === 0) {
                    this.unitsByPosition.delete(key);
                }
                break;
            }
        }
    }
    
    // Update civilization index
    updateCivilizationIndex(unit) {
        const civId = unit.civilization.id;
        if (!this.unitsByCivilization.has(civId)) {
            this.unitsByCivilization.set(civId, []);
        }
        
        const civUnits = this.unitsByCivilization.get(civId);
        if (!civUnits.includes(unit)) {
            civUnits.push(unit);
        }
    }
    
    // Remove from civilization index
    removeFromCivilizationIndex(unit) {
        const civId = unit.civilization.id;
        const civUnits = this.unitsByCivilization.get(civId);
        
        if (civUnits) {
            const index = civUnits.indexOf(unit);
            if (index !== -1) {
                civUnits.splice(index, 1);
                
                if (civUnits.length === 0) {
                    this.unitsByCivilization.delete(civId);
                }
            }
        }
    }
    
    // Start turn for all units of civilization
    startTurnForCivilization(civilizationId) {
        const units = this.getUnitsByCivilization(civilizationId);
        units.forEach(unit => unit.startTurn());
    }
    
    // End turn for all units of civilization
    endTurnForCivilization(civilizationId) {
        const units = this.getUnitsByCivilization(civilizationId);
        units.forEach(unit => unit.endTurn());
    }
}