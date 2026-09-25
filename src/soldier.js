import * as THREE from 'three';
import { CONFIG } from './config.js';
import { soundManager } from './soundManager.js';

export class Soldier {
  constructor(scene, x, z) {
    const s = CONFIG.stats.soldier;
    this.speed = s.speedMin + Math.random() * (s.speedMax - s.speedMin);
    this.maxHp = Math.floor(s.hpMin + Math.random() * (s.hpMax - s.hpMin));
    this.hp = this.maxHp;
    this.attack = Math.floor(s.atkMin + Math.random() * (s.atkMax - s.atkMin));
    
    const geometry = new THREE.CapsuleGeometry(CONFIG.zombieRadius, 1, 4, 8);
    const material = new THREE.MeshLambertMaterial({ color: CONFIG.colors.soldier });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, 1, z);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.scene = scene;
    this.path = [];
    this.wanderTimer = 0;
    this.shootTimer = 0;
    this.shootCooldown = 0.5; // Shoot every 0.5s
    this.attackRangeSq = 400; // 20 units
    
    this.bullets = []; 
  }

  update(dt, grid, zombies, allSoldiers) {
    let pos = this.mesh.position.clone();
    
    // Find nearest zombie in line of sight
    let targetZombie = null;
    let minTargetDistSq = Infinity;
    
    for (let z of zombies) {
        let distSq = pos.distanceToSquared(z.mesh.position);
        if (distSq < this.attackRangeSq) {
            // Check LOS
            if (grid.isLineOfSightClear(pos, z.mesh.position)) {
                if (distSq < minTargetDistSq) {
                    minTargetDistSq = distSq;
                    targetZombie = z;
                }
            }
        }
    }

    // Separation
    let sepForce = new THREE.Vector3();
    let count = 0;
    for (let other of allSoldiers) {
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
  
  shoot(zombie) {
      zombie.hp -= this.attack;
      soundManager.playGunshot();
      if (zombie.mesh && zombie.mesh.material) {
          let orig = zombie.origEmissive || zombie.mesh.material.emissive.getHex();
          zombie.origEmissive = orig;
          zombie.mesh.material.emissive.setHex(0xffffff);
          if (zombie.flashTimer) clearTimeout(zombie.flashTimer);
          zombie.flashTimer = setTimeout(() => {
              if (zombie.mesh && zombie.mesh.material) zombie.mesh.material.emissive.setHex(orig);
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
      const endPos = zombie.mesh.position.clone();
      endPos.y += 0.5;
      
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
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.scene.remove(this.mesh);
    this.bullets.forEach(b => {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
    });
  }
}
