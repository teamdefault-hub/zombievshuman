import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Human {
  constructor(scene, x, z) {
    const unitStats = CONFIG.units && CONFIG.units['c_refugee'] ? CONFIG.units['c_refugee'] : {};
    const s = CONFIG.stats.civilian;
    this.speed = unitStats.speed !== undefined ? unitStats.speed : (s.speedMin + Math.random() * (s.speedMax - s.speedMin));
    this.maxHp = unitStats.hp !== undefined ? unitStats.hp : Math.floor(s.hpMin + Math.random() * (s.hpMax - s.hpMin));
    
    this.hp = this.maxHp;
    this.maxStamina = unitStats.max_stamina !== undefined ? unitStats.max_stamina : 100;
    this.stamina = this.maxStamina;
    this.isExhausted = false;
    this.staminaRegen = unitStats.stamina_regen_per_s !== undefined ? unitStats.stamina_regen_per_s : 5;
    this.moveDrain = unitStats.move_stamina_drain_per_s !== undefined ? unitStats.move_stamina_drain_per_s : 0;
    this.sprintDrain = unitStats.sprint_stamina_drain_per_s !== undefined ? unitStats.sprint_stamina_drain_per_s : 10;
    this.exhaustMinS = unitStats.exhausted_rest_min_s !== undefined ? unitStats.exhausted_rest_min_s : 3;
    this.exhaustTimer = 0;
    this.resumeRatio = unitStats.stamina_resume_ratio !== undefined ? unitStats.stamina_resume_ratio : 0.5;
    this.safeRearmS = unitStats.sprint_rearm_safe_s !== undefined ? unitStats.sprint_rearm_safe_s : 2;
    this.safeTimer = 0;
    this.lastHitTimer = 0;

    this.colRadius = unitStats.col_radius !== undefined ? unitStats.col_radius : 0.5;
    this.infectResist = unitStats.infect_resist !== undefined ? unitStats.infect_resist : 0.0;
    
    this.mesh = new THREE.Object3D();
    this.mesh.position.set(x, 1, z);
    this.entityType = 'human';
    this.color = new THREE.Color(CONFIG.colors.civilian);

    this.scene = scene;
    this.path = [];
    this.targetPos = null;
    this.state = 'wander'; 
    this.wanderTimer = 0;
    this.isTransforming = false;
    this.transformTimer = 0;
  }

  update(dt, grid, entityGrid) {
    if (this.isTransforming) {
        this.transformTimer -= dt;
        if (Math.floor(this.transformTimer * 5) % 2 === 0) {
            this.color.setHex(0xff0000); // Red
        } else {
            this.color.setHex(CONFIG.colors.civilian);
        }
        return; // Do not move or calculate path
    }

    
    let pos = this.mesh.position.clone();
    
    this.lastHitTimer += dt;
    if (this.isExhausted) {
        this.exhaustTimer += dt;
    }
    
    // Stamina recovery logic (Rule 7)
    let isSafe = this.lastHitTimer >= this.safeRearmS && this.state !== 'flee' && this.state !== 'attack';
    if (isSafe && !this.isMoving) {
        // Recover stamina only when safe and not moving
        this.stamina += this.staminaRegen * dt;
        if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
    }

    // Recover from exhaustion
    if (this.isExhausted && this.exhaustTimer >= this.exhaustMinS && (this.stamina / this.maxStamina) >= this.resumeRatio) {
        this.isExhausted = false;
    }

    
    // Check nearest zombie
    let nearestDistSq = Infinity;
    let nearestZ = null;
    let nearbyZombies = entityGrid.findNearby(pos.x, pos.z, 40.0);
    
    for (let other of nearbyZombies) {
        if (other.entityType === 'zombie') {
            let distSq = pos.distanceToSquared(other.mesh.position);
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearestZ = other;
            }
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
    let nearbyHumans = entityGrid.findNearby(pos.x, pos.z, 2.5);
    for (let other of nearbyHumans) {
        if (other.entityType === 'human' && other !== this) {
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
            
            let wantsToSprint = isFleeing;
            // Rule 7: If stamina < 20% and not exhausted, prioritize recovery (hold sprint)
            
            // Cannot sprint if exhausted
            if (this.isExhausted) wantsToSprint = false;

            let currentSpeed = wantsToSprint ? this.speed : this.speed * 0.7; // 0.7 is walk speed
            
            // Drain stamina
            let drain = wantsToSprint ? this.sprintDrain : this.moveDrain;
            this.stamina -= drain * dt;
            if (this.stamina <= 0) {
                this.stamina = 0;
                if (wantsToSprint) { // Trigger exhaustion only from sprinting/skills
                    this.isExhausted = true;
                    this.exhaustTimer = 0;
                }
            }
            this.isMoving = true;
 
            
            // Replaced move with direct integration since pathfinding handles obstacles
            this.move(dirToTarget, dt, grid, currentSpeed);
        }
    } else {
        // Just apply separation if no path
        
        this.isMoving = false;
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
    // No-op for Object3D
  }
}
