import * as THREE from "three";
import { createTorch } from "./torch.js";
import { BLOCK_TYPES, CHUNK_SIZE, planeSize, voxelSize } from "./config.js";

// Building files and their dimensions
export const buildingFiles = [
    "buildings/easter.json",
    "buildings/casa.json",
    "buildings/igreja.json",
];

export const buildingSizes = {
    "buildings/easter.json": { width: 7, depth: 7 },
    "buildings/casa.json": { width: 17, depth: 11 },
    "buildings/igreja.json": { width: 20, depth: 16 },
};

// Função auxiliar para obter a altura mínima da superfície
function getMinSurfaceHeight(baseX, baseZ, width, depth, terrainHeightMap) {
    let minHeight = Infinity;
    for (let x = baseX; x < baseX + width; x++) {
        for (let z = baseZ; z < baseZ + depth; z++) {
            const currentHeight = getTerrainHeight(x, z, terrainHeightMap);
            if (currentHeight < minHeight) {
                minHeight = currentHeight;
            }
        }
    }
    return minHeight;
}

// Função auxiliar para obter a altura máxima da superfície
export function getMaxSurfaceHeight(baseX, baseZ, width, depth, terrainHeightMap) {
    let maxHeight = 0;
    for (let x = baseX; x < baseX + width; x++) {
        for (let z = baseZ; z < baseZ + depth; z++) {
            const currentHeight = getTerrainHeight(x, z, terrainHeightMap);
            if (currentHeight > maxHeight) {
                maxHeight = currentHeight;
            }
        }
    }
    return maxHeight;
}

