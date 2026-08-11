import { useGameStore } from '../stores/GameStore';
import { centerCameraOnTile, getGameViewport } from './CameraUtils';
import type { GameEngine } from '../../types/game';

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

  handle(eventType: string, eventData: any) {
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
      default:
        console.log('Unhandled game engine event:', eventType, eventData);
    }
  }

  private onTurnStart(_eventData: any) {
    const active = (this.gameEngine as any).activePlayer;
    const civ = this.gameEngine.civilizations?.[active];
    console.log('[EngineEventRouter] TURN_START for player', active, civ?.name);

    // Trigger top-bar flash animation on every turn start
    this.actions.incrementTurnFlash();
    
    const tm = (this.gameEngine as any).roundManager;
    
    if (civ?.isHuman) {
      if (tm && typeof tm.registerPlayer === 'function') {
        console.log('[EngineEventRouter] Registering human player', active);
        tm.registerPlayer(active);
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

  private onPhaseChange(eventData: any) {
    console.log('[EngineEventRouter] PHASE_CHANGE:', eventData);
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onNewGame(eventData: any) {
    console.log('[EngineEventRouter] NEW_GAME: Updating map and initial visibility');
    this.lastQueueLengths.clear();
    this.endTurnPromptShown.clear();
    eventData.civilizations.forEach((civ: any, index: number) => {
      if (!civ.capital) {
        const firstCity = eventData.cities.find((c: any) => c.civilizationId === index);
        if (firstCity) civ.capital = firstCity;
      }
    });
    this.actions.updateCivilizations(eventData.civilizations);
    this.actions.updateMap(eventData.map);
    this.actions.updateUnits(eventData.units);
    this.actions.updateCities(eventData.cities);
    this.actions.updateTechnologies(eventData.technologies);
    this.actions.updateVisibility();
    this.actions.startGame();
  }

  private onUnitMoved(eventData: any) {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
    const moved = eventData && eventData.unit ? eventData.unit : null;
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

  private onCombat(eventType: string, eventData: any) {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
    this.actions.addNotification({
      type: eventType === 'COMBAT_VICTORY' ? 'success' : 'warning',
      message: eventType === 'COMBAT_VICTORY' ? 'Victory in combat!' : 'Unit defeated in combat!'
    });

    // Record a combat animation: both units vanish, a cloud appears at the
    // defender's tile, then the survivor fades back in (2 seconds total).
    const attacker = eventData?.attacker;
    const defender = eventData?.defender;
    if (attacker && defender) {
      const id = `combat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const animation = {
        id,
        attackerId: attacker.id,
        defenderId: defender.id,
        attackerCol: eventData.attackerFromCol ?? attacker.col,
        attackerRow: eventData.attackerFromRow ?? attacker.row,
        defenderCol: defender.col,
        defenderRow: defender.row,
        attackerSurvived: !!eventData.attackerSurvived,
        defenderSurvived: !!eventData.defenderSurvived,
        startTime: performance.now(),
        duration: 2000,
      };
      this.actions.addCombatAnimation(animation);

      // Remove the animation once it has fully played out, then re-check
      // auto-end-turn: combat may have been the last pending action, but the
      // turn must only end after the cloud animation is no longer on screen.
      setTimeout(() => {
        this.actions.removeCombatAnimation(id);
        if (this.gameEngine && typeof this.gameEngine.checkAndEndTurnIfNoMoves === 'function') {
          this.gameEngine.checkAndEndTurnIfNoMoves();
        }
      }, animation.duration + 400);
    }
  }

  private onUnitCreated(eventData: any) {
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateVisibility();
    if (eventData && eventData.unit) {
      this.actions.selectUnit(eventData.unit.id);
      this.actions.addNotification({ type: 'success', message: `${eventData.unit.type} ready to move!` });
    }
  }

  private onCityFounded(eventData: any) {
    const civId = eventData.city.civilizationId;
    const civ = this.gameEngine.civilizations[civId];
    if (civ && !civ.capital) {
      const firstCity = this.gameEngine.getAllCities().find(c => c.civilizationId === civId);
      if (firstCity) civ.capital = firstCity;
    }
    this.actions.updateCities(this.gameEngine.getAllCities());
    this.actions.updateUnits(this.gameEngine.getAllUnits());
    this.actions.updateCivilizations(this.gameEngine.civilizations);
    this.actions.updateVisibility();
    if (eventData.city.civilizationId === 0) this.actions.selectCity(eventData.city.id);
    this.actions.addNotification({ type: 'info', message: `${eventData.city.name} founded!` });
  }

  private onCityProductionChanged(eventData: any) {
    this.actions.updateCities(this.gameEngine.getAllCities());
    if (eventData && eventData.item) {
      const name = eventData.item.name || eventData.item.itemType || 'Production';
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

  private onImprovementBuilt(eventData: any) {
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

  private onAutoEndTurn(eventData: any) {
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
    // purchase / citizens) and diplomacy (a leader may be awaiting a response)
    // — or while a combat animation is still playing. The check is re-run when
    // one of those screens closes (see GameModals.handleCloseDialog) or the
    // combat animation ends (see onCombat). Other dialogs (WORLD menu, tech
    // tree, help, hex details) do not block auto-end.
    const activeDialog = state.uiState?.activeDialog;
    const decisionScreenOpen = activeDialog !== null &&
      activeDialog !== 'game-menu' &&
      activeDialog !== 'help' &&
      activeDialog !== 'tech' &&
      activeDialog !== 'hex-details';
    const combatActive = (state.combatAnimations ?? []).length > 0;
    if (decisionScreenOpen || combatActive) {
      console.log(`[EngineEventRouter] Auto end turn deferred (dialog: ${activeDialog ?? 'none'}, combat: ${combatActive})`);
      return;
    }

    console.log('[EngineEventRouter] Auto-end reached - asking player to confirm via End Turn dialog');
    // Ask the player to confirm instead of ending instantly, so they get a
    // chance to cancel (wake a unit, adjust a city, …). The App shows the
    // "All Your Units Have Moved!" modal; with skipEndTurnConfirmation enabled
    // the App ends the turn immediately (truly automatic).
    this.onTurnEndConfirmationNeeded();
  }

  private onTurnEndConfirmationNeeded() {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('showEndTurnConfirmation'));
    }
  }

  private onTurnEnd(eventData: any) {
    console.log('[EngineEventRouter] TURN_END: Clearing UI state, civ:', eventData?.civilizationId);
    // Pure UI cleanup only
    this.actions.setGoToMode(false, null);
    this.actions.selectUnit(null);
    
    // Flash the top bar when the human player's turn ends (auto and manual)
    const civId = eventData?.civilizationId;
    if (civId != null) {
      const civ = this.gameEngine.civilizations?.[civId];
      if (civ?.isHuman) {
        this.actions.incrementTurnFlash();
      }
    }
  }

  private onAIClearHighlights(eventData: any) {
    console.log('[EngineEventRouter] AI_CLEAR_HIGHLIGHTS for civ', eventData?.civilizationId);
    // Clear any UI highlights when AI finishes its turn
    this.actions.setGoToMode(false, null);
    this.actions.selectUnit(null);
  }

  private onCityProductionPhase(eventData: any) {
    console.log('[EngineEventRouter] CITY_PRODUCTION_PHASE for civ', eventData?.civilizationId);
    // Update UI to show city production phase
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onResearchPhase(eventData: any) {
    console.log('[EngineEventRouter] RESEARCH_PHASE for civ', eventData?.civilizationId);
    // Update UI to show research phase
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onPlayerRegistered(eventData: any) {
    console.log('[EngineEventRouter] PLAYER_REGISTERED for civ', eventData?.civilizationId);
    // Player registration is handled - update UI state
    this.actions.updateGameState({ currentTurn: useGameStore.getState().gameState.currentTurn });
  }

  private onUnitSkipped(eventData: any) {
    console.log('[EngineEventRouter] UNIT_SKIPPED:', eventData?.unit?.id, eventData?.unit?.type);
    // Unit was skipped - update unit state in UI
    if (this.actions?.updateUnits) {
      this.actions.updateUnits(this.gameEngine.getAllUnits());
    }
  }

  private onAITargetHighlight(eventData: any) {
    console.log('[EngineEventRouter] AI_TARGET_HIGHLIGHT:', eventData);
    // Optionally, highlight the target tile in the UI (red overlay, etc.)
    // For now, just log and update visibility
    this.actions.updateVisibility();
  }

  private onUnitQueueInit(eventData: any) {
    console.log('[EngineEventRouter] UNIT_QUEUE_INIT:', eventData);
    const unitId = eventData?.unitId || null;
    this.actions.setCurrentQueueUnitId(unitId);
    
    // Auto-select and focus on the first unit in the queue (for human players)
    const activePlayer = (this.gameEngine as any).activePlayer;
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

  private onUnitQueueAdvance(eventData: any) {
    console.log('[EngineEventRouter] UNIT_QUEUE_ADVANCE:', eventData);
    const unitId = eventData?.unitId || null;
    this.actions.setCurrentQueueUnitId(unitId);
    
    // Auto-select and focus on the next unit (for human players)
    const activePlayer = (this.gameEngine as any).activePlayer;
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

  private onUnitQueueChange(eventData: any) {
    console.log('[EngineEventRouter] UNIT_QUEUE_CHANGE:', eventData);
    const unitId = eventData?.currentUnitId || null;
    const civilizationId = eventData?.civilizationId;
    
    // Only update for the active player
    const activePlayer = (this.gameEngine as any).activePlayer;
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
      ? eventData.queueLength
      : Array.isArray(eventData?.queue)
        ? eventData.queue.length
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
    const tm = (this.gameEngine as any).roundManager;
    const phase = tm?.getPhase?.() ?? null;
    const inUnitMovement = phase === 'UNIT_MOVEMENT';
    const shouldPrompt = civ?.isHuman && !settings.autoEndTurn && queueEmptied && !this.endTurnPromptShown.has(civilizationId) && inUnitMovement;

    if (shouldPrompt && typeof window !== 'undefined') {
      this.endTurnPromptShown.add(civilizationId);
      window.dispatchEvent(new CustomEvent('showEndTurnConfirmation'));
    }
  }

  private onSelectQueueUnit(eventData: any) {
    console.log('[EngineEventRouter] SELECT_QUEUE_UNIT:', eventData);
    const unit = eventData?.unit;
    if (unit) {
      this.actions.setCurrentQueueUnitId(unit.id);
      this.actions.selectUnit(unit.id);
      this.focusOnUnit(unit);
    }
  }

  /**
   * Focus camera on a specific unit, preserving the current zoom and clamping
   * to the map bounds so the view never lands on empty black space.
   */
  private focusOnUnit(unit: any): void {
    const currentCamera = useGameStore.getState().camera;
    const map = (this.gameEngine as any)?.map;
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

  private onWarDeclared(eventData: any) {
    const civs = this.gameEngine.civilizations || [];
    const aggressor = civs.find((c: any) => c.id === eventData?.aggressorId);
    const target = civs.find((c: any) => c.id === eventData?.targetId);
    const msg = `${aggressor?.name ?? 'Unknown'} declared war on ${target?.name ?? 'Unknown'}!`;
    console.log('[EngineEventRouter] WAR_DECLARED:', msg);
    this.actions.addNotification?.({ type: 'warning', message: msg });
    this.syncState();
  }

  private onPeaceMade(eventData: any) {
    const civs = this.gameEngine.civilizations || [];
    const civA = civs.find((c: any) => c.id === eventData?.civA);
    const civB = civs.find((c: any) => c.id === eventData?.civB);
    const msg = `Peace between ${civA?.name ?? 'Unknown'} and ${civB?.name ?? 'Unknown'}!`;
    console.log('[EngineEventRouter] PEACE_MADE:', msg);
    this.actions.addNotification?.({ type: 'success', message: msg });
    this.syncState();
  }

  private onDiplomacyEvent(eventData: any) {
    if (eventData?.message) {
      this.actions.addNotification?.({ type: 'info', message: eventData.message });
    }
  }

  private syncState() {
    const ge = this.gameEngine as any;
    if (ge.units) this.actions.updateUnits([...ge.units]);
    if (ge.civilizations) this.actions.updateCivilizations([...ge.civilizations]);
    if (ge.cities) this.actions.updateCities([...ge.cities]);
  }
}
