// User Interface Manager
class UIManager extends EventEmitter {
    constructor(gameMap) {
        super();
        
        this.gameMap = gameMap;
        this.selectedUnit = null;
        this.selectedCity = null;
        this.hoveredTile = null;
        
        // UI Elements
        this.elements = {
            // Top bar
            civilizationName: DomUtils.getElementById('civilizationName'),
            currentYear: DomUtils.getElementById('currentYear'),
            turn: DomUtils.getElementById('turn'),
            gold: DomUtils.getElementById('gold'),
            science: DomUtils.getElementById('science'),
            
            // Controls
            endTurnBtn: DomUtils.getElementById('endTurnBtn'),
            menuBtn: DomUtils.getElementById('menuBtn'),
            
            // Side panel
            unitDetails: DomUtils.getElementById('unitDetails'),
            cityDetails: DomUtils.getElementById('cityDetails'),
            
            // Status bar
            statusMessage: DomUtils.getElementById('statusMessage'),
            
            // Dialogs
            cityDialog: DomUtils.getElementById('cityDialog'),
            cityDialogTitle: DomUtils.getElementById('cityDialogTitle'),
            cityDialogContent: DomUtils.getElementById('cityDialogContent')
        };
        
        this.setupEventListeners();
        this.setupGameEventListeners();
    }
    
