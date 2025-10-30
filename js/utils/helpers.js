// Helper Functions and Utilities

// Math Utilities
const MathUtils = {
    // Clamp a value between min and max
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    
    // Linear interpolation
    lerp: (start, end, factor) => start + (end - start) * factor,
    
    // Distance between two points
    distance: (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
    
    // Random integer between min and max (inclusive)
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    
    // Random element from array
    randomChoice: (array) => array[Math.floor(Math.random() * array.length)]
};

// Hex Grid Utilities
const HexUtils = {
    // Convert offset coordinates to cube coordinates
    offsetToCube: (col, row) => {
        const x = col - (row - (row & 1)) / 2;
        const z = row;
        const y = -x - z;
        return { x, y, z };
    },
    
    // Convert cube coordinates to offset coordinates
    cubeToOffset: (x, y, z) => {
        const col = x + (z - (z & 1)) / 2;
        const row = z;
        return { col, row };
    },
    
    // Get hex neighbors in cube coordinates
    getNeighbors: (x, y, z) => {
        const directions = [
            { x: 1, y: -1, z: 0 }, { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 },
            { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 }, { x: 0, y: -1, z: 1 }
        ];
        return directions.map(dir => ({
            x: x + dir.x,
            y: y + dir.y,
            z: z + dir.z
        }));
    },
    
    // Distance between two hex coordinates
    hexDistance: (x1, y1, z1, x2, y2, z2) => {
        return (Math.abs(x1 - x2) + Math.abs(y1 - y2) + Math.abs(z1 - z2)) / 2;
    },
    
    // Convert hex coordinates to pixel position
    hexToPixel: (col, row) => {
        const x = CONSTANTS.HEX_SIZE * Math.sqrt(3) * (col + 0.5 * (row & 1));
        const y = CONSTANTS.HEX_SIZE * 1.5 * row;
        return { x, y };
    },
    
    // Convert pixel position to hex coordinates
    pixelToHex: (x, y) => {
        const q = (x * Math.sqrt(3) / 3 - y / 3) / CONSTANTS.HEX_SIZE;
        const r = y * 2 / 3 / CONSTANTS.HEX_SIZE;
        return HexUtils.roundHex(q, r);
    },
    
    // Round fractional hex coordinates to nearest hex
    roundHex: (q, r) => {
        const s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);
        
        const qDiff = Math.abs(rq - q);
        const rDiff = Math.abs(rr - r);
        const sDiff = Math.abs(rs - s);
        
        if (qDiff > rDiff && qDiff > sDiff) {
            rq = -rr - rs;
        } else if (rDiff > sDiff) {
            rr = -rq - rs;
        }
        
        return { col: rq, row: rr };
    }
};

// Array Utilities
const ArrayUtils = {
    // Create 2D array with default value
    create2D: (width, height, defaultValue = null) => {
        return Array(height).fill(null).map(() => Array(width).fill(defaultValue));
    },
    
    // Shuffle array in place
    shuffle: (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },
    
    // Remove element from array
    remove: (array, element) => {
        const index = array.indexOf(element);
        if (index > -1) {
            array.splice(index, 1);
        }
        return array;
    }
};

// Color Utilities
const ColorUtils = {
    // Convert RGB to hex string
    rgbToHex: (r, g, b) => {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    },
    
    // Parse hex color to RGB
    hexToRgb: (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },
    
    // Darken a color by a factor
    darken: (color, factor) => {
        const rgb = ColorUtils.hexToRgb(color);
        if (!rgb) return color;
        
        const darkenedR = Math.floor(rgb.r * (1 - factor));
        const darkenedG = Math.floor(rgb.g * (1 - factor));
        const darkenedB = Math.floor(rgb.b * (1 - factor));
        
        return ColorUtils.rgbToHex(darkenedR, darkenedG, darkenedB);
    },
    
    // Lighten a color by a factor
    lighten: (color, factor) => {
        const rgb = ColorUtils.hexToRgb(color);
        if (!rgb) return color;
        
        const lightenedR = Math.min(255, Math.floor(rgb.r + (255 - rgb.r) * factor));
        const lightenedG = Math.min(255, Math.floor(rgb.g + (255 - rgb.g) * factor));
        const lightenedB = Math.min(255, Math.floor(rgb.b + (255 - rgb.b) * factor));
        
        return ColorUtils.rgbToHex(lightenedR, lightenedG, lightenedB);
    }
};

// DOM Utilities
const DomUtils = {
    // Get element by ID with error checking
    getElementById: (id) => {
        const element = document.getElementById(id);
        if (!element) {
            console.warn(`Element with ID '${id}' not found`);
        }
        return element;
    },
    
    // Create element with attributes
    createElement: (tag, attributes = {}, textContent = '') => {
        const element = document.createElement(tag);
        Object.keys(attributes).forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
        if (textContent) {
            element.textContent = textContent;
        }
        return element;
    },
    
    // Add class with animation
    addClassWithAnimation: (element, className, duration = 300) => {
        element.classList.add(className);
        setTimeout(() => {
            element.classList.add('fade-in');
        }, 10);
    },
    
    // Remove class with animation
    removeClassWithAnimation: (element, className, duration = 300) => {
        element.classList.add('fade-out');
        setTimeout(() => {
            element.classList.remove(className, 'fade-out');
        }, duration);
    }
};

// Game State Utilities
const GameUtils = {
    // Generate unique ID
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
    
    // Deep clone object
    deepClone: (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => GameUtils.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            Object.keys(obj).forEach(key => {
                clonedObj[key] = GameUtils.deepClone(obj[key]);
            });
            return clonedObj;
        }
    },
    
    // Format numbers with separators
    formatNumber: (num) => {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    // Convert game year to display format
    formatYear: (year) => {
        if (year < 0) {
            return `${Math.abs(year)} BC`;
        } else if (year === 0) {
            return '1 BC';
        } else {
            return `${year} AD`;
        }
    },
    
    // Calculate turns between years
    yearToTurn: (year) => {
        return Math.floor((year - CONSTANTS.STARTING_YEAR) / CONSTANTS.TURNS_PER_YEAR) + 1;
    },
    
    // Calculate year from turn number
    turnToYear: (turn) => {
        return CONSTANTS.STARTING_YEAR + (turn - 1) * CONSTANTS.TURNS_PER_YEAR;
    }
};

// Event System
class EventEmitter {
    constructor() {
        this.events = {};
    }
    
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }
    
    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
    
    emit(event, ...args) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => {
            try {
                callback(...args);
            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
            }
        });
    }
    
    once(event, callback) {
        const onceCallback = (...args) => {
            callback(...args);
            this.off(event, onceCallback);
        };
        this.on(event, onceCallback);
    }
}

// Performance monitoring
const Performance = {
    startTime: 0,
    
    start: (label) => {
        Performance.startTime = performance.now();
        console.time(label);
    },
    
    end: (label) => {
        const endTime = performance.now();
        const duration = endTime - Performance.startTime;
        console.timeEnd(label);
        return duration;
    },
    
    measure: (fn, label = 'Operation') => {
        Performance.start(label);
        const result = fn();
        Performance.end(label);
        return result;
    }
};