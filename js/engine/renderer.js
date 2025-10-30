// Rendering Engine
class Renderer {
    constructor(canvas, miniMapCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.miniMapCanvas = miniMapCanvas;
        this.miniMapCtx = miniMapCanvas.getContext('2d');
        
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1
        };
        
        this.grid = null;
        this.selectedHex = null;
        this.highlightedHexes = [];
        
        this.setupCanvas();
    }
    
    setupCanvas() {
        // Set up main canvas
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        // Set up mini-map canvas
        this.miniMapCanvas.width = this.miniMapCanvas.offsetWidth;
        this.miniMapCanvas.height = this.miniMapCanvas.offsetHeight;
        
        // Enable crisp pixel rendering
        this.ctx.imageSmoothingEnabled = false;
        this.miniMapCtx.imageSmoothingEnabled = false;
        
        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        if (dpr > 1) {
            this.canvas.width *= dpr;
            this.canvas.height *= dpr;
            this.ctx.scale(dpr, dpr);
            
            this.miniMapCanvas.width *= dpr;
            this.miniMapCanvas.height *= dpr;
            this.miniMapCtx.scale(dpr, dpr);
        }
    }
    
    setGrid(grid) {
        this.grid = grid;
    }
    
    // Main render function
    render(gameMap, units, cities) {
        this.clearCanvas();
        
        if (!this.grid || !gameMap) return;
        
        // Calculate visible area
        const visibleArea = this.getVisibleArea();
        
        // Render terrain
        this.renderTerrain(gameMap, visibleArea);
        
        // Render grid lines
        this.renderGridLines(visibleArea);
        
        // Render cities
        this.renderCities(cities, visibleArea);
        
        // Render units
        this.renderUnits(units, visibleArea);
        
        // Render selection and highlights
        this.renderSelection();
        this.renderHighlights();
        
        // Render mini-map
        this.renderMiniMap(gameMap, units, cities);
    }
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    getVisibleArea() {
        const margin = 2; // Add margin to ensure smooth scrolling
        
        const startCol = Math.max(0, Math.floor(-this.camera.x / (this.grid.hexWidth * this.camera.zoom)) - margin);
        const endCol = Math.min(this.grid.width - 1, 
            Math.ceil((this.canvas.width - this.camera.x) / (this.grid.hexWidth * this.camera.zoom)) + margin);
        
        const startRow = Math.max(0, Math.floor(-this.camera.y / (this.grid.vertDistance * this.camera.zoom)) - margin);
        const endRow = Math.min(this.grid.height - 1, 
            Math.ceil((this.canvas.height - this.camera.y) / (this.grid.vertDistance * this.camera.zoom)) + margin);
        
        return { startCol, endCol, startRow, endRow };
    }
    
    renderTerrain(gameMap, visibleArea) {
        for (let row = visibleArea.startRow; row <= visibleArea.endRow; row++) {
            for (let col = visibleArea.startCol; col <= visibleArea.endCol; col++) {
                if (!this.grid.isValidHex(col, row)) continue;
                
                const tile = gameMap.getTile(col, row);
                if (!tile) continue;
                
                this.drawHex(col, row, tile.terrain);
            }
        }
    }
    
    renderGridLines(visibleArea) {
        this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        this.ctx.lineWidth = 1;
        
        for (let row = visibleArea.startRow; row <= visibleArea.endRow; row++) {
            for (let col = visibleArea.startCol; col <= visibleArea.endCol; col++) {
                if (!this.grid.isValidHex(col, row)) continue;
                
                this.drawHexOutline(col, row);
            }
        }
    }
    
    renderCities(cities, visibleArea) {
        if (!cities) return;
        
        cities.forEach(city => {
            if (this.isHexVisible(city.col, city.row, visibleArea)) {
                this.drawCity(city);
            }
        });
    }
    
    renderUnits(units, visibleArea) {
        if (!units) return;
        
        units.forEach(unit => {
            if (this.isHexVisible(unit.col, unit.row, visibleArea)) {
                this.drawUnit(unit);
            }
        });
    }
    
    renderSelection() {
        if (this.selectedHex) {
            this.ctx.strokeStyle = CONSTANTS.COLORS.SELECTED;
            this.ctx.lineWidth = 3;
            this.drawHexOutline(this.selectedHex.col, this.selectedHex.row);
        }
    }
    
    renderHighlights() {
        if (this.highlightedHexes.length > 0) {
            this.ctx.fillStyle = 'rgba(255, 255, 128, 0.3)';
            
            this.highlightedHexes.forEach(hex => {
                this.fillHex(hex.col, hex.row);
            });
        }
    }
    
    drawHex(col, row, terrainType) {
        const terrainProps = CONSTANTS.TERRAIN_PROPS[terrainType];
        if (!terrainProps) return;
        
        this.ctx.fillStyle = terrainProps.color;
        this.fillHex(col, row);
        
        // Add texture or pattern based on terrain type
        this.addTerrainTexture(col, row, terrainType);
    }
    
    fillHex(col, row) {
        const vertices = this.getTransformedVertices(col, row);
        
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        
        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawHexOutline(col, row) {
        const vertices = this.getTransformedVertices(col, row);
        
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        
        for (let i = 1; i < vertices.length; i++) {
            this.ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        
        this.ctx.closePath();
        this.ctx.stroke();
    }
    
    getTransformedVertices(col, row) {
        const vertices = this.grid.getHexVertices(col, row);
        return vertices.map(vertex => ({
            x: (vertex.x + this.camera.x) * this.camera.zoom,
            y: (vertex.y + this.camera.y) * this.camera.zoom
        }));
    }
    
    addTerrainTexture(col, row, terrainType) {
        const center = this.worldToScreen(this.grid.hexToScreen(col, row));
        const size = this.grid.hexSize * this.camera.zoom * 0.5;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        
        switch (terrainType) {
            case CONSTANTS.TERRAIN.FOREST:
                // Draw simple trees
                for (let i = 0; i < 3; i++) {
                    const angle = (i / 3) * Math.PI * 2;
                    const x = center.x + Math.cos(angle) * size * 0.3;
                    const y = center.y + Math.sin(angle) * size * 0.3;
                    
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
                    this.ctx.fill();
                }
                break;
                
            case CONSTANTS.TERRAIN.HILLS:
                // Draw hill bumps
                this.ctx.beginPath();
                this.ctx.arc(center.x - size * 0.2, center.y, size * 0.3, 0, Math.PI, true);
                this.ctx.arc(center.x + size * 0.2, center.y, size * 0.3, 0, Math.PI, true);
                this.ctx.fill();
                break;
                
            case CONSTANTS.TERRAIN.MOUNTAINS:
                // Draw mountain peaks
                this.ctx.beginPath();
                this.ctx.moveTo(center.x - size * 0.3, center.y + size * 0.2);
                this.ctx.lineTo(center.x, center.y - size * 0.3);
                this.ctx.lineTo(center.x + size * 0.3, center.y + size * 0.2);
                this.ctx.fill();
                break;
        }
    }
    
    drawUnit(unit) {
        const center = this.worldToScreen(this.grid.hexToScreen(unit.col, unit.row));
        const size = this.grid.hexSize * this.camera.zoom * 0.6;
        
        // Unit background
        this.ctx.fillStyle = unit.civilization.color;
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, size, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Unit border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Unit type indicator (simple shape for now)
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `${size * 0.8}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const unitChar = this.getUnitCharacter(unit.type);
        this.ctx.fillText(unitChar, center.x, center.y);
        
        // Health bar
        if (unit.health < unit.maxHealth) {
            this.drawHealthBar(center.x, center.y - size - 5, size * 1.5, unit.health / unit.maxHealth);
        }
    }
    
    getUnitCharacter(unitType) {
        const chars = {
            [CONSTANTS.UNIT_TYPES.SETTLER]: 'S',
            [CONSTANTS.UNIT_TYPES.MILITIA]: 'M',
            [CONSTANTS.UNIT_TYPES.PHALANX]: 'P',
            [CONSTANTS.UNIT_TYPES.LEGION]: 'L',
            [CONSTANTS.UNIT_TYPES.CATAPULT]: 'C',
            [CONSTANTS.UNIT_TYPES.TRIREME]: 'T',
            [CONSTANTS.UNIT_TYPES.CAVALRY]: 'H',
            [CONSTANTS.UNIT_TYPES.CHARIOT]: 'R'
        };
        return chars[unitType] || '?';
    }
    
    drawCity(city) {
        const center = this.worldToScreen(this.grid.hexToScreen(city.col, city.row));
        const size = this.grid.hexSize * this.camera.zoom * 0.8;
        
        // City background
        this.ctx.fillStyle = city.civilization.color;
        this.ctx.fillRect(center.x - size, center.y - size, size * 2, size * 2);
        
        // City border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(center.x - size, center.y - size, size * 2, size * 2);
        
        // City name
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `${size * 0.3}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(city.name, center.x, center.y + size + 15);
        
        // Population indicator
        this.ctx.fillText(`Pop: ${city.population}`, center.x, center.y);
    }
    
    drawHealthBar(x, y, width, healthPercent) {
        const height = 4;
        
        // Background
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(x - width/2, y, width, height);
        
        // Health
        this.ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : 
                           healthPercent > 0.25 ? '#ff0' : '#f00';
        this.ctx.fillRect(x - width/2, y, width * healthPercent, height);
        
        // Border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x - width/2, y, width, height);
    }
    
    isHexVisible(col, row, visibleArea) {
        return col >= visibleArea.startCol && col <= visibleArea.endCol &&
               row >= visibleArea.startRow && row <= visibleArea.endRow;
    }
    
    worldToScreen(worldPos) {
        return {
            x: (worldPos.x + this.camera.x) * this.camera.zoom,
            y: (worldPos.y + this.camera.y) * this.camera.zoom
        };
    }
    
    screenToWorld(screenPos) {
        return {
            x: screenPos.x / this.camera.zoom - this.camera.x,
            y: screenPos.y / this.camera.zoom - this.camera.y
        };
    }
    
    setCamera(x, y, zoom) {
        this.camera.x = x;
        this.camera.y = y;
        this.camera.zoom = MathUtils.clamp(zoom, 0.5, 3.0);
    }
    
    moveCamera(deltaX, deltaY) {
        this.camera.x += deltaX;
        this.camera.y += deltaY;
    }
    
    zoomCamera(delta, centerX, centerY) {
        const oldZoom = this.camera.zoom;
        const newZoom = MathUtils.clamp(oldZoom + delta, 0.5, 3.0);
        
        if (newZoom !== oldZoom) {
            // Zoom towards the center point
            const worldCenter = this.screenToWorld({ x: centerX, y: centerY });
            this.camera.zoom = newZoom;
            const newWorldCenter = this.screenToWorld({ x: centerX, y: centerY });
            
            this.camera.x += newWorldCenter.x - worldCenter.x;
            this.camera.y += newWorldCenter.y - worldCenter.y;
        }
    }
    
    setSelectedHex(col, row) {
        this.selectedHex = (col !== null && row !== null) ? { col, row } : null;
    }
    
    setHighlightedHexes(hexes) {
        this.highlightedHexes = hexes || [];
    }
    
    renderMiniMap(gameMap, units, cities) {
        const miniCtx = this.miniMapCtx;
        const miniWidth = this.miniMapCanvas.width;
        const miniHeight = this.miniMapCanvas.height;
        
        // Clear mini-map
        miniCtx.clearRect(0, 0, miniWidth, miniHeight);
        miniCtx.fillStyle = '#1a1a1a';
        miniCtx.fillRect(0, 0, miniWidth, miniHeight);
        
        if (!gameMap) return;
        
        // Scale factors
        const scaleX = miniWidth / this.grid.width;
        const scaleY = miniHeight / this.grid.height;
        
        // Draw terrain
        for (let row = 0; row < this.grid.height; row++) {
            for (let col = 0; col < this.grid.width; col++) {
                const tile = gameMap.getTile(col, row);
                if (!tile) continue;
                
                const terrainProps = CONSTANTS.TERRAIN_PROPS[tile.terrain];
                miniCtx.fillStyle = terrainProps.color;
                miniCtx.fillRect(col * scaleX, row * scaleY, scaleX, scaleY);
            }
        }
        
        // Draw cities
        if (cities) {
            miniCtx.fillStyle = '#fff';
            cities.forEach(city => {
                miniCtx.fillRect(
                    city.col * scaleX - 1, 
                    city.row * scaleY - 1, 
                    3, 3
                );
            });
        }
        
        // Draw viewport indicator
        miniCtx.strokeStyle = '#ff0';
        miniCtx.lineWidth = 1;
        
        const viewX = (-this.camera.x / this.grid.hexWidth) * scaleX;
        const viewY = (-this.camera.y / this.grid.vertDistance) * scaleY;
        const viewW = (this.canvas.width / (this.grid.hexWidth * this.camera.zoom)) * scaleX;
        const viewH = (this.canvas.height / (this.grid.vertDistance * this.camera.zoom)) * scaleY;
        
        miniCtx.strokeRect(viewX, viewY, viewW, viewH);
    }
}