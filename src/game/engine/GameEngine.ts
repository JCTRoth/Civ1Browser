import { SquareGrid } from '../HexGrid';
import { Constants, TERRAIN_PROPS, UNIT_PROPS } from '@/utils/Constants';
import { CIVILIZATIONS, TECHNOLOGIES } from '@/data/GameData';
import { IMPROVEMENT_PROPERTIES, IMPROVEMENT_REQUIREMENTS } from '@/data/TileImprovementConstants';
import { ProductionManager } from './ProductionManager';
import { AutoProduction } from './AutoProduction';
import { UnitActionManager } from './UnitActionManager';
import { TurnManager } from './TurnManager';
import { VictoryManager } from './VictoryManager';
import { EnemySearcher, EnemyLocation, SearchResult } from './EnemySearcher';
import { ScoutMemory } from './ScoutMemory';
import { GoToManager } from './GoToManager';
import { AIManager } from './AIManager';
import { UnitTurnQueue } from './UnitTurnQueue';
import { DiplomacyManager } from './DiplomacyManager';
import type { GameActions, Unit, City, Civilization } from '../../../types/game';

interface GameSettings {
  difficulty: string;
  mapType: string;
  numberOfCivilizations: number;
  playerCivilization: number;
  startingYear: number;
  startingGold: number;
}

interface MapTile {
  terrain: string;
  resource?: string;
  improvement?: string;
  visible: boolean;
  explored: boolean;
  col: number;
  row: number;
  type?: string;
}

interface MapData {
  width: number;
  height: number;
  tiles: MapTile[];
}

interface PlayerTurnStorage {
  civilizationId: number;
  visibility: boolean[]; // Current visibility (fog of war)
  explored: boolean[]; // Permanently explored tiles
  lastKnownUnits: Map<string, Unit>; // Last known enemy unit positions
  lastKnownCities: Map<string, City>; // Last known enemy city positions
  enemyLocations: Map<number, EnemyLocation[]>; // Enemy locations per civilization [enemyCivId -> locations]
  scoutZones: Array<{ minCol: number; maxCol: number; minRow: number; maxRow: number }>; // Scout assignment zones
  turnData: Record<string, any>; // Custom per-turn data storage
}

/**
 * Main Game Engine for React Civilization Clone
 * Manages all game systems and state
 */
export default class GameEngine {
  // Static references for TurnManager to access
  static UNIT_PROPS = UNIT_PROPS;
  static TECHNOLOGIES = TECHNOLOGIES;
  
  storeActions: GameActions | null;
  squareGrid: SquareGrid | null;
  map: MapData | null;
  units: Unit[];
  cities: City[];
  civilizations: Civilization[];
  technologies: any[];
  gameSettings: GameSettings;
  isInitialized: boolean;
  currentTurn: number;
  currentYear: number;
  activePlayer: number;
  onStateChange: ((eventType: string, eventData?: any) => void) | null;
  productionManager: ProductionManager;
  autoProduction: AutoProduction;
  playerStorage: Map<number, PlayerTurnStorage>; // Per-player persistent storage
  devMode: boolean; // Developer mode flag
  roundManager: TurnManager; // kept property name for compatibility
  goToManager: GoToManager;
  victoryManager: VictoryManager;
  isGameOver: boolean;
  scoutMemory: ScoutMemory; // Phase 3.1: Scout persistence across turns
  aiManager: AIManager;
  unitTurnQueue: UnitTurnQueue; // Unit turn queue for managing unit order
  diplomacyManager: DiplomacyManager; // Civ I–style diplomacy system

  // Human-readable recap of the most recent auto-end (what was skipped), used
  // for the post-end summary notification.
  lastAutoEndSummary: string | null = null;

  // Getter for turnManager (alias for roundManager)
  get turnManager() {
    return this.roundManager;
  }

  constructor(storeActions: GameActions | null = null) {
    this.storeActions = storeActions;
    this.squareGrid = null;
    this.map = null;
    this.units = [];
    this.cities = [];
    this.civilizations = [];
    this.technologies = [];
    
    // Game settings
    this.gameSettings = {
      difficulty: 'PRINCE',
      mapType: 'EARTH',
      numberOfCivilizations: 4,
      playerCivilization: 0,
      startingYear: -4000, // 4000 BC
      startingGold: 50
    };
    
    // Game state
    this.isInitialized = false;
    this.currentTurn = 1;
    this.currentYear = -4000; // 4000 BC
    this.activePlayer = 0;
    
    // Callbacks for React state updates
    this.onStateChange = null;
    this.productionManager = new ProductionManager(this);
    this.autoProduction = new AutoProduction(this);
    this.roundManager = new TurnManager(this);
    this.goToManager = new GoToManager(this, this.roundManager);
    this.playerStorage = new Map();
    this.scoutMemory = new ScoutMemory(); // Phase 3.1: Initialize scout memory
    this.aiManager = new AIManager(this);
    this.unitTurnQueue = new UnitTurnQueue(this); // Initialize unit turn queue
    this.diplomacyManager = new DiplomacyManager(this);
    this.devMode = false;
    this.victoryManager = new VictoryManager(this);
    this.isGameOver = false;
    this.victoryManager.syncStoreActions(this.storeActions);
  }

  /**
   * Initialize player storage for a civilization
   */
  private initializePlayerStorage(civilizationId: number): void {
    if (!this.playerStorage.has(civilizationId)) {
      this.playerStorage.set(civilizationId, {
        civilizationId,
        visibility: new Array(Constants.MAP_WIDTH * Constants.MAP_HEIGHT).fill(false),
        explored: new Array(Constants.MAP_WIDTH * Constants.MAP_HEIGHT).fill(false),
        lastKnownUnits: new Map(),
        lastKnownCities: new Map(),
        enemyLocations: new Map(), // Map from enemy civId to EnemyLocation[]
        scoutZones: [], // Scout zone assignments
        turnData: {}
      });
      console.log(`[PlayerStorage] Initialized storage for civilization ${civilizationId}`);
    }
  }

  /**
   * Get player storage for a civilization
   */
  getPlayerStorage(civilizationId: number): PlayerTurnStorage | undefined {
    return this.playerStorage.get(civilizationId);
  }

  /**
   * Update visibility for a player at a specific tile
   */
  setPlayerVisibility(civilizationId: number, col: number, row: number, visible: boolean, explored: boolean = false): void {
    const storage = this.playerStorage.get(civilizationId);
    if (!storage) return;
    
    const index = row * Constants.MAP_WIDTH + col;
    storage.visibility[index] = visible;
    if (explored) {
      storage.explored[index] = true;
    }
  }

  /**
   * Check if a tile is visible to a player
   */
  isVisibleToPlayer(civilizationId: number, col: number, row: number): boolean {
    // Dev mode: everything is visible
    if (this.devMode) return true;
    
    const storage = this.playerStorage.get(civilizationId);
    if (!storage) return false;
    
    const index = row * Constants.MAP_WIDTH + col;
    return storage.visibility[index] || false;
  }

  /**
   * Check if a tile has been explored by a player
   */
  isExploredByPlayer(civilizationId: number, col: number, row: number): boolean {
    // Dev mode: everything is explored
    if (this.devMode) return true;
    
    const storage = this.playerStorage.get(civilizationId);
    if (!storage) return false;
    
    const index = row * Constants.MAP_WIDTH + col;
    return storage.explored[index] || false;
  }

  /**
   * Get all units visible to a player (respects fog of war)
   */
  getVisibleUnits(civilizationId: number): Unit[] {
    // Dev mode: see all units
    if (this.devMode) return this.units;
    
    return this.units.filter(unit => {
      // Always see own units
      if (unit.civilizationId === civilizationId) return true;
      
      // See enemy units only if their tile is currently visible
      return this.isVisibleToPlayer(civilizationId, unit.col, unit.row);
    });
  }

  /**
   * Get all cities visible to a player (respects fog of war)
   */
  getVisibleCities(civilizationId: number): City[] {
    // Dev mode: see all cities
    if (this.devMode) return this.cities;
    
    return this.cities.filter(city => {
      // Always see own cities
      if (city.civilizationId === civilizationId) return true;
      
      // See enemy cities only if their tile has been explored
      return this.isExploredByPlayer(civilizationId, city.col, city.row);
    });
  }

  /**
   * Update visibility for all tiles based on current player's unit positions
   */
  updatePlayerVisibility(civilizationId: number): void {
    const storage = this.playerStorage.get(civilizationId);
    if (!storage) return;
    
    console.log(`[Visibility] Updating visibility for civilization ${civilizationId}`);
    
    // Dev mode: reveal everything
    if (this.devMode) {
      storage.visibility.fill(true);
      storage.explored.fill(true);
      console.log(`[Visibility] Dev mode: All tiles visible and explored`);
      return;
    }
    
    // Reset current visibility (but keep explored)
    storage.visibility.fill(false);
    
    // Calculate visibility from all player units
    const playerUnits = this.units.filter(u => u.civilizationId === civilizationId);
    
    for (const unit of playerUnits) {
      // Get unit sight range (minimum radius 2 so the map isn't a tiny peephole)
      let sightRange = 2; // Default
      if (UNIT_PROPS && UNIT_PROPS[unit.type]) {
        sightRange = Math.max(2, UNIT_PROPS[unit.type].sightRange || 2);
      }
      
      // Reveal tiles around unit
      for (let dr = -sightRange; dr <= sightRange; dr++) {
        for (let dc = -sightRange; dc <= sightRange; dc++) {
          const targetCol = unit.col + dc;
          const targetRow = unit.row + dr;
          
          if (this.isValidHex(targetCol, targetRow)) {
            const distance = Math.max(Math.abs(dc), Math.abs(dr));
            if (distance <= sightRange) {
              const index = targetRow * Constants.MAP_WIDTH + targetCol;
              storage.visibility[index] = true;
              storage.explored[index] = true;
            }
          }
        }
      }
    }
    
    // Calculate visibility from all player cities
    const playerCities = this.cities.filter(c => c.civilizationId === civilizationId);
    const citySightRange = 2; // Cities can see 2 tiles
    
    for (const city of playerCities) {
      for (let dr = -citySightRange; dr <= citySightRange; dr++) {
        for (let dc = -citySightRange; dc <= citySightRange; dc++) {
          const targetCol = city.col + dc;
          const targetRow = city.row + dr;
          
          if (this.isValidHex(targetCol, targetRow)) {
            const distance = Math.max(Math.abs(dc), Math.abs(dr));
            if (distance <= citySightRange) {
              const index = targetRow * Constants.MAP_WIDTH + targetCol;
              storage.visibility[index] = true;
              storage.explored[index] = true;
            }
          }
        }
      }
    }
    
    const visibleCount = storage.visibility.filter(v => v).length;
    const exploredCount = storage.explored.filter(e => e).length;
    console.log(`[Visibility] Civilization ${civilizationId}: ${visibleCount} visible, ${exploredCount} explored`);
  }

  /**
   * Set or queue production for a city by id.
   * If queue=true the item will be added to city's build queue, otherwise it will become current production.
   */
  setCityProduction(cityId: string, item: any, queue: boolean = false) {
    return this.productionManager.setCityProduction(cityId, item, queue);
  }

  purchaseCityProduction(cityId: string, item: any, civId?: number) {
    return this.productionManager.purchaseCityProduction(cityId, item, civId);
  }

  /**
   * Remove an item from a city's build queue by index.
   */
  removeCityQueueItem(cityId: string, index: number) {
    return this.productionManager.removeCityQueueItem(cityId, index);
  }

  /**
   * Remove current production from a city
   */
  removeCurrentProduction(cityId: string) {
    return this.productionManager.removeCurrentProduction(cityId);
  }

  /**
   * Toggle auto-production for a city
   */
  toggleAutoProduction(cityId: string, enabled: boolean) {
    const city = this.cities.find(c => c.id === cityId);
    if (city) {
      (city as any).autoProduction = enabled;
      console.log(`[GameEngine] Auto-production ${enabled ? 'enabled' : 'disabled'} for city ${cityId}`);
      
      // If enabling and city has no current production, set one immediately
      if (enabled && !city.currentProduction) {
        this.autoProduction.setAutoProduction(cityId);
      }
      
      if (this.onStateChange) {
        this.onStateChange('CITY_AUTO_PRODUCTION_CHANGED', { cityId, enabled });
      }
      return true;
    }
    return false;
  }

  // Small helper: sleep for ms milliseconds
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Delay between AI unit moves (visual pacing only).
   * In AI-vs-AI auto mode there is no human watching, so moves run fast;
   * in normal games a short pause keeps the action readable without making
   * turns crawl when the AI fields many units.
   */
  getAIMoveDelay(): number {
    if (this.gameSettings?.mapType === 'AI_VS_AI') {
      return 5;
    }
    return 60;
  }

  /**
   * Delay before an AI turn starts (visual pacing only).
   */
  getAITurnStartDelay(): number {
    if (this.gameSettings?.mapType === 'AI_VS_AI') {
      return 10;
    }
    return 120;
  }

