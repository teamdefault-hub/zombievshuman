import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Zombie {
  constructor(scene, type, x, z) {
    const zStats = CONFIG.stats.zombie;
    this.speed = zStats.speedMin + Math.random() * (zStats.speedMax - zStats.speedMin);
    this.maxHp = Math.floor(zStats.hpMin + Math.random() * (zStats.hpMax - zStats.hpMin));
    this.hp = this.maxHp;
    this.attack = Math.floor(zStats.atkMin + Math.random() * (zStats.atkMax - zStats.atkMin));
    
    const geometry = new THREE.CapsuleGeometry(CONFIG.zombieRadius, 1, 4, 8);
    const material = new THREE.MeshLambertMaterial({ color: CONFIG.colors.zombie });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, 1, z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.velocity = new THREE.Vector3();
    this.path = [];
    this.pathLine = null;
    this.scene = scene;
    
    this.lastInputDirection = new THREE.Vector3();
  }

  update(dt, droneCommand, dronePos, grid, allZombies, debug, humans = [], soldiers = []) {
    let pos = this.mesh.position.clone();
    
    // Separation force
    let sepForce = new THREE.Vector3();
    let count = 0;
    for (let other of allZombies) {
        if (other !== this) {
            let distSq = pos.distanceToSquared(other.mesh.position);
            if (distSq < 2.0 && distSq > 0) {
                let diff = pos.clone().sub(other.mesh.position);
                diff.normalize().divideScalar(Math.sqrt(distSq));
                sepForce.add(diff);
                count++;
            }
        }
    }
    if (count > 0) {
        sepForce.divideScalar(count).multiplyScalar(2.0); // weak separation
    }

    // 1. Validate current target if any
    let lungeDistSq = CONFIG.stats.zombie.lungeDist * CONFIG.stats.zombie.lungeDist;
    if (this.currentTarget) {
        let stillValid = false;
        if (humans.includes(this.currentTarget) && !this.currentTarget.isTransforming) stillValid = true;
        if (soldiers.includes(this.currentTarget) && this.currentTarget.hp > 0) stillValid = true;
        
        if (stillValid) {
            let d = pos.distanceToSquared(this.currentTarget.mesh.position);
            if (d > lungeDistSq * 1.5) {
                stillValid = false;
            }
        }
        
        if (!stillValid) {
            if (this.currentTarget.targetedBy === this) this.currentTarget.targetedBy = null;
            this.currentTarget = null;
        }
    }

    // 2. Find closest target for biting/auto-attack
    let closestTarget = null;
    let closestDistSq = Infinity;
    
    if (this.currentTarget && this.currentTarget.targetedBy === this) {
        closestTarget = this.currentTarget;
        closestDistSq = pos.distanceToSquared(this.currentTarget.mesh.position);
    } else {
        for (let h of humans) {
            if (h.isTransforming) continue;
            if (h.targetedBy && h.targetedBy !== this) continue;
            let d = pos.distanceToSquared(h.mesh.position);
            if (d < closestDistSq) { closestDistSq = d; closestTarget = h; }
        }
        for (let s of soldiers) {
            if (s.targetedBy && s.targetedBy !== this) continue;
            let d = pos.distanceToSquared(s.mesh.position);
            if (d < closestDistSq) { closestDistSq = d; closestTarget = s; }
        }
    }

    let isBiting = (closestTarget && closestDistSq < 2.25);
    
    // Priorities
    // 1. Stop
    if (droneCommand.type === 'STOP') {
        this.path = [];
        this.updateDebugLine(false);
        if (isBiting) {
            let lookTarget = closestTarget.mesh.position.clone();
            lookTarget.y = this.mesh.position.y;
            this.mesh.lookAt(lookTarget);
        }
        if (sepForce.lengthSq() > 0) {
            this.move(sepForce.normalize(), dt, grid, false);
        }
        return; // Early return for STOP
    }

    if (isBiting) {
        // Stop moving, face the target (still applying separation lightly)
        let lookTarget = closestTarget.mesh.position.clone();
        lookTarget.y = this.mesh.position.y;
        this.mesh.lookAt(lookTarget);
        this.updateDebugLine(false);
        if (sepForce.lengthSq() > 0) {
            this.move(sepForce.normalize(), dt, grid, false);
        }
        return;
    }

    let targetPos = null;
    let isLunging = false;

    // 2. Direct commands
    if (droneCommand.type === 'ATTACK' && droneCommand.target && (droneCommand.target.hp > 0 || !droneCommand.target.isTransforming)) {
        targetPos = droneCommand.target.mesh.position.clone();
        isLunging = true;
    } else if (droneCommand.type === 'GATHER' && droneCommand.position) {
        targetPos = droneCommand.position.clone();
    } else if (droneCommand.type === 'GATHER_ALL' && droneCommand.position) {
        targetPos = droneCommand.position.clone();
    } else {
        // 3. Drone Influence Range or Auto-Attack
        let droneRadSq = (droneCommand && droneCommand.type === 'FLARE_ACTIVE') ? Infinity : (CONFIG.stats.zombie.droneRadius * CONFIG.stats.zombie.droneRadius);
        if (closestTarget && closestDistSq < lungeDistSq) {
            targetPos = closestTarget.mesh.position.clone();
            isLunging = true;
            this.currentTarget = closestTarget;
            closestTarget.targetedBy = this;
        } else {
            if (this.currentTarget && this.currentTarget.targetedBy === this) {
                this.currentTarget.targetedBy = null;
            }
            this.currentTarget = null;
            
            if (dronePos && pos.distanceToSquared(dronePos) < droneRadSq) {
                targetPos = dronePos.clone();
            } else {
            // 4. Wander
            if (!this.wanderTarget || pos.distanceToSquared(this.wanderTarget) < 4.0 || Math.random() < 0.01) {
                let rx = pos.x + (Math.random() - 0.5) * 20;
                let rz = pos.z + (Math.random() - 0.5) * 20;
                this.wanderTarget = new THREE.Vector3(rx, 0, rz);
            }
            targetPos = this.wanderTarget.clone();
            }
        }
    }

    // Movement execution
    let moveDir = new THREE.Vector3();
    
    // Re-evaluate path if target changed significantly
    if (targetPos) {
        if (!this.lastTargetPos || this.lastTargetPos.distanceToSquared(targetPos) > 4.0) {
            this.path = [];
            this.lastTargetPos = targetPos.clone();
        }
    }

    if (this.path.length > 0) {
        let target = new THREE.Vector3(this.path[0].x, pos.y, this.path[0].z);
        let dirToTarget = target.clone().sub(pos);
        let dist = dirToTarget.length();
        
        if (dist < 0.5) {
            this.path.shift();
            if (this.path.length === 0) {
                this.updateDebugLine(false);
            }
        } else {
            dirToTarget.normalize();
            dirToTarget.add(sepForce).normalize();
            this.move(dirToTarget, dt, grid, isLunging);
        }
    } else {
        if (targetPos && !grid.isLineOfSightClear(pos, targetPos)) {
            this.path = grid.findPath(pos, targetPos);
        }
        
        if (this.path.length === 0) {
            if (targetPos) moveDir.copy(targetPos).sub(this.mesh.position);
            moveDir.y = 0;
            if (moveDir.lengthSq() > 0) moveDir.normalize();
            
            let finalDir = moveDir.clone().add(sepForce).normalize();
            this.move(finalDir, dt, grid, isLunging);
        }
    }

    this.updateDebugLine(debug);
  }

  move(dir, dt, grid, isLunging = false) {
    let currentSpeed = this.speed * (isLunging ? CONFIG.stats.zombie.lungeSpeedMult : 1.0);
    let nextPos = this.mesh.position.clone().add(dir.clone().multiplyScalar(currentSpeed * dt));
    
    let halfSize = (CONFIG.mapSize / 2) - CONFIG.zombieRadius;
    nextPos.x = Math.max(-halfSize, Math.min(halfSize, nextPos.x));
    nextPos.z = Math.max(-halfSize, Math.min(halfSize, nextPos.z));

    let gNode = grid.worldToGrid(nextPos.x, nextPos.z);
    if (!grid.isWalkable(gNode.gx, gNode.gz)) {
        let testXNode = grid.worldToGrid(nextPos.x, this.mesh.position.z);
        let testZNode = grid.worldToGrid(this.mesh.position.x, nextPos.z);
        if(grid.isWalkable(testXNode.gx, testXNode.gz)) {
             nextPos.z = this.mesh.position.z;
        } else if (grid.isWalkable(testZNode.gx, testZNode.gz)) {
             nextPos.x = this.mesh.position.x;
        } else {
             return; 
        }
    }

    this.mesh.position.copy(nextPos);
    
    let lookTarget = this.mesh.position.clone().add(dir);
    this.mesh.lookAt(lookTarget);
  }

  updateDebugLine(show) {
    if (!show || this.path.length === 0) {
        if (this.pathLine) {
            this.scene.remove(this.pathLine);
            this.pathLine.geometry.dispose();
            this.pathLine.material.dispose();
            this.pathLine = null;
        }
        return;
    }

    let points = [this.mesh.position.clone()];
    this.path.forEach(p => points.push(new THREE.Vector3(p.x, 1, p.z)));
    
    if (this.pathLine) {
        this.pathLine.geometry.setFromPoints(points);
    } else {
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.pathLine = new THREE.Line(geometry, material);
        this.scene.add(this.pathLine);
    }
  }

  destroy() {
    if (this.currentTarget && this.currentTarget.targetedBy === this) {
        this.currentTarget.targetedBy = null;
    }
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.updateDebugLine(false);
  }
}
