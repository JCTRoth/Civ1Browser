import React, { useRef, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { cameraAtom, gameActionsAtom, gameStateAtom } from '../../stores/gameStore';

const GameCanvas = ({ gameEngine }) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastRenderTime = useRef(0);
  
  const [camera] = useAtom(cameraAtom);
  const [gameState] = useAtom(gameStateAtom);
  const [, gameActions] = useAtom(gameActionsAtom);
  
  // Mouse interaction state
  const mouseState = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    dragStartX: 0,
    dragStartY: 0
  });

  // Render loop
  const render = useCallback((timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas || !gameEngine) return;

    const deltaTime = timestamp - lastRenderTime.current;
    lastRenderTime.current = timestamp;

    // Clear canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set up camera transform
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Render game world
    gameEngine.render(ctx, camera);

    ctx.restore();

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(render);
  }, [gameEngine, camera]);

  // Initialize canvas and start render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Start render loop
    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);

  // Handle mouse events
  const handleMouseDown = useCallback((event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    mouseState.current.isDragging = true;
    mouseState.current.lastX = x;
    mouseState.current.lastY = y;
    mouseState.current.dragStartX = x;
    mouseState.current.dragStartY = y;
    
    event.preventDefault();
  }, []);

  const handleMouseMove = useCallback((event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (mouseState.current.isDragging) {
      const deltaX = (x - mouseState.current.lastX) / camera.zoom;
      const deltaY = (y - mouseState.current.lastY) / camera.zoom;
      
      gameActions({
        type: 'UPDATE_CAMERA',
        payload: {
          x: camera.x - deltaX,
          y: camera.y - deltaY
        }
      });
      
      mouseState.current.lastX = x;
      mouseState.current.lastY = y;
    }
  }, [camera, gameActions]);

  const handleMouseUp = useCallback((event) => {
    if (mouseState.current.isDragging) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Check if this was a click (small movement) rather than a drag
      const dragDistance = Math.sqrt(
        Math.pow(x - mouseState.current.dragStartX, 2) +
        Math.pow(y - mouseState.current.dragStartY, 2)
      );
      
      if (dragDistance < 5) {
        // This was a click, not a drag
        handleCanvasClick(event);
      }
    }
    
    mouseState.current.isDragging = false;
  }, []);

  const handleCanvasClick = useCallback((event) => {
    if (!gameEngine) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldX = (x / camera.zoom) + camera.x;
    const worldY = (y / camera.zoom) + camera.y;
    
    // Get hex coordinates
    const hex = gameEngine.screenToHex(worldX, worldY);
    
    if (gameEngine.isValidHex(hex.col, hex.row)) {
      // Handle hex selection
      gameActions({ type: 'SELECT_HEX', payload: hex });
      
      // Check for unit or city at this location
      const unit = gameEngine.getUnitAt(hex.col, hex.row);
      const city = gameEngine.getCityAt(hex.col, hex.row);
      
      if (unit) {
        gameActions({ type: 'SELECT_UNIT', payload: unit.id });
      } else if (city) {
        gameActions({ type: 'SELECT_CITY', payload: city.id });
      } else {
        // Try to move selected unit
        if (gameState.selectedUnit) {
          gameEngine.moveUnit(gameState.selectedUnit, hex.col, hex.row);
        }
      }
    }
  }, [gameEngine, camera, gameActions, gameState.selectedUnit]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Calculate zoom
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(camera.minZoom, Math.min(camera.maxZoom, camera.zoom * zoomFactor));
    
    // Zoom towards mouse position
    const worldMouseX = (mouseX / camera.zoom) + camera.x;
    const worldMouseY = (mouseY / camera.zoom) + camera.y;
    
    const newWorldMouseX = (mouseX / newZoom) + camera.x;
    const newWorldMouseY = (mouseY / newZoom) + camera.y;
    
    gameActions({
      type: 'UPDATE_CAMERA',
      payload: {
        zoom: newZoom,
        x: camera.x + (worldMouseX - newWorldMouseX),
        y: camera.y + (worldMouseY - newWorldMouseY)
      }
    });
  }, [camera, gameActions]);

  // Handle right-click for context menu
  const handleContextMenu = useCallback((event) => {
    event.preventDefault();
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert to world coordinates and get hex
    const worldX = (x / camera.zoom) + camera.x;
    const worldY = (y / camera.zoom) + camera.y;
    const hex = gameEngine.screenToHex(worldX, worldY);
    
    if (gameEngine.isValidHex(hex.col, hex.row)) {
      // Show context menu for hex
      // This could open a modal or dropdown with actions
      console.log('Right-click on hex:', hex);
    }
  }, [gameEngine, camera]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas w-100 h-100"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      style={{ cursor: mouseState.current?.isDragging ? 'grabbing' : 'crosshair' }}
    />
  );
};

export default GameCanvas;