    setupEventListeners() {
        // End turn button
        this.elements.endTurnBtn.addEventListener('click', () => {
            this.endTurn();
        });
        
        // Menu button
        this.elements.menuBtn.addEventListener('click', () => {
            this.showMenu();
        });
        
        // Close dialogs
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('close')) {
                this.closeDialogs();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });
    }
    
    setupGameEventListeners() {
        // Game events
        this.gameMap.on('civilizationTurnStarted', (data) => {
            this.updateTopBar(data.civilization);
            this.updateStatusMessage(`${data.civilization.name}'s turn`);
        });
        
        this.gameMap.on('newTurn', (data) => {
            this.updateTurnDisplay(data.turn, data.year);
        });
        
        this.gameMap.on('unitMoved', (data) => {
            this.updateUnitInfo(data.unit);
        });
        
        this.gameMap.on('cityAdded', (data) => {
            this.updateStatusMessage(`${data.city.name} founded!`);
        });
        
        this.gameMap.on('civilizationDefeated', (data) => {
            this.showNotification(`${data.civilization.name} has been defeated!`);
        });
        
        this.gameMap.on('gameEnd', (data) => {
            this.showGameEnd(data.winner);
        });
    }
    
    // Update top bar information
    updateTopBar(civilization) {
        if (!civilization) return;
        
        this.elements.civilizationName.textContent = civilization.name;
        this.elements.gold.textContent = civilization.gold;
        this.elements.science.textContent = civilization.science;
    }
    
    // Update turn and year display
    updateTurnDisplay(turn, year) {
        this.elements.turn.textContent = `Turn ${turn}`;
        this.elements.currentYear.textContent = GameUtils.formatYear(year);
    }
    
    // Update status message
    updateStatusMessage(message) {
        this.elements.statusMessage.textContent = message;
        
        // Auto-hide after delay
        setTimeout(() => {
            if (this.elements.statusMessage.textContent === message) {
                this.elements.statusMessage.textContent = '';
            }
        }, 3000);
    }
    
    // Show notification
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = DomUtils.createElement('div', {
            class: `notification ${type}`
        }, message);
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('fade-in'), 10);
        
        // Remove after delay
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 3000);
    }
    
    // Handle unit selection
    selectUnit(unit) {
        // Clear previous selection
        if (this.selectedUnit) {
            this.selectedUnit = null;
        }
        
        this.selectedUnit = unit;
        this.selectedCity = null;
        
        if (unit) {
            this.updateUnitInfo(unit);
            this.updateStatusMessage(`Selected: ${unit.name}`);
            this.emit('unitSelected', { unit });
        } else {
            this.clearUnitInfo();
        }
    }
    
    // Handle city selection
    selectCity(city) {
        // Clear previous selection
        if (this.selectedCity) {
            this.selectedCity = null;
        }
        
        this.selectedCity = city;
        this.selectedUnit = null;
        
        if (city) {
            this.updateCityInfo(city);
            this.updateStatusMessage(`Selected: ${city.name}`);
            this.emit('citySelected', { city });
        } else {
            this.clearCityInfo();
        }
    }
    
    // Update unit information panel
    updateUnitInfo(unit) {
        if (!unit) {
            this.clearUnitInfo();
            return;
        }
        
        const info = unit.getInfo();
        
        this.elements.unitDetails.innerHTML = `
            <h4>${info.name}</h4>
            <div class=\"unit-stats\">
                <div class=\"stat-row\">
                    <span>Health:</span>
                    <span>${info.health}/${info.maxHealth}</span>
                </div>
                <div class=\"stat-row\">
                    <span>Movement:</span>
                    <span>${info.movement}/${info.maxMovement}</span>
                </div>
                <div class=\"stat-row\">
                    <span>Attack:</span>
                    <span>${info.attack}</span>
                </div>
                <div class=\"stat-row\">
                    <span>Defense:</span>
                    <span>${info.defense}</span>
                </div>
                ${info.experience > 0 ? `
                <div class=\"stat-row\">
                    <span>Experience:</span>
                    <span>${info.experience}/100</span>
                </div>
                ` : ''}
                ${info.veteran ? '<div class=\"stat-row\"><strong>Veteran</strong></div>' : ''}
                ${info.fortified ? '<div class=\"stat-row\"><strong>Fortified</strong></div>' : ''}
            </div>
            <div class=\"unit-actions\">
                ${this.generateUnitActions(unit)}
            </div>
        `;
    }
    
    // Generate unit action buttons
    generateUnitActions(unit) {
        let actions = '';
        
        if (unit.canSettle) {
            actions += '<button class=\"btn btn-small\" onclick=\"game.ui.settleCity()\">Settle</button>';
        }
        
        if (unit.canWork) {
            actions += '<button class=\"btn btn-small\" onclick=\"game.ui.showWorkOptions()\">Work</button>';
        }
        
        if (!unit.fortified && !unit.moved) {
            actions += '<button class=\"btn btn-small\" onclick=\"game.ui.fortifyUnit()\">Fortify</button>';
        }
        
        if (unit.moved) {
            actions += '<button class=\"btn btn-small\" onclick=\"game.ui.waitUnit()\">Wait</button>';
        } else {
            actions += '<button class=\"btn btn-small\" onclick=\"game.ui.skipUnit()\">Skip</button>';
        }
        
        return actions;
    }
    
    // Clear unit information
    clearUnitInfo() {
        this.elements.unitDetails.innerHTML = '<p>Select a unit to view details</p>';
    }
    
    // Update city information panel
    updateCityInfo(city) {
        if (!city) {
            this.clearCityInfo();
            return;
        }
        
        const info = city.getInfo();
        
        this.elements.cityDetails.innerHTML = `
            <h4>${info.name}</h4>
            <div class=\"city-stats\">
                <div class=\"info-grid\">
                    <div class=\"info-item\">
                        <span class=\"info-label\">Population</span>
                        <span class=\"info-value\">${info.population}</span>
                    </div>
                    <div class=\"info-item\">
                        <span class=\"info-label\">Food</span>
                        <span class=\"info-value\">${info.food}</span>
                    </div>
                    <div class=\"info-item\">
                        <span class=\"info-label\">Production</span>
                        <span class=\"info-value\">${info.production}</span>
                    </div>
                    <div class=\"info-item\">
                        <span class=\"info-label\">Trade</span>
                        <span class=\"info-value\">${info.trade}</span>
                    </div>
                </div>
                
                ${info.currentProduction ? `
                <div class=\"current-production\">
                    <h5>Producing:</h5>
                    <p>${this.getProductionName(info.currentProduction)}</p>
                    <div class=\"progress-bar\">
                        <div class=\"progress-fill\" style=\"width: ${this.getProductionProgress(info)}%\"></div>
                    </div>
                </div>
                ` : ''}
                
                ${info.disorder ? '<div class=\"disorder-warning\">City in Disorder!</div>' : ''}
            </div>
            
            <div class=\"city-actions\">
                <button class=\"btn btn-small\" onclick=\"game.ui.openCityDialog()\">Manage</button>
            </div>
        `;
    }
    
    // Get production item name
    getProductionName(production) {
        if (production.type === 'unit') {
            return CONSTANTS.UNIT_PROPS[production.unitType]?.name || production.unitType;
        } else if (production.type === 'building') {
            return CONSTANTS.BUILDING_PROPS[production.buildingType]?.name || production.buildingType;
        }
        return 'Unknown';
    }
    
    // Calculate production progress percentage
    getProductionProgress(cityInfo) {
        if (!cityInfo.currentProduction) return 0;
        
        const cost = this.getProductionCost(cityInfo.currentProduction);
        return Math.min(100, (cityInfo.productionProgress / cost) * 100);
    }
    
    // Get production cost
    getProductionCost(production) {
        if (production.type === 'unit') {
            return CONSTANTS.UNIT_PROPS[production.unitType]?.cost || 0;
        } else if (production.type === 'building') {
            return CONSTANTS.BUILDING_PROPS[production.buildingType]?.cost || 0;
        }
        return 0;
    }
    
    // Clear city information
    clearCityInfo() {
        this.elements.cityDetails.innerHTML = '<p>Select a city to view details</p>';
    }
    
    // Open city management dialog
    openCityDialog() {
        if (!this.selectedCity) return;
        
        const city = this.selectedCity;
        const info = city.getInfo();
        
        this.elements.cityDialogTitle.textContent = info.name;
        this.elements.cityDialogContent.innerHTML = this.generateCityDialogContent(info);
        
        this.elements.cityDialog.classList.remove('hidden');
    }
    
    // Generate city dialog content
    generateCityDialogContent(cityInfo) {
        let content = `
            <div class=\"city-overview\">
                <div class=\"city-yields\">
                    <h3>City Yields</h3>
                    <div class=\"info-grid\">
                        <div class=\"info-item\">
                            <span class=\"info-label\">Food</span>
                            <span class=\"info-value\">${cityInfo.food}</span>
                        </div>
                        <div class=\"info-item\">
                            <span class=\"info-label\">Production</span>
                            <span class=\"info-value\">${cityInfo.production}</span>
                        </div>
                        <div class=\"info-item\">
                            <span class=\"info-label\">Trade</span>
                            <span class=\"info-value\">${cityInfo.trade}</span>
                        </div>
                        <div class=\"info-item\">
                            <span class=\"info-label\">Science</span>
                            <span class=\"info-value\">${cityInfo.science}</span>
                        </div>
                    </div>
                </div>
                
                <div class=\"city-production\">
                    <h3>Production Queue</h3>
                    ${this.generateProductionQueue(cityInfo)}
                    
                    <h4>Available Productions</h4>
                    ${this.generateAvailableProductions()}
                </div>
                
                <div class=\"city-buildings\">
                    <h3>Buildings</h3>
                    ${this.generateBuildingsList(cityInfo.buildings)}
                </div>
            </div>
        `;
        
        return content;
    }
    
    // Generate production queue display
    generateProductionQueue(cityInfo) {
        let content = '<div class=\"production-queue\">';
        
        if (cityInfo.currentProduction) {
            const progress = this.getProductionProgress(cityInfo);
            content += `
                <div class=\"production-item selected\">
                    <span>${this.getProductionName(cityInfo.currentProduction)}</span>
                    <div class=\"progress-bar\">
                        <div class=\"progress-fill\" style=\"width: ${progress}%\"></div>
                    </div>
                </div>
            `;
        }
        
        for (const item of cityInfo.buildQueue) {
            content += `
                <div class=\"production-item\">
                    <span>${this.getProductionName(item)}</span>
                    <button class=\"btn btn-small\" onclick=\"game.ui.removeFromQueue(${cityInfo.buildQueue.indexOf(item)})\">Remove</button>
                </div>
            `;
        }
        
        content += '</div>';
        return content;
    }
    
    // Generate available productions
    generateAvailableProductions() {
        const activeCiv = this.gameMap.activeCivilization;
        if (!activeCiv) return '';
        
        let content = '<div class=\"available-productions\">';
        
        // Units
        content += '<h5>Units</h5>';
        for (const [unitType, props] of Object.entries(CONSTANTS.UNIT_PROPS)) {
            if (this.canProduceUnit(unitType, activeCiv)) {
                content += `
                    <div class=\"production-option\" onclick=\"game.ui.addToQueue('unit', '${unitType}')\">
                        <span>${props.name}</span>
                        <span class=\"cost\">${props.cost}</span>
                    </div>
                `;
            }
        }
        
        // Buildings
        content += '<h5>Buildings</h5>';
        for (const [buildingType, props] of Object.entries(CONSTANTS.BUILDING_PROPS)) {
            if (this.canProduceBuilding(buildingType, activeCiv)) {
                content += `
                    <div class=\"production-option\" onclick=\"game.ui.addToQueue('building', '${buildingType}')\">
                        <span>${props.name}</span>
                        <span class=\"cost\">${props.cost}</span>
                    </div>
                `;
            }
        }
        
        content += '</div>';
        return content;
    }
    
    // Check if unit can be produced
    canProduceUnit(unitType, civilization) {
        // Check technology requirements
        // This would need to be expanded based on tech tree
        return true;
    }
    
    // Check if building can be produced
    canProduceBuilding(buildingType, civilization) {
        // Check if city already has this building
        if (this.selectedCity && this.selectedCity.hasBuilding(buildingType)) {
            return false;
        }
        
        // Check technology requirements
        // This would need to be expanded based on tech tree
        return true;
    }
    
    // Generate buildings list
    generateBuildingsList(buildings) {
        if (buildings.length === 0) {
            return '<p>No buildings constructed</p>';
        }
        
        let content = '<div class=\"buildings-list\">';
        for (const buildingType of buildings) {
            const props = CONSTANTS.BUILDING_PROPS[buildingType];
            if (props) {
                content += `
                    <div class=\"building-item\">
                        <span>${props.name}</span>
                        <span class=\"maintenance\">-${props.maintenance} gold</span>
                    </div>
                `;
            }
        }
        content += '</div>';
        
        return content;
    }
    
    // Close dialogs
    closeDialogs() {
        this.elements.cityDialog.classList.add('hidden');
    }
    
    // Handle keyboard input
    handleKeyboard(event) {
        // Prevent default for game keys
        const gameKeys = ['Space', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (gameKeys.includes(event.code)) {
            event.preventDefault();
        }
        
        switch (event.code) {
            case 'Space':
            case 'Enter':
                this.endTurn();
                break;
            case 'Escape':
                this.closeDialogs();
                this.clearSelection();
                break;
            case 'KeyF':
                if (this.selectedUnit && !this.selectedUnit.moved) {
                    this.fortifyUnit();
                }
                break;
            case 'KeyS':
                if (this.selectedUnit && this.selectedUnit.canSettle) {
                    this.settleCity();
                }
                break;
            case 'KeyW':
                if (this.selectedUnit) {
                    this.waitUnit();
                }
                break;
        }
    }
    
    // Unit action methods
    settleCity() {
        if (this.selectedUnit && this.selectedUnit.canSettle) {
            const city = this.selectedUnit.settle(this.gameMap);
            if (city) {
                this.selectCity(city);
                this.updateStatusMessage(`${city.name} founded!`);
            } else {
                this.updateStatusMessage('Cannot settle here');
            }
        }
    }
    
    fortifyUnit() {
        if (this.selectedUnit && !this.selectedUnit.moved) {
            this.selectedUnit.fortify();
            this.updateUnitInfo(this.selectedUnit);
            this.updateStatusMessage(`${this.selectedUnit.name} fortified`);
        }
    }
    
    waitUnit() {
        if (this.selectedUnit) {
            this.selectedUnit.endTurn();
            this.findNextActiveUnit();
        }
    }
    
    skipUnit() {
        if (this.selectedUnit) {
            this.selectedUnit.movement = 0;
            this.findNextActiveUnit();
        }
    }
    
    // Find next unit that can act
    findNextActiveUnit() {
        const activeCiv = this.gameMap.activeCivilization;
        if (!activeCiv || !activeCiv.isHuman) return;
        
        const units = this.gameMap.getUnitsByCivilization(activeCiv.id);
        const activeUnits = units.filter(unit => 
            unit.active && unit.movement > 0 && !unit.moved
        );
        
        if (activeUnits.length > 0) {
            this.selectUnit(activeUnits[0]);
            this.emit('centerOnUnit', { unit: activeUnits[0] });
        } else {
            this.selectUnit(null);
        }
    }
    
    // Add item to city production queue
    addToQueue(type, itemType) {
        if (!this.selectedCity) return;
        
        const item = { type };
        if (type === 'unit') {
            item.unitType = itemType;
        } else if (type === 'building') {
            item.buildingType = itemType;
        }
        
        this.selectedCity.addToQueue(item);
        
        // Refresh dialog
        this.openCityDialog();
    }
    
    // Remove item from production queue
    removeFromQueue(index) {
        if (!this.selectedCity) return;
        
        this.selectedCity.removeFromQueue(index);
        
        // Refresh dialog
        this.openCityDialog();
    }
    
    // End turn
    endTurn() {
        this.gameMap.nextTurn();
        this.clearSelection();
        
        // If it's still human player's turn, select first active unit
        if (this.gameMap.activeCivilization?.isHuman) {
            this.findNextActiveUnit();
        }
    }
    
    // Clear all selections
    clearSelection() {
        this.selectUnit(null);
        this.selectCity(null);
        this.emit('selectionCleared');
    }
    
    // Show menu
    showMenu() {
        // This would show a game menu with save/load/settings options
        this.showNotification('Menu not yet implemented');
    }
    
    // Show work options for worker units
    showWorkOptions() {
        if (!this.selectedUnit || !this.selectedUnit.canWork) return;
        
        // This would show available improvements to build
        this.showNotification('Work options not yet implemented');
    }
    
    // Show game end screen
    showGameEnd(winner) {
        const message = winner ? 
            `${winner.name} has won the game!` : 
            'The game has ended!';
        
        this.showNotification(message, 'victory');
    }
    
    // Update all UI elements
    update() {
        const activeCiv = this.gameMap.activeCivilization;
        if (activeCiv) {
            this.updateTopBar(activeCiv);
        }
        
        this.updateTurnDisplay(this.gameMap.currentTurn, this.gameMap.currentYear);
        
        if (this.selectedUnit) {
            this.updateUnitInfo(this.selectedUnit);
        }
        
        if (this.selectedCity) {
            this.updateCityInfo(this.selectedCity);
        }
    }
}

// Make UI actions available globally for onclick handlers
window.game = window.game || {};
window.game.ui = null; // Will be set when UI is initialized