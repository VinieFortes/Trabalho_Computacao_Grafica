import * as THREE from "three";
import Stats from "../build/jsm/libs/stats.module.js";
import {PerlinNoise} from "./scripts/perlin.js";
import {GLTFLoader} from "../build/jsm/loaders/GLTFLoader.js";
import {createTorch, loadTorchModel, removeTorch} from "./scripts/torch.js";
import MusicManager from "./scripts/musicManager.js";
import * as BuildingManager from "./scripts/buildings.js";
import {loadAllTreesWithProgress} from "./scripts/trees.js";
import {
    BLOCK_TYPES,
    CHUNK_SIZE,
    colorMap,
    currentFogDistance as importedFogDistance,
    DOUBLE_TAP_DELAY,
    fogEnabled as importedFogEnabled,
    gravity,
    HALF_PLANE_SIZE,
    IDLE_ANIMATION_NAME,
    invertY as importedInvertY,
    jumpSpeed,
    LONG_PRESS_THRESHOLD,
    mouseSensitivityX as importedSensX,
    mouseSensitivityY as importedSensY,
    planeSize,
    playerDepth,
    playerHeight,
    playerSpeed,
    playerWidth,
    reachDistance,
    RUN_SPEED_MULTIPLIER,
    seaLevel,
    STEVE_ROTATION_SPEED,
    totalTreesNeeded,
    typeHeightMap,
    voxelSize,
    WALK_ANIMATION_NAME
} from "./scripts/config.js";
import * as CameraManager from "./scripts/camera.js";
import {cameraMode, smoothAngle} from "./scripts/camera.js";
import SoundManager from "./scripts/soundManager.js";
import {createSkyElements, updateDayNightCycle} from "./scripts/skybox.js";
import {
    ambientLight,
    directionalLight,
    getLightIntensity,
    setupLights,
    setupSecondaryLight,
    shadowCameraHelper,
    updateAmbientLight
} from "./scripts/lights.js";
import {incrementTotalTasks, resetProgress, updateProgress} from "./scripts/progress.js";
import {createBlockMaterials} from "./scripts/textures.js";

// Variáveis locais mutáveis
let mouseSensitivityX = importedSensX;
let mouseSensitivityY = importedSensY;
let invertY = importedInvertY;
let fogEnabled = importedFogEnabled;
let currentFogDistance = importedFogDistance;

// -------------------
// VARIÁVEIS GLOBAIS
// -------------------
let scene, renderer, clock, stats;
let chunkMeshes = new Map(); // chunkKey -> { tipo: InstancedMesh }
let loadedChunks = new Set();

let cameraAngleX = 0;
let cameraAngleY = 0;

let selectedBlockType = BLOCK_TYPES.GRASS;
let previewMesh = null;
let isRightMouseDown = false;
let rightMouseDownTime = 0;

let currentCamera;

let timeOfDay = 0;

const textureLoader = new THREE.TextureLoader();
let blockMaterials = {};

// Personagem e animações
let model;
let mixer;
let animationsMap = new Map();
let actions = {};
let activeAction = null;

// Dados do terreno
let terrainHeightMap = {};
let occupiedBlocks = new Set();
let blockTypeMap = {};

// Raycaster e highlight
let raycaster = new THREE.Raycaster();
let highlightedBlock = null;
let highlightMesh = null;

// Árvores
let treePositions = new Set();

// Movimentação
let velocity = new THREE.Vector3(0, 0, 0);
let direction = new THREE.Vector3(0, 0, 0);
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isRunning = false;
let lastWPressTime = 0;

// Variáveis de progresso para loading
let totalTasks = 0;
let completedTasks = 0;

// Variáveis para ciclo dia/noite
const timeOfDayRef = { value: 0 };

// Geometria compartilhada para blocos
const sharedGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

// -------------------
// FUNÇÃO init()
// -------------------
async function init() {
    resetProgress();
    totalTasks = 0;
    completedTasks = 0;

    // Carrega modelo da tocha
    incrementTotalTasks();
    try {
        await loadTorchModel();
        updateProgress("Torch model loaded");
    } catch (error) {
        console.error("Failed to load torch model:", error);
    }

    // Inicializa a cena
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById("webgl-output").appendChild(renderer.domElement);

    raycaster.near = 0;
    raycaster.far = reachDistance;

    setupMouseControls();

    // Configura luzes
    setupLights(scene);
    setupSecondaryLight(scene);

    // Configura câmeras
    const cameraManager = CameraManager.setupCameras(renderer);
    currentCamera = cameraManager.getCurrentCamera();

    setupCameraControls();

    // Materiais dos blocos
    blockMaterials = await createBlockMaterials(textureLoader);

    // Carrega chunks iniciais (9 tarefas)
    incrementTotalTasks(9);
    const startX = 0;
    const startZ = 0;
    const playerChunkX = Math.floor(startX / CHUNK_SIZE);
    const playerChunkZ = Math.floor(startZ / CHUNK_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            generateChunk(playerChunkX + dx, playerChunkZ + dz);
            updateProgress(`Carregando mapa (${completedTasks + 1}/9)`);
        }
    }

    // Carrega árvores com progresso
    incrementTotalTasks(totalTreesNeeded);
    await loadAllTreesWithProgress({
        scene,
        getTerrainHeight,
        generateChunk,
        occupiedBlocks,
        blockTypeMap,
        terrainHeightMap,
        treePositions,
        updateProgress,
        createInstancedMesh,
        chunkMeshes,
        loadedChunks
    });

    // Carrega construções com progresso
    const totalBuildingsNeeded = BuildingManager.buildingFiles.length;
    await BuildingManager.loadAllBuildingsWithProgress(totalBuildingsNeeded, {
        scene,
        occupiedBlocks,
        blockTypeMap,
        terrainHeightMap,
        treePositions,
        generateChunk,
        blockMaterials,
        sharedGeometry,
        updateProgress,
        createInstancedMesh,
        chunkMeshes,
        loadedChunks
    });

    // Carrega personagem (Steve)
    incrementTotalTasks();
    loadCharacter();

    setupFogControls();
    setupFPSCounter();

    window.addEventListener("resize", onWindowResize, false);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

    setupBlockSelector();
    setupKeyboardEvents();

    // Skybox e ciclo dia/noite
    createSkyElements(scene);
    setFogEnabled(fogEnabled);

    // Música e sons
    const musicManager = new MusicManager();
    await musicManager.initializeTracks();

    const soundManager = new SoundManager();
    await soundManager.initializeSounds();
    window.soundManager = soundManager;

    renderer.domElement.addEventListener('click', () => {
        if (soundManager.audioContext.state === 'suspended') {
            soundManager.audioContext.resume();
        }
    }, { once: true });

    const startButton = document.getElementById("start-button");
    if (startButton) {
        startButton.addEventListener("click", async () => {
            document.getElementById("loading-screen").style.display = "none";
            if (soundManager.audioContext.state === 'suspended') {
                await soundManager.audioContext.resume();
            }
            await musicManager.play();
        });
    }

    animate();
}

