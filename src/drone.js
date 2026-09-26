import * as THREE from 'three';

export class Drone {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        
        // Drone Body
        const bodyGeo = new THREE.BoxGeometry(1.5, 0.4, 1.5);
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.add(body);
        
        // Drone Arms
        const armGeo = new THREE.BoxGeometry(0.2, 0.2, 3.0);
        const armMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        
        const arm1 = new THREE.Mesh(armGeo, armMat);
        arm1.rotation.y = Math.PI / 4;
        this.mesh.add(arm1);
        
        const arm2 = new THREE.Mesh(armGeo, armMat);
        arm2.rotation.y = -Math.PI / 4;
        this.mesh.add(arm2);
        
        // Propellers
        this.propellers = [];
        const propGeo = new THREE.BoxGeometry(1.2, 0.05, 0.2);
        const propMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.8 });
        
        const propPositions = [
            { x: 1.06, z: 1.06 },
            { x: -1.06, z: 1.06 },
            { x: 1.06, z: -1.06 },
            { x: -1.06, z: -1.06 }
        ];
        
        for (let p of propPositions) {
            // Propeller mount
            const mountGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8);
            const mount = new THREE.Mesh(mountGeo, armMat);
            mount.position.set(p.x, 0.15, p.z);
            this.mesh.add(mount);
            
            // Propeller blade
            const prop = new THREE.Mesh(propGeo, propMat);
            prop.position.set(p.x, 0.3, p.z);
            this.propellers.push(prop);
            this.mesh.add(prop);
        }
        
        // Front indicator light
        const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(0, 0.1, -0.76); // Front
        this.mesh.add(light);
        
        // Hover state
        this.hoverTime = 0;
        this.targetPos = new THREE.Vector3(0, 15, 0);
        this.mesh.position.copy(this.targetPos);
        
        scene.add(this.mesh);

        // Radius visualizer
        const radiusGeo = new THREE.CircleGeometry(1, 32);
        const radiusMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.15, depthWrite: false });
        this.radiusMat = radiusMat;
        this.radiusMesh = new THREE.Mesh(radiusGeo, radiusMat);
        this.radiusMesh.rotation.x = -Math.PI / 2;
        this.radiusMesh.position.y = 0.15;
        scene.add(this.radiusMesh);
    }
    
    update(dt, droneX, droneZ, isMoving, radius = 15.0, opacity = 15) {
        // Spin propellers
        const spinSpeed = isMoving ? 30 : 15;
        for (let i = 0; i < this.propellers.length; i++) {
            this.propellers[i].rotation.y += spinSpeed * dt * (i % 2 === 0 ? 1 : -1);
        }
        
        // Hover animation
        this.hoverTime += dt * (isMoving ? 4 : 2);
        const hoverOffset = Math.sin(this.hoverTime) * 0.5;
        
        // Move towards target smoothly
        this.targetPos.set(droneX, 15 + hoverOffset, droneZ);
        this.mesh.position.lerp(this.targetPos, 10 * dt);
        
        // Tilt when moving
        let targetTiltX = 0;
        let targetTiltZ = 0;
        
        if (isMoving) {
            // Calculate velocity delta
            const dx = droneX - this.mesh.position.x;
            const dz = droneZ - this.mesh.position.z;
            
            // Tilt forward/backward/left/right based on movement
            targetTiltX = dz * 0.05;
            targetTiltZ = -dx * 0.05;
            
            // Clamp tilt
            targetTiltX = Math.max(-0.4, Math.min(0.4, targetTiltX));
            targetTiltZ = Math.max(-0.4, Math.min(0.4, targetTiltZ));
        }
        
        this.mesh.rotation.x += (targetTiltX - this.mesh.rotation.x) * 5 * dt;
        this.mesh.rotation.z += (targetTiltZ - this.mesh.rotation.z) * 5 * dt;
        
        // Update radius visualizer
        this.radiusMesh.position.x = this.mesh.position.x;
        this.radiusMesh.position.z = this.mesh.position.z;
        this.radiusMesh.scale.set(radius, radius, 1);
        this.radiusMat.opacity = opacity / 100.0;
    }
}
