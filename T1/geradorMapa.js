import * as THREE from 'three';
import { OrbitControls } from '../build/jsm/controls/OrbitControls.js';
import { FirstPersonControls } from '../build/jsm/controls/FirstPersonControls.js';
import KeyboardState from '../libs/util/KeyboardState.js';
import {
    initDefaultBasicLight,
    setDefaultMaterial} from "../libs/util/util.js";

// Variáveis globais
let scene, renderer;
let orbitCamera, firstPersonCamera;
let orbitControls, firstPersonControls;
let currentCamera;
let previousCameraPosition = {};
const planeSize = 35;
const voxelSize = 1.0;
const voxels = {};
let isOrbit = true;
let clock = new THREE.Clock();
let keyboard;
let gridHelper, currentVoxel, voxelTypes, currentVoxelTypeIndex;

// Função para alinhar a posição ao grid (centro dos voxels)
function snapToGrid(value, size) {
    return Math.round(value / size) * size;
}

// Função para inicializar a cena
function init() {
    // Cena
    scene = new THREE.Scene();
    clock = new THREE.Clock();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('webgl-output').appendChild(renderer.domElement);

    // Iluminação
    initDefaultBasicLight(scene);

    // Câmeras
    initCameras();

    // Adicionar GridHelper centralizado
    gridHelper = new THREE.GridHelper(planeSize, planeSize, 0x444444, 0x888888);
    scene.add(gridHelper);

    // Indicação da posição atual com cubo wireframe
    const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const wireframe = new THREE.WireframeGeometry(geometry);
    currentVoxel = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    currentVoxel.position.set(0, 0, 0); // Inicialmente no centro
    scene.add(currentVoxel);

    // Definição dos tipos de voxels
    defineVoxelTypes();
    currentVoxelTypeIndex = 0; // Inicia com o primeiro tipo de voxel
    updateCurrentVoxelIndicator();

    // Inicializar o teclado
    keyboard = new KeyboardState();

    // Interface de controle
    createGUI();

    // Ajuste de redimensionamento da janela
    window.addEventListener('resize', onWindowResize, false);

    // Eventos de teclado
    window.addEventListener("keydown", handleKeyPress);

    // Iniciar animação
    animate();
}

// Função para inicializar as câmeras e seus controles
function initCameras() {
    // Câmera de Inspeção (Orbit)
    orbitCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    orbitCamera.position.set(0, 20, 20); // Posição inicial centralizada
    orbitCamera.lookAt(0, 0, 0);
    orbitControls = new OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.target.set(0, 0, 0);
    orbitControls.update();

    // Definir câmera inicial
    currentCamera = orbitCamera;
}

// Definição dos tipos de voxels com cores distintas
function defineVoxelTypes() {
    voxelTypes = [
        { name: 'Tipo 0', color: 0x808080 }, // Cinza
        { name: 'Tipo 1', color: 0xffa500 }, // Laranja
        { name: 'Tipo 2', color: 0x00ff00 }  // Verde
    ];
}

// Criação da interface GUI para salvar e carregar modelos
function createGUI() {
    // Já temos os botões no HTML; apenas garantimos que as funções estejam disponíveis globalmente
    window.saveModel = saveModel;
    window.loadModel = loadModel;
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
    const moveDistance = voxelSize;

    switch (event.key) {
        case "ArrowUp":
            currentVoxel.position.z -= moveDistance;
            break;
        case "ArrowDown":
            currentVoxel.position.z += moveDistance;
            break;
        case "ArrowLeft":
            currentVoxel.position.x -= moveDistance;
            break;
        case "ArrowRight":
            currentVoxel.position.x += moveDistance;
            break;
        case "PageUp":
            currentVoxel.position.y += moveDistance;
            break;
        case "PageDown":
            if (currentVoxel.position.y - moveDistance >= 0) { // Y mínimo é 0
                currentVoxel.position.y -= moveDistance;
            }
            break;
        case "q":
        case "Q":
            addVoxel();
            break;
        case "e":
        case "E":
            removeVoxel();
            break;
        case ".":
            nextVoxelType();
            break;
        case ",":
            previousVoxelType();
            break;
        case 'c':
        case 'C':
            toggleCamera();
            break;
    }

    // Alinhar a posição aos centros dos voxels (inteiros)
    currentVoxel.position.x = snapToGrid(currentVoxel.position.x, voxelSize);
    currentVoxel.position.y = snapToGrid(currentVoxel.position.y, voxelSize);
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
        0, // Y mínimo é 0
        halfPlane // Permitir que o voxel suba até o topo da grade
    );
    currentVoxel.position.z = THREE.MathUtils.clamp(
        currentVoxel.position.z,
        minPosition,
        maxPosition
    );
}

