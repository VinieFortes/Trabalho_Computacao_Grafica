import * as THREE from 'three';
import { OrbitControls } from '../build/jsm/controls/OrbitControls.js';
import KeyboardState from '../libs/util/KeyboardState.js';
import {
    initDefaultBasicLight,
    setDefaultMaterial
} from "../libs/util/util.js";

// Variáveis globais
let scene, renderer;
let orbitCamera;
let orbitControls;
const planeSize = 35;
const voxelSize = 1.0;
const voxels = {};
let clock = new THREE.Clock();
let keyboard;
let gridHelper, currentVoxel;
let selectedBlockType = 0; // Tipo de bloco inicial

// Linha que indica a altura atual
let heightIndicatorLine = null;

// Luz direcional (sol)
let directionalLight;

// Carregador de texturas e objeto para materiais
const textureLoader = new THREE.TextureLoader();
const blockMaterials = {};

// Função para alinhar a posição ao grid (centro dos voxels)
function snapToGrid(value, size, isY = false) {
    if (isY) {
        const offset = size / 2; // 0.5
        return offset + Math.round((value - offset) / size) * size;
    } else {
        return Math.round(value / size) * size;
    }
}

// Função para inicializar a cena
async function init() {
    // Cena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    clock = new THREE.Clock();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('webgl-output').appendChild(renderer.domElement);

    // Cria e configura a luz direcional (sol fixo)
    directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 80, 50); // Posição fixa no "céu"
    directionalLight.castShadow = true;
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
    scene.add(directionalLight.target); // Certifique-se de adicionar o target à cena
    directionalLight.target.position.set(0, 0, 0);

    // Luz hemisférica para clarear sombras
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    // Cor do céu, cor do solo, intensidade
    scene.add(hemiLight);

    // (Se preferir, use AmbientLight ao invés de HemisphereLight)
    // const ambLight = new THREE.AmbientLight(0x404040, 0.5);
    // scene.add(ambLight);

    // Câmeras
    initCameras();

    // GridHelper
    gridHelper = new THREE.GridHelper(planeSize, planeSize, 0x444444, 0x888888);
    scene.add(gridHelper);

    // Wireframe que indica a posição atual do voxel
    const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const wireframe = new THREE.WireframeGeometry(geometry);
    currentVoxel = new THREE.LineSegments(
        wireframe,
        new THREE.LineBasicMaterial({ color: 0xff0000 })
    );
    // Começa no nível 0.5
    currentVoxel.position.set(0, voxelSize / 2, 0);
    scene.add(currentVoxel);

    // Carrega texturas e materiais
    await createBlockMaterials();

    // Inicializa teclado
    keyboard = new KeyboardState();

    // Interface de controle (ícones de blocos etc.)
    setupBlockSelector();

    // Redimensionamento
    window.addEventListener('resize', onWindowResize, false);

    // Eventos de teclado
    window.addEventListener("keydown", handleKeyPress);

    // Cria a linha vertical inicial
    updateHeightIndicatorLine();

    // Inicia animação
    animate();
}

