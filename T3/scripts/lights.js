import * as THREE from "three";
import { seaLevel } from "./config.js"; // Certifique-se de que o caminho esteja correto

let directionalLight, ambientLight, shadowCameraHelper;

/**
 * Configura a luz principal (direcional) e a luz ambiente.
 * @param {THREE.Scene} scene - A cena onde as luzes serão adicionadas.
 */
function setupLights(scene) {
    directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(50, 100, 50);
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

    shadowCameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    shadowCameraHelper.visible = false;
    scene.add(shadowCameraHelper);

    ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
}

/**
 * Atualiza a intensidade da luz ambiente com base na altura do jogador.
 * @param {number} playerY - A altura (em blocos) do jogador.
 */
function updateAmbientLight(playerY) {
    const maxHeight = 30;
    const minHeight = 0;
    const baseIntensity = 0.5;
    let intensity;

    if (playerY >= seaLevel) {
        intensity = baseIntensity;
    } else {
        intensity = THREE.MathUtils.lerp(0.1, baseIntensity, (playerY - minHeight) / (seaLevel - minHeight));
    }
    ambientLight.intensity = intensity;
}

/**
 * Retorna um fator de intensidade baseado na altura, para ajustar o brilho dos blocos.
 * @param {number} y - A altura do bloco.
 * @returns {number} - Intensidade (de 0.2 a 1.0).
 */
function getLightIntensity(y) {
    const maxHeight = 30;
    const minHeight = 0;
    const surfaceLevel = seaLevel;
    let intensity;

    if (y >= surfaceLevel) {
        intensity = 1.0;
    } else {
        intensity = THREE.MathUtils.lerp(0.2, 1.0, (y - minHeight) / (surfaceLevel - minHeight));
    }
    return intensity;
}

/**
 * Configura uma luz direcional secundária para complementar a iluminação.
 * @param {THREE.Scene} scene - A cena onde a luz secundária será adicionada.
 */
function setupSecondaryLight(scene) {
    const secondaryDirectionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
    secondaryDirectionalLight.position.set(-50, 100, -50);
    secondaryDirectionalLight.castShadow = false;
    scene.add(secondaryDirectionalLight);

    const secondaryDirectionalLightHelper = new THREE.DirectionalLightHelper(secondaryDirectionalLight, 10);
    secondaryDirectionalLightHelper.visible = false;
    scene.add(secondaryDirectionalLightHelper);
}

export { setupLights, updateAmbientLight, getLightIntensity, setupSecondaryLight, directionalLight, ambientLight, shadowCameraHelper };
