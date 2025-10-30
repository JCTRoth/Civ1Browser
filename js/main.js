// Main entry point for Civilization 1 Browser Edition
let game = null;

// Initialize and start the game when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Civilization 1 - Browser Edition');
    console.log('Initializing game...');
    
    try {
        // Show loading screen
        showLoadingScreen();
        
        // Create and initialize game
        game = new Game();
        
        // Make game globally available
        window.game = game;
        
        // Initialize the game
        await game.initialize();
        
        // Hide loading screen
        hideLoadingScreen();
        
        // Start game loop
        game.start();
        
        // Show welcome message
        showWelcomeMessage();
        
        console.log('Game started successfully!');
        
    } catch (error) {
        console.error('Failed to start game:', error);
        showErrorScreen(error.message);
    }
});

// Show loading screen
function showLoadingScreen() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingScreen';
    loadingDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #654321 0%, #8B4513 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            color: #d4af37;
            font-family: Arial, sans-serif;
        ">
            <h1 style="font-size: 3em; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">
                Civilization I
            </h1>
            <h2 style="font-size: 1.5em; margin-bottom: 40px; color: #b8941f;">
                Browser Edition
            </h2>
            <div style="
                border: 3px solid #d4af37;
                border-radius: 10px;
                padding: 20px 40px;
                background: rgba(212, 175, 55, 0.1);
                font-size: 1.2em;
            ">
                Loading game assets...
            </div>
            <div style="
                margin-top: 20px;
                width: 200px;
                height: 10px;
                background: #2c1810;
                border: 1px solid #d4af37;
                border-radius: 5px;
                overflow: hidden;
            ">
                <div id="loadingBar" style="
                    height: 100%;
                    background: linear-gradient(90deg, #d4af37 0%, #b8941f 100%);
                    width: 0%;
                    transition: width 0.3s ease;
                    animation: pulse 2s infinite;
                "></div>
            </div>
        </div>
        
        <style>
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
        </style>
    `;
    
    document.body.appendChild(loadingDiv);
    
    // Simulate loading progress
    let progress = 0;
    const loadingBar = loadingDiv.querySelector('#loadingBar');
    
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
        }
        loadingBar.style.width = progress + '%';
    }, 100);
}

// Hide loading screen
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(loadingScreen);
        }, 500);
    }
}

// Show error screen
function showErrorScreen(message) {
    hideLoadingScreen();
    
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #2c1810;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            color: #ff6666;
            font-family: Arial, sans-serif;
        ">
            <h1 style="font-size: 2.5em; margin-bottom: 20px;">
                Game Error
            </h1>
            <div style="
                border: 2px solid #ff6666;
                border-radius: 10px;
                padding: 20px;
                max-width: 400px;
                text-align: center;
                background: rgba(255, 102, 102, 0.1);
            ">
                <p>${message}</p>
                <button onclick="location.reload()" style="
                    margin-top: 20px;
                    padding: 10px 20px;
                    background: #ff6666;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 1em;
                ">
                    Reload Page
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
}

// Show welcome message
function showWelcomeMessage() {
    if (game && game.ui) {
        setTimeout(() => {
            game.ui.showNotification('Welcome to Civilization! Build an empire to stand the test of time!', 'info');
        }, 1000);
    }
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (game) {
        if (document.hidden) {
            // Pause game when tab is hidden
            console.log('Game paused (tab hidden)');
        } else {
            // Resume game when tab is visible
            console.log('Game resumed (tab visible)');
            if (game.renderer) {
                game.needsRender = true;
            }
        }
    }
});

// Handle window beforeunload
window.addEventListener('beforeunload', (e) => {
    if (game && game.running) {
        // Optionally auto-save the game
        try {
            game.saveGame();
        } catch (error) {
            console.error('Failed to auto-save:', error);
        }
    }
});

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Prevent F5 refresh during game
    if (e.key === 'F5' && game && game.running) {
        e.preventDefault();
        if (confirm('Are you sure you want to reload? Unsaved progress will be lost.')) {
            location.reload();
        }
    }
    
    // F1 for help
    if (e.key === 'F1') {
        e.preventDefault();
        showHelp();
    }
    
    // Ctrl+S for save
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (game) {
            game.saveGame();
        }
    }
});

// Show help dialog
function showHelp() {
    const helpContent = `
        <h2>Civilization I - Browser Edition</h2>
        <h3>Controls:</h3>
        <ul>
            <li><strong>Mouse:</strong> Click to select units/cities, drag to move camera</li>
            <li><strong>WASD/Arrow Keys:</strong> Move camera</li>
            <li><strong>Mouse Wheel:</strong> Zoom in/out</li>
            <li><strong>Space/Enter:</strong> End turn</li>
            <li><strong>F:</strong> Fortify selected unit</li>
            <li><strong>S:</strong> Settle city (with settler)</li>
            <li><strong>W:</strong> Wait with selected unit</li>
            <li><strong>Escape:</strong> Clear selection</li>
            <li><strong>Ctrl+S:</strong> Save game</li>
            <li><strong>F1:</strong> Show this help</li>
        </ul>
        <h3>Objective:</h3>
        <p>Build cities, research technologies, create units, and expand your civilization. 
        Defeat your enemies or achieve victory through other means!</p>
        <h3>Tips:</h3>
        <ul>
            <li>Settlers can found new cities</li>
            <li>Cities automatically grow with enough food</li>
            <li>Build military units to defend your empire</li>
            <li>Research new technologies to unlock advanced units and buildings</li>
            <li>Explore the world to find resources and expansion sites</li>
        </ul>
    `;
    
    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            ${helpContent}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on click
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('close')) {
            document.body.removeChild(modal);
        }
    });
}

// Console commands for debugging
window.civ = {
    // Get game state
    state: () => game ? game.getState() : null,
    
    // Force end turn
    endTurn: () => game ? game.gameMap.nextTurn() : null,
    
    // Add gold to current civilization
    addGold: (amount) => {
        if (game && game.gameMap.activeCivilization) {
            game.gameMap.activeCivilization.gold += amount;
            game.ui.update();
        }
    },
    
    // Complete current research
    completeResearch: () => {
        if (game && game.gameMap.activeCivilization && game.gameMap.activeCivilization.currentResearch) {
            const civ = game.gameMap.activeCivilization;
            civ.completeTechnology(civ.currentResearch);
            game.ui.update();
        }
    },
    
    // Reveal map
    revealMap: () => {
        if (game && game.gameMap.activeCivilization) {
            const civ = game.gameMap.activeCivilization;
            for (let row = 0; row < game.gameMap.height; row++) {
                for (let col = 0; col < game.gameMap.width; col++) {
                    const tile = game.gameMap.getTile(col, row);
                    if (tile) {
                        tile.setExplored(civ.id, true);
                        tile.setVisibility(civ.id, true);
                    }
                }
            }
            game.needsRender = true;
        }
    },
    
    // Center on position
    centerOn: (col, row) => {
        if (game && game.inputManager) {
            game.inputManager.centerOn(col, row);
        }
    }
};

console.log('Debug commands available in console: window.civ');
console.log('Type civ.state() to see current game state');
console.log('Type civ.addGold(100) to add gold');
console.log('Type civ.revealMap() to reveal entire map');