import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

// Setup Socket.io
const socket = io();

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.Fog(0x87ceeb, 0, 750);

// Lighting - Enhanced for Graphics Remake
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
hemiLight.position.set(0, 200, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 0);

// Weapon Container (Attached to Camera)
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);

// Load Knife Model
const mtlLoader = new MTLLoader();
mtlLoader.setPath('assets/models/knife/');
mtlLoader.load('knife.mtl', (materials) => {
    materials.preload();
    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath('assets/models/knife/');
    objLoader.load('knife.obj', (object) => {
        loadedKnifeModel = object;
        console.log('Knife model loaded successfully');
        // If already holding knife, update visuals
        if (currentWeapon === 'knife') {
            updateWeaponVisuals();
        }
    },
        (xhr) => {
            console.log('Loading knife: ' + (xhr.loaded / xhr.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading knife model:', error);
        });
}, undefined, (error) => {
    console.error('Error loading knife materials:', error);
    // Try loading OBJ without materials
    const objLoader = new OBJLoader();
    objLoader.setPath('assets/models/knife/');
    objLoader.load('knife.obj', (object) => {
        loadedKnifeModel = object;
        console.log('Knife model loaded (without materials)');
    });
});

// Game State
let currentWeapon = 'revolver';
let primaryWeapon = 'revolver';
let currentAmmo = 7;
let isScoped = false;
let isReloading = false;
let isFiring = false;
let isDead = false;
let isChatOpen = false;
let isMenuOpen = false;
let isCrouching = false;
let weaponMenuEnabled = true; // Controlled by server
let isSettingsOpen = false;
let lastShotTime = 0;
let akShotCount = 0;

// Recoil Variables
let currentRecoilPitch = 0; // Up/Down rotation (visual)
let currentRecoilZ = 0; // Kickback position (visual)
let currentSpreadRecoil = 0.0; // Actual accuracy loss
let knifeAnimTime = 0; // Karambit animation timer
let knifeAnimState = 'idle'; // 'idle', 'slash', 'inspect'
let cameraRecoilRecover = 0;
let currentCameraHeight = 1.6;
let loadedKnifeModel = null; // Cached loaded knife model

const WEAPONS = {
    'revolver': {
        name: 'Revolver',
        ammo: 7,
        fireRate: 400,
        auto: false,
        speed: 0.95,
        recoilForce: 0.15, // Visual Kick
        recoilRecover: 5.0, // Recovery Speed
        spreadBase: 0.0,
        spreadMove: 0.05,
        recoil: 0.1, // Spread increase per shot
        color: 0x333333,
        traceColor: 0xffaa00
    },
    'ak47': {
        name: 'AK-47',
        ammo: 25,
        fireRate: 125,
        auto: true,
        speed: 0.73,
        recoilForce: 0.05,
        recoilRecover: 0.3, // Slow recovery during fire (allows buildup). Resets instantly after 500ms stop.
        spreadBase: 0.0,   // Base is perfect
        spreadMove: 0.15,
        recoil: 0.08,     // Accumulates to ~0.2 (20%) after 5 shots
        color: 0x8b4513,
        traceColor: 0xffaa00
    },
    'smg': {
        name: 'SMG',
        ammo: 35,
        fireRate: 66,
        auto: true,
        speed: 0.95,
        recoilForce: 0.03,
        recoilRecover: 0.5, // Slow recovery during fire.
        spreadBase: 0.0,
        spreadMove: 0.01,
        recoil: 0.05,     // Accumulates quickly to ~0.3 (30%)
        color: 0x555555,
        traceColor: 0xffaa00
    },
    'sniper': {
        name: 'Sniper',
        ammo: 5,
        fireRate: 1200,
        auto: false,
        speed: 0.73, // Reduced by ~15%
        recoilForce: 0.4,
        recoilRecover: 2.0,
        spreadBase: 0.001,
        spreadMove: 0.1,
        recoil: 0.5,
        color: 0x222222,
        traceColor: 0xffffff
    },
    'laser': {
        name: 'Laser Gun',
        ammo: 100,
        fireRate: 50,
        auto: true,
        speed: 1.2,
        recoilForce: 0.01,
        recoilRecover: 15.0,
        spreadBase: 0.0,
        spreadMove: 0.0,
        recoil: 0.0,
        color: 0x0000ff,
        traceColor: 0x0000ff
    },
    'super_laser': {
        name: 'Super Laser',
        ammo: 100,
        fireRate: 50,
        auto: true,
        speed: 1.2,
        recoilForce: 0.01,
        recoilRecover: 15.0,
        spreadBase: 0.0,
        spreadMove: 0.0,
        recoil: 0.0,
        color: 0xff0000,
        traceColor: 0xff0000
    },
    'knife': {
        name: 'Knife',
        ammo: 0,
        fireRate: 500,
        auto: false,
        speed: 1.0,
        recoilForce: 0,
        recoilRecover: 0,
        spreadBase: 0,
        spreadMove: 0,
        recoil: 0
    }
};

// --- Detailed Weapon Models Factory ---
function createDetailedWeapon(type) {
    const group = new THREE.Group();

    // High Quality Materials
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.8 });
    const matBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.2 });
    const matWood = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
    const matShiny = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.2, metalness: 1.0 });

    if (type === 'revolver') {
        // Handle
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.15), matWood);
        handle.position.set(0, -0.3, 0.15);
        handle.rotation.x = -0.5;
        group.add(handle);

        // Frame
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.25), matMetal);
        group.add(frame);

        // Drum (Cylinder)
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.15, 8), matBlack);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, 0.05, 0);
        group.add(drum);

        // Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), matShiny);
        barrel.rotation.x = -Math.PI / 2;
        barrel.position.set(0, 0.1, -0.4);
        group.add(barrel);

        // Sight
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), matBlack);
        sight.position.set(0, 0.15, -0.65);
        group.add(sight);

        // Position adjustment for FPS view
        group.scale.set(0.6, 0.6, 0.6);
        group.position.set(0.3, -0.25, -0.5);

    } else if (type === 'ak47') {
        // Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.6), matWood);
        stock.position.set(0, -0.1, 0.4);
        group.add(stock);

        // Receiver
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.6), matMetal);
        receiver.position.set(0, 0, 0);
        group.add(receiver);

        // Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0), matBlack);
        barrel.rotation.x = -Math.PI / 2;
        barrel.position.set(0, 0.05, -0.8);
        group.add(barrel);

        // Handguard
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.5), matWood);
        handguard.position.set(0, 0, -0.5);
        group.add(handguard);

        // Magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.25), matBlack);
        mag.position.set(0, -0.4, -0.1);
        mag.rotation.x = 0.5;
        group.add(mag);

        group.scale.set(0.5, 0.5, 0.5);
        group.position.set(0.3, -0.25, -0.6);

    } else if (type === 'super_laser') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), matShiny);
        group.add(body);

        for (let i = 0; i < 3; i++) {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 16), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
            coil.position.set(0, 0, -0.3 + (i * 0.2));
            group.add(coil);
        }

        group.scale.set(0.5, 0.5, 0.5);
        group.position.set(0.3, -0.25, -0.6);

    } else if (type === 'smg') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.6), matBlack);
        group.add(body);

        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.15), matBlack);
        handle.position.set(0, -0.35, 0.1);
        handle.rotation.x = -0.2;
        group.add(handle);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), matMetal);
        barrel.rotation.x = -Math.PI / 2;
        barrel.position.set(0, 0, -0.5);
        group.add(barrel);

        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.15), matMetal);
        mag.position.set(0, -0.4, -0.15);
        group.add(mag);

        group.scale.set(0.5, 0.5, 0.5);
        group.position.set(0.3, -0.25, -0.5);

    } else if (type === 'sniper') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.7), matBlack);
        group.add(body);

        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.5), matBlack);
        stock.position.set(0, -0.05, 0.6);
        group.add(stock);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5), matMetal);
        barrel.rotation.x = -Math.PI / 2;
        barrel.position.set(0, 0.05, -1.0);
        group.add(barrel);

        // Scope
        const scope = new THREE.Group();
        const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5), matBlack);
        scopeTube.rotation.x = -Math.PI / 2;
        const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05), matShiny);
        scopeLens.rotation.x = -Math.PI / 2;
        scopeLens.position.z = -0.25;

        scope.add(scopeTube);
        scope.add(scopeLens);
        scope.position.set(0, 0.2, 0);
        group.add(scope);

        const bipod = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), matMetal);
        bipod.position.set(0, -0.1, -0.8);
        group.add(bipod);

        group.scale.set(0.5, 0.5, 0.5);
        group.position.set(0.3, -0.25, -0.7);

    } else if (type === 'laser') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), matShiny);
        group.add(body);

        for (let i = 0; i < 3; i++) {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 16), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
            coil.position.set(0, 0, -0.3 + (i * 0.2));
            group.add(coil);
        }

        group.scale.set(0.5, 0.5, 0.5);
        group.position.set(0.3, -0.25, -0.6);

    } else if (type === 'knife') {
        // === LOADED KNIFE MODEL ===
        if (loadedKnifeModel) {
            // Clone the loaded model
            const knifeClone = loadedKnifeModel.clone();

            // Apply metallic material to all meshes
            const knifeMat = new THREE.MeshStandardMaterial({
                color: 0x666666,
                roughness: 0.25,
                metalness: 0.9
            });
            knifeClone.traverse((child) => {
                if (child.isMesh) {
                    child.material = knifeMat;
                    child.castShadow = true;
                }
            });

            // Center the model
            const box = new THREE.Box3().setFromObject(knifeClone);
            const center = box.getCenter(new THREE.Vector3());
            knifeClone.position.sub(center);

            // Simplified internal alignment - let's see where the default is
            knifeClone.rotation.set(0, 0, 0);

            group.add(knifeClone);

            // Calibrated scale
            group.scale.set(0.045, 0.045, 0.045);

            group.userData.isKarambit = true;
        } else {
            // Fallback: simple knife if model not loaded yet
            const matShiny = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2, metalness: 0.9 });
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.2), matShiny);
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.25), matShiny);
            blade.position.z = -0.22;
            group.add(handle);
            group.add(blade);
            group.scale.set(1.5, 1.5, 1.5);
            group.userData.isKarambit = true;
        }
    }

    // Muzzle Flash
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    flash.position.set(0, 0.1, -1.5); // Default out front
    flash.visible = false;
    flash.name = "muzzleFlash";
    group.add(flash);

    return group;
}

