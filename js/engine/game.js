// Main Game Engine
class Game extends EventEmitter {
    constructor() {
        super();
        
        // Game state
        this.gameMap = null;
        this.renderer = null;
        this.inputManager = null;
        this.ui = null;
        
        // Game loop
        this.running = false;
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.frameTime = 1000 / this.targetFPS;
        
        // Performance monitoring
        this.frameCount = 0;
        this.fpsDisplay = 0;
        this.lastFPSTime = 0;
    }
    
    // Initialize the game
    async initialize() {
        try {
            console.log('Initializing Civilization game...');
            
            // Get canvas elements
            const canvas = document.getElementById('gameCanvas');
            const miniMapCanvas = document.getElementById('miniMapCanvas');
            
            if (!canvas || !miniMapCanvas) {
                throw new Error('Canvas elements not found');
            }
            
            // Create game map
            this.gameMap = GameMap.createGame({
                mapWidth: CONSTANTS.MAP_WIDTH,
                mapHeight: CONSTANTS.MAP_HEIGHT,
                civilizations: ['romans', 'babylonians', 'germans', 'egyptians'],
                humanPlayer: 'romans'
            });
            
            // Initialize renderer
            this.renderer = new Renderer(canvas, miniMapCanvas);
            this.renderer.setGrid(this.gameMap.grid);
            
            // Initialize input manager
            this.inputManager = new InputManager(canvas, this.renderer, this.gameMap);
            this.setupInputEvents();
            
            // Initialize UI
            this.ui = new UIManager(this.gameMap);
            this.setupUIEvents();
            
            // Make UI globally available for onclick handlers
            window.game.ui = this.ui;
            
            // Setup game events
            this.setupGameEvents();
            
            // Center camera on human player's first city
            this.centerOnPlayerCapital();
            
            // Initialize UI display
            this.ui.update();
            
            console.log('Game initialized successfully!');
            
            this.emit('initialized');
            
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showError('Failed to initialize game: ' + error.message);
        }
    }
    
    // Setup input event handlers
    setupInputEvents() {
        // Hex clicking
        this.inputManager.on('hexClicked', (data) => {
            this.handleHexClick(data.col, data.row, data.unit, data.city);
        });
        
        this.inputManager.on('unitClicked', (data) => {
            this.ui.selectUnit(data.unit);
            this.updateSelectionHighlight();
        });
        
        this.inputManager.on('cityClicked', (data) => {
            this.ui.selectCity(data.city);
            this.updateSelectionHighlight();
        });
        
        this.inputManager.on('hexHover', (data) => {
            this.handleHexHover(data.col, data.row);
        });
        
        // Camera events
        this.inputManager.on('cameraMoved', () => {
            this.needsRender = true;
        });
        
        this.inputManager.on('zoom', () => {
            this.needsRender = true;
        });
    }
    
    // Setup UI event handlers
    setupUIEvents() {
        this.ui.on('unitSelected', (data) => {
            this.updateSelectionHighlight();
            this.showPossibleMoves(data.unit);
        });
        
        this.ui.on('citySelected', (data) => {
            this.updateSelectionHighlight();
            this.clearHighlights();
        });
        
        this.ui.on('selectionCleared', () => {
            this.clearSelectionHighlight();
            this.clearHighlights();
        });
        
        this.ui.on('centerOnUnit', (data) => {
            this.inputManager.centerOn(data.unit.col, data.unit.row);
        });
    }
    
    // Setup game event handlers
    setupGameEvents() {
        this.gameMap.on('civilizationTurnStarted', (data) => {
            console.log(`${data.civilization.name}'s turn started`);
            
            if (data.civilization.isHuman) {
                // Find first active unit for human player
                this.ui.findNextActiveUnit();
            }
            
            this.needsRender = true;
        });
        
        this.gameMap.on('newTurn', (data) => {
            console.log(`Turn ${data.turn} (${GameUtils.formatYear(data.year)})`);
            this.needsRender = true;
        });
        
        this.gameMap.on('unitMoved', (data) => {
            this.updateSelectionHighlight();
            this.needsRender = true;
        });
        
        this.gameMap.on('cityAdded', (data) => {
            this.needsRender = true;
        });
        
        this.gameMap.on('civilizationDefeated', (data) => {
            console.log(`${data.civilization.name} has been defeated!`);
        });
        
        this.gameMap.on('gameEnd', (data) => {
            this.handleGameEnd(data.winner);
        });
    }
    
