// Civilization System - Refactored to remove EventEmitter pattern

import { Constants } from '@/utils/Constants';
import { MathUtils } from "@/utils/MathUtils";

// Type definitions
interface Personality {
    aggression: number;
    expansion: number;
    diplomacy: number;
    science: number;
    military: number;
    economy: number;
}

interface Priorities {
    militaryUnits: number;
    settlers: number;
    infrastructure: number;
    wonders: number;
    exploration: number;
}

interface Technology {
    name: string;
    cost: number;
    prerequisites: string[];
    category: string;
    effects: { enables?: string[] };
}

interface CivilizationInfo {
    id: string;
    name: string;
    leaderName: string;
    color: string;
    isHuman: boolean;
    gold: number;
    science: number;
    technologies: string[];
    currentResearch: string | null;
    researchProgress: number;
    cities: number;
    units: number;
    alive: boolean;
    warWith: string[];
}

// Civilization class
export class Civilization {
    public id: string;
    public name: string;
    public leaderName: string;
    public color: string;
    public isHuman: boolean;
    public isAI: boolean;

    // Resources
    public gold: number;
    public science: number;

    // Technologies
    public technologies: Set<string>;
    public currentResearch: string | null;
    public researchProgress: number;

    // Diplomacy
    public relations: Map<string, number>; // civId -> relation level
    public treaties: Map<string, string>; // civId -> treaty type
    public warWith: Set<string>; // Set of civilization IDs at war with

    // Game state
    public alive: boolean;
    public turnActive: boolean;
    public capital: import('../../types/game').City | null; // First city becomes capital

    // AI properties
    public personality: Personality;
    public priorities: Priorities;

    // Game reference
    public gameMap: import('../../types/game').MapState | null;

    // Units and cities (will be managed by game map)
    public units: import('../../types/game').Unit[];
    public cities: import('../../types/game').City[];
    
    // Callback for state changes (replaces EventEmitter)
    public onStateChange: ((eventType: string, data: Record<string, unknown>) => void) | null;

    constructor(id: string, name: string, leaderName: string, color: string, isHuman: boolean = false) {
        this.id = id;
        this.name = name;
        this.leaderName = leaderName;
        this.color = color;
        this.isHuman = isHuman;
        this.isAI = !isHuman;

        // Resources
        this.gold = Constants.INITIAL_GOLD;
        this.science = Constants.INITIAL_SCIENCE;

        // Technologies
        this.technologies = new Set();
        this.currentResearch = null;
        this.researchProgress = 0;

        // Diplomacy
        this.relations = new Map(); // civId -> relation level
        this.treaties = new Map(); // civId -> treaty type
        this.warWith = new Set(); // Set of civilization IDs at war with

        // Game state
        this.alive = true;
        this.turnActive = false;
        this.capital = null; // First city becomes capital

        // AI properties
        this.personality = this.generatePersonality();
        this.priorities = this.generatePriorities();

        // Units and cities (will be managed by game map)
        this.units = [];
        this.cities = [];
        
        // Initialize callback\n        this.onStateChange = null;

        // Initialize starting technologies
        this.initializeStartingTech();
    }

    // Generate AI personality traits
    generatePersonality(): Personality {
        return {
            aggression: MathUtils.randomInt(1, 10),
            expansion: MathUtils.randomInt(1, 10),
            diplomacy: MathUtils.randomInt(1, 10),
            science: MathUtils.randomInt(1, 10),
            military: MathUtils.randomInt(1, 10),
            economy: MathUtils.randomInt(1, 10)
        };
    }

    // Generate AI priorities
    generatePriorities(): Priorities {
        return {
            militaryUnits: MathUtils.randomInt(20, 40),
            settlers: MathUtils.randomInt(10, 30),
            infrastructure: MathUtils.randomInt(20, 50),
            wonders: MathUtils.randomInt(5, 20),
            exploration: MathUtils.randomInt(10, 30)
        };
    }

    // Initialize starting technologies
    initializeStartingTech(): void {
        // All civilizations start with basic technologies
        this.technologies.add('pottery');
        this.technologies.add('ceremonial_burial');

        // Set initial research
        this.currentResearch = 'alphabet';
    }

    // Start civilization's turn
    startTurn(gameMap: import('../../types/game').MapState, turn: number): void {
        this.turnActive = true;

        // Calculate total resources from cities
        this.calculateResources(gameMap);

        // Process research
        this.processResearch();

        // AI decisions are now handled by AIManager via GameEngine
        // Legacy makeAIDecisions() removed in favor of engine-level AI

        if (this.onStateChange) { this.onStateChange('turnStarted', { civilization: this, turn }); }
    }