// Função para alternar entre as câmeras
function toggleCamera() {
    if (isOrbit) {
        // Salvar posição atual da câmera de inspeção
        previousCameraPosition.orbit = orbitCamera.position.clone();
        previousCameraPosition.orbitTarget = orbitControls.target.clone();

        // Ativar controles de primeira pessoa
        firstPersonControls.enabled = true;
        orbitControls.enabled = false;
        currentCamera = firstPersonCamera;
    } else {
        // Salvar posição atual da câmera de primeira pessoa
        previousCameraPosition.firstPerson = firstPersonCamera.position.clone();

        // Ativar controles de inspeção
        if (previousCameraPosition.orbit) {
            orbitCamera.position.copy(previousCameraPosition.orbit);
            orbitControls.target.copy(previousCameraPosition.orbitTarget);
        }
        orbitControls.enabled = true;
        firstPersonControls.enabled = false;
        currentCamera = orbitCamera;
    }
    isOrbit = !isOrbit;
}

// Função para adicionar um voxel no local atual
function addVoxel() {
    const x = currentVoxel.position.x;
    const y = currentVoxel.position.y;
    const z = currentVoxel.position.z;
    const posKey = `${x},${y},${z}`;
    if (voxels[posKey]) {
        // Voxel já existe neste local
        return;
    }

    const voxelType = voxelTypes[currentVoxelTypeIndex];
    const material = setDefaultMaterial(voxelType.color);
    const voxel = new THREE.Mesh(
        new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize),
        material
    );
    voxel.position.set(x, y, z);
    scene.add(voxel);

    // Armazenar voxel na estrutura
    voxels[posKey] = voxel;
}

// Função para remover um voxel no local atual
function removeVoxel() {
    const x = currentVoxel.position.x;
    const y = currentVoxel.position.y;
    const z = currentVoxel.position.z;
    const posKey = `${x},${y},${z}`;
    const voxel = voxels[posKey];
    if (voxel) {
        scene.remove(voxel);
        delete voxels[posKey];
    }
}

// Funções para alternar tipos de voxel
function nextVoxelType() {
    currentVoxelTypeIndex = (currentVoxelTypeIndex + 1) % voxelTypes.length;
    updateCurrentVoxelIndicator();
}

function previousVoxelType() {
    currentVoxelTypeIndex = (currentVoxelTypeIndex - 1 + voxelTypes.length) % voxelTypes.length;
    updateCurrentVoxelIndicator();
}

// Atualizar a indicação do tipo de voxel atual
function updateCurrentVoxelIndicator() {
    const indicator = document.getElementById("current-voxel-color");
    if (indicator && voxelTypes[currentVoxelTypeIndex]) {
        const colorHex = voxelTypes[currentVoxelTypeIndex].color.toString(16).padStart(6, '0');
        indicator.style.backgroundColor = `#${colorHex}`;
    }
}

// Função para salvar o modelo de voxels em um arquivo JSON
function saveModel() {
    const saveName = document.getElementById("save-name").value.trim();
    if (!saveName) {
        alert("Por favor, insira um nome para o arquivo.");
        return;
    }

    const voxelData = Object.keys(voxels).map(key => {
        const [x, y, z] = key.split(',').map(Number);
        const type = voxelTypes.findIndex(v => v.color === voxels[key].material.color.getHex());
        return { x, y, z, type };
    });

    const data = JSON.stringify(voxelData, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = saveName.endsWith('.json') ? saveName : `${saveName}.json`;
    link.click();
}

// Função para carregar o modelo de voxels de um arquivo JSON selecionado pelo usuário
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

            // Validar a estrutura dos dados
            if (!Array.isArray(data)) {
                throw new Error("Formato inválido: esperado um array de voxels.");
            }

            // Remover todos os voxels atuais
            for (const key in voxels) {
                scene.remove(voxels[key]);
            }
            for (const key in voxels) {
                delete voxels[key];
            }

            // Adicionar voxels carregados
            data.forEach(voxelData => {
                const { x, y, z, type } = voxelData;
                if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' || typeof type !== 'number') {
                    throw new Error("Formato inválido: cada voxel deve ter x, y, z e type como números.");
                }
                if (type < 0 || type >= voxelTypes.length) {
                    throw new Error(`Tipo de voxel inválido: ${type}. Deve ser entre 0 e ${voxelTypes.length - 1}.`);
                }
                const color = voxelTypes[type].color;
                const material = new THREE.MeshBasicMaterial({ color });
                const voxel = new THREE.Mesh(new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize), material);
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

    reader.onerror = function() {
        console.error("Erro ao ler o arquivo.");
        alert("Erro ao ler o arquivo.");
    };

    reader.readAsText(file);
}

// Função de animação
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Atualizar controles de câmera
    if (currentCamera === orbitCamera) {
        orbitControls.update();
    } else if (currentCamera === firstPersonCamera) {
        firstPersonControls.update(delta);
    }

    // Atualizar estado do teclado
    keyboard.update();

    renderer.render(scene, currentCamera);
}

// Inicializar a cena quando a página carregar
window.onload = init;