export function forceTerrainFlat(baseX, baseZ, width, depth, fillHeight, {
    terrainHeightMap,
    occupiedBlocks,
    blockTypeMap,
    scene,
    createInstancedMesh,
    chunkMeshes,
    loadedChunks
}) {
    baseX = Math.floor(baseX);
    baseZ = Math.floor(baseZ);
    width = Math.ceil(width);
    depth = Math.ceil(depth);
    fillHeight = Math.floor(fillHeight);

    // Passo 1: Limpar apenas blocos acima de fillHeight
    const waterBlocks = [];
    for (let x = baseX; x < baseX + width; x++) {
        for (let z = baseZ; z < baseZ + depth; z++) {
            const currentHeight = getTerrainHeight(x, z, terrainHeightMap) || 0;
            for (let y = fillHeight + 1; y <= currentHeight; y++) {
                const key = `${x},${y},${z}`;
                if (occupiedBlocks.has(key)) {
                    // Save water blocks for later restoration
                    if (blockTypeMap[key] === BLOCK_TYPES.WATER) {
                        waterBlocks.push({ x, y, z });
                    }
                    occupiedBlocks.delete(key);
                    delete blockTypeMap[key];
                }
            }
        }
    }

    // Passo 2: Preencher a camada inferior (base)
    const positions = [];
    for (let x = baseX; x < baseX + width; x++) {
        for (let z = baseZ; z < baseZ + depth; z++) {
            const key = `${x},${fillHeight},${z}`;
            const hasBlockAbove = occupiedBlocks.has(`${x},${fillHeight + 1},${z}`);
            if (!hasBlockAbove || !occupiedBlocks.has(key) || getTerrainHeight(x, z, terrainHeightMap) < fillHeight) {
                positions.push({ x, y: fillHeight, z });
                occupiedBlocks.add(key);
                blockTypeMap[key] = BLOCK_TYPES.DIRT;
            }
            terrainHeightMap[`${x},${z}`] = Math.max(terrainHeightMap[`${x},${z}`] || 0, fillHeight + 1);
        }
    }

    // Passo 3: Criar escadas nas bordas
    const minTerrainHeightAround = getMinSurfaceHeight(baseX - 2, baseZ - 2, width + 4, depth + 4, terrainHeightMap);
    const maxSteps = Math.max(1, fillHeight - (minTerrainHeightAround > 0 ? minTerrainHeightAround : 0));

    for (let step = 1; step <= maxSteps; step++) {
        const currentHeight = fillHeight - step + 1;
        if (currentHeight < 0) break;

        // Preencher todos os lados (norte, sul, leste, oeste)
        for (let x = baseX - step; x < baseX + width + step; x++) {
            if (x >= baseX && x < baseX + width) {
                if (!occupiedBlocks.has(`${x},${currentHeight},${baseZ - step}`) && currentHeight >= (minTerrainHeightAround || 0)) {
                    positions.push({ x, y: currentHeight, z: baseZ - step });
                    occupiedBlocks.add(`${x},${currentHeight},${baseZ - step}`);
                    blockTypeMap[`${x},${currentHeight},${baseZ - step}`] = BLOCK_TYPES.DIRT;
                }
                if (!occupiedBlocks.has(`${x},${currentHeight},${baseZ + depth + step - 1}`) && currentHeight >= (minTerrainHeightAround || 0)) {
                    positions.push({ x, y: currentHeight, z: baseZ + depth + step - 1 });
                    occupiedBlocks.add(`${x},${currentHeight},${baseZ + depth + step - 1}`);
                    blockTypeMap[`${x},${currentHeight},${baseZ + depth + step - 1}`] = BLOCK_TYPES.DIRT;
                }
            }
        }
        for (let z = baseZ - step; z < baseZ + depth + step; z++) {
            if (z >= baseZ && z < baseZ + depth) {
                if (!occupiedBlocks.has(`${baseX - step},${currentHeight},${z}`) && currentHeight >= (minTerrainHeightAround || 0)) {
                    positions.push({ x: baseX - step, y: currentHeight, z });
                    occupiedBlocks.add(`${baseX - step},${currentHeight},${z}`);
                    blockTypeMap[`${baseX - step},${currentHeight},${z}`] = BLOCK_TYPES.DIRT;
                }
                if (!occupiedBlocks.has(`${baseX + width + step - 1},${currentHeight},${z}`) && currentHeight >= (minTerrainHeightAround || 0)) {
                    positions.push({ x: baseX + width + step - 1, y: currentHeight, z });
                    occupiedBlocks.add(`${baseX + width + step - 1},${currentHeight},${z}`);
                    blockTypeMap[`${baseX + width + step - 1},${currentHeight},${z}`] = BLOCK_TYPES.DIRT;
                }
            }
        }
    }

    // Criar o mesh para todos os blocos
    if (positions.length > 0) {
        const chunkX = Math.floor(baseX / CHUNK_SIZE);
        const chunkZ = Math.floor(baseZ / CHUNK_SIZE);
        const chunkKey = `${chunkX},${chunkZ}`;

        // Create dirt blocks mesh
        const batchMesh = createInstancedMesh(positions, BLOCK_TYPES.DIRT);
        if (batchMesh) {
            batchMesh.userData.isBuildingBase = true;
            batchMesh.userData.chunkKey = chunkKey;
            batchMesh.castShadow = true;
            batchMesh.receiveShadow = true;
            batchMesh.visible = true;

            const dummy = new THREE.Object3D();
            for (let i = 0; i < positions.length; i++) {
                const { x, y, z } = positions[i];
                dummy.position.set(x, y * voxelSize + voxelSize / 2, z);
                dummy.updateMatrix();
                batchMesh.setMatrixAt(i, dummy.matrix);
            }
            batchMesh.instanceMatrix.needsUpdate = true;

            // Add to chunk management system
            let chunkData = chunkMeshes.get(chunkKey) || {};
            if (chunkData[BLOCK_TYPES.DIRT]) {
                scene.remove(chunkData[BLOCK_TYPES.DIRT]);
            }
            chunkData[BLOCK_TYPES.DIRT] = batchMesh;
            scene.add(batchMesh);

            // Restore water blocks
            if (waterBlocks.length > 0) {
                const waterMesh = createInstancedMesh(waterBlocks, BLOCK_TYPES.WATER);
                if (waterMesh) {
                    waterMesh.userData.chunkKey = chunkKey;
                    waterMesh.userData.isBuildingBlock = true;
                    scene.add(waterMesh);
                    if (chunkData[BLOCK_TYPES.WATER]) {
                        scene.remove(chunkData[BLOCK_TYPES.WATER]);
                    }
                    chunkData[BLOCK_TYPES.WATER] = waterMesh;

                    // Re-add water blocks to tracking
                    waterBlocks.forEach(({ x, y, z }) => {
                        const key = `${x},${y},${z}`;
                        occupiedBlocks.add(key);
                        blockTypeMap[key] = BLOCK_TYPES.WATER;
                    });
                }
            }

            chunkMeshes.set(chunkKey, chunkData);
            loadedChunks.add(chunkKey);
            return true;
        }
    }
    return false;
}

