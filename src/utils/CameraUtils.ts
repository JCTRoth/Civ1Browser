import { TILE_SIZE } from '@/data/TerrainData';

export interface CameraCenterParams {
  col: number;
  row: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  mapWidth: number;
  mapHeight: number;
}

/**
 * Compute the camera position (world px) that centers a tile, clamping to the
 * map bounds so the view never drifts into empty (black) space.
 *
 * The renderer maps world->screen with `screen = (world - camera) * zoom`, so a
 * tile is centered when `camera = tileCenter - viewportWorld / 2`.
 */
export function centerCameraOnTile({
  col,
  row,
  zoom,
  viewportWidth,
  viewportHeight,
  mapWidth,
  mapHeight,
}: CameraCenterParams): { x: number; y: number } {
  // World-space center of the target tile
  const centerX = (col + 0.5) * TILE_SIZE;
  const centerY = (row + 0.5) * TILE_SIZE;

  // World-space size of the visible viewport at this zoom
  const viewWorldW = viewportWidth / zoom;
  const viewWorldH = viewportHeight / zoom;

  const worldW = mapWidth * TILE_SIZE;
  const worldH = mapHeight * TILE_SIZE;

  let x = centerX - viewWorldW / 2;
  let y = centerY - viewWorldH / 2;

  // Clamp to map bounds (center the map when the view is larger than it)
  x = viewWorldW >= worldW
    ? (worldW - viewWorldW) / 2
    : Math.max(0, Math.min(worldW - viewWorldW, x));
  y = viewWorldH >= worldH
    ? (worldH - viewWorldH) / 2
    : Math.max(0, Math.min(worldH - viewWorldH, y));

  return { x, y };
}

/**
 * Return the pixel size of the actual game map viewport.
 * Uses the canvas element (accounts for top/bottom bars on mobile) with a
 * window fallback for non-DOM contexts.
 */
export function getGameViewport(): { width: number; height: number } {
  if (typeof document === 'undefined') {
    return { width: 800, height: 600 };
  }
  const canvas = document.querySelector('.game-canvas canvas');
  if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }
  return {
    width: window.innerWidth || 800,
    height: window.innerHeight || 600,
  };
}
