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

  update(dt, inputDir, grid, allZombies, debug, isStopped, flarePos = null, humans = [], soldiers = []) {
    let moveDir = new THREE.Vector3(inputDir.x, 0, inputDir.z);
    let isFlareActive = (flarePos !== null);
    
    if (!isFlareActive && (isStopped || moveDir.lengthSq() === 0)) {
        this.path = [];
        this.lastInputDirection.copy(moveDir);
        this.updateDebugLine(false);
        return;
    }

    if (isFlareActive) {
        moveDir.copy(flarePos).sub(this.mesh.position);
        moveDir.y = 0;
        if (moveDir.lengthSq() > 1) {
            moveDir.normalize();
        } else {
            moveDir.set(0, 0, 0);
        }
        if (Math.random() < 0.1) this.path = []; // Recalculate path periodically towards flare
    } else if (moveDir.distanceToSquared(this.lastInputDirection) > 0.1) {
        this.path = [];
        this.lastInputDirection.copy(moveDir);
    }

    let pos = this.mesh.position.clone();
    
    let sepForce = new THREE.Vector3();
    let count = 0;
    for (let other of allZombies) {
        if (other !== this) {
            let distSq = pos.distanceToSquared(other.mesh.position);
            // Zombie diameter is approx 1, adjust separation radius accordingly
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

    let closestTarget = null;
    let closestDistSq = Infinity;
    
    for (let h of humans) {
        if (h.isTransforming) continue;
        let d = pos.distanceToSquared(h.mesh.position);
        if (d < closestDistSq) { closestDistSq = d; closestTarget = h; }
    }
    for (let s of soldiers) {
        let d = pos.distanceToSquared(s.mesh.position);
        if (d < closestDistSq) { closestDistSq = d; closestTarget = s; }
    }

    let isLunging = false;
    let isBiting = false;
    let lungeDistSq = CONFIG.stats.zombie.lungeDist * CONFIG.stats.zombie.lungeDist;
    if (closestTarget && closestDistSq < lungeDistSq) {
        isLunging = true;
        if (closestDistSq < 2.25) { // Bite distance (1.5)
            isBiting = true;
        }
    }

    if (isBiting) {
        // Stop moving, face the target
        let lookTarget = closestTarget.mesh.position.clone();
        lookTarget.y = this.mesh.position.y;
        this.mesh.lookAt(lookTarget);
        this.updateDebugLine(false);
        return;
    }

    if (isLunging) {
        // Override path and move directly to target with increased speed
        this.path = [];
        moveDir.copy(closestTarget.mesh.position).sub(this.mesh.position);
        moveDir.y = 0;
        if (moveDir.lengthSq() > 0) moveDir.normalize();
        
        let finalDir = moveDir.clone().add(sepForce).normalize();
        this.move(finalDir, dt, grid, isLunging);
        this.updateDebugLine(false);
        return;
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
            this.move(dirToTarget, dt, grid, false);
        }
    } else {
        let targetWorld = pos.clone().add(moveDir.clone().multiplyScalar(15));
        
        if (!grid.isLineOfSightClear(pos, targetWorld)) {
            this.path = grid.findPath(pos, targetWorld);
        }
        
        if (this.path.length === 0) {
            let finalDir = moveDir.clone().add(sepForce).normalize();
            this.move(finalDir, dt, grid, false);
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
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.updateDebugLine(false);
  }
}
