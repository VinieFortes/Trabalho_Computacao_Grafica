import * as THREE from "three";
import KeyboardState from "../libs/util/KeyboardState.js";
import {
  initDefaultBasicLight,
  setDefaultMaterial} from "../libs/util/util.js";

// Variáveis globais
let scene, camera, renderer, orbitControls, firstPersonControls;
let gridHelper, currentVoxel, voxelTypes, currentVoxelTypeIndex;
const voxelSize = 1.0;
const planeSize = 10;
const voxels = {}; // Estrutura para armazenar voxels com chave como 'x,y,z'
let keyboard;

// Função para alinhar a posição ao grid (centro dos voxels)
function snapToGrid(value, size) {
  return Math.round((value - size / 2) / size) * size + size / 2;
}

// Inicialização do ambiente
function init() {
  // Cena
  scene = new THREE.Scene();

  // Câmera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  // Ajuste da posição da câmera para estar mais próxima e diretamente alinhada com o grid
  camera.position.set(planeSize / 2, planeSize, planeSize * 1.5); // Centralizada em X, elevada em Y, afastada em Z
  camera.lookAt(planeSize / 2, 0, planeSize / 2); // Olhando para o centro do grid

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Adicionar o renderer ao div 'webgl-output'
  const webglOutput = document.getElementById("webgl-output");
  webglOutput.appendChild(renderer.domElement);

  // Configurar o GridHelper alinhado a partir de um canto
  gridHelper = new THREE.GridHelper(planeSize, planeSize);
  // Deslocar a grade para que comece no ponto (0,0,0)
  gridHelper.position.x = planeSize / 2;
  gridHelper.position.z = planeSize / 2;
  scene.add(gridHelper);

  // Indicação da posição atual com cubo wireframe
  const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
  const wireframe = new THREE.WireframeGeometry(geometry);
  currentVoxel = new THREE.LineSegments(
    wireframe,
    new THREE.LineBasicMaterial({ color: 0xff0000 })
  );
  // Posicionar o currentVoxel no canto inicial da grade
  currentVoxel.position.set(voxelSize / 2, voxelSize / 2, voxelSize / 2);
  scene.add(currentVoxel);

  // Iluminação básica
  initDefaultBasicLight(scene);

  // Definição dos tipos de voxels
  defineVoxelTypes();
  currentVoxelTypeIndex = 0; // Inicia com o primeiro tipo (Tipo 3)
  updateCurrentVoxelIndicator();

  // Inicializar o teclado
  keyboard = new KeyboardState();

  // Interface de controle
  createGUI();

  // Ajuste de redimensionamento da janela
  window.addEventListener("resize", onWindowResize, false);

  // Iniciar animação
  animate();

  // Eventos de teclado
  window.addEventListener("keydown", handleKeyPress);
}

// Definição dos tipos de voxels com cores específicas para árvores
function defineVoxelTypes() {
  voxelTypes = [
    { name: "Tronco", color: 0x8b4513 }, // Tipo 3: Marrom
    { name: "Folhagem Escura", color: 0x006400 }, // Tipo 4: Verde Escuro
    { name: "Folhagem Clara", color: 0x00ff00 }, // Tipo 5: Verde Claro
    { name: "Frutos", color: 0xff0000 }, // Tipo 6: Vermelho
    { name: "Flores", color: 0xff69b4 }, // Tipo 7: Rosa
  ];
  currentVoxelTypeIndex = 0; // Inicia com o primeiro tipo (Tipo 3)
  updateCurrentVoxelIndicator();
}

// Criação da interface GUI para salvar e carregar modelos
function createGUI() {
  // Já temos os botões no HTML; apenas garantimos que as funções estejam disponíveis globalmente
  window.confirmSaveModel = confirmSaveModel;
  window.showSaveField = showSaveField;
  window.loadModel = loadModel;
  window.handleLoadModel = handleLoadModel;
}

// Manipulação de redimensionamento da janela
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (orbitControls) orbitControls.update();
  if (firstPersonControls) {
    firstPersonControls.handleResize();
  }
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
      if (currentVoxel.position.y - moveDistance >= voxelSize / 2) {
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
  }

  // Alinhar a posição aos centros dos voxels (0.5, 1.5, 2.5, ...)
  currentVoxel.position.x = snapToGrid(currentVoxel.position.x, voxelSize);
  currentVoxel.position.y = snapToGrid(currentVoxel.position.y, voxelSize);
  currentVoxel.position.z = snapToGrid(currentVoxel.position.z, voxelSize);

  // Limitar dentro dos limites do grid
  const minPosition = voxelSize / 2;
  const maxPosition = planeSize - voxelSize / 2;

  currentVoxel.position.x = THREE.MathUtils.clamp(
    currentVoxel.position.x,
    minPosition,
    maxPosition
  );
  currentVoxel.position.y = THREE.MathUtils.clamp(
    currentVoxel.position.y,
    voxelSize / 2,
    planeSize // Permitir que o voxel suba até o topo da grade
  );
  currentVoxel.position.z = THREE.MathUtils.clamp(
    currentVoxel.position.z,
    minPosition,
    maxPosition
  );
}

