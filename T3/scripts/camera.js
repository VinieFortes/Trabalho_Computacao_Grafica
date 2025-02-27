import * as THREE from "three";
import {OrbitControls} from "../../build/jsm/controls/OrbitControls.js";
import {
    cameraDistance,
    cameraHeight,
    DEFAULT_FOV,
    FOV_LERP_SPEED,
    planeSize,
    playerHeight,
    RUNNING_FOV
} from "./config.js";
import {setFogEnabled} from "../execution_part3.js";
import {isPositionInsideBlock} from "../execution_part3.js"; // Importa a função de verificação de colisão

let cameraMode = 0;
let firstPersonCamera, currentCamera;
let orbitCamera, thirdPersonCamera;
let orbitControls;
let cameraShouldRealign = false;
let headMesh = null; // Adiciona headMesh como propriedade do módulo

export { cameraMode, orbitControls, smoothAngle };

export function setupCameras(renderer) {
    orbitCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    orbitCamera.position.set(0, 150, 0);
    orbitCamera.lookAt(0, 0, 0);

    orbitControls = new OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.enablePan = true;
    orbitControls.enableZoom = true;
    orbitControls.minDistance = 50;
    orbitControls.enabled = false;
    orbitControls.maxDistance = planeSize;
    orbitControls.maxPolarAngle = Math.PI / 2;
    orbitControls.update();

    thirdPersonCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    firstPersonCamera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    firstPersonCamera.position.set(0, playerHeight, 0);
    currentCamera = firstPersonCamera;

    return {
        getCurrentCamera: () => currentCamera,
        getCameraMode: () => cameraMode,
        getOrbitControls: () => orbitControls
    };
}

export function setHeadMesh(mesh) {
    headMesh = mesh; // Método para definir headMesh no CameraManager
}

export function toggleCamera(model, renderer, mesh) {
    if (mesh) setHeadMesh(mesh); // Define headMesh se passado
    cameraMode = (cameraMode + 1) % 3;
    const crosshair = document.getElementById("crosshair");

    if (cameraMode === 0) {
        setFogEnabled(true);
        orbitControls.enabled = false;
        currentCamera = firstPersonCamera;
        crosshair.style.display = "block";
        if (headMesh) headMesh.visible = false; // Esconde a cabeça em primeira pessoa por padrão
    } else if (cameraMode === 1) { // Third Person
        setFogEnabled(true);
        orbitControls.enabled = false;
        currentCamera = thirdPersonCamera;
        cameraShouldRealign = true;
        crosshair.style.display = "none";
        if (headMesh) headMesh.visible = true; // Mostra a cabeça em terceira pessoa
    } else if (cameraMode === 2) { // Orbit
        orbitControls.enabled = true;
        currentCamera = orbitCamera;
        if (model) {
            orbitCamera.position.set(
                model.position.x,
                model.position.y + 50,
                model.position.z + 50
            );
            orbitControls.target.copy(model.position);
            orbitControls.update();
        }
        crosshair.style.display = "none";
        if (headMesh) headMesh.visible = true; // Mostra a cabeça em modo orbit
        setFogEnabled(false);

        if (document.pointerLockElement === renderer.domElement) {
            document.exitPointerLock();
        }
    }

    return currentCamera;
}

export function updateFirstPersonCamera(model, cameraAngleX, cameraAngleY) {
    if (!model || !headMesh) return;

    model.rotation.y = cameraAngleY;

    const offsetForward = -0.5;
    const desiredPosition = new THREE.Vector3(
        model.position.x + Math.sin(cameraAngleY) * offsetForward,
        model.position.y + playerHeight + 0.9,
        model.position.z + Math.cos(cameraAngleY) * offsetForward
    );

    // Verifica se a posição desejada está dentro de um bloco
    let positionAdjusted = false;
    if (isPositionInsideBlock(desiredPosition)) {
        // positionAdjusted = true;
    }

    currentCamera.position.copy(desiredPosition);
    currentCamera.rotation.set(cameraAngleX, cameraAngleY, 0, "YXZ");


    headMesh.visible = positionAdjusted;
}

export function updateThirdPersonCamera(model, delta, isRunning, cameraAngleX, cameraAngleY) {
    if (!model || !headMesh) return;

    const targetFOV = isRunning ? RUNNING_FOV : DEFAULT_FOV;
    thirdPersonCamera.fov += (targetFOV - thirdPersonCamera.fov) * delta * FOV_LERP_SPEED;
    thirdPersonCamera.updateProjectionMatrix();

    if (cameraShouldRealign) {
        cameraAngleY = smoothAngle(cameraAngleY, model.rotation.y, 2.5, delta);
        cameraShouldRealign = false;
    }

    const offsetX = Math.sin(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
    const offsetZ = Math.cos(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
    const offsetY = Math.sin(cameraAngleX) * cameraDistance;

    const desiredPos = new THREE.Vector3(
        model.position.x - offsetX,
        model.position.y + cameraHeight + offsetY,
        model.position.z - offsetZ
    );

    // Verifica se a posição desejada está dentro de um bloco
    if (isPositionInsideBlock(desiredPos)) {
        desiredPos.y += 1; // Ajuste o valor conforme necessário
    }

    const lerpFactor = 0.1;
    thirdPersonCamera.position.lerp(desiredPos, lerpFactor);

    const lookAtPos = new THREE.Vector3(
        model.position.x,
        model.position.y + playerHeight,
        model.position.z
    );
    thirdPersonCamera.lookAt(lookAtPos);

    // Garante que a cabeça permaneça visível na terceira pessoa
    headMesh.visible = true;
}

function smoothAngle(current, target, speed, delta) {
    let diff = ((target - current + Math.PI) % (2 * Math.PI)) - Math.PI;
    return current + diff * Math.min(1, speed * delta);
}