    // End civilization's turn
    endTurn(): void {
        this.turnActive = false;
        if (this.onStateChange) { this.onStateChange('turnEnded', { civilization: this }); }
    }

    // Calculate resources from all cities
    calculateResources(_gameMap: import('../../types/game').MapState): void {
        let totalGold = 0;
        let totalScience = 0;

        for (const city of this.cities) {
            totalGold += city.gold;
            totalScience += city.science;

            // Subtract building maintenance
            for (const buildingType of city.buildings) {
                const building = Constants.BUILDING_PROPS[buildingType];
                if (building && building.maintenance) {
                    totalGold -= building.maintenance;
                }
            }
        }

        this.gold += Math.max(0, totalGold);
        this.science += Math.max(0, totalScience);
    }

    // Process technology research
    processResearch(): void {
        if (!this.currentResearch) {
            this.selectNextResearch();
        }

        if (this.currentResearch && this.science > 0) {
            this.researchProgress += this.science;

            const techCost = this.getTechnologyCost(this.currentResearch);
            if (this.researchProgress >= techCost) {
                this.completeTechnology(this.currentResearch);
            }
        }
    }

    // Get cost of technology research
    getTechnologyCost(techId: string): number {
        const baseCost = TECHNOLOGY_TREE[techId]?.cost || 40;
        const techCount = this.technologies.size;
        return baseCost + (techCount * 2); // Cost increases with each tech
    }

    // Complete technology research
    completeTechnology(techId: string): void {
        this.technologies.add(techId);
        this.researchProgress = 0;
        this.currentResearch = null;

        // Apply technology effects
        this.applyTechnologyEffects(techId);

        if (this.onStateChange) { this.onStateChange('technologyCompleted', { civilization: this, technology: techId }); }

        // Auto-select next research if AI
        if (!this.isHuman) {
            this.selectNextResearch();
        }
    }

    // Apply effects of completed technology
    applyTechnologyEffects(techId: string): void {
        const tech = TECHNOLOGY_TREE[techId];
        if (!tech || !tech.effects) return;

        // Apply various technology effects
        // This would include enabling new units, buildings, improvements, etc.
    }

    // Select next technology to research
    selectNextResearch(): void {
        const availableTechs = this.getAvailableTechnologies();
        if (availableTechs.length === 0) return;

        if (this.isHuman) {
            // Human player will select manually
            return;
        }

        // AI selection based on personality
        let bestTech: string | null = null;
        let bestScore = -1;

        for (const techId of availableTechs) {
            const score = this.evaluateTechnology(techId);
            if (score > bestScore) {
                bestScore = score;
                bestTech = techId;
            }
        }

        this.currentResearch = bestTech;
    }

    // Get technologies available for research
    getAvailableTechnologies(): string[] {
        const available: string[] = [];

        for (const [techId, tech] of Object.entries(TECHNOLOGY_TREE)) {
            if (this.technologies.has(techId)) continue;

            // Check prerequisites
            let canResearch = true;
            if (tech.prerequisites) {
                for (const prereq of tech.prerequisites) {
                    if (!this.technologies.has(prereq)) {
                        canResearch = false;
                        break;
                    }
                }
            }

            if (canResearch) {
                available.push(techId);
            }
        }

        return available;
    }

    // Evaluate technology for AI selection (legacy - now handled by AIResearch module)
    evaluateTechnology(techId: string): number {
        const tech = TECHNOLOGY_TREE[techId];
        if (!tech) return 0;
        let score = 10;
        if (tech.category === 'military') score += this.personality.military * 2;
        else if (tech.category === 'economy') score += this.personality.economy * 2;
        else if (tech.category === 'science') score += this.personality.science * 2;
        const cost = this.getTechnologyCost(techId);
        score -= Math.floor(cost / 10);
        return score;
    }

