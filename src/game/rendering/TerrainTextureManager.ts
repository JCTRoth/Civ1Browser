/**
 * TerrainTextureManager — Loads and caches AI-generated terrain textures.
 *
 * Two-layer rendering system inspired by Battle for Wesnoth:
 *
 *  Layer 1 — base ground tiles (seamless, flat top-down, 256x256)
 *    Drawn first for every tile. Transitions use smooth color gradients
 *    (no texture bleeding = no blob patterns at corners).
 *
 *  Layer 2 — feature sprites (isometric, transparent bg, 256x384 = 1.5:1)
 *    Drawn in painter's-algorithm row order so lower-row features
 *    appear in front. Each sprite is offset upward by half a tile height
 *    so mountain peaks / tree tops extend a little into the row above.
 */

export const TERRAIN_TEXTURE_FILES: Record<string, string> = {
  OCEAN:     '/assets/tiles/terrain_ocean.png',
  PLAINS:    '/assets/tiles/terrain_plains.png',
  GRASSLAND: '/assets/tiles/terrain_grassland.png',
  FOREST:    '/assets/tiles/terrain_forest.png',
  JUNGLE:    '/assets/tiles/terrain_jungle.png',
  MOUNTAINS: '/assets/tiles/terrain_mountains.png',
  DESERT:    '/assets/tiles/terrain_desert.png',
  SWAMP:     '/assets/tiles/terrain_swamp.png',
  TUNDRA:    '/assets/tiles/terrain_tundra.png',
  ARCTIC:    '/assets/tiles/terrain_arctic.png',
  // River reuses the ocean water texture; banks come from colour transitions.
  RIVER:     '/assets/tiles/terrain_ocean.png',
  // Hills reuses the grass base texture; the hill feature sprite adds the relief.
  HILLS:     '/assets/tiles/terrain_plains.png',
};

export const FEATURE_TEXTURE_FILES: Partial<Record<string, string>> = {
  FOREST:    '/assets/tiles/terrain_forest_feature.png',
  JUNGLE:    '/assets/tiles/terrain_jungle_feature.png',
  HILLS:     '/assets/tiles/terrain_hills_feature.png',
  MOUNTAINS: '/assets/tiles/terrain_mountains_feature.png',
  SWAMP:     '/assets/tiles/terrain_swamp_feature.png',
};

/** Higher value bleeds color over lower-value terrain at border transitions. */
export const TERRAIN_PRIORITY: Record<string, number> = {
  OCEAN:      10,
  RIVER:      10,
  ARCTIC:      9,
  TUNDRA:      8,
  MOUNTAINS:   7,
  HILLS:       6,
  DESERT:      5,
  SWAMP:       5,
  FOREST:      4,
  JUNGLE:      4,
  PLAINS:      2,
  GRASSLAND:   1,
};

/** rgba prefix for each terrain's dominant blend color (no closing paren). */
export const TERRAIN_BLEND_COLOR: Record<string, string> = {
  OCEAN:      'rgba( 30, 80,170,',
  RIVER:      'rgba( 30,100,200,',
  ARCTIC:     'rgba(220,235,255,',
  TUNDRA:     'rgba(150,175,210,',
  MOUNTAINS:  'rgba( 80, 80, 80,',
  HILLS:      'rgba(110,150, 80,',
  DESERT:     'rgba(210,155, 60,',
  SWAMP:      'rgba( 60, 55, 25,',
  FOREST:     'rgba( 20,100, 20,',
  JUNGLE:     'rgba( 10, 90, 30,',
  PLAINS:     'rgba(120,190, 80,',
  GRASSLAND:  'rgba( 40,160, 40,',
};

export class TerrainTextureManager {
  private readonly baseCache    = new Map<string, HTMLImageElement>();
  private readonly featureCache = new Map<string, HTMLImageElement>();
  /** Reusable offscreen canvas for texture-based transition compositing. */
  private transitionCanvas: HTMLCanvasElement | null = null;

  readonly ready: Promise<void>;
  private loadedCount = 0;
  private totalCount  = 0;

  constructor(onLoad?: () => void) {
    const baseTypes    = Object.keys(TERRAIN_TEXTURE_FILES);
    const featureTypes = Object.keys(FEATURE_TEXTURE_FILES);
    this.totalCount    = baseTypes.length + featureTypes.length;

    let resolve!: () => void;
    this.ready = new Promise(r => { resolve = r; });

    const done = () => {
      this.loadedCount++;
      if (this.loadedCount >= this.totalCount) { resolve(); onLoad?.(); }
    };

    for (const type of baseTypes) {
      const img = new Image();
      img.onload = img.onerror = done;
      img.src = TERRAIN_TEXTURE_FILES[type]!;
      this.baseCache.set(type, img);
    }
    for (const type of featureTypes) {
      const img = new Image();
      img.onload = img.onerror = done;
      img.src = FEATURE_TEXTURE_FILES[type]!;
      this.featureCache.set(type, img);
    }
  }

