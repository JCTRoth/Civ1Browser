import React, { useRef, useEffect } from 'react';
import { useAtom } from 'jotai';
import { mapAtom, cameraAtom, gameActionsAtom } from '../../stores/gameStore';
import { TERRAIN_PROPS } from '../../utils/constants';

const MiniMap = ({ gameEngine }) => {
  const canvasRef = useRef(null);
  const [map] = useAtom(mapAtom);
  const [camera] = useAtom(cameraAtom);
  const [, gameActions] = useAtom(gameActionsAtom);

  const MINIMAP_WIDTH = 200;
  const MINIMAP_HEIGHT = 150;

  // Render minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map.tiles.length) return;

    const ctx = canvas.getContext('2d');
    canvas.width = MINIMAP_WIDTH;
    canvas.height = MINIMAP_HEIGHT;

    // Clear canvas
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Calculate scale factors
    const scaleX = MINIMAP_WIDTH / map.width;
    const scaleY = MINIMAP_HEIGHT / map.height;

    // Draw terrain tiles
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const tileIndex = row * map.width + col;
        const tile = map.tiles[tileIndex];
        
        if (tile) {
          const x = col * scaleX;
          const y = row * scaleY;
          
          // Get terrain color
          const terrainProps = TERRAIN_PROPS[tile.type];
          ctx.fillStyle = terrainProps ? terrainProps.color : '#333333';
          
          // Draw tile as small rectangle
          ctx.fillRect(x, y, scaleX, scaleY);
        }
      }
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
    const viewportX = (camera.x / (map.width * 32)) * MINIMAP_WIDTH;
    const viewportY = (camera.y / (map.height * 24)) * MINIMAP_HEIGHT;
    const viewportW = (window.innerWidth / camera.zoom / (map.width * 32)) * MINIMAP_WIDTH;
    const viewportH = (window.innerHeight / camera.zoom / (map.height * 24)) * MINIMAP_HEIGHT;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.max(0, viewportX),
      Math.max(0, viewportY),
      Math.min(MINIMAP_WIDTH - viewportX, viewportW),
      Math.min(MINIMAP_HEIGHT - viewportY, viewportH)
    );

  }, [map, camera, gameEngine]);

  // Handle minimap clicks to move camera
  const handleMinimapClick = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert minimap coordinates to world coordinates
    const worldX = (x / MINIMAP_WIDTH) * map.width * 32;
    const worldY = (y / MINIMAP_HEIGHT) * map.height * 24;

    // Center camera on clicked position
    gameActions({
      type: 'UPDATE_CAMERA',
      payload: {
        x: worldX - (window.innerWidth / camera.zoom) / 2,
        y: worldY - (window.innerHeight / camera.zoom) / 2
      }
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