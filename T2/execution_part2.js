import * as THREE from "three";
import { OrbitControls } from "../build/jsm/controls/OrbitControls.js";
import Stats from "../build/jsm/libs/stats.module.js";
import { PerlinNoise } from "./perlin.js";
import { GLTFLoader } from "../build/jsm/loaders/GLTFLoader.js";

// -------------------
// CONFIGURAÇÕES GERAIS
// -------------------
const planeSize = 200; // Tamanho do "mundo"
const voxelSize = 1.0; // Tamanho de cada cubo (1x1x1)
const playerSpeed = 3; // Velocidade de movimento do personagem
const jumpSpeed = 10.0; // Velocidade do pulo
const gravity = 25; // Força da gravidade
let mouseSensitivityX = 0.0015; // Atualizado para refletir valor padrão de 3
let mouseSensitivityY = 0.0015; // Atualizado para refletir valor padrão de 3
let invertY = false;

// Número de árvores que você deseja spawnar
let totalTreesNeeded = 50;

// Adicione estas variáveis globais
let loadedChunks = new Set(); // Guarda as chunks já carregadas
const CHUNK_SIZE = 16; // Tamanho de cada chunk
let currentFogDistance = 30; // Distância atual da névoa
let fogEnabled = true; // Controle da névoa

// Configurações do personagem
const playerHeight = 1.6;
const playerWidth = 0.6;
const playerDepth = 0.6;

const BLOCK_TYPES = {
    GRASS: 0,
    DIRT: 1,
    STONE: 2,
    TRUNK: 3,
    LEAVES: 4,
    SNOW: 5,
    TREE: 6,
    SAND: 7, // Novo tipo para areia
    WATER: 8, // Novo tipo para água
};

// Tabelas de blocos e cores
const typeHeightMap = {
    [BLOCK_TYPES.GRASS]: 1, // Grama
    [BLOCK_TYPES.DIRT]: 3, // Terra (3 camadas)
    [BLOCK_TYPES.STONE]: 20, // Pedra (até o limite)
    [BLOCK_TYPES.SNOW]: 1, // Neve (1 camada)
};

const colorMap = {
    [BLOCK_TYPES.GRASS]: 0x00ff00, // Verde grama
    [BLOCK_TYPES.DIRT]: 0xffa500, // Laranja terra
    [BLOCK_TYPES.STONE]: 0x808080, // Cinza pedra
    [BLOCK_TYPES.TRUNK]: 0x8b4513, // Marrom tronco
    [BLOCK_TYPES.LEAVES]: 0x006400, // Verde escuro folhagem
    [BLOCK_TYPES.SNOW]: 0xffffff, // Branco neve
    [BLOCK_TYPES.TREE]: 0x892cdc, // Roxo árvore
    [BLOCK_TYPES.SAND]: 0xffff00, // Amarelo areia
    [BLOCK_TYPES.WATER]: 0x1e90ff, // Azul água
};

// -------------------
// VARIÁVEIS GLOBAIS
// -------------------
let scene, renderer, clock, stats;
const HALF_PLANE_SIZE = planeSize / 2;
// Câmeras
let orbitCamera, thirdPersonCamera;
let orbitControls;
let currentCamera;
let isOrbit = false; // false => inicia em terceira pessoa
let cameraAngleY = 0; // Rotação horizontal
let cameraAngleX = 0; // Rotação vertical
let cameraReturnTimeout;
const CAMERA_RETURN_DELAY = 3000; // 3 segundos
const cameraDistance = 6; // Distância da câmera ao jogador
const cameraHeight = 3; // Altura da câmera acima do jogador
let secondaryDirectionalLight;
let secondaryDirectionalLightHelper;
let cameraRealignTimer = null;
let cameraShouldRealign = false; // quando true, a câmera alinha-se atrás do Steve
const DEFAULT_FOV = 75; // Default FOV for walking
const RUNNING_FOV = 90; // Increased FOV for running
const FOV_LERP_SPEED = 5; // Speed of transition between FOV values

// Personagem e animações
let model; // Mesh do Steve
let mixer; // AnimationMixer do Steve
let animationsMap = new Map();
let actions = {};
let activeAction = null;

// Dados do terreno
let grassPositions = [];
let dirtPositions = [];
let stonePositions = [];
let snowPositions = []; // Novo array para neve
let terrainHeightMap = {}; // { "x,z": alturaMax }
let occupiedBlocks = new Set();
const seaLevel = 10; // Nível do mar
let blockTypeMap = {};

// Árvores
const treeFiles = ["tree1.json", "tree2.json", "tree3.json"];
let treePositions = new Set(); // Para não sobrepor árvores na mesma posição

// Movimentação
let steveTargetAngle = 0; // ângulo para onde Steve deve girar (rad)
const STEVE_ROTATION_SPEED = 5; // quanto maior, mais rápido a rotação converge
let velocity = new THREE.Vector3(0, 0, 0);
let direction = new THREE.Vector3(0, 0, 0);
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isRunning = false; // Indicates if the player is running
let lastWPressTime = 0; // Tracks the time of the last W key press
const RUN_SPEED_MULTIPLIER = 2; // Multiplier for running speed
const DOUBLE_TAP_DELAY = 300; // Maximum delay (in ms) between taps to trigger running

// Animação de caminhada
const WALK_ANIMATION_NAME = "animation.steve.walk";
const IDLE_ANIMATION_NAME = "animation.steve.idle";

