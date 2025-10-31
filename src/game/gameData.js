/**
 * Civilization I Game Data
 * Historical civilizations, leaders, technologies, wonders, and units
 */

// Civilizations from original Civ1
export const CIVILIZATIONS = [
  {
    name: 'Americans',
    leader: 'Abraham Lincoln',
    color: '#4169E1',
    cityNames: ['Washington', 'New York', 'Boston', 'Philadelphia', 'Atlanta', 'Chicago', 'Seattle', 'San Francisco', 'Los Angeles', 'Detroit']
  },
  {
    name: 'Aztecs',
    leader: 'Montezuma',
    color: '#DC143C',
    cityNames: ['Tenochtitlan', 'Texcoco', 'Tlatelolco', 'Teotihuacan', 'Tlaxcala', 'Cholula', 'Xochicalco', 'Tula']
  },
  {
    name: 'Babylonians',
    leader: 'Hammurabi',
    color: '#FFD700',
    cityNames: ['Babylon', 'Ur', 'Nineveh', 'Ashur', 'Eridu', 'Uruk', 'Lagash', 'Nippur']
  },
  {
    name: 'Chinese',
    leader: 'Mao Tse Tung',
    color: '#FF4500',
    cityNames: ['Beijing', 'Shanghai', 'Guangzhou', 'Nanjing', 'Xian', 'Chengdu', 'Hangzhou', 'Tianjin', 'Wuhan']
  },
  {
    name: 'Egyptians',
    leader: 'Ramesses II',
    color: '#F0E68C',
    cityNames: ['Thebes', 'Memphis', 'Heliopolis', 'Alexandria', 'Giza', 'Luxor', 'Aswan', 'Karnak']
  },
  {
    name: 'English',
    leader: 'Elizabeth I',
    color: '#8B0000',
    cityNames: ['London', 'York', 'Nottingham', 'Oxford', 'Cambridge', 'Canterbury', 'Coventry', 'Warwick', 'Newcastle']
  },
  {
    name: 'French',
    leader: 'Napoleon Bonaparte',
    color: '#0000CD',
    cityNames: ['Paris', 'Orleans', 'Lyon', 'Tours', 'Marseille', 'Chartres', 'Avignon', 'Rouen', 'Grenoble']
  },
  {
    name: 'Germans',
    leader: 'Frederick the Great',
    color: '#696969',
    cityNames: ['Berlin', 'Leipzig', 'Hamburg', 'Bremen', 'Frankfurt', 'Bonn', 'Nuremberg', 'Cologne', 'Munich']
  },
  {
    name: 'Greeks',
    leader: 'Alexander the Great',
    color: '#4682B4',
    cityNames: ['Athens', 'Sparta', 'Corinth', 'Delphi', 'Thebes', 'Ephesus', 'Rhodes', 'Byzantium', 'Pergamon']
  },
  {
    name: 'Indians',
    leader: 'Mahatma Gandhi',
    color: '#FF8C00',
    cityNames: ['Delhi', 'Bombay', 'Madras', 'Bangalore', 'Calcutta', 'Lahore', 'Karachi', 'Hyderabad']
  },
  {
    name: 'Mongols',
    leader: 'Genghis Khan',
    color: '#8B4513',
    cityNames: ['Samarkand', 'Karakorum', 'Bokhara', 'Nishapur', 'Kashgar', 'Tabriz', 'Aleppo', 'Kabul']
  },
  {
    name: 'Romans',
    leader: 'Julius Caesar',
    color: '#DC143C',
    cityNames: ['Rome', 'Capua', 'Veii', 'Pompeii', 'Antium', 'Cumae', 'Neapolis', 'Ravenna', 'Verona']
  },
  {
    name: 'Russians',
    leader: 'Joseph Stalin',
    color: '#B22222',
    cityNames: ['Moscow', 'Leningrad', 'Kiev', 'Minsk', 'Smolensk', 'Odessa', 'Sevastopol', 'Tula', 'Stalingrad']
  },
  {
    name: 'Zulus',
    leader: 'Shaka',
    color: '#2F4F4F',
    cityNames: ['Zimbabwe', 'Ulundi', 'Bapedi', 'Hlobane', 'Isandhlwana', 'Intombe', 'Mpondo', 'Swazi']
  }
];

