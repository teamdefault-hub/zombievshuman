import * as THREE from 'three';
import { CONFIG } from './config.js';
import { soundManager } from './soundManager.js';

export class Soldier {
  constructor(scene, x, z) {
    const unitStats = CONFIG.units && CONFIG.units['s_rifleman'] ? CONFIG.units['s_rifleman'] : {};
    const s = CONFIG.stats.soldier;

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

    this.attack = unitStats.attack !== undefined ? unitStats.attack : Math.floor(s.atkMin + Math.random() * (s.atkMax - s.atkMin));
    this.colRadius = unitStats.col_radius !== undefined ? unitStats.col_radius : 0.5;
    this.infectResist = unitStats.infect_resist !== undefined ? unitStats.infect_resist : 0.0;
    this.canTargetAir = unitStats.can_target_air === true || unitStats.can_target_air === 1;
    
    this.mesh = new THREE.Object3D();
    this.mesh.position.set(x, 1, z);
    this.entityType = 'soldier';

    this.scene = scene;
    this.path = [];
    this.wanderTimer = 0;
    this.shootTimer = 0;
    this.shootCooldown = unitStats.attack_speed !== undefined ? unitStats.attack_speed : (s.atkCooldown !== undefined ? s.atkCooldown : 0.5);
    this.attackRange = unitStats.attack_dist !== undefined ? unitStats.attack_dist : 20.0;
    this.attackRangeSq = this.attackRange * this.attackRange;
    
    this.bullets = []; 
  }

  update(dt, grid, entityGrid, playerDrone = null) {
    
    let pos = this.mesh.position.clone();
    
    this.lastHitTimer += dt;
    if (this.isExhausted) {
        this.exhaustTimer += dt;
    }
    
    let isSafe = this.lastHitTimer >= this.safeRearmS && this.state !== 'flee' && this.state !== 'attack';
    if (isSafe && !this.isMoving) {
        this.stamina += this.staminaRegen * dt;
        if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
    }

    if (this.isExhausted && this.exhaustTimer >= this.exhaustMinS && (this.stamina / this.maxStamina) >= this.resumeRatio) {
        this.isExhausted = false;
    }

    
    let targetZombie = null;
    let minTargetDistSq = Infinity;
    
    // Check if we can target air (drone)
    if (this.canTargetAir && playerDrone && playerDrone.hp > 0 && CONFIG.drone) {
        let h = CONFIG.drone.flight_height !== undefined ? CONFIG.drone.flight_height : 10;
        let dx = pos.x - playerDrone.mesh.position.x;
        let dz = pos.z - playerDrone.mesh.position.z;
        let distSq = dx*dx + h*h + dz*dz; // 3D distance
        
        if (distSq < this.attackRangeSq) {
            let drone3DPos = playerDrone.mesh.position.clone();
            drone3DPos.y = h;
            if (grid.isLineOfSightClear(pos, drone3DPos)) {
                minTargetDistSq = distSq;
                targetZombie = playerDrone; // Treat drone as target
            }
        }
    }
    
    let nearby = entityGrid.findNearby(pos.x, pos.z, this.attackRange); 
    
    for (let z of nearby) {
        if (z.entityType === 'zombie') {
            let distSq = pos.distanceToSquared(z.mesh.position);
            if (distSq < this.attackRangeSq) {
                if (grid.isLineOfSightClear(pos, z.mesh.position)) {
                    if (distSq < minTargetDistSq) {
                        minTargetDistSq = distSq;
                        targetZombie = z;
                    }
                }
            }
        }
    }

    // Separation
    let sepForce = new THREE.Vector3();
    let count = 0;
    let nearbySoldiers = entityGrid.findNearby(pos.x, pos.z, 2.0);
    for (let other of nearbySoldiers) {
        if (other.entityType === 'soldier' && other !== this) {
            let distSq = pos.distanceToSquared(other.mesh.position);
            if (distSq < 2.0 && distSq > 0) {
                let diff = pos.clone().sub(other.mesh.position);
                diff.normalize().divideScalar(Math.sqrt(distSq));
                sepForce.add(diff);
                count++;
            }
        }
    }
    if (count > 0) sepForce.divideScalar(count).multiplyScalar(1.5);

    this.shootTimer -= dt;

    if (targetZombie) {
        // Stop moving and shoot
        this.path = [];
        if (this.shootTimer <= 0) {
            this.shoot(targetZombie);
            this.shootTimer = this.shootCooldown + Math.random() * 0.2;
        }
        
        // If too close (e.g. 8 units), back away slightly
        if (minTargetDistSq < 64) {
             let backDir = pos.clone().sub(targetZombie.mesh.position).normalize().add(sepForce).normalize();
             this.move(backDir, dt, grid);
        } else {
             // Just separate
             if (sepForce.lengthSq() > 0) {
                 this.move(sepForce.normalize(), dt, grid);
             }
        }
    } else {
        // Wander around
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            let targetPos = new THREE.Vector3(
                pos.x + (Math.random() - 0.5) * 30,
                1,
                pos.z + (Math.random() - 0.5) * 30
            );
            if (grid.isLineOfSightClear(pos, targetPos)) {
                this.path = [targetPos];
            } else {
                this.path = grid.findPath(pos, targetPos);
            }
            this.wanderTimer = 2.0 + Math.random() * 3.0;
        }
        
        if (this.path && this.path.length > 0) {
            let target = new THREE.Vector3(this.path[0].x, pos.y, this.path[0].z);
            let dirToTarget = target.clone().sub(pos);
            let dist = dirToTarget.length();
            if (dist < 0.5) {
                this.path.shift();
            } else {
                dirToTarget.normalize();
                dirToTarget.add(sepForce).normalize();
                this.move(dirToTarget, dt, grid);
            }
        } else if (sepForce.lengthSq() > 0) {
             this.move(sepForce.normalize(), dt, grid);
        }
    }
    