// -------------------
// FUNÇÃO PRINCIPAL init()
// -------------------
function init() {
    // Cena, clock, stats
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    scene.background = new THREE.Color(0x87ceeb); // "céu"
    // Névoa
    scene.fog = new THREE.Fog(0x87ceeb, 1, currentFogDistance);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById("webgl-output").appendChild(renderer.domElement);

    setupMouseControls();

    // Iluminação
    setupLights();
    setupSecondaryLight();

    // Câmeras
    setupCameras();
    setupCameraControls();

    // Gera (ou inicializa) terreno
    generateTerrain();

    // Carrega as árvores (distribui no mapa)
    loadAllTrees();

    // Carrega o personagem (Steve)
    loadCharacter();

    // Carrega os NPCs após um pequeno atraso para garantir que o terreno esteja carregado
    setTimeout(() => {
        //loadNPCs();
    }, 2000); // Ajuste o tempo conforme necessário

    // Configura HUD de Névoa e FPS
    setupFogControls();
    setupFPSCounter();
    updateInvertYStatus();

    // Completa occupiedBlocks
    populateOccupiedBlocks();

    // Eventos
    window.addEventListener("resize", onWindowResize, false);
    setupKeyboardEvents();

    // Loop
    animate();
}

// -------------------
// LUZES
// -------------------
let directionalLight;
let shadowHelper;
let ambientLight;
let shadowCameraHelper;

function setupLights() {
    // Luz Direcional Principal
    directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50); // Posição inicial, será atualizada dinamicamente
    directionalLight.castShadow = true;

    // Configurações da Shadow Map
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.bias = -0.0005;

    const shadowCamSize = 100;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;

    scene.add(directionalLight);

    // Helper da Shadow Camera
    shadowCameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    shadowCameraHelper.visible = false; // Inicialmente oculto
    scene.add(shadowCameraHelper);

    // Helper da Luz Direcional
    const directionalLightHelper = new THREE.DirectionalLightHelper(
        directionalLight,
        10
    );
    directionalLightHelper.visible = false;
    scene.add(directionalLightHelper);

    // Luz Ambiente Suave
    ambientLight = new THREE.AmbientLight(0xb8c406, 0.3); // Cor e intensidade
    scene.add(ambientLight);
}

// -------------------
// CÂMERAS
// -------------------
function setupCameras() {
    // Orbit
    orbitCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    // Inicia com mais zoom
    orbitCamera.position.set(0, 150, 0); // Aumentei a posição Y para mais zoom
    orbitCamera.lookAt(0, 0, 0);

    orbitControls = new OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.enableDamping = true; // Suaviza os movimentos
    orbitControls.enablePan = true;
    orbitControls.enableZoom = true;
    orbitControls.minDistance = 50; // Aumentei a distância mínima
    orbitControls.maxDistance = planeSize;
    orbitControls.maxPolarAngle = Math.PI / 2;
    orbitControls.update();

    // Terceira pessoa
    thirdPersonCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    thirdPersonCamera.position.set(0, 3, -6);
    thirdPersonCamera.lookAt(0, 0, 0);

    // Inicia em terceira pessoa
    currentCamera = thirdPersonCamera;
}

function setupCameraControls() {
    // Sensibilidade X
    const sensX = document.getElementById("sensX");
    const sensXValue = document.getElementById("sensXValue");
    sensX.value = 3; // Atualizado para 3
    mouseSensitivityX = mapSensitivity(parseFloat(sensX.value)); // Atualizar sensibilidade inicial
    sensXValue.textContent = sensX.value;
    sensX.addEventListener("input", () => {
        const uiValue = parseFloat(sensX.value);
        mouseSensitivityX = mapSensitivity(uiValue);
        sensXValue.textContent = uiValue.toFixed(1);
    });

    // Sensibilidade Y
    const sensY = document.getElementById("sensY");
    const sensYValue = document.getElementById("sensYValue");
    sensY.value = 3; // Atualizado para 3
    mouseSensitivityY = mapSensitivity(parseFloat(sensY.value)); // Atualizar sensibilidade inicial
    sensYValue.textContent = sensY.value;
    sensY.addEventListener("input", () => {
        const uiValue = parseFloat(sensY.value);
        mouseSensitivityY = mapSensitivity(uiValue);
        sensYValue.textContent = uiValue.toFixed(1);
    });

    // Status da inversão do eixo Y
    const invertYStatus = document.getElementById("invertYStatus");
}

function toggleCamera() {
    if (isOrbit) {
        // Sai do orbit => vai para terceira pessoa
        orbitControls.enabled = false;
        currentCamera = thirdPersonCamera;
    } else {
        // Vai para orbit
        orbitControls.enabled = true;
        // Remover a vinculação ao modelo
        // if (model) {
        //     orbitControls.target.copy(model.position);
        // }
        currentCamera = orbitCamera;
    }
    isOrbit = !isOrbit;
}

// -------------------
// TERRENO
// -------------------
const perlin = new PerlinNoise();

function generateTerrain() {
    // Não gera todo o terreno de uma vez (pois é chunk-based).
    // Apenas configuramos a névoa inicialmente.
    scene.fog = new THREE.Fog(0x87ceeb, 1, currentFogDistance);
}