let currentWeaponMesh = new THREE.Group();
weaponGroup.add(currentWeaponMesh);

function updateWeaponVisuals() {
    weaponGroup.remove(currentWeaponMesh);
    currentWeaponMesh = createDetailedWeapon(currentWeapon);
    weaponGroup.add(currentWeaponMesh);
}

function switchWeapon(type) {
    if (type === 'primary') {
        currentWeapon = primaryWeapon;
        document.getElementById('ammo-display').style.display = 'block';
    } else if (type === 'knife') {
        currentWeapon = 'knife';
        document.getElementById('ammo-display').style.display = 'none';
        document.getElementById('reload-indicator').style.display = 'none';
        isReloading = false;
        // Trigger draw animation
        knifeAnimState = 'draw';
        knifeAnimTime = 0;
    }
    if (isScoped) toggleScope(false);

    updateWeaponVisuals();
    updateAmmoUI();
}

// --- Map Generation (Textures & Structures) ---
function generateDetailedTexture(color1, color2, scale = 1) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, size, size);

    // Noise
    for (let i = 0; i < 5000 * scale; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const w = Math.random() * 5 * scale;
        const h = Math.random() * 5 * scale;
        ctx.fillStyle = Math.random() > 0.5 ? color2 : '#000000';
        ctx.globalAlpha = 0.1;
        ctx.fillRect(x, y, w, h);
    }

    // Bricks/Lines pattern for walls
    if (scale >= 2) {
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        const brickH = 64;
        const brickW = 128;
        for (let y = 0; y < size; y += brickH) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
            for (let x = 0; x < size; x += brickW) {
                const offset = (y / brickH) % 2 === 0 ? 0 : brickW / 2;
                ctx.beginPath();
                ctx.moveTo(x + offset, y);
                ctx.lineTo(x + offset, y + brickH);
                ctx.stroke();
            }
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 5);
    return texture;
}

const wallMat = new THREE.MeshStandardMaterial({ map: generateDetailedTexture('#888888', '#555555', 2), roughness: 0.9 });
const floorMat = new THREE.MeshStandardMaterial({ map: generateDetailedTexture('#c2b280', '#a09060', 1), roughness: 1.0 });