  /**
   * Execute a function while measuring its duration (used by AI subsystems).
   * Returns the function result (or null on error) and logs the elapsed ms.
   */
  measurePerformance<T>(label: string, fn: () => T): T | null {
    const start = performance.now();
    try {
      const result = fn();
      const elapsed = Math.round(performance.now() - start);
      console.log(`[PERF] ${label}: ${elapsed}ms`);
      return result;
    } catch (err) {
      console.warn(`[PERF] ${label} failed:`, err);
      return null;
    }
  }

  /**
   * Emit a structured log line (category + message + optional detail).
   * The GameLogger (via onStateChange 'GAME_LOG') persists it to disk.
   */
  log(category: string, message: string, detail: Record<string, unknown> = {}): void {
    console.log(`[${category}] ${message}`);
    if (this.onStateChange) {
      this.onStateChange('GAME_LOG', { category, message, ...detail });
    }
  }

  /**
   * Check and update the areTurnsDone flag for a unit
   * Sets to true if unit has no moves left OR is fortified OR is sleeping
   */
  private updateUnitTurnsDoneFlag(unit: any): void {
    const noMovesLeft = (unit.movesRemaining || 0) <= 0;
    const isFortified = unit.isFortified === true;
    const isSleeping = unit.isSleeping === true;
    
    unit.areTurnsDone = noMovesLeft || isFortified || isSleeping;
    
    if (unit.areTurnsDone) {
      console.log(`[GameEngine] Unit ${unit.id} turns done: movesRemaining=${unit.movesRemaining}, isFortified=${isFortified}, isSleeping=${isSleeping}`);
    }
  }

  // Legacy highlightAITarget and chooseAITarget removed — now in AIManager


  /**
   * Record enemy location in player's intelligence storage
   * Allows AI to make coordinated decisions based on known enemy positions
   *
   * @param civilizationId Civilization recording the location
   * @param enemy Search result from EnemySearcher
   */
  public recordEnemyLocation(civilizationId: number, enemy: SearchResult): void {
    const storage = this.getPlayerStorage(civilizationId);
    if (!storage || !enemy) return;

    const enemyCivId = this.getEnemyCivIdAt(enemy.col, enemy.row, civilizationId);
    if (enemyCivId < 0) return;

    const round = this.roundManager?.getRoundNumber?.() ?? 0;
    const location: EnemyLocation = {
      col: enemy.col,
      row: enemy.row,
      type: enemy.targetType,
      id: enemy.targetId,
      discoveredRound: round,
      lastSeenRound: round,
    };

    const list = storage.enemyLocations.get(enemyCivId) ?? [];
    const existing = list.find(e => e.id === enemy.targetId);
    if (existing) {
      existing.col = enemy.col;
      existing.row = enemy.row;
      existing.lastSeenRound = round;
    } else {
      list.push(location);
      storage.enemyLocations.set(enemyCivId, list);
    }

    // Feed the scout memory so scouts re-visit areas that were not seen for
    // a long time ("long time no visits"). Without this the stale re-scout
    // logic always had an empty discovery store and never fired.
    this.scoutMemory?.recordDiscovery(enemyCivId, location);
  }

  /**
   * Resolve the civilization id of whatever occupies a square (or -1).
   * Only returns the id if it differs from the searcher's own civilization.
   */
  private getEnemyCivIdAt(col: number, row: number, ownCivId: number): number {
    const unit = this.getUnitAt(col, row);
    if (unit && unit.civilizationId !== ownCivId) return unit.civilizationId;
    const city = this.getCityAt(col, row);
    if (city && city.civilizationId !== ownCivId) return city.civilizationId;
    return -1;
  }

  /**
   * Get known enemy locations for a civilization
   * Used by AI to make coordinated decisions
   */
  public getKnownEnemyLocations(civilizationId: number, enemyCivId: number): EnemyLocation[] {
    const storage = this.getPlayerStorage(civilizationId);
    return storage?.enemyLocations.get(enemyCivId) || [];
  }

  /**
   * Initialize and assign scout zones for a civilization
   * Scouts coordinate by being assigned different zones to search
   */
  public assignScoutZones(civilizationId: number): void {
    const storage = this.getPlayerStorage(civilizationId);
    if (!storage) return;

    // Count scouts for this civilization
    const scouts = this.units.filter(u => u.civilizationId === civilizationId && u.type === 'scout');
    
    // Phase 4: Measure zone calculation performance
    const startTime = performance.now();
    storage.scoutZones = EnemySearcher.calculateScoutZones(scouts.length, this.map!.width, this.map!.height);
    const endTime = performance.now();
    
    if (this.devMode && (endTime - startTime) > 2) {
      console.log(`[PERF] Zone calculation took ${(endTime - startTime).toFixed(2)}ms`);
    }

    // Phase 1.2: Enhanced logging for scout coordination
    console.log(`[AI-COORDINATION] Assigned ${scouts.length} scouts with zones:`);
    storage.scoutZones.forEach((zone, idx) => {
      console.log(`  Scout ${idx + 1}: cols ${zone.minCol}-${zone.maxCol}, rows ${zone.minRow}-${zone.maxRow}`);
    });
  }

  /**
   * Phase 3.2: Dynamic Scout Reassignment - Called when a scout dies
   * Recalculates scout zones for remaining scouts
   */
  public onScoutDeath(scoutUnit: Unit): void {
    console.log(`[AI-COORDINATION] Scout ${scoutUnit.id} died, reassigning zones for civilization ${scoutUnit.civilizationId}`);
    
    // Recalculate zones for remaining scouts
    this.assignScoutZones(scoutUnit.civilizationId);
    
    // Log remaining scouts
    const remainingScouts = this.units.filter(u => 
      u.civilizationId === scoutUnit.civilizationId && 
      u.type === 'scout' && 
      u.id !== scoutUnit.id
    );
    console.log(`[AI-COORDINATION] ${remainingScouts.length} scouts remaining after reassignment`);
  }

  /**
   * Phase 3.2: Dynamic Scout Reassignment - Called when a scout is created
   * Re-initializes zones to include the new scout
   */
  public onScoutCreated(scoutUnit: Unit): void {
    console.log(`[AI-COORDINATION] Scout ${scoutUnit.id} created, reassigning zones for civilization ${scoutUnit.civilizationId}`);
    
    // Re-initialize zones to include new scout
    this.assignScoutZones(scoutUnit.civilizationId);
    
    // Log total scouts
    const totalScouts = this.units.filter(u => 
      u.civilizationId === scoutUnit.civilizationId && 
      u.type === 'scout'
    );
    console.log(`[AI-COORDINATION] ${totalScouts.length} scouts active after reassignment`);
  }

  /**
   * Check if position is in scout's assigned zone
   * Helps scouts coordinate and avoid searching same areas
   */
  public isInScoutZone(civilizationId: number, scoutIndex: number, col: number, row: number): boolean {
    const storage = this.getPlayerStorage(civilizationId);
    if (!storage || !storage.scoutZones[scoutIndex]) return true; // No zone restriction
    
    return EnemySearcher.isInZone(col, row, storage.scoutZones[scoutIndex]);
  }

  // Legacy triggerWarriorProduction, findBestSettlementForSettler, findScoutExplorationTarget
  // removed — these now live in AIManager with strategy-aware logic


  /**
   * Process AI turn for a civilization (public method for RoundManager)
   */
  processAITurn(civilizationId: number) {
    return this.aiManager.processAITurn(civilizationId);
  }

  // Legacy runAITurn removed — AI turn logic now lives in AIManager.processAITurn()


  /**
   * Initialize the game engine with settings
   */
  async initialize(settings = {}) {
    console.log('Initializing game engine...');
    
    // Merge custom settings
    this.gameSettings = { ...this.gameSettings, ...settings };

    // Fresh game setup resets victory checks and player visibility storage
    this.isGameOver = false;
    this.victoryManager.reset();
    this.victoryManager.syncStoreActions(this.storeActions);
    this.playerStorage.clear();
    
    // Phase 3.1: Reset scout memory for new game
    this.scoutMemory.clear();
    this.scoutMemory.setCurrentRound(0);
    
    // Reset diplomacy
    this.diplomacyManager.reset();
    
    // Set dev mode from settings
    this.devMode = (settings as any).devMode || false;
    console.log(`[GameEngine] Developer mode: ${this.devMode ? 'ENABLED' : 'DISABLED'}`);
    
    // Validate playerCivilization index
    if (this.gameSettings.playerCivilization < 0 || 
        this.gameSettings.playerCivilization >= CIVILIZATIONS.length) {
      console.error('Invalid playerCivilization index:', this.gameSettings.playerCivilization);
      this.gameSettings.playerCivilization = 0; // Default to first civilization
    }
    
    // Determine map size based on map type
    const mapType = this.gameSettings.mapType || 'NORMAL_SKIRMISH';
    let mapWidth = Constants.MAP_WIDTH;
    let mapHeight = Constants.MAP_HEIGHT;
    
    if (['CLOSEUP_1V1', 'CLOSEUP_BEATUP', 'NAVAL_CLOSEUP'].includes(mapType)) {
      mapWidth = 20;
      mapHeight = 20;
      console.log(`[GameEngine] Using small map size for ${mapType}: ${mapWidth}x${mapHeight}`);
    } else if (mapType === 'AI_VS_AI') {
      mapWidth = 40;
      mapHeight = 40;
      console.log(`[GameEngine] Using medium map size for ${mapType}: ${mapWidth}x${mapHeight}`);
    }
    
    // Create hex grid system with appropriate size
    this.squareGrid = new SquareGrid(mapWidth, mapHeight);
    
    // Generate initial game state
    await this.generateWorld(mapWidth, mapHeight, mapType);
    await this.createCivilizations(mapType);
    await this.initializeTechnologies(mapType);

    // Push freshly generated state into the store if available before computing visibility
    if (this.storeActions) {
      this.storeActions.clearGameResult?.();
      this.storeActions.updateMap(this.map);
      this.storeActions.updateUnits(this.units);
      this.storeActions.updateCities(this.cities);
      this.storeActions.updateCivilizations(this.civilizations);
      this.storeActions.updateTechnologies(this.technologies);
    }

    // Initialize diplomacy between all civilizations
    this.diplomacyManager.initialize(this.civilizations.map((c: any) => c.id));
    console.log('[GameEngine] Diplomacy initialized for', this.civilizations.length, 'civilizations');

    // Initialize fog of war visibility
    this.updateVisibility();
    
    this.isInitialized = true;
    console.log('Game engine initialized successfully');
    console.log(`Starting year: ${this.formatYear(this.currentYear)}`);
    console.log(`Player civilization: ${this.civilizations[0].name}`);
    
    // Start the first turn for the active player (human player 0)
    console.log('[GameEngine] Starting first turn for player', this.activePlayer);
    this.roundManager.startTurn(this.activePlayer);
  }

  /**
   * Generate the game world with terrain
   */
  async generateWorld(mapWidth: number = Constants.MAP_WIDTH, mapHeight: number = Constants.MAP_HEIGHT, mapType: string = 'NORMAL_SKIRMISH') {
    const tiles = [];
    
    console.log(`[GameEngine] Generating world: ${mapWidth}x${mapHeight}, type: ${mapType}`);
    
    // Naval Close up - water-only map
    if (mapType === 'NAVAL_CLOSEUP') {
      for (let row = 0; row < mapHeight; row++) {
        for (let col = 0; col < mapWidth; col++) {
          tiles.push({
            col,
            row,
            type: Constants.TERRAIN.OCEAN,
            resource: Math.random() < 0.2 ? 'fish' : null, // 20% chance of fish
            visible: false,
            explored: false
          });
        }
      }
    } else {
      // Standard terrain generation for other modes
      for (let row = 0; row < mapHeight; row++) {
        for (let col = 0; col < mapWidth; col++) {
          let terrainType: string = Constants.TERRAIN.GRASSLAND;
          
          // Ocean around edges (except for small maps)
          if (mapWidth >= 40 && mapHeight >= 40) {
            if (row === 0 || row === mapHeight - 1 ||
                col === 0 || col === mapWidth - 1) {
              terrainType = Constants.TERRAIN.OCEAN;
            }
          }
          
          // Random terrain generation
          if (terrainType !== Constants.TERRAIN.OCEAN) {
            const rand = Math.random();
            if (rand < 0.05) terrainType = Constants.TERRAIN.MOUNTAINS;
            else if (rand < 0.2) terrainType = Constants.TERRAIN.HILLS;
            else if (rand < 0.3) terrainType = Constants.TERRAIN.FOREST;
            else if (rand < 0.4) terrainType = Constants.TERRAIN.DESERT;
            else if (rand < 0.5) terrainType = Constants.TERRAIN.PLAINS;
            else if (rand < 0.6) terrainType = Constants.TERRAIN.TUNDRA;
            else terrainType = Constants.TERRAIN.GRASSLAND;
          }

          tiles.push({
            col,
            row,
            type: terrainType,
            resource: Math.random() < 0.1 ? 'bonus' : null,
            visible: false,
            explored: false
          });
        }
      }
    }
    
    this.map = {
      width: mapWidth,
      height: mapHeight,
      tiles
    };
    
    console.log('World generated with', tiles.length, 'tiles');
  }