    // Update bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
        let b = this.bullets[i];
        b.life -= dt;
        if (b.life <= 0) {
            this.scene.remove(b.line);
            b.line.geometry.dispose();
            b.line.material.dispose();
            this.bullets.splice(i, 1);
        } else {
            b.line.material.opacity = (b.life / 0.1);
        }
    }
  }
  
  shoot(target) {
      if (target.hp !== undefined) {
          let damage = this.attack;
          if (target === window.playerDrone || target.constructor.name === 'Drone') {
              if (CONFIG.drone && CONFIG.drone.damage_reduction) {
                  damage *= (1.0 - CONFIG.drone.damage_reduction);
              }
              target.regenTimer = 0;
          }
          target.hp -= damage;
      }
      soundManager.playGunshot();
      
      target.isHit = true;
      if (target.mesh && target.mesh.material) {
          if (target.flashTimer) clearTimeout(target.flashTimer);
          target.flashTimer = setTimeout(() => {
              target.isHit = false;
          }, 100);
      } else {
          // Fallback if no single material (e.g. Drone)
          if (target.flashTimer) clearTimeout(target.flashTimer);
          target.flashTimer = setTimeout(() => {
              target.isHit = false;
          }, 100);
      }
      
      // Draw tracer
      const material = new THREE.LineBasicMaterial({
          color: 0xffff00,
          transparent: true,
          opacity: 1.0
      });
      
      const points = [];
      const startPos = this.mesh.position.clone();
      startPos.y += 0.5; // Shoot from chest height
      
      const endPos = target.mesh.position.clone();
      // If drone, shoot at its height, otherwise chest height
      if (target === window.playerDrone || target.constructor.name === 'Drone') {
          endPos.y = (CONFIG.drone && CONFIG.drone.flight_height !== undefined) ? CONFIG.drone.flight_height : 10;
      } else {
          endPos.y += 0.5;
      }
      
      points.push(startPos);
      points.push(endPos);
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      this.scene.add(line);
      
      this.bullets.push({ line: line, life: 0.1 });  
  }

  move(dir, dt, grid) {
    if(dir.lengthSq() === 0) return;
    let nextPos = this.mesh.position.clone().add(dir.clone().multiplyScalar(this.speed * dt));
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
    this.scene.remove(this.mesh);
    this.bullets.forEach(b => {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
    });
  }
}
