export class SheetManager {
    constructor() {
        this.baseUrl = 'https://docs.google.com/spreadsheets/d/1RDUPIp2l9H2diRB3f1PO9f1IGV9uFI5-U6wJqzB3jXc/export?format=csv&gid=';
        this.sheets = {
            zombie: '0',
            human: '67819412',
            army: '440308695',
            drone: '513654324',
            abilities: '797228641',
            gameSettings: '1872752594',
            obstacles: '1154072671'
        };
        
        this.lastValidConfig = null;
        this.pendingConfig = null;
        
        // Load cached config if exists
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const cached = localStorage.getItem('agy_zombie_sheet_config');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    this.validateOverallConfig(parsed);
                    parsed.source = "로컬 캐시";
                    this.lastValidConfig = parsed;
                }
            }
        } catch(e) {
            console.warn("Cached config invalid, discarding:", e);
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.removeItem('agy_zombie_sheet_config');
            }
        }
    }
    
    validateOverallConfig(config) {
        if (!config || typeof config !== 'object') throw new Error("Config must be an object");
        if (!config.units || typeof config.units !== 'object') throw new Error("Missing or invalid units");
        if (!config.settings || typeof config.settings !== 'object') throw new Error("Missing or invalid settings");
        if (config.settings.schema_version !== 2) throw new Error(`Incompatible schema_version: Expected 2, got ${config.settings.schema_version}`);
        if (!config.abilities || typeof config.abilities !== 'object') throw new Error("Missing or invalid abilities");
        
        if (!config.units['z_walker']) throw new Error("Missing required unit: z_walker");
        if (!config.units['z_runner']) throw new Error("Missing required unit: z_runner");
        if (!config.units['z_brute']) throw new Error("Missing required unit: z_brute");
        if (!config.units['c_refugee']) throw new Error("Missing required unit: c_refugee");
        if (!config.units['s_rifleman']) throw new Error("Missing required unit: s_rifleman");
        
        if (!config.drone || typeof config.drone !== 'object') throw new Error("Missing or invalid drone settings");
        if (config.drone['max_hp'] === undefined) throw new Error("Missing max_hp in Drone settings");
        
        if (config.settings['spawn_roster'] === undefined) throw new Error("Missing spawn_roster in GameSettings");
    }

    parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 1) throw new Error("Empty CSV");
        
        const rawHeaders = lines[0].split(',');
        const headers = [];
        const seen = new Set();
        for (let i = 0; i < rawHeaders.length; i++) {
            let key = rawHeaders[i].trim();
            const slashIdx = key.indexOf('/');
            if (slashIdx !== -1) {
                key = key.substring(0, slashIdx).trim();
            }
            key = key.toLowerCase();
            if (seen.has(key)) throw new Error(`Duplicate key found in headers: ${key}`);
            seen.add(key);
            headers.push(key);
        }
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            // Ignore description rows that don't start with a valid ID or key, wait, the prompt says:
            // "데이터 아래 설명 행을 실행 설정으로 읽지 않는다."
            // Assuming description rows might have empty ID or specific markers. We will filter in the validation step.
            const row = lines[i].split(',').map(c => c.trim());
            const obj = {};
            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = row[j] !== undefined ? row[j] : '';
            }
            data.push(obj);
        }
        return data;
    }

    parseValue(val, type, context = '') {
        if (val === '' || val === undefined || val === null) return undefined;
        if (type === 'bool') {
            if (val === '1' || val === 'true' || val === true) return true;
            if (val === '0' || val === 'false' || val === false) return false;
            throw new Error(`${context} Invalid bool: ${val}`);
        }
        if (type === 'float' || type === 'ratio') {
            let num;
            if (typeof val === 'string' && val.endsWith('%')) {
                num = parseFloat(val.replace('%', '')) / 100.0;
            } else {
                num = parseFloat(val);
            }
            if (isNaN(num)) throw new Error(`${context} Invalid float: ${val}`);
            if (type === 'ratio' && (num < 0 || num > 1)) throw new Error(`${context} Ratio out of bounds (0~1): ${val}`);
            return num;
        }
        if (type === 'int') {
            const num = parseInt(val, 10);
            if (isNaN(num)) throw new Error(`${context} Invalid int: ${val}`);
            return num;
        }
        return val;
    }

    async fetchSheet(gid) {
        const res = await fetch(this.baseUrl + gid);
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) throw new Error("Access Denied (Private Sheet)");
            throw new Error(`HTTP Error ${res.status}`);
        }
        const text = await res.text();
        if (text.trim().startsWith('<!DOCTYPE html>')) {
            throw new Error("Received HTML instead of CSV. The sheet might require login or is not published correctly.");
        }
        return this.parseCSV(text);
    }

    validateUnitData(data, sheetName, abilitiesData = {}) {
        const parsed = {};
        let rowIndex = 1;
        
        for (let row of data) {
            rowIndex++;
            const uid = row['unit_id'] || '';
            const keyStr = String(uid).trim();
            
            if (keyStr === '' || keyStr.startsWith('설명') || keyStr.startsWith('//')) {
                continue;
            }
            
            const getVal = (key, alias) => {
                if (row[key] !== undefined && row[key] !== '') return row[key];
                if (alias && row[alias] !== undefined && row[alias] !== '') return row[alias];
                return ''; 
            };
            
            const rawHp = getVal('max_hp', '체력');
            const rawSpeed = getVal('move_speed', '이동_속도');
            const rawAttack = getVal('attack_damage', '공격력');
            
            // If it lacks all essential stats, it's likely an explanation row outside the data range.
            if (rawHp === '' && rawSpeed === '' && rawAttack === '') {
                continue;
            }
            
            // If the ID contains Korean characters or is a long sentence, it is clearly an explanation note, not a typoed data row.
            if (/[가-힣]/.test(keyStr) || keyStr.length > 30) {
                continue;
            }
            
            if (!/^[a-zA-Z0-9_]+$/.test(keyStr)) {
                throw new Error(`[${sheetName}] Row ${rowIndex} error (${keyStr}): Invalid unit_id format. Must be alphanumeric and underscore.`);
            }
            
            try {
                if (rawHp === '' || rawSpeed === '' || rawAttack === '') {
                    throw new Error(`Missing essential stats (max_hp, move_speed, or attack_damage)`);
                }
                
                const rawStamina = getVal('max_stamina', '스테미나');
                
                // Validate against abilities if available
                const unitAbilities = abilitiesData[keyStr] || {};
                const staminaEnabled = unitAbilities['stamina_enabled'];
                
                // Bypass stamina validation for Zombies as they do not use stamina in the engine
                // even if the abilities sheet mistakenly marks it as enabled.
                if (sheetName !== 'Zombie' && rawStamina === '') {
                     if (staminaEnabled && String(staminaEnabled) !== '0' && String(staminaEnabled).trim() !== '') {
                         throw new Error(`max_stamina is missing but abilities.stamina_enabled is not 0`);
                     }
                }

                const unit = {
                    id: keyStr,
                    can_spawn: this.parseValue(getVal('enabled', '생성가능_여부'), 'bool', 'enabled'),
                    hp: this.parseValue(rawHp, 'int', 'max_hp'),
                    speed: this.parseValue(rawSpeed, 'float', 'move_speed'),
                    lunge_speed: this.parseValue(getVal('sprint_speed', '뛰는_속도'), 'float', 'sprint_speed'),
                    attack: this.parseValue(rawAttack, 'int', 'attack_damage'),
                    attack_interval_s: this.parseValue(getVal('attack_interval_s', '공격_속도'), 'float', 'attack_interval_s'), 
                    attack_dist: this.parseValue(getVal('attack_dist', '공격_거리'), 'float', 'attack_dist'),
                    sight_range: this.parseValue(getVal('detect_radius', '탐지_범위'), 'float', 'detect_radius'),
                    dmg_reduction: this.parseValue(getVal('damage_reduction', '피해_감소율'), 'ratio', 'damage_reduction'),
                    col_radius: this.parseValue(getVal('collision_radius', '충돌_반지름'), 'float', 'collision_radius'),
                    weight: this.parseValue(getVal('mass', '무게'), 'float', 'mass'),
                    can_infect: this.parseValue(getVal('can_be_infected', '감염가능 여부') || getVal('감염가능_여부'), 'bool', 'can_be_infected'),
                    max_active_count: this.parseValue(getVal('max_active_count'), 'int', 'max_active_count'),
                    infect_resist: this.parseValue(getVal('infection_resistance', '감염_저항율'), 'ratio', 'infection_resistance'),
                    
                    max_stamina: this.parseValue(rawStamina, 'int', 'max_stamina'),
                    move_stamina_drain_per_s: this.parseValue(getVal('move_stamina_drain_per_s'), 'float', 'move_stamina_drain_per_s'),
                    sprint_stamina_drain_per_s: this.parseValue(getVal('sprint_stamina_drain_per_s'), 'float', 'sprint_stamina_drain_per_s'),
                    stamina_regen_per_s: this.parseValue(getVal('stamina_regen_per_s'), 'float', 'stamina_regen_per_s'),
                    exhausted_rest_min_s: this.parseValue(getVal('exhausted_rest_min_s'), 'float', 'exhausted_rest_min_s'),
                    stamina_resume_ratio: this.parseValue(getVal('stamina_resume_ratio'), 'ratio', 'stamina_resume_ratio'),
                    sprint_rearm_safe_s: this.parseValue(getVal('sprint_rearm_safe_s'), 'float', 'sprint_rearm_safe_s'),
                    idle_movement_mode: getVal('idle_movement_mode'),
                    flee_path_style: getVal('flee_path_style'),
                    flee_requires_line_of_sight: this.parseValue(getVal('flee_requires_line_of_sight'), 'bool', 'flee_requires_line_of_sight')
                };
                
                if (parsed[unit.id]) throw new Error(`Duplicate unit_id`);
                parsed[unit.id] = unit;
            } catch (e) {
                throw new Error(`[${sheetName}] Row ${rowIndex} error (${keyStr}): ${e.message}`);
            }
        }
        return parsed;
    }

    validateKeyValueData(data, keyAliases, valAliases, typeAliases, sheetName) {
        const parsed = {};
        let rowIndex = 1;
        
        for (let row of data) {
            rowIndex++;
            const getVal = (aliases) => {
                if (!aliases) return '';
                for (let alias of aliases) {
                    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
                }
                return '';
            };
            
            let keyStr = getVal(keyAliases) || '';
            keyStr = String(keyStr).trim();
            
            if (keyStr === '' || keyStr.startsWith('//') || keyStr.startsWith('설명')) {
                continue;
            }
            
            if (!/^[a-zA-Z0-9_]+$/.test(keyStr)) {
                throw new Error(`[${sheetName}] Row ${rowIndex} error (${keyStr}): Invalid key format. Must be alphanumeric and underscore.`);
            }
            
            try {
                const type = getVal(typeAliases) || 'string';
                const rawVal = getVal(valAliases);
                if (rawVal === '') throw new Error(`Missing value`);
                const val = this.parseValue(rawVal, type, 'value');
                
                if (parsed[keyStr]) throw new Error(`Duplicate key`);
                parsed[keyStr] = val;
            } catch (e) {
                throw new Error(`[${sheetName}] Row ${rowIndex} error (${keyStr}): ${e.message}`);
            }
        }
        return parsed;
    }

    validateAbilities(data) {
        const parsed = {};
        for (let row of data) {
            const uid = row['unit_id'];
            const key = row['stat_key'];
            if (!uid || !key || uid.includes(' ') || key.includes(' ')) continue;
            
            try {
                const type = row['유형'] || 'string';
                if (row['기본값'] === '') throw new Error(`Missing value for ${uid}_${key}`);
                const val = this.parseValue(row['기본값'], type);
                
                if (!parsed[uid]) parsed[uid] = {};
                if (parsed[uid][key]) throw new Error(`Duplicate ability key: ${uid}_${key}`);
                
                parsed[uid][key] = val;
            } catch (e) {
                throw new Error(`[Abilities] Row error (${uid}_${key}): ${e.message}`);
            }
        }
        return parsed;
    }

    validateObstacles(data) {
        const parsed = {};
        for (let row of data) {
            const oid = row['obstacle_id'];
            if (!oid || oid.includes(' ')) continue;
            
            try {
                if (row['hp'] === '') throw new Error(`Missing HP for ${oid}`);
                const obs = {
                    id: oid,
                    hp: this.parseValue(row['hp'], 'int'),
                    breakable_tier: this.parseValue(row['breakable_tier'], 'int'),
                    blocks_movement: this.parseValue(row['blocks_movement'], 'bool'),
                    destructible: this.parseValue(row['destructible'], 'bool')
                };
                if (parsed[oid]) throw new Error(`Duplicate obstacle_id: ${oid}`);
                parsed[oid] = obs;
            } catch (e) {
                throw new Error(`[Obstacles] Row error (${oid}): ${e.message}`);
            }
        }
        return parsed;
    }

    async fetchAll() {
        try {
            const rawZ = await this.fetchSheet(this.sheets.zombie);
            const rawH = await this.fetchSheet(this.sheets.human);
            const rawA = await this.fetchSheet(this.sheets.army);
            const rawD = await this.fetchSheet(this.sheets.drone);
            const rawAb = await this.fetchSheet(this.sheets.abilities);
            const rawGS = await this.fetchSheet(this.sheets.gameSettings);
            const rawO = await this.fetchSheet(this.sheets.obstacles);

            const config = {
                units: {
                    ...this.validateUnitData(rawZ, 'Zombie'),
                    ...this.validateUnitData(rawH, 'Human'),
                    ...this.validateUnitData(rawA, 'Army')
                },
                drone: this.validateKeyValueData(rawD, ['stat_key', 'key'], ['수치', 'value'], ['변수 유형', 'type'], 'Drone'),
                abilities: this.validateAbilities(rawAb),
                settings: this.validateKeyValueData(rawGS, ['stat_key', 'key'], ['기본값', 'value'], ['유형', 'type'], 'GameSettings'),
                obstacles: this.validateObstacles(rawO),
                fetchTime: new Date().toISOString(),
                source: "원격 시트",
                id: Math.random().toString(36).substr(2, 6).toUpperCase()
            };

            this.validateOverallConfig(config);
            
            this.pendingConfig = config;
            return { success: true, message: "Sheet loaded successfully. Will be applied on next start." };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    applyPending() {
        if (this.pendingConfig) {
            this.lastValidConfig = this.pendingConfig;
            this.pendingConfig = null;
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('agy_zombie_sheet_config', JSON.stringify(this.lastValidConfig));
            }
            return true;
        }
        return false;
    }

    getConfig() {
        return this.lastValidConfig;
    }
}

export const sheetManager = new SheetManager();