  /**
   * Create civilizations and place starting units
   */
  async createCivilizations(mapType: string = 'NORMAL_SKIRMISH') {
    const numCivs = Math.min(this.gameSettings.numberOfCivilizations, CIVILIZATIONS.length);
    const selectedCivs = [];
    
    // Always include player's chosen civilization first
    selectedCivs.push(CIVILIZATIONS[this.gameSettings.playerCivilization]);
    
    // Add other random civilizations
    const availableCivs = CIVILIZATIONS.filter((_, idx) => idx !== this.gameSettings.playerCivilization);
    for (let i = 1; i < numCivs; i++) {
      const randomIdx = Math.floor(Math.random() * availableCivs.length);
      selectedCivs.push(availableCivs.splice(randomIdx, 1)[0]);
    }

    this.civilizations = [];
    this.units = [];
    this.cities = [];

    for (let i = 0; i < selectedCivs.length; i++) {
      const civData = selectedCivs[i];
      
      // In AI_VS_AI mode every civilization is AI-controlled (no human player).
      const isHuman = i === 0 && mapType !== 'AI_VS_AI';
      const civ = {
        id: i,
        name: civData.name,
        leader: civData.leader,
        color: civData.color,
        cityNames: [...civData.cityNames],
        nextCityNameIndex: 0,
        isAlive: true,
        isHuman: isHuman,
        isAI: !isHuman,
        resources: {
          food: 0,
          production: 0,
          trade: 0,
          science: 0,
          gold: this.gameSettings.startingGold
        },
        technologies: ['irrigation', 'mining', 'roads'],
        currentResearch: null,
        researchProgress: 0,
        scienceRate: 50,
        taxRate: 0,
        luxuryRate: 50,
        government: 'despotism',
        score: 0
      };

      // Find starting position
      let startPos = null;
      let attempts = 0;
      const mapWidth = this.map?.width || Constants.MAP_WIDTH;
      const mapHeight = this.map?.height || Constants.MAP_HEIGHT;
      const minDist = mapWidth <= 20 ? 5 : 12; // Smaller distance for small maps
      
      while (!startPos && attempts < 100) {
        const col = Math.floor(Math.random() * (mapWidth - 4)) + 2;
        const row = Math.floor(Math.random() * (mapHeight - 4)) + 2;
        
        const tile = this.getTileAt(col, row);
        if (tile && tile.type !== Constants.TERRAIN.OCEAN &&
            tile.type !== Constants.TERRAIN.MOUNTAINS) {
          // Check if position is far enough from other civs
          let validPosition = true;
          for (const otherCiv of this.civilizations) {
            const otherUnits = this.units.filter(u => u.civilizationId === otherCiv.id);
            for (const unit of otherUnits) {
              if (this.squareGrid.squareDistance(col, row, unit.col, unit.row) < minDist) {
                validPosition = false;
                break;
              }
            }
          }
          
          if (validPosition) {
            startPos = { col, row };
          }
        }
        attempts++;
      }

      if (startPos) {
        // Create starting units based on map type
        console.log(`[INIT] Creating starting units for civ ${i} (${civData.name}) at (${startPos.col},${startPos.row}), mapType: ${mapType}`);
        this.createStartingUnits(i, startPos, mapType);
        
        // Create starting cities for MANY_CITIES mode
        if (mapType === 'MANY_CITIES') {
          this.createStartingCities(i, civ, startPos);
        }
      } else {
        console.warn(`[INIT] Failed to find valid starting position for civ ${i} (${civData.name}) after ${attempts} attempts`);
      }

      this.civilizations.push(civ);
    }

    console.log('Created', this.civilizations.length, 'civilizations');
    console.log('Player civilization:', this.civilizations[0].name, 'led by', this.civilizations[0].leader);
    console.log(`Map type: ${mapType}`);
    
    // Initialize player storage for each civilization
    for (let i = 0; i < this.civilizations.length; i++) {
      this.initializePlayerStorage(i);
    }
  }

  /**
   * Create starting units for a civilization based on map type
   */
  private createStartingUnits(civId: number, startPos: { col: number; row: number }, mapType: string) {
    console.log(`[UNITS] createStartingUnits called for civId ${civId}, mapType: ${mapType}, position: (${startPos.col},${startPos.row})`);
    switch (mapType) {
      case 'ALL_UNITS':
        // Create every single unit type on the board
        console.log(`[UNITS] Creating ALL unit types for civ ${civId}`);
        const allUnitTypes = Object.keys(UNIT_PROPS);
        let offsetCol = 0;
        let offsetRow = 0;
        const maxUnitsPerRow = 10; // Arrange units in a grid
        
        allUnitTypes.forEach((unitType, index) => {
          offsetCol = (index % maxUnitsPerRow) - Math.floor(maxUnitsPerRow / 2);
          offsetRow = Math.floor(index / maxUnitsPerRow);
          
          const col = startPos.col + offsetCol * 2; // Space units 2 tiles apart
          const row = startPos.row + offsetRow * 2;
          
          // Ensure the position is valid
          if (col >= 0 && col < Constants.MAP_WIDTH && row >= 0 && row < Constants.MAP_HEIGHT) {
            this.createUnit(civId, unitType, col, row);
          }
        });
        break;
        
      case 'NORMAL_SKIRMISH':
      case 'CLOSEUP_1V1':
      case 'AI_VS_AI':
      case 'TECH_LEVEL_10':
        // Standard: 1 settler
        console.log(`[UNITS] Creating 1 settler for civ ${civId}`);
        this.createUnit(civId, 'settler', startPos.col, startPos.row);
        break;
        
      case 'CLOSEUP_BEATUP':
        // 1 settler + variety of military units
        this.createUnit(civId, 'settler', startPos.col, startPos.row);
        this.createUnit(civId, 'warriors', startPos.col + 1, startPos.row);
        this.createUnit(civId, 'phalanx', startPos.col - 1, startPos.row);
        this.createUnit(civId, 'legion', startPos.col, startPos.row + 1);
        this.createUnit(civId, 'musketeers', startPos.col, startPos.row - 1);
        this.createUnit(civId, 'riflemen', startPos.col + 1, startPos.row + 1);
        break;
        
      case 'NAVAL_CLOSEUP':
        // Naval units only
        this.createUnit(civId, 'trireme', startPos.col, startPos.row);
        this.createUnit(civId, 'trireme', startPos.col + 1, startPos.row);
        break;
        
      case 'NO_SETTLERS':
        // Variety of military units, no settlers
        this.createUnit(civId, 'warriors', startPos.col, startPos.row);
        this.createUnit(civId, 'warriors', startPos.col + 1, startPos.row);
        this.createUnit(civId, 'phalanx', startPos.col - 1, startPos.row);
        this.createUnit(civId, 'legion', startPos.col, startPos.row + 1);
        this.createUnit(civId, 'musketeers', startPos.col, startPos.row - 1);
        break;
        
      case 'MANY_CITIES':
        // 2 warriors (cities created separately)
        this.createUnit(civId, 'warriors', startPos.col, startPos.row);
        this.createUnit(civId, 'warriors', startPos.col + 1, startPos.row);
        break;
        
      default:
        this.createUnit(civId, 'settler', startPos.col, startPos.row);
    }
  }

  /**
   * Create a single unit
   */
  private createUnit(civId: number, type: string, col: number, row: number) {
    const unitProps = UNIT_PROPS[type] || { movement: 1, attack: 1, defense: 1, icon: '⚔️' };
    const unitId = `${type}_${civId}_${this.units.filter(u => u.civilizationId === civId).length}`;
    
    const unit = {
      id: unitId,
      civilizationId: civId,
      type: type,
      name: (unitProps as any).name || type,
      col: col,
      row: row,
      health: 100,
      movesRemaining: unitProps.movement || 1,
      maxMoves: unitProps.movement || 1,
      isVeteran: false,
      attack: unitProps.attack || 0,
      defense: unitProps.defense || 1,
      icon: unitProps.icon || '⚔️',
      orders: null
    };
    
    this.units.push(unit);
    console.log(`[UNIT] Created ${type} for civ ${civId} at (${col},${row})`);
    
    // Phase 3.2: If a scout was created, reassign zones
    if (type === 'scout') {
      this.onScoutCreated(unit);
    }
  }

