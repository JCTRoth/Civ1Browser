// Hexagonal Grid System
class HexGrid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.hexSize = CONSTANTS.HEX_SIZE;
        this.hexWidth = this.hexSize * Math.sqrt(3);
        this.hexHeight = this.hexSize * 2;
        this.vertDistance = this.hexHeight * 0.75;
    }
    
    // Convert hex coordinates to screen position
    hexToScreen(col, row) {
        const x = this.hexWidth * (col + 0.5 * (row & 1));
        const y = this.vertDistance * row;
        return { x, y };
    }
    
    // Convert screen position to hex coordinates
    screenToHex(screenX, screenY) {
        // Adjust for hex grid offset
        const x = screenX / this.hexWidth;
        const y = screenY / this.vertDistance;
        
        // Convert to cube coordinates
        const q = x - 0.5 * (y & 1);
        const r = y;
        const s = -q - r;
        
        // Round to nearest integer coordinates
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
        } else {
            rs = -rq - rr;
        }
        
        // Convert back to offset coordinates
        const col = Math.floor(rq + (rr - (rr & 1)) / 2);
        const row = Math.floor(rr);
        
        return { col, row };
    }
    
    // Get hex vertices for drawing
    getHexVertices(col, row) {
        const center = this.hexToScreen(col, row);
        const vertices = [];
        
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const x = center.x + this.hexSize * Math.cos(angle);
            const y = center.y + this.hexSize * Math.sin(angle);
            vertices.push({ x, y });
        }
        
        return vertices;
    }
    
    // Check if coordinates are within grid bounds
    isValidHex(col, row) {
        return col >= 0 && col < this.width && row >= 0 && row < this.height;
    }
    
    // Get neighboring hex coordinates
    getNeighbors(col, row) {
        const neighbors = [];
        const directions = this.getNeighborDirections(row);
        
        for (const dir of directions) {
            const neighborCol = col + dir.col;
            const neighborRow = row + dir.row;
            
            if (this.isValidHex(neighborCol, neighborRow)) {
                neighbors.push({ col: neighborCol, row: neighborRow });
            }
        }
        
        return neighbors;
    }
    
    // Get direction vectors for neighbors (depends on row parity)
    getNeighborDirections(row) {
        const isEven = (row & 1) === 0;
        
        if (isEven) {
            return [
                { col: -1, row: -1 }, { col: 0, row: -1 },
                { col: -1, row: 0 },  { col: 1, row: 0 },
                { col: -1, row: 1 },  { col: 0, row: 1 }
            ];
        } else {
            return [
                { col: 0, row: -1 },  { col: 1, row: -1 },
                { col: -1, row: 0 },  { col: 1, row: 0 },
                { col: 0, row: 1 },   { col: 1, row: 1 }
            ];
        }
    }
    
    // Calculate distance between two hexes
    distance(col1, row1, col2, row2) {
        // Convert to cube coordinates for easier distance calculation
        const cube1 = this.offsetToCube(col1, row1);
        const cube2 = this.offsetToCube(col2, row2);
        
        return Math.max(
            Math.abs(cube1.x - cube2.x),
            Math.abs(cube1.y - cube2.y),
            Math.abs(cube1.z - cube2.z)
        );
    }
    
    // Convert offset coordinates to cube coordinates
    offsetToCube(col, row) {
        const x = col - (row - (row & 1)) / 2;
        const z = row;
        const y = -x - z;
        return { x, y, z };
    }
    
    // Convert cube coordinates to offset coordinates
    cubeToOffset(x, y, z) {
        const col = x + (z - (z & 1)) / 2;
        const row = z;
        return { col, row };
    }
    
    // Find path between two hexes using A* algorithm
    findPath(startCol, startRow, endCol, endRow, costFunction) {
        if (!this.isValidHex(startCol, startRow) || !this.isValidHex(endCol, endRow)) {
            return [];
        }
        
        const openSet = [];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        const startKey = `${startCol},${startRow}`;
        const endKey = `${endCol},${endRow}`;
        
        openSet.push({ col: startCol, row: startRow });
        gScore.set(startKey, 0);
        fScore.set(startKey, this.distance(startCol, startRow, endCol, endRow));
        
        while (openSet.length > 0) {
            // Find the node with lowest fScore
            let currentIndex = 0;
            for (let i = 1; i < openSet.length; i++) {
                const currentKey = `${openSet[i].col},${openSet[i].row}`;
                const bestKey = `${openSet[currentIndex].col},${openSet[currentIndex].row}`;
                
                if (fScore.get(currentKey) < fScore.get(bestKey)) {
                    currentIndex = i;
                }
            }
            
            const current = openSet.splice(currentIndex, 1)[0];
            const currentKey = `${current.col},${current.row}`;
            
            if (currentKey === endKey) {
                // Reconstruct path
                const path = [];
                let pathNode = current;
                
                while (pathNode) {
                    path.unshift(pathNode);
                    const nodeKey = `${pathNode.col},${pathNode.row}`;
                    pathNode = cameFrom.get(nodeKey);
                }
                
                return path;
            }
            
            closedSet.add(currentKey);
            
            // Check all neighbors
            const neighbors = this.getNeighbors(current.col, current.row);
            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.col},${neighbor.row}`;
                
                if (closedSet.has(neighborKey)) {
                    continue;
                }
                
                const moveCost = costFunction ? costFunction(neighbor.col, neighbor.row) : 1;
                const tentativeGScore = gScore.get(currentKey) + moveCost;
                
                if (!openSet.some(node => node.col === neighbor.col && node.row === neighbor.row)) {
                    openSet.push(neighbor);
                } else if (tentativeGScore >= (gScore.get(neighborKey) || Infinity)) {
                    continue;
                }
                
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentativeGScore);
                fScore.set(neighborKey, tentativeGScore + this.distance(neighbor.col, neighbor.row, endCol, endRow));
            }
        }
        
        return []; // No path found
    }
    
    // Get all hexes within a given range
    getHexesInRange(centerCol, centerRow, range) {
        const hexes = [];
        
        for (let col = centerCol - range; col <= centerCol + range; col++) {
            for (let row = centerRow - range; row <= centerRow + range; row++) {
                if (this.isValidHex(col, row) && 
                    this.distance(centerCol, centerRow, col, row) <= range) {
                    hexes.push({ col, row });
                }
            }
        }
        
        return hexes;
    }
    
    // Get ring of hexes at specific distance
    getHexRing(centerCol, centerRow, radius) {
        if (radius === 0) {
            return [{ col: centerCol, row: centerRow }];
        }
        
        const hexes = [];
        const cube = this.offsetToCube(centerCol, centerRow);
        
        // Start at one corner of the ring
        let currentCube = {
            x: cube.x + radius,
            y: cube.y - radius,
            z: cube.z
        };
        
        // Walk around the ring
        const directions = [
            { x: -1, y: 1, z: 0 }, { x: -1, y: 0, z: 1 },
            { x: 0, y: -1, z: 1 }, { x: 1, y: -1, z: 0 },
            { x: 1, y: 0, z: -1 }, { x: 0, y: 1, z: -1 }
        ];
        
        for (let direction = 0; direction < 6; direction++) {
            for (let step = 0; step < radius; step++) {
                const offset = this.cubeToOffset(currentCube.x, currentCube.y, currentCube.z);
                if (this.isValidHex(offset.col, offset.row)) {
                    hexes.push(offset);
                }
                
                currentCube.x += directions[direction].x;
                currentCube.y += directions[direction].y;
                currentCube.z += directions[direction].z;
            }
        }
        
        return hexes;
    }
    
    // Get line of hexes between two points
    getHexLine(startCol, startRow, endCol, endRow) {
        const distance = this.distance(startCol, startRow, endCol, endRow);
        const line = [];
        
        for (let i = 0; i <= distance; i++) {
            const t = distance === 0 ? 0 : i / distance;
            const cube1 = this.offsetToCube(startCol, startRow);
            const cube2 = this.offsetToCube(endCol, endRow);
            
            const lerpedCube = {
                x: MathUtils.lerp(cube1.x, cube2.x, t),
                y: MathUtils.lerp(cube1.y, cube2.y, t),
                z: MathUtils.lerp(cube1.z, cube2.z, t)
            };
            
            // Round to nearest hex
            const rounded = this.roundCube(lerpedCube);
            const offset = this.cubeToOffset(rounded.x, rounded.y, rounded.z);
            
            if (this.isValidHex(offset.col, offset.row)) {
                line.push(offset);
            }
        }
        
        return line;
    }
    
    // Round cube coordinates to nearest integer
    roundCube(cube) {
        let rx = Math.round(cube.x);
        let ry = Math.round(cube.y);
        let rz = Math.round(cube.z);
        
        const xDiff = Math.abs(rx - cube.x);
        const yDiff = Math.abs(ry - cube.y);
        const zDiff = Math.abs(rz - cube.z);
        
        if (xDiff > yDiff && xDiff > zDiff) {
            rx = -ry - rz;
        } else if (yDiff > zDiff) {
            ry = -rx - rz;
        } else {
            rz = -rx - ry;
        }
        
        return { x: rx, y: ry, z: rz };
    }
}