// Função para adicionar um voxel no local atual
function addVoxel() {
  const posKey = `${currentVoxel.position.x},${currentVoxel.position.y},${currentVoxel.position.z}`;
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
  voxel.position.copy(currentVoxel.position);
  scene.add(voxel);

  // Armazenar voxel na estrutura com tipo atualizado
  voxels[posKey] = { voxel: voxel, type: currentVoxelTypeIndex + 3 };
}

// Função para remover um voxel no local atual
function removeVoxel() {
  const posKey = `${currentVoxel.position.x},${currentVoxel.position.y},${currentVoxel.position.z}`;
  const voxelData = voxels[posKey];
  if (voxelData) {
    scene.remove(voxelData.voxel);
    delete voxels[posKey];
  }
}

// Funções para alternar tipos de voxel
function nextVoxelType() {
  currentVoxelTypeIndex = (currentVoxelTypeIndex + 1) % voxelTypes.length;
  updateCurrentVoxelIndicator();
}

function previousVoxelType() {
  currentVoxelTypeIndex =
    (currentVoxelTypeIndex - 1 + voxelTypes.length) % voxelTypes.length;
  updateCurrentVoxelIndicator();
}

// Atualizar a indicação do tipo de voxel atual
function updateCurrentVoxelIndicator() {
  const indicator = document.getElementById("current-voxel-color");
  if (indicator && voxelTypes[currentVoxelTypeIndex]) {
    const colorHex = voxelTypes[currentVoxelTypeIndex].color
      .toString(16)
      .padStart(6, "0");
    indicator.style.backgroundColor = `#${colorHex}`;
  }
}

// Função para mostrar o campo de texto para salvar o modelo de voxels
function showSaveField() {
  const saveContainer = document.getElementById("save-container");
  saveContainer.style.display = "block";
}

// Função para salvar o modelo de voxels em um arquivo JSON
function confirmSaveModel() {
  const saveNameInput = document.getElementById("save-name");
  const saveName = saveNameInput.value.trim();

  if (!saveName) {
    alert("Por favor, insira um nome para o arquivo.");
    return;
  }

  const voxelData = Object.keys(voxels).map((key) => {
    const { voxel, type } = voxels[key];
    const [x, y, z] = key.split(",").map(Number);
    return { x, y, z, type };
  });

  const data = JSON.stringify(voxelData, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = saveName.endsWith(".json") ? saveName : `${saveName}.json`;
  link.click();

  // Esconde o campo de texto novamente após salvar
  const saveContainer = document.getElementById("save-container");
  saveContainer.style.display = "none";
}

// Função para gerenciar o clique no botão de carregar modelo
function handleLoadModel() {
  const fileInput = document.getElementById("load-file");
  // Verifica se um arquivo já foi anexado
  if (fileInput.files.length === 0) {
    // Se nenhum arquivo foi selecionado, abre a janela de seleção
    fileInput.click();
  } else {
    // Caso contrário, reinicia o processo limpando o valor e abrindo a janela novamente
    fileInput.value = ""; // Limpa o valor do campo
    fileInput.click(); // Reabre a janela de seleção
  }
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
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);

      // Validar a estrutura dos dados
      if (!Array.isArray(data)) {
        throw new Error("Formato inválido: esperado um array de voxels.");
      }

      // Remover todos os voxels atuais
      for (const key in voxels) {
        scene.remove(voxels[key].voxel);
      }
      for (const key in voxels) {
        delete voxels[key];
      }

      // Adicionar voxels carregados
      data.forEach((voxelData) => {
        const { x, y, z, type } = voxelData;
        if (
          typeof x !== "number" ||
          typeof y !== "number" ||
          typeof z !== "number" ||
          typeof type !== "number"
        ) {
          throw new Error(
            "Formato inválido: cada voxel deve ter x, y, z e type como números."
          );
        }

        const voxelTypeIndex = type - 3; // Ajustar para o índice do array voxelTypes
        if (voxelTypeIndex < 0 || voxelTypeIndex >= voxelTypes.length) {
          throw new Error(`Tipo de voxel inválido: ${type}`);
        }

        const color = voxelTypes[voxelTypeIndex].color;
        const material = new THREE.MeshBasicMaterial({ color });
        const voxel = new THREE.Mesh(
          new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize),
          material
        );
        voxel.position.set(x, y, z);
        scene.add(voxel);
        const posKey = `${x},${y},${z}`;
        voxels[posKey] = { voxel: voxel, type: type };
      });

      alert("Modelo carregado com sucesso!");
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar o arquivo: " + err.message);
    }
  };

  reader.onerror = function () {
    console.error("Erro ao ler o arquivo.");
    alert("Erro ao ler o arquivo.");
  };

  reader.readAsText(file);
}

// Função de animação
function animate() {
  requestAnimationFrame(animate);

  renderer.render(scene, camera);
}

// Inicializar a cena quando a página carregar
window.onload = init;