// -------------------
// CÂMERAS
// -------------------
function setupCameras() {
    const cameras = CameraManager.setupCameras(renderer);
    currentCamera = cameras.getCurrentCamera();
}

function setupCameraControls() {
    const sensX = document.getElementById("sensX");
    const sensXValue = document.getElementById("sensXValue");
    const sensY = document.getElementById("sensY");
    const sensYValue = document.getElementById("sensYValue");

    sensX.value = 3;
    mouseSensitivityX = mapSensitivity(parseFloat(sensX.value));
    sensXValue.textContent = sensX.value;
    sensX.addEventListener("input", () => {
        const uiValue = parseFloat(sensX.value);
        mouseSensitivityX = mapSensitivity(uiValue);
        sensXValue.textContent = uiValue.toFixed(1);
    });

    sensY.value = 3;
    mouseSensitivityY = mapSensitivity(parseFloat(sensY.value));
    sensYValue.textContent = sensY.value;
    sensY.addEventListener("input", () => {
        const uiValue = parseFloat(sensY.value);
        mouseSensitivityY = mapSensitivity(uiValue);
        sensYValue.textContent = uiValue.toFixed(1);
    });
}

function toggleCamera() {
    // Altera o modo de câmera via CameraManager
    currentCamera = CameraManager.toggleCamera(model, renderer, headMesh);
    // Se for modo orbital, carregamos o mapa inteiro antes de liberar o modo
    if (CameraManager.cameraMode === 2) {
        loadEntireMapWithProgress().then(() => {
            // Mapa carregado; a câmera orbital já está ativa
        });
    }
}

function mapSensitivity(uiValue) {
    if (uiValue <= 0) return 0.0001;
    const minSensitivity = 0.0001;
    const maxSensitivity = 0.01;
    return minSensitivity * Math.pow(maxSensitivity / minSensitivity, uiValue / 10);
}

// -------------------
// CONTROLE DO MOUSE (Pointer Lock)
// -------------------
function setupMouseControls() {
    document.addEventListener("mousemove", (event) => {
        if (document.pointerLockElement === renderer.domElement) {
            let movementX = event.movementX * mouseSensitivityX;
            let movementY = event.movementY * mouseSensitivityY;
            if (invertY) movementY = -movementY;
            cameraAngleY -= movementX;
            cameraAngleX -= movementY;
            cameraAngleX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraAngleX));
        }
    });
    renderer.domElement.addEventListener("click", () => {
        if (!document.pointerLockElement && (CameraManager.cameraMode === 0 || CameraManager.cameraMode === 1)) {
            renderer.domElement.requestPointerLock();
        }
    });
}

// -------------------
// TERRENO
// -------------------
const perlin = new PerlinNoise();
function generateChunk(chunkX, chunkZ, noUpdateCount = true) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (loadedChunks.has(chunkKey)) return;
    if (!scene) {
        console.error("Scene não inicializado! Aguarde a inicialização completa.");
        return;
    }
    const amplitude = 30;
    const frequency = 0.04;
    const baseHeight = 1;
    const terraLayers = typeHeightMap[BLOCK_TYPES.DIRT];
    const snowThreshold = 25;
    const positions = {
        grass: [],
        dirt: [],
        stone: [],
        snow: [],
        sand: [],
        water: [],
        bedrock: []
    };
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;
            // if (Math.abs(worldX) >= planeSize / 2 || Math.abs(worldZ) >= planeSize / 2) continue;
            const bedrockPos = { x: worldX, y: 0, z: worldZ };
            positions.bedrock.push(bedrockPos);
            blockTypeMap[`${worldX},0,${worldZ}`] = BLOCK_TYPES.BEDROCK;
            occupiedBlocks.add(`${worldX},0,${worldZ}`);
            terrainHeightMap[`${worldX},${worldZ}`] = 1;
            const noiseVal = perlin.noise(worldX * frequency, worldZ * frequency, 0);
            let y = Math.floor(noiseVal * amplitude) + baseHeight;
            let clampedY = Math.min(y, 30);
            if (clampedY < seaLevel) {
                for (let i = 1; i < clampedY; i++) {
                    const type = BLOCK_TYPES.DIRT;
                    const blockPos = { x: worldX, y: i, z: worldZ };
                    positions.dirt.push(blockPos);
                    blockTypeMap[`${worldX},${i},${worldZ}`] = type;
                    const key = `${worldX},${worldZ}`;
                    if (!terrainHeightMap[key] || i + 1 > terrainHeightMap[key]) {
                        terrainHeightMap[key] = i + 1;
                    }
                    occupiedBlocks.add(`${worldX},${i},${worldZ}`);
                }
                for (let waterY = clampedY; waterY < seaLevel; waterY++) {
                    const type = BLOCK_TYPES.WATER;
                    const blockPos = { x: worldX, y: waterY, z: worldZ };
                    positions.water.push(blockPos);
                    blockTypeMap[`${worldX},${waterY},${worldZ}`] = type;
                    occupiedBlocks.add(`${worldX},${waterY},${worldZ}`);
                }
                const terrainKey = `${worldX},${worldZ}`;
                terrainHeightMap[terrainKey] = Math.max(terrainHeightMap[terrainKey] || 0, seaLevel);
            } else {
                for (let i = 1; i < clampedY; i++) {
                    let type;
                    if (i === clampedY - 1) {
                        if (clampedY <= seaLevel) type = BLOCK_TYPES.GRASS;
                        else if (clampedY === seaLevel + 1) type = BLOCK_TYPES.SAND;
                        else if (clampedY >= snowThreshold) type = BLOCK_TYPES.SNOW;
                        else type = BLOCK_TYPES.GRASS;
                    } else if (i >= clampedY - 1 - terraLayers) {
                        type = BLOCK_TYPES.DIRT;
                    } else {
                        type = BLOCK_TYPES.STONE;
                    }
                    const blockPos = { x: worldX, y: i, z: worldZ };
                    switch (type) {
                        case BLOCK_TYPES.GRASS: positions.grass.push(blockPos); break;
                        case BLOCK_TYPES.DIRT: positions.dirt.push(blockPos); break;
                        case BLOCK_TYPES.STONE: positions.stone.push(blockPos); break;
                        case BLOCK_TYPES.SNOW: positions.snow.push(blockPos); break;
                        case BLOCK_TYPES.SAND: positions.sand.push(blockPos); break;
                    }
                    blockTypeMap[`${worldX},${i},${worldZ}`] = type;
                    const key = `${worldX},${worldZ}`;
                    if (!terrainHeightMap[key] || i + 1 > terrainHeightMap[key]) {
                        terrainHeightMap[key] = i + 1;
                    }
                    occupiedBlocks.add(`${worldX},${i},${worldZ}`);
                }
            }
        }
    }
    const existingMeshes = chunkMeshes.get(chunkKey);
    if (existingMeshes) {
        Object.values(existingMeshes).forEach(mesh => {
            if (mesh) {
                scene.remove(mesh);
                mesh.geometry.dispose();
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(mat => mat.dispose());
                } else if (mesh.material) {
                    mesh.material.dispose();
                }
            }
        });
    }
    const padding = 1;
    for (let x = (chunkX * CHUNK_SIZE) - padding; x < ((chunkX + 1) * CHUNK_SIZE) + padding; x++) {
        for (let z = (chunkZ * CHUNK_SIZE) - padding; z < ((chunkZ + 1) * CHUNK_SIZE) + padding; z++) {
            for (let y = 0; y < 256; y++) {
                const blockKey = `${x},${y},${z}`;
                if (occupiedBlocks.has(blockKey)) {
                    const type = blockTypeMap[blockKey];
                    if (type !== undefined) {
                        if (!positions[type]) positions[type] = [];
                        positions[type].push({ x, y, z });
                    }
                }
            }
        }
    }
    const newMeshes = {};
    for (const [typeStr, blockPositions] of Object.entries(positions)) {
        if (blockPositions.length > 0) {
            const type = parseInt(typeStr);
            const chunkPositions = blockPositions.filter(pos => {
                const posChunkX = Math.floor(pos.x / CHUNK_SIZE);
                const posChunkZ = Math.floor(pos.z / CHUNK_SIZE);
                return posChunkX === chunkX && posChunkZ === chunkZ;
            });
            if (chunkPositions.length > 0) {
                const mesh = createInstancedMesh(chunkPositions, type);
                if (mesh) {
                    newMeshes[type] = mesh;
                    mesh.userData.chunkKey = chunkKey;
                    mesh.userData.isBuildingBlock = ![BLOCK_TYPES.GRASS, BLOCK_TYPES.DIRT,
                        BLOCK_TYPES.STONE, BLOCK_TYPES.SNOW, BLOCK_TYPES.SAND,
                        BLOCK_TYPES.WATER, BLOCK_TYPES.BEDROCK].includes(type);
                    scene.add(mesh);
                }
            }
        }
    }
    chunkMeshes.set(chunkKey, newMeshes);
    loadedChunks.add(chunkKey);
    noUpdateCount ? completedTasks++ : null;
}

