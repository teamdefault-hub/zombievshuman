export class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    clear() {
        this.cells.clear();
    }
    _hash(x, z) {
        return Math.floor(x / this.cellSize) + ',' + Math.floor(z / this.cellSize);
    }
    insert(client) {
        const key = this._hash(client.mesh.position.x, client.mesh.position.z);
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(client);
    }
    findNearby(x, z, radius) {
        const result = [];
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        const range = Math.ceil(radius / this.cellSize);
        for (let i = cx - range; i <= cx + range; i++) {
            for (let j = cz - range; j <= cz + range; j++) {
                const key = i + ',' + j;
                if (this.cells.has(key)) {
                    const cell = this.cells.get(key);
                    for(let k=0; k<cell.length; k++) {
                        result.push(cell[k]);
                    }
                }
            }
        }
        return result;
    }
}
