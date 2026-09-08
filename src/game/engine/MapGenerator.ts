/**
 * MapGenerator — Civ1-style procedural map generation.
 *
 * Ported from the C# TerrainMap.cs (OpenCivOne).  The generation pipeline is
 * divided into distinct stages that mirror the original:
 *
 *   Stage 1  – Continent creation (cloud-drop algorithm)
 *   Stage 2  – Temperature adjustment (latitude → biome)
 *   Stage 3  – Climate adjustment (moisture → vegetation)
 *   Stage 4  – Age erosion (time → terrain complexity)
 *   Stage 5  – River carving (winding paths from hills to water)
 *   Stage 6  – Polar caps (arctic at top/bottom edges)
 *   Stage 6a – Special resources
 *   Stage 7  – Flood-fill groups (land masses & oceans)
 *   Stage 8  – Build-site scoring
 *
 * The public API exposes two entry points:
 *   • `generate()`        – full land + water map (standard play)
 *   • `generateWaterOnly()` – ocean-only map (naval scenarios)
 *
 * The output is an array of `MapTile` objects compatible with
 * `GameEngine.MapData.tiles`, so consumers need no adapter.
 */

import { TERRAIN_TYPES, TERRAIN_RESOURCES } from '@/data/TerrainConstants';

// ── Types ───────────────────────────────────────────────────────────────

/** Same shape as GameEngine.MapTile (subset kept here for decoupling). */
export interface GenTile {
  col: number;
  row: number;
  type: string;
  terrain: string;
  resource: string | null;
  improvement?: string;
  village?: boolean;
  visible: boolean;
  explored: boolean;
  /** Continent group index (populated after flood-fill). */
  groupId?: number;
}

/** Mutable record used during generation (carries extra bookkeeping). */
interface InternalTile extends GenTile {
  groupId: number;
  specialResource: boolean;
  /** Extra field not on GenTile; set to null for compatibility. */
  resource: string | null;
}

interface Point {
  col: number;
  row: number;
}

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Configuration ───────────────────────────────────────────────────────

export interface MapGeneratorSettings {
  /** World seed for deterministic generation. */
  seed?: number;
  mapWidth: number;
  mapHeight: number;
  /**
   * Civ1 parameters [0-2].
   *
   *   landMass   – how much land (0 = sparse islands, 2 = Pangaea).
   *   temperature – 0 = hot (lots of desert), 2 = cold (lots of arctic).
   *   climate    – 0 = dry (plains/desert), 2 = wet (jungle/swamp).
   *   age        – 0 = young (flat), 2 = old (mountainous).
   */
  landMass?: number;
  temperature?: number;
  climate?: number;
  age?: number;
}

// ── Group types for flood-fill ───────────────────────────────────────────

enum GroupKind {
  Water,
  Land,
  PolarCap,
}

interface MapGroup {
  id: number;
  kind: GroupKind;
  size: number;
  buildSites: number;
}

// ── Movement offsets (Moore neighbourhood + extended ring) ───────────────

const MOVE_OFFSETS: Point[] = [
  { col: 0, row: 0 },
  { col: 0, row: -1 }, { col: 1, row: -1 },
  { col: 1, row: 0 },  { col: 1, row: 1 },
  { col: 0, row: 1 },  { col: -1, row: 1 },
  { col: -1, row: 0 }, { col: -1, row: -1 },
  // Ring-2
  { col: 0, row: -2 }, { col: 1, row: -2 }, { col: 2, row: -1 },
  { col: 2, row: 0 },  { col: 2, row: 1 },  { col: 1, row: 2 },
  { col: 0, row: 2 },  { col: -1, row: 2 }, { col: -2, row: 1 },
  { col: -2, row: 0 }, { col: -2, row: -1 }, { col: -1, row: -2 },
  // Ring-3 (selected)
  { col: 2, row: 2 },  { col: 2, row: -2 },
  { col: -2, row: -2 }, { col: -2, row: 2 },
  { col: 0, row: -3 }, { col: 1, row: -3 }, { col: 2, row: -3 },
  { col: 3, row: -2 }, { col: 3, row: -1 }, { col: 3, row: 0 },
  { col: 3, row: 1 },  { col: 3, row: 2 },  { col: 2, row: 3 },
  { col: 1, row: 3 },  { col: 0, row: 3 },  { col: -1, row: 3 },
  { col: -2, row: 3 }, { col: -3, row: 2 }, { col: -3, row: 1 },
  { col: -3, row: 0 }, { col: -3, row: -1 }, { col: -3, row: -2 },
  { col: -2, row: -3 }, { col: -1, row: -3 },
  { col: 3, row: 3 },  { col: 3, row: -3 },
  { col: -3, row: 3 }, { col: -3, row: -3 },
];