    // ─── Legacy AI methods removed ────────────────────────────────────
    // makeAIDecisions, makeProductionDecisions, selectCityProduction,
    // evaluateMilitaryNeed, evaluateExpansionNeed, findGoodExpansionSpots,
    // isGoodSettlementSite, evaluateInfrastructureNeed, getBestMilitaryUnit,
    // makeUnitDecisions, makeUnitDecision, findNearbySettlementSite,
    // findNearbyEnemy, moveUnitTowards, exploreWithUnit, makeDiplomaticDecisions,
    // findWeakNeighbor, evaluateCivilizationStrength, makeExplorationDecisions,
    // findNearbyUnexplored
    //
    // All AI decisions are now handled by:
    //   - AIManager (unit targeting, army coordination)
    //   - AIResearch (technology selection)
    //   - AIBuildingStrategy (building/wonder production)
    //   - AIStrategySelector (strategy profile evaluation)
    //   - AutoProduction (city production management)
    //   - AICoordinator (army groups, retreat logic)
    // ──────────────────────────────────────────────────────────────────

    // Check if civilization is enemy
    isEnemy(otherCiv: Civilization): boolean {
        return this.warWith.has(otherCiv.id);
    }

    // Diplomatic decisions (simplified - declare war / make peace)
    declareWar(otherCiv: Civilization): void {
        this.warWith.add(otherCiv.id);
        otherCiv.warWith.add(this.id);

        if (this.onStateChange) { this.onStateChange('warDeclared', { aggressor: this, target: otherCiv }); }
    }

    // Make peace with another civilization
    makePeace(otherCiv: Civilization): void {
        this.warWith.delete(otherCiv.id);
        otherCiv.warWith.delete(this.id);

        if (this.onStateChange) { this.onStateChange('peaceMade', { civ1: this, civ2: otherCiv }); }
    }

    // Check if civilization is defeated
    checkDefeat(): void {
        if (this.cities.length === 0 && this.units.length === 0) {
            this.alive = false;
            if (this.onStateChange) { this.onStateChange('defeated', { civilization: this }); }
        }
    }

    // Get civilization information for UI
    getInfo(): CivilizationInfo {
        return {
            id: this.id,
            name: this.name,
            leaderName: this.leaderName,
            color: this.color,
            isHuman: this.isHuman,
            gold: this.gold,
            science: this.science,
            technologies: Array.from(this.technologies),
            currentResearch: this.currentResearch,
            researchProgress: this.researchProgress,
            cities: this.cities.length,
            units: this.units.length,
            alive: this.alive,
            warWith: Array.from(this.warWith)
        };
    }
}

// Technology Tree
const TECHNOLOGY_TREE: Record<string, Technology> = {
    // Ancient Era
    pottery: {
        name: 'Pottery',
        cost: 40,
        prerequisites: [],
        category: 'economy',
        effects: { enables: ['granary'] }
    },
    ceremonial_burial: {
        name: 'Ceremonial Burial',
        cost: 40,
        prerequisites: [],
        category: 'culture',
        effects: { enables: ['temple'] }
    },
    alphabet: {
        name: 'Alphabet',
        cost: 60,
        prerequisites: [],
        category: 'science',
        effects: { enables: ['library'] }
    },
    bronze_working: {
        name: 'Bronze Working',
        cost: 80,
        prerequisites: [],
        category: 'military',
        effects: { enables: ['phalanx'] }
    },
    iron_working: {
        name: 'Iron Working',
        cost: 100,
        prerequisites: ['bronze_working'],
        category: 'military',
        effects: { enables: ['legion'] }
    },
    horseback_riding: {
        name: 'Horseback Riding',
        cost: 80,
        prerequisites: [],
        category: 'military',
        effects: { enables: ['cavalry', 'chariot'] }
    },
    wheel: {
        name: 'The Wheel',
        cost: 60,
        prerequisites: [],
        category: 'transport',
        effects: { enables: ['chariot'] }
    },
    masonry: {
        name: 'Masonry',
        cost: 80,
        prerequisites: [],
        category: 'construction',
        effects: { enables: ['walls'] }
    },
    construction: {
        name: 'Construction',
        cost: 120,
        prerequisites: ['masonry'],
        category: 'construction',
        effects: { enables: ['aqueduct'] }
    },
    currency: {
        name: 'Currency',
        cost: 100,
        prerequisites: ['bronze_working'],
        category: 'economy',
        effects: { enables: ['marketplace'] }
    },
    mathematics: {
        name: 'Mathematics',
        cost: 100,
        prerequisites: ['alphabet'],
        category: 'science',
        effects: { enables: ['catapult'] }
    },
    map_making: {
        name: 'Map Making',
        cost: 90,
        prerequisites: ['alphabet'],
        category: 'exploration',
        effects: { enables: ['trireme'] }
    }
};

// Civilization Templates
// CIVILIZATION_TEMPLATES removed (unused)