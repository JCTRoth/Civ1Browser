import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Modal, Button, Tab, Tabs, Card, ListGroup } from 'react-bootstrap';
import TechTreeView from './TechTreeView';
import CityModal from './gamemodals/CityModal';
import HexDetailModal from './gamemodals/HexDetailModal';
import { useGameStore } from '@/stores/GameStore';
import { UNIT_PROPS } from '@/utils/Constants';
import { BUILDING_PROPERTIES } from '@/data/BuildingConstants';
import { DomUtils } from '@/utils/DomUtils';
import { enrichMapForExport } from '@/utils/MapExportUtils';
import { getTerrainInfo } from '@/data/TerrainData';
import '../../styles/gameModals.css';
import '../../styles/diplomacyModal.css';
import LeaderPortrait from './LeaderPortrait';
import { LEADER_PORTRAITS, MOOD_COLORS } from '@/data/LeaderPortraits';

const GameModals = ({ gameEngine }) => {
  // console.log('[GameModals] Component rendering, gameEngine present:', !!gameEngine);
  const uiState = useGameStore(state => state.uiState);
  const actions = useGameStore(state => state.actions);
  const isGameStarted = useGameStore(state => state.gameState.isGameStarted);
  const selectedHex = useGameStore(state => state.gameState.selectedHex);
  const selectedCityId: string | null = useGameStore(state => state.gameState.selectedCity);
  const cities = useGameStore(state => state.cities);
  const technologies = useGameStore(state => state.technologies);
  const currentPlayer = useGameStore(state => state.civilizations[state.gameState.activePlayer] || null);

  const units = useGameStore(state => state.units);
  const map = useGameStore(state => state.map);
  const gameStats = useGameStore(state => state.gameStats);

  const civilizations = useGameStore(state => state.civilizations);

  const selectedCity = cities.find(c => c.id === selectedCityId);

  // Check if the selected city belongs to the current player
  const isPlayerCity = selectedCity && currentPlayer && selectedCity.civilizationId === currentPlayer.id;

  // Always use fresh selectedCity from Zustand

  const capitalizeName = (value?: string | null) => {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const getProductionPerTurn = (city: any): number => {
    if (!city) return 0;
    if (typeof city?.yields?.production === 'number') return city.yields.production;
    if (typeof city?.production === 'number') return city.production;
    if (typeof city?.output?.production === 'number') return city.output.production;
    return 0;
  };

  const getProductionProgressValue = (city: any): number => {
  if (!city) return 0;
  // Prefer productionStored for progress
  if (typeof city?.productionStored === 'number') return city.productionStored;
  if (typeof city?.productionProgress === 'number') return city.productionProgress;
  if (typeof city?.shields === 'number') return city.shields;
  return 0;
  };

  const getProductionCost = (item: any): number => {
    if (!item) return 0;
    if (typeof item === 'number') return item;
    if (typeof item === 'string') {
      const unitDef = UNIT_PROPS[item];
      if (unitDef && typeof unitDef.cost === 'number') return unitDef.cost;
      const buildingDef = BUILDING_PROPERTIES[item];
      if (buildingDef && typeof buildingDef.cost === 'number') return buildingDef.cost;
      return 0;
    }
    if (typeof item.cost === 'number') return item.cost;
    if (item.itemType) {
      const unitDef = UNIT_PROPS[item.itemType];
      if (unitDef && typeof unitDef.cost === 'number') return unitDef.cost;
      const buildingDef = BUILDING_PROPERTIES[item.itemType];
      if (buildingDef && typeof buildingDef.cost === 'number') return buildingDef.cost;
    }
    if (item.type) {
      const buildingDef = BUILDING_PROPERTIES[item.type];
      if (buildingDef && typeof buildingDef.cost === 'number') return buildingDef.cost;
    }
    if (item.name && typeof item.name === 'string') {
      const normalizedName = item.name.toLowerCase().replace(/\s+/g, '_');
      const buildingDef = BUILDING_PROPERTIES[normalizedName];
      if (buildingDef && typeof buildingDef.cost === 'number') return buildingDef.cost;
    }
    return 0;
  };

  const getProductionName = (item: any): string => {
    if (!item) return 'Unknown';
    if (typeof item === 'string') {
      return UNIT_PROPS[item]?.name || BUILDING_PROPERTIES[item]?.name || capitalizeName(item);
    }
    if (item.name) return item.name;
    if (item.itemType) {
      return UNIT_PROPS[item.itemType]?.name || BUILDING_PROPERTIES[item.itemType]?.name || capitalizeName(item.itemType);
    }
    if (item.type) {
      return BUILDING_PROPERTIES[item.type]?.name || capitalizeName(item.type);
    }
    return 'Unknown';
  };

  const handleCloseDialog = () => {
    actions.hideDialog();
  };

  const handleNewGame = () => {
    console.log('[CLICK] New Game button');
    if (gameEngine) {
      gameEngine.newGame();
    }
    handleCloseDialog();
  };

  const handleDownloadMap = () => {
    console.log('[CLICK] Download Map button');
    try {
      if (!map || !map.tiles || map.tiles.length === 0) {
        console.warn('[GameModals] handleDownloadMap: no map data available');
        handleCloseDialog();
        return;
      }

      const enriched = enrichMapForExport(map);
      const exportObj = {
        meta: {
          width: map.width,
          height: map.height,
          turn: gameStats?.turn ?? 'unknown'
        },
        map: enriched
      };

      const text = JSON.stringify(exportObj, null, 2);
      const filename = `civ1-map-turn-${gameStats?.turn ?? 'unknown'}.json`;
      DomUtils.downloadTextFile(text, filename);
    } catch (e) {
      console.error('[GameModals] handleDownloadMap error', e);
    }
    handleCloseDialog();
  };

  const handleResearchTechnology = (techId) => {
    console.log(`[CLICK] Research technology: ${techId}`);
    if (gameEngine && currentPlayer) {
      gameEngine.setResearch(currentPlayer.id, techId);
    }
    handleCloseDialog();
  };

  // Helpers: compute prerequisite depth (used to infer era) and group by era
  const getPrerequisiteDepth = (techId: string, visited = new Set()): number => {
    const tech = technologies?.find(t => t.id === techId);
    if (!tech || visited.has(techId)) return 0;
    visited.add(techId);
    if (!tech.prerequisites || tech.prerequisites.length === 0) return 0;
    const depths = tech.prerequisites.map(pr => getPrerequisiteDepth(pr, new Set(visited)));
    return Math.max(...depths) + 1;
  };

  const eraFromDepth = (depth: number) => {
    if (depth === 0) return 'Ancient';
    if (depth === 1) return 'Classical';
    if (depth === 2) return 'Medieval';
    if (depth === 3) return 'Renaissance';
    return 'Industrial';
  };

  const groupByEra = (list) => {
    const groups: Record<string, typeof list> = {};
    (list || []).forEach(tech => {
      const depth = getPrerequisiteDepth(tech.id);
      const era = eraFromDepth(depth);
      if (!groups[era]) groups[era] = [];
      groups[era].push(tech);
    });
    return groups;
  };

  // Game Menu Modal
  const renderGameMenu = () => (
    <Modal show={uiState.activeDialog === 'game-menu'} onHide={handleCloseDialog} centered>
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-gear"></i> Game Menu
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white">
        <div className="d-grid gap-2">
          <Button variant="primary" size="lg" onClick={handleNewGame}>
            <i className="bi bi-plus-circle"></i> New Game
          </Button>
          
          <Button variant="info" size="lg" onClick={() => console.log('[CLICK] Save Game button (not implemented)')}>
            <i className="bi bi-download"></i> Save Game
          </Button>
          
          {isGameStarted && (
            <Button variant="success" size="lg" onClick={handleDownloadMap}>
              <i className="bi bi-map"></i> Download Map
            </Button>
          )}
          
          <Button variant="warning" size="lg" onClick={() => console.log('[CLICK] Load Game button (not implemented)')}>
            <i className="bi bi-upload"></i> Load Game
          </Button>
          
          <Button variant="secondary" size="lg" onClick={() => console.log('[CLICK] Settings button (not implemented)')}>
            <i className="bi bi-gear"></i> Settings
          </Button>
          
          <Button 
            variant="outline-light" 
            size="lg"
            onClick={() => {
              console.log('[CLICK] Help button');
              actions.showDialog('help');
            }}
          >
            <i className="bi bi-question-circle"></i> Help
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );

  // Technology Tree Modal
  const renderTechTree = () => (
    <Modal 
      show={uiState.activeDialog === 'tech'} 
      onHide={handleCloseDialog} 
      centered
      fullscreen={true}
      dialogClassName="tech-tree-modal"
    >
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-lightbulb"></i> Technology Tree
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white tech-tree-modal-body">
        <div className="tech-tree-container">
          <React.Suspense fallback={<div className="text-white p-3">Loading tree...</div>}>
            <TechTreeView technologies={technologies} width={Math.max(window.innerWidth - 200, 800)} />
          </React.Suspense>
        </div>
      </Modal.Body>
    </Modal>
  );

  // Diplomacy Modal — Civ I–style negotiation interface with leader portraits
  const [selectedDiploCiv, setSelectedDiploCiv] = useState<number | null>(null);
  const [diplomacyLog, setDiplomacyLog] = useState<string[]>([]);
  const [showTreatyPanel, setShowTreatyPanel] = useState(false);
  const [counterProposal, setCounterProposal] = useState<any>(null);

  const addDiploLog = (msg: string): void => {
    setDiplomacyLog(prev => [msg, ...prev].slice(0, 20));
  };

  const renderDiplomacy = () => {
    const dm = gameEngine?.diplomacyManager;
    const playerId = currentPlayer?.id ?? 0;
    const otherCivs = civilizations.filter((c: any) => c.id !== playerId && c.isAlive !== false);

    const STATUS_ICONS: Record<string, string> = {
      peace: '🕊️',
      war: '⚔️',
      ceasefire: '🏳️',
      alliance: '🤝',
    };

    const ATTITUDE_LABELS: Record<string, { label: string; color: string }> = {
      friendly: { label: 'Friendly', color: '#4caf50' },
      neutral: { label: 'Neutral', color: '#9e9e9e' },
      annoyed: { label: 'Annoyed', color: '#ff9800' },
      hostile: { label: 'Hostile', color: '#f44336' },
    };

    const TREATY_LABELS: Record<string, { icon: string; label: string }> = {
      open_borders: { icon: '🚪', label: 'Open Borders' },
      trade_agreement: { icon: '📦', label: 'Trade Agreement' },
      mutual_defense: { icon: '🛡️', label: 'Mutual Defense' },
      non_aggression: { icon: '🤚', label: 'Non-Aggression' },
      embargo_target: { icon: '🚫', label: 'Embargo' },
    };

    const handleDiplomacyAction = (targetId: number, action: string, extra?: Record<string, any>) => {
      if (!dm) return;
      let result: any;
      switch (action) {
        case 'declare_war':
          dm.declareWar(playerId, targetId);
          gameEngine?.onStateChange?.('WAR_DECLARED', { aggressorId: playerId, targetId });
          addDiploLog(`You declared war on ${civilizations[targetId]?.name}!`);
          break;
        case 'propose_peace':
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'propose_peace' });
          if (result.counterProposal) {
            setCounterProposal(result.counterProposal);
            addDiploLog(`${civilizations[targetId]?.name} rejected peace but made a counter-offer.`);
          } else {
            addDiploLog(result.accepted
              ? `${civilizations[targetId]?.name} accepted your peace proposal.`
              : `${civilizations[targetId]?.name} rejected peace: "${result.reason}"`);
          }
          break;
        case 'propose_ceasefire':
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'propose_ceasefire' });
          if (result.counterProposal) {
            setCounterProposal(result.counterProposal);
            addDiploLog(`${civilizations[targetId]?.name} counter-proposes instead.`);
          } else {
            addDiploLog(result.accepted
              ? `Ceasefire agreed with ${civilizations[targetId]?.name}.`
              : `${civilizations[targetId]?.name} rejected ceasefire: "${result.reason}"`);
          }
          break;
        case 'propose_alliance':
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'propose_alliance' });
          if (result.counterProposal) {
            setCounterProposal(result.counterProposal);
            addDiploLog(`${civilizations[targetId]?.name} declines alliance but offers an alternative.`);
          } else {
            addDiploLog(result.accepted
              ? `Alliance formed with ${civilizations[targetId]?.name}!`
              : `${civilizations[targetId]?.name} rejected alliance: "${result.reason}"`);
          }
          break;
        case 'demand_tribute': {
          const demand = 50;
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'demand_tribute', goldAmount: demand });
          if (result.counterProposal) {
            setCounterProposal(result.counterProposal);
            addDiploLog(`${civilizations[targetId]?.name} refuses tribute but offers a deal.`);
          } else {
            addDiploLog(result.accepted
              ? `${civilizations[targetId]?.name} paid ${result.goldTransferred ?? demand} gold in tribute.`
              : `${civilizations[targetId]?.name} refused your demand: "${result.reason}"`);
          }
          break;
        }
        case 'offer_open_borders':
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'offer_open_borders' });
          addDiploLog(result.accepted
            ? `Open borders established with ${civilizations[targetId]?.name}.`
            : `${civilizations[targetId]?.name} refused open borders.`);
          break;
        case 'propose_trade_agreement':
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'propose_trade_agreement', goldAmount: 2 });
          addDiploLog(result.accepted
            ? `Trade agreement signed with ${civilizations[targetId]?.name}! (+2 gold/turn)`
            : `${civilizations[targetId]?.name} refused trade.`);
          break;
        case 'propose_mutual_defense':
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'propose_mutual_defense' });
          addDiploLog(result.accepted
            ? `Mutual defense pact with ${civilizations[targetId]?.name}!`
            : `${civilizations[targetId]?.name} refused the defense pact.`);
          break;
        case 'propose_non_aggression':
          result = dm.processProposal({ fromCivId: playerId, toCivId: targetId, action: 'propose_non_aggression' });
          addDiploLog(result.accepted
            ? `Non-aggression pact signed with ${civilizations[targetId]?.name}.`
            : `${civilizations[targetId]?.name} refused the pact.`);
          break;
        case 'cancel_treaty': {
          const treaty = extra?.treaty;
          if (treaty) {
            dm.cancelTreaty(playerId, targetId, treaty);
            addDiploLog(`You cancelled ${TREATY_LABELS[treaty]?.label || treaty} with ${civilizations[targetId]?.name}.`);
          }
          break;
        }
        case 'accept_counter': {
          if (counterProposal) {
            const cpResult = dm.processProposal(counterProposal);
            const cpAction = counterProposal.action.replace(/_/g, ' ');
            addDiploLog(cpResult.accepted
              ? `You accepted their counter-proposal: ${cpAction}.`
              : `Counter-proposal could not be executed.`);
            setCounterProposal(null);
          }
          break;
        }
        case 'reject_counter':
          addDiploLog('You rejected their counter-proposal.');
          setCounterProposal(null);
          break;
      }
      // Force re-render by syncing state
      if (gameEngine?.units) actions.updateUnits?.([...gameEngine.units]);
      if (gameEngine?.civilizations) actions.updateCivilizations?.([...gameEngine.civilizations]);
    };

    const selectedCivData = selectedDiploCiv !== null ? civilizations[selectedDiploCiv] : null;
    const selectedStatus = selectedDiploCiv !== null ? (dm?.getStatus(playerId, selectedDiploCiv) ?? 'peace') : 'peace';
    const selectedAttitude = selectedDiploCiv !== null ? (dm?.getAttitude(playerId, selectedDiploCiv) ?? 'neutral') : 'neutral';
    const selectedRelation = selectedDiploCiv !== null ? dm?.getRelation(playerId, selectedDiploCiv) : null;

    // Leader portrait lookup
    const leaderName = selectedCivData?.leader || selectedCivData?.leaderName || '';
    const portraitConfig = LEADER_PORTRAITS[leaderName] || null;
    const moodColors = MOOD_COLORS[selectedAttitude] || MOOD_COLORS.neutral;
    const activeTreaties: string[] = selectedDiploCiv !== null ? (dm?.getActiveTreaties?.(playerId, selectedDiploCiv) ?? []) : [];

    return (
      <Modal 
        show={uiState.activeDialog === 'diplomacy'} 
        onHide={() => { handleCloseDialog(); setSelectedDiploCiv(null); setDiplomacyLog([]); setShowTreatyPanel(false); setCounterProposal(null); }} 
        centered
        size="xl"
        dialogClassName="diplomacy-modal"
      >
        <Modal.Header closeButton className="diplomacy-header">
          <Modal.Title>
            ⚖️ Diplomatic Relations
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="diplomacy-body">
          {otherCivs.length === 0 ? (
            <p className="text-muted text-center py-4">No other civilizations discovered yet.</p>
          ) : (
            <div className="diplomacy-layout">
              {/* Left: Civilization list */}
              <div className="diplomacy-civ-list">
                <div className="diplomacy-section-label">CIVILIZATIONS</div>
                {otherCivs.map((civ: any) => {
                  const status = dm?.getStatus(playerId, civ.id) ?? 'peace';
                  const treaties = dm?.getActiveTreaties?.(playerId, civ.id) ?? [];
                  const isSelected = selectedDiploCiv === civ.id;
                  return (
                    <button
                      key={civ.id}
                      className={`diplomacy-civ-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => { setSelectedDiploCiv(civ.id); setShowTreatyPanel(false); setCounterProposal(null); }}
                    >
                      <span className="diplomacy-civ-icon" style={{ color: civ.color || '#fff' }}>
                        {civ.icon || '👤'}
                      </span>
                      <span className="diplomacy-civ-name">
                        {civ.name}
                        {treaties.length > 0 && <span className="diplomacy-treaty-count">+{treaties.length}</span>}
                      </span>
                      <span className="diplomacy-status-icon">{STATUS_ICONS[status] || '❓'}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right: Negotiation panel with portrait */}
              <div className="diplomacy-negotiation" style={{ background: moodColors.bg, borderLeft: `2px solid ${moodColors.border}` }}>
                {selectedCivData ? (
                  <>
                    {/* Portrait & leader info section */}
                    <div className="diplomacy-audience" style={{ boxShadow: `inset 0 0 40px ${moodColors.glow}` }}>
                      {/* Leader portrait slot */}
                      <div className="diplomacy-portrait-slot" style={{ borderColor: moodColors.border }}>
                        {portraitConfig ? (
                          <LeaderPortrait config={portraitConfig} mood={selectedAttitude} size={110} />
                        ) : (
                          <div className="diplomacy-portrait-placeholder" style={{ color: selectedCivData.color || '#fff' }}>
                            <span className="diplomacy-portrait-icon">{selectedCivData.icon || '👤'}</span>
                          </div>
                        )}
                      </div>

                      {/* Leader name & title */}
                      <div className="diplomacy-leader-info">
                        <div className="diplomacy-leader-name">{leaderName || 'Unknown Leader'}</div>
                        <div className="diplomacy-leader-title">
                          {portraitConfig?.title || `Leader of the ${selectedCivData.name}`}
                        </div>
                        <div className="diplomacy-attitude-badge" style={{
                          color: ATTITUDE_LABELS[selectedAttitude]?.color || '#9e9e9e',
                          borderColor: ATTITUDE_LABELS[selectedAttitude]?.color || '#9e9e9e',
                        }}>
                          {ATTITUDE_LABELS[selectedAttitude]?.label || 'Unknown'}
                        </div>
                      </div>

                      {/* Status panel */}
                      <div className="diplomacy-status-panel">
                        <div className="diplomacy-status-chip">
                          <span className={`diplomacy-status-value status-${selectedStatus}`}>
                            {STATUS_ICONS[selectedStatus]} {selectedStatus.toUpperCase()}
                          </span>
                        </div>
                        {selectedRelation && (
                          <>
                            <div className="diplomacy-stat">
                              <span className="diplomacy-stat-label">Reputation</span>
                              <span style={{ color: selectedRelation.reputationModifier < 0 ? '#f44336' : selectedRelation.reputationModifier > 0 ? '#4caf50' : '#9e9e9e' }}>
                                {selectedRelation.reputationModifier > 0 ? '+' : ''}{selectedRelation.reputationModifier}
                              </span>
                            </div>
                            <div className="diplomacy-stat">
                              <span className="diplomacy-stat-label">Since turn</span>
                              <span style={{ color: '#aaa' }}>{selectedRelation.since}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Military strength comparison */}
                    {(() => {
                      const playerStr = dm?.estimateMilitaryStrength?.(playerId) ?? 0;
                      const theirStr = dm?.estimateMilitaryStrength?.(selectedDiploCiv!) ?? 0;
                      const total = Math.max(playerStr + theirStr, 1);
                      const playerPct = (playerStr / total) * 100;
                      const ratio = theirStr > 0 ? playerStr / theirStr : playerStr > 0 ? 99 : 1;
                      const strengthLabel = ratio > 2 ? 'Supreme' : ratio > 1.3 ? 'Superior' : ratio > 0.8 ? 'Comparable' : ratio > 0.5 ? 'Weaker' : 'Inferior';
                      const strengthColor = ratio > 1.3 ? '#4caf50' : ratio > 0.8 ? '#9e9e9e' : '#f44336';
                      return (
                        <div className="diplomacy-strength-section">
                          <span className="diplomacy-label">Military Strength:</span>
                          <span style={{ color: strengthColor, fontWeight: 'bold' }}>{strengthLabel}</span>
                          <div className="diplomacy-strength-bar-visual">
                            <div className="diplomacy-strength-fill-player" style={{ width: `${playerPct}%` }} />
                            <div className="diplomacy-strength-fill-enemy" style={{ width: `${100 - playerPct}%` }} />
                          </div>
                          <span className="diplomacy-strength-nums">You: {Math.round(playerStr)} | Them: {Math.round(theirStr)}</span>
                        </div>
                      );
                    })()}

                    {/* Active treaties display */}
                    {activeTreaties.length > 0 && (
                      <div className="diplomacy-treaties-row">
                        <span className="diplomacy-label">Active Treaties:</span>
                        <div className="diplomacy-treaty-badges">
                          {activeTreaties.map((t: string) => (
                            <span key={t} className="diplomacy-treaty-badge">
                              {TREATY_LABELS[t]?.icon || '📜'} {TREATY_LABELS[t]?.label || t}
                              <button
                                className="diplomacy-treaty-cancel"
                                onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'cancel_treaty', { treaty: t })}
                                title="Cancel treaty"
                              >×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Treaty broken warning */}
                    {selectedRelation && (selectedRelation.treatiesBrokenByA > 0 || selectedRelation.treatiesBrokenByB > 0) && (
                      <div className="diplomacy-warning">
                        ⚠️ Treaties broken: {(selectedRelation.treatiesBrokenByA || 0) + (selectedRelation.treatiesBrokenByB || 0)}
                      </div>
                    )}

                    {/* Counter-proposal banner */}
                    {counterProposal && (
                      <div className="diplomacy-counter-proposal">
                        <div className="diplomacy-counter-title">📜 Counter-Proposal</div>
                        <div className="diplomacy-counter-text">
                          {civilizations[selectedDiploCiv!]?.name} suggests: <strong>{counterProposal.action.replace(/_/g, ' ')}</strong>
                          {counterProposal.goldAmount ? ` (${counterProposal.goldAmount} gold)` : ''}
                        </div>
                        <div className="diplomacy-counter-buttons">
                          <button className="diplomacy-btn btn-peace" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'accept_counter')}>
                            ✓ Accept
                          </button>
                          <button className="diplomacy-btn btn-war" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'reject_counter')}>
                            ✗ Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Negotiation buttons */}
                    <div className="diplomacy-section-label">NEGOTIATIONS</div>
                    <div className="diplomacy-actions">
                      {selectedStatus === 'war' && (
                        <>
                          <button className="diplomacy-btn btn-ceasefire" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'propose_ceasefire')}>
                            🏳️ Propose Ceasefire
                          </button>
                          <button className="diplomacy-btn btn-peace" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'propose_peace')}>
                            🕊️ Offer Peace
                          </button>
                        </>
                      )}
                      {selectedStatus === 'ceasefire' && (
                        <>
                          <button className="diplomacy-btn btn-peace" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'propose_peace')}>
                            🕊️ Offer Peace Treaty
                          </button>
                          <button className="diplomacy-btn btn-war" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'declare_war')}>
                            ⚔️ Declare War
                          </button>
                        </>
                      )}
                      {selectedStatus === 'peace' && (
                        <>
                          <button className="diplomacy-btn btn-alliance" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'propose_alliance')}>
                            🤝 Propose Alliance
                          </button>
                          <button className="diplomacy-btn btn-tribute" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'demand_tribute')}>
                            💰 Demand Tribute
                          </button>
                          <button className="diplomacy-btn btn-war" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'declare_war')}>
                            ⚔️ Declare War
                          </button>
                        </>
                      )}
                      {selectedStatus === 'alliance' && (
                        <>
                          <button className="diplomacy-btn btn-tribute" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'demand_tribute')}>
                            💰 Demand Tribute
                          </button>
                          <button className="diplomacy-btn btn-war" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'declare_war')}>
                            ⚔️ Break Alliance &amp; Declare War
                          </button>
                        </>
                      )}
                    </div>

                    {/* Advanced treaties toggle */}
                    {selectedStatus !== 'war' && (
                      <>
                        <button
                          className="diplomacy-toggle-treaties"
                          onClick={() => setShowTreatyPanel(!showTreatyPanel)}
                        >
                          {showTreatyPanel ? '▾' : '▸'} Advanced Treaties
                        </button>
                        {showTreatyPanel && (
                          <div className="diplomacy-actions diplomacy-treaty-actions">
                            {!activeTreaties.includes('open_borders') && (
                              <button className="diplomacy-btn btn-treaty" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'offer_open_borders')}>
                                🚪 Open Borders
                              </button>
                            )}
                            {!activeTreaties.includes('trade_agreement') && (
                              <button className="diplomacy-btn btn-treaty" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'propose_trade_agreement')}>
                                📦 Trade Agreement
                              </button>
                            )}
                            {!activeTreaties.includes('mutual_defense') && (
                              <button className="diplomacy-btn btn-treaty" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'propose_mutual_defense')}>
                                🛡️ Mutual Defense Pact
                              </button>
                            )}
                            {!activeTreaties.includes('non_aggression') && (
                              <button className="diplomacy-btn btn-treaty" onClick={() => handleDiplomacyAction(selectedDiploCiv!, 'propose_non_aggression')}>
                                🤚 Non-Aggression Pact
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Diplomacy event log (session) */}
                    {diplomacyLog.length > 0 && (
                      <>
                        <div className="diplomacy-section-label">RECENT EVENTS</div>
                        <div className="diplomacy-log">
                          {diplomacyLog.map((msg, i) => (
                            <div key={i} className="diplomacy-log-entry">{msg}</div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Global diplomacy history from DiplomacyManager */}
                    {(() => {
                      const events = dm?.getEventLog?.() ?? [];
                      const relevant = events.filter(
                        (e: any) => e.fromCivId === selectedDiploCiv || e.toCivId === selectedDiploCiv
                          || e.fromCivId === playerId || e.toCivId === playerId
                      ).slice(0, 8);
                      if (relevant.length === 0) return null;
                      return (
                        <>
                          <div className="diplomacy-section-label">HISTORY</div>
                          <div className="diplomacy-log">
                            {relevant.map((e: any, i: number) => {
                              const from = civilizations[e.fromCivId]?.name ?? `Civ ${e.fromCivId}`;
                              const to = civilizations[e.toCivId]?.name ?? `Civ ${e.toCivId}`;
                              const labels: Record<string, string> = {
                                war_declared: `⚔️ ${from} declared war on ${to}`,
                                peace_made: `🕊️ Peace between ${from} and ${to}`,
                                ceasefire_signed: `🏳️ Ceasefire between ${from} and ${to}`,
                                alliance_formed: `🤝 Alliance between ${from} and ${to}`,
                                tribute_paid: `💰 ${from} paid tribute to ${to}${e.goldAmount ? ` (${e.goldAmount}g)` : ''}`,
                                treaty_rejected: `❌ ${to} rejected ${from}'s proposal`,
                                unit_bribed: `🎭 ${from} bribed a unit`,
                                intelligence_gathered: `🔍 ${from} spied on ${to}`,
                                open_borders_signed: `🚪 Open borders: ${from} ↔ ${to}`,
                                trade_agreement_signed: `📦 Trade deal: ${from} ↔ ${to}`,
                                mutual_defense_signed: `🛡️ Defense pact: ${from} ↔ ${to}`,
                                non_aggression_signed: `🤚 Non-aggression: ${from} ↔ ${to}`,
                                embargo_declared: `🚫 Embargo declared by ${from} & ${to}`,
                                treaty_cancelled: `📜 Treaty cancelled by ${from}`,
                                tech_exchanged: `🔬 Tech exchange: ${from} ↔ ${to}`,
                                counter_proposal: `📜 Counter-proposal from ${from}`,
                              };
                              return (
                                <div key={i} className="diplomacy-log-entry">
                                  {labels[e.type] ?? `${e.type}: ${e.details ?? ''}`}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <div className="diplomacy-placeholder">
                    <div className="diplomacy-placeholder-scene">
                      <div className="diplomacy-placeholder-icon">⚖️</div>
                      <div>Select a civilization to begin negotiations.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal.Body>
      </Modal>
    );
  };

  // Diplomacy Report — read-only overview of current diplomatic state (Civ I Foreign Advisor style)
  const renderDiplomacyReport = (): React.ReactNode => {
    const dm = gameEngine?.diplomacyManager;
    const playerId = currentPlayer?.id ?? 0;
    const otherCivs = civilizations.filter((c: any) => c.id !== playerId && c.isAlive !== false);

    const STATUS_ICONS: Record<string, string> = {
      peace: '🕊️',
      war: '⚔️',
      ceasefire: '🏳️',
      alliance: '🤝',
    };

    const ATTITUDE_LABELS: Record<string, { label: string; color: string }> = {
      friendly: { label: 'Friendly', color: '#4caf50' },
      neutral: { label: 'Neutral', color: '#9e9e9e' },
      annoyed: { label: 'Annoyed', color: '#ff9800' },
      hostile: { label: 'Hostile', color: '#f44336' },
    };

    const TREATY_LABELS: Record<string, { icon: string; label: string }> = {
      open_borders: { icon: '🚪', label: 'Open Borders' },
      trade_agreement: { icon: '📦', label: 'Trade Agreement' },
      mutual_defense: { icon: '🛡️', label: 'Mutual Defense' },
      non_aggression: { icon: '🤚', label: 'Non-Aggression' },
      embargo_target: { icon: '🚫', label: 'Embargo' },
    };

    return (
      <Modal
        show={uiState.activeDialog === 'diplomacy-report'}
        onHide={handleCloseDialog}
        centered
        size="lg"
        dialogClassName="diplomacy-modal"
      >
        <Modal.Header closeButton className="diplomacy-header">
          <Modal.Title>📋 Foreign Advisor</Modal.Title>
        </Modal.Header>
        <Modal.Body className="diplomacy-body">
          {otherCivs.length === 0 ? (
            <p className="text-muted text-center py-4">No other civilizations discovered yet.</p>
          ) : (
            <div className="diplomacy-report-list">
              {otherCivs.map((civ: any) => {
                const status = dm?.getStatus(playerId, civ.id) ?? 'peace';
                const attitude = dm?.getAttitude(playerId, civ.id) ?? 'neutral';
                const relation = dm?.getRelation?.(playerId, civ.id);
                const treaties: string[] = dm?.getActiveTreaties?.(playerId, civ.id) ?? [];
                const attLabel = ATTITUDE_LABELS[attitude] || ATTITUDE_LABELS.neutral;
                const leaderName = civ.leader || civ.leaderName || '';
                const portraitConfig = LEADER_PORTRAITS[leaderName] || null;

                return (
                  <div key={civ.id} className="diplomacy-report-row" style={{ borderLeftColor: civ.color || '#555' }}>
                    <div className="diplomacy-report-portrait">
                      {portraitConfig ? (
                        <LeaderPortrait config={portraitConfig} mood={attitude} size={60} />
                      ) : (
                        <span className="diplomacy-report-icon" style={{ color: civ.color || '#fff' }}>
                          {civ.icon || '👤'}
                        </span>
                      )}
                    </div>
                    <div className="diplomacy-report-info">
                      <div className="diplomacy-report-name">
                        {civ.name}
                        {leaderName && <span className="diplomacy-report-leader"> — {leaderName}</span>}
                      </div>
                      <div className="diplomacy-report-status-row">
                        <span className={`diplomacy-report-status status-${status}`}>
                          {STATUS_ICONS[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                        <span className="diplomacy-report-attitude" style={{ color: attLabel.color }}>
                          {attLabel.label}
                        </span>
                        {relation && (
                          <span className="diplomacy-report-rep" style={{ color: relation.reputationModifier < 0 ? '#f44336' : relation.reputationModifier > 0 ? '#4caf50' : '#9e9e9e' }}>
                            Rep: {relation.reputationModifier > 0 ? '+' : ''}{relation.reputationModifier}
                          </span>
                        )}
                      </div>
                      {treaties.length > 0 && (
                        <div className="diplomacy-report-treaties">
                          {treaties.map((t: string) => (
                            <span key={t} className="diplomacy-treaty-badge">
                              {TREATY_LABELS[t]?.icon || '📜'} {TREATY_LABELS[t]?.label || t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Global diplomacy history */}
              {(() => {
                const events = dm?.getEventLog?.() ?? [];
                const recent = events.slice(0, 12);
                if (recent.length === 0) return null;
                return (
                  <>
                    <div className="diplomacy-section-label" style={{ marginTop: '16px' }}>RECENT HISTORY</div>
                    <div className="diplomacy-log">
                      {recent.map((e: any, i: number) => {
                        const from = civilizations[e.fromCivId]?.name ?? `Civ ${e.fromCivId}`;
                        const to = civilizations[e.toCivId]?.name ?? `Civ ${e.toCivId}`;
                        const labels: Record<string, string> = {
                          war_declared: `⚔️ ${from} declared war on ${to}`,
                          peace_made: `🕊️ Peace between ${from} and ${to}`,
                          ceasefire_signed: `🏳️ Ceasefire between ${from} and ${to}`,
                          alliance_formed: `🤝 Alliance between ${from} and ${to}`,
                          tribute_paid: `💰 ${from} paid tribute to ${to}${e.goldAmount ? ` (${e.goldAmount}g)` : ''}`,
                          treaty_rejected: `❌ ${to} rejected ${from}'s proposal`,
                          open_borders_signed: `🚪 Open borders: ${from} ↔ ${to}`,
                          trade_agreement_signed: `📦 Trade deal: ${from} ↔ ${to}`,
                          mutual_defense_signed: `🛡️ Defense pact: ${from} ↔ ${to}`,
                          non_aggression_signed: `🤚 Non-aggression: ${from} ↔ ${to}`,
                          embargo_declared: `🚫 Embargo declared by ${from} & ${to}`,
                          treaty_cancelled: `📜 Treaty cancelled by ${from}`,
                        };
                        return (
                          <div key={i} className="diplomacy-log-entry">
                            {labels[e.type] ?? `${e.type}: ${e.details ?? ''}`}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </Modal.Body>
      </Modal>
    );
  };

  // Help Modal
  const renderHelp = () => (
    <Modal 
      show={uiState.activeDialog === 'help'} 
      onHide={handleCloseDialog} 
      centered
      size="lg"
    >
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-question-circle"></i> Help & Controls
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white city-detail-modal-body">
        <Tabs defaultActiveKey="controls" className="mb-3">
          <Tab eventKey="controls" title="Controls">
            <h6>Mouse Controls:</h6>
            <ListGroup variant="flush" className="mb-3">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Left Click:</strong> Select units, cities, or tiles
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Right Click:</strong> Unit context menu
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Drag:</strong> Pan the camera around the map
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Scroll Wheel:</strong> Zoom in and out
              </ListGroup.Item>
            </ListGroup>

            <h6>Unit Actions (when unit selected):</h6>
            <ListGroup variant="flush" className="mb-3">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>S:</strong> Skip unit's turn
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>F:</strong> Fortify unit
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>W:</strong> Wait (move unit to end of queue)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>G:</strong> Go To (click destination)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>B:</strong> Build road
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>I:</strong> Irrigate
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>M:</strong> Build mine
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>P:</strong> Clean pollution
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Space:</strong> Cycle units on same tile
              </ListGroup.Item>
            </ListGroup>

            <h6>Global Shortcuts:</h6>
            <ListGroup variant="flush" className="mb-3">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Enter:</strong> End turn
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>D:</strong> Diplomacy report
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>R:</strong> Rush city production (when city selected)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>C:</strong> Center map on selected unit
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>T:</strong> Open settings
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Escape:</strong> Close dialogs / deselect
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>+/−:</strong> Zoom in / out
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Arrow Keys:</strong> Move unit / Shift+Arrow: Scroll map
              </ListGroup.Item>
            </ListGroup>

            <h6>Function Keys:</h6>
            <ListGroup variant="flush" className="mb-3">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>F1:</strong> Help
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>F2:</strong> Tech Tree
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>F3:</strong> Settings
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>F4:</strong> Diplomacy report
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>F11:</strong> Toggle fullscreen
              </ListGroup.Item>
            </ListGroup>

            <h6>Ctrl Shortcuts:</h6>
            <ListGroup variant="flush">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Ctrl+S:</strong> Save game
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Ctrl+L:</strong> Load game
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Ctrl+1–9:</strong> Select city by number
              </ListGroup.Item>
            </ListGroup>
          </Tab>
          
          <Tab eventKey="orders" title="Orders Menu">
            <h6>Tile Improvements (via ORDERS menu):</h6>
            <ListGroup variant="flush">
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Build City:</strong> Settler founds a new city
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Build Road:</strong> +0.5 trade, faster movement (1 turn)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Irrigate:</strong> +1 food on grassland/plains/desert (2 turns)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Mine:</strong> +1 production on mountains/hills (8 turns)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Fortify:</strong> Defensive bonus for military units
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Railroad:</strong> Upgrades road — +0.5 food/prod/trade (requires Railroad tech)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Farmland:</strong> Upgrades irrigation — +2 food (requires Refrigeration tech)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Port:</strong> +1 food/trade on coast (requires Navigation tech)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Airport:</strong> +1 trade on land (requires Flight tech)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Superhighways:</strong> Upgrades road — +1.5 trade (requires Automobile tech)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Clean Pollution:</strong> Removes pollution from tile (2 turns)
              </ListGroup.Item>
              <ListGroup.Item className="bg-dark text-white border-secondary">
                <strong>Fortress:</strong> +80% defense bonus (6 turns)
              </ListGroup.Item>
            </ListGroup>
          </Tab>

          <Tab eventKey="gameplay" title="Gameplay">
            <h6>Getting Started:</h6>
            <ol>
              <li>Move your settler to a good location near water and resources</li>
              <li>Found your first city by selecting the settler and clicking "Found City"</li>
              <li>Explore with your warrior to find other civilizations and resources</li>
              <li>Build more units and buildings in your cities</li>
              <li>Research technologies to unlock new capabilities</li>
              <li>Expand your civilization and compete with others!</li>
            </ol>

            <h6>Resources:</h6>
            <ul>
              <li><strong>Food:</strong> Grows city population</li>
              <li><strong>Production:</strong> Builds units and structures</li>
              <li><strong>Trade:</strong> Generates gold and science</li>
              <li><strong>Science:</strong> Researches new technologies</li>
              <li><strong>Gold:</strong> Maintains units and buildings</li>
            </ul>

            <h6>Diplomacy:</h6>
            <ul>
              <li>Press <strong>D</strong> or <strong>F4</strong> to view diplomatic relations</li>
              <li>Diplomatic talks are initiated through in-game events (contact with foreign units)</li>
              <li>States: Peace, Ceasefire, Alliance, War</li>
              <li>Treaties: Open Borders, Trade Agreement, Mutual Defense, Non-Aggression</li>
              <li>Breaking treaties damages your reputation with all civilizations</li>
            </ul>
          </Tab>
          
          <Tab eventKey="about" title="About">
            <h5>Civilization Browser</h5>
            <p>A browser-based recreation inspired by the classic Civilization (1991).</p>
            
            <h6>Features:</h6>
            <ul>
              <li>Square grid map with fog of war</li>
              <li>Turn-based gameplay with AI opponents</li>
              <li>City building, management, and production</li>
              <li>Unit movement, combat, and fortification</li>
              <li>Technology research tree</li>
              <li>Diplomacy system with treaties and negotiations</li>
              <li>Tile improvements (roads, irrigation, mines, and more)</li>
              <li>Save and load game support</li>
            </ul>

            <p className="mt-3">
              <small className="text-muted">
                Fan-made recreation for educational purposes.
                Original Civilization © MicroProse/Firaxis Games
              </small>
            </p>
          </Tab>
        </Tabs>
      </Modal.Body>
    </Modal>
  );

  // City Production Modal
  const handleStartProduction = (unitKey: string) => {
    if (!selectedCity) return;
    const unitDef = UNIT_PROPS[unitKey];
    if (!unitDef) return;

    const item = {
      type: 'unit',
      itemType: unitKey,
      name: unitDef.name,
      cost: unitDef.cost
    };

    if (gameEngine && typeof gameEngine.setCityProduction === 'function') {
      gameEngine.setCityProduction(selectedCity.id, item, false);
      actions.addNotification({ type: 'success', message: `Started production: ${item.name}` });
    }

    // Close dialog after selecting
    actions.hideDialog();
  };

  const handleQueueProduction = (unitKey: string) => {
    if (!selectedCity) {
      console.warn('[GameModals] handleQueueProduction: No city selected');
      return;
    }
    const unitDef = UNIT_PROPS[unitKey];
    if (!unitDef) {
      console.warn('[GameModals] handleQueueProduction: Invalid unit key', unitKey);
      return;
    }

    const item = {
      type: 'unit',
      itemType: unitKey,
      name: unitDef.name,
      cost: unitDef.cost
    };

    console.log('[GameModals] handleQueueProduction: gameEngine object', gameEngine);
    if (gameEngine && typeof gameEngine.getAllCities === 'function') {
      console.log('[GameModals] handleQueueProduction: gameEngine.getAllCities()', gameEngine.getAllCities());
    }

    if (gameEngine) {
      const hasMethod = typeof (gameEngine as any).setCityProduction === 'function';
      console.log('[GameModals] handleQueueProduction: engine method present?', { hasMethod });
      let ok: any = null;
      try {
        if (hasMethod) ok = (gameEngine as any).setCityProduction(selectedCity.id, item, true);
        else console.warn('[GameModals] handleQueueProduction: setCityProduction not available on engine');
      } catch (e) {
        console.error('[GameModals] handleQueueProduction: exception calling setCityProduction', e);
      }

      console.log('[GameModals] handleQueueProduction: setCityProduction returned', ok);

      // Always try to inspect engine city list for debugging
      try {
        if ((gameEngine as any).getAllCities) {
          const allCities = (gameEngine as any).getAllCities();
          console.log('[GameModals] handleQueueProduction: engine.getAllCities()', allCities.map(c => ({ id: c.id, buildQueue: c.buildQueue })));
          actions.updateCities(allCities);
          const updated = allCities.find((c: any) => c.id === selectedCity.id);
          console.log('[GameModals] handleQueueProduction: updated selectedCity from engine', { id: updated?.id, buildQueue: updated?.buildQueue });
        }
      } catch (e) {
        console.error('[GameModals] handleQueueProduction: error reading engine cities', e);
      }

      const success = ok && (ok.success === true || ok === true);
      if (success) {
        actions.addNotification({ type: 'info', message: `Queued production: ${item.name}` });
      } else {
        actions.addNotification({ type: 'warning', message: `Failed to queue: ${item.name}` });
      }
    }

    console.log('[GameModals] handleQueueProduction: After queue', {
      cityId: selectedCity.id,
      buildQueue: selectedCity.buildQueue
    });
  };

  // New: track a single selected production item for the select box
  const [selectedProductionKey, setSelectedProductionKey] = useState<string | null>(null);
  // Track selected index in the queue (for removal)
  const [selectedQueueIndex, setSelectedQueueIndex] = useState<number | null>(null);

  // Helper function to check if a city is coastal (has water tiles adjacent or on its position)
  const checkIfCityIsCoastal = useCallback((city: any, gameEngine: any): boolean => {
    if (!gameEngine || !gameEngine.map || !gameEngine.map.getTile) return false;
    
    const directions = [
      { col: 0, row: 0 }, // city tile itself
      { col: -1, row: -1 }, { col: 0, row: -1 }, { col: 1, row: -1 },
      { col: -1, row: 0 }, { col: 1, row: 0 },
      { col: -1, row: 1 }, { col: 0, row: 1 }, { col: 1, row: 1 }
    ];
    
    for (const dir of directions) {
      const tile = gameEngine.map.getTile(city.col + dir.col, city.row + dir.row);
      if (tile && (tile.terrain === 'ocean' || tile.terrain === 'coast')) {
        return true;
      }
    }
    return false;
  }, []);

  // Build available items list (filtered) using same logic as render list
  const availableProductionKeys = useMemo(() => {
    return Object.keys(UNIT_PROPS).filter((key) => {
      const u = UNIT_PROPS[key];
      const req = (u as any).requires || null;
      if (req && currentPlayer && Array.isArray(currentPlayer.technologies)) {
        // Handle both single requirement and array of requirements
        const requirements = Array.isArray(req) ? req : [req];
        const hasAllRequiredTechs = requirements.every((tech: string) => currentPlayer.technologies.includes(tech));
        if (!hasAllRequiredTechs) return false;
      }

      if (u.naval && selectedCity) {
        // Check if city has harbor or is coastal (tile or adjacent tiles are water)
        const hasHarbor = selectedCity.buildings && selectedCity.buildings.includes('harbor');
        if (!hasHarbor) {
          const isCoastal = checkIfCityIsCoastal(selectedCity, gameEngine);
          if (!isCoastal) return false;
        }
      }

      return true;
    });
  }, [currentPlayer, selectedCity, checkIfCityIsCoastal]);

  // Ensure there is a default selection when modal opens or available list changes
  useEffect(() => {
    if (!selectedProductionKey && availableProductionKeys && availableProductionKeys.length > 0) {
      setSelectedProductionKey(availableProductionKeys[0]);
    }
    // Clear selection if nothing available
    if (availableProductionKeys.length === 0) setSelectedProductionKey(null);
    // Log available production options for debugging
    // console.log('[GameModals] availableProductionKeys', availableProductionKeys);
  }, [availableProductionKeys]);

  // Reset queue selection when the selected city changes
  useEffect(() => {
    setSelectedQueueIndex(null);
    if (selectedCity) console.log('[GameModals] selectedCity changed', { id: selectedCity.id, name: selectedCity.name, buildQueue: selectedCity.buildQueue });
  }, [selectedCityId]);

  const renderCityProduction = () => (
    <Modal
      show={uiState.activeDialog === 'city-production'}
      onHide={handleCloseDialog}
      centered
      size="lg"
      dialogClassName="city-production-modal"
    >
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-gear"></i> {selectedCity?.name || 'City Production'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white">
        <div className="row">
          <div className="col-md-12 mb-2">
            <p>Select a unit to produce in this city. Production cost is shown in shields.</p>
          </div>
        </div>
        {renderProductionContent()}
      </Modal.Body>
    </Modal>
  );

  // Reusable production list content (used both in modal and city details tab)
  // Render production summary: current production and queued items
  const renderProductionContent = () => {
    if (!selectedCity) {
      return <div>No city selected</div>;
    }

    const productionPerTurn = getProductionPerTurn(selectedCity);
    // Always use productionStored for current production progress
    const productionProgressValue = typeof selectedCity.productionStored === 'number'
      ? selectedCity.productionStored
      : 0;
    const currentProductionItem = selectedCity.currentProduction;
    const currentProductionCost = getProductionCost(currentProductionItem);
    const currentProductionName = getProductionName(currentProductionItem);
    const clampedProgress = currentProductionCost > 0
      ? Math.min(Math.max(productionProgressValue, 0), currentProductionCost)
      : Math.max(productionProgressValue, 0);
    const progressPercent = currentProductionCost > 0
      ? Math.min(100, Math.round((clampedProgress / currentProductionCost) * 100))
      : 0;
    const remainingShields = currentProductionCost > 0
      ? Math.max(0, currentProductionCost - productionProgressValue)
      : 0;
    const turnsRemaining = currentProductionItem && currentProductionCost > 0 && productionPerTurn > 0
      ? Math.max(0, Math.ceil(remainingShields / productionPerTurn))
      : null;
    const formatTurns = (value: number | null) => {
      if (value === null) return '—';
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      return value;
    };
    const hasQueueItems = Array.isArray(selectedCity.buildQueue) && selectedCity.buildQueue.length > 0;

    return (
      <div>
        <div className="mb-3">
          <h6>Current Production</h6>
          {currentProductionItem ? (
            <div className="bg-secondary text-white p-2 rounded">
              <strong>{currentProductionName}</strong>
              <div className="small text-muted">
                {currentProductionCost > 0
                  ? `Progress: ${Math.round(clampedProgress)} / ${currentProductionCost} (${progressPercent}%)`
                  : `Progress: ${Math.round(clampedProgress)} shields`}
              </div>
              <div className="small text-muted">
                Production per turn: {productionPerTurn}
              </div>
              <div className="small text-muted">
                Turns remaining: {formatTurns(turnsRemaining)}
              </div>
            </div>
          ) : (
            <div className="text-muted">No active production</div>
          )}
        </div>

        <div>
          <h6>Queue</h6>
          <div className="d-flex align-items-center mb-1">
              <Button
                variant="outline-light"
                size="sm"
                className="me-1"
                style={{lineHeight: 1, padding: '2px 6px'}}
                disabled={selectedQueueIndex === null || selectedQueueIndex <= 0 || !selectedCity || !Array.isArray(selectedCity.buildQueue) || selectedCity.buildQueue.length < 2}
                onClick={() => {
                  if (selectedQueueIndex === null || selectedQueueIndex <= 0) return;
                  const queue = [...selectedCity.buildQueue];
                  [queue[selectedQueueIndex - 1], queue[selectedQueueIndex]] = [queue[selectedQueueIndex], queue[selectedQueueIndex - 1]];
                  // Update queue in engine and UI
                  if (gameEngine && typeof gameEngine.setCityQueue === 'function') {
                    gameEngine.setCityQueue(selectedCity.id, queue);
                  } else {
                    selectedCity.buildQueue = queue;
                  }
                  actions.updateCities(cities.map(c => c.id === selectedCity.id ? {...c, buildQueue: queue} : c));
                  setSelectedQueueIndex(selectedQueueIndex - 1);
                }}
              >
                ▲
              </Button>
              <Button
                variant="outline-light"
                size="sm"
                style={{lineHeight: 1, padding: '2px 6px'}}
                disabled={selectedQueueIndex === null || selectedQueueIndex === selectedCity.buildQueue.length - 1 || !selectedCity || !Array.isArray(selectedCity.buildQueue) || selectedCity.buildQueue.length < 2}
                onClick={() => {
                  if (selectedQueueIndex === null || selectedQueueIndex === selectedCity.buildQueue.length - 1) return;
                  const queue = [...selectedCity.buildQueue];
                  [queue[selectedQueueIndex + 1], queue[selectedQueueIndex]] = [queue[selectedQueueIndex], queue[selectedQueueIndex + 1]];
                  // Update queue in engine and UI
                  if (gameEngine && typeof gameEngine.setCityQueue === 'function') {
                    gameEngine.setCityQueue(selectedCity.id, queue);
                  } else {
                    selectedCity.buildQueue = queue;
                  }
                  actions.updateCities(cities.map(c => c.id === selectedCity.id ? {...c, buildQueue: queue} : c));
                  setSelectedQueueIndex(selectedQueueIndex + 1);
                }}
              >
                ▼
              </Button>
            </div>
          <div className="queue-box bg-dark border border-secondary rounded p-2" style={{maxHeight: '220px', overflowY: 'auto'}}>
            {hasQueueItems ? (
              selectedCity.buildQueue.map((q: any, i: number) => {
                const queueItemName = getProductionName(q);
                const queueItemCost = getProductionCost(q);
                const queueTurns = productionPerTurn > 0 && queueItemCost > 0
                  ? Math.max(0, Math.ceil(queueItemCost / productionPerTurn))
                  : null;

                return (
                  <div
                    key={i}
                    className={`queue-item p-2 mb-1 rounded ${selectedQueueIndex === i ? 'bg-secondary text-white' : 'text-white'}`}
                    style={{cursor: 'pointer'}}
                    onClick={() => setSelectedQueueIndex(i)}
                  >
                    <div className="d-flex justify-content-between">
                      <div><strong>{queueItemName}</strong></div>
                      <div className="text-white">{queueItemCost > 0 ? `${queueItemCost} shields` : '—'}</div>
                    </div>
                    <div className="small text-white">#{i + 1} in queue</div>
                    <div className="small text-muted">Turns: {formatTurns(queueTurns)}</div>
                  </div>
                );
              })
            ) : (
              <div className="text-white">Queue is empty</div>
            )}
          </div>
          <div className="mt-2 d-flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!selectedProductionKey || !gameEngine || !selectedCity}
                onClick={() => {
                  if (!selectedProductionKey) return;
                  // Add to queue (inline)
                  const unitDef = UNIT_PROPS[selectedProductionKey];
                  const item = { type: 'unit', itemType: selectedProductionKey, name: unitDef.name, cost: unitDef.cost };
                  if (gameEngine) {
                    const hasMethod = typeof (gameEngine as any).setCityProduction === 'function';
                    console.log('[GameModals] Inline Add to Queue: engine method?', { hasMethod });
                    let ok: any = null;
                    try {
                      if (hasMethod) ok = (gameEngine as any).setCityProduction(selectedCity.id, item, true);
                    } catch (e) {
                      console.error('[GameModals] Inline Add to Queue: setCityProduction exception', e);
                    }
                    console.log('[GameModals] Inline Add to Queue: setCityProduction returned', ok);
                    if ((gameEngine as any).getAllCities) {
                      const allCities = (gameEngine as any).getAllCities();
                      console.log('[GameModals] Inline Add to Queue: engine.getAllCities()', allCities.map((c: any) => ({ id: c.id, buildQueue: c.buildQueue })));
                      actions.updateCities(allCities);
                      const updated = allCities.find((c: any) => c.id === selectedCity.id);
                      console.log('[GameModals] Inline Add to Queue: updated selectedCity', { id: updated?.id, buildQueue: updated?.buildQueue });
                    }
                    if (ok) {
                      actions.addNotification({ type: 'info', message: `Added to queue: ${item.name}` });
                    } else {
                      actions.addNotification({ type: 'warning', message: `Failed to add to queue: ${item.name}` });
                    }
                  }
                }}
              >
                Add to Queue
              </Button>

              <Button
                size="sm"
                variant="danger"
                disabled={selectedQueueIndex === null || selectedQueueIndex === undefined || !Array.isArray(selectedCity?.buildQueue) || selectedCity.buildQueue.length === 0 || !gameEngine}
                onClick={async () => {
                  if (selectedQueueIndex === null || selectedQueueIndex === undefined) return;
                  if (!gameEngine || typeof gameEngine.removeCityQueueItem !== 'function') return;
                  const res = (gameEngine as any).removeCityQueueItem(selectedCity.id, selectedQueueIndex);
                  if (res && res.success) {
                    actions.addNotification({ type: 'success', message: `Removed from queue: ${res.removed?.name || 'item'}` });
                    // Refresh cities data from engine if available
                    if (gameEngine.getAllCities) actions.updateCities(gameEngine.getAllCities());
                    setSelectedQueueIndex(null);
                  } else {
                    actions.addNotification({ type: 'warning', message: `Failed to remove: ${res?.reason || 'unknown'}` });
                  }
                }}
              >
                Remove
              </Button>
            </div>
        </div>
      </div>
    );
  };

  // City Purchase Modal (Buy Now)
  const handleBuyNow = (unitKey: string) => {
    if (!selectedCity) return;
    const unitDef = UNIT_PROPS[unitKey];
    if (!unitDef) return;

    const item = { type: 'unit', itemType: unitKey, name: unitDef.name, cost: unitDef.cost };
    if (gameEngine && typeof gameEngine.purchaseCityProduction === 'function') {
      const res = gameEngine.purchaseCityProduction(selectedCity.id, item);
      if (res && res.success) {
        actions.addNotification({ type: 'success', message: `Purchased ${item.name}` });
        actions.updateCities(gameEngine.getAllCities());
        actions.updateUnits(gameEngine.getAllUnits());
      } else {
        actions.addNotification({ type: 'warning', message: `Purchase failed: ${res?.reason || 'unknown'}` });
      }
    }

    actions.hideDialog();
  };

  const renderCityPurchase = () => (
    <Modal
      show={uiState.activeDialog === 'city-purchase'}
      onHide={handleCloseDialog}
      centered
      size="lg"
      dialogClassName="city-purchase-modal"
    >
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-cart"></i> Purchase in {selectedCity?.name || 'City'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark text-white">
        <div className="mb-2">Your gold: {currentPlayer?.resources?.gold ?? 0}</div>
        {renderPurchaseContent()}
      </Modal.Body>
    </Modal>
  );

  // Reusable purchase list content (used in purchase modal and city details tab)
  const renderPurchaseContent = () => (
    <div>
      <div className="mb-2">Your gold: {currentPlayer?.resources?.gold ?? 0}</div>
      <div className="row">
        {Object.keys(UNIT_PROPS).filter(k => {
          const u = UNIT_PROPS[k];
          const req = (u as any).requires || null;
          if (req && currentPlayer && Array.isArray(currentPlayer.technologies)) {
            if (!currentPlayer.technologies.includes(req)) return false;
          }
          return true;
        }).map(k => {
          const u = UNIT_PROPS[k];
          return (
            <div key={k} className="col-12 col-sm-6 col-md-4 mb-2">
              <Card className="bg-secondary text-white h-100">
                <Card.Body className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="h6 mb-0">{u.name} <small className="text-muted">({u.type})</small></div>
                    <small className="text-muted">Cost: {u.cost} gold</small>
                  </div>
                  <div>
                    <Button size="sm" variant="success" onClick={() => handleBuyNow(k)} disabled={(currentPlayer?.resources?.gold || 0) < u.cost}>
                      Buy Now
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {renderGameMenu()}
      {renderTechTree()}
      {renderDiplomacy()}
      {renderDiplomacyReport()}
      {renderHelp()}
      <CityModal show={uiState.activeDialog === 'city-details'} onHide={handleCloseDialog} selectedCity={selectedCity} gameEngine={gameEngine} actions={actions} currentPlayer={currentPlayer} isPlayerCity={isPlayerCity} />
      <HexDetailModal show={uiState.activeDialog === 'hex-details'} onHide={handleCloseDialog} selectedHex={selectedHex} map={map} units={units} cities={cities} />
      {renderCityProduction()}
      {renderCityPurchase()}
    </>
  );
};

export default GameModals;