// Gera uma chunk específica
function generateChunk(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (loadedChunks.has(chunkKey)) return;

    const amplitude = 40;
    const frequency = 0.04;
    const baseHeight = 1;
    const terraLayers = typeHeightMap[BLOCK_TYPES.DIRT];
    const snowThreshold = 25;

    const positions = {
        grass: [],
        dirt: [],
        stone: [],
        snow: [],
        sand: [], // Novo array para areia
        water: [], // Novo array para água
    };

    // Gera terreno apenas para esta chunk
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;

            // Se estiver fora do limite do mundo, ignore
            if (
                Math.abs(worldX) >= planeSize / 2 ||
                Math.abs(worldZ) >= planeSize / 2
            )
                continue;

            const noiseVal = perlin.noise(worldX * frequency, worldZ * frequency, 0);
            let y = Math.floor(noiseVal * amplitude) + baseHeight;
            let clampedY = Math.min(y, 30);

            // Determina se este ponto está abaixo do nível do mar
            if (clampedY < seaLevel) {
                // Preencha até o nível do mar com água
                for (let i = 0; i < seaLevel; i++) {
                    const type = BLOCK_TYPES.WATER;
                    const blockPos = { x: worldX, y: i, z: worldZ };
                    positions.water.push(blockPos);

                    // Atualiza blockTypeMap
                    blockTypeMap[`${worldX},${i},${worldZ}`] = type;

                    // Atualiza o heightMap
                    const key = `${worldX},${worldZ}`;
                    if (!terrainHeightMap[key] || i + 1 > terrainHeightMap[key]) {
                        terrainHeightMap[key] = i + 1;
                    }

                    // Marca como bloco ocupado (para colisão)
                    occupiedBlocks.add(`${worldX},${i},${worldZ}`);
                }
            } else {
                // Acima do nível do mar, gerar terreno normal
                for (let i = 0; i < clampedY; i++) {
                    let type;
                    if (i === clampedY - 1) {
                        if (clampedY <= seaLevel) {
                            // Acima do nível do mar, camada superficial: grama
                            type = BLOCK_TYPES.GRASS;
                        } else if (clampedY === seaLevel + 1) {
                            // Primeira camada acima do nível do mar: areia
                            type = BLOCK_TYPES.SAND;
                        } else if (clampedY >= snowThreshold) {
                            // Neve
                            type = BLOCK_TYPES.SNOW;
                        } else {
                            // Bloco superficial: grama
                            type = BLOCK_TYPES.GRASS;
                        }
                    } else if (i >= clampedY - 1 - terraLayers) {
                        // Blocos de terra logo abaixo da superfície
                        type = BLOCK_TYPES.DIRT;
                    } else {
                        // Restante: pedra
                        type = BLOCK_TYPES.STONE;
                    }

                    const blockPos = { x: worldX, y: i, z: worldZ };

                    switch (type) {
                        case BLOCK_TYPES.GRASS:
                            positions.grass.push(blockPos);
                            break;
                        case BLOCK_TYPES.DIRT:
                            positions.dirt.push(blockPos);
                            break;
                        case BLOCK_TYPES.STONE:
                            positions.stone.push(blockPos);
                            break;
                        case BLOCK_TYPES.SNOW:
                            positions.snow.push(blockPos);
                            break;
                        case BLOCK_TYPES.SAND:
                            positions.sand.push(blockPos);
                            break;
                        // Água já foi tratada acima
                        default:
                            break;
                    }

                    // Registra o tipo no blockTypeMap
                    blockTypeMap[`${worldX},${i},${worldZ}`] = type;

                    // Atualiza o heightMap
                    const key = `${worldX},${worldZ}`;
                    if (!terrainHeightMap[key] || i + 1 > terrainHeightMap[key]) {
                        terrainHeightMap[key] = i + 1;
                    }

                    // Marca como bloco ocupado (para colisão)
                    occupiedBlocks.add(`${worldX},${i},${worldZ}`);
                }
            }
        }
    }

    // Cria as meshes para esta chunk
    const meshes = {
        grass: createInstancedMesh(positions.grass, colorMap[BLOCK_TYPES.GRASS]),
        dirt: createInstancedMesh(positions.dirt, colorMap[BLOCK_TYPES.DIRT]),
        stone: createInstancedMesh(positions.stone, colorMap[BLOCK_TYPES.STONE]),
        snow: createInstancedMesh(positions.snow, colorMap[BLOCK_TYPES.SNOW]),
        sand: createInstancedMesh(positions.sand, colorMap[BLOCK_TYPES.SAND]),
        water: createInstancedMesh(positions.water, colorMap[BLOCK_TYPES.WATER]),
    };

    // Adiciona as meshes à cena
    Object.entries(meshes).forEach(([key, mesh]) => {
        if (mesh) {
            mesh.userData.chunkKey = chunkKey;
            scene.add(mesh);
        }
    });

    loadedChunks.add(chunkKey);
}

function updateChunks() {
    if (!model) return;

    const playerChunkX = Math.floor(model.position.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(model.position.z / CHUNK_SIZE);

    // Define chunksToLoad com base no estado da névoa
    const chunksToLoad = fogEnabled
        ? Math.ceil(currentFogDistance / CHUNK_SIZE)
        : Math.ceil(planeSize / CHUNK_SIZE);

    // Carrega as chunks em volta do jogador num raio
    for (let dx = -chunksToLoad; dx <= chunksToLoad; dx++) {
        for (let dz = -chunksToLoad; dz <= chunksToLoad; dz++) {
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance <= chunksToLoad) {
                generateChunk(playerChunkX + dx, playerChunkZ + dz);
            }
        }
    }

    // Remove chunks que estão longe do jogador
    const maxDistance = chunksToLoad + 1;
    scene.children.forEach((child) => {
        if (child.userData.chunkKey) {
            const [chunkX, chunkZ] = child.userData.chunkKey.split(",").map(Number);
            const distance = Math.sqrt(
                Math.pow(chunkX - playerChunkX, 2) + Math.pow(chunkZ - playerChunkZ, 2)
            );

            if (distance > maxDistance) {
                scene.remove(child);
                loadedChunks.delete(child.userData.chunkKey);
            }
        }
    });
}

