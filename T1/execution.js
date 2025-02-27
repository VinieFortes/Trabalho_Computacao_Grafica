import * as THREE from 'three';
import { OrbitControls } from '../build/jsm/controls/OrbitControls.js';
import {
    initDefaultBasicLight,
    setDefaultMaterial} from "../libs/util/util.js";
import {PointerLockControls} from "../build/jsm/controls/PointerLockControls.js";

// Mapeamento de altura para cada type
const typeHeightMap = {
    0: 3, // Tipo 0: 3 blocos de altura (Terreno)
    1: 2, // Tipo 1: 2 blocos de altura (Terreno)
    2: 1, // Tipo 2: 1 bloco de altura (Terreno)
    3: 5, // Tipo 3: (Tronco)
    4: 3, // Tipo 4: (Folhagem Escura)
    5: 3, // Tipo 5: (Folhagem Clara)
    6: 2, // Tipo 6: (Frutos)
    7: 2  // Tipo 7: (Flores)
};

// Mapeamento de cores para cada type
const colorMap = {
    0: 0x808080, // Cinza para Tipo 0 (Terreno)
    1: 0xffa500, // Laranja para Tipo 1 (Terreno)
    2: 0x00ff00, // Verde para Tipo 2 (Terreno)
    3: 0x8B4513, // Marrom para Tipo 3 (Tronco)
    4: 0x006400, // Verde Escuro para Tipo 4 (Folhagem Escura)
    5: 0x00FF00, // Verde Claro para Tipo 5 (Folhagem Clara)
    6: 0xFF0000, // Vermelho para Tipo 6 (Frutos)
    7: 0xFF69B4  // Rosa para Tipo 7 (Flores)
};

// Variáveis globais
let scene, renderer;
let orbitCamera, firstPersonCamera;
let orbitControls, firstPersonControls;
let currentCamera;
let previousCameraPosition = {};
const planeSize = 35;
const voxelSize = 1.0;
const voxels = {}; // Estrutura para armazenar voxels
let isOrbit = true;
let clock = new THREE.Clock();

// Lista de arquivos de árvores
const treeFiles = ['tree1.json', 'tree2.json', 'tree3.json'];

// Função para inicializar a cena
function init() {
    // Cena
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    scene.background = new THREE.Color(0x87CEEB);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('webgl-output').appendChild(renderer.domElement);

    // Iluminação
    initDefaultBasicLight(scene);

    // Câmeras
    initCameras();

    // Carregar mapa de voxels (Terreno)
    loadVoxelMap('mapaT1.json').then(() => {
        // Após carregar o terreno, carregar as árvores
        loadAllTrees();
    });

    // Adicionar GridHelper para referência
    const gridHelper = new THREE.GridHelper(planeSize, planeSize);
    scene.add(gridHelper);

    // Ajuste de redimensionamento da janela
    window.addEventListener('resize', onWindowResize, false);

    // Eventos de teclado
    window.addEventListener('keydown', handleKeyPress);

    // Iniciar animação
    animate();
}

let pointerLockControls;

// Função para inicializar as câmeras e seus controles
function initCameras() {
    const mapSize = planeSize; // Tamanho do mapa

    // Câmera de Inspeção (Orbit) posicionada centralmente acima do mapa
    orbitCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

     // Posicionar a câmera diretamente acima do centro do mapa
     const xPos = 0;
     const zPos = 0;
     const yPos = mapSize * 1.5; // Altura da câmera acima do mapa

    orbitCamera.position.set(xPos, yPos, zPos);

    // A câmera olha diretamente para o centro do mapa
    orbitCamera.lookAt(0, 0, 0);

    orbitControls = new OrbitControls(orbitCamera, renderer.domElement);

    // Configurar o alvo (ponto central do mapa)
    orbitControls.target.set(0, 0, 0);

    // Restringir o zoom e a rotação para evitar que a câmera vá abaixo do mapa
    orbitControls.minDistance = 10;
    orbitControls.maxDistance = yPos + 10;
    orbitControls.maxPolarAngle = Math.PI / 2; // Limitar para que não passe do plano horizontal

    orbitControls.update();

    // Câmera de primeira pessoa usando PointerLockControls
    firstPersonCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    firstPersonCamera.position.set(2, 2, 2);

    pointerLockControls = new PointerLockControls(firstPersonCamera, document.body);

    // Evento para ativar o pointer lock ao clicar na tela
    document.addEventListener('click', () => {
        if (currentCamera === firstPersonCamera) {
            pointerLockControls.lock();
        }
    });

    currentCamera = orbitCamera;
}

// Função para carregar o mapa de voxels (Terreno)
function loadVoxelMap(url) {
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erro ao carregar ${url}: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            data.forEach(voxelData => {
                const { x, y, z, type } = voxelData;
                const height = typeHeightMap[type] || 1; // Default para 1 se type não estiver mapeado

                for (let i = 0; i < height; i++) {
                    addVoxel(x, y + i, z, type);
                }
            });
            console.log('Mapa de voxels carregado com sucesso.');
        })
        .catch(err => {
            console.error('Erro ao carregar o mapa de voxels:', err);
        });
}

