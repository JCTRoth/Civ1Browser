/**
 * TerrainTextureManager — Loads and caches AI-generated terrain textures.
 *
 * Two-layer rendering system inspired by Battle for Wesnoth:
 *
 *  Layer 1 — base ground tiles (seamless, flat top-down, 256x256)
 *    Drawn first for every tile. Transitions use smooth color gradients
 *    (no texture bleeding = no blob patterns at corners).
 *
 *  Layer 2 — feature sprites (isometric, transparent bg, 256x512)
 *    Drawn in painter's-algorithm row order so lower-row features
 *    appear in front. Each sprite is offset upward by one tile height
 *    so mountain peaks / tree tops extend into the row above.
 */

export const TERRAIN_TEXTURE_FILES: Record<string, string> = {
  OCEAN:     '/assets/tiles/terrain_ocean.png',
  PLAINS:    '/assets/tiles/terrain_plains.png',
  GRASSLAND: '/assets/tiles/terrain_grassland.png',
  FOREST:    '/assets/tiles/terrain_forest.png',
  JUNGLE:    '/assets/tiles/terrain_jungle.png',
  HILLS:     '/assets/tiles/terrain_hills.png',
  MOUNTAINS: '/assets/tiles/terrain_mountains.png',
  DESERT:    '/assets/tiles/terrain_desert.png',
  SWAMP:     '/assets/tiles/terrain_swamp.png',
  TUNDRA:    '/assets/tiles/terrain_tundra.png',
  ARCTIC:    '/assets/tiles/terrain_arctic.png',
  RIVER:     '/assets/tiles/terrain_river.png',
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
    g.addColorStop(0,            `${colorBase}${maxAlpha})`);
    g.addColorStop(blendFraction,'rgba(0,0,0,0)');
    g.addColorStop(1,            'rgba(0,0,0,0)');

    ctx.fillStyle = g;
    ctx.fillRect(tileX, tileY, tileSize, tileSize);
    ctx.restore();
  }

  // ── Feature sprite (painter's algorithm, upward offset) ─────────────────
  //
  // Sprite is 1:2 (width : 2*width). Bottom aligns with tile bottom;
  // top extends one full tileSize above — creating depth like Wesnoth trees.

  drawFeature(
    ctx: CanvasRenderingContext2D,
    terrainType: string,
    tileX: number, tileY: number, tileSize: number,
  ): void {
    const img = this.getFeatureTexture(terrainType);
    if (!img) return;
    ctx.drawImage(img, tileX, tileY - tileSize, tileSize, tileSize * 2);
  }
}