// Se o modo for orbital, não atualiza chunks (pois o mapa já estará carregado)
function updateChunks() {
    if (!model) return;
    // Se a fog estiver desativada, assumimos que o mapa inteiro já foi carregado
    if (!fogEnabled) return;
    if (CameraManager.cameraMode === 2) return;

    const playerChunkX = Math.floor(model.position.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(model.position.z / CHUNK_SIZE);
    const fogRadius = Math.ceil(currentFogDistance / CHUNK_SIZE);
    // Se a fog estiver ativa, carrega conforme a distância; senão (não usado aqui) não atualiza
    const loadRadius = fogEnabled ? fogRadius : Math.min(fogRadius, 6);

    for (let dx = -loadRadius; dx <= loadRadius; dx++) {
        for (let dz = -loadRadius; dz <= loadRadius; dz++) {
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance <= loadRadius) {
                generateChunk(playerChunkX + dx, playerChunkZ + dz);
            }
        }
    }

    const maxDistance = loadRadius + 1;
    scene.children.forEach((child) => {
        if (child.userData.chunkKey && child.isInstancedMesh) {
            const [chunkX, chunkZ] = child.userData.chunkKey.split(",").map(Number);
            const distance = Math.sqrt(
                Math.pow(chunkX - playerChunkX, 2) + Math.pow(chunkZ - playerChunkZ, 2)
            );
            if (distance > maxDistance) {
                scene.remove(child);
                loadedChunks.delete(child.userData.chunkKey);
                chunkMeshes.delete(child.userData.chunkKey);
            }
        }
    });

    scene.children.forEach((child) => {
        if (child.userData.chunkKey && child.userData.isTorch) {
            const [chunkX, chunkZ] = child.userData.chunkKey.split(",").map(Number);
            const distance = Math.sqrt(
                Math.pow(chunkX - playerChunkX, 2) + Math.pow(chunkZ - playerChunkZ, 2)
            );
            if (distance > maxDistance) {
                removeTorch(scene, child, chunkMeshes);
                const chunkData = chunkMeshes.get(child.userData.chunkKey);
                if (chunkData && chunkData.torches) {
                    const index = chunkData.torches.indexOf(child);
                    if (index > -1) {
                        chunkData.torches.splice(index, 1);
                    }
                }
            }
        }
    });
}

function createInstancedMesh(positions, blockType) {
    if (!positions || positions.length === 0) return null;

    // Se for o bloco de torch, cria cada torch individualmente
    if (blockType === BLOCK_TYPES.TORCH) {
        positions.forEach(pos => {
            createTorch(scene, pos, chunkMeshes, loadedChunks, CHUNK_SIZE);
        });
        return null;
    }

    let material = blockMaterials[blockType];
    if (!material) {
        if (blockType === BLOCK_TYPES.WATER) {
            material = new THREE.MeshPhongMaterial({
                color: 0x0077be,
                transparent: true,
                opacity: 0.6
            });
            blockMaterials[BLOCK_TYPES.WATER] = material;
        } else {
            console.error(`Material não definido para o tipo de bloco: ${blockType}`);
            return null;
        }
    }

    const count = positions.length;
    if (count === 0) return null;

    const instancedMesh = new THREE.InstancedMesh(sharedGeometry, material, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < positions.length; i++) {
        const { x, y, z } = positions[i];
        dummy.position.set(x, y * voxelSize + voxelSize / 2, z);
        dummy.updateMatrix();
        const lightIntensity = getLightIntensity(y);
        instancedMesh.setMatrixAt(i, dummy.matrix);
        instancedMesh.setColorAt(i, new THREE.Color().setScalar(lightIntensity));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor.needsUpdate = true;
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    return instancedMesh;
}


function getTerrainHeight(x, z) {
    const key = `${Math.round(x)},${Math.round(z)}`;
    return terrainHeightMap[key] || 0;
}

// -------------------
// PERSONAGEM (Steve)
// -------------------
let headMesh = null;
function loadCharacter() {
    const loader = new GLTFLoader();
    loader.load(
        "steve_1.glb",
        (gltf) => {
            model = gltf.scene;
            model.traverse((obj) => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                    if (obj.name === "Object_21") {
                        headMesh = obj;
                    }
                }
            });
            const startX = 0;
            const startZ = 0;
            setTimeout(() => {
                const startY = getTerrainHeight(startX, startZ);
                model.position.set(startX, startY * voxelSize + playerHeight + 10, startZ);
                model.scale.set(1.5, 1.5, 1.5);
                scene.add(model);
                mixer = new THREE.AnimationMixer(model);
                gltf.animations.forEach((clip) => {
                    animationsMap.set(clip.name, clip);
                });
                if (animationsMap.has(WALK_ANIMATION_NAME)) {
                    actions["walk"] = mixer.clipAction(animationsMap.get(WALK_ANIMATION_NAME));
                    actions["walk"].setLoop(THREE.LoopRepeat);
                    actions["walk"].clampWhenFinished = true;
                    actions["walk"].enable = true;
                }
                if (animationsMap.has(IDLE_ANIMATION_NAME)) {
                    actions["idle"] = mixer.clipAction(animationsMap.get(IDLE_ANIMATION_NAME));
                    actions["idle"].setLoop(THREE.LoopRepeat);
                    actions["idle"].clampWhenFinished = true;
                    actions["idle"].enable = true;
                }
                activeAction = null;
                CameraManager.setHeadMesh(headMesh);
                updateProgress("Steve carregado!", true);
            }, 100);
        },
        undefined,
        (err) => {
            console.error("Erro ao carregar Steve:", err);
            updateProgress("Erro ao carregar o Steve");
        }
    );
}

