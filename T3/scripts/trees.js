import * as THREE from "three";
import { treeFiles, planeSize, totalTreesNeeded, CHUNK_SIZE, voxelSize, BLOCK_TYPES } from "./config.js";
import { getLightIntensity } from "./lights.js";
import { updateProgress } from "./progress.js";

const textureLoader = new THREE.TextureLoader();
const treePositions = new Set();

/**
 * Verifica se a posição (x, z) já está ocupada por uma árvore.
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function isTreePositionOccupied(x, z) {
    const key = `${x},${z}`;
    if (treePositions.has(key)) return true;
    treePositions.add(key);
    return false;
}

/**
 * Verifica se é possível colocar uma árvore na posição dada,
 * garantindo que haja contato com o solo e que não haja blocos já ocupados.
 * @param {Array} treeData Dados dos voxels da árvore
 * @param {number} baseX Posição X base
 * @param {number} baseY Altura do terreno na posição (baseY)
 * @param {number} baseZ Posição Z base
 * @param {Set} occupiedBlocks Conjunto de blocos ocupados
 * @returns {boolean}
 */
export function canPlaceTree(treeData, baseX, baseY, baseZ, occupiedBlocks) {
    let hasGroundContact = false;
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
    if (!hasGroundContact) return false;
    const minY = Math.min(...treeData.map(v => v.y));
    return treeData.every(voxel => {
        const worldX = Math.floor(baseX + voxel.x);
        const worldY = Math.floor(baseY + (voxel.y - minY));
        const worldZ = Math.floor(baseZ + voxel.z);
        return !occupiedBlocks.has(`${worldX},${worldY},${worldZ}`);
    });
}

/**
 * Adiciona uma árvore ao mundo.
 * @param {Array} treeData Dados da árvore (voxels)
 * @param {number} baseX Posição base X onde a árvore será colocada
 * @param {number} baseY Altura do terreno (baseY) na posição
 * @param {number} baseZ Posição base Z onde a árvore será colocada
 * @param {THREE.Scene} scene A cena onde a árvore será adicionada
 * @param {Set} occupiedBlocks Conjunto de blocos ocupados
 * @param {Object} terrainHeightMap Mapa de alturas do terreno
 * @param {Object} blockTypeMap Mapa de tipos de blocos
 * @returns {boolean} true se a árvore foi adicionada com sucesso
 */
export function addTree(treeData, baseX, baseY, baseZ, {
    scene,
    occupiedBlocks,
    terrainHeightMap,
    blockTypeMap,
    createInstancedMesh,
    chunkMeshes,
    loadedChunks
}) {
    const trunkVoxels = treeData.filter(v => v.type === BLOCK_TYPES.TRUNK);
    if (trunkVoxels.length === 0) {
        console.warn("Árvore sem tronco (type=3)!");
        return false;
    }
    // Encontra o voxel de tronco com menor Y
    let baseTrunkVoxel = trunkVoxels[0];
    for (let i = 1; i < trunkVoxels.length; i++) {
        if (trunkVoxels[i].y < baseTrunkVoxel.y) {
            baseTrunkVoxel = trunkVoxels[i];
        }
    }
    // Calcula o offset para ajustar a árvore ao terreno
    const offsetY = baseY - baseTrunkVoxel.y;

    // Calcula a chave do chunk (usando CHUNK_SIZE)
    const chunkX = Math.floor(baseX / CHUNK_SIZE);
    const chunkZ = Math.floor(baseZ / CHUNK_SIZE);
    const chunkKey = `${chunkX},${chunkZ}`;

    // Organize blocks by type for instanced rendering
    const blocksByType = new Map();
    
    treeData.forEach(voxel => {
        const { x, y, z, type } = voxel;
        const worldX = baseX + (x - baseTrunkVoxel.x);
        const worldY = y + offsetY;
        const worldZ = baseZ + (z - baseTrunkVoxel.z);

        // Add to block tracking with converted block type
        const blockKey = `${worldX},${worldY},${worldZ}`;
        const blockType = type === 3 ? BLOCK_TYPES.TRUNK : 
                         type === 4 ? BLOCK_TYPES.LEAVES :
                         type === 5 ? BLOCK_TYPES.LEAVES : type;
        occupiedBlocks.add(blockKey);
        blockTypeMap[blockKey] = blockType;

        // Group by original type for instanced meshes
        if (!blocksByType.has(type)) {
            blocksByType.set(type, []);
        }
        blocksByType.get(type).push({ x: worldX, y: worldY, z: worldZ });
    });

    // Create instanced meshes for each block type
    for (const [blockType, positions] of blocksByType) {
        if (!positions.length) continue;

        let chunkData = chunkMeshes.get(chunkKey) || {};
        const instancedMesh = createInstancedMesh(positions, blockType);
        
        if (instancedMesh) {
            instancedMesh.userData.chunkKey = chunkKey;
            instancedMesh.userData.isTreeBlock = true;
            instancedMesh.castShadow = true;
            instancedMesh.receiveShadow = true;
            
            // Remove old mesh if exists
            if (chunkData[blockType]) {
                scene.remove(chunkData[blockType]);
            }
            
            // Add new mesh
            chunkData[blockType] = instancedMesh;
            scene.add(instancedMesh);
            chunkMeshes.set(chunkKey, chunkData);
            loadedChunks.add(chunkKey); // Track the chunk as loaded
        }
    }

    // Atualiza a altura do terreno na área da árvore
    const key = `${baseX},${baseZ}`;
    const maxTreeHeight = Math.max(...treeData.map(v => v.y + offsetY));
    if (!terrainHeightMap[key] || maxTreeHeight + 1 > terrainHeightMap[key]) {
        terrainHeightMap[key] = maxTreeHeight + 1;
    }
    return true;
}

