import * as THREE from 'three';
import { CONFIG } from './config.js';

export class GameMap {
  constructor(scene) {
    this.scene = scene;
    this.debugMeshes = [];
    
    // Ground
    const groundGeo = new THREE.PlaneGeometry(CONFIG.mapSize, CONFIG.mapSize);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    scene.add(this.groundMesh);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(CONFIG.mapSize, CONFIG.mapSize, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Borders
    const borderMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const thick = 1;
    const size = CONFIG.mapSize;
    
    const borders = [
      { x: 0, z: size/2, w: size, d: thick },
      { x: 0, z: -size/2, w: size, d: thick },
      { x: size/2, z: 0, w: thick, d: size },
      { x: -size/2, z: 0, w: thick, d: size },
    ];
    
    borders.forEach(b => {
      const geo = new THREE.BoxGeometry(b.w, 4, b.d);
      const mesh = new THREE.Mesh(geo, borderMat);
      mesh.position.set(b.x, 2, b.z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
    });

    this.rebuildBuildings();
  }

  rebuildBuildings() {
    if (this.buildingMeshes) {
       this.buildingMeshes.forEach(m => {
           this.scene.remove(m);
           m.geometry.dispose();
           m.material.dispose();
       });
    }
    this.buildingMeshes = [];
    
    const bldgMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    CONFIG.buildings.forEach(b => {
      const h = b.height || 6;
      const geo = new THREE.BoxGeometry(b.width, h, b.depth);
      const mesh = new THREE.Mesh(geo, bldgMat);
      mesh.position.set(b.x, h/2, b.z);
      mesh.rotation.y = b.rotY || 0;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.buildingMeshes.push(mesh);
    });
  }

  updateDebug(show, grid) {
    if (show && this.debugMeshes.length === 0) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
      const size = grid.cellSize;
      
      for(let x=0; x<grid.gridSize; x++) {
        for(let z=0; z<grid.gridSize; z++) {
          if(!grid.isWalkable(x, z)) {
            const world = grid.gridToWorld(x, z);
            const geo = new THREE.BoxGeometry(size, 0.1, size);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(world.x, 0.1, world.z);
            this.scene.add(mesh);
            this.debugMeshes.push(mesh);
          }
        }
      }
    } else if (!show && this.debugMeshes.length > 0) {
      this.debugMeshes.forEach(m => {
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      });
      this.debugMeshes = [];
    }
  }
}
