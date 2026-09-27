import * as THREE from 'three';
import { InputManager } from './input.js';
import { Grid } from './pathfinding.js';
import { Zombie } from './zombie.js';
import { Human } from './human.js';
import { Soldier } from './soldier.js';
import { SpatialHash } from './spatialHash.js';
import { GameMap } from './map.js';
import { Drone } from './drone.js';
import { CONFIG, generateBuildings } from './config.js';
import { soundManager } from './soundManager.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { sheetManager } from './sheetManager.js';

const canvas = document.createElement('canvas');
document.getElementById('game-container').appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, 9 / 16, 20, 2000);
camera.position.set(0, 50, 40);
camera.lookAt(0, 0, 0);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
scene.add(dirLight);

const input = new InputManager();
const grid = new Grid();
const entityGrid = new SpatialHash(10);
const gameMap = new GameMap(scene);
let playerDrone = new Drone(scene);
document.addEventListener('click', () => soundManager.init(), { once: true });

const dummy = new THREE.Object3D();
const dummyColor = new THREE.Color();

const zGeo = new THREE.CapsuleGeometry(CONFIG.zombieRadius, 1, 4, 8);
const zMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

const zWalkerIMesh = new THREE.InstancedMesh(zGeo, zMat, 15000);
zWalkerIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
zWalkerIMesh.castShadow = true;
zWalkerIMesh.frustumCulled = false;
scene.add(zWalkerIMesh);

const zRunnerGeo = new THREE.OctahedronGeometry(CONFIG.zombieRadius * 0.8);
const zRunnerIMesh = new THREE.InstancedMesh(zRunnerGeo, zMat, 15000);
zRunnerIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
zRunnerIMesh.castShadow = true;
zRunnerIMesh.frustumCulled = false;
scene.add(zRunnerIMesh);

const zBruteGeo = new THREE.BoxGeometry(CONFIG.zombieRadius * 3, 3, CONFIG.zombieRadius * 3);
const zBruteIMesh = new THREE.InstancedMesh(zBruteGeo, zMat, 15000);
zBruteIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
zBruteIMesh.castShadow = true;
zBruteIMesh.frustumCulled = false;
scene.add(zBruteIMesh);

const hGeo = new THREE.CapsuleGeometry(CONFIG.zombieRadius, 1, 4, 8);
const hMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const hIMesh = new THREE.InstancedMesh(hGeo, hMat, 10000);
hIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
hIMesh.castShadow = true;
hIMesh.frustumCulled = false;
scene.add(hIMesh);

const sGeo = new THREE.CapsuleGeometry(CONFIG.zombieRadius, 1, 4, 8);
const sMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const sIMesh = new THREE.InstancedMesh(sGeo, sMat, 2000);
sIMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
sIMesh.castShadow = true;
sIMesh.frustumCulled = false;
scene.add(sIMesh);


let flareCharge = 0;
let flareState = 'charging'; // 'charging', 'ready', 'active'
let flareDuration = 0;
let flarePos = new THREE.Vector3();
let flareMarker = null;
let isAimingFlare = false;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const outlinePassZ = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
outlinePassZ.edgeStrength = 3.0;
outlinePassZ.edgeGlow = 0.0;
outlinePassZ.edgeThickness = 0.5;
outlinePassZ.visibleEdgeColor.set(0x000000); // Black for visible edge (invisible with additive blending)
outlinePassZ.hiddenEdgeColor.set(CONFIG.colors.zombie);
if (outlinePassZ.materialCopy) {
    outlinePassZ.materialCopy.blending = THREE.AdditiveBlending;
    outlinePassZ.materialCopy.transparent = true;
}
composer.addPass(outlinePassZ);

const outlinePassH = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
outlinePassH.edgeStrength = 3.0;
outlinePassH.edgeGlow = 0.0;
outlinePassH.edgeThickness = 0.5;
outlinePassH.visibleEdgeColor.set(0x000000);
outlinePassH.hiddenEdgeColor.set(CONFIG.colors.civilian);
if (outlinePassH.materialCopy) {
    outlinePassH.materialCopy.blending = THREE.AdditiveBlending;
    outlinePassH.materialCopy.transparent = true;
}
composer.addPass(outlinePassH);

const outlinePassS = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
outlinePassS.edgeStrength = 3.0;
outlinePassS.edgeGlow = 0.0;
outlinePassS.edgeThickness = 0.5;
outlinePassS.visibleEdgeColor.set(0x000000);
outlinePassS.hiddenEdgeColor.set(CONFIG.colors.soldier);
if (outlinePassS.materialCopy) {
    outlinePassS.materialCopy.blending = THREE.AdditiveBlending;
    outlinePassS.materialCopy.transparent = true;
}
composer.addPass(outlinePassS);

const outputPass = new OutputPass();
composer.addPass(outputPass);

let uiWidthForCamera = 0;

function resize() {
    let h = window.innerHeight;
    let w = h * (9 / 16);
    
    const gc = document.getElementById('game-container');
    if (gc) {
        gc.style.height = h + 'px';
        gc.style.width = w + 'px';
    }

    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = 9 / 16;
    camera.updateProjectionMatrix();

    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.left = `0px`;
    renderer.domElement.style.top = `0px`;
}
window.addEventListener('resize', resize);
resize();

let zombies = [];
let humans = [];
let soldiers = [];
let nextSoldierSpawnTime = 20.0;
let currentWave = 0;
let isFirstSolSpawn = true;
let debugMode = false;
let currentCount = 100;

window.getGameState = () => ({ 
    zombies: zombies.length, 
    humans: humans.length, 
    soldiers: soldiers.length, 
    isGameStarted,
    currentCount
});

let smoothedCenterX = 0;
let smoothedCenterZ = 0;
let smoothedSpread = 0;
let isFreeCamera = false;
let isTabOverview = false;
let savedCamState = null;
let freeCamX = 0;
let freeCamZ = 0;
let freeCamSpread = 30;

let droneCommand = {
    type: 'WANDER', // 'STOP', 'GATHER', 'GATHER_ALL', 'ATTACK', 'WANDER'
    position: null,
    target: null
};




function checkTypeLimit(candType, currentEntity, zombies, humans, soldiers, CONFIG) {
    let limit = CONFIG.units && CONFIG.units[candType] ? CONFIG.units[candType].max_active_count : undefined;
    if (limit === undefined) return true; // No limit
    
    let active = zombies.filter(z => z.type === candType).length;
    let pendingH = humans.filter(h => h !== currentEntity && h.infectionCandidate === candType && (h.isTransforming || h.infectionPending)).length;
    let pendingS = soldiers.filter(s => s !== currentEntity && s.infectionCandidate === candType && (s.isTransforming || s.infectionPending)).length;
    return (active + pendingH + pendingS) < limit;
}


function getValidSpawnPointWithLOS(px, pz, radius, maxDist, gridObj) {
    for (let r = 0; r <= maxDist; r += 0.5) {
        let angleSteps = r === 0 ? 1 : 8;
        for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / angleSteps) {
            let tx = px + Math.cos(a) * r;
            let tz = pz + Math.sin(a) * r;
            if (!gridObj.checkCollision(tx, tz, radius)) {
                if (r === 0 || gridObj.isLineOfSightClear(new THREE.Vector3(px, 0, pz), new THREE.Vector3(tx, 0, tz))) {
                    return {x: tx, z: tz};
                }
            }
        }
    }
    return null;
}

function getValidSpawnPoint(x, z) {
    let gNode = grid.worldToGrid(x, z);
    if (grid.isWalkable(gNode.gx, gNode.gz)) return {x, z};
    
    // Quick random search for a valid spot nearby
    for (let i = 0; i < 50; i++) {
        let tx = x + (Math.random() - 0.5) * 40;
        let tz = z + (Math.random() - 0.5) * 40;
        let tNode = grid.worldToGrid(tx, tz);
        if (grid.isWalkable(tNode.gx, tNode.gz)) return {x: tx, z: tz};
    }
    return {x, z}; // fallback, pushOutCollision will handle it
}

