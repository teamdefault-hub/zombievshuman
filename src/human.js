import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Human {
  constructor(scene, x, z) {
    const s = CONFIG.stats.civilian;
    this.speed = s.speedMin + Math.random() * (s.speedMax - s.speedMin);
    this.maxHp = Math.floor(s.hpMin + Math.random() * (s.hpMax - s.hpMin));
    this.hp = this.maxHp;
    
    const geometry = new THREE.CapsuleGeometry(CONFIG.zombieRadius, 1, 4, 8);
    const material = new THREE.MeshLambertMaterial({ color: CONFIG.colors.civilian });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, 1, z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.scene = scene;
    this.path = [];
    this.targetPos = null;
    this.state = 'wander'; 
    this.wanderTimer = 0;
    this.isTransforming = false;
    this.transformTimer = 0;
  }

  update(dt, grid, zombies, allHumans) {
    if (this.isTransforming) {
        this.transformTimer -= dt;
        // Blink effect: alternate between red and original color
        if (Math.floor(this.transformTimer * 5) % 2 === 0) {
            this.mesh.material.color.setHex(0xff0000); // Red
        } else {
            this.mesh.material.color.setHex(CONFIG.colors.civilian);
        }
        return; // Do not move or calculate path
    }

    let pos = this.mesh.position.clone();
    
    // Check nearest zombie
    let nearestDistSq = Infinity;
    let nearestZ = null;
    for (let z of zombies) {
        let distSq = pos.distanceToSquared(z.mesh.position);
        if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestZ = z;
        }
    }

    let moveDir = new THREE.Vector3();
    let isFleeing = false;

    // If zombie within 40 units (distSq < 1600), flee
    if (nearestZ && nearestDistSq < 1600) {
        this.state = 'flee';
        isFleeing = true;
        this.wanderTimer -= dt;
        
        // Recalculate flee path periodically or if arrived
        if (this.wanderTimer <= 0 || !this.path || this.path.length === 0) {
            let dirFromZombie = pos.clone().sub(nearestZ.mesh.position).normalize();
            let distance = 30 + Math.random() * 20;
            let target = pos.clone().add(dirFromZombie.multiplyScalar(distance));
            
            let half = CONFIG.mapSize / 2 - 2;
            target.x = Math.max(-half, Math.min(half, target.x));
            target.z = Math.max(-half, Math.min(half, target.z));

            let gNode = grid.worldToGrid(target.x, target.z);
            if (grid.isWalkable(gNode.gx, gNode.gz)) {
                this.targetPos = target;
            } else {
                let validFound = false;
                for (let i = 0; i < 15; i++) {
                    let rx = target.x + (Math.random() - 0.5) * 40;
                    let rz = target.z + (Math.random() - 0.5) * 40;
                    rx = Math.max(-half, Math.min(half, rx));
                    rz = Math.max(-half, Math.min(half, rz));
                    let tgNode = grid.worldToGrid(rx, rz);
                    if (grid.isWalkable(tgNode.gx, tgNode.gz)) {
                        this.targetPos = new THREE.Vector3(rx, 1, rz);
                        validFound = true;
                        break;
                    }
                }
                if (!validFound) this.targetPos = pos.clone();
            }
            
            this.path = grid.findPath(pos, this.targetPos);
            this.wanderTimer = 0.5 + Math.random() * 1.0; // recalculate fast when fleeing
        }
    } else {
        this.state = 'wander';
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.targetPos = new THREE.Vector3(
                pos.x + (Math.random() - 0.5) * 30,
                1,
                pos.z + (Math.random() - 0.5) * 30
            );
            if (grid.isLineOfSightClear(pos, this.targetPos)) {
                this.path = [this.targetPos];
            } else {
                this.path = grid.findPath(pos, this.targetPos);
            }
            this.wanderTimer = 2.0 + Math.random() * 3.0;
        }
    }

    // Separation from other humans (slightly stronger to avoid clumping)
    let sepForce = new THREE.Vector3();
    let count = 0;
    for (let other of allHumans) {
        if (other !== this) {
            let distSq = pos.distanceToSquared(other.mesh.position);
            if (distSq < 2.5 && distSq > 0) { // Increased separation radius
                let diff = pos.clone().sub(other.mesh.position);
                diff.normalize().divideScalar(Math.sqrt(distSq));
                sepForce.add(diff);
                count++;
            }
        }
    }
    if (count > 0) sepForce.divideScalar(count).multiplyScalar(2.0); // Stronger multiplier

    if (this.path && this.path.length > 0) {
        let target = new THREE.Vector3(this.path[0].x, pos.y, this.path[0].z);
        let dirToTarget = target.clone().sub(pos);
        let dist = dirToTarget.length();
        if (dist < 0.5) {
            this.path.shift();
        } else {
            dirToTarget.normalize();
            dirToTarget.add(sepForce).normalize();
            // If fleeing, speed is max, otherwise regular speed
            let currentSpeed = isFleeing ? this.speed : this.speed * 0.7; 
            
            // Replaced move with direct integration since pathfinding handles obstacles
            this.move(dirToTarget, dt, grid, currentSpeed);
        }
    } else {
        // Just apply separation if no path
        if (count > 0) {
            this.move(sepForce.normalize(), dt, grid, this.speed * 0.5);
        }
    }
  }

  move(dir, dt, grid, speed) {
    if(dir.lengthSq() === 0) return;
    let actualSpeed = speed || this.speed;
    let nextPos = this.mesh.position.clone().add(dir.clone().multiplyScalar(actualSpeed * dt));
    let halfSize = (CONFIG.mapSize / 2) - CONFIG.zombieRadius;
    nextPos.x = Math.max(-halfSize, Math.min(halfSize, nextPos.x));
    nextPos.z = Math.max(-halfSize, Math.min(halfSize, nextPos.z));

    let gNode = grid.worldToGrid(nextPos.x, nextPos.z);
    if (!grid.isWalkable(gNode.gx, gNode.gz)) {
        let testX = grid.worldToGrid(nextPos.x, this.mesh.position.z);
        let testZ = grid.worldToGrid(this.mesh.position.x, nextPos.z);
        if (grid.isWalkable(testX.gx, testX.gz)) {
            nextPos.z = this.mesh.position.z;
        } else if (grid.isWalkable(testZ.gx, testZ.gz)) {
            nextPos.x = this.mesh.position.x;
        } else {
            nextPos.copy(this.mesh.position);
        }
    }
    this.mesh.position.copy(nextPos);
  }

  destroy() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
  }
}