/**
 * Carrega todas as árvores com progresso.
 * Essa função utiliza os dados de arquivos JSON para gerar as árvores.
 * Ela espera que o caller forneça funções para gerar chunks e obter a altura do terreno.
 *
 * @param {Object} params Objeto contendo os parâmetros:
 *   - scene: a cena THREE onde as árvores serão adicionadas.
 *   - getTerrainHeight: função (x, z) => número que retorna a altura do terreno nessa posição.
 *   - generateChunk: função para gerar um chunk dado (chunkX, chunkZ).
 *   - occupiedBlocks: conjunto (Set) contendo as posições já ocupadas.
 *   - blockTypeMap: mapa dos tipos de blocos.
 *   - terrainHeightMap: mapa das alturas do terreno.
 *   - treePositions: conjunto (Set) para rastrear posições de árvores.
 *   - updateProgress: função para atualizar o progresso.
 */
export async function loadAllTreesWithProgress(params) {
    const { 
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
    } = params;
    const treePromises = treeFiles.map(file =>
        fetch(file).then(resp => {
            if (!resp.ok) throw new Error(`Erro ao carregar ${file}: ${resp.status}`);
            return resp.json();
        })
    );
    const treesData = await Promise.all(treePromises);
    let treesAdded = 0;
    let attempts = 0;
    while (treesAdded < totalTreesNeeded && attempts < totalTreesNeeded * 5) {
        const randomTree = treesData[Math.floor(Math.random() * treesData.length)];
        const rx = Math.floor(Math.random() * planeSize) - Math.floor(planeSize / 2);
        const rz = Math.floor(Math.random() * planeSize) - Math.floor(planeSize / 2);
        generateChunk(Math.floor(rx / CHUNK_SIZE), Math.floor(rz / CHUNK_SIZE));
        const baseY = getTerrainHeight(rx, rz);
        if (baseY !== undefined && !isTreePositionOccupied(rx, rz) && canPlaceTree(randomTree, rx, baseY, rz, occupiedBlocks)) {
            if (addTree(randomTree, rx, baseY, rz, {
                scene,
                occupiedBlocks,
                terrainHeightMap,
                blockTypeMap,
                createInstancedMesh,
                chunkMeshes,
                loadedChunks
            })) {
                treesAdded++;
                updateProgress(`Carregando árvores (${treesAdded}/${totalTreesNeeded})`);
                treePositions.add(`${rx},${rz}`);
            }
        }
        attempts++;
    }
}