// Função principal para carregar todos os buildings com progresso
export async function loadAllBuildingsWithProgress(totalBuildingsNeeded = buildingFiles.length, {
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
}) {
    console.log('Tentando carregar construções:', buildingFiles);
    const buildingPromises = buildingFiles.map((file) =>
        fetch(file)
            .then((resp) => {
                if (!resp.ok) throw new Error(`Erro ao carregar ${file}: ${resp.status}`);
                return resp.json();
            })
            .catch(error => {
                console.error(`Erro ao carregar ${file}:`, error);
                return null;
            })
    );
    const buildingsData = (await Promise.all(buildingPromises)).filter(data => data !== null);
    console.log('Construções carregadas:', buildingsData.length);

    if (buildingsData.length === 0) {
        console.error('Nenhuma construção foi carregada com sucesso!');
        return;
    }

    totalBuildingsNeeded = Math.min(totalBuildingsNeeded, buildingsData.length * 2);
    console.log(`Total de construções a carregar: ${totalBuildingsNeeded}`);

    let availableBuildings = [...buildingsData];
    let availableBuildingFiles = [...buildingFiles];

    let buildingsAdded = 0;
    let attempts = 0;
    const maxAttempts = totalBuildingsNeeded * 2000;
    const buildingPositions = new Set();

    const quadrants = [
        { minX: -planeSize/2, maxX: 0, minZ: -planeSize/2, maxZ: 0 },
        { minX: 0, maxX: planeSize/2, minZ: -planeSize/2, maxZ: 0 },
        { minX: -planeSize/2, maxX: 0, minZ: 0, maxZ: planeSize/2 },
        { minX: 0, maxX: planeSize/2, minZ: 0, maxZ: planeSize/2 }
    ];
    let currentQuadrant = 0;

    while (buildingsAdded < totalBuildingsNeeded && attempts < maxAttempts && availableBuildings.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableBuildings.length);
        const randomBuilding = availableBuildings[randomIndex];
        const fileName = availableBuildingFiles[randomIndex];

        const buffer = 1;
        const quadrant = quadrants[currentQuadrant];
        const rx = Math.floor(Math.random() * (quadrant.maxX - quadrant.minX - buffer * 2 - (buildingSizes[fileName]?.width || randomBuilding.width))) + quadrant.minX + buffer;
        const rz = Math.floor(Math.random() * (quadrant.maxZ - quadrant.minZ - buffer * 2 - (buildingSizes[fileName]?.depth || randomBuilding.depth))) + quadrant.minZ + buffer;

        currentQuadrant = (currentQuadrant + 1) % quadrants.length;

        const chunkX = Math.floor(rx / CHUNK_SIZE);
        const chunkZ = Math.floor(rz / CHUNK_SIZE);
        generateChunk(chunkX, chunkZ);

        const size = buildingSizes[fileName] || { width: randomBuilding.width, depth: randomBuilding.depth };

        let isAreaFree = true;
        for (let x = rx - 1; x < rx + size.width + 1; x++) {
            for (let z = rz - 1; z < rz + size.depth + 1; z++) {
                const posKey = `${x},${z}`;
                if (treePositions.has(posKey) || buildingPositions.has(posKey)) {
                    isAreaFree = false;
                    break;
                }
            }
            if (!isAreaFree) break;
        }

        if (!isAreaFree) {
            attempts++;
            continue;
        }

        // Calcular targetHeight com base na altura mínima do terreno + margem
        const minSurfaceHeight = getMinSurfaceHeight(rx - 2, rz - 2, size.width + 4, size.depth + 4, terrainHeightMap);
        const targetY = 19 // Altura da base da construção
        const fillHeight = targetY - 1; // Altura do preenchimento, uma camada abaixo
        const padding = 2;

        console.log(`Tentando preencher em (${rx}, ${rz}) com targetY=${targetY}, fillHeight=${fillHeight}, minSurfaceHeight=${minSurfaceHeight}`);

        if (forceTerrainFlat(rx - padding, rz - padding, size.width + (padding * 2), size.depth + (padding * 2), fillHeight, {
            terrainHeightMap,
            occupiedBlocks,
            blockTypeMap,
            scene,
            createInstancedMesh,
            chunkMeshes,
            loadedChunks
        })) {
            if (addBuilding(randomBuilding, rx, targetY, rz, size, {
                scene,
                blockMaterials,
                sharedGeometry,
                occupiedBlocks,
                blockTypeMap,
                terrainHeightMap,
                chunkMeshes,
                loadedChunks,
                createInstancedMesh
            })) {
                buildingsAdded++;
                updateProgress(`Carregando construções (${buildingsAdded}/${totalBuildingsNeeded})`);

                for (let x = rx - 1; x < rx + size.width + 1; x++) {
                    for (let z = rz - 1; z < rz + size.depth + 1; z++) {
                        buildingPositions.add(`${x},${z}`);
                    }
                }

                availableBuildings.splice(randomIndex, 1);
                availableBuildingFiles.splice(randomIndex, 1);
                console.log(`Construção adicionada em (${rx}, ${rz}) com base em Y=${targetY}. Total: ${buildingsAdded}/${totalBuildingsNeeded}`);
            } else {
                console.warn(`Falha ao adicionar construção em (${rx}, ${rz}) apesar do preenchimento.`);
            }
        } else {
            console.warn(`Falha ao preencher terreno em (${rx}, ${rz}) com fillHeight=${fillHeight}.`);
        }
        attempts++;
    }

    if (buildingsAdded < totalBuildingsNeeded) {
        console.warn(`Apenas ${buildingsAdded} de ${totalBuildingsNeeded} construções foram adicionadas após ${attempts} tentativas.`);
    } else {
        console.log(`Todas as ${buildingsAdded} construções foram adicionadas com sucesso após ${attempts} tentativas.`);
    }
}