// -------------------
// EVENTOS
// -------------------
function onWindowResize() {
    const w = window.innerWidth,
        h = window.innerHeight;
    currentCamera.aspect = w / h;
    currentCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function setupBlockSelector() {
    const blockItems = document.querySelectorAll('.block-item');
    blockItems.forEach(item => {
        item.addEventListener('click', () => {
            blockItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedBlockType = parseInt(item.getAttribute('data-type'));
        });
    });
    blockItems[0].classList.add('selected');
}

function onMouseDown(event) {
    if (cameraMode !== 0 || document.pointerLockElement !== renderer.domElement) {
        return;
    }
    if (event.button === 0 && highlightedBlock) {
        removeBlock(highlightedBlock);
    } else if (event.button === 2) {
        isRightMouseDown = true;
        rightMouseDownTime = performance.now();
    }
}

function onMouseUp(event) {
    if (event.button === 2 && cameraMode === 0 && isRightMouseDown) {
        const timeHeld = performance.now() - rightMouseDownTime;
        isRightMouseDown = false;
        if (previewMesh) {
            scene.remove(previewMesh);
            previewMesh.geometry.dispose();
            if (Array.isArray(previewMesh.material)) {
                previewMesh.material.forEach(mat => mat.dispose());
            } else {
                previewMesh.material.dispose();
            }
            previewMesh = null;
        }
        if (highlightedBlock) {
            const placePosition = getPlacePosition();
            if (placePosition) {
                addBlock(placePosition);
            }
        }
    }
}

function getPlacePosition() {
    if (!highlightedBlock) return null;
    const { blockPos } = highlightedBlock;
    const intersection = raycaster.intersectObject(highlightedBlock.object)[0];
    if (!intersection) return null;
    let faceNormal = intersection.face.normal.clone();
    if (highlightedBlock.instanceId !== undefined) {
        const matrix = new THREE.Matrix4();
        highlightedBlock.object.getMatrixAt(highlightedBlock.instanceId, matrix);
        faceNormal = faceNormal.transformDirection(matrix);
    }
    faceNormal.x = Math.round(faceNormal.x);
    faceNormal.y = Math.round(faceNormal.y);
    faceNormal.z = Math.round(faceNormal.z);
    const newPos = blockPos.clone().add(faceNormal);
    const key = `${newPos.x},${newPos.y},${newPos.z}`;
    if (!occupiedBlocks.has(key)) {
        return newPos;
    }
    return null;
}

function addBlock(position) {
    window.soundManager.handleBlockSound(selectedBlockType, true);
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;
    if (selectedBlockType === BLOCK_TYPES.TORCH) {
        const blockKey = `${position.x},${position.y},${position.z}`;
        if (!occupiedBlocks.has(blockKey)) {
            const torchObj = createTorch(scene, position, chunkMeshes, loadedChunks, CHUNK_SIZE);
            if (torchObj) {
                occupiedBlocks.add(blockKey);
                blockTypeMap[blockKey] = BLOCK_TYPES.TORCH;
                return;
            }
        }
        return;
    }
    generateChunk(chunkX, chunkZ);
    const centerX = position.x;
    const centerY = position.y * voxelSize + voxelSize / 2;
    const centerZ = position.z;
    const half = voxelSize / 2;
    const blockBB = new THREE.Box3(
        new THREE.Vector3(centerX - half, centerY - half, centerZ - half),
        new THREE.Vector3(centerX + half, centerY + half, centerZ + half)
    );
    const playerBB = new THREE.Box3(
        new THREE.Vector3(
            model.position.x - playerWidth / 2,
            model.position.y,
            model.position.z - playerDepth / 2
        ),
        new THREE.Vector3(
            model.position.x + playerWidth / 2,
            model.position.y + playerHeight,
            model.position.z + playerDepth / 2
        )
    );
    if (blockBB.intersectsBox(playerBB)) {
        console.warn("Não é possível adicionar o bloco aqui: Steve está no caminho!");
        return;
    }
    const chunkData = chunkMeshes.get(chunkKey) || {};
    let mesh = chunkData[selectedBlockType];
    if (!mesh) {
        const initialPositions = [{ x: position.x, y: position.y, z: position.z }];
        mesh = createInstancedMesh(initialPositions, selectedBlockType);
        if (mesh) {
            mesh.userData.chunkKey = chunkKey;
            scene.add(mesh);
            chunkData[selectedBlockType] = mesh;
            chunkMeshes.set(chunkKey, chunkData);
            const key = `${position.x},${position.y},${position.z}`;
            occupiedBlocks.add(key);
            blockTypeMap[key] = selectedBlockType;
            const terrainKey = `${position.x},${position.z}`;
            terrainHeightMap[terrainKey] = Math.max(terrainHeightMap[terrainKey] || 0, position.y + 1);
        }
        return;
    }
    const positions = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        positions.push({
            x: Math.round(dummy.position.x),
            y: Math.round(dummy.position.y / voxelSize - 0.5),
            z: Math.round(dummy.position.z)
        });
    }
    const newBlockKey = `${position.x},${position.y},${position.z}`;
    if (occupiedBlocks.has(newBlockKey)) {
        console.warn("Já existe um bloco nesta posição:", newBlockKey);
        return;
    }
    positions.push({ x: position.x, y: position.y, z: position.z });
    const newMesh = createInstancedMesh(positions, selectedBlockType);
    if (newMesh) {
        newMesh.userData.chunkKey = chunkKey;
        scene.add(newMesh);
        scene.remove(mesh);
        chunkData[selectedBlockType] = newMesh;
        chunkMeshes.set(chunkKey, chunkData);
        occupiedBlocks.add(newBlockKey);
        blockTypeMap[newBlockKey] = selectedBlockType;
        const terrainKey = `${position.x},${position.z}`;
        terrainHeightMap[terrainKey] = Math.max(terrainHeightMap[terrainKey] || 0, position.y + 1);
    }
}

