/**
 * Civilization I Game Data
 * Historical civilizations, leaders, technologies, wonders, and units
 */

export interface Civilization {
  name: string;
  leader: string;
  color: string;
  cityNames: string[];
  icon: string;
}

export interface Technology {
  id: string;
  name: string;
  era: string;
  cost: number;
  prerequisites: string[];
  enables: string[];
  description: string;
}

export interface DifficultyLevel {
  name: string;
  aiBonus: number;
  barbarianFrequency: number;
}

// Civilizations from original Civ1
export const CIVILIZATIONS: Civilization[] = [
  {
    name: 'Americans',
    leader: 'Abraham Lincoln',
    color: '#0000FF', // Blue - stars and stripes
    cityNames: ['Washington', 'New York', 'Boston', 'Philadelphia', 'Atlanta', 'Chicago', 'Seattle', 'San Francisco', 'Los Angeles', 'Detroit', 'Denver', 'Miami', 'Houston', 'Dallas', 'Phoenix', 'San Diego', 'Minneapolis', 'Cleveland', 'St. Louis', 'Baltimore'],
    icon: '🦅'
  },
  {
    name: 'Aztecs',
    leader: 'Montezuma',
    color: '#009220ff', // Teal - Jungle gree
    cityNames: ['Tenochtitlan', 'Texcoco', 'Tlatelolco', 'Teotihuacan', 'Tlaxcala', 'Cholula', 'Xochicalco', 'Tula', 'Cempoala', 'Huexotla', 'Cuauhnahuac', 'Cholula', 'Mixcoac', 'Calixtlahuaca', 'Malinalco', 'Oaxtepec', 'Tepeapulco', 'Zacatepec', 'Tepozotlan'],
    icon: '🐆'
  },
  {
    name: 'Babylonians',
    leader: 'Hammurabi',
    color: '#ff954fff', // Lime - ancient Mesopotamian gold/yellow-green
    cityNames: ['Babylon', 'Ur', 'Nineveh', 'Ashur', 'Eridu', 'Uruk', 'Lagash', 'Nippur', 'Isin', 'Larsa', 'Sippar', 'Eshnunna', 'Kish', 'Mari', 'Harran', 'Dur-Kurigalzu', 'Shuruppak', 'Adab', 'Girsu', 'Ebla'],
    icon: '🏺'
  },
  {
    name: 'Chinese',
    leader: 'Mao Tse Tung',
    color: '#fbff00ff', // Green - traditional Chinese color
    cityNames: ['Beijing', 'Shanghai', 'Guangzhou', 'Nanjing', 'Xian', 'Chengdu', 'Hangzhou', 'Tianjin', 'Wuhan', 'Shenyang', 'Chongqing', 'Suzhou', 'Qingdao', 'Dalian', 'Harbin', 'Jinan', 'Fuzhou', 'Zhengzhou', 'Changsha', 'Kunming'],
    icon: '🐉'
  },
  {
    name: 'Egyptians',
    leader: 'Ramesses II',
    color: '#ffbb00ff', // Yellow - Egyptian gold/sand
    cityNames: ['Thebes', 'Memphis', 'Heliopolis', 'Alexandria', 'Giza', 'Luxor', 'Aswan', 'Karnak', 'Abydos', 'Edfu', 'Dendera', 'Kom Ombo', 'Philae', 'Esna', 'Amarna', 'Saqqara', 'Tanis', 'Bubastis', 'Hermopolis', 'Avaris'],
    icon: '🐪'
  },
  {
    name: 'English',
    leader: 'Elizabeth I',
    color: '#ff0000ff', // Red was on two of their historical flags
    cityNames: ['London', 'York', 'Nottingham', 'Oxford', 'Cambridge', 'Canterbury', 'Coventry', 'Warwick', 'Newcastle', 'Bristol', 'Liverpool', 'Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Southampton', 'Plymouth', 'Exeter', 'Norwich', 'Gloucester'],
    icon: '🇬🇧'
  },
  {
    name: 'Germans',
    leader: 'Frederick the Great',
    color: '#949494',
    cityNames: ['Berlin', 'Leipzig', 'Hamburg', 'Bremen', 'Frankfurt', 'Bonn', 'Nuremberg', 'Cologne', 'Munich', 'Darmstadt', 'Mannheim','Heidelberg', 'Stuttgart', 'Dresden', 'Kiel', 'Dusseldorf', 'Wiesbaden', 'Aachen', 'Freiburg', 'Regensburg', 'Wurzburg', 'Ingolstadt', 'Augsburg', 'Bielefeld', 'Bochum', 'Kassel', 'Magdeburg', 'Mainz', 'Oldenburg', 'Potsdam', 'Rostock'],
    icon: '✠'
  },
  {
    name: 'French',
    leader: 'Napoleon Bonaparte',
    color: '#fffffff6', // capitulation white
    cityNames: ['Paris', 'Orleans', 'Lyon', 'Aix en Provence ', 'Courbevoie', 'Tours', 'Marseille', 'Chartres', 'Avignon', 'Rouen', 'Grenoble', 'Reims', 'Dijon', 'Nantes', 'Bordeaux', 'Toulouse', 'Nice', 'Strasbourg', 'Montpellier', 'Lille', 'Brest', 'Caen', 'Clermont-Ferrand', 'Limoges', 'Saint-Etienne', 'Le Havre', 'Angers', 'Metz', 'Besancon', 'Perpignan'],
    icon: '🇫🇷🥖'
  },
  {
    name: 'Greeks',
    leader: 'Alexander the Great',
    color: '#1269c5', 
    cityNames: ['Athens', 'Sparta', 'Corinth', 'Delphi', 'Thebes', 'Ephesus', 'Rhodes', 'Byzantium', 'Pergamon', 'Olympia', 'Knossos', 'Mycenae', 'Delos', 'Syracuse', 'Miletus', 'Halicarnassus', 'Samos', 'Chios', 'Lesbos', 'Naxos', 'Eretria'],
    icon: '🏛️'
  },
  {
    name: 'Indians',
    leader: 'Mahatma Gandhi',
    color: '#ff681a',
    cityNames: ['Delhi', 'Bombay', 'Madras', 'Bangalore', 'Calcutta', 'Lahore', 'Karachi', 'Hyderabad', 'Udaipur', 'Jaipur', 'Lucknow', 'Varanasi', 'Agra', 'Pune', 'Ahmedabad', 'Chennai', 'Kolkata', 'Bhopal', 'Patna', 'Indore'],
    icon: '🇮🇳'
  },
  {
    name: 'Huns',
    leader: 'Dschingis Khan',
    color: '#00ADC3',
    cityNames: ['Almaty', 'Shymkent', 'Karaganda', 'Taraz', 'Aktobe', 'Pavlodar', 'Oskemen', 'Semey', 'Oral', 'Astana', 'Kyzylorda', 'Atyrau', 'Kostanay', 'Taldykorgan', 'Zhezkazgan', 'Kokshetau', 'Petropavl', 'Temirtau', 'Turkistan', 'Ekibastuz'],
    icon: '🐎🏹'
  },
  {
    name: 'Romans',
    leader: 'Julius Caesar',
    color: '#080308ff',
    cityNames: ['Rome', 'Capua', 'Veii', 'Pompeii', 'Antium', 'Cumae', 'Neapolis', 'Ravenna', 'Verona', 'Syracuse', 'Tarentum', 'Brundisium', 'Carthage', 'Massalia', 'Alexandria', 'Byzantium', 'Ephesus', 'Athens', 'Sparta', 'Corinth', 'Delphi', 'Thebes', 'Pergamon', 'Rhodes'],
    icon: '⚔️'
  },
  {
    name: 'Russians',
    leader: 'Joseph Stalin',
    color: '#D00000',
    cityNames: ['Kiev','Novgorod','Chernigov','Smolensk','Moscow', 'Leningrad', 'Minsk', 'Odessa', 'Sevastopol', 'Tula', 'Stalingrad', 'Kazan', 'Rostov', 'Vladivostok', 'Irkutsk', 'Yakutsk', 'Murmansk', 'Khabarovsk', 'Kaliningrad', 'Perm', 'Yekaterinburg', 'Nizhny Novgorod', 'Samara', 'Volgograd', 'Krasnoyarsk', 'Novosibirsk', 'Omsk', 'Chelyabinsk', 'Ufa', 'Krasnodar', 'Voronezh', 'Saratov'],
    icon: '☭'
  },
  {
    name: 'Zulus',
    leader: 'Shaka',
    color: '#8B4513',
    cityNames: ['Zimbabwe', 'Ulundi', 'Bapedi', 'Hlobane', 'Isandhlwana', 'Intombe', 'Mpondo', 'Swazi', 'Ndebele', 'Venda', 'Tswana', 'Sotho', 'Tsonga', 'Shangaan', 'Xhosa', 'Zulu', 'Swazi', 'Ndebele', 'Venda', 'Tswana', 'Sotho', 'Tsonga', 'Shangaan', 'Xhosa'],
    icon: '🛡️'
  }
];

// Technology Tree (simplified from Civ1)
export const TECHNOLOGIES: Record<string, Technology> = {
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

// (Wonders removed - unused)

// Re-export unit data from UnitConstants to avoid duplication
// UNIT_DATA_MAP provides the GameData-compatible format expected by existing code
export { UNIT_DATA_MAP as UNIT_TYPES } from './UnitConstants';


// (Governments removed - unused)

// (Victory Conditions removed - unused)

// Game difficulty levels
export const DIFFICULTY_LEVELS: Record<string, DifficultyLevel> = {
  CHIEFTAIN: { name: 'Chieftain', aiBonus: 0, barbarianFrequency: 0.3 },
  WARLORD: { name: 'Warlord', aiBonus: 0.5, barbarianFrequency: 0.5 },
  PRINCE: { name: 'Prince', aiBonus: 1, barbarianFrequency: 0.7 },
  KING: { name: 'King', aiBonus: 1.5, barbarianFrequency: 0.9 },
  EMPEROR: { name: 'Emperor', aiBonus: 2, barbarianFrequency: 1.0 }
};