// Função para adicionar um building na cena
export function addBuilding(buildingData, baseX, baseY, baseZ, size, {
    scene,
    blockMaterials,
    sharedGeometry,
    occupiedBlocks,
    blockTypeMap,
    terrainHeightMap,
    chunkMeshes,
    loadedChunks,
    createInstancedMesh
}) {
    const voxels = buildingData.voxels || buildingData;
    if (!voxels || voxels.length === 0) {
        console.warn("Construção sem blocos!");
        return false;
    }

    let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
    voxels.forEach(v => {
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.z < minZ) minZ = v.z;
    });

    // Organizar blocos por chunk para gerenciar visibilidade
    const chunkBlocks = new Map(); // Map de chunkKey -> array de {voxel, position}
    const torchPositions = [];

    voxels.forEach(voxel => {
        const localX = Math.floor(voxel.x - minX);
        const localY = Math.floor(voxel.y - minY);
        const localZ = Math.floor(voxel.z - minZ);

        const worldX = baseX + localX;
        const worldY = baseY + localY;
        const worldZ = baseZ + localZ;

        const blockKey = `${worldX},${worldY},${worldZ}`;
        occupiedBlocks.add(blockKey);
        blockTypeMap[blockKey] = voxel.type;

        if (voxel.type === BLOCK_TYPES.TORCH) {
            torchPositions.push(new THREE.Vector3(worldX, worldY, worldZ));
        } else {
            const chunkX = Math.floor(worldX / CHUNK_SIZE);
            const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
            const chunkKey = `${chunkX},${chunkZ}`;

            if (!chunkBlocks.has(chunkKey)) {
                chunkBlocks.set(chunkKey, []);
            }

        // Store block data for chunk management and regeneration
        const blockKey = `${worldX},${worldY},${worldZ}`;
        if (!occupiedBlocks.has(blockKey)) {
            occupiedBlocks.add(blockKey);
            blockTypeMap[blockKey] = voxel.type;
            
            // Update terrain height if this block is higher (skip for water blocks)
            if (voxel.type !== BLOCK_TYPES.WATER) {
                const terrainKey = `${worldX},${worldZ}`;
                terrainHeightMap[terrainKey] = Math.max(terrainHeightMap[terrainKey] || 0, worldY + 1);
            }
        }

            chunkBlocks.get(chunkKey).push({
                type: voxel.type,
                position: new THREE.Vector3(
                    worldX,
                    worldY * voxelSize + voxelSize / 2,
                    worldZ
                )
            });
        }
    });

    // Adicionar tochas
    torchPositions.forEach(position => {
        const chunkX = Math.floor(position.x / CHUNK_SIZE);
        const chunkZ = Math.floor(position.z / CHUNK_SIZE);
        const chunkKey = `${chunkX},${chunkZ}`;
        createTorch(scene, position, chunkMeshes, loadedChunks, CHUNK_SIZE);
    });

    // Criar InstancedMesh para os blocos, organizados por chunk e tipo
    for (const [chunkKey, blocks] of chunkBlocks) {
        // Organizar blocos por tipo
        const blocksByType = new Map();
        blocks.forEach(({ type, position }) => {
            if (!blocksByType.has(type)) {
                blocksByType.set(type, []);
            }
            blocksByType.get(type).push(position);
        });

    // Criar ou atualizar InstancedMesh para cada tipo
    for (const [type, positions] of blocksByType) {
        let chunkData = chunkMeshes.get(chunkKey) || {};
        const instancedMesh = createInstancedMesh(
            positions.map(p => ({ 
                x: Math.floor(p.x), 
                y: Math.floor(p.y/voxelSize - 0.5), 
                z: Math.floor(p.z) 
            })), 
            type
        );
        if (instancedMesh) {
            instancedMesh.userData.chunkKey = chunkKey;
            instancedMesh.userData.isBuildingBlock = true;
            scene.add(instancedMesh);
            if (chunkData[type]) {
                scene.remove(chunkData[type]);
            }
            chunkData[type] = instancedMesh;
            chunkMeshes.set(chunkKey, chunkData);
        }
        }
        loadedChunks.add(chunkKey);
    }

    // Não precisamos atualizar terrainHeightMap aqui, pois forceTerrainFlat já fez isso
    return true;
}

// Função auxiliar para obter a altura do terreno
function getTerrainHeight(x, z, terrainHeightMap) {
    const key = `${Math.round(x)},${Math.round(z)}`;
    return terrainHeightMap[key] || 0;
}