let walls = [];

function createStructure(type, x, y, z, params) {
    if (type === 'box') {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(params.w, params.h, params.d), wallMat);
        mesh.position.set(x, y + params.h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        mesh.updateMatrixWorld();
        mesh.geometry.computeBoundingBox();
        const box = new THREE.Box3();
        box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        mesh.userData.boundingBox = box;
        walls.push(mesh);
    } else if (type === 'pillar') {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(params.r, params.r, params.h, 16), wallMat);
        mesh.position.set(x, y + params.h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        mesh.updateMatrixWorld();
        const box = new THREE.Box3().setFromObject(mesh);
        mesh.userData.boundingBox = box;
        walls.push(mesh);
    }
}

// Floor
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function createSpiralStaircase(cx, cz, startY, height, radius) {
    const steps = [];
    const stepHeight = 0.5;
    const stepCount = height / stepHeight;
    const anglePerStep = 0.5;

    for (let i = 0; i < stepCount; i++) {
        const angle = i * anglePerStep;
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        const y = startY + i * stepHeight;
        steps.push(['box', x, y, z, { w: 2.5, h: stepHeight, d: 2.5 }]);
    }
    return steps;
}

const MAPS = {
    'Arena': [
        // Map Layout (Arena 2.0 Remake)
        ['box', 0, 0, -50, { w: 100, h: 15, d: 2 }], // N
        ['box', 0, 0, 50, { w: 100, h: 15, d: 2 }], // S
        ['box', -50, 0, 0, { w: 2, h: 15, d: 100 }], // W
        ['box', 50, 0, 0, { w: 2, h: 15, d: 100 }], // E
        // Central Complex
        ['pillar', -10, 0, -10, { r: 2, h: 10 }],
        ['pillar', 10, 0, -10, { r: 2, h: 10 }],
        ['pillar', -10, 0, 10, { r: 2, h: 10 }],
        ['pillar', 10, 0, 10, { r: 2, h: 10 }],
        ['box', 0, 8, 0, { w: 24, h: 1, d: 24 }], // Roof
        ['box', 0, 0, 0, { w: 6, h: 3, d: 6 }], // Center cover
        // Tactical Positions
        ['box', 30, 0, 30, { w: 15, h: 4, d: 15 }],
        ['box', -30, 0, -30, { w: 15, h: 6, d: 15 }],
        ['box', 0, 0, 25, { w: 10, h: 2, d: 2 }],
        ['box', 0, 0, -25, { w: 10, h: 2, d: 2 }]
    ],
    'CloseQuarters': [
        // Borders
        ['box', 0, 0, -40, { w: 80, h: 10, d: 2 }],
        ['box', 0, 0, 40, { w: 80, h: 10, d: 2 }],
        ['box', -40, 0, 0, { w: 2, h: 10, d: 80 }],
        ['box', 40, 0, 0, { w: 2, h: 10, d: 80 }],
        // Maze-like boxes
        ['box', -20, 0, -20, { w: 10, h: 4, d: 10 }],
        ['box', 20, 0, -20, { w: 10, h: 4, d: 10 }],
        ['box', -20, 0, 20, { w: 10, h: 4, d: 10 }],
        ['box', 20, 0, 20, { w: 10, h: 4, d: 10 }],
        ['box', 0, 0, 0, { w: 5, h: 4, d: 40 }], // Long center wall
        ['box', 0, 0, 0, { w: 40, h: 4, d: 5 }], // Cross wall
        ['pillar', 15, 0, 15, { r: 1.5, h: 6 }],
        ['pillar', -15, 0, -15, { r: 1.5, h: 6 }]
    ],
    'Towers': [
        // Borders
        ['box', 0, 0, -60, { w: 120, h: 10, d: 2 }],
        ['box', 0, 0, 60, { w: 120, h: 10, d: 2 }],
        ['box', -60, 0, 0, { w: 2, h: 10, d: 120 }],
        ['box', 60, 0, 0, { w: 2, h: 10, d: 120 }],
        // Tower 1
        ['pillar', 0, 0, -40, { r: 6, h: 20 }],
        ['box', 0, 15, -40, { w: 16, h: 1, d: 16 }], // Platform
        // Tower 2
        ['pillar', 0, 0, 40, { r: 6, h: 20 }],
        ['box', 0, 15, 40, { w: 16, h: 1, d: 16 }], // Platform
        // Bridge
        ['box', 0, 15, 0, { w: 4, h: 1, d: 80 }],
        // Ground Cover
        ['box', 20, 0, 0, { w: 5, h: 5, d: 20 }],
        ['box', -20, 0, 0, { w: 5, h: 5, d: 20 }],
        // Staircases
        ...createSpiralStaircase(0, -40, 0, 16, 7.5),
        ...createSpiralStaircase(0, 40, 0, 16, 7.5)
    ]
};

window.loadMap = function (mapName) {
    // Clear existing walls
    walls.forEach(mesh => scene.remove(mesh));
    walls = [];

    const mapData = MAPS[mapName] || MAPS['Arena'];
    mapData.forEach(data => {
        createStructure(data[0], data[1], data[2], data[3], data[4]);
    });
    console.log("Loaded map:", mapName);
};

// Initial Load
loadMap('Arena');

// --- Player Model with Face ---
function createPlayerMesh(color) {
    const group = new THREE.Group();

    // Body
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.3), new THREE.MeshStandardMaterial({ color: color }));
    torso.position.y = 0.95;
    torso.castShadow = true;
    torso.userData.part = 'body';
    group.add(torso);

    // Head with Face
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);

    // Generate Face Texture
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffccaa'; // Skin
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#000'; // Eyes
    ctx.fillRect(15, 20, 8, 8);
    ctx.fillRect(41, 20, 8, 8);
    ctx.fillStyle = '#a00'; // Mouth
    ctx.fillRect(20, 45, 24, 4);

    const faceTex = new THREE.CanvasTexture(canvas);
    faceTex.magFilter = THREE.NearestFilter; // Pixel art style

    const matFace = new THREE.MeshStandardMaterial({ map: faceTex });
    const matSkin = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const matHair = new THREE.MeshStandardMaterial({ color: 0x332211 });

    // Materials Array: Right, Left, Top, Bottom, Front, Back
    const headMats = [matSkin, matSkin, matSkin, matSkin, matHair, matFace];

    const head = new THREE.Mesh(headGeo, headMats);
    head.position.y = 1.65;
    head.castShadow = true;
    head.userData.part = 'head';
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.2, 0.25, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.2, 0.25, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    return group;
}