// Função para criar materiais dos blocos
async function createBlockMaterials() {
    const textures = {
        grass_top: await loadTexture('textures/grass_top.png'),
        grass_side: await loadTexture('textures/grass_side.jpg'),
        dirt: await loadTexture('textures/stone.jpg'),
        sand: await loadTexture('textures/sand.png'),
        wood: await loadTexture('textures/wood.png'),
        leaves: await loadTexture('textures/green_leaves.png'),
        snow: await loadTexture('textures/snow.jpeg'),
        glass: await loadTexture('textures/glass.png'),
        white_wood: await loadTexture('textures/white_wood.png'),
        brick: await loadTexture('textures/brick.png'),
    };

    // Define materiais para cada tipo de bloco
    blockMaterials[0] = [  // Grama com texturas diferentes para cada face
        createMaterial(textures.grass_side), // direita
        createMaterial(textures.grass_side), // esquerda
        createMaterial(textures.grass_top),  // topo
        createMaterial(textures.grass_side), // base
        createMaterial(textures.grass_side), // frente
        createMaterial(textures.grass_side)  // trás
    ];
    blockMaterials[1] = createMaterial(textures.grass_side);
    blockMaterials[2] = createMaterial(textures.dirt); // Terra
    blockMaterials[7] = createMaterial(textures.sand); // Areia
    blockMaterials[3] = createMaterial(textures.wood); // Madeira

    // Folhas com transparência
    const leavesMaterial = createMaterial(textures.leaves);
    leavesMaterial.transparent = true;
    leavesMaterial.alphaTest = 0.1;
    leavesMaterial.side = THREE.DoubleSide;
    blockMaterials[4] = leavesMaterial; // Folhas

    blockMaterials[5] = createMaterial(textures.snow); // Neve
    blockMaterials[10] = new THREE.MeshLambertMaterial({ color: 0xFFaa00 }); // Tocha

    // Novos materiais
    // Vidro com transparência
    const glassMaterial = createMaterial(textures.glass);
    glassMaterial.transparent = true;
    glassMaterial.opacity = 0.5;
    glassMaterial.side = THREE.DoubleSide;
    blockMaterials[11] = glassMaterial; // Vidro

    blockMaterials[12] = createMaterial(textures.white_wood); // White Wood
    blockMaterials[13] = createMaterial(textures.brick);      // Brick
}

function loadTexture(path) {
    return new Promise((resolve) => {
        textureLoader.load(path, (texture) => {
            resolve(texture);
        });
    });
}

function createMaterial(texture) {
    const material = new THREE.MeshLambertMaterial({ map: texture });
    // Ajustes de SRGB, wrap e filtros
    material.map.colorSpace = THREE.SRGBColorSpace;
    material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping;
    material.map.minFilter = material.map.magFilter = THREE.LinearFilter;
    return material;
}

// Função para inicializar as câmeras e seus controles
function initCameras() {
    // Câmera de Inspeção (Orbit)
    orbitCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    orbitCamera.position.set(15, 15, 15);
    orbitCamera.lookAt(0, 0, 0);

    orbitControls = new OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.target.set(0, 0, 0);
    orbitControls.update();
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
    // Primeiro item selecionado por padrão
    blockItems[0].classList.add('selected');
}

// Manipulação de redimensionamento da janela
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    orbitCamera.aspect = width / height;
    orbitCamera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Eventos de teclado
function handleKeyPress(event) {
    const moveDistance = voxelSize;

    // Obter a direção da câmera
    const cameraDirection = new THREE.Vector3();
    orbitCamera.getWorldDirection(cameraDirection); // Pega o vetor da direção da câmera

    // Criar o vetor de frente (projetado no plano XZ, ignorando Y)
    const frontVector = new THREE.Vector3(cameraDirection.x, 0, cameraDirection.z).normalize();

    // Criar o vetor de lado (perpendicular ao frontVector)
    const sideVector = new THREE.Vector3();
    sideVector.crossVectors(frontVector, new THREE.Vector3(0, 1, 0)).normalize();

    let dx = 0; // Deslocamento em X
    let dz = 0; // Deslocamento em Z

    switch (event.key) {
        case "ArrowUp":
            dx = frontVector.x * moveDistance;
            dz = frontVector.z * moveDistance;
            break;
        case "ArrowDown":
            dx = -frontVector.x * moveDistance;
            dz = -frontVector.z * moveDistance;
            break;
        case "ArrowLeft":
            dx = -sideVector.x * moveDistance;
            dz = -sideVector.z * moveDistance;
            break;
        case "ArrowRight":
            dx = sideVector.x * moveDistance;
            dz = sideVector.z * moveDistance;
            break;

        // Sobe e desce manualmente
        case "PageUp":
            currentVoxel.position.y += moveDistance;
            break;
        case "PageDown":
            currentVoxel.position.y -= moveDistance;
            break;

        // Adiciona bloco
        case "q":
        case "Q":
            addVoxel();
            break;
        // Remove bloco
        case "e":
        case "E":
            removeVoxel();
            break;

        // Cicla tipo de bloco (opcional)
        case "h":
        case "H":
            cycleBlockType();
            break;

        default:
            // Outras teclas, não faz nada
            return;
    }

    // Atualizar a posição do cursor
    currentVoxel.position.x += dx;
    currentVoxel.position.z += dz;

    // Alinhar a posição aos centros dos voxels
    currentVoxel.position.x = snapToGrid(currentVoxel.position.x, voxelSize);
    currentVoxel.position.y = snapToGrid(currentVoxel.position.y, voxelSize, true);
    currentVoxel.position.z = snapToGrid(currentVoxel.position.z, voxelSize);

    // Limitar dentro dos limites do grid
    const halfPlane = planeSize / 2;
    const minPosition = -halfPlane + voxelSize / 2;
    const maxPosition = halfPlane - voxelSize / 2;

    currentVoxel.position.x = THREE.MathUtils.clamp(
        currentVoxel.position.x,
        minPosition,
        maxPosition
    );
    currentVoxel.position.y = THREE.MathUtils.clamp(
        currentVoxel.position.y,
        voxelSize / 2, // mínimo 0.5
        halfPlane + voxelSize / 2 // máximo
    );
    currentVoxel.position.z = THREE.MathUtils.clamp(
        currentVoxel.position.z,
        minPosition,
        maxPosition
    );

    // Atualiza a linha vertical de indicação
    updateHeightIndicatorLine();
}