  getTexture(type?: string | null): HTMLImageElement | null {
    if (!type) return null;
    return this.baseCache.get(type.toUpperCase()) ?? null;
  }

  getFeatureTexture(type?: string | null): HTMLImageElement | null {
    if (!type) return null;
    const img = this.featureCache.get(type.toUpperCase());
    return img?.complete && img.naturalWidth > 0 ? img : null;
  }

  getPriority(type?: string | null): number {
    if (!type) return 0;
    return TERRAIN_PRIORITY[type.toUpperCase()] ?? 0;
  }

  get isReady(): boolean { return this.loadedCount >= this.totalCount; }

  // ── Base tile ────────────────────────────────────────────────────────────

  drawTile(
    ctx: CanvasRenderingContext2D,
    terrainType: string,
    x: number, y: number, size: number,
    fallbackColor: string,
    topLeft = false,
  ): void {
    const img = this.getTexture(terrainType);
    const px  = topLeft ? x : x - size / 2;
    const py  = topLeft ? y : y - size / 2;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, px, py, size, size);
    } else {
      ctx.fillStyle = fallbackColor;
      ctx.fillRect(px, py, size, size);
    }
  }

  // ── Texture-based edge transitions (Wesnoth-style) ──────────────────────
  //
  // Draws a strip of the actual neighbor terrain texture at the shared edge,
  // masked with a gradient that fades from ~75 % at the seam to 0 % at ~40 %
  // into the current tile.  Uses a cached offscreen canvas for compositing.
  //
  // The neighbor texture is drawn at its natural position relative to the
  // current tile so only the "bleeding" portion shows through the mask.

  drawTextureTransition(
    ctx: CanvasRenderingContext2D,
    neighborType: string,
    tileX: number, tileY: number, tileSize: number,
    direction: 'N' | 'E' | 'S' | 'W',
    priorityDiff = 1,
  ): void {
    const img = this.getTexture(neighborType);
    if (!img || !img.complete || img.naturalWidth === 0) {
      this.drawColorTransition(ctx, neighborType, tileX, tileY, tileSize, direction);
      return;
    }

    // Lazily create / resize the shared offscreen canvas.
    if (!this.transitionCanvas) {
      this.transitionCanvas = document.createElement('canvas');
    }
    const tc = this.transitionCanvas;
    if (tc.width !== tileSize || tc.height !== tileSize) {
      tc.width  = tileSize;
      tc.height = tileSize;
    }
    const tCtx = tc.getContext('2d')!;
    tCtx.clearRect(0, 0, tileSize, tileSize);

    // Draw the neighbor texture positioned so the shared edge shows its texture.
    // For seamless textures we just fill the offscreen canvas with the neighbor
    // texture — the gradient mask determines how far it bleeds inward.
    tCtx.drawImage(img, 0, 0, tileSize, tileSize);

    // Scale blend strength with priority difference; clamp to a reasonable range.
    const edgeAlpha = 1.0 // Math.min(0.82, 0.55 + priorityDiff * 0.06);
    const fadeFrac  = Math.min(0.45, 0.28 + priorityDiff * 0.03);

    // Mask with a gradient: opaque at the shared edge, transparent at fadeFrac.
    tCtx.globalCompositeOperation = 'destination-in';
    let g: CanvasGradient;
    const fadeY = tileSize * fadeFrac;
    switch (direction) {
      case 'N': g = tCtx.createLinearGradient(0, 0,        0, tileSize);  break;
      case 'S': g = tCtx.createLinearGradient(0, tileSize, 0, 0);          break;
      case 'E': g = tCtx.createLinearGradient(tileSize, 0, 0, 0);          break;
      case 'W': g = tCtx.createLinearGradient(0, 0, tileSize, 0);          break;
    }
    g.addColorStop(0,                       `rgba(0,0,0,${edgeAlpha.toFixed(2)})`);
    g.addColorStop(fadeY * 0.35 / tileSize, `rgba(0,0,0,${(edgeAlpha * 0.4).toFixed(2)})`);
    g.addColorStop(fadeFrac,                'rgba(0,0,0,0)');
    g.addColorStop(1,                       'rgba(0,0,0,0)');
    tCtx.fillStyle = g;
    tCtx.fillRect(0, 0, tileSize, tileSize);
    tCtx.globalCompositeOperation = 'source-over';

    // Composite the masked texture onto the main canvas, clipped to this tile.
    ctx.save();
    ctx.beginPath();
    ctx.rect(tileX, tileY, tileSize, tileSize);
    ctx.clip();
    ctx.drawImage(tc, tileX, tileY);
    ctx.restore();
  }

  // ── Diagonal corner transitions ──────────────────────────────────────────
  //
  // Fills the corner area of the current tile with the diagonal neighbor's
  // texture, masked by a radial gradient that peaks at the corner vertex and
  // fades toward the center.  Covers the "cut-off" notch left by the four
  // cardinal edge transitions.

  drawCornerTransition(
    ctx: CanvasRenderingContext2D,
    neighborType: string,
    tileX: number, tileY: number, tileSize: number,
    corner: 'NW' | 'NE' | 'SW' | 'SE',
    priorityDiff = 1,
  ): void {
    const img = this.getTexture(neighborType);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    if (!this.transitionCanvas) {
      this.transitionCanvas = document.createElement('canvas');
    }
    const tc = this.transitionCanvas;
    if (tc.width !== tileSize || tc.height !== tileSize) {
      tc.width  = tileSize;
      tc.height = tileSize;
    }
    const tCtx = tc.getContext('2d')!;
    tCtx.clearRect(0, 0, tileSize, tileSize);
    tCtx.drawImage(img, 0, 0, tileSize, tileSize);

    // Radial gradient centered at the corner vertex.
    const cx = corner === 'NW' || corner === 'SW' ? 0        : tileSize;
    const cy = corner === 'NW' || corner === 'NE' ? 0        : tileSize;
    const radius = Math.min(0.42, 0.22 + priorityDiff * 0.025) * tileSize;
    const peak   = 1.0; //Math.min(0.72, 0.42 + priorityDiff * 0.05);

    tCtx.globalCompositeOperation = 'destination-in';
    const g = tCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0,    `rgba(0,0,0,${peak.toFixed(2)})`);
    g.addColorStop(0.45, `rgba(0,0,0,${(peak * 0.25).toFixed(2)})`);
    g.addColorStop(1,    'rgba(0,0,0,0)');
    tCtx.fillStyle = g;
    tCtx.fillRect(0, 0, tileSize, tileSize);
    tCtx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.beginPath();
    ctx.rect(tileX, tileY, tileSize, tileSize);
    ctx.clip();
    ctx.drawImage(tc, tileX, tileY);
    ctx.restore();
  }

  // ── Color-based edge transitions (fallback) ──────────────────────────────
  //
  // Draws a solid-color gradient from the shared edge inward.
  // Used when textures are not yet loaded.

  drawColorTransition(
    ctx: CanvasRenderingContext2D,
    neighborType: string,
    tileX: number, tileY: number, tileSize: number,
    direction: 'N' | 'E' | 'S' | 'W',
    blendFraction = 0.32,
    maxAlpha       = 0.60,
  ): void {
    const colorBase = TERRAIN_BLEND_COLOR[neighborType.toUpperCase()];
    if (!colorBase) return;

    const half = tileSize / 2;
    ctx.save();
    ctx.beginPath();
    switch (direction) {
      case 'N': ctx.rect(tileX,        tileY,        tileSize, half); break;
      case 'S': ctx.rect(tileX,        tileY + half, tileSize, half); break;
      case 'E': ctx.rect(tileX + half, tileY,        half,     tileSize); break;
      case 'W': ctx.rect(tileX,        tileY,        half,     tileSize); break;
    }
    ctx.clip();

    let g: CanvasGradient;
    switch (direction) {
      case 'N': g = ctx.createLinearGradient(0, tileY,           0, tileY + tileSize);  break;
      case 'S': g = ctx.createLinearGradient(0, tileY + tileSize,0, tileY);             break;
      case 'E': g = ctx.createLinearGradient(tileX + tileSize, 0, tileX, 0);            break;
      case 'W': g = ctx.createLinearGradient(tileX,            0, tileX + tileSize, 0); break;
    }
    // Ease-out falloff: strong at the shared edge, then a soft mid stop so the
    // blend fades smoothly instead of ending in a visible painted band.
    const mid = Math.max(0.02, blendFraction * 0.5);
    g.addColorStop(0,             `${colorBase}${maxAlpha})`);
    g.addColorStop(mid,           `${colorBase}${(maxAlpha * 0.45).toFixed(3)})`);
    g.addColorStop(blendFraction, 'rgba(0,0,0,0)');
    g.addColorStop(1,             'rgba(0,0,0,0)');

    ctx.fillStyle = g;
    ctx.fillRect(tileX, tileY, tileSize, tileSize);
    ctx.restore();
  }

  // ── Feature sprite (painter's algorithm, upward offset) ─────────────────
  //
  // Sprite is 1.5:1 (width : 1.5*width). The lower width×width portion sits on
  // the tile; only the top half-tile extends above — enough to hide the tile
  // edge without covering the whole row above.

  drawFeature(
    ctx: CanvasRenderingContext2D,
    terrainType: string,
    tileX: number, tileY: number, tileSize: number,
  ): void {
    const img = this.getFeatureTexture(terrainType);
    if (!img) return;
    const overhang = tileSize * 0.5;
    ctx.drawImage(img, tileX, tileY - overhang, tileSize, tileSize * 1.5);
  }
}