function createInstancedMesh(positions, color) {
    if (!positions || positions.length === 0) return null;
    const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    let materialOptions = { color };

    const material = new THREE.MeshLambertMaterial(materialOptions);
    const instancedMesh = new THREE.InstancedMesh(
        geometry,
        material,
        positions.length
    );

    const dummy = new THREE.Object3D();
    for (let i = 0; i < positions.length; i++) {
        const { x, y, z } = positions[i];
        dummy.position.set(x, y * voxelSize + voxelSize / 2, z);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    return instancedMesh;
}

function getTerrainHeight(x, z) {
    const key = `${Math.round(x)},${Math.round(z)}`;
    return terrainHeightMap[key] || 0;
}

// -------------------
// ÁRVORES
// -------------------

// Carrega todos os arquivos .json de árvores e posiciona no mapa
function loadAllTrees() {
    const treePromises = treeFiles.map((file) =>
        fetch(file).then((resp) => {
            if (!resp.ok) throw new Error(`Erro ao carregar ${file}: ${resp.status}`);
            return resp.json();
        })
    );

    Promise.all(treePromises)
        .then((treesData) => {
            let treesAdded = 0;
            let attempts = 0;
            const maxAttempts = totalTreesNeeded * 5; // Aumentado para mais tentativas

            while (treesAdded < totalTreesNeeded && attempts < maxAttempts) {
                const randomTree =
                    treesData[Math.floor(Math.random() * treesData.length)];

                // Sorteia posição dentro do planeSize
                const rx =
                    Math.floor(Math.random() * planeSize) - Math.floor(planeSize / 2);
                const rz =
                    Math.floor(Math.random() * planeSize) - Math.floor(planeSize / 2);

                // Gera a chunk necessária
                const chunkX = Math.floor(rx / CHUNK_SIZE);
                const chunkZ = Math.floor(rz / CHUNK_SIZE);
                generateChunk(chunkX, chunkZ);

                // Obtém altura exata do terreno
                const baseY = getTerrainHeight(rx, rz);

                // Verifica se é uma posição válida
                if (
                    baseY !== undefined &&
                    !isTreePositionOccupied(rx, rz) &&
                    canPlaceTree(randomTree, rx, baseY, rz)
                ) {
                    // Tenta adicionar a árvore
                    if (addTree(randomTree, rx, baseY, rz)) {
                        treesAdded++;
                        treePositions.add(`${rx},${rz}`);
                    }
                }

                attempts++;
            }

            if (treesAdded < totalTreesNeeded) {
                console.warn(
                    `Apenas ${treesAdded} árvores foram adicionadas após ${attempts} tentativas`
                );
            }
        })
        .catch((err) => console.error("Erro ao carregar árvores:", err));
}

function isTreePositionOccupied(x, z) {
    const key = `${x},${z}`;
    if (treePositions.has(key)) return true;
    treePositions.add(key);
    return false;
}

function addTree(treeData, baseX, baseY, baseZ) {
    // 1) Achar o voxel que representa a BASE do tronco (menor Y, type=3)
    const trunkVoxels = treeData.filter((v) => v.type === 3);
    if (trunkVoxels.length === 0) {
        console.warn("Árvore sem tronco (type=3)!");
        return false;
    }
    // voxel de tronco mais embaixo
    let baseTrunkVoxel = trunkVoxels[0];
    for (let i = 1; i < trunkVoxels.length; i++) {
        if (trunkVoxels[i].y < baseTrunkVoxel.y) {
            baseTrunkVoxel = trunkVoxels[i];
        }
    }
    // 2) Descobrir a altura do terreno exatamente em baseX, baseZ
    const terrainBaseY = getTerrainHeight(baseX, baseZ);
    if (!Number.isFinite(terrainBaseY)) return false;

    // 3) Calcular o "offsetY" para alinhar o tronco ao chão
    // Queremos que baseTrunkVoxel.y vá para terrainBaseY
    const offsetY = terrainBaseY - baseTrunkVoxel.y;

    // Agora coloca cada voxel da árvore
    treeData.forEach((voxel) => {
        const { x, y, z, type } = voxel;

        // Ajuste de X e Z subtraindo o XZ do voxel-base do tronco
        const worldX = baseX + (x - baseTrunkVoxel.x);
        const worldY = y + offsetY;
        const worldZ = baseZ + (z - baseTrunkVoxel.z);

        // Só adiciona se for tronco ou folhas
        if (type === 3 || type === 4 || type === 6) {
            const color = colorMap[type];
            const mat = new THREE.MeshLambertMaterial({ color });
            const box = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
            const mesh = new THREE.Mesh(box, mat);

            // Posiciona o voxel - note o uso de voxelSize/2 para centralizar
            mesh.position.set(worldX, worldY * voxelSize + voxelSize / 2, worldZ);

            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);

            // Registra o bloco como ocupado
            occupiedBlocks.add(`${worldX},${worldY},${worldZ}`);
        }
    });

    return true;
}