function resetGame(count) {
    if (sheetManager.applyPending()) {
        syncSheetToConfig(sheetManager.getConfig());
    }
    
    currentCount = count;
    isTabOverview = false;
    
    if (CONFIG.drone && playerDrone) {
        playerDrone.hp = CONFIG.drone.max_hp;
        playerDrone.regenTimer = 0;
    }
    
    flareCharge = 0;
    flareDuration = 0;
    flareState = 'charging';
    isAimingFlare = false;
    document.body.style.cursor = 'default';
    if (flareMarker) {
        scene.remove(flareMarker);
        flareMarker.geometry.dispose();
        flareMarker.material.dispose();
        flareMarker = null;
    }
    const flareButton = document.getElementById('flare-ui');
    if (flareButton) flareButton.style.borderColor = '#666';
    const flareProgress = document.getElementById('flare-progress');
    if (flareProgress) flareProgress.style.height = '0%';
    const flareText = document.getElementById('flare-text');
    if (flareText) flareText.textContent = '충전중';
    
    // Hide win/loss screen if exists
    const endScreen = document.getElementById('game-end-screen');
    if (endScreen) endScreen.style.display = 'none';
    
    zombies.forEach(z => { if (z.flashTimer) clearTimeout(z.flashTimer); z.destroy(); });
    zombies = [];
    humans.forEach(h => { if (h.flashTimer) clearTimeout(h.flashTimer); h.destroy(); });
    humans = [];
    soldiers.forEach(s => { if (s.flashTimer) clearTimeout(s.flashTimer); s.destroy(); });
    soldiers = [];
    if (playerDrone && playerDrone.flashTimer) clearTimeout(playerDrone.flashTimer);
    
    const configData = sheetManager.getConfig();
    const settings = configData ? configData.settings : {};
    
    playTime = 0;
    isGameStarted = false;
    gameOver = false;
    nextSoldierSpawnTime = settings.military_start_delay_s !== undefined ? settings.military_start_delay_s : 20.0;
    currentWave = 0;
    isFirstSolSpawn = true;
    document.getElementById('play-time-display').textContent = '00:00';
    
    const types = ['normal', 'fast', 'brute'];
    
    // start_zombie_count instead of passed count if we want to follow sheet exactly
    let startCount = settings.start_zombie_count !== undefined ? settings.start_zombie_count : count;
    currentCount = startCount;
    
    let cols = Math.ceil(Math.sqrt(startCount));
    let startX = - ((cols - 1) * 1.5) / 2;
    let startZ = - ((cols - 1) * 1.5) / 2; 
    
    let spawned = 0;
    for(let i=0; i<cols; i++) {
        for(let j=0; j<cols; j++) {
            if(spawned >= startCount) break;
            let type = types[spawned % types.length];
            let px = startX + i * 1.5;
            let pz = startZ + j * 1.5;
            let validP = getValidSpawnPoint(px, pz);
            zombies.push(new Zombie(scene, type, validP.x, validP.z));
            spawned++;
        }
    }
    
    // Spawn Civilians
    let civCount = settings.civilian_count !== undefined ? settings.civilian_count : 1200;
    for (let i = 0; i < civCount; i++) {
        let hx, hz;
        
        // Ensure the first 10-15 civilians spawn in an arc/trail near the center to guide zombies
        if (i < 15) {
            let angle = (i / 15) * Math.PI * 2;
            let dist = 25 + Math.random() * 10; // 25~35 units away
            hx = Math.cos(angle) * dist;
            hz = Math.sin(angle) * dist;
        } else {
            hx = (Math.random() - 0.5) * CONFIG.mapSize;
            hz = (Math.random() - 0.5) * CONFIG.mapSize;
            // Keep away from center (zombie spawn)
            if (Math.abs(hx) < 25 && Math.abs(hz) < 25) {
                hx += (hx > 0 ? 30 : -30);
                hz += (hz > 0 ? 30 : -30);
            }
        }
        let validH = getValidSpawnPoint(hx, hz);
        humans.push(new Human(scene, validH.x, validH.z));
    }
    
    smoothedCenterX = 0;
    smoothedCenterZ = 0;
    smoothedSpread = 0;
    isFreeCamera = false;
    let cm = document.getElementById('camera-mode');
    if (cm) cm.textContent = '자동 추적';

    let elZ = document.getElementById('hud-zombie-count');
    if (elZ) elZ.textContent = count;
    
    input.reset(); 
    document.getElementById('input-display').textContent = `(0.00, 0.00)`;
    
    outlinePassZ.selectedObjects = [zWalkerIMesh, zRunnerIMesh, zBruteIMesh];
    outlinePassH.selectedObjects = [hIMesh];
    outlinePassS.selectedObjects = [sIMesh];
}

// Old btn-reset removed here

document.getElementById('chk-debug').addEventListener('change', (e) => {
    debugMode = e.target.checked;
    gameMap.updateDebug(debugMode, grid);
});

const flareUI = document.getElementById('flare-ui');
if (flareUI) {
    flareUI.addEventListener('click', (e) => {
        if (flareState === 'ready' || flareState === 'charging' && flareCharge >= 15) {
            flareState = 'active';
            flareDuration = Math.min(Math.max(flareCharge / 15 * 3, 3), 10);
            flareCharge = 0;
            
            droneCommand = { type: 'FLARE_ACTIVE', position: null, target: null };
            
            flareUI.style.borderColor = '#666';
        }
    });
}

const scatterUI = document.getElementById('scatter-ui');
if (scatterUI) {
    scatterUI.addEventListener('click', (e) => {
        droneCommand = {
            type: 'SCATTER',
            position: null,
            target: null
        };
        if (isAimingFlare) {
            isAimingFlare = false;
            document.body.style.cursor = 'default';
            if (flareMarker) flareMarker.visible = false;
            const btn = document.getElementById('flare-ui');
            if (btn) btn.style.borderColor = '#666';
        }
    });
}


let cameraDistanceMultiplier = 2.3;
let cameraMaxHeight = 100;
let cameraAngleRatio = 0.6;
let cameraSpeedFollow = 0.0;
let cameraSpeedZoom = 0.0;

const savedSettings = localStorage.getItem('zombie_settings_v2');
if (savedSettings) {
    try {
        const s = JSON.parse(savedSettings);
        if (s.camDist !== undefined) document.getElementById('sl-cam-dist').value = s.camDist;
        if (s.camMax !== undefined) document.getElementById('sl-cam-max').value = s.camMax;
        if (s.camAngle !== undefined) document.getElementById('sl-cam-angle').value = s.camAngle;
        if (s.camSpeedFollow !== undefined) document.getElementById('sl-cam-speed-follow').value = s.camSpeedFollow;
        if (s.camSpeedZoom !== undefined) document.getElementById('sl-cam-speed-zoom').value = s.camSpeedZoom;
        if (s.bldgAmt !== undefined) document.getElementById('sl-bldg-amount').value = s.bldgAmt;
        if (s.bldgDen !== undefined) document.getElementById('sl-bldg-density').value = s.bldgDen;
        if (s.bldgHgt !== undefined) document.getElementById('sl-bldg-height').value = s.bldgHgt;
        if (s.bldgVar !== undefined) document.getElementById('sl-bldg-var').value = s.bldgVar;
        if (s.bldgRot !== undefined) document.getElementById('sl-bldg-rot').value = s.bldgRot;
        if (s.colMargin !== undefined) document.getElementById('sl-col-margin').value = s.colMargin;
        if (s.currentCount !== undefined) currentCount = s.currentCount;
        if (s.debugMode !== undefined) {
            debugMode = s.debugMode;
            let chk = document.getElementById('chk-debug');
            if (chk) chk.checked = debugMode;
        }
        if (s.autoZoomEnabled !== undefined) {
            let chk = document.getElementById('chk-cam-auto-zoom');
            if (chk) {
                chk.checked = s.autoZoomEnabled;
            }
        }
    } catch(e) {}
}

let isSettingsOpen = false;

let playTime = 0;
let isGameStarted = false;
let gameOver = false;
const playTimeDisplay = document.getElementById('play-time-display');

