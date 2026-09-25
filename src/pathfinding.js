import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Grid {
  constructor() {
    this.size = CONFIG.mapSize;
    this.cellSize = CONFIG.gridSize;
    this.gridSize = Math.ceil(this.size / this.cellSize);
    this.offset = this.size / 2;
    
    this.nodes = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(false));
    this.buildGrid();
  }

  buildGrid(colMargin = 0.1) {
    this.nodes = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(false));
    CONFIG.buildings.forEach(b => {
      const hw = b.width / 2 + colMargin;
      const hd = b.depth / 2 + colMargin;
      const radius = Math.sqrt(hw*hw + hd*hd);
      
      const minX = b.x - radius;
      const maxX = b.x + radius;
      const minZ = b.z - radius;
      const maxZ = b.z + radius;

      const gridMinX = Math.max(0, Math.floor((minX + this.offset) / this.cellSize));
      const gridMaxX = Math.min(this.gridSize - 1, Math.ceil((maxX + this.offset) / this.cellSize));
      const gridMinZ = Math.max(0, Math.floor((minZ + this.offset) / this.cellSize));
      const gridMaxZ = Math.min(this.gridSize - 1, Math.ceil((maxZ + this.offset) / this.cellSize));

      const cos = Math.cos(b.rotY || 0);
      const sin = Math.sin(b.rotY || 0);

      for (let x = gridMinX; x <= gridMaxX; x++) {
        for (let z = gridMinZ; z <= gridMaxZ; z++) {
          const world = this.gridToWorld(x, z);
          // translate
          const dx = world.x - b.x;
          const dz = world.z - b.z;
          // rotate inverse
          const localX = dx * cos - dz * sin;
          const localZ = dx * sin + dz * cos;
          
          if (Math.abs(localX) <= hw && Math.abs(localZ) <= hd) {
            this.nodes[x][z] = true;
          }
        }
      }
    });
  }

  worldToGrid(x, z) {
    return {
      gx: Math.floor((x + this.offset) / this.cellSize),
      gz: Math.floor((z + this.offset) / this.cellSize)
    };
  }

  gridToWorld(gx, gz) {
    return {
      x: gx * this.cellSize - this.offset + this.cellSize / 2,
      z: gz * this.cellSize - this.offset + this.cellSize / 2
    };
  }

  isWalkable(gx, gz) {
    if (gx < 0 || gx >= this.gridSize || gz < 0 || gz >= this.gridSize) return false;
    return !this.nodes[gx][gz];
  }

  isLineOfSightClear(start, end) {
    let { gx: x0, gz: y0 } = this.worldToGrid(start.x, start.z);
    let { gx: x1, gz: y1 } = this.worldToGrid(end.x, end.z);
    
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    while(true) {
      if (!this.isWalkable(x0, y0)) return false;
      if ((x0 === x1) && (y0 === y1)) break;
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return true;
  }

  findPath(startWorld, endWorld) {
    const startNode = this.worldToGrid(startWorld.x, startWorld.z);
    const endNode = this.worldToGrid(endWorld.x, endWorld.z);

    if (!this.isWalkable(startNode.gx, startNode.gz)) return [];
    
    if (!this.isWalkable(endNode.gx, endNode.gz)) {
        let found = false;
        for(let r=1; r<5; r++){
            for(let dx=-r; dx<=r; dx++){
                for(let dz=-r; dz<=r; dz++){
                    if(this.isWalkable(endNode.gx + dx, endNode.gz + dz)){
                        endNode.gx += dx;
                        endNode.gz += dz;
                        found = true;
                        break;
                    }
                }
                if(found) break;
            }
            if(found) break;
        }
        if(!found) return [];
    }

    const openList = [];
    const closedList = new Set();
    const gScore = {};
    const fScore = {};
    const cameFrom = {};

    const startKey = `${startNode.gx},${startNode.gz}`;
    openList.push(startNode);
    gScore[startKey] = 0;
    fScore[startKey] = this.heuristic(startNode, endNode);

    while (openList.length > 0) {
      let current = openList[0];
      let lowestIndex = 0;
      for (let i = 1; i < openList.length; i++) {
        let key = `${openList[i].gx},${openList[i].gz}`;
        let cKey = `${current.gx},${current.gz}`;
        if ((fScore[key] || Infinity) < (fScore[cKey] || Infinity)) {
          current = openList[i];
          lowestIndex = i;
        }
      }

      const currentKey = `${current.gx},${current.gz}`;
      
      if (current.gx === endNode.gx && current.gz === endNode.gz) {
        const path = [];
        let currKey = currentKey;
        while (cameFrom[currKey]) {
          const parts = currKey.split(',');
          path.push(this.gridToWorld(parseInt(parts[0]), parseInt(parts[1])));
          currKey = cameFrom[currKey];
        }
        return path.reverse();
      }

      openList.splice(lowestIndex, 1);
      closedList.add(currentKey);

      const neighbors = this.getNeighbors(current);
      for (let neighbor of neighbors) {
        const neighborKey = `${neighbor.gx},${neighbor.gz}`;
        if (closedList.has(neighborKey)) continue;

        const tentativeGScore = gScore[currentKey] + neighbor.cost;
        
        let inOpen = openList.find(n => n.gx === neighbor.gx && n.gz === neighbor.gz);
        if (!inOpen) {
          openList.push(neighbor);
        } else if (tentativeGScore >= (gScore[neighborKey] || Infinity)) {
          continue;
        }

        cameFrom[neighborKey] = currentKey;
        gScore[neighborKey] = tentativeGScore;
        fScore[neighborKey] = gScore[neighborKey] + this.heuristic(neighbor, endNode);
      }
    }

    return [];
  }

  heuristic(a, b) {
    return Math.abs(a.gx - b.gx) + Math.abs(a.gz - b.gz);
  }

  getNeighbors(node) {
    const neighbors = [];
    const dirs = [
      {x: 0, z: -1, cost: 1}, {x: 1, z: 0, cost: 1},
      {x: 0, z: 1, cost: 1}, {x: -1, z: 0, cost: 1},
      {x: -1, z: -1, cost: 1.414}, {x: 1, z: -1, cost: 1.414},
      {x: 1, z: 1, cost: 1.414}, {x: -1, z: 1, cost: 1.414}
    ];

    for (let dir of dirs) {
      const gx = node.gx + dir.x;
      const gz = node.gz + dir.z;
      
      if (dir.cost > 1.1) {
          if (!this.isWalkable(node.gx + dir.x, node.gz) || !this.isWalkable(node.gx, node.gz + dir.z)) {
              continue;
          }
      }

      if (this.isWalkable(gx, gz)) {
        neighbors.push({ gx, gz, cost: dir.cost });
      }
    }
    return neighbors;
  }

  pushOutCollision(entity, dt) {
    let pos = entity.mesh.position;
    let gNode = this.worldToGrid(pos.x, pos.z);
    
    // Check if the exact center is walkable
    if (this.isWalkable(gNode.gx, gNode.gz)) return;
    
    // Find nearest walkable cell using BFS
    let queue = [{gx: gNode.gx, gz: gNode.gz}];
    let visited = new Set([`${gNode.gx},${gNode.gz}`]);
    let dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]];
    let head = 0;
    let nearest = null;
    
    while(head < queue.length && head < 400) { // Limit search radius
        let curr = queue[head++];
        if (this.isWalkable(curr.gx, curr.gz)) {
            nearest = curr;
            break;
        }
        for (let d of dirs) {
            let nx = curr.gx + d[0];
            let nz = curr.gz + d[1];
            let key = `${nx},${nz}`;
            if (nx >= 0 && nx < this.gridSize && nz >= 0 && nz < this.gridSize && !visited.has(key)) {
                visited.add(key);
                queue.push({gx: nx, gz: nz});
            }
        }
    }
    
    if (nearest) {
        let targetWorld = this.gridToWorld(nearest.gx, nearest.gz);
        let dir = new THREE.Vector3(targetWorld.x - pos.x, 0, targetWorld.z - pos.z);
        if (dir.lengthSq() > 0.01) {
            dir.normalize();
            // Smoothly push out at a fast speed (e.g., 15 units/sec)
            pos.add(dir.multiplyScalar(15.0 * dt));
        }
    }
  }
}