// Função auxiliar para verificar se há espaço para a árvore
function canPlaceTree(treeData, baseX, baseY, baseZ) {
    // Verifica se há terreno sólido na base
    let hasGroundContact = false;

    // Verifica uma área 3x3 na base
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const worldX = Math.floor(baseX + dx);
            const worldZ = Math.floor(baseZ + dz);
            const key = `${worldX},${baseY - 1},${worldZ}`;

            if (occupiedBlocks.has(key)) {
                hasGroundContact = true;
            }
        }
    }

    if (!hasGroundContact) {
        return false;
    }

    // Verifica se há espaço para a árvore
    const minY = Math.min(...treeData.map((v) => v.y));
    return treeData.every((voxel) => {
        const worldX = Math.floor(baseX + voxel.x);
        const worldY = Math.floor(baseY + (voxel.y - minY));
        const worldZ = Math.floor(baseZ + voxel.z);
        return !occupiedBlocks.has(`${worldX},${worldY},${worldZ}`);
    });
}
// -------------------
// PERSONAGEM (Steve)
// -------------------
let steveCollisionBox = new THREE.Box3();

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
                }
            });

            // Posição inicial (no centro, mas você pode trocar)
            const startX = 0;
            const startZ = 0;

            setTimeout(() => {
                const startY = getTerrainHeight(startX, startZ);

                // Posiciona o modelo acima do terreno
                model.position.set(
                    startX,
                    startY * voxelSize + playerHeight + 10,
                    startZ
                );

                // Ajuste de escala (se desejar)
                model.scale.set(1.5, 1.5, 1.5);

                scene.add(model);

                // ======== Animações ========
                mixer = new THREE.AnimationMixer(model);
                gltf.animations.forEach((clip) => {
                    console.log(clip);
                    animationsMap.set(clip.name, clip);
                });

                // Cria ação "walk"
                if (animationsMap.has(WALK_ANIMATION_NAME)) {
                    actions["walk"] = mixer.clipAction(
                        animationsMap.get(WALK_ANIMATION_NAME)
                    );
                    actions["walk"].setLoop(THREE.LoopRepeat);
                    actions["walk"].clampWhenFinished = true;
                    actions["walk"].enable = true;
                }

                // Cria ação "idle"
                if (animationsMap.has(IDLE_ANIMATION_NAME)) {
                    actions["idle"] = mixer.clipAction(
                        animationsMap.get(IDLE_ANIMATION_NAME)
                    );
                    actions["idle"].setLoop(THREE.LoopRepeat);
                    actions["idle"].clampWhenFinished = true;
                    actions["idle"].enable = true;
                }

                // No início, nenhuma animação tocando
                activeAction = null;

                // // ======== Caixa de colisão ========
                // const halfWidth = playerWidth / 2;    // playerWidth = 0.6  => halfWidth = 0.3
                // const halfHeight = playerHeight / 2;  // playerHeight = 1.6 => halfHeight = 0.8
                // const halfDepth = playerDepth / 2;    // playerDepth = 0.6  => halfDepth = 0.3
                //
                // steveCollisionBox = new THREE.Box3(
                //     new THREE.Vector3(model.position.x - halfWidth, model.position.y, model.position.z - halfDepth),
                //     new THREE.Vector3(model.position.x + halfWidth, model.position.y + playerHeight, model.position.z + halfDepth)
                // );

                // createCollisionBoxHelper();

                // Gera chunks iniciais ao redor do personagem
                // const playerChunkX = Math.floor(startX / CHUNK_SIZE);
                // const playerChunkZ = Math.floor(startZ / CHUNK_SIZE);
                // const initialRadius = Math.ceil(currentFogDistance / CHUNK_SIZE);
                //
                // for (let dx = -initialRadius; dx <= initialRadius; dx++) {
                //     for (let dz = -initialRadius; dz <= initialRadius; dz++) {
                //         if (Math.sqrt(dx * dx + dz * dz) <= initialRadius) {
                //             generateChunk(playerChunkX + dx, playerChunkZ + dz);
                //         }
                //     }
                // }
            }, 100);
        },
        undefined,
        (err) => console.error("Erro ao carregar steve:", err)
    );
}

// Preenche occupiedBlocks com posições iniciais de terreno
function populateOccupiedBlocks() {
    grassPositions.forEach((pos) =>
        occupiedBlocks.add(`${pos.x},${pos.y},${pos.z}`)
    );
    dirtPositions.forEach((pos) =>
        occupiedBlocks.add(`${pos.x},${pos.y},${pos.z}`)
    );
    stonePositions.forEach((pos) =>
        occupiedBlocks.add(`${pos.x},${pos.y},${pos.z}`)
    );
    snowPositions.forEach((pos) =>
        occupiedBlocks.add(`${pos.x},${pos.y},${pos.z}`)
    );
}