// Controls
const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');

instructions.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
    document.getElementById('settings-modal').style.display = 'none';
    isSettingsOpen = false;
});
controls.addEventListener('unlock', () => {
    if (isChatOpen || isMenuOpen || isDead || isSettingsOpen || (votingOverlay && votingOverlay.style.display === 'flex')) {
        instructions.style.display = 'none';
    } else {
        // Opened via ESC
        toggleSettings();
    }
});
scene.add(controls.getObject());

// Input State
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y = 15; canJump = false; break;
        case 'Digit1': switchWeapon('primary'); break;
        case 'Digit3': switchWeapon('knife'); break;
        case 'KeyR': if (currentWeapon !== 'knife' && !isChatOpen && !isMenuOpen) startReload(); break;
        case 'KeyF':
            if (currentWeapon === 'knife' && !isChatOpen && !isMenuOpen && knifeAnimState === 'idle') {
                knifeAnimState = 'inspect';
                knifeAnimTime = 0;
            }
            break;
        case 'ShiftLeft': isCrouching = true; break;
        case 'KeyB':
            if (isChatOpen) return;
            if (document.getElementById('start-screen').style.display !== 'none') return; // Not in start screen
            if (!weaponMenuEnabled) return; // Disabled by rule

            if (isMenuOpen) {
                document.getElementById('weapon-menu').style.display = 'none';
                isMenuOpen = false;
                controls.lock();
            } else {
                const btn = document.getElementById('btn-super-laser');
                if (btn) btn.style.display = (myName === 'admin') ? 'block' : 'none';

                document.getElementById('weapon-menu').style.display = 'block';
                isMenuOpen = true;
                controls.unlock();
            }
            break;
        case 'Enter':
            if (isChatOpen) {
                const msg = chatInput.value.trim();
                if (msg) socket.emit('chatMessage', msg);
                chatInput.style.display = 'none'; chatInput.blur(); isChatOpen = false; controls.lock();
            } else {
                if (!isMenuOpen) {
                    isChatOpen = true; chatInput.style.display = 'block'; chatInput.focus(); controls.unlock();
                }
            }
            break;
    }
});
document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'ShiftLeft': isCrouching = false; break;
    }
});

document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked || isDead || isChatOpen || isMenuOpen) return;
    if (e.button === 0) {
        if (WEAPONS[currentWeapon].auto) isFiring = true;
        attemptShoot();
    } else if (e.button === 2 && currentWeapon === 'sniper') {
        toggleScope(!isScoped);
    }
});
document.addEventListener('mouseup', () => isFiring = false);

// Logic
function toggleScope(active) {
    isScoped = active;
    const scopeOverlay = document.getElementById('scope-overlay');
    const crosshair = document.getElementById('crosshair');

    if (isScoped) {
        camera.fov = 30;
        controls.pointerSpeed = userSettings.mouseSens * userSettings.sniperSens;
        scopeOverlay.style.display = 'flex';
        crosshair.style.display = 'none';
        currentWeaponMesh.visible = false;
    } else {
        camera.fov = userSettings.fov;
        controls.pointerSpeed = userSettings.mouseSens;
        scopeOverlay.style.display = 'none';
        crosshair.style.display = 'block';
        currentWeaponMesh.visible = true;
    }
    camera.updateProjectionMatrix();
}

function attemptShoot() {
    if (isReloading || isDead || isMenuOpen) return;
    const now = Date.now();
    const stats = WEAPONS[currentWeapon];
    if (now - lastShotTime < stats.fireRate) return;

    // First shot accuracy for AK and SMG
    if (currentWeapon === 'ak47') {
        if (now - lastShotTime > 500) {
            currentSpreadRecoil = 0;
            akShotCount = 0;
        }
        akShotCount++;
    } else if (currentWeapon === 'smg') {
        if (now - lastShotTime > 500) {
            currentSpreadRecoil = 0;
        }
    }

    if (currentWeapon !== 'knife') {
        if (currentAmmo <= 0) { startReload(); isFiring = false; return; }
        currentAmmo--;
        updateAmmoUI();
        // Recoil added after shot
    }

    lastShotTime = now;

    // Visual Recoil
    currentRecoilPitch += stats.recoilForce;
    currentRecoilZ += stats.recoilForce * 0.5;

    // Sniper Scope Animation
    if (currentWeapon === 'sniper' && isScoped) {
        // Kick camera up slightly
        const kick = 0.02;
        controls.getObject().rotation.x += kick;
        cameraRecoilRecover += kick;
    }

    socket.emit('shoot', { weapon: currentWeapon });
    performRaycastAttack(currentWeapon === 'knife' ? 3 : 100);

    if (currentWeapon !== 'knife') {
        currentSpreadRecoil += stats.recoil;
    } else {
        // Trigger karambit slash animation
        knifeAnimState = 'slash';
        knifeAnimTime = 0;
    }
}