// Technology Tree (simplified from Civ1)
export const TECHNOLOGIES = {
  // Ancient Era
  POTTERY: {
    id: 'pottery',
    name: 'Pottery',
    era: 'ancient',
    cost: 6,
    prerequisites: [],
    enables: ['granary'],
    description: 'Allows construction of Granaries'
  },
  THE_WHEEL: {
    id: 'the_wheel',
    name: 'The Wheel',
    era: 'ancient',
    cost: 6,
    prerequisites: [],
    enables: ['chariot'],
    description: 'Enables Chariots and road building'
  },
  ALPHABET: {
    id: 'alphabet',
    name: 'Alphabet',
    era: 'ancient',
    cost: 6,
    prerequisites: [],
    enables: ['writing'],
    description: 'Foundation of written language'
  },
  BRONZE_WORKING: {
    id: 'bronze_working',
    name: 'Bronze Working',
    era: 'ancient',
    cost: 8,
    prerequisites: [],
    enables: ['phalanx', 'barracks'],
    description: 'Enables Phalanx and Barracks'
  },
  CEREMONIAL_BURIAL: {
    id: 'ceremonial_burial',
    name: 'Ceremonial Burial',
    era: 'ancient',
    cost: 6,
    prerequisites: [],
    enables: ['temple'],
    description: 'Allows construction of Temples'
  },
  HORSEBACK_RIDING: {
    id: 'horseback_riding',
    name: 'Horseback Riding',
    era: 'ancient',
    cost: 10,
    prerequisites: [],
    enables: ['horsemen'],
    description: 'Enables Horsemen units'
  },
  WRITING: {
    id: 'writing',
    name: 'Writing',
    era: 'ancient',
    cost: 8,
    prerequisites: ['alphabet'],
    enables: ['library'],
    description: 'Allows construction of Libraries'
  },
  CODE_OF_LAWS: {
    id: 'code_of_laws',
    name: 'Code of Laws',
    era: 'ancient',
    cost: 8,
    prerequisites: ['alphabet'],
    enables: ['courthouse'],
    description: 'Allows construction of Courthouses'
  },
  MYSTICISM: {
    id: 'mysticism',
    name: 'Mysticism',
    era: 'ancient',
    cost: 10,
    prerequisites: ['ceremonial_burial'],
    enables: ['oracle'],
    description: 'Enables Oracle wonder'
  },
  MATHEMATICS: {
    id: 'mathematics',
    name: 'Mathematics',
    era: 'ancient',
    cost: 10,
    prerequisites: ['alphabet', 'pottery'],
    enables: ['catapult'],
    description: 'Enables Catapults'
  },
  MAP_MAKING: {
    id: 'map_making',
    name: 'Map Making',
    era: 'ancient',
    cost: 12,
    prerequisites: ['alphabet'],
    enables: ['trireme'],
    description: 'Enables Trireme ships'
  },
  
  // Classical Era
  IRON_WORKING: {
    id: 'iron_working',
    name: 'Iron Working',
    era: 'classical',
    cost: 12,
    prerequisites: ['bronze_working'],
    enables: ['legion', 'iron_mine'],
    description: 'Enables Legion and Iron Mines'
  },
  CURRENCY: {
    id: 'currency',
    name: 'Currency',
    era: 'classical',
    cost: 12,
    prerequisites: ['bronze_working'],
    enables: ['marketplace'],
    description: 'Allows construction of Marketplaces'
  },
  CONSTRUCTION: {
    id: 'construction',
    name: 'Construction',
    era: 'classical',
    cost: 16,
    prerequisites: ['pottery', 'currency'],
    enables: ['colosseum', 'aqueduct'],
    description: 'Enables Colosseum and Aqueduct'
  },
  REPUBLIC: {
    id: 'republic',
    name: 'Republic',
    era: 'classical',
    cost: 16,
    prerequisites: ['code_of_laws', 'literacy'],
    enables: ['republic_government'],
    description: 'Enables Republic government'
  },
  MONARCHY: {
    id: 'monarchy',
    name: 'Monarchy',
    era: 'classical',
    cost: 14,
    prerequisites: ['ceremonial_burial', 'code_of_laws'],
    enables: ['monarchy_government'],
    description: 'Enables Monarchy government'
  },
  
  // Medieval Era
  FEUDALISM: {
    id: 'feudalism',
    name: 'Feudalism',
    era: 'medieval',
    cost: 20,
    prerequisites: ['monarchy'],
    enables: ['pikemen'],
    description: 'Enables Pikemen'
  },
  GUNPOWDER: {
    id: 'gunpowder',
    name: 'Gunpowder',
    era: 'medieval',
    cost: 40,
    prerequisites: ['iron_working', 'invention'],
    enables: ['musketeer'],
    description: 'Enables Musketeers'
  },
  
  // Renaissance Era
  DEMOCRACY: {
    id: 'democracy',
    name: 'Democracy',
    era: 'renaissance',
    cost: 60,
    prerequisites: ['republic', 'industrialization'],
    enables: ['democracy_government'],
    description: 'Enables Democracy government'
  },
  
  // Industrial Era
  RAILROAD: {
    id: 'railroad',
    name: 'Railroad',
    era: 'industrial',
    cost: 50,
    prerequisites: ['steam_engine'],
    enables: ['railroad_improvement'],
    description: 'Enables Railroad construction'
  },
  
  // Modern Era
  ROCKETRY: {
    id: 'rocketry',
    name: 'Rocketry',
    era: 'modern',
    cost: 80,
    prerequisites: ['advanced_flight'],
    enables: ['space_program'],
    description: 'Enables Space Program'
  },
  SPACE_FLIGHT: {
    id: 'space_flight',
    name: 'Space Flight',
    era: 'modern',
    cost: 100,
    prerequisites: ['rocketry', 'computers'],
    enables: ['apollo_program', 'spaceship'],
    description: 'Required for space race victory'
  }
};