function cycleBlockType() {
    const uiBlockOrder = [
        BLOCK_TYPES.GRASS,
        BLOCK_TYPES.DIRT,
        BLOCK_TYPES.STONE,
        BLOCK_TYPES.SAND,
        BLOCK_TYPES.TRUNK,
        BLOCK_TYPES.LEAVES,
        BLOCK_TYPES.SNOW,
        BLOCK_TYPES.TORCH,
        BLOCK_TYPES.GLASS,
        BLOCK_TYPES.WHITE_WOOD,
        BLOCK_TYPES.BRICK,
    ];
    const currentIndex = uiBlockOrder.indexOf(selectedBlockType);
    const nextIndex = (currentIndex + 1) % uiBlockOrder.length;
    selectedBlockType = uiBlockOrder[nextIndex];
    const blockItems = document.querySelectorAll('.block-item');
    blockItems.forEach(item => {
        item.classList.remove('selected');
        if (parseInt(item.getAttribute('data-type')) === selectedBlockType) {
            item.classList.add('selected');
        }
    });
}

function setupKeyboardEvents() {
    window.addEventListener("keydown", (e) => {
        switch (e.code) {
            case "KeyH":
                cycleBlockType();
                break;
            case "KeyW":
            case "ArrowUp":
                const currentTime = performance.now();
                if (currentTime - lastWPressTime <= DOUBLE_TAP_DELAY) {
                    isRunning = true;
                }
                lastWPressTime = currentTime;
                moveForward = true;
                break;
            case "KeyS":
            case "ArrowDown":
                moveBackward = true;
                break;
            case "KeyA":
            case "ArrowLeft":
                moveLeft = true;
                break;
            case "KeyD":
            case "ArrowRight":
                moveRight = true;
                break;
            case "Space":
                if (canJump) {
                    velocity.y = jumpSpeed;
                    canJump = false;
                }
                break;
            case "KeyC":
                toggleCamera();
                break;
            case "KeyF":
                setFogEnabled(!fogEnabled);
                break;
            case "KeyY":
                invertY = !invertY;
                updateInvertYStatus();
                break;
            default:
                break;
        }
    });
    window.addEventListener("keyup", (e) => {
        switch (e.code) {
            case "KeyW":
            case "ArrowUp":
                moveForward = false;
                isRunning = false;
                break;
            case "KeyS":
            case "ArrowDown":
                moveBackward = false;
                break;
            case "KeyA":
            case "ArrowLeft":
                moveLeft = false;
                break;
            case "KeyD":
            case "ArrowRight":
                moveRight = false;
                break;
            default:
                break;
        }
    });
}

function updateInvertYStatus() {
    const invertYStatus = document.getElementById("invertYStatus");
    if (invertYStatus) {
        invertYStatus.textContent = invertY ? "Sim" : "Não";
    }
}