function showEndScreen(title, desc) {
    const endScreen = document.getElementById('game-end-screen');
    const titleEl = document.getElementById('game-end-title');
    const descEl = document.getElementById('game-end-desc');
    if (endScreen && titleEl && descEl) {
        titleEl.textContent = title;
        descEl.textContent = desc;
        endScreen.style.display = 'flex';
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

document.getElementById('btn-end-restart')?.addEventListener('click', () => {
    resetGame(currentCount);
});

document.getElementById('btn-restart-game').addEventListener('click', () => {
    isFreeCamera = false;
    let el = document.getElementById('camera-mode');
    if (el) el.textContent = '자동 추적';
    document.getElementById('btn-apply-map').click();
    resetGame(100);
});

document.getElementById('btn-reset-exp').addEventListener('click', () => {
    isFreeCamera = false;
    let el = document.getElementById('camera-mode');
    if (el) el.textContent = '자동 추적';
    document.getElementById('btn-apply-map').click();
    resetGame(currentCount);
});

const slCamDist = document.getElementById('sl-cam-dist');
const valCamDist = document.getElementById('val-cam-dist');
cameraDistanceMultiplier = parseFloat(slCamDist.value);
valCamDist.textContent = cameraDistanceMultiplier.toFixed(1);
slCamDist.addEventListener('input', (e) => {
    cameraDistanceMultiplier = parseFloat(e.target.value);
    valCamDist.textContent = cameraDistanceMultiplier.toFixed(1);
});

const slCamMax = document.getElementById('sl-cam-max');
const valCamMax = document.getElementById('val-cam-max');
cameraMaxHeight = parseInt(slCamMax.value);
valCamMax.textContent = cameraMaxHeight;
slCamMax.addEventListener('input', (e) => {
    cameraMaxHeight = parseInt(e.target.value);
    valCamMax.textContent = cameraMaxHeight;
});

const slCamAngle = document.getElementById('sl-cam-angle');
const valCamAngle = document.getElementById('val-cam-angle');
cameraAngleRatio = parseFloat(slCamAngle.value);
valCamAngle.textContent = cameraAngleRatio.toFixed(1);
slCamAngle.addEventListener('input', (e) => {
    cameraAngleRatio = parseFloat(e.target.value);
    valCamAngle.textContent = cameraAngleRatio.toFixed(1);
});

const slCamSpeedFollow = document.getElementById('sl-cam-speed-follow');
const valCamSpeedFollow = document.getElementById('val-cam-speed-follow');
cameraSpeedFollow = parseFloat(slCamSpeedFollow.value);
valCamSpeedFollow.textContent = cameraSpeedFollow.toFixed(1);
slCamSpeedFollow.addEventListener('input', (e) => {
    cameraSpeedFollow = parseFloat(e.target.value);
    valCamSpeedFollow.textContent = cameraSpeedFollow.toFixed(1);
});

const slCamSpeedZoom = document.getElementById('sl-cam-speed-zoom');
const valCamSpeedZoom = document.getElementById('val-cam-speed-zoom');
cameraSpeedZoom = (parseInt(slCamSpeedZoom.value) - 5.5) / 4.5;
valCamSpeedZoom.textContent = slCamSpeedZoom.value;
slCamSpeedZoom.addEventListener('input', (e) => {
    cameraSpeedZoom = (parseInt(e.target.value) - 5.5) / 4.5;
    valCamSpeedZoom.textContent = e.target.value;
});



let autoZoomEnabled = document.getElementById('chk-cam-auto-zoom').checked;
document.getElementById('chk-cam-auto-zoom').addEventListener('change', (e) => {
    autoZoomEnabled = e.target.checked;
});

document.getElementById('btn-cam-reset').addEventListener('click', () => {
    document.getElementById('sl-cam-dist').value = 1.0;
    document.getElementById('sl-cam-dist').dispatchEvent(new Event('input'));
    document.getElementById('sl-cam-angle').value = 0.6;
    document.getElementById('sl-cam-angle').dispatchEvent(new Event('input'));
    document.getElementById('sl-cam-speed-follow').value = 0.0;
    document.getElementById('sl-cam-speed-follow').dispatchEvent(new Event('input'));
    document.getElementById('chk-cam-auto-zoom').checked = true;
    document.getElementById('chk-cam-auto-zoom').dispatchEvent(new Event('change'));
    
    document.getElementById('sl-cam-max').value = 100;
    document.getElementById('sl-cam-max').dispatchEvent(new Event('input'));
    document.getElementById('sl-cam-speed-zoom').value = 5;
    document.getElementById('sl-cam-speed-zoom').dispatchEvent(new Event('input'));
    
    if (document.getElementById('inp-cam-drag-speed')) {
        document.getElementById('inp-cam-drag-speed').value = 3;
        document.getElementById('inp-cam-drag-speed').dispatchEvent(new Event('input'));
    }
});

const slBldgAmt = document.getElementById('sl-bldg-amount');
const slBldgDen = document.getElementById('sl-bldg-density');
const slBldgHgt = document.getElementById('sl-bldg-height');
const slBldgVar = document.getElementById('sl-bldg-var');
const slBldgRot = document.getElementById('sl-bldg-rot');
const slColMargin = document.getElementById('sl-col-margin');

const valBldgAmt = document.getElementById('val-bldg-amount');
const valBldgDen = document.getElementById('val-bldg-density');
const valBldgHgt = document.getElementById('val-bldg-height');
const valBldgVar = document.getElementById('val-bldg-var');
const valBldgRot = document.getElementById('val-bldg-rot');
const valColMargin = document.getElementById('val-col-margin');

valBldgAmt.textContent = slBldgAmt.value;
valBldgDen.textContent = slBldgDen.value;
valBldgHgt.textContent = slBldgHgt.value;
valBldgVar.textContent = slBldgVar.value;
valBldgRot.textContent = slBldgRot.value;
valColMargin.textContent = slColMargin.value;

slBldgAmt.addEventListener('input', (e) => valBldgAmt.textContent = e.target.value);
slBldgDen.addEventListener('input', (e) => valBldgDen.textContent = e.target.value);
slBldgHgt.addEventListener('input', (e) => valBldgHgt.textContent = e.target.value);
slBldgVar.addEventListener('input', (e) => valBldgVar.textContent = e.target.value);
slBldgRot.addEventListener('input', (e) => valBldgRot.textContent = e.target.value);
slColMargin.addEventListener('input', (e) => valColMargin.textContent = e.target.value);


document.getElementById('btn-save-settings').addEventListener('click', () => {
    const s = {
        camDist: document.getElementById('sl-cam-dist').value,
        camMax: document.getElementById('sl-cam-max').value,
        camAngle: document.getElementById('sl-cam-angle').value,
        camSpeedFollow: document.getElementById('sl-cam-speed-follow').value,
        camSpeedZoom: document.getElementById('sl-cam-speed-zoom').value,
        bldgAmt: document.getElementById('sl-bldg-amount').value,
        bldgDen: document.getElementById('sl-bldg-density').value,
        bldgHgt: document.getElementById('sl-bldg-height').value,
        bldgVar: document.getElementById('sl-bldg-var').value,
        bldgRot: document.getElementById('sl-bldg-rot').value,
        colMargin: document.getElementById('sl-col-margin').value,
        currentCount: currentCount,
        debugMode: debugMode,
        autoZoomEnabled: document.getElementById('chk-cam-auto-zoom') ? document.getElementById('chk-cam-auto-zoom').checked : true
    };
    localStorage.setItem('zombie_settings_v2', JSON.stringify(s));
    alert('설정이 성공적으로 저장되었습니다!');
});

document.getElementById('btn-apply-map').addEventListener('click', () => {
    const amt = parseInt(slBldgAmt.value);
    const den = parseFloat(slBldgDen.value);
    const hgt = parseInt(slBldgHgt.value);
    const vr = parseFloat(slBldgVar.value);
    const rot = parseFloat(slBldgRot.value);
    const margin = parseFloat(slColMargin.value);
    
    generateBuildings(amt, den, hgt, vr, rot);
    gameMap.rebuildBuildings();
    grid.buildGrid(margin);
    
    if(debugMode) {
        gameMap.updateDebug(false, grid);
        gameMap.updateDebug(true, grid);
    }
});

// Trigger initial generation based on loaded settings and spawn initial zombies
document.getElementById('btn-reset-exp').click();

const minimapCanvas = document.getElementById('minimap');
const mmCtx = minimapCanvas.getContext('2d');

function drawMinimap() {
    mmCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    
    const scale = minimapCanvas.width / CONFIG.mapSize;
    const offset = CONFIG.mapSize / 2;

    mmCtx.strokeStyle = '#555';
    mmCtx.strokeRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    mmCtx.fillStyle = '#888';
    CONFIG.buildings.forEach(b => {
        const x = (b.x - b.width/2 + offset) * scale;
        const z = (b.z - b.depth/2 + offset) * scale;
        
        // draw rotated box on minimap? (Too complex for simple minimap, just draw AABB)
        const cos = Math.cos(b.rotY || 0), sin = Math.sin(b.rotY || 0);
        const obbW = Math.abs(b.width * cos) + Math.abs(b.depth * sin);
        const obbD = Math.abs(b.width * sin) + Math.abs(b.depth * cos);

        const w = obbW * scale;
        const h = obbD * scale;
        mmCtx.fillRect(x - (obbW-b.width)/2 * scale, z - (obbD-b.depth)/2 * scale, w, h);
    });

    mmCtx.fillStyle = '#87CEEB';
    humans.forEach(h => {
        const x = (h.mesh.position.x + offset) * scale;
        const zPos = (h.mesh.position.z + offset) * scale;
        mmCtx.beginPath();
        mmCtx.arc(x, zPos, 1.5, 0, Math.PI*2);
        mmCtx.fill();
    });

    mmCtx.fillStyle = '#4CAF50';
    soldiers.forEach(s => {
        const x = (s.mesh.position.x + offset) * scale;
        const zPos = (s.mesh.position.z + offset) * scale;
        mmCtx.beginPath();
        mmCtx.arc(x, zPos, 1.5, 0, Math.PI*2);
        mmCtx.fill();
    });

    mmCtx.fillStyle = '#FF0000';
    zombies.forEach(z => {
        const x = (z.mesh.position.x + offset) * scale;
        const zPos = (z.mesh.position.z + offset) * scale;
        mmCtx.beginPath();
        mmCtx.arc(x, zPos, 2, 0, Math.PI*2);
        mmCtx.fill();
    });
    
    document.getElementById('minimap-zombies').textContent = zombies.length;
    document.getElementById('minimap-humans').textContent = humans.length;
    document.getElementById('minimap-soldiers').textContent = soldiers.length;

    // Draw camera frustum on the minimap
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const corners = [
        new THREE.Vector2(-1, 1),
        new THREE.Vector2(1, 1),
        new THREE.Vector2(1, -1),
        new THREE.Vector2(-1, -1)
    ];
    
    let pts = [];
    corners.forEach(c => {
        raycaster.setFromCamera(c, camera);
        const target = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(groundPlane, target)) {
            const cx = (target.x + offset) * scale;
            const cz = (target.z + offset) * scale;
            pts.push({x: cx, z: cz});
        }
    });

    if (pts.length === 4) {
        mmCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        mmCtx.lineWidth = 1;
        mmCtx.beginPath();
        mmCtx.moveTo(pts[0].x, pts[0].z);
        mmCtx.lineTo(pts[1].x, pts[1].z);
        mmCtx.lineTo(pts[2].x, pts[2].z);
        mmCtx.lineTo(pts[3].x, pts[3].z);
        mmCtx.closePath();
        mmCtx.stroke();
    }
}

const clock = new THREE.Clock();
let frameCount = 0;
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    
    if (document.hidden) {
        clock.getDelta(); // absorb time
        return;
    }
    
    let dt = clock.getDelta();
    if(dt > 0.1) dt = 0.1; 
    
    if (isSettingsOpen) {
        dt = 0; // Pause simulation, but allow camera/render
    } 
    
    if (!isSettingsOpen && !isGameStarted && (input.direction.x !== 0 || input.direction.z !== 0)) {
        isGameStarted = true;
    }
    
    let cdEl = document.getElementById('countdown-display');
    if (cdEl) {
        if (!isGameStarted) {
            cdEl.textContent = "방향키(W,A,S,D)를 눌러 군단을 이동시키면 시작됩니다";
            cdEl.style.color = '#ffff44';
            cdEl.style.fontWeight = 'bold';
            cdEl.style.transform = 'translateX(-50%) scale(1)';
        } else {
            let timeRemaining = nextSoldierSpawnTime - playTime;
            if (isFirstSolSpawn) {
                cdEl.textContent = `군대 진입까지: ${Math.max(0, Math.ceil(timeRemaining))}초`;
                if (timeRemaining <= 5.0) {
                    cdEl.style.color = '#ff3333';
                    cdEl.style.fontWeight = 'bold';
                    cdEl.style.transform = 'translateX(-50%) scale(1.2)';
                } else {
                    cdEl.style.color = 'white';
                    cdEl.style.fontWeight = 'normal';
                    cdEl.style.transform = 'translateX(-50%) scale(1)';
                }
            } else {
                cdEl.textContent = `다음 증원까지: ${Math.max(0, Math.ceil(timeRemaining))}초`;
                cdEl.style.color = 'white';
                cdEl.style.fontWeight = 'normal';
                cdEl.style.transform = 'translateX(-50%) scale(0.8)';
            }
        }
    }

    if (isGameStarted && !isSettingsOpen && !gameOver) {
        let configData = sheetManager.getConfig();
        let settings = configData ? configData.settings : {};
        let maxWaves = settings.wave_count !== undefined ? settings.wave_count : 3;

        playTime += dt;
        
        // Flare Logic
        if (flareState === 'charging' || flareState === 'ready') {
            flareCharge += dt;
            if (flareCharge >= 15 && flareState === 'charging') {
                flareState = 'ready';
            }
            if (flareCharge > 30) flareCharge = 30; // Max charge 30s
            
            const p = (flareCharge / 15) * 100;
            const ui = document.getElementById('flare-progress');
            const txt = document.getElementById('flare-text');
            if (ui && txt) {
                ui.style.height = `${Math.min(p, 100)}%`;
                if (flareCharge >= 15) {
                    ui.style.background = `rgba(255, ${Math.max(0, 255 - (flareCharge-15)/15*255)}, 0, 0.6)`;
                    txt.textContent = 'READY';
                } else {
                    ui.style.background = 'rgba(255, 87, 34, 0.5)';
                    txt.textContent = `${Math.ceil(15 - flareCharge)}s`;
                }
            }
        } else if (flareState === 'active') {
            flareDuration -= dt;
            if (flareDuration <= 0) {
                flareState = 'charging';
                flareCharge = 0;
                if (flareMarker) {
                    scene.remove(flareMarker);
                    flareMarker.geometry.dispose();
                    flareMarker.material.dispose();
                    flareMarker = null;
                }
                const ui = document.getElementById('flare-progress');
                const txt = document.getElementById('flare-text');
                if (ui) ui.style.height = '0%';
                if (txt) txt.textContent = '0s';
                
                // Revert to WANDER if they were still gathering
                if (droneCommand.type === 'GATHER_ALL' || droneCommand.type === 'FLARE_ACTIVE') {
                    droneCommand = { type: 'WANDER', position: null, target: null };
                }
            } else {
                const ui = document.getElementById('flare-progress');
                const txt = document.getElementById('flare-text');
                if (ui && txt) {
                    ui.style.height = '100%';
                    ui.style.background = 'rgba(50, 150, 255, 0.6)'; // Blue for active
                    txt.textContent = `${flareDuration.toFixed(1)}s`;
                }
            }
        }
        
        if (playTimeDisplay) {
            const formatted = formatTime(playTime);
            if (playTimeDisplay.textContent !== formatted) {
                playTimeDisplay.textContent = formatted;
            }
        }
        
        // Spawn soldiers periodically
        let solInterval = settings.wave_interval_s !== undefined ? settings.wave_interval_s : 40.0;
        let solCount = settings.soldiers_per_wave !== undefined ? settings.soldiers_per_wave : 4;
        
        if (playTime >= nextSoldierSpawnTime && currentWave < maxWaves) {
            nextSoldierSpawnTime = playTime + solInterval;
            currentWave++;
            isFirstSolSpawn = false;
            // Spawn a squad at a random edge
            const edge = Math.floor(Math.random() * 4);
            const edgeDist = CONFIG.mapSize / 2 - 5;
            for(let i=0; i<solCount; i++) {
                let sx = 0, sz = 0;
                let offset = (Math.random() - 0.5) * 20;
                if (edge === 0) { sx = edgeDist; sz = offset; }
                else if (edge === 1) { sx = -edgeDist; sz = offset; }
                else if (edge === 2) { sx = offset; sz = edgeDist; }
                else { sx = offset; sz = -edgeDist; }
                let validS = getValidSpawnPoint(sx, sz);
                soldiers.push(new Soldier(scene, validS.x, validS.z));
            }
        }
    }
    
    frameCount++;
    let now = performance.now();
    if (now - lastTime >= 1000) {
        document.getElementById('fps-display').textContent = frameCount;
        frameCount = 0;
        lastTime = now;
    }

    entityGrid.clear();
    for (let i = 0; i < zombies.length; i++) entityGrid.insert(zombies[i]);
    for (let i = 0; i < humans.length; i++) entityGrid.insert(humans[i]);
    for (let i = 0; i < soldiers.length; i++) entityGrid.insert(soldiers[i]);

    if (!isSettingsOpen) {
        humans.forEach(h => { 
            h.update(dt, grid, entityGrid); 
            grid.pushOutCollision(h, dt); 
            
            // Infection bite logic (Infector persistence)
            let zCol = h.infectorZombie ? (h.infectorZombie.colRadius || 0.5) : 0.5;
            let targetCol = h.colRadius || 0.5;
            let BITE_DIST_SQ = (targetCol + zCol + 0.2) * (targetCol + zCol + 0.2); // 0.2 tolerance
            let GRACE_PERIOD = h.infectorZombie ? (h.infectorZombie.infectionBreakGraceS !== undefined ? h.infectorZombie.infectionBreakGraceS : 0.2) : 0.2;
            
            if (h.infectorZombie) {
                if (h.infectorZombie.hp <= 0 || h.infectorZombie.mesh.position.distanceToSquared(h.mesh.position) > BITE_DIST_SQ || !grid.isLineOfSightClear(h.mesh.position, h.infectorZombie.mesh.position)) {
                    if (h.infectGraceTimer === undefined) h.infectGraceTimer = 0;
                    h.infectGraceTimer += dt;
                    if (h.infectGraceTimer > GRACE_PERIOD || h.infectorZombie.hp <= 0) {
                        h.infectorZombie = null;
                        h.biteTimer = 0;
                        h.isBeingBitten = false;
                        h.infectionPending = false;
                    }
                } else {
                    h.infectGraceTimer = 0;
                }
            }
            
            if (!h.infectorZombie && !h.isTransforming && !h.infectionPending) {
                for(let z of zombies) {
                    let dzCol = z.colRadius || 0.5;
                    let distSq = (targetCol + dzCol + 0.2) * (targetCol + dzCol + 0.2);
                    if (z.hp > 0 && z.mesh.position.distanceToSquared(h.mesh.position) <= distSq) {
                        if (grid.isLineOfSightClear(h.mesh.position, z.mesh.position)) {
                            h.infectorZombie = z;
                            h.biteTimer = 0;
                            h.infectGraceTimer = 0;
                            break;
                        }
                    }
                }
            }
            
            if (h.infectorZombie) {
                h.isBeingBitten = true;
                if (h.infectGraceTimer === 0 || h.infectGraceTimer === undefined) {
                    if (!h.infectionPending) h.biteTimer += dt;
                }
                
                let reqTime = h.infectorZombie.infectTime || 2.0;


                if (!h.infectionPending && h.biteTimer >= reqTime && !h.isTransforming) {
                    let successChance = (h.infectorZombie.infectionChance !== undefined ? h.infectorZombie.infectionChance : 1.0) * (1.0 - (h.infectResist !== undefined ? h.infectResist : 0.0));
                    if (Math.random() < successChance) {
                        h.infectionPending = true;
                        if (!h.infectionCandidate) {
                            const roster = CONFIG.settings?.spawn_roster ? String(CONFIG.settings.spawn_roster).split(';').map(s=>s.trim()) : ['z_walker'];
                            const unlocked = CONFIG.settings?.initial_unlocked_zombie_ids ? String(CONFIG.settings.initial_unlocked_zombie_ids).split(';').map(s=>s.trim()) : ['z_walker', 'z_runner', 'z_brute'];
                            const validTypes = roster.filter(t => unlocked.includes(t));
                            h.infectionCandidate = validTypes.length > 0 ? validTypes[Math.floor(Math.random() * validTypes.length)] : 'z_walker';
                        }
                    } else {
                        h.biteTimer = 0;
                    }
                }

                if (h.infectionPending && !h.isTransforming) {
                    let max_z = CONFIG.settings?.max_zombies !== undefined ? CONFIG.settings.max_zombies : 100;
                    
                    let globalCapOk = (zombies.length + humans.filter(hu => hu !== h && (hu.isTransforming || hu.infectionPending)).length + soldiers.filter(su => su.isTransforming || su.infectionPending).length) < max_z;
                    let typeCapOk = checkTypeLimit(h.infectionCandidate, h, zombies, humans, soldiers, CONFIG);

                    if (globalCapOk && typeCapOk) {
                        let candCol = CONFIG.units && h.infectionCandidate && CONFIG.units[h.infectionCandidate] ? (CONFIG.units[h.infectionCandidate].col_radius || 0.5) : 0.5;
                        let maxDist = CONFIG.settings?.placement_search_radius_m !== undefined ? CONFIG.settings.placement_search_radius_m : 5;
                        let spawnPos = getValidSpawnPointWithLOS(h.mesh.position.x, h.mesh.position.z, candCol, maxDist, grid);
                        if (spawnPos) {
                            h.isTransforming = true;
                            h.transformTimer = 5.0; 
                            soundManager.playScream();
                            h.infectorZombie = null;
                            h.infectionPending = false;
                            h.infectionConfirmed = false;
                            h.spaceWaitTimer = 0;
                        } else {
                            if (h.spaceWaitTimer === undefined) h.spaceWaitTimer = 0;
                            h.spaceWaitTimer += dt;
                            let waitTimeout = CONFIG.settings?.placement_wait_timeout_s !== undefined ? CONFIG.settings.placement_wait_timeout_s : 5;
                            if (h.spaceWaitTimer > waitTimeout) {
                                h.infectionPending = false;
                                h.infectionConfirmed = false;
                                h.spaceWaitTimer = 0;
                                h.biteTimer = 0;
                                h.infectorZombie = null;
                                h.infectionBlocked = true;
                            }
                        }
                    } else {
                        // Global or type cap not OK. We wait for slot. Do NOT increment spaceWaitTimer.
                    }
                }


            }
        });
        
        // Handle civilian transformations
        for (let i = humans.length - 1; i >= 0; i--) {
            let h = humans[i];
            if (h.isTransforming && h.transformTimer <= 0) {
                h.destroy();
                humans.splice(i, 1);
                const types = ['normal', 'fast', 'brute'];
                const type = types[Math.floor(Math.random() * types.length)];
                zombies.push(new Zombie(scene, type, h.mesh.position.x, h.mesh.position.z));
            }
        }
        
        if (Math.random() < 0.005 * dt * zombies.length) {
            soundManager.playZombieGroan();
        }

        soldiers.forEach(s => { 
            s.update(dt, grid, entityGrid, playerDrone); 
            grid.pushOutCollision(s, dt); 
            
            // Soldier infection bite logic (Infector persistence)
            let zCol = s.infectorZombie ? (s.infectorZombie.colRadius || 0.5) : 0.5;
            let targetCol = s.colRadius || 0.5;
            let BITE_DIST_SQ = (targetCol + zCol + 0.2) * (targetCol + zCol + 0.2); // 0.2 tolerance
            let GRACE_PERIOD = s.infectorZombie ? (s.infectorZombie.infectionBreakGraceS !== undefined ? s.infectorZombie.infectionBreakGraceS : 0.2) : 0.2;
            
            if (s.infectorZombie) {
                if (s.infectorZombie.hp <= 0 || s.infectorZombie.mesh.position.distanceToSquared(s.mesh.position) > BITE_DIST_SQ || !grid.isLineOfSightClear(s.mesh.position, s.infectorZombie.mesh.position)) {
                    if (s.infectGraceTimer === undefined) s.infectGraceTimer = 0;
                    s.infectGraceTimer += dt;
                    if (s.infectGraceTimer > GRACE_PERIOD || s.infectorZombie.hp <= 0) {
                        s.infectorZombie = null;
                        s.biteTimer = 0;
                        s.isBeingBitten = false;
                        s.infectionPending = false;
                    }
                } else {
                    s.infectGraceTimer = 0;
                }
            }
            
            if (!s.infectorZombie && s.hp > 0 && !s.infectionPending) {
                for(let z of zombies) {
                    let dzCol = z.colRadius || 0.5;
                    let distSq = (targetCol + dzCol + 0.2) * (targetCol + dzCol + 0.2);
                    if (z.hp > 0 && z.mesh.position.distanceToSquared(s.mesh.position) <= distSq) {
                        if (grid.isLineOfSightClear(s.mesh.position, z.mesh.position)) {
                            s.infectorZombie = z;
                            s.biteTimer = 0;
                            s.infectGraceTimer = 0;
                            break;
                        }
                    }
                }
            }
            
            if (s.infectorZombie) {
                s.isBeingBitten = true;
                if (s.infectGraceTimer === 0 || s.infectGraceTimer === undefined) {
                    if (!s.infectionPending) s.biteTimer += dt;
                }
                
                let reqTime = s.infectorZombie.infectTime || 2.0;
                if (s.infectionPending) {
                    if (zombies.length < (CONFIG.settings?.max_zombies !== undefined ? CONFIG.settings.max_zombies : 100)) {
                        s.hp = 0; // Kills soldier instantly
                        s.infectorZombie = null;
                        s.infectionPending = false;
                    }
                } else if (s.biteTimer >= reqTime && s.hp > 0) {
                    let successChance = (s.infectorZombie.infectionChance !== undefined ? s.infectorZombie.infectionChance : 1.0) * (1.0 - (s.infectResist !== undefined ? s.infectResist : 0.0));
                    if (Math.random() < successChance) {
                        s.infectionPending = true;
                        if (zombies.length < (CONFIG.settings?.max_zombies !== undefined ? CONFIG.settings.max_zombies : 100)) {
                            s.hp = 0; // Kills soldier instantly
                            s.infectorZombie = null;
                            s.infectionPending = false;
                        }
                    } else {
                        s.biteTimer = 0; // Reset progress on failure
                    }
                }
            }
        });
        let dx = isFreeCamera ? freeCamX : smoothedCenterX;
        let dz = isFreeCamera ? freeCamZ : smoothedCenterZ;
        let dronePos = new THREE.Vector3(dx, 0, dz);
        let isMoving = (input.direction.x !== 0 || input.direction.z !== 0);
        let currentRadius = (flareState === 'active') ? 9999 : CONFIG.stats.zombie.droneRadius;
        let currentOpacity = (flareState === 'active') ? 30 : CONFIG.stats.zombie.droneOpacity;
        playerDrone.update(dt, dronePos.x, dronePos.z, isMoving, currentRadius, currentOpacity);
        
        // Drone HP Regeneration
        if (CONFIG.drone && playerDrone.hp !== undefined && playerDrone.hp > 0 && playerDrone.hp < CONFIG.drone.max_hp) {
            if (playerDrone.regenTimer === undefined) playerDrone.regenTimer = 0;
            playerDrone.regenTimer += dt;
            
            if (CONFIG.drone.hp_regen_per_s > 0 && playerDrone.regenTimer >= CONFIG.drone.regen_delay_s) {
                playerDrone.hp += CONFIG.drone.hp_regen_per_s * dt;
                if (playerDrone.hp > CONFIG.drone.max_hp) playerDrone.hp = CONFIG.drone.max_hp;
            }
        }
        zombies.forEach(z => { z.update(dt, droneCommand, dronePos, grid, entityGrid, debugMode); grid.pushOutCollision(z, dt); });
    // Handle Interactions
    for (let i = zombies.length - 1; i >= 0; i--) {
        let z = zombies[i];
        if (z.hp <= 0) {
            soundManager.playZombieDeath();
            z.destroy();
            zombies.splice(i, 1);
            continue;
        }

        // Zombie vs Human (Instant infection removed - now handled via 1.5s bite timer above)

        // Zombie vs Soldier (Infection/Damage)
        for (let j = soldiers.length - 1; j >= 0; j--) {
            let s = soldiers[j];
            if (z.mesh.position.distanceToSquared(s.mesh.position) < 3.0) {
                s.hp -= z.attack * dt * 5.0; // 5x damage multiplier so they get infected quickly when caught
                
                if (s.mesh && s.mesh.material) {
                    let orig = s.origEmissive || s.mesh.material.emissive.getHex();
                    s.origEmissive = orig;
                    s.mesh.material.emissive.setHex(0xffffff);
                    if (s.flashTimer) clearTimeout(s.flashTimer);
                    s.flashTimer = setTimeout(() => {
                        if (s.mesh && s.mesh.material) s.mesh.material.emissive.setHex(orig);
                    }, 100);
                }

                    if (s.hp <= 0) {
                        s.destroy();
                        soldiers.splice(j, 1);
                    }
                }
            }
        }
        // Check Win/Loss conditions at the end of the frame
        let activeZombies = zombies.filter(z => z.hp > 0).length;
        let activeSoldiers = soldiers.filter(s => s.hp > 0).length;
        let pendingSolCount = typeof pendingSoldiers !== 'undefined' ? pendingSoldiers : 0;
        
        let isLoss = (activeZombies === 0) || (CONFIG.drone && playerDrone && playerDrone.hp <= 0);
        // Playtime > 1.0 removed. Now we just check if the first wave actually started.
        let configDataLocal = sheetManager.getConfig();
        let maxWavesLocal = (configDataLocal && configDataLocal.settings && configDataLocal.settings.wave_count !== undefined) ? configDataLocal.settings.wave_count : 3;
        let isWin = (currentWave >= maxWavesLocal) && (activeSoldiers === 0) && (pendingSolCount === 0) && isGameStarted && !isFirstSolSpawn;

        if (isLoss) {
            gameOver = true;
            showEndScreen('패배', '좀비 군단이 전멸했습니다.');
        } else if (isWin) {
            gameOver = true;
            showEndScreen('승리', '모든 군대를 처치했습니다.');
        }
    } // End if (!isSettingsOpen)

    outlinePassZ.selectedObjects = [zWalkerIMesh, zRunnerIMesh, zBruteIMesh];
    outlinePassH.selectedObjects = [hIMesh];
    outlinePassS.selectedObjects = [sIMesh];
    
    // Update HUD Stats
    let elZ = document.getElementById('hud-zombie-count');
    if (elZ) elZ.textContent = zombies.length;
    let elH = document.getElementById('hud-human-count');
    if (elH) elH.textContent = humans.length;
    let elS = document.getElementById('hud-soldier-count');
    if (elS) elS.textContent = soldiers.length;
    let elInp = document.getElementById('input-display');
    if (elInp) elInp.textContent = input.isStopped ? `(${input.direction.x.toFixed(2)}, ${input.direction.z.toFixed(2)}) 정지됨` : `(${input.direction.x.toFixed(2)}, ${input.direction.z.toFixed(2)})`;

    let bestCx = 0;
    let bestCz = 0;
    let maxSpread = 0;
    
    if (zombies.length > 0) {
        let binSize = 15;
        let bins = {};
        zombies.forEach(z => {
            let bx = Math.floor(z.mesh.position.x / binSize);
            let bz = Math.floor(z.mesh.position.z / binSize);
            let key = `${bx},${bz}`;
            if(!bins[key]) bins[key] = {count: 0, sumX: 0, sumZ: 0, zombies: []};
            bins[key].count++;
            bins[key].sumX += z.mesh.position.x;
            bins[key].sumZ += z.mesh.position.z;
            bins[key].zombies.push(z);
        });
        
        let maxCount = -1;
        let bestBinKey = null;
        for (let key in bins) {
            if (bins[key].count > maxCount) {
                maxCount = bins[key].count;
                bestBinKey = key;
            }
        }
        
        let parts = bestBinKey.split(',');
        let bestBx = parseInt(parts[0]);
        let bestBz = parseInt(parts[1]);
        
        let clusterZombies = [];
        let cSumX = 0;
        let cSumZ = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                let k = `${bestBx+dx},${bestBz+dz}`;
                if (bins[k]) {
                    clusterZombies.push(...bins[k].zombies);
                    cSumX += bins[k].sumX;
                    cSumZ += bins[k].sumZ;
                }
            }
        }
        
        bestCx = cSumX / clusterZombies.length;
        bestCz = cSumZ / clusterZombies.length;
        
        clusterZombies.forEach(z => {
            const dx = z.mesh.position.x - bestCx;
            const dz = z.mesh.position.z - bestCz;
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (dist > maxSpread) maxSpread = dist;
        });
        
        if (maxSpread > 50) maxSpread = 50;
        if (maxSpread < 15) maxSpread = 15;
        
        // Add forward vision
        let followLerp = 1.0;
        let leadAmount = 0;
        let normFollow = cameraSpeedFollow / 100.0;
        
        if (normFollow < 0) {
            followLerp = 0.2 * Math.pow(10, normFollow * 1.3);
        } else if (normFollow === 0) {
            followLerp = 1.0;
        } else {
            followLerp = 0.1;
            leadAmount = normFollow * 40;
        }

        if (!input.isStopped) {
            bestCx += input.direction.x * leadAmount;
            bestCz += input.direction.z * leadAmount;
        }
        
        let zoomLerp = autoZoomEnabled ? 0.05 * Math.pow(10, cameraSpeedZoom * 2.0) : 0;
        if (zoomLerp > 1.0) zoomLerp = 1.0;
        
        if (!isFreeCamera && !isTabOverview) {
            smoothedCenterX += (bestCx - smoothedCenterX) * followLerp;
            smoothedCenterZ += (bestCz - smoothedCenterZ) * followLerp;
            smoothedSpread += (maxSpread - smoothedSpread) * zoomLerp;
        }
    }

    if (input.isActive) {
        if (!isFreeCamera && !isTabOverview) {
            freeCamX = smoothedCenterX;
            freeCamZ = smoothedCenterZ;
            freeCamSpread = smoothedSpread;
            isFreeCamera = true;
            let el = document.getElementById('camera-mode');
            if (el) el.textContent = '드론 시점 (F로 복귀)';
        }
        let speed = (30 + freeCamSpread * 2.5) * (CONFIG.droneSpeed !== undefined ? (CONFIG.droneSpeed / 12.0) : 0.5) * dt;
        freeCamX += input.direction.x * speed;
        freeCamZ += input.direction.z * speed;
    }

    let finalCx = smoothedCenterX;
    let finalCz = smoothedCenterZ;
    let finalSpread = smoothedSpread;

    if (isTabOverview) {
        finalCx = 0;
        finalCz = 0;
        finalSpread = 150;
    } else if (isFreeCamera) {
        finalCx = freeCamX;
        finalCz = freeCamZ;
        finalSpread = freeCamSpread;
    }

    let targetHeight = (30 + finalSpread * 2.5) * cameraDistanceMultiplier;
    let actualMaxHeight = cameraMaxHeight * Math.max(1.0, cameraDistanceMultiplier);
    if (targetHeight > actualMaxHeight) {
        targetHeight = actualMaxHeight;
    }
    
    // Center the camera exactly on the targets
    let uiOffsetWorldX = 0;
    
    const baseZOffset = targetHeight * 0.7;
    const targetZOffset = baseZOffset * (1.0 - cameraAngleRatio);

    camera.position.x = finalCx + uiOffsetWorldX;
    camera.position.y = targetHeight;
    camera.position.z = finalCz + targetZOffset;

    // --- Camera occlusion handling (Disabled by request) ---
    if (gameMap.buildingMeshes && gameMap.buildingMeshes.length > 0) {
        // Reset any leftover building opacity just in case
        gameMap.buildingMeshes.forEach(mesh => {
            if (mesh.material.opacity !== 1.0) {
                mesh.material.opacity = 1.0;
                mesh.material.transparent = false;
            }
        });
    }

    camera.lookAt(finalCx + uiOffsetWorldX, 0, finalCz);

    drawMinimap();

    let walkerCount = 0;
    let runnerCount = 0;
    let bruteCount = 0;

    for (let i = 0; i < zombies.length; i++) {
        let z = zombies[i];
        dummy.position.copy(z.mesh.position);
        
        if (z.type === 'brute') {
            dummy.position.y = 1.5; // Brute is taller (height 3)
        } else if (z.type === 'fast') {
            dummy.position.y = 0.5; // Octahedron is smaller
        }
        
        dummy.quaternion.copy(z.mesh.quaternion);
        dummy.updateMatrix();
        
        dummyColor.setHex(CONFIG.colors.zombie);

        if (z.type === 'normal' || !z.type) {
            zWalkerIMesh.setMatrixAt(walkerCount, dummy.matrix);
            zWalkerIMesh.setColorAt(walkerCount, dummyColor);
            walkerCount++;
        } else if (z.type === 'fast') {
            zRunnerIMesh.setMatrixAt(runnerCount, dummy.matrix);
            zRunnerIMesh.setColorAt(runnerCount, dummyColor);
            runnerCount++;
        } else if (z.type === 'brute') {
            zBruteIMesh.setMatrixAt(bruteCount, dummy.matrix);
            zBruteIMesh.setColorAt(bruteCount, dummyColor);
            bruteCount++;
        }
    }

    zWalkerIMesh.count = walkerCount;
    zWalkerIMesh.instanceMatrix.needsUpdate = true;
    if (zWalkerIMesh.instanceColor) zWalkerIMesh.instanceColor.needsUpdate = true;

    zRunnerIMesh.count = runnerCount;
    zRunnerIMesh.instanceMatrix.needsUpdate = true;
    if (zRunnerIMesh.instanceColor) zRunnerIMesh.instanceColor.needsUpdate = true;

    zBruteIMesh.count = bruteCount;
    zBruteIMesh.instanceMatrix.needsUpdate = true;
    if (zBruteIMesh.instanceColor) zBruteIMesh.instanceColor.needsUpdate = true;

    hIMesh.count = humans.length;
    for (let i = 0; i < humans.length; i++) {
        let h = humans[i];
        dummy.position.copy(h.mesh.position);
        dummy.quaternion.copy(h.mesh.quaternion);
        dummy.updateMatrix();
        hIMesh.setMatrixAt(i, dummy.matrix);
        hIMesh.setColorAt(i, h.color);
    }
    hIMesh.instanceMatrix.needsUpdate = true;
    if (hIMesh.instanceColor) hIMesh.instanceColor.needsUpdate = true;

    sIMesh.count = soldiers.length;
    for (let i = 0; i < soldiers.length; i++) {
        let s = soldiers[i];
        dummy.position.copy(s.mesh.position);
        dummy.quaternion.copy(s.mesh.quaternion);
        dummy.updateMatrix();
        sIMesh.setMatrixAt(i, dummy.matrix);
        if (s.isHit) dummyColor.setHex(0xffffff);
        else dummyColor.setHex(CONFIG.colors.soldier);
        sIMesh.setColorAt(i, dummyColor);
    }
    sIMesh.instanceMatrix.needsUpdate = true;
    if (sIMesh.instanceColor) sIMesh.instanceColor.needsUpdate = true;

    composer.render();
    
    // Update HUD Canvas
    const hudCanvas = document.getElementById('hud-canvas');
    if (hudCanvas) {
        if (hudCanvas.width !== window.innerWidth || hudCanvas.height !== window.innerHeight) {
            hudCanvas.width = window.innerWidth;
            hudCanvas.height = window.innerHeight;
        }
        const ctx = hudCanvas.getContext('2d');
        ctx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
        
        let drawHp = (arr, color) => {
            arr.forEach(e => {
                if (e.hp < e.maxHp && e.hp > 0) {
                    let pos = e.mesh.position.clone();
                    pos.y += 2.0;
                    pos.project(camera);
                    if (pos.z < 1) {
                        let x = (pos.x * 0.5 + 0.5) * hudCanvas.width;
                        let y = -(pos.y * 0.5 - 0.5) * hudCanvas.height;
                        let w = 20;
                        let h = 3;
                        ctx.fillStyle = 'rgba(0,0,0,0.8)';
                        ctx.fillRect(x - w/2, y, w, h);
                        ctx.fillStyle = color;
                        ctx.fillRect(x - w/2, y, (e.hp / e.maxHp) * w, h);
                    }
                }
            });
        };
        drawHp(zombies, '#ff3333');
        drawHp(humans, '#33aaff');
        drawHp(soldiers, '#33ff33');
        
        // Offscreen indicators for zombies
        zombies.forEach(z => {
            let pos = z.mesh.position.clone();
            pos.project(camera);
            
            // Check if offscreen
            if (pos.z >= 1 || pos.x < -1 || pos.x > 1 || pos.y < -1 || pos.y > 1) {
                let pad = 20;
                let uiW = isSettingsOpen ? 340 : 0;
                
                let screenX = (pos.x * 0.5 + 0.5) * hudCanvas.width;
                let screenY = -(pos.y * 0.5 - 0.5) * hudCanvas.height;
                
                if (pos.z >= 1) {
                    screenX = hudCanvas.width - screenX;
                    screenY = hudCanvas.height; // just push to bottom if behind
                }
                
                if (screenX < pad) screenX = pad;
                if (screenX > hudCanvas.width - uiW - pad) screenX = hudCanvas.width - uiW - pad;
                if (screenY < pad) screenY = pad;
                if (screenY > hudCanvas.height - pad) screenY = hudCanvas.height - pad;
                
                ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
                ctx.beginPath();
                ctx.arc(screenX, screenY, 4, 0, Math.PI*2);
                ctx.fill();
            }
        });
    }
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'KeyF') {
        isFreeCamera = false;
        let el = document.getElementById('camera-mode');
        if (el) el.textContent = '자동 추적';
    }
    if (e.code === 'Tab') {
        e.preventDefault();
        isTabOverview = true;
    }
    if (e.code === 'Space') {
        e.preventDefault();
        droneCommand.type = 'STOP';
        droneCommand.position = null;
        droneCommand.target = null;
    }
    if (e.code === 'KeyR') {
        e.preventDefault();
        droneCommand.type = 'GATHER';
        const centerMouse = new THREE.Vector2(0, 0);
        const r = new THREE.Raycaster();
        r.setFromCamera(centerMouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (r.ray.intersectPlane(plane, target)) {
            let valid = getValidSpawnPoint(target.x, target.z);
            droneCommand.position = new THREE.Vector3(valid.x, 0, valid.z);
        }
        droneCommand.target = null;
    }
});