function performRaycastAttack(dist) {
    const raycaster = new THREE.Raycaster();
    const stats = WEAPONS[currentWeapon];

    // Spread Logic
    let spread = stats.spreadBase + currentSpreadRecoil;

    if (currentWeapon === 'ak47') {
        // Custom AK Decay Logic
        const shotIndex = Math.max(0, akShotCount - 1);
        let errorPct = 0;

        if (isCrouching) {
             // 100-100-99-99-98
             if (shotIndex === 0) errorPct = 0;
             else if (shotIndex === 1) errorPct = 0;
             else if (shotIndex === 2) errorPct = 1;
             else if (shotIndex === 3) errorPct = 1;
             else if (shotIndex === 4) errorPct = 2;
             else {
                 // Decay to 10% error (90% accuracy)
                 const extra = shotIndex - 4;
                 errorPct = Math.min(10, 2 + extra * 1.5);
             }
        } else {
             // 100-99-98-98-97
             if (shotIndex === 0) errorPct = 0;
             else if (shotIndex === 1) errorPct = 1;
             else if (shotIndex === 2) errorPct = 2;
             else if (shotIndex === 3) errorPct = 2;
             else if (shotIndex === 4) errorPct = 3;
             else {
                 // Decay to 15% error (85% accuracy)
                 const extra = shotIndex - 4;
                 errorPct = Math.min(15, 3 + extra * 2.0);
             }
        }
        spread = errorPct * 0.01;
    } else {
        // First shot accuracy override for SMG
        if (currentWeapon === 'smg' && currentSpreadRecoil === 0) {
            spread = 0;
        }
    }

    if (moveForward || moveBackward || moveLeft || moveRight) spread += stats.spreadMove;

    // Revolver accuracy when standing still
    if (currentWeapon === 'revolver' && !(moveForward || moveBackward || moveLeft || moveRight)) {
        spread = 0;
    }

    if (isCrouching) {
        // If crouching, spread is greatly reduced (90% accuracy -> 10% spread)
        spread *= 0.1;
    }
    if (currentWeapon === 'sniper' && isScoped && (!moveForward && !moveBackward && !moveLeft && !moveRight)) spread = 0;

    const spreadX = (Math.random() - 0.5) * spread;
    const spreadY = (Math.random() - 0.5) * spread;
    raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), camera);
    raycaster.far = dist;

    const targetPoint = new THREE.Vector3();
    targetPoint.copy(raycaster.ray.origin).add(raycaster.ray.direction.clone().multiplyScalar(dist));

    // Hit Check
    const allObjects = [...Object.values(players), ...walls];
    const intersects = raycaster.intersectObjects(allObjects, true);

    if (intersects.length > 0) {
        const hit = intersects[0];
        targetPoint.copy(hit.point);
        const obj = hit.object;

        if (!walls.includes(obj)) {
            // Hit Player?
            // obj is the mesh (part). Its parent is the Player Group.
            let targetGroup = obj.parent;
            // Traverse up until we find the group stored in 'players'
            while (targetGroup && !Object.values(players).includes(targetGroup)) {
                targetGroup = targetGroup.parent;
            }

            // Find ID
            const pid = Object.keys(players).find(k => players[k] === targetGroup);
            if (pid) {
                socket.emit('shootHit', { id: pid, part: obj.userData.part || 'body', weapon: currentWeapon });
            }
        }
    }

    shootEffect(targetPoint, stats.traceColor);
}

function shootEffect(target, color) {
    const gunWorldPos = new THREE.Vector3();
    currentWeaponMesh.getWorldPosition(gunWorldPos);
    gunWorldPos.y += 0.1; // Offset to barrel height approximate

    // Muzzle Flash
    if (currentWeapon !== 'knife') {
        const flash = currentWeaponMesh.getObjectByName('muzzleFlash');
        if (flash) {
            flash.visible = true;
            setTimeout(() => flash.visible = false, 50);
        }
    }

    // Tracer
    if (currentWeapon !== 'knife') {
        const mat = new THREE.LineBasicMaterial({ color: color });
        const geo = new THREE.BufferGeometry().setFromPoints([gunWorldPos, target]);
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        setTimeout(() => scene.remove(line), 100);
    }
}

// UI & Multiplayer Events
const ammoDisplay = document.getElementById('ammo-display');
const reloadIndicator = document.getElementById('reload-indicator');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const healthBarFill = document.getElementById('health-bar-fill');
const healthValue = document.getElementById('health-value');
const deathScreen = document.getElementById('death-screen');
const leaderboardList = document.getElementById('leaderboard-list');
const hitMarker = document.getElementById('hit-marker');
const killFeed = document.getElementById('kill-feed');
const votingOverlay = document.getElementById('voting-overlay');
const voteOptionsDiv = document.getElementById('vote-options');
const voteStatus = document.getElementById('vote-status');
const matchTimer = document.getElementById('match-timer');

function updateAmmoUI() {
    ammoDisplay.innerText = `${currentAmmo} / ${WEAPONS[currentWeapon].ammo}`;
}

function startReload() {
    if (isReloading) return;
    isReloading = true;
    reloadIndicator.style.display = 'block';
    setTimeout(() => {
        if (currentWeapon !== 'knife') currentAmmo = WEAPONS[currentWeapon].ammo;
        updateAmmoUI();
        isReloading = false;
        reloadIndicator.style.display = 'none';
    }, 2000);
}

// Socket Events
const players = {};
socket.on('currentPlayers', (srvPlayers) => { Object.keys(srvPlayers).forEach(id => { if (id !== socket.id) addOtherPlayer(srvPlayers[id]); }); });
socket.on('newPlayer', (info) => addOtherPlayer(info));

socket.on('initPosition', (data) => {
    controls.getObject().position.set(data.x, data.y, data.z);
    velocity.set(0, 0, 0);
    if (data.map) loadMap(data.map);
});

socket.on('disconnectPlayer', (id) => { scene.remove(players[id]); delete players[id]; });

function addOtherPlayer(info) {
    const mesh = createPlayerMesh(info.color);
    mesh.position.set(info.x, info.y, info.z);
    scene.add(mesh);
    players[info.id] = mesh;
}

socket.on('playerMoved', (info) => {
    if (players[info.id]) {
        players[info.id].position.set(info.x, info.y, info.z);
        players[info.id].rotation.y = info.rotation;
        players[info.id].userData.targetScaleY = info.crouching ? 0.75 : 1.0;

        // Animation (Leg swing if moving)
        if (info.moving) {
            const t = Date.now() * 0.02;
            const left = players[info.id].getObjectByName('leftLeg');
            const right = players[info.id].getObjectByName('rightLeg');
            if (left && right) {
                left.rotation.x = Math.sin(t) * 0.8;
                right.rotation.x = Math.sin(t + Math.PI) * 0.8;
            }
        } else {
            const left = players[info.id].getObjectByName('leftLeg');
            const right = players[info.id].getObjectByName('rightLeg');
            if (left && right) {
                left.rotation.x = 0;
                right.rotation.x = 0;
            }
        }
    }
});

socket.on('healthUpdate', (data) => {
    if (data.id === socket.id) {
        const percent = Math.max(0, data.health);
        healthBarFill.style.width = percent + '%';
        healthValue.innerText = percent + '%';
        if (percent > 50) healthBarFill.style.backgroundColor = '#00ff00';
        else if (percent > 20) healthBarFill.style.backgroundColor = '#ffff00';
        else healthBarFill.style.backgroundColor = '#ff0000';
    }
});