function updateBlockHighlight() {
    if (CameraManager.cameraMode === 2 || CameraManager.cameraMode === 1) return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), currentCamera);
    const intersectableObjects = [];
    scene.children.forEach((child) => {
        if (child.isInstancedMesh) {
            intersectableObjects.push(child);
        }
        if (child.isMesh && child.userData.isTreeBlock) {
            intersectableObjects.push(child);
        }
        if (child.isGroup && child.userData.isTorch) {
            const hitbox = child.children.find(c => c.userData.isTorchHitbox);
            if (hitbox) intersectableObjects.push(hitbox);
            child.children.forEach(c => {
                if (c.isMesh && !c.userData.isTorchHitbox) intersectableObjects.push(c);
            });
        }
        if (child.isMesh && child.userData.isBuildingBlock) {
            intersectableObjects.push(child);
        }
    });
    const intersects = raycaster.intersectObjects(intersectableObjects, true);
    if (highlightMesh) {
        scene.remove(highlightMesh);
        if (highlightMesh.geometry) highlightMesh.geometry.dispose();
        if (highlightMesh.material) highlightMesh.material.dispose();
        highlightMesh = null;
    }
    if (intersects.length > 0) {
        const intersect = intersects[0];
        let object = intersect.object;
        let blockPos;
        let instanceId = undefined;
        if (intersect.instanceId !== undefined) {
            instanceId = intersect.instanceId;
            const dummy = new THREE.Object3D();
            object.getMatrixAt(instanceId, dummy.matrix);
            dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
            blockPos = dummy.position.clone();
            blockPos.x = Math.round(blockPos.x);
            blockPos.y = Math.round(blockPos.y / voxelSize - 0.5);
            blockPos.z = Math.round(blockPos.z);
        } else if (object.isMesh) {
            const getParentGroup = (obj) => {
                let current = obj;
                while (current) {
                    if (current.userData && (current.userData.isTorch || current.userData.isTreeBlock || current.userData.isBuildingBlock)) {
                        return current;
                    }
                    current = current.parent;
                }
                return null;
            };
            const parentGroup = getParentGroup(object);
            if (parentGroup && parentGroup.userData.isTorch) {
                object = parentGroup;
                blockPos = object.position.clone();
                blockPos.x = Math.round(blockPos.x);
                blockPos.y = Math.round(blockPos.y - 0.5);
                blockPos.z = Math.round(blockPos.z);
            } else if (object.userData.isTreeBlock || object.userData.isBuildingBlock) {
                blockPos = object.userData.blockData ? new THREE.Vector3(
                    object.userData.blockData.x,
                    object.userData.blockData.y,
                    object.userData.blockData.z
                ) : object.position.clone();
                blockPos.x = Math.round(blockPos.x);
                blockPos.y = Math.round(blockPos.y / voxelSize - 0.5);
                blockPos.z = Math.round(blockPos.z);
            } else {
                return;
            }
        }
        const key = `${blockPos.x},${blockPos.y},${blockPos.z}`;
        const blockType = blockTypeMap[key];
        if (blockType === BLOCK_TYPES.WATER || blockType === BLOCK_TYPES.BEDROCK) {
            highlightedBlock = null;
            return;
        }
        const geometry = new THREE.BoxGeometry(voxelSize + 0.05, voxelSize + 0.05, voxelSize + 0.05);
        const highlightColor = (blockType === BLOCK_TYPES.SNOW) ? 0x00ff00 : 0xffffff;
        const material = new THREE.MeshBasicMaterial({
            color: highlightColor,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        highlightMesh = new THREE.Mesh(geometry, material);
        highlightMesh.position.set(blockPos.x, blockPos.y * voxelSize + voxelSize / 2, blockPos.z);
        scene.add(highlightMesh);
        highlightedBlock = { object, blockPos, instanceId };
    } else {
        highlightedBlock = null;
    }
    if (isRightMouseDown && highlightedBlock && performance.now() - rightMouseDownTime >= LONG_PRESS_THRESHOLD) {
        const placePosition = getPlacePosition();
        if (placePosition) {
            if (!previewMesh) {
                const geometry = new THREE.BoxGeometry(voxelSize + 0.05, voxelSize + 0.05, voxelSize + 0.05);
                const material = new THREE.MeshBasicMaterial({
                    color: colorMap[selectedBlockType],
                    transparent: true,
                    opacity: 0.5,
                    wireframe: true
                });
                previewMesh = new THREE.Mesh(geometry, material);
                scene.add(previewMesh);
            }
            previewMesh.position.set(
                placePosition.x,
                placePosition.y * voxelSize + voxelSize / 2,
                placePosition.z
            );
        }
    } else if (previewMesh) {
        scene.remove(previewMesh);
        previewMesh.geometry.dispose();
        previewMesh.material.dispose();
        previewMesh = null;
    }
}

function removeBlock(highlightedBlock) {
    const { object, blockPos, instanceId } = highlightedBlock;
    const key = `${blockPos.x},${blockPos.y},${blockPos.z}`;
    const blockType = blockTypeMap[key];
    if (blockType === BLOCK_TYPES.BEDROCK) {
        console.log("Não é possível remover bedrock!");
        return;
    }
    const getTorchGroup = (obj) => {
        let current = obj;
        while (current) {
            if (current.userData && current.userData.isTorch) {
                return current;
            }
            current = current.parent;
        }
        return null;
    };
    const torchGroup = getTorchGroup(object);
    if (torchGroup) {
        removeTorch(scene, torchGroup, chunkMeshes);
        occupiedBlocks.delete(key);
        delete blockTypeMap[key];
        const terrainKey = `${blockPos.x},${blockPos.z}`;
        if (terrainHeightMap[terrainKey] === blockPos.y + 1) {
            let newHeight = blockPos.y;
            while (newHeight >= 0 && !occupiedBlocks.has(`${blockPos.x},${newHeight - 1},${blockPos.z}`)) {
                newHeight--;
            }
            terrainHeightMap[terrainKey] = newHeight || 0;
        }
        return;
    }
    if (instanceId !== undefined) {
        const lastIndex = object.count - 1;
        if (instanceId !== lastIndex) {
            const dummy = new THREE.Object3D();
            object.getMatrixAt(lastIndex, dummy.matrix);
            object.setMatrixAt(instanceId, dummy.matrix);
        }
        object.count--;
        object.instanceMatrix.needsUpdate = true;
        occupiedBlocks.delete(key);
        delete blockTypeMap[key];
        const terrainKey = `${blockPos.x},${blockPos.z}`;
        if (terrainHeightMap[terrainKey] === blockPos.y + 1) {
            let newHeight = blockPos.y;
            while (newHeight >= 0 && !occupiedBlocks.has(`${blockPos.x},${newHeight - 1},${blockPos.z}`)) {
                newHeight--;
            }
            terrainHeightMap[terrainKey] = newHeight || 0;
        }
    } else if (object.isMesh) {
        if (object.userData.isBuildingBlock) {
            const worldX = Math.round(object.userData.blockData.x);
            const worldY = Math.round(object.userData.blockData.y);
            const worldZ = Math.round(object.userData.blockData.z);
            const blockKey = `${worldX},${worldY},${worldZ}`;
            scene.remove(object);
            object.geometry.dispose();
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => mat.dispose());
            } else {
                object.material.dispose();
            }
            occupiedBlocks.delete(blockKey);
            delete blockTypeMap[blockKey];
            const terrainKey = `${worldX},${worldZ}`;
            if (terrainHeightMap[terrainKey] === worldY + 1) {
                let newHeight = worldY;
                while (newHeight >= 0 && !occupiedBlocks.has(`${worldX},${newHeight - 1},${worldZ}`)) {
                    newHeight--;
                }
                terrainHeightMap[terrainKey] = newHeight || 0;
            }
        } else if (object.userData.isTreeBlock) {
            const worldX = Math.round(blockPos.x);
            const worldY = Math.round(blockPos.y);
            const worldZ = Math.round(blockPos.z);
            const blockKey = `${worldX},${worldY},${worldZ}`;
            scene.remove(object);
            object.geometry.dispose();
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => mat.dispose());
            } else {
                object.material.dispose();
            }
            occupiedBlocks.delete(blockKey);
            delete blockTypeMap[blockKey];
            const terrainKey = `${worldX},${worldZ}`;
            if (terrainHeightMap[terrainKey] === worldY + 1) {
                let newHeight = worldY;
                while (newHeight >= 0 && !occupiedBlocks.has(`${worldX},${newHeight - 1},${worldZ}`)) {
                    newHeight--;
                }
                terrainHeightMap[terrainKey] = newHeight;
            }
        }
    }
    if (highlightMesh) {
        scene.remove(highlightMesh);
        highlightMesh.geometry.dispose();
        highlightMesh.material.dispose();
        highlightMesh = null;
    }
    highlightedBlock = null;
    window.soundManager.handleBlockSound(blockType, false);
}

// -------------------
// LOOP DE ANIMAÇÃO
// -------------------
function animate() {
    requestAnimationFrame(animate);
    stats && stats.begin();
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    handleMovement(delta);
    updateDayNightCycle(delta, timeOfDayRef, directionalLight, ambientLight, scene);
    if (CameraManager.cameraMode === 0) {
        CameraManager.updateFirstPersonCamera(model, cameraAngleX, cameraAngleY);
    } else if (CameraManager.cameraMode === 1) {
        CameraManager.updateThirdPersonCamera(model, delta, isRunning, cameraAngleX, cameraAngleY);
    } else if (CameraManager.cameraMode === 2) {
        CameraManager.orbitControls.update();
    }
    updateChunks();
    updateBlockHighlight();
    if (model) {
        const lightOffset = new THREE.Vector3(50, 100, 50);
        directionalLight.position.copy(model.position).add(lightOffset);
        directionalLight.target.position.copy(model.position);
        directionalLight.shadow.camera.updateProjectionMatrix();
        shadowCameraHelper.update();
        updateAmbientLight(model.position.y / voxelSize);
    }
    renderer.render(scene, currentCamera);
    stats && stats.end();
}