// Adiciona um voxel
function addVoxel() {
    const x = currentVoxel.position.x;
    const y = currentVoxel.position.y;
    const z = currentVoxel.position.z;
    const posKey = `${x},${y},${z}`;

    // Se já existe voxel aqui, não adiciona
    if (voxels[posKey]) return;

    // Clona o material
    const material = Array.isArray(blockMaterials[selectedBlockType])
        ? blockMaterials[selectedBlockType].map(m => m.clone())
        : blockMaterials[selectedBlockType].clone();

    const voxel = new THREE.Mesh(
        new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize),
        material
    );
    voxel.castShadow = true;
    voxel.receiveShadow = true;
    voxel.position.set(x, y, z);
    scene.add(voxel);

    // Armazena
    voxels[posKey] = voxel;
}

// Remove voxel
function removeVoxel() {
    const x = currentVoxel.position.x;
    const y = currentVoxel.position.y;
    const z = currentVoxel.position.z;
    const posKey = `${x},${y},${z}`;

    if (voxels[posKey]) {
        scene.remove(voxels[posKey]);
        delete voxels[posKey];
    }
}

// Cicla tipo de bloco (opcional)
function cycleBlockType() {
    const blockTypes = [0, 1, 2, 7, 3, 4, 5, 9, 10, 11, 12, 13];
    const currentIndex = blockTypes.indexOf(selectedBlockType);
    const nextIndex = (currentIndex + 1) % blockTypes.length;
    selectedBlockType = blockTypes[nextIndex];

    // Atualiza UI do seletor (se houver)
    const blockItems = document.querySelectorAll('.block-item');
    blockItems.forEach(item => {
        item.classList.remove('selected');
        if (parseInt(item.getAttribute('data-type')) === selectedBlockType) {
            item.classList.add('selected');
        }
    });
}

