import React, { useRef, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { CONSTANTS } from '../../utils/constants';

// Top-level evaluation marker for debugging whether this module is actually loaded by Vite/React
if (typeof window !== 'undefined') {
  window.__MINIMAP_FILE_EVALUATED = (window.__MINIMAP_FILE_EVALUATED || 0) + 1;
  // Only log first few times to avoid spam
  if (window.__MINIMAP_FILE_EVALUATED < 5) {
    console.log('[MiniMap] Module evaluated count:', window.__MINIMAP_FILE_EVALUATED);
  }
}

const MiniMap = ({ gameEngine }) => {
  const canvasRef = useRef(null);
  const camera = useGameStore(state => state.camera);
  const actions = useGameStore(state => state.actions);

  const MINIMAP_WIDTH = 200;
  const MINIMAP_HEIGHT = 150;

  // Render minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // Use gameEngine.map directly for latest visibility data (like main canvas)
    const dataSource = gameEngine ? gameEngine.map : null;

    if (!dataSource) {
      return;
    }
    if (!dataSource.tiles || !dataSource.tiles.length) {
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width = MINIMAP_WIDTH;
    canvas.height = MINIMAP_HEIGHT;

    // Clear canvas
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Calculate scale factors
    const scaleX = MINIMAP_WIDTH / dataSource.width;
    const scaleY = MINIMAP_HEIGHT / dataSource.height;

    // Draw terrain tiles with visibility/exploration shading
    let drawn = 0;
    for (let row = 0; row < dataSource.height; row++) {
      for (let col = 0; col < dataSource.width; col++) {
        const tileIndex = row * dataSource.width + col;
        const tile = dataSource.tiles[tileIndex];
        if (!tile) continue;

        const x = col * scaleX;
        const y = row * scaleY;

        const typeKey = (tile.type || '').toLowerCase();
  const terrainProps = CONSTANTS.TERRAIN_PROPS[typeKey];
        if (!terrainProps && !window.__MINIMAP_MISSED_TYPE_REPORTED) {
          console.warn('[MiniMap] Missing terrain props for type:', tile.type);
          window.__MINIMAP_MISSED_TYPE_REPORTED = true;
        }
        let baseColor = terrainProps ? terrainProps.color : '#555555';

        // Apply fog of war shading
        if (!tile.explored) {
          // Show unexplored as dark grey so the map isn't a solid black rectangle
          baseColor = '#111111';
        } else if (tile.explored && !tile.visible) {
          // Darken explored but not currently visible
          // Simple darkening: blend with black
            const c = baseColor.replace('#','');
            if (c.length === 6) {
              const r = parseInt(c.substring(0,2),16)*0.4;
              const g = parseInt(c.substring(2,4),16)*0.4;
              const b = parseInt(c.substring(4,6),16)*0.4;
              baseColor = `rgb(${r|0},${g|0},${b|0})`;
            }
        }

        ctx.fillStyle = baseColor;
        ctx.fillRect(x, y, scaleX+1, scaleY+1); // +1 to avoid gaps at low scale
        drawn++;
      }
    }

    if (drawn === 0) {
      console.warn('[MiniMap] Drew 0 terrain tiles.');
    } else if (!window.__MINIMAP_DRAWN_ONCE) {
      console.log('[MiniMap] Drew', drawn, 'tiles on minimap.');
      window.__MINIMAP_DRAWN_ONCE = true;
    }

    // Draw cities
    if (gameEngine) {
      const cities = gameEngine.getAllCities();
      ctx.fillStyle = '#ffff00';
      
      for (const city of cities) {
        const x = city.col * scaleX;
        const y = city.row * scaleY;
        
        ctx.beginPath();
        ctx.arc(x + scaleX/2, y + scaleY/2, Math.max(1, scaleX/3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw units (simplified)
    if (gameEngine) {
      const units = gameEngine.getAllUnits();
      
      for (const unit of units) {
        const x = unit.col * scaleX;
        const y = unit.row * scaleY;
        
        // Different colors for different players
        if (unit.civilizationId === 0) {
          ctx.fillStyle = '#00ff00'; // Player units in green
        } else {
          ctx.fillStyle = '#ff0000'; // AI units in red
        }
        
        ctx.fillRect(x, y, Math.max(1, scaleX/2), Math.max(1, scaleY/2));
      }
    }

    // Draw viewport indicator
  const viewportX = (camera.x / (dataSource.width * 32)) * MINIMAP_WIDTH;
  const viewportY = (camera.y / (dataSource.height * 24)) * MINIMAP_HEIGHT;
  const viewportW = (window.innerWidth / camera.zoom / (dataSource.width * 32)) * MINIMAP_WIDTH;
  const viewportH = (window.innerHeight / camera.zoom / (dataSource.height * 24)) * MINIMAP_HEIGHT;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.max(0, viewportX),
      Math.max(0, viewportY),
      Math.min(MINIMAP_WIDTH - viewportX, viewportW),
      Math.min(MINIMAP_HEIGHT - viewportY, viewportH)
    );

  }, [camera, gameEngine, gameEngine?.map?.tiles?.length, gameEngine?.currentTurn, gameEngine?.isInitialized]);

  // Handle minimap clicks to move camera
  const handleMinimapClick = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert minimap coordinates to world coordinates
    const worldX = (x / MINIMAP_WIDTH) * gameEngine.map.width * 32;
    const worldY = (y / MINIMAP_HEIGHT) * gameEngine.map.height * 24;

    // Center camera on clicked position
    actions.updateCamera({
      x: worldX - (window.innerWidth / camera.zoom) / 2,
      y: worldY - (window.innerHeight / camera.zoom) / 2
    });
  };

  return (
    <div className="minimap-container">
      <canvas
        ref={canvasRef}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        className="border border-secondary"
        style={{ 
          width: '100%', 
          height: '100%',
          cursor: 'pointer',
          imageRendering: 'pixelated' 
        }}
        onClick={handleMinimapClick}
      />
    </div>
  );
};

export default MiniMap;