export function isPositionInsideBlock(position) {
    const blockPos = new THREE.Vector3(
        Math.floor(position.x),
        Math.floor(position.y),
        Math.floor(position.z)
    );
    const key = `${blockPos.x},${blockPos.y},${blockPos.z}`;
    return occupiedBlocks.has(key);
}

// -------------------
// NÉVOA e FPS
// -------------------
export function setFogEnabled(enabled) {
    fogEnabled = enabled;
    const fogToggle = document.getElementById("fogToggle");
    if (fogToggle) {
        fogToggle.checked = !fogEnabled;
    }
    if (fogEnabled) {
        const heightFactor = 0.5;
        const density = (3.5 / currentFogDistance) * heightFactor;
        scene.fog = new THREE.FogExp2(0x87ceeb, density);
    } else {
        // ------------------------------------------------------
        // [ADICADO] Ao desativar a fog, carregamos todo o mapa com loading
        // e depois desativamos a fog.
        // ------------------------------------------------------
        loadEntireMapWithProgress().then(() => {
            scene.fog = null;
        });
    }
    updateChunks();
}

function setupFogControls() {
    const fogRange = document.getElementById("fogRange");
    const fogValue = document.getElementById("fogValue");
    const fogToggle = document.getElementById("fogToggle");
    if (!fogRange || !fogValue || !fogToggle) return;
    fogRange.addEventListener("input", () => {
        if (fogEnabled) {
            currentFogDistance = Number(fogRange.value);
            fogValue.textContent = currentFogDistance;
            const baseDensity = 1.5 / currentFogDistance;
            const heightFactor = 0.5;
            const density = baseDensity * heightFactor;
            if (scene.fog) {
                scene.fog.density = density;
            } else {
                scene.fog = new THREE.FogExp2(0x87ceeb, density);
            }
            if (directionalLight) {
                const scSize = currentFogDistance;
                directionalLight.shadow.camera.left = -scSize;
                directionalLight.shadow.camera.right = scSize;
                directionalLight.shadow.camera.top = scSize * heightFactor;
                directionalLight.shadow.camera.bottom = -scSize * heightFactor;
                let fogMult = 2;
                if (currentFogDistance <= 60) {
                    if (currentFogDistance >= 50) fogMult = 4;
                    else if (currentFogDistance >= 40) fogMult = 6;
                    else if (currentFogDistance >= 30) fogMult = 8;
                    else if (currentFogDistance >= 20) fogMult = 10;
                    else if (currentFogDistance >= 10) fogMult = 12;
                }
                directionalLight.shadow.camera.far = currentFogDistance * fogMult;
                directionalLight.shadow.camera.updateProjectionMatrix();
                shadowCameraHelper.update();
            }
        }
    });
    fogToggle.addEventListener("change", () => {
        fogEnabled = !fogToggle.checked;
        if (fogEnabled) {
            const density = 1.5 / currentFogDistance * 0.5;
            scene.fog = new THREE.FogExp2(0x87ceeb, density);
        } else {
            loadEntireMapWithProgress().then(() => {
                scene.fog = null;
            });
        }
        updateChunks();
    });
    currentFogDistance = Number(fogRange.value);
    fogValue.textContent = currentFogDistance;
    const initialDensity = (1.5 / currentFogDistance) * 0.5;
    scene.fog = new THREE.FogExp2(0x87ceeb, initialDensity);
}

function setupFPSCounter() {
    stats = new Stats();
    stats.showPanel(0);
    const fpsDiv = document.getElementById("fps-counter");
    stats.dom.style = "position: absolute; top: 5px; right: 0px; cursor: pointer; opacity: 0.5; z-index: 10000;";
    if (fpsDiv) fpsDiv.appendChild(stats.dom);
}

