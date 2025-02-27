import * as THREE from "three";

// Variáveis internas para os elementos do céu
let skyGroup, sunMesh, moonMesh;
const cloudMeshes = [];
const starMeshes = [];

/**
 * Cria os elementos do céu (sol, lua, nuvens e estrelas) e os adiciona à cena.
 * @param {THREE.Scene} scene - A cena onde os elementos serão adicionados.
 */
export function createSkyElements(scene) {
    skyGroup = new THREE.Group();
    scene.add(skyGroup);

    // Sol
    const sunGeometry = new THREE.PlaneGeometry(25, 25);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: 0xffdd00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        emissive: 0xffdd00,
        emissiveIntensity: 1,
    });
    sunMaterial.fog = false;
    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(100, 150, 0);
    skyGroup.add(sunMesh);

    // Lua
    const moonGeometry = new THREE.PlaneGeometry(18, 18);
    const moonMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
    });
    moonMaterial.fog = false;
    moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    moonMesh.position.set(-80, 150, 0);
    skyGroup.add(moonMesh);

    // Nuvens (estilo Minecraft)
    const createMinecraftCloud = () => {
        const group = new THREE.Group();
        const patterns = [
            [
                [0, 1, 1, 1, 0],
                [1, 1, 1, 1, 1],
                [0, 1, 1, 1, 0],
            ],
            [
                [0, 1, 1, 1, 1, 0],
                [1, 1, 1, 1, 1, 1],
                [0, 1, 1, 1, 1, 0],
            ],
            [
                [0, 1, 1, 0],
                [1, 1, 1, 1],
                [1, 1, 1, 1],
                [0, 1, 1, 0],
            ],
        ];
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        for (let z = 0; z < pattern.length; z++) {
            for (let x = 0; x < pattern[z].length; x++) {
                if (pattern[z][x] === 1) {
                    const blockMaterial = new THREE.MeshBasicMaterial({
                        color: 0xffffff,
                        transparent: true,
                        opacity: 0.95,
                    });
                    blockMaterial.fog = false;
                    const block = new THREE.Mesh(
                        new THREE.BoxGeometry(8, 4, 8),
                        blockMaterial
                    );
                    block.position.set(x * 8, 0, z * 8);
                    block.position.y += Math.random() * 2;
                    group.add(block);
                }
            }
        }
        return group;
    };

    for (let i = 0; i < 12; i++) {
        const cloud = createMinecraftCloud();
        const angle = (i / 12) * Math.PI * 2;
        const radius = 120 + Math.random() * 60;
        const randX = Math.cos(angle) * radius;
        const randZ = Math.sin(angle) * radius;
        const randY = 120 + Math.random() * 20;
        cloud.position.set(randX, randY, randZ);
        cloud.rotation.y = Math.random() * Math.PI * 2;
        skyGroup.add(cloud);
        cloudMeshes.push(cloud);
    }

    // Estrelas
    for (let i = 0; i < 50; i++) {
        const starGeo = new THREE.PlaneGeometry(0.5, 0.5);
        const starMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
        });
        starMaterial.fog = false;
        const starMesh = new THREE.Mesh(starGeo, starMaterial);
        const radius = 200 + Math.random() * 200;
        const angle = Math.random() * Math.PI * 2;
        starMesh.position.set(
            Math.cos(angle) * radius,
            120 + Math.random() * 50,
            Math.sin(angle) * radius
        );
        skyGroup.add(starMesh);
        starMeshes.push(starMesh);
    }
}

/**
 * Atualiza a posição, opacidade e cores do sol, lua, nuvens e estrelas
 * de acordo com o ciclo dia/noite.
 * @param {number} timeOfDay - Valor entre 0 e 1 representando a fração do dia.
 */