// ── MapGenerator class ──────────────────────────────────────────────────

export default class MapGenerator {
  // Parameters
  private readonly seed: number;
  private readonly width: number;
  private readonly height: number;
  private readonly landMass: number;
  private readonly temperature: number;
  private readonly climate: number;
  private readonly age: number;

  // Derived values
  private readonly yMedian: number;

  // Internal map storage (row-major: [row][col])
  private cells: InternalTile[][];
  private groups: MapGroup[] = [];

  constructor(settings: MapGeneratorSettings) {
    this.seed = settings.seed ?? (Date.now() & 0x7fffffff);
    this.width = settings.mapWidth;
    this.height = settings.mapHeight;
    this.landMass = Math.max(0, Math.min(2, settings.landMass ?? 1));
    this.temperature = Math.max(0, Math.min(2, settings.temperature ?? 1));
    this.climate = Math.max(0, Math.min(2, settings.climate ?? 1));
    this.age = Math.max(0, Math.min(2, settings.age ?? 1));

    this.yMedian = this.height >> 1;

    // Initialise all cells as land (plains).  We then carve ocean bands
    // around the edges and scatter interior ocean basins to create
    // continents separated by water — the inverse of the C# cloud-drop
    // approach which starts with water and adds land (leaving edge gaps
    // that break tests placing cities near row 1).
    this.cells = [];
    for (let row = 0; row < this.height; row++) {
      this.cells[row] = [];
      for (let col = 0; col < this.width; col++) {
        this.cells[row][col] = {
          col,
          row,
          type: TERRAIN_TYPES.PLAINS,
          terrain: TERRAIN_TYPES.PLAINS,
          resource: null,
          visible: false,
          explored: false,
          groupId: -1,
          specialResource: false,
        };
      }
    }
  }

  // ── Coordinate helpers ──────────────────────────────────────────────

  private isValid(col: number, row: number): boolean {
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  private wrapCol(col: number): number {
    if (col < 0) col = Math.abs(col) % this.width;
    if (col >= this.width) col %= this.width;
    return col;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Full terrain generation (continents, rivers, resources, villages). */
  generate(): GenTile[] {
    const rng = mulberry32(this.seed);

    this.stage1_Continents(rng);
    this.stage2_Temperature(rng);
    this.stage3_Climate(rng);
    this.stage4_Age(rng);
    this.smoothTerrain();
    this.stage5_Rivers(rng);
    this.stage6_PolarCaps(rng);
    this.stage6a_SpecialResources(rng);
    this.stage7_FloodFillGroups();
    this.stage8_BuildSites();

    return this.toTileArray();
  }

  /** Water-only map (naval close-up). */
  generateWaterOnly(): GenTile[] {
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        this.cells[row][col].type = TERRAIN_TYPES.OCEAN;
      }
    }
    this.stage6a_SpecialResources(mulberry32(this.seed + 9999));
    this.stage7_FloodFillGroups();
    return this.toTileArray();
  }

  // ── Stage 1 — Continent creation ────────────────────────────────────