// Função para carregar todas as árvores
function loadAllTrees() {
    // Carrega todos os arquivos de árvores
    const treePromises = treeFiles.map(file => fetch(file).then(response => {
        if (!response.ok) {
            throw new Error(`Erro ao carregar ${file}: ${response.status}`);
        }
        return response.json();
    }));

    // Espera todas as árvores serem carregadas
    Promise.all(treePromises)
        .then(treesData => {
            treesData.forEach((treeData, index) => {
                // Define as posições onde cada árvore será colocada
                // Por exemplo, duas árvores por arquivo
                // Você pode ajustar conforme necessário
                const positions = getTreePositions(index);
                positions.forEach(pos => {
                    addTree(treeData, pos.x, pos.z);
                });
            });
            console.log('Todas as árvores foram carregadas com sucesso.');
        })
        .catch(err => {
            console.error('Erro ao carregar as árvores:', err);
        });
}

// Função para obter as posições das árvores com base no índice do arquivo
function getTreePositions(treeIndex) {
    const positions = [
        // Árvores do primeiro arquivo
        [
            { x: -9, z: -14 },
            { x: -10, z: -2 }
        ],
        // Árvores do segundo arquivo
        [
            { x: -13, z: 8 },
            { x: 3, z: 6 }
        ],
        // Árvores do terceiro arquivo
        [
            { x: 6, z: -6 },
            { x: 3, z: -17 }
        ]
    ];
    return positions[treeIndex] || [];
}

// Função para adicionar uma árvore na cena
function addTree(treeData, baseX, baseZ) {

    // Adiciona cada voxel da árvore, ajustando a posição Y com base na altura do terreno
    treeData.forEach(voxelData => {
        const { x, y, z, type } = voxelData;
        // A posição da árvore é relativa, então adicionamos baseX, terrainHeight + y, baseZ
        addVoxel(baseX + x, y, baseZ + z, type);
    });
}

// Função para obter a altura do terreno em (x, z)
function getTerrainHeight(x, z) {
    // Percorre os voxels para encontrar o voxel mais alto na coluna (x, z)
    let maxY = 0;
    for (let y = 0; y < planeSize; y++) {
        const posKey = `${x},${y},${z}`;
        if (voxels[posKey]) {
            maxY = y + 1; // +1 para posicionar a árvore acima do último bloco
        }
    }
    return maxY;
}

// Função para adicionar um voxel na cena
function addVoxel(x, y, z, type) {
    const color = colorMap[type] !== undefined ? colorMap[type] : 0xffffff;
    const material = setDefaultMaterial(color);
    const voxel = new THREE.Mesh(new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize), material);

    // Ajuste da posição Y: quando y=0, posiciona exatamente no grid
    const yPosition = y * voxelSize + voxelSize / 2;
    voxel.position.set(x, yPosition, z);

    scene.add(voxel);

    const posKey = `${x},${y},${z}`;
    voxels[posKey] = { voxel: voxel, type: type }; // Armazenar o tipo junto com o voxel
}

// Função para alternar entre as câmeras
function toggleCamera() {
    if (isOrbit) {
        // Salva posição do orbit
        previousCameraPosition.orbit = orbitCamera.position.clone();
        previousCameraPosition.orbitTarget = orbitControls.target.clone();

        orbitControls.enabled = false;
        pointerLockControls.getObject().position.copy(previousCameraPosition.firstPerson || new THREE.Vector3(2, 2, 2));
        currentCamera = firstPersonCamera;
    } else {
        // Salva posição da primeira pessoa
        previousCameraPosition.firstPerson = pointerLockControls.getObject().position.clone();

        orbitCamera.position.copy(previousCameraPosition.orbit || new THREE.Vector3(0, planeSize*1.5, 0));
        orbitControls.target.copy(previousCameraPosition.orbitTarget || new THREE.Vector3(0, 0, 0));
        orbitControls.enabled = true;
        currentCamera = orbitCamera;
    }
    isOrbit = !isOrbit;
}

// Manipulação de redimensionamento da janela
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Atualizar câmeras
    orbitCamera.aspect = width / height;
    orbitCamera.updateProjectionMatrix();

    firstPersonCamera.aspect = width / height;
    firstPersonCamera.updateProjectionMatrix();

    // Atualizar renderer
    renderer.setSize(width, height);
    firstPersonControls.handleResize();
}

// Manipulação de eventos de teclado
function handleKeyPress(event) {
    if (event.key === 'c' || event.key === 'C') {
        toggleCamera();
    }
}

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

document.addEventListener('keydown', (event) => {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
});

// Função de animação
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // Tempo decorrido desde a última chamada

    if (currentCamera === orbitCamera) {
        orbitControls.update();
    } else if (currentCamera === firstPersonCamera) {
        const speed = 5.0 * delta;
        const object = pointerLockControls.getObject();

        // Direção frontal
        if (moveForward) object.translateZ(-speed);
        if (moveBackward) object.translateZ(speed);

        // Direção lateral
        if (moveLeft) object.translateX(-speed);
        if (moveRight) object.translateX(speed);

        object.position.y = 2; // Altura fixa
    }

    renderer.render(scene, currentCamera);
}

// Inicializar a cena quando a página carregar
window.onload = init;