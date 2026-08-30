import { useGameStore } from '../stores/GameStore';
import { centerCameraOnTile, getGameViewport } from './CameraUtils';
import { firstUnresearchedInPath } from './ResearchPath';
import type { GameEngine, Technology, Unit, City, Civilization, VillageOutcome } from '../../types/game';

// The human player is always civilization 0 (mirrors the store's fog of war).
const HUMAN_PLAYER_ID = 0;

export class EngineEventRouter {
  private gameEngine: GameEngine;
  private actions = useGameStore.getState().actions;
  private lastQueueLengths: Map<number, number> = new Map();
  private endTurnPromptShown: Set<number> = new Set();

  constructor(gameEngine: GameEngine) {
    this.gameEngine = gameEngine;
  }

  /** True in AI-vs-AI mode (every civilization is AI-controlled). */
  private get isAIVsAI(): boolean {
    const civs = this.gameEngine?.civilizations ?? [];
    return civs.length > 0 && civs.every((c) => !c.isHuman);
  }

  handle(eventType: string, eventData: Record<string, unknown>) {
    switch (eventType) {
      case 'TURN_START':
        this.onTurnStart(eventData);
        break;
      case 'PHASE_CHANGE':
        this.onPhaseChange(eventData);
        break;
      case 'NEW_GAME':
        this.onNewGame(eventData);
        break;
      case 'UNIT_MOVED':
        this.onUnitMoved(eventData);
        break;
      case 'COMBAT_VICTORY':
      case 'COMBAT_DEFEAT':
        this.onCombat(eventType, eventData);
        break;
      case 'CITY_ATTACKED':
        this.onCityAttacked(eventData);
        break;
      case 'UNIT_PRODUCED':
      case 'UNIT_PURCHASED':
        this.onUnitCreated(eventData);
        break;
      case 'CITY_FOUNDED':
        this.onCityFounded(eventData);
        break;
      case 'CITY_PRODUCTION_CHANGED':
        this.onCityProductionChanged(eventData);
        break;
      case 'CITY_QUEUE_UPDATED':
        this.onCityProductionChanged(eventData);
        break;
      case 'TURN_PROCESSED':
        this.onTurnProcessed();
        break;
      case 'AI_FINISHED':
        this.onAIFinished();
        break;
      case 'IMPROVEMENT_BUILT':
        this.onImprovementBuilt(eventData);
        break;
      case 'AUTO_END_TURN':
        this.onAutoEndTurn(eventData);
        break;
      case 'CHECK_AUTO_END_TURN':
        this.onCheckAutoEndTurn();
        break;
      case 'TURN_END_CONFIRMATION_NEEDED':
        this.onTurnEndConfirmationNeeded();
        break;
      case 'TURN_END':
        this.onTurnEnd(eventData);
        break;
      case 'AI_CLEAR_HIGHLIGHTS':
        this.onAIClearHighlights(eventData);
        break;
      case 'CITY_PRODUCTION_PHASE':
        this.onCityProductionPhase(eventData);
        break;
      case 'RESEARCH_PHASE':
        this.onResearchPhase(eventData);
        break;
      case 'TECH_RESEARCHED':
        this.onTechResearched(eventData);
        break;
      case 'PLAYER_REGISTERED':
        this.onPlayerRegistered(eventData);
        break;
      case 'UNIT_SKIPPED':
        this.onUnitSkipped(eventData);
        break;
      case 'AI_TARGET_HIGHLIGHT':
        this.onAITargetHighlight(eventData);
        break;
      case 'UNIT_QUEUE_INIT':
        this.onUnitQueueInit(eventData);
        break;
      case 'UNIT_QUEUE_ADVANCE':
        this.onUnitQueueAdvance(eventData);
        break;
      case 'UNIT_QUEUE_CHANGE':
        this.onUnitQueueChange(eventData);
        break;
      case 'SELECT_QUEUE_UNIT':
        this.onSelectQueueUnit(eventData);
        break;
      case 'WAR_DECLARED':
        this.onWarDeclared(eventData);
        break;
      case 'PEACE_MADE':
        this.onPeaceMade(eventData);
        break;
      case 'DIPLOMACY_EVENT':
        this.onDiplomacyEvent(eventData);
        break;
      case 'ALLIANCE_BROKEN':
        this.onAllianceBroken(eventData);
        break;
      case 'AI_DIPLOMACY_OFFER':
        this.onAIDiplomacyOffer(eventData);
        break;
      case 'VILLAGE_RESULT':
        this.onVillageResult(eventData);
        break;
      case 'UNIT_REMOVED':
        this.onUnitRemoved();
        break;
      case 'UNIT_DISBANDED':
        this.onUnitDisbanded(eventData);
        break;
      case 'TRADE_ROUTE_ESTABLISHED':
        this.onTradeRouteEstablished(eventData);
        break;
      default:
        console.log('Unhandled game engine event:', eventType, eventData);
    }
  }