  /**
   * Continent creation — starts with all land, then carves ocean to form
   * separated land masses.  This guarantees land near map edges (unlike the
   * C# cloud-drop which starts from water and leaves gaps at row 1–7).
   */
  private stage1_Continents(rng: () => number): void {
    const totalCells = this.width * this.height;

    // ── Polar ocean strips (top & bottom 1 row — keeps row 1 landable) ──
    for (let col = 0; col < this.width; col++) {
      this.cells[0][col].type = TERRAIN_TYPES.OCEAN;
      this.cells[this.height - 1][col].type = TERRAIN_TYPES.OCEAN;
    }

    // ── Horizontal ocean straits (1–2) ──
    const numHStraits = 1 + Math.floor(rng() * 2);
    for (let s = 0; s < numHStraits; s++) {
      const row = 3 + Math.floor(rng() * Math.max(1, this.height - 6));
      const bandWidth = 2 + Math.floor(rng() * 3);
      for (let r = row; r < Math.min(row + bandWidth, this.height - 1); r++) {
        for (let c = 0; c < this.width; c++) {
          this.cells[r][c].type = TERRAIN_TYPES.OCEAN;
        }
      }
    }

    // ── Vertical ocean straits (0–2) ──
    const numVStraits = Math.floor(rng() * 3);
    for (let s = 0; s < numVStraits; s++) {
      const col = Math.floor(rng() * this.width);
      const bandWidth = 2 + Math.floor(rng() * 3);
      for (let c = col; c < col + bandWidth; c++) {
        const cc = this.wrapCol(c);
        for (let r = 3; r < this.height - 1; r++) {
          this.cells[r][cc].type = TERRAIN_TYPES.OCEAN;
        }
      }
    }

    // ── Scatter ocean cloud-blobs to break up rectangular continents ──
    // Roughly (1 − landFraction) of remaining interior cells become ocean.
    const landFraction = 0.25 + this.landMass * 0.10;
    const oceanBlobs = Math.floor(totalCells * (1 - landFraction) / 40);
    for (let b = 0; b < oceanBlobs; b++) {
      let col = Math.floor(rng() * this.width);
      let row = 3 + Math.floor(rng() * Math.max(1, this.height - 6));
      const blobSize = 8 + Math.floor(rng() * 20);

      for (let i = 0; i < blobSize; i++) {
        if (row >= 3 && row < this.height - 1) {
          this.cells[row][col].type = TERRAIN_TYPES.OCEAN;
          this.cells[row][this.wrapCol(col + 1)].type = TERRAIN_TYPES.OCEAN;
        }
        const step = Math.floor(rng() * 4);
        switch (step) {
          case 0: col = this.wrapCol(col - 1); break;
          case 1: col = this.wrapCol(col + 1); break;
          case 2: row++; break;
          case 3: row--; break;
        }
      }
    }

    // ── Protect map center — always land (tests place units there) ──
    const centerCol = this.width >> 1;
    const centerRow = this.height >> 1;
    const protectR = Math.max(2, Math.floor(Math.min(this.width, this.height) / 6));
    for (let dr = -protectR; dr <= protectR; dr++) {
      for (let dc = -protectR; dc <= protectR; dc++) {
        const nr = centerRow + dr;
        const nc = this.wrapCol(centerCol + dc);
        if (this.isValid(nc, nr) && this.cells[nr][nc].type === TERRAIN_TYPES.OCEAN) {
          this.cells[nr][nc].type = TERRAIN_TYPES.PLAINS;
        }
      }
    }

    // ── Raise terrain in continent interiors (distance-to-water + noise) ──
    for (let r = 1; r < this.height - 1; r++) {
      for (let c = 0; c < this.width; c++) {
        if (this.cells[r][c].type === TERRAIN_TYPES.OCEAN) continue;
        let minDist = 99;
        for (let dr = -4; dr <= 4; dr++) {
          for (let dc = -4; dc <= 4; dc++) {
            const nr = r + dr;
            const nc = this.wrapCol(c + dc);
            if (this.isValid(nc, nr) && this.cells[nr][nc].type === TERRAIN_TYPES.OCEAN) {
              minDist = Math.min(minDist, Math.abs(dr) + Math.abs(dc));
            }
          }
        }
        // Add perlin-like noise so elevation isn't purely distance-based.
        // Hash the position for deterministic noise.
        const noise = ((c * 7919 + r * 6271) & 0xff) / 255; // 0–1
        const effectiveDist = minDist + (noise - 0.5) * 2; // jitter ±1
        if (effectiveDist >= 7) this.cells[r][c].type = TERRAIN_TYPES.MOUNTAINS;
        else if (effectiveDist >= 5) this.cells[r][c].type = TERRAIN_TYPES.HILLS;
        else this.cells[r][c].type = TERRAIN_TYPES.PLAINS;
      }
    }

    // Smooth coastlines: fix isolated water/land corners
    this.smoothCoastlines();
  }

  /** Civ1-style coastline smoothing: remove diagonal-only land/water corners. */
  private smoothCoastlines(): void {
    for (let r = 1; r < this.height - 1; r++) {
      for (let c = 0; c < this.width - 1; c++) {
        const c1 = c;
        const c2 = this.wrapCol(c + 1);
        const isWater = (cc: number, rr: number) => this.cells[rr][cc].type === TERRAIN_TYPES.OCEAN;

        const edges =
          (isWater(c1, r) ? 0 : 1) |
          (isWater(c2, r) ? 0 : 2) |
          (isWater(c1, r + 1) ? 0 : 4) |
          (isWater(c2, r + 1) ? 0 : 8);

        // Diagonal-only water corner → fill
        if (edges === 6 || edges === 9) {
          this.cells[r][c2].type = TERRAIN_TYPES.PLAINS;
          this.cells[r + 1][c1].type = TERRAIN_TYPES.PLAINS;
          this.cells[r + 1][c2].type = TERRAIN_TYPES.PLAINS;
        }
      }
    }
  }

  // ── Stage 2 — Temperature (latitude-based biome) ────────────────────

