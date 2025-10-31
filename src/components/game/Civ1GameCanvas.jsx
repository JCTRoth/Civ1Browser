import React, { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { gameStateAtom, mapAtom, cameraAtom } from '../../stores/gameStore';

const Civ1GameCanvas = ({ minimap = false, onExamineHex }) => {
  const canvasRef = useRef(null);
  const [gameState] = useAtom(gameStateAtom);
  const [mapData] = useAtom(mapAtom);
  const [camera, setCamera] = useAtom(cameraAtom);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [selectedHex, setSelectedHex] = useState({ col: 5, row: 5 });
  const [contextMenu, setContextMenu] = useState(null);
  const [terrain, setTerrain] = useState(null);
  const animationFrameRef = useRef(null);
  const renderTimeoutRef = useRef(null);

  // Hex grid constants
  const HEX_SIZE = 32;
  const HEX_WIDTH = HEX_SIZE * Math.sqrt(3);
  const HEX_HEIGHT = HEX_SIZE * 2;
  const VERT_DISTANCE = HEX_HEIGHT * 0.75;

  // Terrain types and colors (classic Civ1 style)
  const TERRAIN_TYPES = {
    OCEAN: { color: '#4169E1', char: '~', name: 'Ocean' },
    PLAINS: { color: '#90EE90', char: '=', name: 'Plains' },
    GRASSLAND: { color: '#32CD32', char: '"', name: 'Grassland' },
    FOREST: { color: '#228B22', char: '♦', name: 'Forest' },
    HILLS: { color: '#8FBC8F', char: '^', name: 'Hills' },
    MOUNTAINS: { color: '#696969', char: '▲', name: 'Mountains' },
    DESERT: { color: '#F4A460', char: '~', name: 'Desert' },
    TUNDRA: { color: '#B0C4DE', char: '.', name: 'Tundra' },
    ARCTIC: { color: '#F0F8FF', char: '*', name: 'Arctic' },
    RIVER: { color: '#0000FF', char: '~', name: 'River' }
  };

  // Generate terrain map (initialize once)
  const generateTerrain = (width, height) => {
    if (terrain) return terrain; // Return cached terrain
    
    const newTerrain = [];
    for (let row = 0; row < height; row++) {
      newTerrain[row] = [];
      for (let col = 0; col < width; col++) {
        // Create varied terrain with some logic
        const distance = Math.sqrt((col - width/2) ** 2 + (row - height/2) ** 2);
        const noise = Math.sin(col * 0.1) * Math.cos(row * 0.1);
        
        let terrainType;
        if (distance > width * 0.4) {
          terrainType = 'OCEAN';
        } else if (noise > 0.5) {
          terrainType = 'FOREST';
        } else if (noise > 0.2) {
          terrainType = 'HILLS';
        } else if (noise < -0.3) {
          terrainType = 'MOUNTAINS';
        } else {
          terrainType = Math.random() > 0.5 ? 'PLAINS' : 'GRASSLAND';
        }
        
        newTerrain[row][col] = {
          type: terrainType,
          hasRiver: Math.random() < 0.1 && terrainType !== 'OCEAN',
          hasRoad: false,
          improvement: null,
          city: null,
          unit: null
        };
      }
    }

    // Add some cities
    newTerrain[5][5] = { ...newTerrain[5][5], city: { name: 'Washington', size: 3, owner: 0 } };
    newTerrain[8][12] = { ...newTerrain[8][12], city: { name: 'New York', size: 2, owner: 0 } };
    newTerrain[15][8] = { ...newTerrain[15][8], city: { name: 'Boston', size: 1, owner: 0 } };

    // Add some units
    newTerrain[6][6] = { ...newTerrain[6][6], unit: { type: 'Archer', owner: 0, moves: 1 } };
    newTerrain[7][5] = { ...newTerrain[7][5], unit: { type: 'Warrior', owner: 0, moves: 1 } };

    return newTerrain;
  };

  // Initialize terrain once
  useEffect(() => {
    if (!terrain) {
      setTerrain(generateTerrain(mapData.width, mapData.height));
    }
  }, [mapData.width, mapData.height]);

  // Convert hex coordinates to screen position
  const hexToScreen = (col, row) => {
    const x = (HEX_WIDTH * (col + 0.5 * (row & 1)) - camera.x) * camera.zoom;
    const y = (VERT_DISTANCE * row - camera.y) * camera.zoom;
    return { x, y };
  };

  // Convert screen position to hex coordinates (improved accuracy)
  const screenToHex = (screenX, screenY) => {
    // Adjust for camera position and zoom
    const worldX = (screenX / camera.zoom) + camera.x;
    const worldY = (screenY / camera.zoom) + camera.y;
    
    // Axial to cube coordinate conversion for hexagons
    const q = (worldX * (2/3)) / HEX_SIZE;
    const r = ((-worldX / 3) + (Math.sqrt(3)/3) * worldY) / HEX_SIZE;
    
    // Convert to offset coordinates
    let col = Math.round(q);
    let row = Math.round(r + q / 2);
    
    // Alternative accurate method using vertical distance
    const approxRow = worldY / VERT_DISTANCE;
    const approxCol = (worldX - (HEX_WIDTH * 0.5 * (Math.floor(approxRow) & 1))) / HEX_WIDTH;
    
    col = Math.round(approxCol);
    row = Math.round(approxRow);
    
    // Clamp to map bounds
    col = Math.max(0, Math.min(mapData.width - 1, col));
    row = Math.max(0, Math.min(mapData.height - 1, row));
    
    return { col, row };
  };

  // Draw hexagon
  const drawHex = (ctx, centerX, centerY, size, fillColor, strokeColor = '#000') => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = centerX + size * Math.cos(angle);
      const y = centerY + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  // Draw terrain symbols
  const drawTerrainSymbol = (ctx, centerX, centerY, terrain) => {
    const terrainInfo = TERRAIN_TYPES[terrain.type];
    if (!terrainInfo) return;

    ctx.fillStyle = '#000';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw terrain character
    ctx.fillText(terrainInfo.char, centerX, centerY - 8);
    
    // Draw improvements
    if (terrain.hasRiver) {
      ctx.fillStyle = '#0066FF';
      ctx.fillText('~', centerX + 8, centerY + 8);
    }
    
    if (terrain.hasRoad) {
      ctx.fillStyle = '#8B4513';
      ctx.fillText('═', centerX, centerY + 12);
    }
  };

  // Draw city
  const drawCity = (ctx, centerX, centerY, city) => {
    // City background
    ctx.fillStyle = city.owner === 0 ? '#FFD700' : '#FF6347';
    ctx.fillRect(centerX - 12, centerY - 12, 24, 24);
    
    // City border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(centerX - 12, centerY - 12, 24, 24);
    
    // City symbol
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏛️', centerX, centerY);
    
    // City name
    ctx.font = '10px monospace';
    ctx.fillStyle = '#000';
    ctx.fillText(city.name, centerX, centerY + 20);
    
    // City size
    ctx.fillStyle = '#FFF';
    ctx.fillText(city.size.toString(), centerX + 10, centerY - 10);
  };

  // Draw unit
  const drawUnit = (ctx, centerX, centerY, unit) => {
    // Unit background
    ctx.fillStyle = unit.owner === 0 ? '#4169E1' : '#DC143C';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
    ctx.fill();
    
    // Unit border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Unit symbol
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const unitSymbols = {
      'Archer': '🏹',
      'Warrior': '⚔️',
      'Settler': '👨‍🌾',
      'Trireme': '🚢'
    };
    
    ctx.fillText(unitSymbols[unit.type] || '⚔️', centerX, centerY);
  };

  // Render minimap
  const renderMinimap = (ctx, canvas) => {
    const minimapWidth = canvas.width;
    const minimapHeight = canvas.height;
    
    // Calculate pixel size per tile
    const tileWidth = minimapWidth / mapData.width;
    const tileHeight = minimapHeight / mapData.height;
    
    // Draw all terrain as colored pixels
    for (let row = 0; row < mapData.height; row++) {
      for (let col = 0; col < mapData.width; col++) {
        const tile = terrain[row]?.[col];
        if (!tile) continue;
        
        const terrainInfo = TERRAIN_TYPES[tile.type];
        ctx.fillStyle = terrainInfo.color;
        ctx.fillRect(
          col * tileWidth,
          row * tileHeight,
          tileWidth + 1,
          tileHeight + 1
        );
        
        // Draw cities as bright dots
        if (tile.city) {
          ctx.fillStyle = tile.city.owner === 0 ? '#FFD700' : '#FF6347';
          ctx.fillRect(
            col * tileWidth,
            row * tileHeight,
            tileWidth * 2,
            tileHeight * 2
          );
        }
        
        // Draw units as small dots
        if (tile.unit) {
          ctx.fillStyle = tile.unit.owner === 0 ? '#FFFFFF' : '#FF0000';
          ctx.fillRect(
            col * tileWidth + tileWidth/3,
            row * tileHeight + tileHeight/3,
            tileWidth/3,
            tileHeight/3
          );
        }
      }
    }
    
    // Draw viewport rectangle
    const viewportStartCol = Math.floor(camera.x / HEX_WIDTH);
    const viewportStartRow = Math.floor(camera.y / VERT_DISTANCE);
    const viewportWidth = Math.ceil(canvas.width / camera.zoom / HEX_WIDTH);
    const viewportHeight = Math.ceil(canvas.height / camera.zoom / VERT_DISTANCE);
    
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      viewportStartCol * tileWidth,
      viewportStartRow * tileHeight,
      viewportWidth * tileWidth,
      viewportHeight * tileHeight
    );
    
    // Draw border around minimap
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, minimapWidth, minimapHeight);
  };

  // Render the map (optimized with throttling)
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Set canvas size only if changed
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    
    // Clear canvas
    ctx.fillStyle = '#000080'; // Ocean blue background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Use cached terrain
    if (!terrain) return;
    
    // Minimap rendering
    if (minimap) {
      renderMinimap(ctx, canvas);
      return;
    }
    
    // Calculate visible bounds for culling (performance optimization)
    const startCol = Math.max(0, Math.floor(camera.x / HEX_WIDTH) - 2);
    const endCol = Math.min(mapData.width, Math.ceil((camera.x + canvas.width / camera.zoom) / HEX_WIDTH) + 2);
    const startRow = Math.max(0, Math.floor(camera.y / VERT_DISTANCE) - 2);
    const endRow = Math.min(mapData.height, Math.ceil((camera.y + canvas.height / camera.zoom) / VERT_DISTANCE) + 2);
    
    // Draw hexes (only visible ones)
    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const { x, y } = hexToScreen(col, row);
        
        // Additional viewport check
        if (x < -HEX_SIZE * 2 || x > canvas.width + HEX_SIZE * 2 || 
            y < -HEX_SIZE * 2 || y > canvas.height + HEX_SIZE * 2) {
          continue;
        }
        
        const tile = terrain[row]?.[col];
        if (!tile) continue;
        
        const terrainInfo = TERRAIN_TYPES[tile.type];
        const isSelected = selectedHex.col === col && selectedHex.row === row;
        
        // Draw hex background
        drawHex(
          ctx, 
          x, 
          y, 
          HEX_SIZE * camera.zoom, 
          terrainInfo.color,
          isSelected ? '#FF0000' : '#333'
        );
        
        // Draw terrain details only at reasonable zoom levels
        if (camera.zoom > 0.5) {
          drawTerrainSymbol(ctx, x, y, tile);
        }
        
        // Draw city
        if (tile.city && camera.zoom > 0.3) {
          drawCity(ctx, x, y, tile.city);
        }
        
        // Draw unit
        if (tile.unit && camera.zoom > 0.3) {
          drawUnit(ctx, x, y, tile.unit);
        }
        
        // Draw coordinates only when zoomed in
        if (camera.zoom > 1.5) {
          ctx.fillStyle = '#000';
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${col},${row}`, x, y + HEX_SIZE + 10);
        }
      }
    }
    
    // Draw selected hex info
    if (selectedHex && terrain) {
      const tile = terrain[selectedHex.row]?.[selectedHex.col];
      if (tile) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(10, 10, 200, 80);
        
        ctx.fillStyle = '#FFF';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Hex: ${selectedHex.col}, ${selectedHex.row}`, 15, 25);
        ctx.fillText(`Terrain: ${TERRAIN_TYPES[tile.type]?.name}`, 15, 40);
        if (tile.city) ctx.fillText(`City: ${tile.city.name}`, 15, 55);
        if (tile.unit) ctx.fillText(`Unit: ${tile.unit.type}`, 15, 70);
        if (tile.hasRiver) ctx.fillText(`🌊 River`, 15, 85);
      }
    }
  };

  // Handle mouse events
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      
      setCamera(prev => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom
      }));
      
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleClick = (e) => {
    if (!isDragging) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Minimap click - jump to location
      if (minimap) {
        const canvas = canvasRef.current;
        const tileWidth = canvas.width / mapData.width;
        const tileHeight = canvas.height / mapData.height;
        
        const clickedCol = Math.floor(x / tileWidth);
        const clickedRow = Math.floor(y / tileHeight);
        
        // Center camera on clicked position
        setCamera(prev => ({
          ...prev,
          x: clickedCol * HEX_WIDTH - (canvas.width / prev.zoom) / 2,
          y: clickedRow * VERT_DISTANCE - (canvas.height / prev.zoom) / 2
        }));
      } else {
        const hex = screenToHex(x, y);
        setSelectedHex(hex);
        setContextMenu(null); // Hide context menu on left click
      }
    }
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hex = screenToHex(x, y);
    
    if (!terrain) return;
    const tile = terrain[hex.row]?.[hex.col];
    if (!tile) return;

    // Generate context menu options based on tile content
    const menuOptions = [];

    // Basic terrain actions
    if (tile.type !== 'OCEAN' && tile.type !== 'MOUNTAINS') {
      if (!tile.hasRoad) {
        menuOptions.push({
          label: '🛣️ Build Road',
          action: 'buildRoad',
          enabled: true,
          description: 'Construct a road to improve movement'
        });
      }
      
      if (tile.type === 'PLAINS' || tile.type === 'GRASSLAND') {
        if (!tile.improvement) {
          menuOptions.push({
            label: '🌾 Irrigate',
            action: 'irrigate',
            enabled: true,
            description: 'Increase food production'
          });
        }
      }
      
      if (tile.type === 'HILLS' || tile.type === 'MOUNTAINS') {
        if (!tile.improvement) {
          menuOptions.push({
            label: '⛏️ Mine',
            action: 'mine',
            enabled: true,
            description: 'Increase shield production'
          });
        }
      }
    }

    // Unit actions
    if (tile.unit && tile.unit.owner === 0) {
      menuOptions.push({
        label: `⚔️ ${tile.unit.type} Orders`,
        action: 'unitOrders',
        enabled: true,
        submenu: [
          { label: '🏰 Fortify', action: 'fortify' },
          { label: '👁️ Sentry', action: 'sentry' },
          { label: '💤 Skip Turn', action: 'skipTurn' },
          { label: '🏠 Go to Home City', action: 'goHome' }
        ]
      });
      
      if (tile.unit.type === 'Settler') {
        menuOptions.push({
          label: '🏙️ Build City',
          action: 'buildCity',
          enabled: !tile.city && tile.type !== 'OCEAN',
          description: 'Found a new city here'
        });
      }
    }

    // City actions
    if (tile.city && tile.city.owner === 0) {
      menuOptions.push({
        label: `🏛️ ${tile.city.name}`,
        action: 'cityOrders',
        enabled: true,
        submenu: [
          { label: '🏭 Production', action: 'viewProduction' },
          { label: '👥 Citizens', action: 'viewCitizens' },
          { label: '📊 Info', action: 'cityInfo' },
          { label: '🏗️ Buy Building', action: 'buyBuilding' }
        ]
      });
    }

    // General actions
    menuOptions.push({
      label: '📍 Center View',
      action: 'centerView',
      enabled: true,
      description: 'Center camera on this tile'
    });

    if (tile.type !== 'OCEAN') {
      menuOptions.push({
        label: '🔍 Examine Terrain',
        action: 'examineHex',
        enabled: true,
        description: 'Get detailed terrain information'
      });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hex: hex,
      tile: tile,
      options: menuOptions
    });
  };

  const executeContextAction = (action, data = null) => {
    console.log(`Executing action: ${action}`, data);
    
    if (!terrain) return;

    switch (action) {
      case 'buildRoad':
        // Update terrain to add road
        const newTerrain = [...terrain];
        newTerrain[contextMenu.hex.row][contextMenu.hex.col].hasRoad = true;
        setTerrain(newTerrain);
        break;
        
      case 'irrigate':
        // Add irrigation improvement
        const irrigatedTerrain = [...terrain];
        irrigatedTerrain[contextMenu.hex.row][contextMenu.hex.col].improvement = 'irrigation';
        setTerrain(irrigatedTerrain);
        break;
        
      case 'mine':
        // Add mine improvement
        const minedTerrain = [...terrain];
        minedTerrain[contextMenu.hex.row][contextMenu.hex.col].improvement = 'mine';
        setTerrain(minedTerrain);
        break;
        
      case 'buildCity':
        // Build a new city
        const cityTerrain = [...terrain];
        cityTerrain[contextMenu.hex.row][contextMenu.hex.col].city = {
          name: 'New City',
          size: 1,
          owner: 0
        };
        // Remove the settler unit
        cityTerrain[contextMenu.hex.row][contextMenu.hex.col].unit = null;
        setTerrain(cityTerrain);
        break;
        
      case 'centerView':
        // Center camera on selected hex
        const { x, y } = hexToScreen(contextMenu.hex.col, contextMenu.hex.row);
        setCamera(prev => ({
          ...prev,
          x: contextMenu.hex.col * HEX_WIDTH - canvasRef.current.width / 2,
          y: contextMenu.hex.row * VERT_DISTANCE - canvasRef.current.height / 2
        }));
        break;
        
      case 'fortify':
      case 'sentry':
      case 'skipTurn':
      case 'goHome':
        // Unit order actions
        console.log(`Unit ${contextMenu.tile.unit?.type} executing: ${action}`);
        break;
        
      case 'viewProduction':
      case 'viewCitizens':
      case 'cityInfo':
      case 'buyBuilding':
        // City management actions
        console.log(`City ${contextMenu.tile.city?.name} action: ${action}`);
        break;
        
      case 'examineHex':
        // Show detailed hex information modal
        if (onExamineHex) {
          onExamineHex(contextMenu.hex, terrain);
        }
        break;
    }
    
    setContextMenu(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    
    // Smoother zoom with smaller increments
    const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.max(0.3, Math.min(2.5, camera.zoom * zoomFactor));
    
    // Get mouse position for zoom centering
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate world position before zoom
    const worldXBefore = (mouseX / camera.zoom) + camera.x;
    const worldYBefore = (mouseY / camera.zoom) + camera.y;
    
    // Calculate world position after zoom
    const worldXAfter = (mouseX / newZoom) + camera.x;
    const worldYAfter = (mouseY / newZoom) + camera.y;
    
    // Adjust camera to keep mouse position stable
    setCamera(prev => ({
      ...prev,
      zoom: newZoom,
      x: prev.x - (worldXAfter - worldXBefore),
      y: prev.y - (worldYAfter - worldYBefore)
    }));
  };

  // Optimized animation loop with frame throttling
  useEffect(() => {
    let lastFrameTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    
    const animate = (currentTime) => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      // Throttle rendering to target FPS
      const elapsed = currentTime - lastFrameTime;
      if (elapsed > frameInterval) {
        lastFrameTime = currentTime - (elapsed % frameInterval);
        render();
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [camera, selectedHex, mapData, terrain]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  return (
    <div className="position-relative w-100 h-100">
      <canvas
        ref={canvasRef}
        className="w-100 h-100"
        style={{ cursor: minimap ? 'pointer' : (isDragging ? 'grabbing' : 'grab') }}
        onMouseDown={minimap ? null : handleMouseDown}
        onMouseMove={minimap ? null : handleMouseMove}
        onMouseUp={minimap ? null : handleMouseUp}
        onClick={handleClick}
        onContextMenu={minimap ? null : handleRightClick}
        onWheel={minimap ? null : handleWheel}
      />
      
      {/* Context Menu (not shown on minimap) */}
      {!minimap && contextMenu && (
        <div
          className="position-fixed bg-dark border border-light text-white"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
            minWidth: '200px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-secondary p-2 border-bottom border-light">
            <strong>
              {contextMenu.tile.city ? `${contextMenu.tile.city.name}` : 
               contextMenu.tile.unit ? `${contextMenu.tile.unit.type}` :
               `${TERRAIN_TYPES[contextMenu.tile.type]?.name}`}
            </strong>
            <div style={{ fontSize: '10px', opacity: 0.8 }}>
              ({contextMenu.hex.col}, {contextMenu.hex.row})
            </div>
          </div>
          
          {contextMenu.options.map((option, index) => (
            <div key={index}>
              <button
                className={`btn btn-sm w-100 text-start border-0 rounded-0 ${
                  option.enabled ? 'btn-dark text-white' : 'btn-secondary text-muted'
                }`}
                disabled={!option.enabled}
                onClick={() => option.submenu ? null : executeContextAction(option.action)}
                style={{ fontSize: '11px' }}
              >
                {option.label}
                {option.submenu && ' ▶'}
              </button>
              
              {option.submenu && (
                <div className="ms-3 border-start border-secondary">
                  {option.submenu.map((subOption, subIndex) => (
                    <button
                      key={subIndex}
                      className="btn btn-sm btn-dark text-white w-100 text-start border-0 rounded-0"
                      onClick={() => executeContextAction(subOption.action)}
                      style={{ fontSize: '10px', paddingLeft: '20px' }}
                    >
                      {subOption.label}
                    </button>
                  ))}
                </div>
              )}
              
              {option.description && (
                <div className="px-2 py-1 bg-info text-dark" style={{ fontSize: '9px' }}>
                  {option.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Civ1GameCanvas;