  /**
   * Create starting cities for MANY_CITIES mode
   */
  private createStartingCities(civId: number, civ: any, startPos: { col: number; row: number }) {
    const cityPositions = [
      { col: startPos.col, row: startPos.row },
      { col: startPos.col + 5, row: startPos.row },
      { col: startPos.col, row: startPos.row + 5 },
      { col: startPos.col - 5, row: startPos.row }
    ];
    
    for (let i = 0; i < 4; i++) {
      const pos = cityPositions[i];
      const tile = this.getTileAt(pos.col, pos.row);
      
      if (tile && tile.type !== Constants.TERRAIN.OCEAN && tile.type !== Constants.TERRAIN.MOUNTAINS) {
        // Get city name
        const cityName = civ.cityNames[civ.nextCityNameIndex] || `City ${civ.nextCityNameIndex + 1}`;
        civ.nextCityNameIndex++;
        
        const cityId = `city_${civId}_${this.cities.length}`;
        const city = {
          id: cityId,
          name: cityName,
          civilizationId: civId,
          col: pos.col,
          row: pos.row,
          population: 1,
          food: 0,
          foodStored: 0,
          foodNeeded: 20,
          production: 0,
          productionStored: 0,
          productionProgress: 0,
          gold: 0,
          science: 0,
          culture: 0,
          happiness: 0,
          yields: { food: 2, production: 2, trade: 0 },
          currentProduction: civ.isAI ? this.pickInitialAIProduction(civ.id) : null,
          buildQueue: civ.isAI ? [] : [],
          buildings: [],
          tiles: [],
          autoProduction: true // Enable auto-production for AI cities by default
        };
        
        this.cities.push(city);
        console.log(`[CITY] Created ${cityName} for civ ${civId} at (${pos.col},${pos.row})`);
        
        // Add improvements around city (roads and irrigation)
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const tileCol = pos.col + dc;
            const tileRow = pos.row + dr;
            const targetTile = this.getTileAt(tileCol, tileRow);
            
            if (targetTile && targetTile.type !== Constants.TERRAIN.OCEAN) {
              targetTile.improvement = (dr === 0 || dc === 0) ? 'road' : 'irrigation';
            }
          }
        }
      }
    }
  }

  /**
   * Reveal map tiles around a position for the active player
   */
  revealArea(centerCol, centerRow, radius) {
    // Update player storage
    const storage = this.playerStorage.get(this.activePlayer);
    if (storage) {
      for (let row = centerRow - radius; row <= centerRow + radius; row++) {
        for (let col = centerCol - radius; col <= centerCol + radius; col++) {
          if (this.isValidHex(col, row)) {
            const distance = Math.max(Math.abs(col - centerCol), Math.abs(row - centerRow));
            if (distance <= radius) {
              const index = row * Constants.MAP_WIDTH + col;
              storage.visibility[index] = true;
              storage.explored[index] = true;
            }
          }
        }
      }
    }
    
    // Only update the store (UI visibility) for the human player.
    // AI exploration is kept in per-player storage and must not leak to the minimap.
    if (this.storeActions && this.activePlayer === 0) {
      this.storeActions.revealArea(centerCol, centerRow, radius);
    }
  }

  /**
   * Update fog of war visibility for all tiles
   * Delegates to store actions for centralized visibility management
   */
  updateVisibility() {
    // Update store visibility for UI rendering
    if (this.storeActions) {
      this.storeActions.updateVisibility();
    }

    // Update per-player visibility storage for game logic (EnemySearcher, AI decisions, etc.)
    for (const civ of this.civilizations) {
      this.updatePlayerVisibility(civ.id);
    }
  }

  /**
   * Set visibility (but not explored) for an area
   */
  setVisibilityArea(centerCol, centerRow, radius) {
    if (!this.map) return;
    
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        const tile = this.getTileAt(col, row);
        if (tile && this.squareGrid.squareDistance(centerCol, centerRow, col, row) <= radius) {
          tile.visible = true;
          // Also mark as explored when first seen
          if (!tile.explored) {
            tile.explored = true;
          }
        }
      }
    }
  }

  /**
   * Initialize technology tree
   */
  async initializeTechnologies(mapType: string = 'NORMAL_SKIRMISH') {
    // For TECH_LEVEL_10 mode, grant all technologies to all civilizations
    if (mapType === 'TECH_LEVEL_10') {
      console.log('[TECH] Granting all technologies for TECH_LEVEL_10 mode');
      const allTechs = Object.keys(TECHNOLOGIES);
      
      for (const civ of this.civilizations) {
        civ.technologies = [...allTechs];
        console.log(`[TECH] Civilization ${civ.name} received ${allTechs.length} technologies`);
      }
    }
    // Standard starting technologies are already set in createCivilizations
    
    console.log('Technology tree initialized');
  }

  /**
   * Format year for display (4000 BC, 1000 AD, etc.)
   */
  formatYear(year) {
    if (year < 0) {
      return `${Math.abs(year)} BC`;
    } else if (year > 0) {
      return `${year} AD`;
    } else {
      return '1 BC'; // Year 0 doesn't exist historically
    }
  }

  /**
   * Get next city name for a civilization
   */
  getNextCityName(civilizationId) {
    const civ = this.civilizations[civilizationId];
    if (!civ) return 'City';
    
    const name = civ.cityNames[civ.nextCityNameIndex] || `${civ.name} City ${civ.nextCityNameIndex + 1}`;
    civ.nextCityNameIndex++;
    return name;
  }

  /**
   * Decide an AI city's first production item. The first city builds a scout
   * for exploration; subsequent cities build a defender (warrior) so the AI
   * stops flooding the map with scouts (previously every city defaulted to a
   * scout, causing heavy scout over-production).
   */
  private pickInitialAIProduction(civId: number): { type: string; itemType: string; name: string; cost: number } {
    const scoutCount = this.units.filter(
      (u) => u.civilizationId === civId && u.type === 'scout'
    ).length;
    const cityCount = this.cities.filter((c) => c.civilizationId === civId).length;

    if (scoutCount === 0 && cityCount <= 1) {
      return { type: 'unit', itemType: 'scout', name: 'Scout', cost: 15 };
    }
    return { type: 'unit', itemType: 'warrior', name: 'Warrior', cost: 10 };
  }

  /**
   * Found a new city
   */
  foundCity(col: number, row: number, civilizationId: number, customName = null) {
    const civ = this.civilizations[civilizationId];
    if (!civ) return null;

    const cityId = `city_${civilizationId}_${this.cities.length}`;
    const cityName = customName || this.getNextCityName(civilizationId);

    const city = {
      id: cityId,
      name: cityName,
      civilizationId: civilizationId,
      col: col,
      row: row,
      population: 1,
      production: 0,
      food: 0,
      gold: 0,
      science: 0,
      foodStored: 0,
      foodRequired: 20, // Food needed for next population
      shields: 0, // Production shields
      currentProduction: 'warrior', // Start building a settler
      productionQueue: [],
      autoProduction: true, // Auto Production is selected by default for every new city
      buildings: [],
      wonders: [],
      workingTiles: [], // Tiles being worked by citizens
      isCapital: this.cities.filter(c => c.civilizationId === civilizationId).length === 0,
      happiness: {
        happy: 0,
        content: 1,
        unhappy: 0
      },
      // Resource output per turn
      output: {
        food: 0,
        production: 0,
        trade: 0,
        science: 0,
        gold: 0
      }
    };

    this.cities.push(city);
    
    // Remove settler unit that founded the city
    const settlerIdx = this.units.findIndex(u => 
      u.col === col && u.row === row && u.civilizationId === civilizationId && u.type === 'settler'
    );
    if (settlerIdx !== -1) {
      this.units.splice(settlerIdx, 1);
    }

    console.log(`${civ.name} founded ${cityName} at (${col}, ${row})`);
    return city;
  }
  async createTechnologies() {
    this.technologies = [
      {
        id: 'pottery',
        name: 'Pottery',
        description: 'Allows granary construction',
        cost: 20,
        prerequisites: [],
        available: true,
        researched: false
      },
      {
        id: 'bronze_working',
        name: 'Bronze Working',
        description: 'Enables bronze weapons and tools',
        cost: 30,
        prerequisites: [],
        available: true,
        researched: false
      },
      {
        id: 'alphabet',
        name: 'Alphabet',
        description: 'Enables library construction',
        cost: 40,
        prerequisites: [],
        available: true,
        researched: false
      },
      {
        id: 'iron_working',
        name: 'Iron Working',
        description: 'Enables iron weapons',
        cost: 50,
        prerequisites: ['bronze_working'],
        available: false,
        researched: false
      }
    ];
  }

  /**
   * Convert screen coordinates to hex coordinates
   */
  screenToHex(screenX, screenY) {
    return this.squareGrid.getSquareAtPosition(screenX, screenY);
  }

  /**
   * Check if hex coordinates are valid
   */
  isValidHex(col: number, row: number) {
    return this.squareGrid.isValidSquare(col, row);
  }

  /**
   * Get tile at coordinates
   */
  getTileAt(col: number, row: number) {
    if (!this.squareGrid.isValidSquare(col, row)) return null;
    const index = row * this.map.width + col;
    return this.map.tiles[index] || null;
  }

  /**
   * Whether a tile is passable for land units (used by AI pathfinding).
   * Ocean and other impassable terrain return false.
   */
  isTilePassable(col: number, row: number): boolean {
    if (!this.squareGrid || !this.squareGrid.isValidSquare(col, row)) return false;
    const tile = this.getTileAt(col, row);
    if (!tile) return false;
    return TERRAIN_PROPS[tile.type]?.passable !== false;
  }

  /** Passability callback for terrain-aware pathfinding (land units). */
  getPassabilityFilter(): (col: number, row: number) => boolean {
    return (col: number, row: number) => this.isTilePassable(col, row);
  }

  /**
   * Get unit at coordinates
   */
  getUnitAt(col: number, row: number) {
    return this.units.find(unit => unit.col === col && unit.row === row) || null;
  }

  /**
   * Get city at coordinates
   */
  getCityAt(col: number, row: number) {
    return this.cities.find(city => city.col === col && city.row === row) || null;
  }

  /**
   * Get all units
   */
  getAllUnits() {
    // Prefer units managed by the map/unitManager when available
    try {
      if ((this as any).map && typeof (this as any).map.getAllUnits === 'function') {
        return (this as any).map.getAllUnits();
      }
    } catch (e) {
      // fall back
      console.warn('[GameEngine] getAllUnits fallback triggered due to error:', e);
    }
    return [...this.units];
  }

  /**
   * Get all cities
   */
  getAllCities() {
    // Prefer cities managed by the map/cityManager when available
    try {
      if ((this as any).map && typeof (this as any).map.getCities === 'function') {
        return (this as any).map.getCities();
      }
      if ((this as any).map && typeof (this as any).map.getAllCities === 'function') {
        return (this as any).map.getAllCities();
      }
    } catch (e) {
      console.warn('[GameEngine] getAllCities fallback triggered due to error:', e);
    }
    return [...this.cities];
  }

  /**
   * Check if a unit can move to a specific position
   */
  canUnitMoveTo(unitId: string, targetCol: number, targetRow: number) {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.log(`[canUnitMoveTo] Invalid unitId: ${unitId}`);
      return false;
    }
    if (!this.squareGrid.isValidSquare(targetCol, targetRow)) {
      console.log(`[canUnitMoveTo] Invalid target square: (${targetCol}, ${targetRow})`);
      return false;
    }

    // Check if unit has moves remaining
    if ((unit.movesRemaining || 0) <= 0) {
      console.log(`[canUnitMoveTo] Unit ${unitId} has no moves remaining.`);
      return false;
    }

    // Check if target tile is passable
    const targetTile = this.getTileAt(targetCol, targetRow);
    if (!targetTile) {
      console.log(`[canUnitMoveTo] Target tile does not exist at (${targetCol}, ${targetRow}).`);
      return false;
    }
    if (TERRAIN_PROPS[targetTile.type]?.passable === false) {
      console.log(`[canUnitMoveTo] Target tile at (${targetCol}, ${targetRow}) is not passable.`);
      return false;
    }

    // Check if there's another unit at target (combat or stacking rules)
    const targetUnit = this.getUnitAt(targetCol, targetRow);
    if (targetUnit && targetUnit.civilizationId !== unit.civilizationId) {
      console.log(`[canUnitMoveTo] Target occupied by enemy unit. Allowing attack.`);
      return true;
    }
    if (targetUnit && targetUnit.civilizationId === unit.civilizationId) {
      console.log(`[canUnitMoveTo] Target occupied by allied unit. Movement not allowed.`);
      return false;
    }

    // Calculate move cost
    const distance = this.squareGrid.chebyshevDistance(unit.col, unit.row, targetCol, targetRow);
    const moveCost = Math.max(1, TERRAIN_PROPS[targetTile.type]?.movement || 1);

    // Check if unit has enough moves (only check moveCost since pathfinding gives adjacent tiles)
    const hasEnoughMoves = (unit.movesRemaining || 0) >= moveCost;
    if (!hasEnoughMoves) {
      console.log(`[canUnitMoveTo] Insufficient moves for unit ${unitId}. Distance: ${distance}, MoveCost: ${moveCost}, MovesRemaining: ${unit.movesRemaining}`);
    }
    return hasEnoughMoves;
  }

  /**
   * Move unit to new position
   */
  moveUnit(unitId: string, targetCol: number, targetRow: number) {
    // First check if the move is possible
    if (!this.canUnitMoveTo(unitId, targetCol, targetRow)) {
      return { success: false, reason: 'cannot_move' };
    }

    const unit = this.units.find(u => u.id === unitId);
    if (!unit) return { success: false, reason: 'unit_not_found' };
    if (!this.squareGrid.isValidSquare(targetCol, targetRow)) return { success: false, reason: 'invalid_target' };

    // Check if unit has moves remaining
    if ((unit.movesRemaining || 0) <= 0) return { success: false, reason: 'no_moves_left' };

    // Check if target tile is passable
    const targetTile = this.getTileAt(targetCol, targetRow);
    if (!targetTile) return { success: false, reason: 'invalid_target' };
    if (TERRAIN_PROPS[targetTile.type]?.passable === false) return { success: false, reason: 'terrain_impassable' };

    // Check if there's another unit at target (combat or stacking rules)
    const targetUnit = this.getUnitAt(targetCol, targetRow);
    if (targetUnit && targetUnit.civilizationId !== unit.civilizationId) {
      // Combat. combatUnit auto-declares war at its start, so we must NOT gate
      // on 'not_at_war' here — that pre-check made UI attacks impossible while
      // the civilizations were still at peace.
      const combatResult = this.combatUnit(unit, targetUnit);

      // The attacker is done after combat (moves spent, possibly destroyed).
      // Drop it from the turn queue so the queue can empty and auto-end-turn
      // can trigger. combatUnit ran its own auto-end check while the attacker
      // was still queued, so re-check once the queue is cleaned — guarded to
      // the same player's turn in case combat already ended it.
      if (this.unitTurnQueue) {
        this.unitTurnQueue.checkUnitStatus(unitId);
      }
      if (this.activePlayer === unit.civilizationId) {
        this.checkAndEndTurnIfNoMoves();
      }

      // combatUnit returns boolean success currently; normalize
      const success = !!combatResult;
      return { success, reason: success ? 'combat_victory' : 'combat_defeat' };
    }
    
    // Check if there's an enemy city at target
    const targetCity = this.getCityAt(targetCol, targetRow);
    if (targetCity && targetCity.civilizationId !== unit.civilizationId) {
      // Attacking an enemy city declares war (mirrors combatUnit behavior).
      if (this.diplomacyManager) {
        const dipStatus = this.diplomacyManager.getStatus(unit.civilizationId, targetCity.civilizationId);
        if (dipStatus !== 'war') {
          this.diplomacyManager.declareWar(unit.civilizationId, targetCity.civilizationId);
        }
      }
      // City combat (native engine logic — the legacy Unit.attackCity API
      // is incompatible with engine plain-object units).
      const result = this.resolveCityCombat(unit, targetCity);

      // Drop the spent/destroyed attacker from the turn queue so the queue can
      // empty and auto-end-turn can trigger after attacking a city.
      if (this.unitTurnQueue) {
        if (result === 'captured' || result === 'city_destroyed') {
          this.unitTurnQueue.removeUnit(unitId); // attacker consumed
        } else {
          this.unitTurnQueue.checkUnitStatus(unitId); // attacker spent (moves 0)
        }
      }
      if (this.activePlayer === unit.civilizationId) {
        this.checkAndEndTurnIfNoMoves();
      }

      if (result === 'captured') {
        // Remove unit (sacrificed in capture)
        this.units = this.units.filter(u => u.id !== unitId);
        if (this.onStateChange) {
          this.onStateChange('CITY_CAPTURED', {
            city: targetCity,
            capturedBy: unit.civilizationId,
            originalCiv: targetCity.civilizationId,
          });
        }
        return { success: true, reason: 'city_captured' };
      }
      if (result === 'hit') {
        if (this.onStateChange) {
          this.onStateChange('CITY_ATTACKED', {
            city: targetCity,
            attacker: unit,
            result: { cityHit: true },
          });
        }
        return { success: true, reason: 'city_damaged' };
      }
      // Attacker destroyed (or city was destroyed by attacker — treat as captured)
      if (result === 'city_destroyed') {
        this.units = this.units.filter(u => u.id !== unitId);
        if (this.onStateChange) {
          this.onStateChange('CITY_CAPTURED', {
            city: targetCity,
            capturedBy: unit.civilizationId,
            originalCiv: targetCity.civilizationId,
          });
        }
        return { success: true, reason: 'city_captured' };
      }
      return { success: false, reason: 'attack_failed' };
    }

    // Move the unit
    const moveCost = Math.max(1, TERRAIN_PROPS[targetTile.type]?.movement || 1);

    // Require that unit has enough remaining moves to cover the move cost
    // Note: pathfinding always gives adjacent tiles, so distance is 1
    if ((unit.movesRemaining || 0) >= moveCost) {
      const fromCol = unit.col;
      const fromRow = unit.row;

      unit.col = targetCol;
      unit.row = targetRow;
      unit.movesRemaining = (unit.movesRemaining || 0) - moveCost;

      // Update turn done status
      this.updateUnitTurnsDoneFlag(unit);

      // Log movement
      console.log(`[MOVEMENT] ${unit.type} (${unit.id}) moved from (${fromCol},${fromRow}) to (${targetCol},${targetRow}), moveCost: ${moveCost}, moves remaining: ${unit.movesRemaining}`);

      // Reveal area around the unit immediately after moving so automated moves explore
      try {
        // Determine sight range (unit may define it, otherwise check UNIT_PROPS, default to 1)
        let sightRange = 1; // Default to 1 tile radius
        if (typeof (unit as any).sightRange === 'number') sightRange = (unit as any).sightRange;
        else if (UNIT_PROPS && UNIT_PROPS[String(unit.type).toLowerCase()] && typeof UNIT_PROPS[String(unit.type).toLowerCase()].sightRange === 'number') {
          sightRange = UNIT_PROPS[String(unit.type).toLowerCase()].sightRange;
        }

        // Ensure sight range is valid (non-negative)
        if (sightRange < 0) sightRange = 0;

        if (this.revealArea) {
          this.revealArea(unit.col, unit.row, sightRange);
        }
      } catch (e) {
        // Non-fatal: continue movement even if reveal fails
        console.warn('[GameEngine] revealArea after move failed', e);
      }

      // Trigger state update
      if (this.onStateChange) {
        this.onStateChange('UNIT_MOVED', { unit, targetCol, targetRow });
      }

      // Check unit status in the turn queue (may advance to next unit)
      if (this.unitTurnQueue) {
        this.unitTurnQueue.checkUnitStatus(unitId);
      }

      // Check if turn should end automatically
      this.checkAndEndTurnIfNoMoves();

      return { success: true };
    }

    return { success: false, reason: 'insufficient_moves' };
  }

  /**
   * Combat between units
   */
  combatUnit(attacker: Unit, defender: Unit) {
    // Auto-declare war if not already at war
    if (this.diplomacyManager && attacker.civilizationId !== defender.civilizationId) {
      const status = this.diplomacyManager.getStatus(attacker.civilizationId, defender.civilizationId);
      if (status !== 'war') {
        this.diplomacyManager.declareWar(attacker.civilizationId, defender.civilizationId);
        if (this.onStateChange) {
          this.onStateChange('WAR_DECLARED', {
            aggressorId: attacker.civilizationId,
            targetId: defender.civilizationId,
          });
        }
      }

      // Alliance cascade: allies of the defender also declare war on the attacker
      const defenderAllies = this.diplomacyManager.getAllies(defender.civilizationId);
      for (const allyId of defenderAllies) {
        if (allyId === attacker.civilizationId) continue;
        if (!this.diplomacyManager.isAtWar(allyId, attacker.civilizationId)) {
          this.diplomacyManager.declareWar(allyId, attacker.civilizationId);
          const allyCiv = this.civilizations[allyId];
          if (this.onStateChange) {
            this.onStateChange('WAR_DECLARED', {
              aggressorId: allyId,
              targetId: attacker.civilizationId,
            });
            this.onStateChange('DIPLOMACY_EVENT', {
              message: `${allyCiv?.name ?? 'An ally'} honors their alliance and declares war!`,
            });
          }
        }
      }
    }

    const attackerStrength = attacker.attack * (attacker.health / 100);
    const defenderStrength = defender.defense * (defender.health / 100);
    
    const attackerWins = Math.random() * (attackerStrength + defenderStrength) < attackerStrength;
    
    if (attackerWins) {
      // Attacker wins - move to defender's position
      const fromCol = attacker.col;
      const fromRow = attacker.row;

      attacker.col = defender.col;
      attacker.row = defender.row;
      attacker.movesRemaining = 0;

      // Update turn done status for attacker
      this.updateUnitTurnsDoneFlag(attacker);

      // Log combat movement
      console.log(`[COMBAT MOVEMENT] ${attacker.type} (${attacker.id}) defeated ${defender.type} (${defender.id}) and moved from (${fromCol},${fromRow}) to (${defender.col},${defender.row})`);

      // Mark defender as defeated and delay removal (5 seconds to show black X)
      (defender as any).isDefeated = true;
      (defender as any).defeatTimestamp = Date.now();
      
      if (this.onStateChange) {
        this.onStateChange('UNIT_DEFEATED', { unit: defender });
      }
      setTimeout(() => {
        this.units = this.units.filter(u => u.id !== defender.id);
        
        // Phase 3.2: If a scout died, reassign zones
        if (defender.type === 'scout') {
          this.onScoutDeath(defender);
        }
      }, 5000);

      if (this.onStateChange) {
        this.onStateChange('COMBAT_VICTORY', {
          attacker,
          defender,
          attackerFromCol: fromCol,
          attackerFromRow: fromRow,
          attackerSurvived: true,
          defenderSurvived: false,
        });
      }

      // Check if turn should end automatically
      this.checkAndEndTurnIfNoMoves();
      
      return true;
    } else {
      // Defender wins - attacker is damaged or destroyed
      attacker.health -= 25;
      attacker.movesRemaining = 0;
      
      // Update turn done status for attacker
      this.updateUnitTurnsDoneFlag(attacker);
      
      if (attacker.health <= 0) {
        // Mark attacker as defeated and delay removal (5 seconds to show black X)
        (attacker as any).isDefeated = true;
        (attacker as any).defeatTimestamp = Date.now();
        
        if (this.onStateChange) {
          this.onStateChange('UNIT_DEFEATED', { unit: attacker });
        }
        setTimeout(() => {
          this.units = this.units.filter(u => u.id !== attacker.id);
          
          // Phase 3.2: If a scout died, reassign zones
          if (attacker.type === 'scout') {
            this.onScoutDeath(attacker);
          }
        }, 5000);
      }
      
      if (this.onStateChange) {
        this.onStateChange('COMBAT_DEFEAT', {
          attacker,
          defender,
          attackerFromCol: attacker.col,
          attackerFromRow: attacker.row,
          attackerSurvived: attacker.health > 0,
          defenderSurvived: true,
        });
      }

      // Check if turn should end automatically
      this.checkAndEndTurnIfNoMoves();
      
      return false;
    }
  }

  /**
   * Resolve an attack against an enemy city (native engine logic).
   * Returns 'captured' | 'hit' | 'city_destroyed' | 'defended'.
   * - The attacker's attack vs the city's defense (population, doubled with
   *   city walls). On success the attacker is removed and the city changes
   *   hands (or is destroyed if it had only 1 population).
   */
  private resolveCityCombat(attacker: any, city: any): 'captured' | 'hit' | 'city_destroyed' | 'defended' {
    const attackerStrength = (attacker.attack || 1) * (attacker.health != null ? attacker.health / 100 : 1);

    // City defense: base = population; walls double it.
    let defense = Math.max(1, city.population || 1);
    if (city.buildings?.includes('city_walls') || city.buildings?.includes('walls')) {
      defense *= 2;
    }

    const total = attackerStrength + defense;
    const attackerWins = Math.random() * total < attackerStrength;

    // Spend the attacker's remaining movement either way.
    attacker.movesRemaining = 0;
    this.updateUnitTurnsDoneFlag(attacker);

    if (attackerWins) {
      const oldCiv = city.civilizationId;
      if ((city.population || 1) <= 1) {
        // City is destroyed rather than captured.
        this.cities = this.cities.filter(c => c.id !== city.id);
        console.log(`[COMBAT] City ${city.name} (civ ${oldCiv}) destroyed by ${attacker.type}`);
        if (this.onStateChange) {
          this.onStateChange('CITY_DESTROYED', { city, attacker });
        }
        return 'city_destroyed';
      }

      // Population drop and capture.
      city.population -= 1;
      city.civilizationId = attacker.civilizationId;
      city.buildings = city.buildings ?? [];
      console.log(`[COMBAT] City ${city.name} captured by civ ${attacker.civilizationId} (pop ${city.population})`);
      return 'captured';
    }

    // Attacker defeated — damage or destroy it.
    attacker.health = Math.max(0, (attacker.health ?? 100) - 25);
    if (attacker.health <= 0) {
      (attacker as any).isDefeated = true;
      (attacker as any).defeatTimestamp = Date.now();
      if (this.onStateChange) {
        this.onStateChange('UNIT_DEFEATED', { unit: attacker });
      }
      setTimeout(() => {
        this.units = this.units.filter(u => u.id !== attacker.id);
      }, 5000);
      console.log(`[COMBAT] ${attacker.type} destroyed attacking city ${city.name}`);
    }
    return 'defended';
  }

  /**
   * Found a city with settler
   */
  foundCityWithSettler(settlerId: string) {
    const settler = this.units.find(u => u.id === settlerId);
    if (!settler || settler.type !== 'settler') return false;

    // Check if location is valid for city
    const tile = this.getTileAt(settler.col, settler.row);
    if (!tile || tile.type === Constants.TERRAIN.OCEAN) return false;

    // Check if too close to another city
    for (const city of this.cities) {
      if (this.squareGrid.squareDistance(settler.col, settler.row, city.col, city.row) < 3) {
        return false;
      }
    }

    // Generate city name
    const civId = settler.civilizationId;
    const civ = this.civilizations[civId];
    const cityNumber = this.cities.filter(c => c.civilizationId === civId).length + 1;
    const cityName = `${civ.name} City ${cityNumber}`;

    // Create new city
    const city = {
      id: `city_${civId}_${this.cities.length}`,
      name: cityName,
      civilizationId: civId,
      col: settler.col,
      row: settler.row,
      population: 1,
      production: 0,
      food: 0,
      gold: 0,
      science: 0,
      isCapital: this.cities.filter(c => c.civilizationId === civId).length === 0,
      buildings: [],
      yields: { food: 2, production: 1, trade: 0 },
      foodStored: 0,
      foodNeeded: 20,
      productionStored: 0,
      productionProgress: 0, // Initialize production display
      currentProduction: civ.isHuman
        ? { type: 'unit', itemType: 'warrior', name: 'Warrior', cost: 10 }
        : this.pickInitialAIProduction(civId), // AI: scout for first city, defender otherwise
      buildQueue: [], // Empty: the Warrior is already the current production, never also queue it
      autoProduction: true // Auto Production is selected by default for every new city
    };

    this.cities.push(city);
    
    // Consume the settler's movement (founding a city costs one turn)
    settler.movesRemaining = 0;
    
    // Remove settler
    // NOT CHANGE THIS TO === THAN SETTLER NOT DISAPPEARS
    this.units = this.units.filter(u => u.id !== settlerId);

    // The settler is gone — remove it from the turn queue too, otherwise the
    // queue is never empty and auto-end-turn can never trigger.
    this.unitTurnQueue?.removeUnit(settlerId);

    // Log settler removal (effectively a movement off the map)
    console.log(`[SETTLER REMOVAL] ${settler.type} (${settlerId}) founded city "${cityName}" at (${settler.col},${settler.row}) and was removed from the map`);
    
    if (this.onStateChange) {
      this.onStateChange('CITY_FOUNDED', { city, settler });
    }

    // Check if turn should end automatically after founding city
    this.checkAndEndTurnIfNoMoves();

    return true;
  }

  /**
   * Check if current player has any units with moves remaining, and end turn if not
   * Only considers ACTIVE units (not sleeping or fortified) for auto-end turn
   */
  checkAndEndTurnIfNoMoves() {
    console.log('[TURN] checkAndEndTurnIfNoMoves: Checking active player', this.activePlayer);
    
    // Don't trigger auto-end while GoTo paths are being processed
    if (this.roundManager?.isProcessingGoTo?.()) {
      console.log('[TURN] ⏸️ Skipping auto-end check - GoTo paths still being processed');
      return;
    }
    
    const currentCiv = this.civilizations[this.activePlayer];
    if (!currentCiv) {
      console.warn('[TURN] No civilization found for active player', this.activePlayer);
      return;
    }

    const playerUnits = this.units.filter(u => u.civilizationId === this.activePlayer);
    
    // Only count ACTIVE units that still have actions available. A unit is
    // considered done (and therefore does not block auto-end) when it has no
    // moves left, is sleeping, is fortified, was explicitly skipped, or has
    // already been flagged as turn-done.
    const activeUnitsWithMoves = playerUnits.filter(u => 
      (u.movesRemaining || 0) > 0 && 
      !u.isSleeping && 
      !u.isFortified && 
      !u.isSkipped && 
      !u.areTurnsDone
    );
    
    // Count inactive units (sleeping or fortified)
    const inactiveUnits = playerUnits.filter(u => u.isSleeping || u.isFortified);
    
    // Check if queue is empty (more reliable than counting units)
    const queueEmpty = this.unitTurnQueue ? this.unitTurnQueue.isQueueEmpty(this.activePlayer) : true;
    const queueLength = this.unitTurnQueue ? this.unitTurnQueue.getQueueLength(this.activePlayer) : 0;
    
    console.log(`[TURN] Player ${this.activePlayer} (${currentCiv.isHuman ? 'human' : 'AI'}): ${playerUnits.length} total units, ${activeUnitsWithMoves.length} active with moves, ${inactiveUnits.length} inactive (sleeping/fortified), queue: ${queueLength} units`);
    
    if (activeUnitsWithMoves.length > 0) {
      console.log('[TURN] Active units with moves:', activeUnitsWithMoves.map(u => ({
        id: u.id,
        type: u.type,
        pos: `(${u.col},${u.row})`,
        moves: u.movesRemaining
      })));
    }

    const hasActiveUnitsWithMoves = activeUnitsWithMoves.length > 0 || !queueEmpty;
    
    // For human players, check if auto turn ending should trigger
    if (currentCiv.isHuman) {
      // Only auto-end if NO active units have moves left AND queue is empty.
      // Sleeping/fortified/skipped units don't prevent auto-end. A player with
      // zero units (e.g. their last settler just founded a city) also auto-ends
      // — there is nothing left to do this turn.
      if (!hasActiveUnitsWithMoves) {
        console.log('[TURN] All active human units have no moves and queue is empty - checking auto end turn setting');
        // Transparency: log which units the auto-end is skipping and remember
        // the summary for the post-end recap notification.
        const skipped = playerUnits
          .filter(u => (u.movesRemaining || 0) <= 0 || u.isSleeping || u.isFortified || u.isSkipped || u.areTurnsDone)
          .map(u => `${u.type}${u.isSleeping ? '(sleep)' : u.isFortified ? '(fort)' : u.isSkipped ? '(skip)' : ''}`);
        this.lastAutoEndSummary = skipped.length
          ? `${skipped.length} unit${skipped.length === 1 ? '' : 's'} skipped: ${skipped.join(', ')}`
          : 'No units with remaining actions';
        console.log(`[TURN] Auto-end summary — skipping turn, units skipped: ${skipped.length ? skipped.join(', ') : 'none'}`);
        if (this.onStateChange) {
          this.onStateChange('CHECK_AUTO_END_TURN', { civilizationId: this.activePlayer });
        }
      } else if (hasActiveUnitsWithMoves) {
        console.log('[TURN] ⏸️ Human player still has active units with moves or queue not empty, not ending turn');
        
        // If queue has units, select the next one
        if (!queueEmpty && this.unitTurnQueue) {
          const currentQueueUnit = this.unitTurnQueue.getCurrentUnit(this.activePlayer);
          if (currentQueueUnit) {
            this.selectAndFocusUnit(currentQueueUnit);
          }
        }
      }
    } else {
      // For AI players: auto-end turn when queue is empty
      if (queueEmpty && !hasActiveUnitsWithMoves) {
        console.log('[TURN] 🤖 AI player queue is empty and no active units with moves - auto-ending turn');
        // Trigger AI turn end
        if (this.roundManager && typeof this.roundManager.nextPhase === 'function') {
          this.roundManager.nextPhase();
        }
      } else {
        console.log('[TURN] ⏸️ AI player still has active units with moves or queue not empty, continuing');
      }
    }
  }

  /**
   * Process end of turn for human player.
   * This properly advances through all remaining phases (CITY_PRODUCTION, RESEARCH, END)
   * before moving to the next player's turn.
   */
  processTurn() {
    console.log('[GameEngine] processTurn: Ending human turn via TurnManager.endHumanTurn()');

    if (this.isGameOver) {
      console.log('[GameEngine] processTurn: Ignored because the game has concluded');
      return;
    }
    
    // Delegate to TurnManager.endHumanTurn() which properly advances through all phases
    if (this.roundManager && typeof this.roundManager.endHumanTurn === 'function') {
      this.roundManager.endHumanTurn();
    } else {
      console.error('[GameEngine] processTurn: TurnManager not available or endHumanTurn method missing');
    }
  }

  /**
   * Calculate civilization's science output
   */
  calculateCivScience(civId) {
    const cities = this.cities.filter(c => c.civilizationId === civId);
    return cities.reduce((total, city) => total + (city.yields.trade * 0.5), 0);
  }

  /**
   * Calculate civilization's gold output  
   */
  calculateCivGold(civId) {
    const cities = this.cities.filter(c => c.civilizationId === civId);
    return cities.reduce((total, city) => total + (city.yields.trade * 0.5), 0);
  }

  /**
   * Update technology availability based on prerequisites
   */
  updateTechnologyAvailability() {
    const currentCiv = this.civilizations[this.activePlayer];
    if (!currentCiv) return;

    this.technologies.forEach(tech => {
      if (!tech.researched && !tech.available) {
        const hasPrereqs = tech.prerequisites.every(prereq => 
          currentCiv.technologies.includes(prereq)
        );
        if (hasPrereqs) {
          tech.available = true;
        }
      }
    });
  }

  /**
   * Set current research for civilization
   */
  setResearch(civId, techId) {
    const civ = this.civilizations[civId];
    const tech = this.technologies.find(t => t.id === techId);
    
    if (civ && tech && tech.available && !tech.researched) {
      civ.currentResearch = tech;
      civ.researchProgress = 0;
    }
  }

  /**
   * Start a new game
   */
  async newGame() {
    console.log('Starting new game...');
    
    // Reset all state
    this.units = [];
    this.cities = [];
    this.civilizations = [];
    this.technologies = [];
    this.currentTurn = 1;
    this.activePlayer = 0;
    this.isGameOver = false;
    this.victoryManager.reset();
    
    // Reset fog of war and player storage
    this.playerStorage.clear();
    if (this.storeActions?.resetFogOfWar) {
      this.storeActions.resetFogOfWar();
    }
    
    // Regenerate world
    await this.generateWorld();
    await this.createCivilizations();
    await this.createTechnologies();
    
    if (this.storeActions) {
      this.storeActions.updateMap(this.map);
      this.storeActions.updateUnits(this.units);
      this.storeActions.updateCities(this.cities);
      this.storeActions.updateCivilizations(this.civilizations);
      this.storeActions.updateTechnologies(this.technologies);
    }

    // Initialize fog of war visibility
    this.updateVisibility();
  }

  async restartCurrentGame(): Promise<void> {
    console.log('[GameEngine] Restarting current game with identical settings');
    const actions = this.storeActions;
    actions?.clearGameResult();
    actions?.updateGameState({
      isLoading: true,
      gamePhase: 'loading',
      winner: null
    });

    this.isGameOver = false;
    this.victoryManager.reset();
    
    // Reset fog of war before reinitializing
    this.playerStorage.clear();
    if (actions?.resetFogOfWar) {
      actions.resetFogOfWar();
    }

    await this.initialize({ ...this.gameSettings });

    actions?.updateGameState({
      isLoading: false,
      gamePhase: 'playing',
      mapGenerated: true,
      winner: null,
      currentTurn: this.currentTurn,
      currentYear: this.currentYear
    });
  }

  shutdownToMenu(): void {
    console.log('[GameEngine] Shutting down current game and returning to menu');
    this.isGameOver = true;
    this.isInitialized = false;
    this.units = [];
    this.cities = [];
    this.civilizations = [];
    this.technologies = [];
    this.map = null;
    this.playerStorage.clear();
    this.storeActions?.clearGameResult();
  }

  /**
   * Skip a unit's turn - sets movement to 0
   */
  skipUnit(unitId: string): boolean {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] Skip: Unit ${unitId} not found`);
      return false;
    }

    const success = UnitActionManager.skipUnit(unit);

    if (success) {
      // Mark unit as done in the queue and advance to next unit
      if (this.unitTurnQueue) {
        this.unitTurnQueue.unitDone(unit.civilizationId, unitId);
      }

      // Check if this was the last unit with moves, and end turn if so
      this.checkAndEndTurnIfNoMoves();

      if (this.onStateChange) {
        this.onStateChange('UNIT_SKIPPED', { unit });
      }
    }

    return success;
  }

  /**
   * Make the current unit wait - move it to the end of the queue.
   * The unit keeps its turn later in this round.
   */
  waitUnit(unitId?: string): boolean {
    const civId = this.activePlayer;
    if (!this.unitTurnQueue) {
      console.warn('[GameEngine] waitUnit: No unit turn queue available');
      return false;
    }

    // Get the unit to wait (current queue unit or specified)
    const targetUnitId = unitId || this.unitTurnQueue.getCurrentUnitId(civId);
    if (!targetUnitId) {
      console.warn('[GameEngine] waitUnit: No unit to wait');
      return false;
    }

    const unit = this.units.find(u => u.id === targetUnitId);
    if (!unit) {
      console.warn(`[GameEngine] waitUnit: Unit ${targetUnitId} not found`);
      return false;
    }

    console.log(`[GameEngine] Unit ${targetUnitId} (${unit.type}) is waiting`);
    
    // Move unit to end of queue and advance to next unit
    const nextUnit = this.unitTurnQueue.waitUnit(civId);
    
    if (this.onStateChange) {
      this.onStateChange('UNIT_WAITING', { unit });
    }

    // Auto-select the next unit for human players
    const civ = this.civilizations[civId];
    if (civ?.isHuman && nextUnit) {
      this.selectAndFocusUnit(nextUnit);
    }

    return true;
  }

  /**
   * Advance to the next unit in the queue (for human players).
   * Called when manually cycling through units.
   */
  nextQueueUnit(): Unit | null {
    const civId = this.activePlayer;
    if (!this.unitTurnQueue) {
      return null;
    }

    const currentUnit = this.unitTurnQueue.getCurrentUnit(civId);
    if (currentUnit && (currentUnit.movesRemaining || 0) > 0) {
      // Current unit still has moves, use wait to move to next
      this.waitUnit(currentUnit.id);
    }

    return this.unitTurnQueue.getCurrentUnit(civId);
  }

  /**
   * Get the current unit in the turn queue for the active player.
   */
  getCurrentQueueUnit(): Unit | null {
    if (!this.unitTurnQueue) return null;
    return this.unitTurnQueue.getCurrentUnit(this.activePlayer);
  }

  /**
   * Get the current unit ID in the turn queue for the active player.
   */
  getCurrentQueueUnitId(): string | null {
    if (!this.unitTurnQueue) return null;
    return this.unitTurnQueue.getCurrentUnitId(this.activePlayer);
  }

  /**
   * Check if the unit queue is empty for the active player.
   */
  isQueueEmpty(): boolean {
    if (!this.unitTurnQueue) return true;
    return this.unitTurnQueue.isQueueEmpty(this.activePlayer);
  }

  /**
   * Get the number of units remaining in the queue.
   */
  getQueueLength(): number {
    if (!this.unitTurnQueue) return 0;
    return this.unitTurnQueue.getQueueLength(this.activePlayer);
  }

  /**
   * Select and focus on a unit (for queue transitions).
   */
  selectAndFocusUnit(unit: Unit): void {
    if (!unit) return;
    
    console.log(`[GameEngine] Selecting and focusing on unit ${unit.id} (${unit.type}) at (${unit.col}, ${unit.row})`);
    
    // Update store to select the unit
    if (this.storeActions) {
      this.storeActions.selectUnit(unit.id);
    }
    
    // Emit event for camera focus
    if (this.onStateChange) {
      this.onStateChange('FOCUS_UNIT', { unit });
    }
  }

  /**
   * Put a unit to sleep
   */
  unitSleep(unitId: string): boolean {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] Sleep: Unit ${unitId} not found`);
      return false;
    }

    UnitActionManager.sleepUnit(unit);

    // Update turn done status
    this.updateUnitTurnsDoneFlag(unit);

    // Remove sleeping unit from turn queue and check if turn should auto-end
    if (this.unitTurnQueue) {
      this.unitTurnQueue.checkUnitStatus(unitId);
    }
    this.checkAndEndTurnIfNoMoves();

    if (this.onStateChange) {
      this.onStateChange('UNIT_SLEPT', { unit });
    }

    return true;
  }

  /**
   * Wake up a sleeping unit
   */
  unitWake(unitId: string): boolean {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] Wake: Unit ${unitId} not found`);
      return false;
    }

    UnitActionManager.wakeUnit(unit);

    if (this.onStateChange) {
      this.onStateChange('UNIT_WOKE', { unit });
    }

    return true;
  }

  /**
   * Fortify a unit
   */
  unitFortify(unitId: string): boolean {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] Fortify: Unit ${unitId} not found`);
      return false;
    }

    UnitActionManager.fortifyUnit(unit);

    // Update turn done status
    this.updateUnitTurnsDoneFlag(unit);

    // Remove fortified unit from turn queue and check if turn should auto-end
    if (this.unitTurnQueue) {
      this.unitTurnQueue.checkUnitStatus(unitId);
    }
    this.checkAndEndTurnIfNoMoves();

    if (this.onStateChange) {
      this.onStateChange('UNIT_FORTIFIED', { unit });
    }

    return true;
  }

  // ─── Diplomat unit actions ──────────────────────────────────────────

  /**
   * Initiate diplomacy with an adjacent enemy city or unit using a diplomat.
   * Returns the available actions for the UI to present.
   */
  getDiplomatActions(diplomatId: string): { targetCivId: number; actions: string[] } | null {
    const diplomat = this.units.find(u => u.id === diplomatId);
    if (!diplomat || diplomat.type !== 'diplomat') return null;
    if ((diplomat.movesRemaining || 0) <= 0) return null;

    // Find adjacent enemy unit or city
    const neighbors = this.squareGrid!.getNeighbors(diplomat.col, diplomat.row);
    for (const n of neighbors) {
      // Check for enemy city
      const city = this.getCityAt(n.col, n.row);
      if (city && city.civilizationId !== diplomat.civilizationId) {
        const status = this.diplomacyManager.getStatus(diplomat.civilizationId, city.civilizationId);
        const actions: string[] = ['gather_intelligence'];
        if (status === 'war') {
          actions.push('propose_ceasefire', 'propose_peace', 'demand_tribute');
        } else if (status === 'ceasefire') {
          actions.push('propose_peace');
        } else if (status === 'peace') {
          actions.push('propose_alliance', 'demand_tribute');
        }
        return { targetCivId: city.civilizationId, actions };
      }

      // Check for enemy unit
      const unit = this.getUnitAt(n.col, n.row);
      if (unit && unit.civilizationId !== diplomat.civilizationId) {
        const status = this.diplomacyManager.getStatus(diplomat.civilizationId, unit.civilizationId);
        const actions: string[] = ['gather_intelligence', 'bribe_unit'];
        if (status === 'war') {
          actions.push('propose_ceasefire', 'propose_peace');
        } else if (status === 'ceasefire') {
          actions.push('propose_peace');
        } else if (status === 'peace') {
          actions.push('propose_alliance');
        }
        return { targetCivId: unit.civilizationId, actions };
      }
    }

    return null;
  }

  /**
   * Execute a diplomat action. Consumes the diplomat's move.
   */
  executeDiplomatAction(diplomatId: string, action: string, targetCivId: number): any {
    const diplomat = this.units.find(u => u.id === diplomatId);
    if (!diplomat || diplomat.type !== 'diplomat') return { success: false, reason: 'Not a diplomat' };
    if ((diplomat.movesRemaining || 0) <= 0) return { success: false, reason: 'No moves remaining' };

    let result: any;

    switch (action) {
      case 'gather_intelligence':
        result = this.diplomacyManager.gatherIntelligence(diplomat.civilizationId, targetCivId);
        diplomat.movesRemaining = 0;
        if (this.unitTurnQueue) this.unitTurnQueue.checkUnitStatus(diplomatId);
        if (this.activePlayer === diplomat.civilizationId) this.checkAndEndTurnIfNoMoves();
        return { success: true, type: 'intelligence', report: result };

      case 'propose_peace':
      case 'propose_ceasefire':
      case 'propose_alliance':
      case 'demand_tribute':
        result = this.diplomacyManager.processProposal({
          fromCivId: diplomat.civilizationId,
          toCivId: targetCivId,
          action: action as any,
          goldAmount: action === 'demand_tribute' ? 50 : undefined,
        });
        diplomat.movesRemaining = 0;
        if (this.unitTurnQueue) this.unitTurnQueue.checkUnitStatus(diplomatId);
        if (this.activePlayer === diplomat.civilizationId) this.checkAndEndTurnIfNoMoves();
        return { success: true, type: 'proposal', response: result };

      case 'bribe_unit': {
        // Find the adjacent enemy unit to bribe
        const neighbors = this.squareGrid!.getNeighbors(diplomat.col, diplomat.row);
        for (const n of neighbors) {
          const targetUnit = this.getUnitAt(n.col, n.row);
          if (targetUnit && targetUnit.civilizationId === targetCivId) {
            result = this.diplomacyManager.bribeUnit(diplomat.civilizationId, targetUnit.id);
            diplomat.movesRemaining = 0;
            // Diplomat is consumed after bribery attempt
            this.units = this.units.filter(u => u.id !== diplomatId);
            if (this.unitTurnQueue) this.unitTurnQueue.checkUnitStatus(diplomatId);
            if (this.activePlayer === diplomat.civilizationId) this.checkAndEndTurnIfNoMoves();
            return { success: true, type: 'bribe', response: result };
          }
        }
        return { success: false, reason: 'No adjacent unit to bribe' };
      }

      default:
        return { success: false, reason: 'Unknown action' };
    }
  }

  /**
   * Build an improvement (road, farm, etc.)
   */
  buildImprovement(unitId: string, improvementType: string): boolean {
    console.log(`[GameEngine] buildImprovement called: unitId=${unitId}, type=${improvementType}`);
    
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] Build: Unit ${unitId} not found`);
      return false;
    }

    console.log(`[GameEngine] Build: Unit found:`, {
      id: unit.id,
      type: unit.type,
      col: unit.col,
      row: unit.row,
      movesRemaining: unit.movesRemaining
    });

    // Get improvement properties to determine build time
    const improvementProps = IMPROVEMENT_PROPERTIES[improvementType];
    const buildTurns = improvementProps?.turns || 1; // Default to 1 if not found
    console.log(`[GameEngine] Build: Improvement props:`, improvementProps, 'turns:', buildTurns);

    // Check if unit can perform this action
    const canPerform = UnitActionManager.canPerformAction(unit, 'build_improvement', buildTurns);
    console.log(`[GameEngine] Build: Can perform action:`, canPerform);
    
    if (!canPerform) {
      console.warn(`[GameEngine] Build: Unit cannot perform this action`);
      return false;
    }

    const tile = this.getTileAt(unit.col, unit.row);
    if (!tile) {
      console.warn(`[GameEngine] Build: No tile at (${unit.col},${unit.row})`);
      return false;
    }

    console.log(`[GameEngine] Build: Tile found:`, {
      col: tile.col,
      row: tile.row,
      terrain: tile.terrain,
      improvement: tile.improvement
    });

    // Check terrain restrictions
    if (improvementProps?.terrainRestrictions) {
      const terrain = tile.terrain || tile.type;
      if (!improvementProps.terrainRestrictions.includes(terrain)) {
        console.warn(`[GameEngine] Build: Terrain ${terrain} not valid for ${improvementType} (requires: ${improvementProps.terrainRestrictions.join(', ')})`);
        return false;
      }
    }

    // Check if this improvement requires a prerequisite improvement (upgrade path)
    const requiredBase = (IMPROVEMENT_REQUIREMENTS as Record<string, string>)[improvementType];
    if (requiredBase) {
      if (tile.improvement !== requiredBase) {
        console.warn(`[GameEngine] Build: ${improvementType} requires existing ${requiredBase}, tile has: ${tile.improvement}`);
        return false;
      }
      // Upgrade: replace the existing improvement
    } else if (tile.improvement) {
      // No upgrade path and tile already has an improvement
      console.log(`[GameEngine] Build: Tile already has improvement: ${tile.improvement}`);
      return false;
    }

    // Build the improvement
    tile.improvement = improvementType;
    unit.movesRemaining = (unit.movesRemaining || 0) - buildTurns;

    // Update turn done status
    this.updateUnitTurnsDoneFlag(unit);

    console.log(`[GameEngine] Unit ${unit.id} built ${improvementType} at (${unit.col},${unit.row}) in ${buildTurns} turns. Moves remaining: ${unit.movesRemaining}`);

    if (this.onStateChange) {
      this.onStateChange('IMPROVEMENT_BUILT', { unit, tile, improvementType });
    }

    // Remove the worker from the turn queue if it spent all its moves, so the
    // queue can empty and auto-end-turn can trigger after building.
    if (this.unitTurnQueue) {
      this.unitTurnQueue.checkUnitStatus(unitId);
    }

    // Check if turn should end
    this.checkAndEndTurnIfNoMoves();

    return true;
  }

  /**
   * Clean pollution from the tile the unit is standing on
   */
  cleanPollution(unitId: string): boolean {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] cleanPollution: Unit ${unitId} not found`);
      return false;
    }

    const canPerform = UnitActionManager.canPerformAction(unit, 'clean_pollution', 2);
    if (!canPerform) {
      return false;
    }

    const tile = this.getTileAt(unit.col, unit.row);
    if (!tile) {
      return false;
    }

    if (tile.improvement !== 'pollution') {
      console.warn(`[GameEngine] cleanPollution: No pollution at (${unit.col},${unit.row})`);
      return false;
    }

    tile.improvement = null;
    unit.movesRemaining = (unit.movesRemaining || 0) - 2;
    this.updateUnitTurnsDoneFlag(unit);

    console.log(`[GameEngine] Unit ${unit.id} cleaned pollution at (${unit.col},${unit.row})`);

    if (this.onStateChange) {
      this.onStateChange('POLLUTION_CLEANED', { unit, tile });
    }

    // Remove the worker from the turn queue if it spent all its moves, so the
    // queue can empty and auto-end-turn can trigger after cleaning.
    if (this.unitTurnQueue) {
      this.unitTurnQueue.checkUnitStatus(unitId);
    }

    this.checkAndEndTurnIfNoMoves();
    return true;
  }

  /**
   * Attach a unit to another unit (deletes the attaching unit)
   */
  attachUnit(unitId: string, targetUnitId: string): boolean {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] Attach: Unit ${unitId} not found`);
      return false;
    }

    const targetUnit = this.units.find(u => u.id === targetUnitId);
    if (!targetUnit) {
      console.warn(`[GameEngine] Attach: Target unit ${targetUnitId} not found`);
      return false;
    }

    if (unit.civilizationId !== targetUnit.civilizationId) {
      console.warn(`[GameEngine] Attach: Cannot attach to enemy unit`);
      return false;
    }

    if (unit.id === targetUnit.id) {
      console.warn(`[GameEngine] Attach: Cannot attach to self`);
      return false;
    }

    // Move the unit to the target's position and delete it
    unit.col = targetUnit.col;
    unit.row = targetUnit.row;
    this.units = this.units.filter(u => u.id !== unitId);

    // The attached unit is gone — remove it from the turn queue so the queue
    // can empty and auto-end-turn can trigger.
    this.unitTurnQueue?.removeUnit(unitId);
    
    // Phase 3.2: If a scout was disbanded, reassign zones
    if (unit.type === 'scout') {
      this.onScoutDeath(unit);
    }

    console.log(`[ATTACH] Unit ${unit.type} (${unitId}) attached to ${targetUnit.type} (${targetUnitId}) at (${targetUnit.col},${targetUnit.row}) and was deleted`);

    if (this.onStateChange) {
      this.onStateChange('UNIT_ATTACHED', { unit, targetUnit });
    }

    // Check if turn should end automatically
    this.checkAndEndTurnIfNoMoves();

    return true;
  }

  /**
   * Disband (permanently remove) a unit from the game
   */
  disbandUnit(unitId: string): boolean {
    const unit = this.units.find(u => u.id === unitId);
    if (!unit) {
      console.warn(`[GameEngine] disbandUnit: Unit ${unitId} not found`);
      return false;
    }

    // Only allow disbanding own units
    if (unit.civilizationId !== this.activePlayer) {
      console.warn(`[GameEngine] disbandUnit: Cannot disband enemy unit`);
      return false;
    }

    console.log(`[GameEngine] Disbanding unit ${unit.type} (${unitId}) at (${unit.col},${unit.row})`);

    // Remove from unit turn queue
    if (this.unitTurnQueue) {
      this.unitTurnQueue.unitDone(unit.civilizationId, unitId);
    }

    // Remove from units array
    this.units = this.units.filter(u => u.id !== unitId);

    // Handle scout death for AI zone reassignment
    if (unit.type === 'scout') {
      this.onScoutDeath(unit);
    }

    if (this.onStateChange) {
      this.onStateChange('UNIT_DISBANDED', { unit });
    }

    this.checkAndEndTurnIfNoMoves();
    return true;
  }

  /**
   * Rush production in a city by spending gold
   */
  rushCityProduction(cityId: string): boolean {
    const civ = this.civilizations[this.activePlayer];
    if (!civ?.isHuman) return false;

    const city = this.cities.find(c => c.id === cityId);
    if (!city || city.civilizationId !== this.activePlayer) {
      console.warn('[GameEngine] rushCityProduction: City not found or not owned');
      return false;
    }

    if (!city.currentProduction) {
      console.warn('[GameEngine] rushCityProduction: No production in progress');
      return false;
    }

    const totalCost = city.currentProduction.cost || 0;
    const stored = city.productionStored || city.productionProgress || 0;
    const remaining = Math.max(0, totalCost - stored);
    // Gold cost = 2x the remaining production shields
    const goldCost = remaining * 2;

    if (goldCost <= 0) {
      console.log('[GameEngine] rushCityProduction: Production already complete');
      return false;
    }

    const civResources = civ.resources || { gold: 0 };
    if ((civResources.gold || 0) < goldCost) {
      console.warn(`[GameEngine] rushCityProduction: Not enough gold (need ${goldCost}, have ${civResources.gold})`);
      return false;
    }

    // Deduct gold
    civResources.gold = (civResources.gold || 0) - goldCost;

    // Complete production
    city.productionStored = totalCost;
    if (city.productionProgress !== undefined) {
      city.productionProgress = totalCost;
    }

    console.log(`[GameEngine] Rushed production in ${city.name}: spent ${goldCost} gold`);

    if (this.onStateChange) {
      this.onStateChange('PRODUCTION_RUSHED', { city, goldCost });
    }

    return true;
  }

  /**
   * Cycle through units stacked on the same tile as the given unit
   */
  cycleUnitsInTile(unitId: string): string | null {
    const selectedUnit = this.units.find(u => u.id === unitId);
    if (!selectedUnit) return null;

    // Find all own units on the same tile
    const stackedUnits = this.units.filter(
      u => u.col === selectedUnit.col && u.row === selectedUnit.row
        && u.civilizationId === selectedUnit.civilizationId
    );

    if (stackedUnits.length <= 1) return null;

    // Find current index and pick next
    const currentIdx = stackedUnits.findIndex(u => u.id === unitId);
    const nextIdx = (currentIdx + 1) % stackedUnits.length;
    const nextUnit = stackedUnits[nextIdx];

    this.selectAndFocusUnit(nextUnit);
    console.log(`[GameEngine] Cycled to unit ${nextUnit.type} (${nextUnit.id})`);
    return nextUnit.id;
  }

  /**
   * Select a city by its index (0-based) among the current player's cities
   */
  selectCityByIndex(index: number): boolean {
    const playerCities = this.cities.filter(c => c.civilizationId === this.activePlayer);
    if (index < 0 || index >= playerCities.length) {
      return false;
    }

    const city = playerCities[index];
    if (this.storeActions) {
      this.storeActions.selectCity(city.id);
      this.storeActions.showDialog('city-details');
    }
    console.log(`[GameEngine] Selected city ${city.name} (index ${index})`);
    return true;
  }

  /**
   * Return the save game data as a JSON string (without side-effects).
   * Returns null if serialization fails.
   */
  /**
   * Serialize the entire game state to a JSON string.
   * Includes map, units, cities, civs, tech, diplomacy, scout memory,
   * player storage, and unit GoTo paths for full game restoration.
   */
  getSaveJSON(): string | null {
    try {
      // Serialize playerStorage (per-player visibility, explored, AI state)
      const playerStorageSerialized: Record<number, any> = {};
      for (const [civId, storage] of this.playerStorage.entries()) {
        playerStorageSerialized[civId] = {
          civilizationId: storage.civilizationId,
          visibility: Array.from(storage.visibility),
          explored: Array.from(storage.explored),
          lastKnownUnits: Array.from(storage.lastKnownUnits.entries()),
          lastKnownCities: Array.from(storage.lastKnownCities.entries()),
          enemyLocations: Array.from(storage.enemyLocations.entries()),
          scoutZones: storage.scoutZones.map(z => ({ ...z })),
          turnData: JSON.parse(JSON.stringify(storage.turnData))
        };
      }

      // Serialize scout memory discoveries
      const scoutDiscoveries: Record<number, any[]> = {};
      if (this.scoutMemory) {
        const allCivIds = this.civilizations.map(c => c.id);
        for (const civId of allCivIds) {
          const discoveries = this.scoutMemory.getDiscoveries(civId);
          if (discoveries.length > 0) {
            scoutDiscoveries[civId] = discoveries.map(d => ({ ...d }));
          }
        }
      }

      // Serialize diplomacy state
      const diplomacyRelations: any[] = [];
      const diplomacyEvents: any[] = [];
      if (this.diplomacyManager) {
        const rels = this.diplomacyManager.getAllRelations();
        for (const rel of rels) {
          diplomacyRelations.push({
            civA: rel.civA,
            civB: rel.civB,
            status: rel.status,
            since: rel.since,
            reputationModifier: rel.reputationModifier,
            treatiesBrokenByA: rel.treatiesBrokenByA,
            treatiesBrokenByB: rel.treatiesBrokenByB,
            activeTreaties: [...rel.activeTreaties],
            treatySince: { ...rel.treatySince },
            tradeGoldPerTurn: rel.tradeGoldPerTurn,
          });
        }
        const events = this.diplomacyManager.getEventLog();
        for (const evt of events) {
          diplomacyEvents.push({
            type: evt.type,
            fromCivId: evt.fromCivId,
            toCivId: evt.toCivId,
            details: evt.details,
            goldAmount: evt.goldAmount,
          });
        }
      }

      // Serialize unit GoTo paths from roundManager
      const unitPaths: Record<string, Array<{ col: number; row: number }>> = {};
      if (this.roundManager) {
        const allPaths = this.roundManager.getAllUnitPaths();
        for (const [unitId, path] of allPaths.entries()) {
          if (path.length > 0) {
            unitPaths[unitId] = path.map(p => ({ col: p.col, row: p.row }));
          }
        }
      }

      const saveData = {
        version: 2, // bumped from 1 to 2 with new fields
        timestamp: Date.now(),
        gameSettings: this.gameSettings,
        currentTurn: this.currentTurn,
        currentYear: this.currentYear,
        activePlayer: this.activePlayer,
        roundNumber: this.roundManager ? this.roundManager.getRoundNumber() : 0,
        map: this.map,
        units: this.units.map(u => ({ ...u })),
        cities: this.cities.map(c => ({ ...c })),
        civilizations: this.civilizations.map(c => ({ ...c })),
        technologies: this.technologies,
        // New fields for full state restoration
        playerStorage: playerStorageSerialized,
        scoutDiscoveries,
        diplomacyRelations,
        diplomacyEvents,
        unitPaths,
        scoutMemoryRound: this.scoutMemory ? this.scoutMemory.getCurrentRound() : 0,
      };
      return JSON.stringify(saveData);
    } catch (e) {
      console.error('[GameEngine] getSaveJSON failed:', e);
      return null;
    }
  }

  /**
   * Save game state to localStorage and trigger GAME_SAVED event.
   */
  saveGame(): boolean {
    try {
      const json = this.getSaveJSON();
      if (!json) return false;
      localStorage.setItem('civ1_savegame', json);
      console.log(`[GameEngine] Game saved (${(json.length / 1024).toFixed(1)} KB)`);

      if (this.onStateChange) {
        this.onStateChange('GAME_SAVED', { turn: this.currentTurn });
      }

      return true;
    } catch (e) {
      console.error('[GameEngine] Save failed:', e);
      return false;
    }
  }

  /**
   * Load game state from localStorage
   */
  async loadGame(): Promise<boolean> {
    try {
      const json = localStorage.getItem('civ1_savegame');
      if (!json) {
        console.warn('[GameEngine] No save game found');
        return false;
      }

      const saveData = JSON.parse(json);
      if (!saveData || (saveData.version !== 1 && saveData.version !== 2)) {
        console.warn('[GameEngine] Invalid or incompatible save data, version:', saveData?.version);
        return false;
      }

      // ── Full internal reset before loading ──
      // This prevents any old state from leaking into the loaded game
      this.isGameOver = true;
      this.isInitialized = false;
      this.map = null;
      this.units = [];
      this.cities = [];
      this.civilizations = [];
      this.technologies = [];
      this.squareGrid = null;

      // Reset all subsystems
      this.playerStorage.clear();
      this.scoutMemory.clear();
      this.diplomacyManager.reset();
      this.victoryManager.reset();
      this.victoryManager.syncStoreActions(this.storeActions);

      // ── Restore state from save ──
      this.gameSettings = saveData.gameSettings;
      this.currentTurn = saveData.currentTurn;
      this.currentYear = saveData.currentYear;
      this.activePlayer = saveData.activePlayer;
      this.map = saveData.map;
      this.units = saveData.units;
      this.cities = saveData.cities;
      this.civilizations = saveData.civilizations;
      this.technologies = saveData.technologies;
      this.isInitialized = true;
      this.isGameOver = false;

      // Recreate grid from saved map dimensions
      if (this.map) {
        this.squareGrid = new SquareGrid(this.map.width, this.map.height);
      }

      // ── Restore diplomacy state ──
      this.diplomacyManager.initialize(this.civilizations.map((c: any) => c.id));
      if (saveData.version >= 2 && saveData.diplomacyRelations) {
        this.diplomacyManager.restoreRelations(saveData.diplomacyRelations);
      }
      if (saveData.version >= 2 && saveData.diplomacyEvents) {
        this.diplomacyManager.restoreEventLog(saveData.diplomacyEvents);
      }

      this.victoryManager.syncStoreActions(this.storeActions);

      // ── Restore player storage (per-player visibility, explored maps) ──
      if (saveData.version >= 2 && saveData.playerStorage) {
        for (const [civIdStr, stored] of Object.entries(saveData.playerStorage)) {
          const civId = Number(civIdStr);
          const storage = stored as any;
          this.initializePlayerStorage(civId);
          const current = this.playerStorage.get(civId);
          if (current) {
            // Restore visibility/explored arrays
            if (Array.isArray(storage.visibility)) {
              for (let i = 0; i < storage.visibility.length; i++) {
                current.visibility[i] = storage.visibility[i];
              }
            }
            if (Array.isArray(storage.explored)) {
              for (let i = 0; i < storage.explored.length; i++) {
                current.explored[i] = storage.explored[i];
              }
            }
            // Restore last known units
            current.lastKnownUnits = new Map();
            if (Array.isArray(storage.lastKnownUnits)) {
              for (const [key, val] of storage.lastKnownUnits) {
                current.lastKnownUnits.set(key, val);
              }
            }
            // Restore last known cities
            current.lastKnownCities = new Map();
            if (Array.isArray(storage.lastKnownCities)) {
              for (const [key, val] of storage.lastKnownCities) {
                current.lastKnownCities.set(key, val);
              }
            }
            // Restore enemy locations
            current.enemyLocations = new Map();
            if (Array.isArray(storage.enemyLocations)) {
              for (const [key, val] of storage.enemyLocations) {
                current.enemyLocations.set(Number(key), val);
              }
            }
            // Restore scout zones
            current.scoutZones = Array.isArray(storage.scoutZones)
              ? storage.scoutZones.map((z: any) => ({ ...z }))
              : [];
            // Restore AI turn data
            current.turnData = storage.turnData
              ? JSON.parse(JSON.stringify(storage.turnData))
              : {};
          }
        }
      }

      // ── Restore scout memory discoveries ──
      if (saveData.version >= 2 && saveData.scoutDiscoveries) {
        // Restore round number first
        if (typeof saveData.scoutMemoryRound === 'number') {
          this.scoutMemory.setCurrentRound(saveData.scoutMemoryRound);
        }
        this.scoutMemory.restoreDiscoveries(saveData.scoutDiscoveries);
      }

      // ── Restore unit GoTo paths ──
      if (saveData.version >= 2 && saveData.unitPaths && this.roundManager) {
        for (const [unitId, path] of Object.entries(saveData.unitPaths)) {
          const typedPath = path as Array<{ col: number; row: number }>;
          if (typedPath.length > 0) {
            this.roundManager.setUnitPath(unitId, typedPath);
          }
        }
      }

      // ── Restore round number ──
      if (saveData.version >= 2 && typeof saveData.roundNumber === 'number') {
        // The round number is restored via the TurnManager
        // It will be set when advanceTurn recalculates
      }

      // ── Rebuild unit turn queue for the active player ──
      if (this.unitTurnQueue) {
        this.unitTurnQueue.initializeQueue(this.activePlayer);
        for (const unit of this.units) {
          if (unit.civilizationId === this.activePlayer) {
            this.unitTurnQueue.addUnit(unit.civilizationId, unit.id);
          }
        }
      }

      // ── Sync restored state to the Zustand store ──
      if (this.storeActions) {
        this.storeActions.clearGameResult?.();
        this.storeActions.updateMap(this.map);
        this.storeActions.updateUnits([...this.units]);
        this.storeActions.updateCities([...this.cities]);
        this.storeActions.updateCivilizations([...this.civilizations]);
        this.storeActions.updateTechnologies(this.technologies);
        this.storeActions.updateGameState({
          currentTurn: this.currentTurn,
          currentYear: this.currentYear,
          isLoading: false,
          gamePhase: 'playing',
          mapGenerated: true,
          selectedHex: null,
          selectedUnit: null,
          activeUnit: null,
          selectedCity: null,
          gameResult: null,
          winner: null,
        });
        this.storeActions.updateVisibility();
      }

      console.log(`[GameEngine] Game loaded — Turn ${this.currentTurn}, Year ${this.currentYear}`);

      if (this.onStateChange) {
        this.onStateChange('GAME_LOADED', { turn: this.currentTurn });
      }

      return true;
    } catch (e) {
      console.error('[GameEngine] Load failed:', e);
      return false;
    }
  }
}