  /**
   * A village (goody hut) was encountered. Always refresh the store from the
   * engine (units, cities, civs, techs, gold may all have changed regardless
   * of who triggered it), and open the village-result modal only for the
   * human player. AI hut outcomes now visibly take effect in the UI.
   */
  private onVillageResult(eventData: Record<string, unknown>): void {
    // Always refresh — the engine applied the outcome (gold, tech, units,
    // cities) and the store must reflect it even when an AI triggered the hut.
    this.actions.updateMap?.(this.gameEngine.map);
    this.actions.updateUnits?.(this.gameEngine.getAllUnits());
    this.actions.updateCities?.(this.gameEngine.getAllCities());
    this.actions.updateCivilizations?.(this.gameEngine.civilizations);
    this.actions.updateTechnologies?.(this.gameEngine.technologies);

    // The result modal only opens for the human player's own encounters.
    if (this.isAIVsAI) return;
    if (eventData.civId !== HUMAN_PLAYER_ID) return;

    const d = eventData as {
      outcome: VillageOutcome;
      civId: number;
      col: number;
      row: number;
      cityName: string;
      techId: string;
      techName: string;
      goldAmount: number;
      unitType: string;
      unitName: string;
      barbarianCount: number;
      destroyed: boolean;
    };

    this.actions.showVillageResult?.({
      outcome: d.outcome,
      civId: d.civId,
      col: d.col,
      row: d.row,
      cityName: d.cityName,
      techId: d.techId,
      techName: d.techName,
      goldAmount: d.goldAmount,
      unitType: d.unitType,
      unitName: d.unitName,
      barbarianCount: d.barbarianCount,
      destroyed: d.destroyed,
    });
  }

  private onTurnStart(_eventData: Record<string, unknown>) {
    const active = this.gameEngine.activePlayer;
    const civ = this.gameEngine.civilizations?.[active];
    console.log('[EngineEventRouter] TURN_START for player', active, civ?.name);

    // Trigger top-bar flash animation on every turn start
    this.actions.incrementTurnFlash();
    
    const tm = this.gameEngine.roundManager;
    const tmWithRegister = tm as { registerPlayer?: (id: number) => void };
    
    if (civ?.isHuman) {
      if (tmWithRegister && typeof tmWithRegister.registerPlayer === 'function') {
        console.log('[EngineEventRouter] Registering human player', active);
        tmWithRegister.registerPlayer(active);
      } else {
        console.warn('[EngineEventRouter] TurnManager not found or registerPlayer not available');
      }
    }

    // Re-enable the end turn button at the start of each turn
    this.actions.setTurnButtonDisabled(false);
    this.lastQueueLengths.delete(active);
    this.endTurnPromptShown.delete(active);

    // Refresh visibility for the current player so the minimap and main view
    // reflect the correct per-player fog of war on turn start
    this.actions.updateVisibility();
  }