window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.closest('#ui-layer') || e.target.closest('.toggle-btn') || e.target.closest('#minimap-container') || e.target.closest('#action-bar')) return;
    
    // Raycast to find human or soldier
    const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    let allTargets = humans.concat(soldiers);
    let meshes = allTargets.map(t => t.mesh);
    let intersects = raycaster.intersectObjects(meshes);
    
    if (intersects.length > 0) {
        let hitMesh = intersects[0].object;
        let targetEntity = allTargets.find(t => t.mesh === hitMesh);
        if (targetEntity) {
            droneCommand.type = 'ATTACK';
            droneCommand.position = null;
            droneCommand.target = targetEntity;
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') {
        isTabOverview = false;
    }
});

window.addEventListener('wheel', (e) => {
    if (e.target.closest('#ui-layer') || e.target.closest('.toggle-btn') || e.target.closest('#minimap-container') || e.target.closest('#action-bar')) return;
    e.preventDefault();
    if (!isFreeCamera) freeCamSpread = smoothedSpread;
    freeCamSpread += e.deltaY * 0.05;
    if (freeCamSpread < 10) freeCamSpread = 10;
    if (freeCamSpread > 200) freeCamSpread = 200;
    
    if (!isFreeCamera) {
        freeCamX = smoothedCenterX;
        freeCamZ = smoothedCenterZ;
        isFreeCamera = true;
        let el = document.getElementById('camera-mode');
        if (el) el.textContent = '자유 시점 (F로 복귀)';
    }
}, { passive: false });

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