// Wonders of the World
export const WONDERS = {
  PYRAMIDS: {
    id: 'pyramids',
    name: 'Pyramids',
    cost: 200,
    requires: 'pottery',
    effect: 'Granary in every city',
    description: 'Acts as a Granary in every city on the same continent'
  },
  HANGING_GARDENS: {
    id: 'hanging_gardens',
    name: 'Hanging Gardens',
    cost: 200,
    requires: 'pottery',
    effect: '+1 happy citizen in every city',
    description: 'Makes 1 content citizen happy in every city'
  },
  COLOSSUS: {
    id: 'colossus',
    name: 'Colossus',
    cost: 200,
    requires: 'bronze_working',
    effect: '+1 trade in every square',
    description: '+1 trade in every square producing trade'
  },
  LIGHTHOUSE: {
    id: 'lighthouse',
    name: 'Lighthouse',
    cost: 200,
    requires: 'map_making',
    effect: 'Trireme movement +1',
    description: 'Triremes can move safely on sea squares'
  },
  GREAT_LIBRARY: {
    id: 'great_library',
    name: 'Great Library',
    cost: 300,
    requires: 'literacy',
    effect: 'Free technologies',
    description: 'Gives you any technology discovered by two other civilizations'
  },
  ORACLE: {
    id: 'oracle',
    name: 'Oracle',
    cost: 300,
    requires: 'mysticism',
    effect: 'Temple in every city',
    description: 'Acts as a Temple in every city'
  },
  GREAT_WALL: {
    id: 'great_wall',
    name: 'Great Wall',
    cost: 300,
    requires: 'pottery',
    effect: 'Defense bonus',
    description: 'Doubles defense of all cities against barbarians'
  },
  COPERNICUS_OBSERVATORY: {
    id: 'copernicus',
    name: "Copernicus' Observatory",
    cost: 300,
    requires: 'astronomy',
    effect: '+50% science',
    description: '+50% science in the city where it is built'
  },
  ISAAC_NEWTONS_COLLEGE: {
    id: 'newtons_college',
    name: "Isaac Newton's College",
    cost: 400,
    requires: 'theory_of_gravity',
    effect: '+50% science globally',
    description: 'Doubles science output in the city'
  },
  APOLLO_PROGRAM: {
    id: 'apollo_program',
    name: 'Apollo Program',
    cost: 600,
    requires: 'space_flight',
    effect: 'Enables spaceship',
    description: 'Required to build spaceship parts for space race victory'
  }
};