socket.on('updateGameRules', (rules) => {
    if (rules.weaponMenuEnabled !== undefined) {
        weaponMenuEnabled = rules.weaponMenuEnabled;
        if (!weaponMenuEnabled && isMenuOpen) {
            // Force close menu if it was open
            document.getElementById('weapon-menu').style.display = 'none';
            isMenuOpen = false;
            controls.lock();
        }
    }
});

socket.on('killMessage', (data) => {
    const msg = document.createElement('div');
    msg.className = 'kill-msg';

    // Border Styling
    if (data.killerId === socket.id) {
        msg.classList.add('kill-border-green');
    } else {
        msg.classList.add('kill-border-red');
    }

    const createNameSpan = (id, name, isMe) => {
        const span = document.createElement('span');
        span.innerText = name || id.substring(0, 5);
        span.className = isMe ? 'text-green' : 'text-red';
        return span;
    };

    const killerSpan = createNameSpan(data.killerId, data.killerName, data.killerId === socket.id);
    const victimSpan = createNameSpan(data.victimId, data.victimName, data.victimId === socket.id);

    const weaponSpan = document.createElement('span');
    weaponSpan.className = 'weapon-name';
    weaponSpan.innerText = (data.weapon && WEAPONS[data.weapon]) ? WEAPONS[data.weapon].name : (data.weapon || 'Unknown');

    msg.appendChild(killerSpan);
    msg.appendChild(weaponSpan);

    // Headshot Icon
    if (data.isHeadshot) {
        const icon = document.createElement('span');
        icon.innerText = '💀';
        icon.className = 'kill-icon-text';
        msg.appendChild(icon);
    }

    msg.appendChild(victimSpan);

    killFeed.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
});

socket.on('forceWeapon', (weaponName) => {
    primaryWeapon = weaponName;
    currentWeapon = weaponName;
    currentAmmo = WEAPONS[currentWeapon].ammo;
    switchWeapon('primary');

    // Notification
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.style.color = 'gold';
    msgDiv.textContent = `SYSTEM: You found a ${WEAPONS[weaponName].name}!`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    setTimeout(() => { if (msgDiv.parentNode) msgDiv.remove(); }, 10000);
});

socket.on('leaderboardUpdate', (list) => {
    list.sort((a, b) => b.kills - a.kills);
    leaderboardList.innerHTML = '';
    list.forEach(p => {
        const li = document.createElement('li');
        const nameText = p.name || p.id.substring(0, 5);
        li.innerText = `${nameText}: ${p.kills}`;
        if (p.id === socket.id) {
            li.style.fontWeight = 'bold';
            li.style.color = '#ffd700'; // Gold color for current player
        }
        leaderboardList.appendChild(li);
    });
});

socket.on('chatMessage', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.textContent = `${data.name}: ${data.message}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    setTimeout(() => { if (msgDiv.parentNode) msgDiv.remove(); }, 10000);
});

socket.on('registerHit', () => {
    hitMarker.style.opacity = '1';
    setTimeout(() => hitMarker.style.opacity = '0', 100);
});

socket.on('playerKilled', (id) => { if (players[id]) players[id].visible = false; });

socket.on('playerDied', () => {
    isDead = true;
    controls.unlock();
    deathScreen.style.display = 'flex';
});

document.getElementById('respawn-btn').addEventListener('click', () => {
    socket.emit('requestRespawn');
});

socket.on('playerRespawned', (data) => {
    if (data.id === socket.id) {
        isDead = false;
        deathScreen.style.display = 'none';
        healthBarFill.style.width = '100%';
        healthBarFill.style.backgroundColor = '#00ff00';
        healthValue.innerText = '100%';

        // Random Weapon
        const weaponKeys = ['ak47', 'smg', 'revolver', 'sniper', 'laser'];
        primaryWeapon = weaponKeys[Math.floor(Math.random() * weaponKeys.length)];
        // primaryWeapon = 'sniper'; // Debug

        currentWeapon = primaryWeapon;
        currentAmmo = WEAPONS[currentWeapon].ammo;
        switchWeapon('primary');

        controls.getObject().position.set(data.x, data.y, data.z);
        velocity.set(0, 0, 0);
        controls.lock();
    } else {
        if (players[data.id]) {
            players[data.id].visible = true;
            players[data.id].position.set(data.x, data.y, data.z);
        }
    }
});

socket.on('playerShoots', (data) => {
    if (players[data.id] && data.weapon !== 'knife') {
        const origin = players[data.id].position.clone();
        origin.y += 0.6;
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), players[data.id].rotation.y);

        // Visual only tracer
        const target = origin.clone().add(direction.multiplyScalar(100));

        // Create simple line
        const mat = new THREE.LineBasicMaterial({ color: 0xffaa00 });
        const geo = new THREE.BufferGeometry().setFromPoints([origin, target]);
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        setTimeout(() => scene.remove(line), 100);
    }
});

// Match Logic
let currentVoteOptions = [];

socket.on('matchUpdate', (data) => {
    // Format timer
    const min = Math.floor(data.timeLeft / 60);
    const sec = data.timeLeft % 60;
    matchTimer.innerText = `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;

    if (data.gameState === 'VOTING') {
        matchTimer.style.color = 'yellow';
    } else {
        matchTimer.style.color = 'white';
    }
});

socket.on('startVoting', (data) => {
    votingOverlay.style.display = 'flex';
    controls.unlock();
    voteStatus.innerText = "Vote for Next Map (Press 6 or 7)";
    currentVoteOptions = data.options;

    voteOptionsDiv.innerHTML = '';
    data.options.forEach((mapName, index) => {
        const btn = document.createElement('div');
        btn.className = 'vote-btn';
        btn.innerText = `${mapName} [${index + 6}]`; // Map to 6, 7
        btn.onclick = () => {
            socket.emit('voteMap', mapName);
            voteStatus.innerText = `Voted for ${mapName}`;
            // Disable buttons
            Array.from(voteOptionsDiv.children).forEach(c => c.style.pointerEvents = 'none');
        };
        voteOptionsDiv.appendChild(btn);
    });

    // Show leaderboard?
    document.getElementById('leaderboard').style.display = 'block';
});

socket.on('mapChange', (data) => {
    votingOverlay.style.display = 'none';
    loadMap(data.map);
    // Request respawn
    socket.emit('requestRespawn');
});

