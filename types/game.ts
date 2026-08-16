// Game types for Civ1Browser

export type VictoryReason = 'elimination' | 'moonshot' | 'domination';

export class GameResult {
  outcome: 'victory' | 'defeat';
  civilizationId: number;
  civName: string;
  reason: VictoryReason;
  isHuman: boolean;
  timestamp: number;

  constructor(params: {
    outcome: 'victory' | 'defeat';
    civilizationId: number;
    civName: string;
    reason: VictoryReason;
    isHuman: boolean;
    timestamp?: number;
  }) {
    this.outcome = params.outcome;
    this.civilizationId = params.civilizationId;
    this.civName = params.civName;
    this.reason = params.reason;
    this.isHuman = params.isHuman;
    this.timestamp = params.timestamp ?? Date.now();
  }
}

export interface GameState {
  isLoading: boolean;
  isGameStarted: boolean;
  currentTurn: number;
  gamePhase: 'menu' | 'loading' | 'playing' | 'paused' | 'completed';
  selectedHex: { col: number; row: number } | null;
  selectedUnit: string | null;
  activeUnit: string | null;
  selectedCity: string | null;
  activePlayer: number;
  mapGenerated: boolean;
  winner: string | null;
  currentYear?: number;
  gameResult: GameResult | null;
}

export interface MapState {
  width: number;
  height: number;
  tiles: Tile[];
  visibility: boolean[];
  revealed: boolean[];
}

interface Tile {
  terrain: string;
  resource?: string;
  improvement?: string;
  /** Whether this tile contains a Civ1 village (goody hut). */
  village?: boolean;
  visible: boolean;
  explored: boolean;
  col: number;
  row: number;
  type?: string;
}

/** Outcome of a Civ1 village (goody hut) encounter. */
export type VillageOutcome =
  | 'advanced_tribe'
  | 'scroll_of_ancient_wisdom'
  | 'valuable_metals'
  | 'friendly_mercenaries'
  | 'barbarians'
  | 'destroyed';

/** Data shown by the village-result modal. */
export interface VillageResult {
  outcome: VillageOutcome;
  civId: number;
  col: number;
  row: number;
  cityName?: string;
  techId?: string;
  techName?: string;
  goldAmount?: number;
  unitType?: string;
  unitName?: string;
  barbarianCount?: number;
  /** True when an air or barbarian unit destroyed the village with no effect. */
  destroyed?: boolean;
}

/**
 * An AI-initiated diplomatic proposal (ceasefire, peace, alliance, tribute)
 * awaiting the human player's accept/reject decision in the negotiation
 * screen. Surfaced via `showIncomingDiplomacyOffer`; cleared once the player
 * responds.
 */
export interface IncomingDiplomacyOffer {
  /** Civilization that made the offer. */
  fromCivId: number;
  /** Diplomatic action being proposed (e.g. 'propose_peace'). */
  action: string;
  /** Gold demanded/offered (tribute demands). */
  goldAmount?: number;
  /** Human-readable message describing the offer. */
  message?: string;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  minZoom: number;
  maxZoom: number;
}

export interface Unit {
  id: string;
  type: string;
  civilizationId: number;
  col: number;
  row: number;
  movesRemaining: number;
  health: number;
  icon: string;
  status?: string;
  name?: string;
  isVeteran?: boolean;
  maxMoves?: number;
  movement?: number;
  attack?: number;
  defense?: number;
  maintenance?: number;
  orders?: any;
  isFortified?: boolean;
  isSkipped?: boolean;
  isSleeping?: boolean;
  homeCityId?: string | null;
  plannedPath?: { col: number; row: number }[];
  areTurnsDone?: boolean; // Set to true when unit has no moves left or is fortified/sleeping
}