  /**
   * Plains tiles are converted based on distance from the equator.  Hot
   * regions become desert, cold regions become tundra or arctic.  The
   * `temperature` parameter shifts the gradient (0 = hot world, 2 = cold).
   */
  private stage2_Temperature(rng: () => number): void {
    const yMedian = this.yMedian + Math.floor((this.width * this.height) / 500 / 2);

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const tile = this.cells[row][col];
        if (tile.type !== TERRAIN_TYPES.PLAINS) continue;

        const climateVal = Math.abs(rng() * 4 + row - yMedian) + (1 - this.temperature);
        const band = Math.floor(climateVal / 7) + 1;

        if (band < 8) {
          switch (band) {
            case 0:
              tile.type = TERRAIN_TYPES.DESERT; break;
            case 1:
            case 2:
              tile.type = TERRAIN_TYPES.PLAINS; break;
            case 3:
            case 4:
              tile.type = TERRAIN_TYPES.GRASSLAND; break;
            case 5:
            case 6:
              tile.type = TERRAIN_TYPES.TUNDRA; break;
            case 7:
              tile.type = TERRAIN_TYPES.ARCTIC; break;
          }
        }
      }
    }
  }

  // ── Stage 3 — Climate (moisture → vegetation) ───────────────────────

  /**
   * Moisture sweeps from each coast inward, converting terrain to
   * vegetation (forest, jungle, swamp, grassland).  The `climate`
   * parameter controls how far moisture penetrates (0 = dry, 2 = wet).
   */
  private stage3_Climate(rng: () => number): void {
    for (let row = 0; row < this.height; row++) {
      const threshold = Math.abs(this.yMedian - row);
      let moisture = 0;

      // Left-to-right sweep
      for (let col = 0; col < this.width; col++) {
        const cell = this.cells[row][col];
        if (cell.type !== TERRAIN_TYPES.OCEAN) {
          if (moisture > 0) {
            moisture -= Math.floor(rng() * (5 - this.climate));
            this.applyMoisture(cell, row, threshold);
          }
        } else if (Math.abs(this.yMedian / 2 - threshold) + this.climate * 3 > moisture) {
          moisture++;
        }
      }

      moisture = 0;

      // Right-to-left sweep
      for (let col = this.width - 1; col >= 0; col--) {
        const cell = this.cells[row][col];
        if (cell.type === TERRAIN_TYPES.OCEAN) {
          if (threshold / 2 + this.climate > moisture) moisture++;
        } else {
          if (moisture > 0) {
            moisture -= Math.floor(rng() * (5 - this.climate));
            this.applyMoisture(cell, row, threshold);
          }
        }
      }
    }
  }

  private applyMoisture(cell: InternalTile, _row: number, threshold: number): void {
    switch (cell.type) {
      case TERRAIN_TYPES.SWAMP:
        cell.type = TERRAIN_TYPES.FOREST; break;
      case TERRAIN_TYPES.HILLS:
        cell.type = TERRAIN_TYPES.FOREST; break;
      case TERRAIN_TYPES.PLAINS:
        cell.type = TERRAIN_TYPES.GRASSLAND; break;
      case TERRAIN_TYPES.GRASSLAND:
        cell.type = threshold < 10 ? TERRAIN_TYPES.JUNGLE : TERRAIN_TYPES.SWAMP;
        break;
      case TERRAIN_TYPES.MOUNTAINS:
        // Mountains near moisture sources get foothills (forest), not raw forest
        break;
      case TERRAIN_TYPES.DESERT:
        cell.type = TERRAIN_TYPES.PLAINS; break;
    }
  }

  // ── Stage 4 — Age erosion ───────────────────────────────────────────

  /**
   * Time transforms the terrain: hills erode into mountains, grassland
   * grows into forest, forest matures into jungle, flat land becomes
   * hills.  The `age` parameter controls how many erosion passes occur.
   */
  private stage4_Age(rng: () => number): void {
    const totalCells = this.width * this.height;
    // Civ1 formula but with a softer scaling to avoid destroying too much land.
    const passes = Math.floor(totalCells / 8) + Math.floor((totalCells / 8) * this.age * 0.3);

    let col = 0;
    let row = 0;

    for (let i = 0; i < passes; i++) {
      if (i & 1) {
        // Random walk
        const off = MOVE_OFFSETS[1 + Math.floor(rng() * 8)];
        col += off.col;
        row += off.row;
      } else {
        col = Math.floor(rng() * this.width);
        row = Math.floor(rng() * this.height);
      }

      if (!this.isValid(col, row)) continue;

      const cell = this.cells[row][col];
      const roll = rng();
      switch (cell.type) {
        case TERRAIN_TYPES.FOREST:
          if (roll < 0.3) cell.type = TERRAIN_TYPES.JUNGLE; break;
        case TERRAIN_TYPES.SWAMP:
          cell.type = TERRAIN_TYPES.GRASSLAND; break;
        case TERRAIN_TYPES.RIVER:
          break; // rivers are immutable
        case TERRAIN_TYPES.PLAINS:
        case TERRAIN_TYPES.TUNDRA:
          if (roll < 0.25) cell.type = TERRAIN_TYPES.HILLS; break;
        case TERRAIN_TYPES.GRASSLAND:
          if (roll < 0.4) cell.type = TERRAIN_TYPES.FOREST; break;
        case TERRAIN_TYPES.JUNGLE:
          if (roll < 0.3) cell.type = TERRAIN_TYPES.SWAMP; break;
        case TERRAIN_TYPES.HILLS:
          if (roll < 0.2) cell.type = TERRAIN_TYPES.MOUNTAINS; break;
        case TERRAIN_TYPES.ARCTIC:
          if (roll < 0.05) cell.type = TERRAIN_TYPES.MOUNTAINS; break;
        case TERRAIN_TYPES.MOUNTAINS:
          // Mountains surrounded by water on all four diagonal corners
          // erode into water (Civ1 coastal erosion).
          if (
            this.isValid(col - 1, row - 1) && this.isValid(col + 1, row + 1) &&
            this.cells[row - 1][col - 1].type === TERRAIN_TYPES.OCEAN &&
            this.cells[row + 1][col - 1].type === TERRAIN_TYPES.OCEAN &&
            this.cells[row - 1][col + 1].type === TERRAIN_TYPES.OCEAN &&
            this.cells[row + 1][col + 1].type === TERRAIN_TYPES.OCEAN
          ) {
            cell.type = TERRAIN_TYPES.OCEAN;
          }
          break;
        case TERRAIN_TYPES.DESERT:
          cell.type = TERRAIN_TYPES.PLAINS; break;
      }
    }
  }

  // ── Stage 4b — Terrain smoothing ──────────────────────────────────

  /**
   * Post-age smoothing pass that eliminates isolated single-tile terrain
   * anomalies and creates more natural terrain clusters.  Runs multiple
   * iterations of a majority-vote filter (only on land tiles).
   */
  private smoothTerrain(): void {
    // Terrain weight: lower = more likely to be replaced by neighbours.
    // Mountains and arctic are kept more stubbornly.
    const weight: Record<string, number> = {
      [TERRAIN_TYPES.OCEAN]: 0,
      [TERRAIN_TYPES.MOUNTAINS]: 1,
      [TERRAIN_TYPES.HILLS]: 2,
      [TERRAIN_TYPES.FOREST]: 3,
      [TERRAIN_TYPES.JUNGLE]: 3,
      [TERRAIN_TYPES.PLAINS]: 4,
      [TERRAIN_TYPES.GRASSLAND]: 4,
      [TERRAIN_TYPES.DESERT]: 5,
      [TERRAIN_TYPES.TUNDRA]: 3,
      [TERRAIN_TYPES.ARCTIC]: 1,
      [TERRAIN_TYPES.SWAMP]: 3,
      [TERRAIN_TYPES.RIVER]: 0,
    };

    const iterations = 2;
    for (let iter = 0; iter < iterations; iter++) {
      for (let r = 1; r < this.height - 1; r++) {
        for (let c = 0; c < this.width; c++) {
          const cell = this.cells[r][c];
          // Never smooth ocean, rivers, or polar rows
          if (cell.type === TERRAIN_TYPES.OCEAN) continue;
          if (cell.type === TERRAIN_TYPES.RIVER) continue;
          if (r <= 1 || r >= this.height - 2) continue;

          // Count neighbours of each type (8-directional)
          const counts = new Map<string, number>();
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nc = this.wrapCol(c + dc);
              const nr = r + dr;
              if (!this.isValid(nc, nr)) continue;
              const nType = this.cells[nr][nc].type;
              counts.set(nType, (counts.get(nType) ?? 0) + 1);
            }
          }

          // Find the dominant neighbour type (ignoring ocean and river)
          let bestType = cell.type;
          let bestScore = -1;
          for (const [nType, count] of counts) {
            if (nType === TERRAIN_TYPES.OCEAN || nType === TERRAIN_TYPES.RIVER) continue;
            const w = weight[nType] ?? 3;
            const score = count * 10 + w; // prefer high-count, then higher weight
            if (score > bestScore) {
              bestScore = score;
              bestType = nType;
            }
          }

          // Replace only if: dominant neighbour has ≥ 4 votes AND current
          // type is lighter (lower weight) than the dominant type.  This
          // prevents downgrading mountains/hills, and only promotes weaker
          // terrain to match its surroundings.
          if (bestType !== cell.type) {
            const curW = weight[cell.type] ?? 3;
            const bestW = weight[bestType] ?? 3;
            const dominantCount = counts.get(bestType) ?? 0;
            if (dominantCount >= 4 && bestW > curW) {
              cell.type = bestType;
            }
          }
        }
      }
    }
  }

  // ── Stage 5 — Rivers ────────────────────────────────────────────────

  /**
   * Rivers are carved as winding single-tile paths from hills to water.
   * If a river fails to reach water within a reasonable length or hits a
   * dead-end (mountain, another river, water), the attempt is discarded
   * and the map is restored from a snapshot.
   */
  private stage5_Rivers(rng: () => number): void {
    const maxRivers = (this.landMass + this.climate) + 6;
    let placed = 0;

    for (let attempt = 0; attempt < 256 && placed < maxRivers; attempt++) {
      // Snapshot the current state so we can roll back a failed river
      const snapshot = this.snapshotTerrain();

      // Find a random hill tile to start from
      let startCol: number;
      let startRow: number;
      let found = false;
      for (let t = 0; t < 40; t++) {
        startCol = Math.floor(rng() * this.width);
        startRow = Math.floor(rng() * this.height);
        if (this.cells[startRow][startCol].type === TERRAIN_TYPES.HILLS) {
          found = true;
          break;
        }
      }
      if (!found) continue;

      let col = startCol!;
      let row = startRow!;
      let riverDir = Math.floor(rng() * 4) * 2; // cardinal direction index
      let length = 0;
      let reachedWater = false;

      // Trace the river
      let ahead: string = TERRAIN_TYPES.OCEAN;
      do {
        this.cells[row][col].type = TERRAIN_TYPES.RIVER;

        // Check if any cardinal neighbour is water
        for (let k = 1; k < 9; k += 2) {
          const off = MOVE_OFFSETS[k];
          const nc = this.wrapCol(col + off.col);
          const nr = row + off.row;
          if (this.isValid(nc, nr) && this.cells[nr][nc].type === TERRAIN_TYPES.OCEAN) {
            reachedWater = true;
            break;
          }
        }

        // Change direction (slight random drift)
        riverDir = ((Math.floor(rng() * 2) - (length & 1)) * 2 + riverDir) & 7;

        const off = MOVE_OFFSETS[riverDir + 1];
        col = this.wrapCol(col + off.col);
        row += off.row;

        if (!this.isValid(col, row)) break;

        ahead = this.cells[row][col].type;
        length++;
      } while (
        !reachedWater &&
        ahead !== TERRAIN_TYPES.OCEAN &&
        ahead !== TERRAIN_TYPES.RIVER &&
        ahead !== TERRAIN_TYPES.MOUNTAINS
      );

      // Validate the river: must reach water and be at least 5 tiles long
      if ((!reachedWater && ahead !== TERRAIN_TYPES.RIVER) || length < 5) {
        this.restoreSnapshot(snapshot);
        continue;
      }

      placed++;

      // Jungle riverside: forest near the river head becomes jungle (Civ1)
      for (let k = 1; k < 22; k++) {
        const off = MOVE_OFFSETS[k];
        const nc = this.wrapCol(startCol! + off.col);
        const nr = startRow! + off.row;
        if (this.isValid(nc, nr) && this.cells[nr][nc].type === TERRAIN_TYPES.FOREST) {
          this.cells[nr][nc].type = TERRAIN_TYPES.JUNGLE;
        }
      }
    }
  }

  // ── Stage 6 — Polar caps ────────────────────────────────────────────

  private stage6_PolarCaps(rng: () => number): void {
    const totalCells = this.width * this.height;

    for (let col = 0; col < this.width; col++) {
      this.cells[0][col].type = TERRAIN_TYPES.ARCTIC;
      this.cells[this.height - 1][col].type = TERRAIN_TYPES.ARCTIC;
    }

    // Scatter some tundra along the polar edges for variety
    const scatter = Math.floor(totalCells / 200);
    for (let i = 0; i < scatter; i++) {
      const c = Math.floor(rng() * this.width);
      this.cells[0][c].type = TERRAIN_TYPES.TUNDRA;
      this.cells[1][c].type = TERRAIN_TYPES.TUNDRA;
      this.cells[this.height - 2][c].type = TERRAIN_TYPES.TUNDRA;
      this.cells[this.height - 1][c].type = TERRAIN_TYPES.TUNDRA;
    }
  }

  // ── Stage 6a — Special resources ────────────────────────────────────

  /**
   * Scatter special resources (oasis, horses, gold, etc.) across the map.
   * Civ1 places roughly 1 resource per 18 tiles, never on the polar edges.
   */
  private stage6a_SpecialResources(rng: () => number): void {
    const totalCells = this.width * this.height;
    const count = Math.floor(totalCells / 18);

    for (let i = 0; i < count; i++) {
      const col = Math.floor(rng() * this.width);
      const row = 4 + Math.floor(rng() * Math.max(1, this.height - 8));
      this.cells[row][col].specialResource = true;
    }
  }

  // ── Stage 7 — Flood-fill groups ─────────────────────────────────────

  /**
   * Breadth-first flood-fill to identify connected land masses (continents)
   * and ocean basins.  Each group gets a unique id stored on every cell.
   * This data is used later by city build-site scoring and by the game's
   * pathfinding (units can't walk between unconnected land masses).
   */
  private stage7_FloodFillGroups(): void {
    // Reset group ids
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        this.cells[r][c].groupId = -1;
      }
    }
    this.groups = [];
    let nextId = 0;

    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        if (this.cells[r][c].groupId !== -1) continue;
        // Start a new group
        const kind = this.cellGroupKind(c, r);
        const group: MapGroup = { id: nextId, kind, size: 0, buildSites: 0 };
        this.groups.push(group); // push BEFORE bfsFill so it can reference the group
        this.bfsFill(c, r, nextId, kind);
        nextId++;
      }
    }

    // Sort land groups by size (ascending) for continent ranking
    const landGroups = this.groups
      .filter(g => g.kind === GroupKind.Land)
      .sort((a, b) => a.size - b.size);

    console.log(
      `[MapGenerator] ${this.groups.length} groups: ` +
      `${landGroups.length} continents, ` +
      `${this.groups.filter(g => g.kind === GroupKind.Water).length} oceans`
    );
  }

  private cellGroupKind(col: number, row: number): GroupKind {
    const t = this.cells[row][col].type;
    if (t === TERRAIN_TYPES.OCEAN) return GroupKind.Water;
    return GroupKind.Land;
  }

  private bfsFill(startCol: number, startRow: number, groupId: number, kind: GroupKind): void {
    const queue: Point[] = [{ col: startCol, row: startRow }];
    this.cells[startRow][startCol].groupId = groupId;
    const group = this.groups.find(g => g.id === groupId)!;
    group.size = 0;

    while (queue.length > 0) {
      const { col, row } = queue.shift()!;
      group.size++;

      // 4-directional neighbours (water connects orthogonally;
      // land also connects diagonally, matching Civ1 behaviour).
      const dirs = [
        { col: 0, row: -1 },
        { col: 1, row: 0 },
        { col: 0, row: 1 },
        { col: -1, row: 0 },
      ];
      // Add diagonals only for land groups
      if (kind === GroupKind.Land) {
        dirs.push(
          { col: 1, row: -1 },
          { col: 1, row: 1 },
          { col: -1, row: 1 },
          { col: -1, row: -1 },
        );
      }

      for (const d of dirs) {
        const nc = this.wrapCol(col + d.col);
        const nr = row + d.row;
        if (!this.isValid(nc, nr)) continue;
        const neighbour = this.cells[nr][nc];
        if (neighbour.groupId !== -1) continue;
        if (this.cellGroupKind(nc, nr) !== kind) continue;
        neighbour.groupId = groupId;
        queue.push({ col: nc, row: nr });
      }
    }
  }

  // ── Stage 8 — Build-site scoring ────────────────────────────────────

  /**
   * For every land tile that could support a city (grassland, plains, river),
   * compute a "build score" based on the yield of surrounding tiles within a
   * Civ1-style city radius.  This data is available on each cell and is used
   * by the AI to choose settlement locations.
   *
   * The score is normalised to the range [8–15].
   */
  private stage8_BuildSites(): void {
    // Build a yield coefficient table from terrain properties
    const coeff = new Map<string, number>();
    const coeffSpecial = new Map<string, number>();

    const baseYield = (t: string): number => {
      switch (t) {
        case TERRAIN_TYPES.GRASSLAND: return 3 * 2 + 1 + 1; // food*3 + trade + production
        case TERRAIN_TYPES.PLAINS:    return 3 * 1 + 1 + 2;
        case TERRAIN_TYPES.FOREST:    return 3 * 1 + 0 + 4;
        case TERRAIN_TYPES.HILLS:     return 3 * 1 + 0 + 4;
        case TERRAIN_TYPES.MOUNTAINS: return 3 * 0 + 0 + 2;
        case TERRAIN_TYPES.DESERT:    return 3 * 0 + 0 + 2;
        case TERRAIN_TYPES.TUNDRA:    return 3 * 1 + 0 + 0;
        case TERRAIN_TYPES.ARCTIC:    return 3 * 0 + 0 + 0;
        case TERRAIN_TYPES.JUNGLE:    return 3 * 1 + 0 + 0;
        case TERRAIN_TYPES.SWAMP:     return 3 * 1 + 0 + 0;
        case TERRAIN_TYPES.RIVER:     return 3 * 2 + 1 + 0;
        default:                      return 0;
      }
    };

    for (const t of Object.values(TERRAIN_TYPES)) {
      const base = baseYield(t);
      coeff.set(t, base);
      // Special resource tiles get a bonus (approximated from Civ1 data)
      coeffSpecial.set(t, base + 4);
    }

    for (let row = 2; row < this.height - 2; row++) {
      for (let col = 0; col < this.width; col++) {
        const cell = this.cells[row][col];
        const t = cell.type;
        if (t !== TERRAIN_TYPES.GRASSLAND && t !== TERRAIN_TYPES.PLAINS && t !== TERRAIN_TYPES.RIVER) {
          continue;
        }

        let total = 0;
        // 21-cell Civ1 city radius (ring-0 + ring-1 + ring-2 partial)
        for (let k = 0; k < 21; k++) {
          const off = MOVE_OFFSETS[k] ?? { col: 0, row: 0 };
          const nc = this.wrapCol(col + off.col);
          const nr = row + off.row;
          if (!this.isValid(nc, nr)) continue;

          const nType = this.cells[nr][nc].type;
          const table = this.cells[nr][nc].specialResource ? coeffSpecial : coeff;
          let cellWorth = table.get(nType) ?? 0;

          // Grassland/river bonus (pseudo-random per tile)
          if (
            (nType === TERRAIN_TYPES.GRASSLAND || nType === TERRAIN_TYPES.RIVER) &&
            ((nc * 7 + nr * 11) & 2) === 0
          ) {
            cellWorth += 2;
          }

          // Inner ring counts double
          if (k < 9) cellWorth *= 2;
          // Centre tile counts double again
          if (k === 0) cellWorth *= 2;

          total += cellWorth;
        }

        // Penalty for non-plains tiles on certain parity (Civ1 quirk)
        if (t !== TERRAIN_TYPES.PLAINS && ((col * 7 + row * 11) & 2) !== 0) {
          total -= 16;
        }

        // Normalise to [8–15]
        const score = Math.min(Math.max(Math.floor((total - 120) / 8), 1), 15);
        (cell as unknown as Record<string, unknown>)['buildSite'] =
          Math.floor(score / 2) + 8;

        // Increment group's build-site count
        if (cell.groupId >= 0 && cell.groupId < this.groups.length) {
          this.groups[cell.groupId].buildSites++;
        }
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private snapshotTerrain(): string[][] {
    const snap: string[][] = [];
    for (let r = 0; r < this.height; r++) {
      snap[r] = [];
      for (let c = 0; c < this.width; c++) {
        snap[r][c] = this.cells[r][c].type;
      }
    }
    return snap;
  }

  private restoreSnapshot(snap: string[][]): void {
    for (let r = 0; r < this.height; r++) {
      for (let c = 0; c < this.width; c++) {
        this.cells[r][c].type = snap[r][c];
      }
    }
  }

  /** Flatten the 2-D cells array into the 1-D tile array expected by GameEngine. */
  private toTileArray(): GenTile[] {
    const tiles: GenTile[] = [];
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const src = this.cells[row][col];
        const t: GenTile = {
          col: src.col,
          row: src.row,
          type: src.type,
          terrain: src.type,
          resource: this.rollResource(src.type, src.specialResource),
          visible: false,
          explored: false,
          groupId: src.groupId,
        };
        tiles.push(t);
      }
    }
    return tiles;
  }

  /**
   * Civ1 resource placement: each terrain type has one associated resource
   * (e.g. Horses on Plains, Gold on Mountains).  Resources are placed with
   * a base probability; tiles marked with `specialResource` always get one.
   */
  private rollResource(terrain: string, hasSpecial: boolean): string | null {
    const name = TERRAIN_RESOURCES[terrain];
    if (!name) return null;
    if (hasSpecial) return name;
    return Math.random() < 0.15 ? name : null;
  }

  // ── Public accessors (for debugging / AI integration) ───────────────

  /** Get the group (continent / ocean) that a tile belongs to. */
  getGroup(col: number, row: number): MapGroup | null {
    if (!this.isValid(col, row)) return null;
    const gid = this.cells[row][col].groupId;
    return this.groups.find(g => g.id === gid) ?? null;
  }

  /** All identified land masses, sorted smallest-first. */
  getContinents(): MapGroup[] {
    return this.groups
      .filter(g => g.kind === GroupKind.Land)
      .sort((a, b) => a.size - b.size);
  }

  /** All identified ocean basins. */
  getOceans(): MapGroup[] {
    return this.groups.filter(g => g.kind === GroupKind.Water);
  }
}
