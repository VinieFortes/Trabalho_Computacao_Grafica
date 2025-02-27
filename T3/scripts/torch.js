import * as THREE from 'three';
import { GLTFLoader } from '../../build/jsm/loaders/GLTFLoader.js';
import { voxelSize } from './config.js';

let torchModel = null;
const torchScale = 0.5;

export async function loadTorchModel() {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load(
            'minecraft_torch.glb',
            (gltf) => {
                torchModel = gltf.scene;
                torchModel.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                resolve(torchModel);
            },
            undefined,
            reject
        );
    });
}

export function createTorch(scene, position, chunkMeshes, loadedChunks, CHUNK_SIZE) {
    if (!torchModel) {
        console.error('Torch model not loaded');
        return null;
    }

    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    // Criar luz para o brilho da tocha
    const light = new THREE.PointLight(0xffa500, 1, 10);
    light.position.set(0, 0.5, 0);

    // Clonar o modelo da tocha
    const torch = torchModel.clone();
    torch.scale.set(torchScale, torchScale, torchScale);

    // Criar o grupo da tocha
    const group = new THREE.Group();
    group.add(torch);
    group.add(light);

    // Adicionar cubo de hitbox invisível
    const cubeGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const cubeMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    const hitbox = new THREE.Mesh(cubeGeometry, cubeMaterial);
    hitbox.userData.isTorchHitbox = true;
    group.add(hitbox);

    // Ajustar a posição para corresponder à grade de blocos
    group.position.set(
        position.x,
        position.y + 0.5,
        position.z
    );

    group.userData.isTorch = true;
    group.userData.blockData = { x: position.x, y: position.y, z: position.z };
    group.userData.chunkKey = chunkKey;

    // Add to chunk tracking
    let chunkData = chunkMeshes.get(chunkKey) || {};
    if (!chunkData.torches) {
        chunkData.torches = [];
    }
    chunkData.torches.push(group);
    chunkMeshes.set(chunkKey, chunkData);
    loadedChunks.add(chunkKey);

    scene.add(group);

    return {
        torch: group,
        light: light
    };
}

export function removeTorch(scene, torchObject, chunkMeshes) {
    // Remove from chunk tracking
    const chunkKey = torchObject.userData.chunkKey;
    if (chunkKey && chunkMeshes) {
        const chunkData = chunkMeshes.get(chunkKey);
        if (chunkData && chunkData.torches) {
            const index = chunkData.torches.indexOf(torchObject);
            if (index > -1) {
                chunkData.torches.splice(index, 1);
            }
        }
    }

    scene.remove(torchObject);
    torchObject.traverse((child) => {
        if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
        }
    });
}