// Salva modelo em JSON
function saveModel() {
    const saveName = document.getElementById("save-name").value.trim();
    if (!saveName) {
        alert("Por favor, insira um nome para o arquivo.");
        return;
    }

    const voxelData = Object.keys(voxels).map(key => {
        const [x, y, z] = key.split(',').map(Number);
        const voxel = voxels[key];
        let type;

        if (Array.isArray(voxel.material)) {
            // Blocos com múltiplos materiais (ex: grama)
            type = Object.keys(blockMaterials).find(type =>
                Array.isArray(blockMaterials[type]) &&
                blockMaterials[type][2].map === voxel.material[2].map
            );
        } else {
            // Blocos com material único
            type = Object.keys(blockMaterials).find(type => {
                const material = blockMaterials[type];
                if (Array.isArray(material)) return false;
                // Se ambos têm textura, compara apenas o map
                if (material.map && voxel.material.map) {
                    return material.map === voxel.material.map;
                }
                // Se ambos têm cor (sem textura), compara a cor
                if (material.color && voxel.material.color && !material.map && !voxel.material.map) {
                    return material.color.getHex() === voxel.material.color.getHex();
                }
                return false;
            });
        }

        // Se type for undefined, logar para depuração
        if (!type) {
            console.warn(`Tipo não identificado para voxel em (${x}, ${y}, ${z})`, voxel.material);
            return null; // Ou definir um tipo padrão, se preferir
        }

        return { x, y, z, type: parseInt(type) };
    }).filter(data => data !== null); // Remove entradas inválidas

    const data = JSON.stringify(voxelData, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = saveName.endsWith('.json') ? saveName : `${saveName}.json`;
    link.click();
}

// Carrega modelo de JSON
function loadModel() {
    const fileInput = document.getElementById("load-file");
    const file = fileInput.files[0];
    if (!file) {
        alert("Por favor, selecione um arquivo JSON para carregar.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) {
                throw new Error("Formato inválido: esperado um array de voxels.");
            }

            // Limpar voxels atuais
            for (const key in voxels) {
                scene.remove(voxels[key]);
            }
            for (const key in voxels) {
                delete voxels[key];
            }

            // Adicionar voxels do arquivo
            data.forEach(voxelData => {
                const { x, y, z, type } = voxelData;
                if (typeof x !== 'number' || typeof y !== 'number' ||
                    typeof z !== 'number' || typeof type !== 'number') {
                    throw new Error("Formato inválido: cada voxel deve ter x, y, z e type numéricos.");
                }
                if (!blockMaterials[type]) {
                    throw new Error(`Tipo de bloco inválido: ${type}`);
                }
                const material = Array.isArray(blockMaterials[type])
                    ? blockMaterials[type].map(m => m.clone())
                    : blockMaterials[type].clone();

                // Ajuste de transparência para folhas
                if (type === 4 && !Array.isArray(material)) {
                    material.transparent = true;
                    material.alphaTest = 0.1;
                    material.side = THREE.DoubleSide;
                }

                const voxel = new THREE.Mesh(
                    new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize),
                    material
                );
                voxel.position.set(x, y, z);
                scene.add(voxel);
                const posKey = `${x},${y},${z}`;
                voxels[posKey] = voxel;
            });

            alert("Modelo carregado com sucesso!");
        } catch (err) {
            console.error(err);
            alert("Erro ao carregar o arquivo: " + err.message);
        }
    };

    reader.readAsText(file);
}

// Cria/atualiza a linha vertical que indica a altura
function updateHeightIndicatorLine() {
    // Se já existir uma linha antiga, remove
    if (heightIndicatorLine) {
        scene.remove(heightIndicatorLine);
        heightIndicatorLine.geometry.dispose();
        heightIndicatorLine.material.dispose();
        heightIndicatorLine = null;
    }

    // Posição atual do wireframe
    const x = currentVoxel.position.x;
    const z = currentVoxel.position.z;
    const minY = voxelSize / 2; // Y mínimo (primeiro nível)
    const currentY = currentVoxel.position.y;

    // Cria pontos da linha (BufferGeometry)
    const points = [];
    points.push(new THREE.Vector3(x, minY, z));
    points.push(new THREE.Vector3(x, currentY, z));

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

    // Cria e adiciona à cena
    heightIndicatorLine = new THREE.Line(geometry, material);
    scene.add(heightIndicatorLine);
}

// Loop de animação
function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    keyboard.update();
    renderer.render(scene, orbitCamera);
}

// Expor funções globais para o HTML
window.saveModel = saveModel;
window.loadModel = loadModel;

// Iniciar tudo ao carregar a página
window.onload = init;