// Start Screen Logic
const startScreen = document.getElementById('start-screen');
const nicknameInput = document.getElementById('nickname-input');
const startBtn = document.getElementById('start-btn');

let selectedColor = '#ffffff';
let myName = "Player";
let myColor = '#ffffff';

// Ensure DOM is ready before attaching listeners
document.addEventListener('DOMContentLoaded', () => {
    const colorSelection = document.getElementById('color-selection');
    if (colorSelection) {
        colorSelection.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-btn')) {
                const btn = e.target;
                // Deselect others
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
                // Select this
                btn.classList.add('selected');
                selectedColor = btn.getAttribute('data-color');
            }
        });
    }
});

startBtn.addEventListener('click', () => {
    const name = nicknameInput.value.trim() || "Player";
    myColor = selectedColor;
    myName = name;

    startScreen.style.display = 'none';
    instructions.style.display = 'flex'; // Show instructions now

    // Join game
    socket.emit('joinGame', { name: myName, color: myColor });
});

// Game Loop
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    // Only update if game started (controls unlocked usually implies start pressed or in game)
    // But we check controls.isLocked for movement.
    // If start screen is visible, we shouldn't process much.
    if (startScreen.style.display !== 'none') return;

    if (isFiring && controls.isLocked) attemptShoot();

    // Recoil Recovery
    const stats = WEAPONS[currentWeapon];
    const recover = stats.recoilRecover * delta;
    currentRecoilPitch = THREE.MathUtils.lerp(currentRecoilPitch, 0, delta * 10);
    currentRecoilZ = THREE.MathUtils.lerp(currentRecoilZ, 0, delta * 10);
    if (currentSpreadRecoil > 0) currentSpreadRecoil = Math.max(0, currentSpreadRecoil - recover);

    if (cameraRecoilRecover > 0) {
        const recoverSpeed = 2.0;
        const recoverAmount = Math.min(cameraRecoilRecover, recoverSpeed * delta);
        controls.getObject().rotation.x -= recoverAmount;
        cameraRecoilRecover -= recoverAmount;
    }

    // Apply visual recoil
    if (currentWeapon === 'knife') {
        // === KARAMBIT ANIMATIONS ===
        // Reset weaponGroup transforms - karambit uses its own positioning
        weaponGroup.position.set(0, 0, 0);
        weaponGroup.rotation.set(0, 0, 0);

        // Neutral rotation after internal model alignment

        const basePos = {
            x: 0.4,   // Towards the center area
            y: -0.4,  // Positioned lower in screen
            z: -0.75  // Forward depth for 3D effect
        };

        const baseRot = {
            x: 3.2,   // Tilted forward into the scene (3D depth)
            y: 0,  // Angled so the tip points towards the right
            z: 0   // Rotated so the concave edge faces forward
        };




        if (knifeAnimState === 'draw') {
            // Draw animation - quick spin from bottom
            knifeAnimTime += delta * 6;
            const t = Math.min(1, knifeAnimTime);
            const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

            currentWeaponMesh.position.set(
                basePos.x,
                basePos.y - (1 - ease) * 0.5,
                basePos.z
            );
            currentWeaponMesh.rotation.set(
                baseRot.x,
                baseRot.y + (1 - t) * Math.PI * 2,
                baseRot.z
            );

            if (t >= 1) {
                knifeAnimState = 'idle';
                knifeAnimTime = 0;
            }
        } else if (knifeAnimState === 'slash') {
            // Snappy CS:GO style slashing
            knifeAnimTime += delta * 12;

            if (knifeAnimTime < 1.0) {
                const t = knifeAnimTime;
                // Quick pull back
                currentWeaponMesh.position.set(
                    basePos.x + t * 0.05,
                    basePos.y + t * 0.05,
                    basePos.z + t * 0.1
                );
                currentWeaponMesh.rotation.set(
                    baseRot.x - t * 0.3,
                    baseRot.y - t * 0.2,
                    baseRot.z + t * 0.1
                );
            } else if (knifeAnimTime < 3.0) {
                const t = (knifeAnimTime - 1.0) / 2.0;
                const swing = Math.sin(t * Math.PI);
                // Sharp slash across the screen
                currentWeaponMesh.position.set(
                    basePos.x - swing * 0.4,
                    basePos.y + swing * 0.1,
                    basePos.z - swing * 0.2
                );
                currentWeaponMesh.rotation.set(
                    baseRot.x + swing * 1.5,
                    baseRot.y + swing * 0.5,
                    baseRot.z - swing * 1.2
                );
            } else {
                knifeAnimState = 'idle';
                knifeAnimTime = 0;
            }
        } else if (knifeAnimState === 'inspect') {
            // Inspect animation - fast finger spins
            knifeAnimTime += delta * 4;
            const t = knifeAnimTime;

            // Bring to center
            const centerT = Math.sin(Math.min(1, t / 4) * Math.PI);
            currentWeaponMesh.position.set(
                THREE.MathUtils.lerp(basePos.x, 0.1, centerT),
                THREE.MathUtils.lerp(basePos.y, -0.1, centerT),
                THREE.MathUtils.lerp(basePos.z, -0.6, centerT)
            );

            // Continuous spin
            currentWeaponMesh.rotation.set(
                baseRot.x + Math.sin(t * 2) * 0.2,
                baseRot.y + t * Math.PI * 2,
                baseRot.z + Math.cos(t * 2) * 0.2
            );

            if (t > 4) {
                knifeAnimState = 'idle';
                knifeAnimTime = 0;
            }
        } else {
            // Idle sway
            knifeAnimTime += delta;
            const t = knifeAnimTime;
            const swayX = Math.sin(t * 1.2) * 0.01;
            const swayY = Math.cos(t * 1.5) * 0.015;

            currentWeaponMesh.position.set(
                basePos.x + swayX,
                basePos.y + swayY,
                basePos.z
            );
            currentWeaponMesh.rotation.set(
                baseRot.x + swayY * 0.2,
                baseRot.y + swayX * 0.5,
                baseRot.z
            );
        }
    } else {
        // Reset position for other weapons
        weaponGroup.position.set(0, 0, currentRecoilZ);
        weaponGroup.rotation.set(currentRecoilPitch, 0, 0);
    }

    if (isReloading) weaponGroup.rotation.x -= 0.5;

    // Remote Player Crouch Animation
    Object.values(players).forEach(p => {
        const target = p.userData.targetScaleY || 1.0;
        p.scale.y = THREE.MathUtils.lerp(p.scale.y, target, delta * 10);
    });

    // Local Crouch Smoothing
    const targetHeight = isCrouching ? 1.2 : 1.6;
    currentCameraHeight = THREE.MathUtils.lerp(currentCameraHeight, targetHeight, delta * 10);

    // Movement & Physics
    if (controls.isLocked) {
        const GRAVITY = 50.0;
        velocity.x -= velocity.x * 8.0 * delta;
        velocity.z -= velocity.z * 8.0 * delta;
        velocity.y -= GRAVITY * delta;
        velocity.y = Math.max(velocity.y, -100);

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = isCrouching ? 30.0 : (stats.speed * 100.0);
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        const startPos = controls.getObject().position.clone();

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        const endPos = controls.getObject().position.clone();

        // Check Wall Collision
        const checkCollision = (position) => {
            const playerRadius = 0.5;
            for (const wall of walls) {
                const box = wall.userData.boundingBox.clone().expandByScalar(playerRadius);
                if (position.y > wall.userData.boundingBox.min.y && position.y - currentCameraHeight < wall.userData.boundingBox.max.y) {
                    if (box.containsPoint(position)) {
                        return true;
                    }
                }
            }
            return false;
        };

        if (checkCollision(endPos)) {
            // Collision detected - Try sliding
            // Try X only
            const posX = startPos.clone();
            posX.x = endPos.x;
            const xCollided = checkCollision(posX);

            // Try Z only
            const posZ = startPos.clone();
            posZ.z = endPos.z;
            const zCollided = checkCollision(posZ);

            // Apply allowed movements
            if (!xCollided) {
                controls.getObject().position.x = endPos.x;
            } else {
                controls.getObject().position.x = startPos.x;
            }

            if (!zCollided) {
                controls.getObject().position.z = endPos.z;
            } else {
                controls.getObject().position.z = startPos.z;
            }
        }

        controls.getObject().position.y += (velocity.y * delta);

        // Vertical Collision & Ground Check
        const feetY = controls.getObject().position.y - currentCameraHeight;
        let onGround = false;
        let groundY = 0;

        const currentPos = controls.getObject().position;

        walls.forEach(wall => {
            const box = wall.userData.boundingBox;
            if (currentPos.x > box.min.x - 0.2 && currentPos.x < box.max.x + 0.2 &&
                currentPos.z > box.min.z - 0.2 && currentPos.z < box.max.z + 0.2) {
                if (velocity.y <= 0 && feetY < box.max.y && feetY > box.max.y - 1.0) {
                    onGround = true;
                    groundY = Math.max(groundY, box.max.y);
                }
            }
        });

        if (feetY <= 0) {
            onGround = true;
            groundY = Math.max(groundY, 0);
        }

        if (onGround) {
            if (feetY <= groundY + 0.1) {
                velocity.y = 0;
                controls.getObject().position.y = groundY + currentCameraHeight;
                canJump = true;
            }
        }

        socket.emit('playerMovement', {
            x: controls.getObject().position.x,
            y: controls.getObject().position.y - currentCameraHeight,
            z: controls.getObject().position.z,
            rotation: controls.getObject().rotation.y,
            crouching: isCrouching,
            moving: (moveForward || moveBackward || moveLeft || moveRight)
        });
    }

    renderer.render(scene, camera);
}