window.addEventListener('mousedown', (e) => {
    if (e.target.closest('#ui-layer') || e.target.closest('.toggle-btn') || e.target.closest('#minimap-container') || e.target.closest('#action-bar')) return;

    if (e.button === 1) { // Middle click only
        e.preventDefault();
        isDragging = true;
        if (!isFreeCamera) {
            freeCamX = smoothedCenterX;
            freeCamZ = smoothedCenterZ;
            freeCamSpread = smoothedSpread;
            isFreeCamera = true;
            let el = document.getElementById('camera-mode');
            if (el) el.textContent = '자유 시점 (F로 복귀)';
        }
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        let dx = e.clientX - lastMouseX;
        let dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        
        // Calculate pan speed based on the actual camera height to ensure consistent screen-to-world ratio
        // We normalize by 100.0 as a baseline height for the drag speed multiplier
        let baseRatio = camera.position.y / 100.0; 
        if (baseRatio < 0.1) baseRatio = 0.1;
        let panSpeed = 0.3 * baseRatio;
        
        freeCamX -= dx * panSpeed;
        freeCamZ -= dy * panSpeed;
    }
});

window.addEventListener('mouseup', () => { isDragging = false; isMinimapDragging = false; });
window.addEventListener('blur', () => { isTabOverview = false; isDragging = false; isMinimapDragging = false; });