// Unit Types
export const UNIT_TYPES = {
  SETTLER: {
    id: 'settler',
    name: 'Settler',
    cost: 40,
    attack: 0,
    defense: 1,
    movement: 1,
    requires: null,
    description: 'Founds new cities and improves terrain'
  },
  WARRIOR: {
    id: 'warrior',
    name: 'Warrior',
    cost: 10,
    attack: 1,
    defense: 1,
    movement: 1,
    requires: null,
    description: 'Basic military unit'
  },
  PHALANX: {
    id: 'phalanx',
    name: 'Phalanx',
    cost: 20,
    attack: 1,
    defense: 2,
    movement: 1,
    requires: 'bronze_working',
    description: 'Defensive infantry unit'
  },
  LEGION: {
    id: 'legion',
    name: 'Legion',
    cost: 40,
    attack: 4,
    defense: 2,
    movement: 1,
    requires: 'iron_working',
    description: 'Strong ancient military unit'
  },
  HORSEMEN: {
    id: 'horsemen',
    name: 'Horsemen',
    cost: 20,
    attack: 2,
    defense: 1,
    movement: 2,
    requires: 'horseback_riding',
    description: 'Fast cavalry unit'
  },
  CHARIOT: {
    id: 'chariot',
    name: 'Chariot',
    cost: 30,
    attack: 3,
    defense: 1,
    movement: 2,
    requires: 'the_wheel',
    description: 'Ancient mobile warfare unit'
  },
  CATAPULT: {
    id: 'catapult',
    name: 'Catapult',
    cost: 40,
    attack: 6,
    defense: 1,
    movement: 1,
    requires: 'mathematics',
    description: 'Siege weapon'
  },
  TRIREME: {
    id: 'trireme',
    name: 'Trireme',
    cost: 40,
    attack: 1,
    defense: 1,
    movement: 3,
    requires: 'map_making',
    description: 'Ancient naval unit'
  },
  PIKEMEN: {
    id: 'pikemen',
    name: 'Pikemen',
    cost: 20,
    attack: 1,
    defense: 2,
    movement: 1,
    requires: 'feudalism',
    description: 'Medieval defensive unit'
  },
  MUSKETEER: {
    id: 'musketeer',
    name: 'Musketeer',
    cost: 30,
    attack: 2,
    defense: 3,
    movement: 1,
    requires: 'gunpowder',
    description: 'Gunpowder infantry'
  }
};

