import * as THREE from "three";
import { updateProgress, loadTextureWithProgress } from "./progress.js";
import { BLOCK_TYPES } from "./config.js";

/**
 * Configura um material com uma textura, definindo o repeat, wrapping e filtros.
 * @param {THREE.Texture} texture - A textura carregada.
 * @param {number} [repeatU=1] - Quantas vezes a textura se repete na horizontal.
 * @param {number} [repeatV=1] - Quantas vezes a textura se repete na vertical.
 * @param {function} [MaterialClass=THREE.MeshBasicMaterial] - Classe do material a ser usado.
 * @returns {THREE.Material} O material configurado.
 */
export function setMaterialWithTexture(texture, repeatU = 1, repeatV = 1, MaterialClass = THREE.MeshBasicMaterial) {
    const mat = new MaterialClass({ map: texture });
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
    mat.map.minFilter = mat.map.magFilter = THREE.LinearFilter;
    mat.map.repeat.set(repeatU, repeatV);
    return mat;
}

/**
 * Carrega as texturas necessárias e configura os materiais para os blocos.
 * @param {THREE.TextureLoader} textureLoader - Instância do TextureLoader.
 * @returns {Promise<Object>} Um objeto contendo os materiais configurados.
 */
export async function createBlockMaterials(textureLoader) {
    const blockMaterials = {};

    // Texturas para GRAMA (grass) – array com os 6 lados
    blockMaterials[BLOCK_TYPES.GRASS] = await Promise.all([
        loadTextureWithProgress("textures/grass_side.jpg", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/grass_side.jpg", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/grass_top.png", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/grass_side.jpg", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/grass_side.jpg", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/grass_side.jpg", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial))
    ]);
    updateProgress("Carregando texturas (Grama)");

    blockMaterials[BLOCK_TYPES.SAND] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/sand.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    updateProgress("Carregando texturas (Areia)");

    blockMaterials[BLOCK_TYPES.DIRT] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/grass_side.jpg", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    updateProgress("Carregando texturas (Terra)");

    blockMaterials[BLOCK_TYPES.STONE] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/stone.jpg", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    updateProgress("Carregando texturas (Pedra)");

    blockMaterials[BLOCK_TYPES.SNOW] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/snow.jpeg", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    updateProgress("Carregando texturas (Neve)");

    blockMaterials[BLOCK_TYPES.WATER] = (await Promise.all([
        loadTextureWithProgress("textures/transparent.png", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/transparent.png", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/water.png", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/transparent.png", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/transparent.png", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial)),
        loadTextureWithProgress("textures/transparent.png", textureLoader)
            .then(tex => setMaterialWithTexture(tex, 2, 2, THREE.MeshLambertMaterial))
    ])).map(material => {
        material.transparent = true;
        material.opacity = 0.8;
        material.depthWrite = false;
        return material;
    });
    updateProgress("Carregando texturas (Água)");

    blockMaterials[BLOCK_TYPES.BEDROCK] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/bedrock.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    updateProgress("Carregando texturas (Bedrock)");

    // Materiais para árvores
    blockMaterials[3] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/wood.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );

    // Materiais para árvores
    blockMaterials[BLOCK_TYPES.PURLE_LEAVES] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/purple_leaves.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    blockMaterials[BLOCK_TYPES.PURLE_LEAVES].transparent = true;
    blockMaterials[BLOCK_TYPES.PURLE_LEAVES].alphaTest = 0.1;
    blockMaterials[BLOCK_TYPES.PURLE_LEAVES].side = THREE.DoubleSide;
    updateProgress("Carregando texturas (Tronco)");

    blockMaterials[BLOCK_TYPES.LEAVES] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/green_leaves.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    blockMaterials[BLOCK_TYPES.LEAVES].transparent = true;
    blockMaterials[BLOCK_TYPES.LEAVES].alphaTest = 0.1;
    blockMaterials[BLOCK_TYPES.LEAVES].side = THREE.DoubleSide;
    updateProgress("Carregando texturas (Folhas verdes)");

    blockMaterials[BLOCK_TYPES.GLASS] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/glass.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    blockMaterials[BLOCK_TYPES.GLASS].transparent = true;
    blockMaterials[BLOCK_TYPES.GLASS].opacity = 0.5;
    blockMaterials[BLOCK_TYPES.GLASS].side = THREE.DoubleSide;
    updateProgress("Carregando texturas (Vidro)");

    blockMaterials[BLOCK_TYPES.WHITE_WOOD] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/white_wood.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    updateProgress("Carregando texturas (Madeira Branca)");

    blockMaterials[BLOCK_TYPES.BRICK] = setMaterialWithTexture(
        await loadTextureWithProgress("textures/brick.png", textureLoader),
        1,
        1,
        THREE.MeshLambertMaterial
    );
    updateProgress("Carregando texturas (Tijolo)");

    return blockMaterials;
}