export interface City {
  id: string;
  name: string;
  civilizationId: number;
  col: number;
  row: number;
  population: number;
  production: number;
  food: number;
  gold: number;
  science: number;
  // Per-turn economic outputs derived from the civ's Tax/Science/Luxury rates
  tax?: number;      // gold to treasury from this city's commerce
  luxury?: number;   // commerce spent on happiness
  scienceBonus?: number; // direct science bonus from buildings (e.g. library)
  // Happiness points (luxury + building effects). The legacy `foundCity` path
  // used an object form { happy, content, unhappy } — kept for compatibility.
  happiness?: number | { happy: number; content: number; unhappy: number };
  unhappiness?: number; // unhappiness points (population-based)
  disorder?: boolean;   // true when unhappiness > happiness (halts production/growth)
  capturedTurns?: number; // remaining turns of post-capture unrest (resentful citizens)
  // Current production progress (0..1 or absolute depending on implementation)
  productionProgress?: number;
  // Queue of production items (units/buildings)
  buildQueue?: Array<any>;
  // Currently active production item
  currentProduction?: any | null;
  // Production carried over from previous completed item
  carriedOverProgress?: number;
  isCapital?: boolean;
  yields?: {
    food: number;
    production: number;
    trade: number;
  };
  foodStored?: number;
  foodNeeded?: number;
  foodRequired?: number;
  productionStored?: number;
  buildings?: any[];
  shields?: number;
  productionQueue?: any[];
  autoProduction?: boolean; // When true, the engine auto-selects production for this city
  output?: any;
  processTurn?: (gameMap: any, turn: number) => void;
}

/**
 * Fixed per-civilization AI identity that drives production (and later
 * research). See CIV_PRODUCTION_PROFILES in src/game/engine/AITypes.ts.
 */
export type AIProductionProfile =
  | 'military_expansion'
  | 'science_focus'
  | 'balanced_growth'
  | 'defensive_turtle'
  | 'wonder_rush'
  | 'early_expansion';

export interface Civilization {
  id: number;
  name: string;
  color: string;
  isAlive: boolean;
  capital?: any; // Reference to the capital city
  resources: {
    food: number;
    production: number;
    trade: number;
    science: number;
    gold: number;
  };
  // Economic rates (percentages; taxRate + scienceRate + luxuryRate must equal 100)
  taxRate?: number;
  scienceRate?: number;
  luxuryRate?: number;
  government?: string;
  // Revolution: >0 means the civ is in anarchy, counting down each turn before
  // the pendingGovernment takes effect. 0/undefined means no revolution.
  revolutionTurns?: number;
  pendingGovernment?: string;
  /** Set of civilization ids this civ is currently at war with. */
  warWith?: Set<number>;
  leader?: string;
  leaderName?: string;
  cityNames?: string[];
  nextCityNameIndex?: number;
  currentResearch?: any;
  researchProgress?: number;
  technologies?: any[];
  score?: number;
  isHuman?: boolean;
  isAI?: boolean;
  /** Fixed per-civ AI identity — drives AutoProduction (and seeds research). */
  productionProfile?: AIProductionProfile;
  icon?: string;
}

export interface UIState {
  showMinimap: boolean;
  showUnitPanel: boolean;
  showCityPanel: boolean;
  showTechTree: boolean;
  showDiplomacy: boolean;
  showGameMenu: boolean;
  activeDialog: 'city' | 'tech' | 'diplomacy' | 'diplomacy-report' | 'game-menu' | 'help' | 'pause' | 'city-production' | 'city-purchase' | 'city-citizens' | 'city-details' | 'hex-details' | 'rates' | 'government' | 'village' | null;
  sidebarCollapsed: boolean;
  notifications: Notification[];
  goToMode: boolean; // When true, next click will set destination for selected unit
  goToUnit: string | null; // Unit id targeted by Go To mode (null when not set)
  turnButtonDisabled: boolean;
  currentQueueUnitId: string | null; // Current unit in the turn queue (only this unit pulses)
  turnFlashTrigger: number; // Incremented on each turn start to trigger top-bar flash animation
}

