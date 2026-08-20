/**
 * TerrainTextureManager — Loads and caches AI-generated terrain textures.
 *
 * Two-layer rendering system inspired by Battle for Wesnoth:
 *
 *  Layer 1 — base ground tiles (seamless, flat top-down, 256×256)
 *    HILLS and RIVER reuse existing grass/ocean textures.
 *    Transitions are color-gradient based — no blob patterns.
 *
 *  Layer 2 — feature sprites (isometric, transparent bg, 256×384 = 1.5:1)
 *    Drawn in painter's-algorithm row order. Each sprite is offset upward
 *    by 0.5 tile so the feature slightly extends into the row above.
 */

export const TERRAIN_TEXTURE_FILES: Record<string, string> = {
  OCEAN:     '/assets/tiles/terrain_ocean.png',
  PLAINS:    '/assets/tiles/terrain_plains.png',
  GRASSLAND: '/assets/tiles/terrain_grassland.png',
  FOREST:    '/assets/tiles/terrain_forest.png',
  JUNGLE:    '/assets/tiles/terrain_jungle.png',
  HILLS:     '/assets/tiles/terrain_grassland.png',  // hills use grass base
  MOUNTAINS: '/assets/tiles/terrain_mountains.png',
  DESERT:    '/assets/tiles/terrain_desert.png',
  SWAMP:     '/assets/tiles/terrain_swamp.png',
  TUNDRA:    '/assets/tiles/terrain_tundra.png',
  ARCTIC:    '/assets/tiles/terrain_arctic.png',
  RIVER:     '/assets/tiles/terrain_ocean.png',      // river uses ocean base
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

  // ── Color-based edge transitions (clean, no texture-blob artifacts) ──────
  //
  // Draws a solid-color gradient from the shared edge inward, clipped to the
  // half of the tile facing that edge so opposing transitions never overlap.

  drawColorTransition(
    ctx: CanvasRenderingContext2D,
    neighborType: string,
    tileX: number, tileY: number, tileSize: number,
    direction: 'N' | 'E' | 'S' | 'W',
    blendFraction = 0.40,
    maxAlpha       = 0.65,
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
    g.addColorStop(0,            `${colorBase}${maxAlpha})`);
    g.addColorStop(blendFraction,'rgba(0,0,0,0)');
    g.addColorStop(1,            'rgba(0,0,0,0)');

    ctx.fillStyle = g;
    ctx.fillRect(tileX, tileY, tileSize, tileSize);
    ctx.restore();
  }

  /** Radial gradient at a tile corner for diagonal neighbour blending. */
  drawCornerBlend(
    ctx: CanvasRenderingContext2D,
    neighborType: string,
    cornerX: number,
    cornerY: number,
    radius: number,
    maxAlpha = 0.32,
  ): void {
    const colorBase = TERRAIN_BLEND_COLOR[neighborType.toUpperCase()];
    if (!colorBase) return;
    const g = ctx.createRadialGradient(cornerX, cornerY, 0, cornerX, cornerY, radius);
    g.addColorStop(0,    `${colorBase}${maxAlpha})`);
    g.addColorStop(0.6,  `${colorBase}${(maxAlpha * 0.3).toFixed(2)})`);
    g.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cornerX - radius, cornerY - radius, radius * 2, radius * 2);
  }

  // ── Feature sprite (painter's algorithm, upward offset) ─────────────────
  //
  // Sprites are 1.5:1 (width : 1.5*width = 256×384).
  // Feature sits in the lower part; top 0.5 tile extends above the tile edge.

  drawFeature(
    ctx: CanvasRenderingContext2D,
    terrainType: string,
    tileX: number, tileY: number, tileSize: number,
  ): void {
    const img = this.getFeatureTexture(terrainType);
    if (!img) return;
    // Offset up by 0.5 tiles; total height = 1.5 tiles
    ctx.drawImage(img, tileX, tileY - tileSize * 0.5, tileSize, tileSize * 1.5);
  }
}