// City Improvements/Buildings
export const BUILDINGS = {
  BARRACKS: {
    id: 'barracks',
    name: 'Barracks',
    cost: 40,
    maintenance: 1,
    requires: 'bronze_working',
    effect: 'Veteran units',
    description: 'New land units become veterans'
  },
  GRANARY: {
    id: 'granary',
    name: 'Granary',
    cost: 60,
    maintenance: 1,
    requires: 'pottery',
    effect: 'Food storage',
    description: 'City growth requires 50% less food'
  },
  TEMPLE: {
    id: 'temple',
    name: 'Temple',
    cost: 40,
    maintenance: 1,
    requires: 'ceremonial_burial',
    effect: '+1 happy',
    description: 'Makes 1 unhappy citizen content'
  },
  MARKETPLACE: {
    id: 'marketplace',
    name: 'Marketplace',
    cost: 80,
    maintenance: 1,
    requires: 'currency',
    effect: '+50% gold',
    description: '+50% gold from trade'
  },
  LIBRARY: {
    id: 'library',
    name: 'Library',
    cost: 80,
    maintenance: 1,
    requires: 'writing',
    effect: '+50% science',
    description: '+50% science production'
  },
  COURTHOUSE: {
    id: 'courthouse',
    name: 'Courthouse',
    cost: 80,
    maintenance: 1,
    requires: 'code_of_laws',
    effect: 'Reduces corruption',
    description: 'Reduces corruption by 50%'
  },
  CITY_WALLS: {
    id: 'city_walls',
    name: 'City Walls',
    cost: 80,
    maintenance: 2,
    requires: 'pottery',
    effect: 'Defense bonus',
    description: 'Triples defense of units in city'
  },
  AQUEDUCT: {
    id: 'aqueduct',
    name: 'Aqueduct',
    cost: 120,
    maintenance: 2,
    requires: 'construction',
    effect: 'Growth beyond 10',
    description: 'Allows city to grow beyond size 10'
  },
  COLOSSEUM: {
    id: 'colosseum',
    name: 'Colosseum',
    cost: 100,
    maintenance: 2,
    requires: 'construction',
    effect: '+3 happy',
    description: 'Makes 3 unhappy citizens content'
  },
  FACTORY: {
    id: 'factory',
    name: 'Factory',
    cost: 200,
    maintenance: 4,
    requires: 'industrialization',
    effect: '+50% production',
    description: '+50% production in city'
  }
};

// Government Types
export const GOVERNMENTS = {
  DESPOTISM: {
    id: 'despotism',
    name: 'Despotism',
    requires: null,
    corruption: 'high',
    unitSupport: 'free',
    description: 'Starting government. High corruption, free unit support'
  },
  MONARCHY: {
    id: 'monarchy',
    name: 'Monarchy',
    requires: 'monarchy',
    corruption: 'medium',
    unitSupport: 'low',
    description: 'Medium corruption, low unit costs'
  },
  REPUBLIC: {
    id: 'republic',
    name: 'Republic',
    requires: 'republic',
    corruption: 'low',
    unitSupport: 'medium',
    description: 'Low corruption, medium unit costs, trade bonus'
  },
  DEMOCRACY: {
    id: 'democracy',
    name: 'Democracy',
    requires: 'democracy',
    corruption: 'minimal',
    unitSupport: 'high',
    description: 'Minimal corruption, high unit costs, maximum trade'
  },
  COMMUNISM: {
    id: 'communism',
    name: 'Communism',
    requires: 'communism',
    corruption: 'low',
    unitSupport: 'medium',
    description: 'Low corruption, no senate, spies effective'
  }
};

// Victory Conditions
export const VICTORY_CONDITIONS = {
  CONQUEST: {
    id: 'conquest',
    name: 'Conquest Victory',
    description: 'Eliminate all other civilizations'
  },
  SPACE_RACE: {
    id: 'space_race',
    name: 'Space Race Victory',
    description: 'Launch spaceship and reach Alpha Centauri first',
    requires: ['apollo_program', 'spaceship_parts']
  },
  SCORE: {
    id: 'score',
    name: 'Score Victory',
    description: 'Highest civilization score at 2100 AD'
  }
};

// Game difficulty levels
export const DIFFICULTY_LEVELS = {
  CHIEFTAIN: { name: 'Chieftain', aiBonus: 0, barbarianFrequency: 0.3 },
  WARLORD: { name: 'Warlord', aiBonus: 0.5, barbarianFrequency: 0.5 },
  PRINCE: { name: 'Prince', aiBonus: 1, barbarianFrequency: 0.7 },
  KING: { name: 'King', aiBonus: 1.5, barbarianFrequency: 0.9 },
  EMPEROR: { name: 'Emperor', aiBonus: 2, barbarianFrequency: 1.0 }
};