export function updateSkyElements(timeOfDay) {
    const hourOfDay = (timeOfDay * 24 + 12) % 24;
    const dayProgress = hourOfDay / 24;
    const angle = dayProgress * Math.PI * 2;

    let dynamicRadius = 200;
    if (hourOfDay < 8) {
        dynamicRadius += (8 - hourOfDay) * 10;
    } else if (hourOfDay > 16) {
        dynamicRadius += (hourOfDay - 16) * 10;
    }

    const heightOffset = 200;
    const sunAngle = angle - Math.PI * 0.5;
    let sunOpacity = 0;
    if (hourOfDay >= 6 && hourOfDay <= 18) {
        sunOpacity = 0.9;
    } else if (hourOfDay > 5 && hourOfDay < 6) {
        sunOpacity = (hourOfDay - 5) * 0.9;
    } else if (hourOfDay > 18 && hourOfDay < 19) {
        sunOpacity = (19 - hourOfDay) * 0.9;
    }
    sunMesh.material.opacity = sunOpacity;
    const yOffset = heightOffset + (1 - sunOpacity) * 150 + Math.sin(sunAngle);
    sunMesh.position.set(Math.cos(sunAngle) * dynamicRadius, yOffset, 0);
    if (sunOpacity > 0) {
        sunMesh.material.color.setHex(0xffdd00);
        sunMesh.material.emissiveIntensity = 1.2;
    }
    sunMesh.lookAt(0, 0, 0);

    const moonAngle = sunAngle + Math.PI;
    const moonRadius = 120;
    moonMesh.position.set(
        Math.cos(moonAngle) * moonRadius,
        heightOffset + Math.sin(moonAngle) * 150,
        0
    );
    moonMesh.lookAt(0, 0, 0);

    let moonOpacity = 0;
    if (hourOfDay >= 18 || hourOfDay <= 5) {
        moonOpacity = 1.0;
    } else if (hourOfDay > 5 && hourOfDay < 6) {
        moonOpacity = 6 - hourOfDay;
    } else if (hourOfDay > 17 && hourOfDay < 18) {
        moonOpacity = hourOfDay - 17;
    }
    moonMesh.material.opacity = moonOpacity;
    moonMesh.material.color.setHex(0xffffff);

    const sunValue = Math.cos(timeOfDay * Math.PI * 2);
    const factor = (sunValue + 1) / 2;
    const cloudOpacity = THREE.MathUtils.lerp(0.4, 1.0, factor);
    cloudMeshes.forEach((cloud) => {
        cloud.traverse((child) => {
            if (child.isMesh) {
                child.material.opacity = cloudOpacity;
                child.material.color.setHex(0xf8f8f8);
            }
        });
        cloud.position.x += 0.01 * Math.sin(Date.now() * 0.00008 + cloud.position.z);
        cloud.position.z += 0.01 * Math.cos(Date.now() * 0.00008 + cloud.position.x);
    });
    const starOpacity = 1.0 - factor;
    starMeshes.forEach((star) => {
        star.material.opacity = starOpacity;
    });
}

/**
 * Atualiza o ciclo dia/noite e as luzes do ambiente.
 * Esta função pode ser chamada dentro do loop de animação.
 * @param {number} delta - Tempo decorrido entre frames.
 * @param {Object} timeRef - Objeto com uma propriedade "value" que guarda o tempo do dia.
 * @param {THREE.DirectionalLight} directionalLight
 * @param {THREE.AmbientLight} ambientLight
 * @param {THREE.Scene} scene
 */
export function updateDayNightCycle(delta, timeRef, directionalLight, ambientLight, scene) {
    const dayNightSpeed = 0.005;
    timeRef.value += delta * dayNightSpeed;
    timeRef.value %= 1;

    const sunValue = Math.cos(timeRef.value * Math.PI * 2);
    directionalLight.intensity = sunValue * 2.5 + 3;
    const ambientValue = Math.cos(timeRef.value * Math.PI * 2);
    ambientLight.intensity = ambientValue * 3 + 2;

    // Atualiza a cor do céu e da névoa
    const daySkyColor = new THREE.Color(0x87ceeb);
    const nightSkyColor = new THREE.Color(0x0c0c30);
    const factor = (sunValue + 1) / 2;
    const skyColor = new THREE.Color().lerpColors(nightSkyColor, daySkyColor, factor);
    scene.background.copy(skyColor);
    if (scene.fog) {
        scene.fog.color.copy(skyColor);
    }

    // Atualiza a cor da luz do sol e a luz ambiente
    const dayColor = new THREE.Color(0xffffff);
    const nightColor = new THREE.Color(0x1f1f4d);
    const sunColor = new THREE.Color().lerpColors(nightColor, dayColor, factor);
    directionalLight.color.copy(sunColor);

    const dayAmbient = new THREE.Color(0x404040);
    const nightAmbient = new THREE.Color(0x101010);
    const ambientColor = new THREE.Color().lerpColors(nightAmbient, dayAmbient, factor);
    ambientLight.color.copy(ambientColor);

    // Atualiza os elementos do céu
    updateSkyElements(timeRef.value);

    // ---- Cálculo da "hora do jogo" para exibir em texto
    // 0 => 12h | 0.5 => 0h
    let totalMinutes = timeRef.value * 1440;  // 24 * 60 = 1440
    totalMinutes += 720; // deslocar +12h
    totalMinutes %= 1440;

    const hours   = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    const gameTimeDiv = document.getElementById("game-time");
    if (gameTimeDiv) {
        gameTimeDiv.textContent = `Hora: ${formattedTime}`;
    }
}