    // Handle hex click
    handleHexClick(col, row, unit, city) {
        const selectedUnit = this.ui.selectedUnit;
        
        if (selectedUnit && selectedUnit.civilization.isHuman) {
            // Try to move selected unit
            if (unit && unit.civilization.id !== selectedUnit.civilization.id) {
                // Attack enemy unit
                if (selectedUnit.canAttack(unit, this.gameMap)) {
                    this.handleCombat(selectedUnit, unit);
                }
            } else {
                // Move to empty tile or friendly tile
                this.handleUnitMovement(selectedUnit, col, row);
            }
        } else if (unit) {
            // Select unit if it belongs to current player
            const activeCiv = this.gameMap.activeCivilization;
            if (unit.civilization.id === activeCiv?.id && activeCiv.isHuman) {
                this.ui.selectUnit(unit);
            }
        } else if (city) {
            // Select city if it belongs to current player
            const activeCiv = this.gameMap.activeCivilization;
            if (city.civilization.id === activeCiv?.id && activeCiv.isHuman) {
                this.ui.selectCity(city);
            }
        }
    }
    
    // Handle hex hover
    handleHexHover(col, row) {
        // Show tile information in status bar
        const tile = this.gameMap.getTile(col, row);
        if (tile) {
            const yields = tile.getYields();
            const terrainName = tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1);
            let message = `${terrainName} (${yields.food}F ${yields.production}P ${yields.trade}T)`;
            
            if (tile.resources) {
                message += ` - ${tile.resources.type}`;
            }
            
            this.ui.updateStatusMessage(message);
        }
    }
    
    // Handle unit movement
    handleUnitMovement(unit, targetCol, targetRow) {
        if (unit.moveTo(targetCol, targetRow, this.gameMap)) {
            // Movement successful
            this.showPossibleMoves(unit);
            
            // If unit has no more movement, select next unit
            if (unit.movement <= 0) {
                this.ui.findNextActiveUnit();
            }
        } else {
            this.ui.updateStatusMessage('Cannot move there');
        }
    }
    
    // Handle combat
    handleCombat(attacker, defender) {
        const result = attacker.attack(defender, this.gameMap);
        
        if (result) {
            let message = `${attacker.name} attacks ${defender.name}!`;
            
            if (defender.health <= 0) {
                message += ` ${defender.name} destroyed!`;
            }
            
            if (attacker.health <= 0) {
                message += ` ${attacker.name} destroyed!`;
                this.ui.selectUnit(null);
            }
            
            this.ui.updateStatusMessage(message);
        }
    }
    
    // Show possible moves for unit
    showPossibleMoves(unit) {
        if (!unit || !unit.civilization.isHuman) {
            this.clearHighlights();
            return;
        }
        
        const possibleMoves = unit.getPossibleMoves(this.gameMap, this.gameMap.grid);
        this.renderer.setHighlightedHexes(possibleMoves);
        this.needsRender = true;
    }
    
    // Update selection highlight
    updateSelectionHighlight() {
        const selectedUnit = this.ui.selectedUnit;
        const selectedCity = this.ui.selectedCity;
        
        if (selectedUnit) {
            this.renderer.setSelectedHex(selectedUnit.col, selectedUnit.row);
        } else if (selectedCity) {
            this.renderer.setSelectedHex(selectedCity.col, selectedCity.row);
        } else {
            this.renderer.setSelectedHex(null, null);
        }
        
        this.needsRender = true;
    }
    
    // Clear selection highlight
    clearSelectionHighlight() {
        this.renderer.setSelectedHex(null, null);
        this.needsRender = true;
    }
    
    // Clear all highlights
    clearHighlights() {
        this.renderer.setHighlightedHexes([]);
        this.needsRender = true;
    }
    
    // Center camera on player capital
    centerOnPlayerCapital() {
        const humanCiv = Array.from(this.gameMap.civilizations.values())
            .find(civ => civ.isHuman);
        
        if (humanCiv && humanCiv.capital) {
            this.inputManager.centerOn(humanCiv.capital.col, humanCiv.capital.row);
        }
    }
    
    // Handle game end
    handleGameEnd(winner) {
        if (winner) {
            console.log(`Game Over! ${winner.name} wins!`);
            this.ui.showGameEnd(winner);
        } else {
            console.log('Game Over! No winner.');
            this.ui.showGameEnd(null);
        }
    }
    
    // Start game loop
    start() {
        if (this.running) return;
        
        this.running = true;
        this.lastFrameTime = performance.now();
        this.needsRender = true;
        
        console.log('Starting game loop...');
        this.gameLoop();
    }
    
    // Stop game loop
    stop() {
        this.running = false;
        console.log('Game loop stopped');
    }
    
    // Main game loop
    gameLoop() {
        if (!this.running) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastFrameTime;
        
        // Update game logic
        this.update(deltaTime);
        
        // Render if needed
        if (this.needsRender || deltaTime >= this.frameTime) {
            this.render();
            this.needsRender = false;
            this.lastFrameTime = currentTime;
        }
        
        // Continue loop
        requestAnimationFrame(() => this.gameLoop());
    }
    
    // Update game logic
    update(deltaTime) {
        // Update keyboard input for camera movement
        if (this.inputManager) {
            this.inputManager.updateCameraMovement();
        }
        
        // Update FPS counter
        this.updateFPS(deltaTime);
    }
    
    // Render game
    render() {
        if (!this.renderer || !this.gameMap) return;
        
        try {
            const units = this.gameMap.getAllUnits();
            const cities = this.gameMap.getCities();
            
            this.renderer.render(this.gameMap, units, cities);
            
        } catch (error) {
            console.error('Render error:', error);
        }
    }
    
    // Update FPS counter
    updateFPS(deltaTime) {
        this.frameCount++;
        
        if (performance.now() - this.lastFPSTime >= 1000) {
            this.fpsDisplay = this.frameCount;
            this.frameCount = 0;
            this.lastFPSTime = performance.now();
        }
    }
    
    // Show error message
    showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        errorElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff4444;
            color: white;
            padding: 20px;
            border-radius: 5px;
            z-index: 1000;
            max-width: 400px;
            text-align: center;
        `;
        
        document.body.appendChild(errorElement);
        
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.parentNode.removeChild(errorElement);
            }
        }, 5000);
    }
    
    // Get game state for debugging
    getState() {
        return {
            running: this.running,
            fps: this.fpsDisplay,
            gameInfo: this.gameMap?.getGameInfo(),
            cameraState: this.renderer?.camera,
            selectedUnit: this.ui?.selectedUnit?.getInfo(),
            selectedCity: this.ui?.selectedCity?.getInfo()
        };
    }
    
    // Save game (placeholder)
    saveGame() {
        try {
            const gameState = this.gameMap.serialize();
            localStorage.setItem('civ1_savegame', JSON.stringify(gameState));
            this.ui.showNotification('Game saved!');
        } catch (error) {
            console.error('Save failed:', error);
            this.ui.showNotification('Save failed!', 'error');
        }
    }
    
    // Load game (placeholder)
    loadGame() {
        try {
            const saveData = localStorage.getItem('civ1_savegame');
            if (saveData) {
                // Game loading would be implemented here
                this.ui.showNotification('Load not yet implemented');
            } else {
                this.ui.showNotification('No save game found');
            }
        } catch (error) {
            console.error('Load failed:', error);
            this.ui.showNotification('Load failed!', 'error');
        }
    }
}