let isMinimapDragging = false;

function updateCameraFromMinimap(e) {
    const rect = minimapCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const mapSize = CONFIG.mapSize;
    let mappedX = (x / rect.width) * mapSize - (mapSize / 2);
    const mappedZ = (y / rect.height) * mapSize - (mapSize / 2);
    
    let targetHeight = (30 + smoothedSpread * 2.5) * cameraDistanceMultiplier;
    let actualMaxHeight = cameraMaxHeight * Math.max(1.0, cameraDistanceMultiplier);
    if (targetHeight > actualMaxHeight) targetHeight = actualMaxHeight;
    
    let uiOffsetWorldX = 0;
    
    mappedX -= uiOffsetWorldX;
    
    if (!isFreeCamera) {
        isFreeCamera = true;
        let el = document.getElementById('camera-mode');
        if (el) el.textContent = '자유 시점 (F로 복귀)';
        freeCamSpread = smoothedSpread;
    }
    
    freeCamX = mappedX;
    freeCamZ = mappedZ;
}

if (minimapCanvas) {
    minimapCanvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left click only
            isMinimapDragging = true;
            updateCameraFromMinimap(e);
        }
    });
    
    minimapCanvas.addEventListener('mousemove', (e) => {
        if (isMinimapDragging) {
            updateCameraFromMinimap(e);
        }
    });
}