// -------------------
// EVENTOS
// -------------------
function onWindowResize() {
    const w = window.innerWidth,
        h = window.innerHeight;
    orbitCamera.aspect = w / h;
    orbitCamera.updateProjectionMatrix();
    thirdPersonCamera.aspect = w / h;
    thirdPersonCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function setupKeyboardEvents() {
    window.addEventListener("keydown", (e) => {
        switch (e.code) {
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

// Para verificar rapidamente se a posição está em uma chunk carregada
function isPositionInLoadedChunk(position) {
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    return loadedChunks.has(`${chunkX},${chunkZ}`);
}

// -------------------
// NÉVOA e FPS
// -------------------
function setupFogControls() {
    const fogRange = document.getElementById("fogRange");
    const fogValue = document.getElementById("fogValue");
    const fogToggle = document.getElementById("fogToggle");

    if (!fogRange || !fogValue || !fogToggle) return;

    fogRange.addEventListener("input", () => {
        if (fogEnabled) {
            // Só atualiza a distância se a névoa estiver habilitada
            currentFogDistance = Number(fogRange.value);
            fogValue.textContent = currentFogDistance;
            if (scene.fog) {
                scene.fog.far = currentFogDistance;
            } else {
                scene.fog = new THREE.Fog(0x87ceeb, 1, currentFogDistance);
            }
            var fogMult = 2;

            if (directionalLight) {
                const scSize = currentFogDistance;
                directionalLight.shadow.camera.left = -scSize;
                directionalLight.shadow.camera.right = scSize;
                directionalLight.shadow.camera.top = scSize;
                directionalLight.shadow.camera.bottom = -scSize;
                if (currentFogDistance <= 60) {
                    if (currentFogDistance >= 50) {
                        fogMult = 4;
                    } else if (currentFogDistance >= 40) {
                        fogMult = 6;
                    } else if (currentFogDistance >= 30) {
                        fogMult = 8;
                    } else if (currentFogDistance >= 20) {
                        fogMult = 10;
                    } else if (currentFogDistance >= 10) {
                        fogMult = 12;
                    }
                }
                directionalLight.shadow.camera.far = currentFogDistance * fogMult;
                directionalLight.shadow.camera.updateProjectionMatrix();

                // Atualiza o helper da Shadow Camera
                shadowCameraHelper.update();
            }
        }
    });

    // Checkbox para desativar/ativar a névoa
    fogToggle.addEventListener("change", () => {
        fogEnabled = !fogToggle.checked;
        if (fogEnabled) {
            // Habilita a névoa com a distância atual
            if (scene.fog) {
                scene.fog.near = 1;
                scene.fog.far = currentFogDistance;
            } else {
                scene.fog = new THREE.Fog(0x87ceeb, 1, currentFogDistance);
            }
        } else {
            // Remove a névoa
            scene.fog = null;
        }

        // Atualiza os chunks imediatamente
        updateChunks();
    });

    // Sincroniza o valor inicial
    currentFogDistance = Number(fogRange.value);
    fogValue.textContent = currentFogDistance;
    if (scene.fog) {
        scene.fog.far = currentFogDistance;
    } else {
        scene.fog = new THREE.Fog(0x87ceeb, 1, currentFogDistance);
    }
}

function setupFPSCounter() {
    stats = new Stats();
    stats.showPanel(0);
    const fpsDiv = document.getElementById("fps-counter");
    if (fpsDiv) fpsDiv.appendChild(stats.dom);
}

// -------------------
// LOOP DE ANIMAÇÃO
// -------------------
function animate() {
    requestAnimationFrame(animate);
    stats && stats.begin();

    const delta = clock.getDelta();

    // Atualiza animações do jogador
    if (mixer) mixer.update(delta);

    handleMovement(delta);

    if (currentCamera === orbitCamera && orbitControls.enabled) {
        orbitControls.update();
    } else {
        updateThirdPersonCamera(delta);
    }

    updateChunks();

    // Atualiza a posição da luz direcional para seguir o personagem
    if (model) {
        const lightOffset = new THREE.Vector3(50, 100, 50);
        directionalLight.position.copy(model.position).add(lightOffset);
        directionalLight.target.position.copy(model.position);
        directionalLight.shadow.camera.updateProjectionMatrix();

        shadowCameraHelper.update();
    }
    //console.log(fogValue);

    renderer.render(scene, currentCamera);
    stats && stats.end();
}

// -------------------
// COLISÃO E MOVIMENTAÇÃO
// -------------------
// Variável global para armazenar o helper da tempBox
let tempBoxHelper;

function isPositionColliding(newPosition) {
    // Define as metades das dimensões do personagem (para X e Z)
    const halfWidth = playerWidth / 2;
    const halfDepth = playerDepth / 2;

    // Como o pivô está nos pés, usamos newPosition.y como base e newPosition.y + playerHeight como topo.
    // Verifica se a nova posição está dentro dos limites do mapa
    if (
        newPosition.x + halfWidth > HALF_PLANE_SIZE ||
        newPosition.x - halfWidth < -HALF_PLANE_SIZE ||
        newPosition.z + halfDepth > HALF_PLANE_SIZE ||
        newPosition.z - halfDepth < -HALF_PLANE_SIZE
    ) {
        return true; // Colisão com os limites do mapa
    }

    // Cria uma caixa de colisão temporária na nova posição
    // Como o pivô está nos pés, a caixa inicia em newPosition.y e vai até newPosition.y + playerHeight
    const tempBox = new THREE.Box3(
        new THREE.Vector3(
            newPosition.x - halfWidth,
            newPosition.y - 0.5,
            newPosition.z - halfDepth
        ),
        new THREE.Vector3(
            newPosition.x + halfWidth,
            newPosition.y + playerHeight + 1.4,
            newPosition.z + halfDepth
        )
    );

    // // Cria ou atualiza o helper da tempBox para depuração
    // if (!tempBoxHelper) {
    //     tempBoxHelper = new THREE.Box3Helper(tempBox, 0xff0000);
    //     scene.add(tempBoxHelper);
    // } else {
    //     tempBoxHelper.box.copy(tempBox);
    // }

    // Verifica colisões com blocos próximos para otimizar
    const checkRadius = 8;
    const posX = Math.round(newPosition.x);
    const posY = Math.round(newPosition.y);
    const posZ = Math.round(newPosition.z);

    for (let x = posX - checkRadius; x <= posX + checkRadius; x++) {
        for (let y = posY - checkRadius; y <= posY + checkRadius; y++) {
            for (let z = posZ - checkRadius; z <= posZ + checkRadius; z++) {
                const key = `${x},${y},${z}`;
                if (occupiedBlocks.has(key)) {
                    const blockBox = new THREE.Box3(
                        new THREE.Vector3(
                            x - voxelSize / 2,
                            y - voxelSize / 2,
                            z - voxelSize / 2
                        ),
                        new THREE.Vector3(
                            x + voxelSize / 2,
                            y + voxelSize / 2,
                            z + voxelSize / 2
                        )
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

    // Reseta direção
    direction.set(0, 0, 0);

    // Captura input de movimento
    if (moveForward) direction.z += 1;
    if (moveBackward) direction.z -= 1;
    if (moveLeft) direction.x += 1;
    if (moveRight) direction.x -= 1;

    // Normaliza e aplica velocidade
    if (direction.length() > 0) {
        direction.normalize();

        const speedMultiplier = isRunning ? RUN_SPEED_MULTIPLIER : 1; // Apply running multiplier
        velocity.x = direction.x * playerSpeed * speedMultiplier;
        velocity.z = direction.z * playerSpeed * speedMultiplier;

        // Movimento de rotação baseado na camera
        const rotatedVelocity = new THREE.Vector3(velocity.x, 0, velocity.z);
        rotatedVelocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngleY);

        velocity.x = rotatedVelocity.x;
        velocity.z = rotatedVelocity.z;
    } else {
        // Desacelara quando nao esta movendo
        velocity.x *= 0.8;
        velocity.z *= 0.8;
    }

    // Gravidade
    velocity.y -= gravity * delta;

    // Atualiza X
    let newPosX = model.position.x + velocity.x * delta;
    if (
        isPositionInLoadedChunk(
            new THREE.Vector3(newPosX, model.position.y, model.position.z)
        ) &&
        !isPositionColliding(
            new THREE.Vector3(newPosX, model.position.y, model.position.z)
        )
    ) {
        model.position.x = newPosX;
    } else {
        velocity.x = 0;
    }

    // Atualiza Y
    let newPosY = model.position.y + velocity.y * delta;
    if (
        isPositionInLoadedChunk(
            new THREE.Vector3(model.position.x, newPosY, model.position.z)
        ) &&
        !isPositionColliding(
            new THREE.Vector3(model.position.x, newPosY, model.position.z)
        )
    ) {
        model.position.y = newPosY;
        canJump = false;
    } else {
        if (velocity.y < 0) {
            // Está caindo
            canJump = true;
        }
        velocity.y = 0;
    }

    // Atualiza Z
    let newPosZ = model.position.z + velocity.z * delta;
    if (
        isPositionInLoadedChunk(
            new THREE.Vector3(model.position.x, model.position.y, newPosZ)
        ) &&
        !isPositionColliding(
            new THREE.Vector3(model.position.x, model.position.y, newPosZ)
        )
    ) {
        model.position.z = newPosZ;
    } else {
        velocity.z = 0;
    }

    // Garante que Steve não ultrapasse os limites do mapa
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

    // Verifica se está andando para decidir animação
    const isMoving = Math.abs(velocity.x) > 0.1 || Math.abs(velocity.z) > 0.1;
    if (isMoving) {
        if (actions["walk"] && activeAction !== actions["walk"]) {
            if (activeAction) activeAction.fadeOut(0.2); // fade out anima anterior
            actions["walk"].reset().fadeIn(0.2).play();
            activeAction = actions["walk"];
        }

        // Calcula o ângulo desejado a partir do vector velocity
        steveTargetAngle = Math.atan2(velocity.x, velocity.z);

        // Inicia/reseta o timer de realinhamento da câmera
        startCameraRealignTimer();
    } else {
        // Se não está se movendo, queremos animação "idle"
        if (actions["idle"] && activeAction !== actions["idle"]) {
            if (activeAction) activeAction.fadeOut(0.2);
            actions["idle"].reset().fadeIn(0.2).play();
            activeAction = actions["idle"];
        }
    }

    // Rotação suave do Steve para steveTargetAngle
    model.rotation.y = smoothAngle(
        model.rotation.y,
        steveTargetAngle,
        STEVE_ROTATION_SPEED,
        delta
    );

    updateCollisionBoxHelper();
}

let collisionBoxHelper;

function createCollisionBoxHelper() {
    collisionBoxHelper = new THREE.Box3Helper(steveCollisionBox, 0xff0000);
    scene.add(collisionBoxHelper);
}

function updateCollisionBoxHelper() {
    if (collisionBoxHelper && model) {
        const halfWidth = playerWidth / 2;
        const halfHeight = playerHeight / 2;
        const halfDepth = playerDepth / 2;

        steveCollisionBox.set(
            new THREE.Vector3(
                model.position.x - halfWidth,
                model.position.y - halfHeight,
                model.position.z - halfDepth
            ),
            new THREE.Vector3(
                model.position.x + halfWidth,
                model.position.y + halfHeight,
                model.position.z + halfDepth
            )
        );

        collisionBoxHelper.box.copy(steveCollisionBox);
    }
}


// -------------------
// CÂMERA DE TERCEIRA PESSOA
// -------------------
function startCameraRealignTimer() {
    // Se já existe um timer rolando, zere e inicie novamente
    if (cameraRealignTimer) {
        clearTimeout(cameraRealignTimer);
    }
    cameraShouldRealign = false;

    cameraRealignTimer = setTimeout(() => {
        // Depois de 3 segundos de movimento, se o usuário NÃO mexeu o mouse,
        // marcamos que a câmera deve se alinhar ao Steve
        cameraShouldRealign = true;
    }, CAMERA_RETURN_DELAY);
}

function smoothAngle(current, target, speed, delta) {
    // Normaliza a diferença para o intervalo [-PI, +PI]
    let diff = ((target - current + Math.PI) % (2 * Math.PI)) - Math.PI;
    // Interpola a rotação
    return current + diff * Math.min(1, speed * delta);
}

function setupSecondaryLight() {
    secondaryDirectionalLight = new THREE.DirectionalLight(0xffffff, 0.3); // Intensidade menor
    secondaryDirectionalLight.position.set(-50, 100, -50); // Direção oposta à luz principal
    secondaryDirectionalLight.castShadow = false; // Não projeta sombras

    scene.add(secondaryDirectionalLight);

    // Helper (opcional)
    secondaryDirectionalLightHelper = new THREE.DirectionalLightHelper(
        secondaryDirectionalLight,
        10
    );
    secondaryDirectionalLightHelper.visible = false;
    scene.add(secondaryDirectionalLightHelper);
}

function updateInvertYStatus() {
    const invertYStatus = document.getElementById("invertYStatus");
    if (invertYStatus) {
        invertYStatus.textContent = invertY ? "Sim" : "Não";
    }
}

function mapSensitivity(uiValue) {
    // Evita log de 0
    if (uiValue <= 0) return 0.0001;
    // Define a sensibilidade mínima e máxima
    const minSensitivity = 0.0001;
    const maxSensitivity = 0.01;
    // Mapeamento exponencial
    const sensitivity =
        minSensitivity * Math.pow(maxSensitivity / minSensitivity, uiValue / 10);
    return sensitivity;
}

function setupMouseControls() {
    document.addEventListener("mousemove", (event) => {
        if (!isOrbit && document.pointerLockElement === renderer.domElement) {
            let movementX = event.movementX * mouseSensitivityX;
            let movementY = event.movementY * mouseSensitivityY;

            if (invertY) {
                movementY = -movementY;
            }

            cameraAngleY -= movementX;
            cameraAngleX -= movementY;
            cameraAngleX = Math.max(
                -Math.PI / 2,
                Math.min(Math.PI / 2, cameraAngleX)
            );

            // Se o mouse está em uso, cancela o realinhamento
            cameraShouldRealign = false;
            if (cameraRealignTimer) {
                clearTimeout(cameraRealignTimer);
                cameraRealignTimer = null;
            }
        }
    });

    // Pointer Lock API para capturar mouse ao clicar no canvas apenas em terceira pessoa
    renderer.domElement.addEventListener("click", () => {
        if (!isOrbit && !document.pointerLockElement) {
            renderer.domElement.requestPointerLock();
        }
    });
}

function updateThirdPersonCamera(delta) {
    if (!model) return;

    // Ajusta o FOV dinamicamente para caso esteja correndo
    const DEFAULT_FOV = 75; // FOV padrão
    const RUNNING_FOV = 90; // FOV aumentado
    const FOV_LERP_SPEED = 5; // Velocidade de transição entre FOVs
    const targetFOV = isRunning ? RUNNING_FOV : DEFAULT_FOV;
    thirdPersonCamera.fov +=
        (targetFOV - thirdPersonCamera.fov) * delta * FOV_LERP_SPEED;
    thirdPersonCamera.updateProjectionMatrix();

    // Se a câmera deve se realinhar atrás do personagem,
    // suaviza o cameraAngleY para alinhar com model.rotation.y
    if (cameraShouldRealign) {
        cameraAngleY = smoothAngle(cameraAngleY, model.rotation.y, 2.5, delta);
    }

    // Calcula o deslocamento desejado da câmera com base nos ângulos
    const offsetX =
        Math.sin(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
    const offsetZ =
        Math.cos(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
    const offsetY = Math.sin(cameraAngleX) * cameraDistance;

    // Posição desejada da câmera
    let desiredPos = new THREE.Vector3(
        model.position.x - offsetX,
        model.position.y + cameraHeight + offsetY,
        model.position.z - offsetZ
    );

    // Obtém a altura do terreno na posição X e Z da câmera
    const terrainHeightAtCamera = getTerrainHeight(desiredPos.x, desiredPos.z);

    // Garante que a câmera fique acima do terreno
    const minCameraHeightAboveTerrain = 1; // Altura mínima acima do terreno para evitar clipping
    if (desiredPos.y < terrainHeightAtCamera + minCameraHeightAboveTerrain) {
        desiredPos.y = terrainHeightAtCamera + minCameraHeightAboveTerrain;
    }

    // Move suavemente a câmera para a posição desejada
    const lerpFactor = 0.1;
    thirdPersonCamera.position.lerp(desiredPos, lerpFactor);

    // Foca a câmera no jogador (por exemplo, na altura da cabeça)
    const lookAtPos = new THREE.Vector3(
        model.position.x,
        model.position.y + playerHeight,
        model.position.z
    );
    thirdPersonCamera.lookAt(lookAtPos);
}

// Iniciar
window.onload = init;

// -------------------
// FUNÇÕES ADICIONAIS PARA A NÉVOA
// -------------------
function toggleFog(enable) {
    fogEnabled = enable;
    if (fogEnabled) {
        if (!scene.fog) {
            scene.fog = new THREE.Fog(0x87ceeb, 1, currentFogDistance);
        }
    } else {
        scene.fog = null;
    }
}