interface Notification {
  id: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface Settings {
  uiScale: number;
  menuFontSize: number;
  sidebarWidth: number;
  minimapHeight: number;
  civListFontSize: number;
  skipEndTurnConfirmation: boolean;
  autoEndTurn: boolean; // Automatically end turn when all units are done
  devMode: boolean; // Developer mode: see all players on minimap and switch between them
}

export interface Technology {
  id: string;
  name: string;
  researched: boolean;
  researching: boolean;
  available?: boolean;
  description?: string;
  cost?: number;
  prerequisites?: string[];
  /** Emoji/icon shown on research-complete notifications (fallback 🧪). */
  icon?: string;
}

export interface GameStoreState {
  gameState: GameState;
  map: MapState;
  camera: CameraState;
  units: Unit[];
  cities: City[];
  civilizations: Civilization[];
  uiState: UIState;
  settings: Settings;
  technologies: Technology[];
  /** Ordered tech ids the human player selected to research (the "path"). */
  researchPath: string[];
  /** Saved research progress per tech id (kept when switching research). */
  techProgress: Record<string, number>;
  /** Tech that just finished researching — drives the notification modal. */
  lastResearchedTech: Technology | null;
  actions: GameActions;
  currentPlayer: Civilization | null;
  playerResources: {
    food: number;
    production: number;
    trade: number;
    science: number;
    gold: number;
  };
  selectedUnit: Unit | null;
  selectedCity: City | null;
  playerUnits: Unit[];
  playerCities: City[];
  visibleTiles: { x: number; y: number }[];
  gameStats: {
    turn: number;
    totalCities: number;
    totalUnits: number;
    aliveCivilizations: number;
    gameStarted: boolean;
  };
  /** Active combat animations (cloud + unit hide/fade effects). */
  combatAnimations: CombatAnimation[];
  /** Last village (goody hut) outcome for the village-result modal. */
  villageResult: VillageResult | null;
  /** Civ auto-selected when the diplomacy screen opens (diplomat contact / AI offer). */
  diplomacyFocusCivId: number | null;
  /** Pending AI→player proposal awaiting a response in the diplomacy screen. */
  incomingDiplomacyOffer: IncomingDiplomacyOffer | null;
  // Internal state for preventing rapid focus calls
  _lastFocusCall?: number;
}

/**
 * A combat animation: during its window the two involved units are hidden and
 * a cloud emoji is drawn at the defender's tile; afterwards the surviving unit
 * fades back in and the destroyed unit stays hidden.
 */
export interface CombatAnimation {
  id: string;
  attackerId: string;
  defenderId: string;
  /** Attacker's tile at the moment combat started. */
  attackerCol: number;
  attackerRow: number;
  /** Defender's tile (where the cloud is drawn). */
  defenderCol: number;
  defenderRow: number;
  /** True when the attacker survived (won) the fight. */
  attackerSurvived: boolean;
  /** True when the defender survived the fight. */
  defenderSurvived: boolean;
  /** performance.now() timestamp when the animation started. */
  startTime: number;
  /** Cloud duration in ms (units stay hidden this long). */
  duration: number;
}

export interface GameActions {
  startGame: () => void;
  selectHex: (hex: { col: number; row: number }) => void;
  selectUnit: (unitId: string | null) => void;
  selectCity: (cityId: string | null) => void;
  nextTurn: () => void;
  focusOnNextUnit: () => void;
  updateCamera: (cameraUpdate: Partial<CameraState>) => void;
  toggleUI: (key: keyof UIState) => void;
  setCurrentQueueUnitId: (unitId: string | null) => void;
  showDialog: (dialog: UIState['activeDialog']) => void;
  hideDialog: () => void;
  /** Show the village (goody hut) result modal. */
  showVillageResult: (result: VillageResult) => void;
  /** Dismiss the village result modal. */
  clearVillageResult: () => void;
  /** Open the Civ I–style negotiation screen, optionally focused on a civ. */
  openDiplomacy: (focusCivId?: number | null) => void;
  /** Consume the diplomacy focus hint without changing the open dialog. */
  clearDiplomacyFocus: () => void;
  /** Surface an AI-initiated proposal and open the negotiation screen. */
  showIncomingDiplomacyOffer: (offer: IncomingDiplomacyOffer) => void;
  /** Dismiss the pending AI proposal (accepted or rejected). */
  clearIncomingDiplomacyOffer: () => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: number) => void;
  setGoToMode: (enabled: boolean, unitId?: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  updateMap: (mapUpdate: Partial<MapState>) => void;
  updateVisibility: () => void;
  revealArea: (centerCol: number, centerRow: number, radius: number) => void;
  updateUnits: (units: Unit[]) => void;
  updateCities: (cities: City[]) => void;
  updateCivilizations: (civilizations: Civilization[]) => void;
  updateTechnologies: (technologies: Technology[]) => void;
  setResearchPath: (path: string[]) => void;
  saveTechProgress: (techId: string, progress: number) => void;
  notifyTechResearched: (tech: Technology) => void;
  dismissTechNotification: () => void;
  updateGameState: (updates: Partial<GameState>) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  setGameResult: (result: GameResult | null) => void;
  clearGameResult: () => void;
  resetGameState: () => void;
  resetFogOfWar: () => void;
  setTurnButtonDisabled: (disabled: boolean) => void;
  incrementTurnFlash: () => void;
  addCombatAnimation: (animation: CombatAnimation) => void;
  removeCombatAnimation: (id: string) => void;
}

export interface GameEngine {
  isInitialized: boolean;
  map: any; // TODO: type properly
  units: Unit[];
  cities: City[];
  civilizations: Civilization[];
  technologies: Technology[];
  onStateChange: ((eventType: string, eventData: any) => void) | null;
  goToManager: any; // GoToManager instance for path management
  newGame(): void;
  processTurn(): void;
  moveUnit(unitId: string, col: number, row: number): { success: boolean; reason?: string };
  canUnitMoveTo: (unitId: string, col: number, row: number) => boolean;
  /** End the current player's turn automatically if every unit is done/skipped. */
  checkAndEndTurnIfNoMoves(): void;
  foundCity(col: number, row: number, civilizationId: number, customName?: string | null): any;
  foundCityWithSettler(settlerId: string): boolean;
  setResearch(civId: number, techId: string, savedProgress?: number): void;
  /** Set Tax/Science/Luxury rates (sum always 100). */
  setRates(civId: number, tax: number, science: number, luxury: number): void;
  /** Switch a civilization's government and re-apply rate caps/anarchy rules. */
  setGovernment(civId: number, government: string): void;
  /** Begin a revolution (anarchy for several turns) toward a new government. */
  startRevolution(civId: number, government: string): boolean;
  /** Governments currently unlocked by a civ's researched technologies. */
  getAvailableGovernments(civ: Civilization): string[];
  /** Make a city the seat of government (moves the Palace, updates flags). */
  designateCapital(civId: number, city: City): void;
  /** Ensure the civ has a capital (replaces one lost to capture/destruction). */
  ensureCapital(civId: number): void;
  calculateCivScience(civId: number): number;
  calculateCivGold(civId: number): number;
  unitSleep(unitId: string): void;
  unitWake(unitId: string): void;
  unitFortify(unitId: string): void;
  skipUnit(unitId: string): void;
  buildImprovement(unitId: string, improvement: string): boolean;  /** Whether a unit could build this improvement on its current tile (ignores moves). */
  canBuildImprovement(unitId: string, improvementType: string): boolean;
  /** Whether the unit has enough moves (and isn't fortified) to build this improvement now. */
  hasMovesForImprovement(unitId: string, improvementType: string): boolean;
  /** Whether a settler can found a city on its current tile. */
  canFoundCity(settlerId: string): boolean;  cleanPollution(unitId: string): boolean;
  disbandUnit(unitId: string): boolean;
  rushCityProduction(cityId: string): boolean;
  cycleUnitsInTile(unitId: string): string | null;
  selectCityByIndex(index: number): boolean;
  saveGame(): boolean;
  getSaveJSON(): string | null;
  loadGame(): Promise<boolean>;
  getDiplomatActions(diplomatId: string): { targetCivId: number; actions: string[] } | null;
  executeDiplomatAction(diplomatId: string, action: string, targetCivId: number): any;
  diplomacyManager: any;
  /** Auto-production manager for AI/human city queues. */
  autoProduction: any;
  /** Production manager for city build queues. */
  productionManager: any;
  /** Economic manager for tax/science/luxury rates and upkeep. */
  economicManager: any;
  /** Civ I–style research manager (tech cost, beaker modifiers, turn caps). */
  researchManager: any;
  /** Per-civilization persistent turn storage (AI state, explored tiles…). */
  getPlayerStorage(civilizationId: number): any;
  /** Square grid backing the map (null until a game is initialized). */
  squareGrid: any;
  /** Get the map tile at a grid position (null when out of bounds). */
  getTileAt(col: number, row: number): any;
  /** Turn/phase manager. */
  roundManager: any;
  /** Current in-game year (negative = BC). */
  currentYear: number;
  /** Current game settings (difficulty, map type, civilizations…). */
  gameSettings: any;
  /** Remove the active production item from a city. */
  removeCurrentProduction(cityId: string): void;
  getAllUnits(): Unit[];
  getAllCities(): City[];
  restartCurrentGame(): Promise<void>;
  shutdownToMenu(): void;
  isGameOver: boolean;
}