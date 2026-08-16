import { describe, expect, it, vi, afterEach } from 'vitest';
import GameEngine from '@/game/engine/GameEngine';

/**
 * Diplomacy module (Civ I–style) regression tests for the interactive-offer
 * and alliance-collapse work:
 *
 *  1. AI-initiated proposals to the HUMAN are no longer auto-resolved — they
 *     are surfaced as AI_DIPLOMACY_OFFER events and the player decides via the
 *     negotiation screen (acceptOffer executes; rejecting leaves state alone).
 *  2. Alliances can collapse: a hostile attitude can push the AI to break the
 *     pact and declare war (ALLIANCE_BROKEN + WAR_DECLARED, with the reputation
 *     penalty applied by declareWar).
 *
 * civ0 is the human (CLOSEUP_1V1), civ1 is the AI.
 */
describe('Diplomacy: interactive AI offers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acceptOffer forms an alliance (player accepts propose_alliance)', async () => {
    const engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 50,
    });
    const dm = engine.diplomacyManager;

    const res = dm.acceptOffer({ fromCivId: 1, toCivId: 0, action: 'propose_alliance' });
    expect(res.accepted).toBe(true);
    expect(dm.getStatus(0, 1)).toBe('alliance');
  });

  it('acceptOffer transfers gold when the player pays an AI tribute demand', async () => {
    const engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 50,
    });
    const dm = engine.diplomacyManager;
    const goldBefore = engine.civilizations[0].resources.gold;
    const aiGoldBefore = engine.civilizations[1].resources.gold;

    const res = dm.acceptOffer({ fromCivId: 1, toCivId: 0, action: 'demand_tribute', goldAmount: 30 });
    expect(res.accepted).toBe(true);
    expect(res.goldTransferred).toBe(30);
    expect(engine.civilizations[0].resources.gold).toBe(goldBefore - 30);
    expect(engine.civilizations[1].resources.gold).toBe(aiGoldBefore + 30);
  });

  it('acceptOffer makes peace when the player accepts during a war', async () => {
    const engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 50,
    });
    const dm = engine.diplomacyManager;
    dm.declareWar(1, 0);
    expect(dm.getStatus(0, 1)).toBe('war');

    const res = dm.acceptOffer({ fromCivId: 1, toCivId: 0, action: 'propose_peace' });
    expect(res.accepted).toBe(true);
    expect(dm.getStatus(0, 1)).toBe('peace');
  });

  it('AI proposal to the human emits AI_DIPLOMACY_OFFER instead of auto-resolving', async () => {
    const engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 50,
    });
    const dm = engine.diplomacyManager;
    const events: Array<{ type: string; data: any }> = [];
    (engine as any).onStateChange = (type: string, data: any) => events.push({ type, data });

    // Long war so the AI sues for peace (turnsSince = 20 - 1 = 19 > 15).
    dm.declareWar(1, 0);
    const rel = dm.getRelation(1, 0);
    if (rel) rel.since = 1;

    vi.spyOn(dm, 'getAttitude').mockReturnValue('neutral');
    vi.spyOn(dm, 'estimateMilitaryStrength').mockImplementation((civId: number) => (civId === 1 ? 100 : 10));
    (engine as any).roundManager.getRoundNumber = () => 20;

    dm.processAIDiplomacy(1);

    const offers = events.filter(e => e.type === 'AI_DIPLOMACY_OFFER');
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].data.fromCivId).toBe(1);
    expect(offers[0].data.action).toBe('propose_peace');
    // The proposal must NOT have been auto-resolved while pending.
    expect(dm.getStatus(0, 1)).toBe('war');
  });
});

describe('Diplomacy: alliances can collapse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AI breaks a hostile alliance and declares war (ALLIANCE_BROKEN)', async () => {
    const engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 50,
    });
    const dm = engine.diplomacyManager;
    const events: Array<{ type: string; data: any }> = [];
    (engine as any).onStateChange = (type: string, data: any) => events.push({ type, data });

    dm.formAlliance(1, 0);
    const rel = dm.getRelation(1, 0);
    if (rel) rel.since = 1;

    vi.spyOn(dm, 'getAttitude').mockReturnValue('hostile');
    vi.spyOn(dm, 'estimateMilitaryStrength').mockReturnValue(50);
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // force the betrayal roll
    (engine as any).roundManager.getRoundNumber = () => 20;

    dm.processAIDiplomacy(1);

    expect(dm.getStatus(0, 1)).toBe('war');
    expect(events.some(e => e.type === 'ALLIANCE_BROKEN')).toBe(true);
    expect(events.some(e => e.type === 'WAR_DECLARED')).toBe(true);
    // Breaking an alliance carries the reputation penalty.
    expect(rel?.reputationModifier ?? 0).toBeLessThan(0);
  });

  it('aggressive AI backstabs a long-standing alliance (turnsSince > 20)', async () => {
    const engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 50,
    });
    const dm = engine.diplomacyManager;
    const events: Array<{ type: string; data: any }> = [];
    (engine as any).onStateChange = (type: string, data: any) => events.push({ type, data });

    dm.formAlliance(1, 0);
    const rel = dm.getRelation(1, 0);
    if (rel) rel.since = 1;

    // Make civ1 an aggressive leader.
    const civ1 = engine.civilizations[1];
    (civ1 as any).personality = { aggression: 8, diplomacy: 4, military: 8 };
    (civ1 as any).productionProfile = 'military_expansion';

    vi.spyOn(dm, 'getAttitude').mockReturnValue('friendly'); // not hostile — backstab path
    vi.spyOn(dm, 'estimateMilitaryStrength').mockReturnValue(50);
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // 1 < 8 → betrayal
    (engine as any).roundManager.getRoundNumber = () => 25; // turnsSince = 24 > 20

    dm.processAIDiplomacy(1);

    expect(dm.getStatus(0, 1)).toBe('war');
    expect(events.some(e => e.type === 'ALLIANCE_BROKEN')).toBe(true);
  });

  it('a friendly long alliance does NOT collapse when the roll misses', async () => {
    const engine = new GameEngine(null);
    (engine as any).sleep = () => Promise.resolve();
    await engine.initialize({
      numberOfCivilizations: 2,
      mapType: 'CLOSEUP_1V1',
      devMode: false,
      startingGold: 50,
    });
    const dm = engine.diplomacyManager;
    const events: Array<{ type: string; data: any }> = [];
    (engine as any).onStateChange = (type: string, data: any) => events.push({ type, data });

    dm.formAlliance(1, 0);
    const rel = dm.getRelation(1, 0);
    if (rel) rel.since = 1;

    const civ1 = engine.civilizations[1];
    (civ1 as any).personality = { aggression: 8, diplomacy: 4, military: 8 };

    vi.spyOn(dm, 'getAttitude').mockReturnValue('friendly');
    vi.spyOn(dm, 'estimateMilitaryStrength').mockReturnValue(50);
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 99 < 8 → false
    (engine as any).roundManager.getRoundNumber = () => 25;

    dm.processAIDiplomacy(1);

    expect(dm.getStatus(0, 1)).toBe('alliance');
    expect(events.some(e => e.type === 'ALLIANCE_BROKEN')).toBe(false);
  });
});