  private onPhaseChange(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] PHASE_CHANGE:', eventData);
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onNewGame(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] NEW_GAME: Updating map and initial visibility');
    this.lastQueueLengths.clear();
    this.endTurnPromptShown.clear();
    (eventData.civilizations as Civilization[]).forEach((civ: Civilization, index: number) => {
      if (!civ.capital) {
        const firstCity = (eventData.cities as City[]).find((c: City) => c.civilizationId === index);
        if (firstCity) civ.capital = firstCity;
      }
    });
    this.actions.updateCivilizations(eventData.civilizations as Civilization[]);
    this.actions.updateMap(eventData.map);
    this.actions.updateUnits(eventData.units as Unit[]);
    this.actions.updateCities(eventData.cities as City[]);
    this.actions.updateTechnologies(eventData.technologies as Technology[]);
    this.actions.updateVisibility();
    this.actions.startGame();
  }

  private onUnitMoved(eventData: Record<string, unknown>) {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
    // In AI-vs-AI mode don't follow AI moves — no auto-selection or camera
    // centering between players (the board still updates above).
    if (this.isAIVsAI) return;
    const moved = (eventData && eventData.unit ? eventData.unit : null) as Unit | null;
    if (moved) {
      const movesLeft = moved.movesRemaining || 0;
      if (movesLeft > 0) {
        // Only auto-select the moved unit when it is the human player's own
        // unit, or an enemy/AI unit the human can currently see. Hidden enemy
        // movement must not be revealed through the selection panel.
        if (this.isUnitVisibleToHuman(moved)) {
          this.actions.selectUnit(moved.id);
        }
      } else {
        // focusOnNextUnit applies the same visibility rule before moving the camera.
        this.actions.focusOnNextUnit();
      }
    }
  }

  /**
   * Whether a unit should be revealed/followed by the UI: either the human
   * player's own unit, or an enemy/AI unit whose tile the human can currently
   * see (fog of war). Dev mode reveals everything.
   */
  private isUnitVisibleToHuman(unit: { civilizationId: number; col: number; row: number }): boolean {
    const state = useGameStore.getState();
    if (state.settings?.devMode) return true;
    if (unit.civilizationId === HUMAN_PLAYER_ID) return true;
    const mapWidth = state.map?.width ?? 0;
    if (!mapWidth) return false;
    const index = unit.row * mapWidth + unit.col;
    return !!state.map?.visibility?.[index];
  }

  private onCombat(eventType: string, eventData: Record<string, unknown>) {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
    this.actions.addNotification({
      type: eventType === 'COMBAT_VICTORY' ? 'success' : 'warning',
      message: eventType === 'COMBAT_VICTORY' ? 'Victory in combat!' : 'Unit defeated in combat!'
    });

    // Record a combat animation: both units vanish, a cloud appears at the
    // defender's tile, then the survivor fades back in (2 seconds total).
    const attacker = eventData?.attacker as Unit | undefined;
    const defender = eventData?.defender as Unit | undefined;
    if (attacker && defender) {
      const id = `combat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const animation = {
        id,
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerCol: (eventData.attackerFromCol as number) ?? attacker.col,
        attackerRow: (eventData.attackerFromRow as number) ?? attacker.row,
        defenderCol: defender.col,
        defenderRow: defender.row,
        attackerSurvived: !!eventData.attackerSurvived,
        defenderSurvived: !!eventData.defenderSurvived,
        startTime: performance.now(),
        duration: 800, // Cloud blinks for 0.8s
        deathBlinkDuration: 2000, // Dead unit blinks for 2s after cloud
      };
      this.actions.addCombatAnimation(animation);

      // Remove the animation once it has fully played out (cloud + death blink).
      setTimeout(() => {
        this.actions.removeCombatAnimation(id);
        if (this.gameEngine && typeof this.gameEngine.checkAndEndTurnIfNoMoves === 'function') {
          this.gameEngine.checkAndEndTurnIfNoMoves();
        }
      }, animation.duration + animation.deathBlinkDuration + 200);
    }
  }

  private onUnitRemoved() {
    // A unit was removed from the engine after a delayed combat removal —
    // refresh the store so the dead unit actually disappears (the renderer
    // only hides it via isDefeated until this sync lands).
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
  }

  private onUnitDisbanded(eventData: Record<string, unknown>) {
    // The disbanded unit is already gone from the engine — keep the store in sync.
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    // Only surface a modal for the human player, and only for the upkeep
    // (bankruptcy) disband — manual disbands are player-initiated and need no
    // reminder.
    if (eventData?.reason !== 'upkeep_deficit') return;
    const unit = eventData?.unit as Unit | undefined;
    if (!unit) return;
    const civ = this.gameEngine?.civilizations?.[unit.civilizationId];
    if (civ?.isHuman !== true) return;
    this.actions.showUpkeepDisbanded({
      civId: unit.civilizationId,
      unitType: unit.type,
      unitName: unit.name || unit.type,
    });
  }

  private onTradeRouteEstablished(eventData: Record<string, unknown>) {
    // The caravan is consumed and the cities got a new route — refresh the store.
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateCities(this.gameEngine.getAllCities());
    this.actions.updateVisibility();

    const home = eventData?.homeCity as { name: string } | undefined;
    const dest = eventData?.destCity as { name: string; civilizationId: number } | undefined;
    const caravan = eventData?.caravan as Unit | undefined;
    if (!home || !dest) return;

    const gold = Number(eventData?.gold ?? 0);
    const science = Number(eventData?.science ?? 0);
    this.actions.addNotification({
      type: 'success',
      message: `Trade route: ${home.name} → ${dest.name} (+${gold} gold, +${science} science)`,
    });

    // Only surface the payout modal for the human player.
    const civ = caravan ? this.gameEngine?.civilizations?.[caravan.civilizationId] : undefined;
    if (civ?.isHuman !== true) return;
    this.actions.showTradeRouteResult({
      homeCityName: home.name,
      destCityName: dest.name,
      destCivId: dest.civilizationId,
      gold,
      science,
      foreign: !!eventData?.foreign,
      intercontinental: !!eventData?.intercontinental,
      distance: Number(eventData?.distance ?? 0),
    });
  }

  private onCityAttacked(eventData: Record<string, unknown>) {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
    this.actions.updateCities(this.gameEngine.getAllCities());

    // Show a 💥 combat cloud at the city tile (2 seconds, same as unit-vs-unit).
    const city = eventData?.city as { col: number; row: number } | undefined;
    const attacker = eventData?.attacker as { id?: string; col?: number; row?: number } | undefined;
    if (city) {
      const id = `city-combat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const animation = {
        id,
        attackerId: attacker?.id ?? '',
        defenderId: '', // cities don't move or get killed
        attackerCol: attacker?.col ?? city.col,
        attackerRow: attacker?.row ?? city.row,
        defenderCol: city.col,
        defenderRow: city.row,
        attackerSurvived: true,
        defenderSurvived: true,
        startTime: performance.now(),
        duration: 800, // Cloud blinks for 0.8s
        deathBlinkDuration: 2000, // Dead unit blinks for 2s after cloud
        cityAttack: true,
      };
      this.actions.addCombatAnimation(animation);
      setTimeout(() => {
        this.actions.removeCombatAnimation(id);
        if (this.gameEngine && typeof this.gameEngine.checkAndEndTurnIfNoMoves === 'function') {
          this.gameEngine.checkAndEndTurnIfNoMoves();
        }
      }, animation.duration + animation.deathBlinkDuration + 100);
    }
  }

  private onUnitCreated(eventData: Record<string, unknown>) {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
    const unit = eventData.unit as Unit | undefined;
    if (eventData && unit) {
      // Don't auto-open the unit panel for AI-produced units in AI-vs-AI mode.
      if (!this.isAIVsAI) {
        this.actions.selectUnit(unit.id);
      }
      this.actions.addNotification({ type: 'success', message: `${unit.type} ready to move!` });
    }
  }

  private onCityFounded(eventData: Record<string, unknown>) {
    const city = eventData.city as City;
    const civId = city.civilizationId;
    const civ = this.gameEngine.civilizations[civId];
    if (civ && !civ.capital) {
      const firstCity = this.gameEngine.getAllCities().find(c => c.civilizationId === civId);
      if (firstCity) civ.capital = firstCity;
    }
    this.actions.updateCities(this.gameEngine.getAllCities());
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateCivilizations(this.gameEngine.civilizations);
    this.actions.updateVisibility();
    // Don't auto-open the city panel in AI-vs-AI mode (nobody is managing it).
    if (!this.isAIVsAI && city.civilizationId === 0) this.actions.selectCity(city.id);
    this.actions.addNotification({ type: 'info', message: `${city.name} founded!` });
  }

  private onCityProductionChanged(eventData: Record<string, unknown>) {
    this.actions.updateCities(this.gameEngine.getAllCities());
    const item = eventData.item as { name?: string; itemType?: string } | undefined;
    if (eventData && item) {
      const name = item.name || item.itemType || 'Production';
      this.actions.addNotification({ type: 'success', message: eventData.queued ? `Queued ${name}` : `Started production: ${name}` });
    }
  }

  private onTurnProcessed() {
    this.actions.updateCivilizations(this.gameEngine.civilizations);
    this.actions.updateCities(this.gameEngine.getAllCities());
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateTechnologies(this.gameEngine.technologies);
    this.actions.updateVisibility();
    this.actions.focusOnNextUnit();
  }

  private onAIFinished() {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.addNotification({ type: 'info', message: 'AI finished its turn' });
  }

  private onImprovementBuilt(eventData: Record<string, unknown>) {
    try {
      console.log('[EngineEventRouter] IMPROVEMENT_BUILT', eventData);
      this.actions.updateUnits(this.gameEngine.getAllUnits());
      this.actions.updateMap(this.gameEngine.map);
      this.actions.updateVisibility();
      if (eventData && eventData.improvementType) {
        this.actions.addNotification({ type: 'success', message: `${eventData.improvementType} built` });
      } else {
        this.actions.addNotification({ type: 'info', message: 'Improvement built' });
      }
    } catch (e) {
      console.warn('[EngineEventRouter] Error handling IMPROVEMENT_BUILT', e);
    }
  }

  private onAutoEndTurn(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] AUTO_END_TURN for civ', eventData?.civilizationId);
    // Pure UI updates only - no game logic
    this.actions.setGoToMode(false, null);
    this.actions.selectUnit(null);
    this.actions.nextTurn();
    // Note: TurnManager now handles turn advancement internally
  }

  private onCheckAutoEndTurn() {
    const state = useGameStore.getState();
    const settings = state.settings;
    console.log('[EngineEventRouter] Checking auto end turn. Setting enabled:', settings.autoEndTurn);

    if (!settings.autoEndTurn) {
      console.log('[EngineEventRouter] Auto end turn disabled, waiting for manual turn end');
      return;
    }

    // Do not auto-end the turn while the player is in a screen where they
    // might still make a decision: city management (details / production /
    // purchase / citizens), diplomacy (a leader may be awaiting a response),
    // a village result message, or while paused — or while a combat animation
    // is still playing. The check is re-run when one of those screens closes
    // (see GameModals.handleCloseDialog) or the combat animation ends (see
    // onCombat). Other dialogs (WORLD menu, tech tree, help, hex details) do
    // not block auto-end.
    const decisionScreenOpen = this.isDecisionScreenOpen(state.uiState?.activeDialog ?? null);
    const combatActive = (state.combatAnimations ?? []).length > 0;
    if (decisionScreenOpen || combatActive) {
      console.log(`[EngineEventRouter] Auto end turn deferred (dialog: ${state.uiState?.activeDialog ?? 'none'}, combat: ${combatActive})`);
      return;
    }

    console.log('[EngineEventRouter] Auto-end reached - asking player to confirm via End Turn dialog');
    // Ask the player to confirm instead of ending instantly, so they get a
    // chance to cancel (wake a unit, adjust a city, …). The App shows the
    // "All Your Units Have Moved!" modal; with skipEndTurnConfirmation enabled
    // the App ends the turn immediately (truly automatic).
    this.onTurnEndConfirmationNeeded();
  }

  /**
   * Whether a decision screen is open that should defer the auto-end prompt:
   * city management, diplomacy, a village result message, … (everything
   * except the non-blocking WORLD menu, tech tree, help and hex details).
   */
  private isDecisionScreenOpen(activeDialog: string | null): boolean {
    return activeDialog !== null &&
      activeDialog !== 'game-menu' &&
      activeDialog !== 'help' &&
      activeDialog !== 'tech' &&
      activeDialog !== 'hex-details';
  }

  private onTurnEndConfirmationNeeded() {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('showEndTurnConfirmation'));
    }
  }

  private onTurnEnd(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] TURN_END: Clearing UI state, civ:', eventData?.civilizationId);
    // Pure UI cleanup only
    this.actions.setGoToMode(false, null);
    this.actions.selectUnit(null);
    
    // Flash the top bar when the human player's turn ends (auto and manual)
    const civId = eventData?.civilizationId as number | undefined;
    if (civId != null) {
      const civ = this.gameEngine.civilizations?.[civId];
      if (civ?.isHuman) {
        this.actions.incrementTurnFlash();
      }
    }
  }

  private onAIClearHighlights(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] AI_CLEAR_HIGHLIGHTS for civ', eventData?.civilizationId);
    // Clear any UI highlights when AI finishes its turn
    this.actions.setGoToMode(false, null);
    this.actions.selectUnit(null);
  }

  private onCityProductionPhase(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] CITY_PRODUCTION_PHASE for civ', eventData?.civilizationId);
    // Update UI to show city production phase
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onResearchPhase(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] RESEARCH_PHASE for civ', eventData?.civilizationId);
    // Update UI to show research phase
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onTechResearched(eventData: Record<string, unknown>) {
    const civilizationId = eventData.civilizationId as number;
    const techId = eventData.techId as string;
    const tech = this.gameEngine.technologies?.find((t: Technology) => t.id === techId);
    if (!tech) return;

    // Keep the UI copies of techs/civs in sync with the engine (researched
    // flags + currentResearch may have changed).
    this.actions.updateTechnologies([...(this.gameEngine.technologies || [])]);
    this.actions.updateCivilizations([...(this.gameEngine.civilizations || [])]);

    // The research-complete notification is for the human player.
    if (civilizationId !== HUMAN_PLAYER_ID) return;
    this.actions.notifyTechResearched({ ...tech } as Technology);

    // Auto-advance along the player's selected research path.
    this.advanceResearchPath(civilizationId);
  }

  /** After a tech completes, continue with the next available tech in the path. */
  private advanceResearchPath(civId: number) {
    const state = useGameStore.getState();
    const path = state.researchPath;
    if (!path || path.length === 0) return;
    const nextId = firstUnresearchedInPath(this.gameEngine.technologies || [], path);
    if (!nextId || !this.gameEngine.setResearch) return;
    // Restore the tech's saved progress (progress is kept across switches).
    this.gameEngine.setResearch(civId, nextId, state.techProgress[nextId] ?? 0);
    this.actions.updateCivilizations([...(this.gameEngine.civilizations || [])]);
  }

  private onPlayerRegistered(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] PLAYER_REGISTERED for civ', eventData?.civilizationId);
    // Player registration is handled - update UI state
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onUnitSkipped(eventData: Record<string, unknown>) {
    const unit = eventData?.unit as { id?: string; type?: string } | undefined;
    console.log('[EngineEventRouter] UNIT_SKIPPED:', unit?.id, unit?.type);
    // Unit was skipped - update unit state in UI
    if (this.actions?.updateUnits) {
      this.actions.updateUnits(this.gameEngine.getAllUnits());
    }
  }

  private onAITargetHighlight(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] AI_TARGET_HIGHLIGHT:', eventData);
    // Optionally, highlight the target tile in the UI (red overlay, etc.)
    // For now, just log and update visibility
    this.actions.updateVisibility();
  }

  private onUnitQueueInit(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] UNIT_QUEUE_INIT:', eventData);
    const unitId = (eventData?.unitId as string) || null;
    this.actions.setCurrentQueueUnitId(unitId);
    
    // Auto-select and focus on the first unit in the queue (for human players)
    const activePlayer = this.gameEngine.activePlayer;
    const civ = this.gameEngine.civilizations?.[activePlayer];
    if (civ?.isHuman && unitId) {
      this.actions.selectUnit(unitId);
      // Find unit and focus camera on it
      const unit = this.gameEngine.getAllUnits().find(u => u.id === unitId);
      if (unit) {
        this.actions.updateCamera({ x: unit.col * 32, y: unit.row * 32 });
      }
    }
  }

  private onUnitQueueAdvance(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] UNIT_QUEUE_ADVANCE:', eventData);
    const unitId = (eventData?.unitId as string) || null;
    this.actions.setCurrentQueueUnitId(unitId);
    
    // Auto-select and focus on the next unit (for human players)
    const activePlayer = this.gameEngine.activePlayer;
    const civ = this.gameEngine.civilizations?.[activePlayer];
    if (civ?.isHuman && unitId) {
      this.actions.selectUnit(unitId);
      // Find unit and focus camera on it
      const unit = this.gameEngine.getAllUnits().find(u => u.id === unitId);
      if (unit) {
        this.actions.updateCamera({ x: unit.col * 32, y: unit.row * 32 });
      }
    }
  }

  private onUnitQueueChange(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] UNIT_QUEUE_CHANGE:', eventData);
    const unitId = (eventData?.currentUnitId as string) || null;
    const civilizationId = eventData?.civilizationId as number;
    
    // Only update for the active player
    const activePlayer = this.gameEngine.activePlayer;
    if (civilizationId !== activePlayer) return;
    
    this.actions.setCurrentQueueUnitId(unitId);
    
    // Auto-select and focus on the current unit (for human players)
    const civ = this.gameEngine.civilizations?.[activePlayer];
    if (civ?.isHuman && unitId) {
      this.actions.selectUnit(unitId);
      // Find unit and focus camera on it using the same logic as focusOnNextUnit
      const unit = this.gameEngine.getAllUnits().find(u => u.id === unitId);
      if (unit) {
        this.focusOnUnit(unit);
      }
    } else if (civ?.isHuman && !unitId) {
      // Queue is empty for human player - deselect unit
      this.actions.selectUnit(null);
    }

    const queueLength = typeof eventData?.queueLength === 'number'
      ? (eventData.queueLength as number)
      : Array.isArray(eventData?.queue)
        ? (eventData.queue as unknown[]).length
        : 0;
    const previousLength = this.lastQueueLengths.get(civilizationId);
    this.lastQueueLengths.set(civilizationId, queueLength);

    if (queueLength > 0) {
      this.endTurnPromptShown.delete(civilizationId);
    }

    const settings = useGameStore.getState().settings;
    const queueEmptied = typeof previousLength === 'number' && previousLength > 0 && queueLength === 0;

    // Only auto-prompt "All Your Units Have Moved!" while the human is in their
    // UNIT_MOVEMENT phase. The queue is also cleared during END-phase turn
    // processing (endHumanTurn -> clearQueue), which would otherwise spuriously
    // re-open the End Turn modal while the AI is still processing.
    const tm = this.gameEngine.roundManager;
    const phase = tm?.getPhase?.() ?? null;
    const inUnitMovement = phase === 'UNIT_MOVEMENT';
    // Defer while a decision screen is open (city management, diplomacy, a
    // village result message, …) so the prompt never covers it. When the screen
    // closes, handleCloseDialog re-checks auto-end (autoEndTurn on) or the next
    // queue change re-triggers this prompt.
    const decisionScreenOpen = this.isDecisionScreenOpen(useGameStore.getState().uiState?.activeDialog ?? null);
    const shouldPrompt = civ?.isHuman && !settings.autoEndTurn && queueEmptied && !decisionScreenOpen && !this.endTurnPromptShown.has(civilizationId) && inUnitMovement;

    if (shouldPrompt && typeof window !== 'undefined') {
      this.endTurnPromptShown.add(civilizationId);
      window.dispatchEvent(new CustomEvent('showEndTurnConfirmation'));
    }
  }

  private onSelectQueueUnit(eventData: Record<string, unknown>) {
    console.log('[EngineEventRouter] SELECT_QUEUE_UNIT:', eventData);
    const unit = eventData?.unit as Unit | undefined;
    if (unit) {
      this.actions.setCurrentQueueUnitId(unit.id);
      // In AI-vs-AI mode the queue unit is an AI unit — don't select it or
      // swing the camera to it.
      if (this.isAIVsAI) return;
      this.actions.selectUnit(unit.id);
      this.focusOnUnit(unit);
    }
  }

  /**
   * Focus camera on a specific unit, preserving the current zoom and clamping
   * to the map bounds so the view never lands on empty black space.
   */
  private focusOnUnit(unit: Unit): void {
    const currentCamera = useGameStore.getState().camera;
    const map = this.gameEngine.map;
    const mapWidth = map?.width ?? 80;
    const mapHeight = map?.height ?? 50;
    const zoom = currentCamera?.zoom ?? 2.0;
    const viewport = getGameViewport();

    const { x, y } = centerCameraOnTile({
      col: unit.col,
      row: unit.row,
      zoom,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      mapWidth,
      mapHeight,
    });

    const newCamera = { x, y, zoom };

    console.log('[EngineEventRouter] Focusing camera on unit', {
      unitId: unit.id,
      col: unit.col,
      row: unit.row,
      camera: newCamera
    });

    this.actions.updateCamera(newCamera);
  }

  private onWarDeclared(eventData: Record<string, unknown>) {
    const civs = this.gameEngine.civilizations || [];
    const aggressor = civs.find((c: Civilization) => c.id === (eventData?.aggressorId as number));
    const target = civs.find((c: Civilization) => c.id === (eventData?.targetId as number));
    const msg = `${aggressor?.name ?? 'Unknown'} declared war on ${target?.name ?? 'Unknown'}!`;
    console.log('[EngineEventRouter] WAR_DECLARED:', msg);
    this.actions.addNotification?.({ type: 'warning', message: msg });
    this.syncState();
  }

  private onPeaceMade(eventData: Record<string, unknown>) {
    const civs = this.gameEngine.civilizations || [];
    const civA = civs.find((c: Civilization) => c.id === (eventData?.civA as number));
    const civB = civs.find((c: Civilization) => c.id === (eventData?.civB as number));
    const msg = `Peace between ${civA?.name ?? 'Unknown'} and ${civB?.name ?? 'Unknown'}!`;
    console.log('[EngineEventRouter] PEACE_MADE:', msg);
    this.actions.addNotification?.({ type: 'success', message: msg });
    this.syncState();
  }

  private onDiplomacyEvent(eventData: Record<string, unknown>) {
    if (eventData?.message) {
      this.actions.addNotification?.({ type: 'info', message: eventData.message as string });
    }
  }

  private onAllianceBroken(eventData: Record<string, unknown>) {
    const civs = this.gameEngine.civilizations || [];
    const civA = civs.find((c: Civilization) => c.id === (eventData?.civA as number));
    const civB = civs.find((c: Civilization) => c.id === (eventData?.civB as number));
    const msg = `💔 Alliance broken: ${civA?.name ?? 'Unknown'} declared war on ${civB?.name ?? 'Unknown'}!`;
    console.log('[EngineEventRouter] ALLIANCE_BROKEN:', msg);
    this.actions.addNotification?.({ type: 'warning', message: msg });
    this.syncState();
  }

  /**
   * An AI civilization made a negotiable proposal to the human player. Surface
   * it in the negotiation screen (with the offering civ pre-selected) instead
   * of auto-resolving — the player decides. In AI-vs-AI games there is no
   * human, so offers are never routed here.
   */
  private onAIDiplomacyOffer(eventData: Record<string, unknown>) {
    if (this.isAIVsAI) return;
    if (typeof eventData?.fromCivId !== 'number') return;

    const civs = this.gameEngine.civilizations || [];
    const from = civs.find((c: Civilization) => c.id === (eventData.fromCivId as number));
    console.log('[EngineEventRouter] AI_DIPLOMACY_OFFER from', from?.name ?? eventData.fromCivId, '→', eventData.action);

    if (eventData?.message) {
      this.actions.addNotification?.({ type: 'info', message: eventData.message as string });
    }
    this.actions.showIncomingDiplomacyOffer?.({
      fromCivId: eventData.fromCivId as number,
      action: (eventData.action as string) ?? 'propose_peace',
      goldAmount: eventData.goldAmount as number,
      message: eventData.message as string,
    });
    this.syncState();
  }

  private syncState() {
    if (this.gameEngine.units) this.actions.updateUnits([...this.gameEngine.units]);
    if (this.gameEngine.civilizations) this.actions.updateCivilizations([...this.gameEngine.civilizations]);
    if (this.gameEngine.cities) this.actions.updateCities([...this.gameEngine.cities]);
  }
}