// Start
switchWeapon('primary');
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.selectWeaponFromMenu = (weapon) => {
    primaryWeapon = weapon;
    currentWeapon = weapon;
    currentAmmo = WEAPONS[currentWeapon].ammo;
    switchWeapon('primary');

    document.getElementById('weapon-menu').style.display = 'none';
    isMenuOpen = false;
    controls.lock();
};

// Settings Logic
const settingsModal = document.getElementById('settings-modal');
const sensInput = document.getElementById('sens-input');
const sniperSensInput = document.getElementById('sniper-sens-input');
const fovInput = document.getElementById('fov-input');
const sensVal = document.getElementById('sens-val');
const sniperSensVal = document.getElementById('sniper-sens-val');
const fovVal = document.getElementById('fov-val');
const closeSettingsBtn = document.getElementById('close-settings-btn');

let userSettings = {
    mouseSens: 1.0,
    sniperSens: 0.5,
    fov: 80
};

// Load Settings
const savedSettings = localStorage.getItem('fpsSettings');
if (savedSettings) {
    userSettings = JSON.parse(savedSettings);
    sensInput.value = userSettings.mouseSens;
    sniperSensInput.value = userSettings.sniperSens;
    fovInput.value = userSettings.fov;
    sensVal.innerText = userSettings.mouseSens;
    sniperSensVal.innerText = userSettings.sniperSens;
    fovVal.innerText = userSettings.fov;

    // Apply Init
    camera.fov = userSettings.fov;
    camera.updateProjectionMatrix();
    controls.pointerSpeed = userSettings.mouseSens;
}

function updateSettings() {
    userSettings.mouseSens = parseFloat(sensInput.value);
    userSettings.sniperSens = parseFloat(sniperSensInput.value);
    userSettings.fov = parseInt(fovInput.value);

    sensVal.innerText = userSettings.mouseSens;
    sniperSensVal.innerText = userSettings.sniperSens;
    fovVal.innerText = userSettings.fov;

    localStorage.setItem('fpsSettings', JSON.stringify(userSettings));

    // Apply
    if (!isScoped) {
        camera.fov = userSettings.fov;
        camera.updateProjectionMatrix();
        controls.pointerSpeed = userSettings.mouseSens;
    } else {
        controls.pointerSpeed = userSettings.mouseSens * userSettings.sniperSens;
    }
}

sensInput.addEventListener('input', updateSettings);
sniperSensInput.addEventListener('input', updateSettings);
fovInput.addEventListener('input', updateSettings);

closeSettingsBtn.addEventListener('click', () => {
    toggleSettings();
});

window.toggleSettings = function () {
    if (isSettingsOpen) {
        // Closing
        settingsModal.style.display = 'none';
        isSettingsOpen = false;
        controls.lock();
    } else {
        // Opening
        settingsModal.style.display = 'block';
        isSettingsOpen = true;
        document.exitPointerLock();
        instructions.style.display = 'none';
    }
}