window.addEventListener('dblclick', (e) => {
    if (e.target.closest('#ui-layer') || e.target.closest('.toggle-btn') || e.target.closest('#minimap-container') || e.target.closest('#action-bar')) return;

    if (isAimingFlare && e.button === 0) {
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObject(gameMap.groundMesh || gameMap.plane || scene, true);
        if (intersects.length > 0) {
            flarePos.copy(intersects[0].point);
            flareState = 'active';
            flareDuration = Math.min(Math.max(flareCharge / 15 * 3, 3), 10); // min 3s, max 10s
            flareCharge = 0;
            isAimingFlare = false;
            document.body.style.cursor = 'default';
            const ui = document.getElementById('flare-ui');
            if (ui) ui.style.borderColor = '#666';
            
            if (flareMarker) {
                scene.remove(flareMarker);
                flareMarker.geometry.dispose();
                flareMarker.material.dispose();
            }
            const geo = new THREE.CylinderGeometry(0.5, 0.5, 5, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
            flareMarker = new THREE.Mesh(geo, mat);
            flareMarker.position.copy(flarePos);
            flareMarker.position.y = 2.5;
            scene.add(flareMarker);
        }
    }
});

function syncSheetToConfig(sheetCfg) {
    if (!CONFIG.units) CONFIG.units = {};
    for (const [unitId, unitData] of Object.entries(sheetCfg.units)) {
        CONFIG.units[unitId] = {
            hp: unitData.hp,
            speed: unitData.speed,
            attack: unitData.attack,
            attack_speed: unitData.attack_speed,
            attack_dist: unitData.attack_dist,
            sight_range: unitData.sight_range,
            infectTime: sheetCfg.abilities[unitId]?.infect_time_s,
            can_target_air: sheetCfg.abilities[unitId]?.can_target_air,
            infection_chance: sheetCfg.abilities[unitId]?.infection_chance !== undefined ? sheetCfg.abilities[unitId].infection_chance : 1.0,
            infection_break_grace_s: sheetCfg.abilities[unitId]?.infection_break_grace_s !== undefined ? sheetCfg.abilities[unitId].infection_break_grace_s : 0.2,
            infect_resist: unitData.infect_resist !== undefined ? unitData.infect_resist : 0.0,
            col_radius: unitData.col_radius !== undefined ? unitData.col_radius : 0.5
        };
    }
    
    // Drone
    if (sheetCfg.drone) {
        CONFIG.drone = {
            max_hp: sheetCfg.drone['max_hp'] !== undefined ? sheetCfg.drone['max_hp'] : 100,
            damage_reduction: sheetCfg.drone['damage_reduction'] || 0,
            hp_regen_per_s: sheetCfg.drone['hp_regen_per_s'] || 0,
            regen_delay_s: sheetCfg.drone['regen_delay_s'] || 8,
            flight_height: sheetCfg.drone['flight_height'] || 10,
            move_speed: sheetCfg.drone['move_speed'] || 6,
            signal_radius: sheetCfg.drone['signal_radius'] || 12
        };
        
        if (sheetCfg.drone['move_speed']) CONFIG.droneSpeed = sheetCfg.drone['move_speed'];
        if (sheetCfg.drone['signal_radius']) CONFIG.stats.zombie.droneRadius = sheetCfg.drone['signal_radius'];
    }
    
    // Update UI Status Text
    updateSheetUI();
}

let isRefreshingSheet = false;
function updateSheetUI(errorMsg = null) {
    const statusText = document.getElementById('sheet-status-text');
    const sourceText = document.getElementById('sheet-source-text');
    const idText = document.getElementById('sheet-id-text');
    const timeText = document.getElementById('sheet-time-text');
    const pendingText = document.getElementById('sheet-pending-text');
    const errorText = document.getElementById('sheet-error-text');
    
    if (sheetManager.lastValidConfig) {
        if (statusText) statusText.innerText = "상태: 동기화 완료";
        if (sourceText) sourceText.innerText = "설정 출처: " + (sheetManager.lastValidConfig.source || "알 수 없음");
        if (idText) idText.innerText = "현재 적용된 식별값: " + (sheetManager.lastValidConfig.id || "알 수 없음");
        if (timeText && sheetManager.lastValidConfig.fetchTime) {
            timeText.innerText = "마지막 정상 로드: " + new Date(sheetManager.lastValidConfig.fetchTime).toLocaleString();
        }
    }
    
    if (sheetManager.pendingConfig) {
        if (pendingText) pendingText.style.display = 'block';
    } else {
        if (pendingText) pendingText.style.display = 'none';
    }
    
    if (errorMsg) {
        if (errorText) {
            errorText.style.display = 'block';
            errorText.innerText = "갱신 실패: " + errorMsg + " (기존 설정 유지됨)";
        }
    } else {
        if (errorText) errorText.style.display = 'none';
    }
}

document.getElementById('btn-sheet-refresh')?.addEventListener('click', async () => {
    if (isRefreshingSheet) return;
    isRefreshingSheet = true;
    
    const statusText = document.getElementById('sheet-status-text');
    if (statusText) statusText.innerText = "상태: 갱신 중...";
    
    updateSheetUI(); // clear errors
    
    const res = await sheetManager.fetchAll();
    isRefreshingSheet = false;
    
    if (res.success) {
        updateSheetUI();
    } else {
        if (statusText) statusText.innerText = "상태: 동기화 완료 (갱신 실패)";
        updateSheetUI(res.message);
    }
});

async function initGame() {
    const res = await sheetManager.fetchAll();
    if (res.success) {
        sheetManager.applyPending();
    }
    
    const config = sheetManager.getConfig();
    if (!config) {
        const title = document.getElementById('loading-text');
        const sub = document.getElementById('loading-subtext');
        if (title) title.innerText = "최초 실행 시 설정 데이터가 필요합니다.";
        if (sub) sub.innerText = res.message || "시트 연결을 확인하세요.";
        return; // Block start
    }
    
    syncSheetToConfig(config);
    
    const loading = document.getElementById('loading-screen');
    if (loading) loading.style.display = 'none';
    
    // Simulate initial map and game reset
    const applyMapBtn = document.getElementById('btn-apply-map');
    if (applyMapBtn) applyMapBtn.click();
    resetGame(config.settings['start_zombie_count'] || 1);
    animate();
}

window.zombies = zombies;
window.humans = humans;
window.soldiers = soldiers;
window.playerDrone = playerDrone;
window.CONFIG = CONFIG;
window.playTime = playTime;
window.sheetManager = sheetManager;
window.currentWave = currentWave;

initGame();