// -------------------
// COLISÃO E MOVIMENTAÇÃO
// -------------------
let tempBoxHelper = null;
function isPositionColliding(newPosition) {
    const halfWidth = playerWidth / 2;
    const halfDepth = playerDepth / 2;
    if (
        newPosition.x + halfWidth > HALF_PLANE_SIZE ||
        newPosition.x - halfWidth < -HALF_PLANE_SIZE ||
        newPosition.z + halfDepth > HALF_PLANE_SIZE ||
        newPosition.z - halfDepth < -HALF_PLANE_SIZE
    ) {
        return true;
    }
    const tempBox = new THREE.Box3(
        new THREE.Vector3(newPosition.x - halfWidth, newPosition.y - 0.5, newPosition.z - halfDepth),
        new THREE.Vector3(newPosition.x + halfWidth, newPosition.y + playerHeight + 0.5, newPosition.z + halfDepth)
    );
    const checkRadius = 8;
    const posX = Math.round(newPosition.x);
    const posY = Math.round(newPosition.y);
    const posZ = Math.round(newPosition.z);
    for (let x = posX - checkRadius; x <= posX + checkRadius; x++) {
        for (let y = posY - checkRadius; y <= posY + checkRadius; y++) {
            for (let z = posZ - checkRadius; z <= posZ + checkRadius; z++) {
                const key = `${x},${y},${z}`;
                if (occupiedBlocks.has(key)) {
                    if (blockTypeMap[key] === BLOCK_TYPES.WATER) continue;
                    const blockBox = new THREE.Box3(
                        new THREE.Vector3(x - voxelSize / 2, y - voxelSize / 2, z - voxelSize / 2),
                        new THREE.Vector3(x + voxelSize / 2, y + voxelSize / 2, z + voxelSize / 2)
                    );
                    if (tempBox.intersectsBox(blockBox)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function handleMovement(delta) {
    if (!model) return;

    // Reseta o vetor "direction"
    direction.set(0, 0, 0);

    // Verifica teclas
    if (moveForward) direction.z -= 1;
    if (moveBackward) direction.z += 1;
    if (moveLeft) direction.x -= 1;
    if (moveRight) direction.x += 1;

    let intendedMovement = new THREE.Vector3();
    if (direction.length() > 0) {
        direction.normalize();
        const speedMultiplier = isRunning ? RUN_SPEED_MULTIPLIER : 1;

        // Lógica de movimento dependendo do modo de câmera
        if (CameraManager.cameraMode === 0) {
            // Modo 1ª pessoa
            intendedMovement.copy(direction).multiplyScalar(playerSpeed * speedMultiplier);
            // Aplica a rotação do player (com base em cameraAngleY)
            intendedMovement.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleY);

        } else if (CameraManager.cameraMode === 1) {
            // Modo 3ª pessoa
            const cameraDirection = new THREE.Vector3();
            CameraManager.updateThirdPersonCamera(model, delta, isRunning, cameraAngleX, cameraAngleY);
            currentCamera.getWorldDirection(cameraDirection);
            cameraDirection.y = 0;
            cameraDirection.normalize();

            const forward = cameraDirection.clone();
            const right = new THREE.Vector3().crossVectors(
                forward,
                new THREE.Vector3(0, 1, 0)
            ).normalize();

            intendedMovement.addScaledVector(forward, -direction.z);
            intendedMovement.addScaledVector(right, direction.x);
            intendedMovement.multiplyScalar(playerSpeed * speedMultiplier);

        } else if (CameraManager.cameraMode === 2) {
            // Modo ORBITAL (fazendo Steve se mover)
            // Atualiza o orbitControls para permitir rotação livre da câmera
            CameraManager.orbitControls.update();

            const cameraDirection = new THREE.Vector3();
            currentCamera.getWorldDirection(cameraDirection);
            cameraDirection.y = 0;
            cameraDirection.normalize();

            const forward = cameraDirection.clone();
            const right = new THREE.Vector3().crossVectors(
                forward,
                new THREE.Vector3(0, 1, 0)
            ).normalize();

            intendedMovement.addScaledVector(forward, -direction.z);
            intendedMovement.addScaledVector(right, direction.x);
            intendedMovement.multiplyScalar(playerSpeed * speedMultiplier);
        }

        // Aplica o movimento ao velocity
        velocity.x = intendedMovement.x;
        velocity.z = intendedMovement.z;

    } else {
        // Se não há input, desacelera gradualmente
        velocity.x *= 0.8;
        velocity.z *= 0.8;
    }

    // Aplica gravidade
    velocity.y -= gravity * delta;

    // Tenta mover no eixo X
    let newPosX = model.position.x + velocity.x * delta;
    if (
        isPositionInLoadedChunk(new THREE.Vector3(newPosX, model.position.y, model.position.z)) &&
        !isPositionColliding(new THREE.Vector3(newPosX, model.position.y, model.position.z))
    ) {
        model.position.x = newPosX;
    } else {
        velocity.x = 0;
    }

    // Tenta mover no eixo Y (pulo, gravidade)
    let newPosY = model.position.y + velocity.y * delta;
    if (
        isPositionInLoadedChunk(new THREE.Vector3(model.position.x, newPosY, model.position.z)) &&
        !isPositionColliding(new THREE.Vector3(model.position.x, newPosY, model.position.z))
    ) {
        model.position.y = newPosY;
        canJump = false;
    } else {
        if (velocity.y < 0) {
            canJump = true; // Se bateu no chão, pode pular de novo
        }
        velocity.y = 0;
    }

    // Tenta mover no eixo Z
    let newPosZ = model.position.z + velocity.z * delta;
    if (
        isPositionInLoadedChunk(new THREE.Vector3(model.position.x, model.position.y, newPosZ)) &&
        !isPositionColliding(new THREE.Vector3(model.position.x, model.position.y, newPosZ))
    ) {
        model.position.z = newPosZ;
    } else {
        velocity.z = 0;
    }

    // Limita o player a não sair do plano
    model.position.x = THREE.MathUtils.clamp(
        model.position.x,
        -HALF_PLANE_SIZE + playerWidth / 2,
        HALF_PLANE_SIZE - playerWidth / 2
    );
    model.position.z = THREE.MathUtils.clamp(
        model.position.z,
        -HALF_PLANE_SIZE + playerDepth / 2,
        HALF_PLANE_SIZE - playerDepth / 2
    );

    // Ajusta a rotação do Steve (apenas se estiver se movendo)
    if (direction.length() > 0) {
        const targetAngle = Math.atan2(intendedMovement.x, intendedMovement.z);
        model.rotation.y = smoothAngle(model.rotation.y, targetAngle, STEVE_ROTATION_SPEED, delta);
    }

    // Atualiza sons e animações
    window.soundManager.update(model, blockTypeMap);
    updateAnimations();
}


function updateAnimations() {
    if (!mixer || !actions["walk"] || !actions["idle"]) return;
    let newAction = null;
    if (direction.length() > 0) {
        newAction = actions["walk"];
    } else {
        newAction = actions["idle"];
    }
    if (activeAction !== newAction) {
        if (activeAction) activeAction.fadeOut(0.2);
        newAction.reset().fadeIn(0.2).play();
        activeAction = newAction;
    }
}

function isPositionInLoadedChunk(position) {
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    return loadedChunks.has(`${chunkX},${chunkZ}`);
}

// -------------------
// FUNÇÃO loadEntireMapWithProgress()
// -------------------
// Essa função carrega TODOS os chunks do mapa de forma progressiva,
// exibindo uma tela de loading e atualizando o progresso.
// Ao final, ajusta a câmera de sombras e reposiciona o Steve.
async function loadEntireMapWithProgress() {
    const loadingScreen = document.getElementById("loading-screen");
    const startButton = document.getElementById("start-button");

    // Oculta o botão "Start"
    if (startButton) {
        startButton.style.display = "none";
    }

    loadingScreen.style.display = "flex";
    resetProgress();

    const halfPlaneChunks = Math.ceil(planeSize / CHUNK_SIZE / 2);
    const totalChunks = (halfPlaneChunks * 2 + 1) * (halfPlaneChunks * 2 + 1);
    incrementTotalTasks(totalChunks);

    let cx = -halfPlaneChunks;
    let cz = -halfPlaneChunks;

    async function generateNextChunk() {
        if (cx <= halfPlaneChunks) {
            generateChunk(cx, cz, false);
            // completedTasks++;
            // updateProgress(`Carregando mapa... (${completedTasks}/${totalChunks * 2})`);

            cz++;
            if (cz > halfPlaneChunks) {
                cz = -halfPlaneChunks;
                cx++;
            }

            // Processa 5 chunks por frame, por exemplo
            for (let i = 0; i < 128 && cx <= halfPlaneChunks; i++) {
                if (cz <= halfPlaneChunks) {
                    generateChunk(cx, cz, false);
                    completedTasks++;
                    updateProgress(`Carregando mapa... (${completedTasks}/${totalChunks * 2})`);
                    cz++;
                }
            }

            await new Promise(resolve => requestAnimationFrame(resolve));
            return generateNextChunk();
        } else {
            finalizeLoading();
            resetProgress();
        }
    }

    function finalizeLoading() {
        directionalLight.shadow.camera.left = -planeSize / 2;
        directionalLight.shadow.camera.right = planeSize / 2;
        directionalLight.shadow.camera.top = planeSize / 2;
        directionalLight.shadow.camera.bottom = -planeSize / 2;
        directionalLight.shadow.camera.far = planeSize * 2;
        directionalLight.shadow.camera.updateProjectionMatrix();
        shadowCameraHelper.update();

        const sy = getTerrainHeight(model.position.x, model.position.z) * voxelSize + playerHeight + 2;
        model.position.y = sy;

        updateProgress("Mapa carregado.");
        loadingScreen.style.display = "none";
    }

    await generateNextChunk();
}


// -------------------
// INICIALIZAÇÃO
// -------------------
window.onload = init;
