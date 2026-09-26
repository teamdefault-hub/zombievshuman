export const CONFIG = {
  mapSize: 250,
  gridSize: 1,
  zombieRadius: 0.5,
  speeds: {
    normal: 6.0,
    fast: 10.0,
    slow: 3.0
  },
  colors: {
    zombie: 0xFF0000,
    civilian: 0x87CEEB,
    soldier: 0x4CAF50
  },
  stats: {
    zombie: { speedMin: 3.0, speedMax: 7.0, hpMin: 50, hpMax: 150, atkMin: 10, atkMax: 30, lungeDist: 5.0, lungeSpeedMult: 3.0, infectTime: 1.8, droneRadius: 15.0, droneOpacity: 15 },
    civilian: { speedMin: 3.0, speedMax: 7.0, hpMin: 20, hpMax: 50 },
    soldier: { speedMin: 5.0, speedMax: 8.0, hpMin: 100, hpMax: 200, atkMin: 20, atkMax: 60 }
  },
  buildings: []
};

export function generateBuildings(amount, density, baseHeight, sizeVar, rotVar = 0.0) {
    CONFIG.buildings = [];
    const mapHalf = (CONFIG.mapSize / 2) * density;
    
    const minGap = 4; // 건물이 떨어져서 길이 생기도록 하는 최소 간격

    // Create random buildings
    for(let i = 0; i < amount; i++) {
        let x = 0, z = 0, width = 0, depth = 0, height = 0, rotY = 0;
        let valid = false;
        let attempts = 0;
        
        while(!valid && attempts < 100) {
            attempts++;
            x = (Math.random() * 2 - 1) * mapHalf;
            z = (Math.random() * 2 - 1) * mapHalf;
            
            // 중앙(0,0) 주변 반경 20은 플레이어 스폰을 위한 안전 구역
            if (Math.abs(x) <= 20 && Math.abs(z) <= 20) {
                continue;
            }
            
            const sizeBase = 20; 
            const variance = (Math.random() * 2 - 1) * sizeVar; 
            width = Math.max(2, sizeBase + sizeBase * variance * 0.8);
            depth = Math.max(2, sizeBase + sizeBase * variance * 0.8);
            
            const hVar = (Math.random() * 2 - 1) * sizeVar;
            height = Math.max(2, baseHeight + baseHeight * hVar * 0.8);
            
            rotY = (Math.random() - 0.5) * Math.PI * rotVar;
            
            const cos = Math.cos(rotY), sin = Math.sin(rotY);
            const obbW = Math.abs(width * cos) + Math.abs(depth * sin);
            const obbD = Math.abs(width * sin) + Math.abs(depth * cos);

            // 다른 건물들과의 겹침 판정 (minGap 포함)
            let overlap = false;
            for (let j = 0; j < CONFIG.buildings.length; j++) {
                const b = CONFIG.buildings[j];
                const bCos = Math.cos(b.rotY), bSin = Math.sin(b.rotY);
                const bObbW = Math.abs(b.width * bCos) + Math.abs(b.depth * bSin);
                const bObbD = Math.abs(b.width * bSin) + Math.abs(b.depth * bCos);

                const thisLeft = x - obbW / 2 - minGap;
                const thisRight = x + obbW / 2 + minGap;
                const thisTop = z - obbD / 2 - minGap;
                const thisBottom = z + obbD / 2 + minGap;

                const bLeft = b.x - bObbW / 2;
                const bRight = b.x + bObbW / 2;
                const bTop = b.z - bObbD / 2;
                const bBottom = b.z + bObbD / 2;

                if (thisLeft < bRight && thisRight > bLeft && thisTop < bBottom && thisBottom > bTop) {
                    overlap = true;
                    break;
                }
            }

            if (!overlap) {
                valid = true;
            }
        }
        
        if (valid) {
            CONFIG.buildings.push({ x, z, width, depth, height, rotY });
        }
    }
}

// Initial generation with default slider values
generateBuildings(89, 1.0, 6, 0.8, 0.0);
