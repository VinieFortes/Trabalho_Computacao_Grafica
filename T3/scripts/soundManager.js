export default class SoundManager {
    constructor() {
        this.sounds = new Map();
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)(); // Único AudioContext
        this.lastWaterCollision = false;
        this.lastY = 0;
        this.lastPlayed = new Map();
        this.cooldown = 200;
        this.initializeSounds();
    }

    async initializeSounds() {
        await Promise.all([
            this.loadSound('grass1', 'sound_effect/grass1.wav'),
            this.loadSound('grass3', 'sound_effect/grass3.wav'),
            this.loadSound('sand4', 'sound_effect/sand4.wav'),
            this.loadSound('snow2', 'sound_effect/snow2.wav'),
            this.loadSound('stone4', 'sound_effect/stone4.wav'),
            this.loadSound('wood1', 'sound_effect/wood1.wav'),
            this.loadSound('enter1', 'sound_effect/enter1.wav'),
            this.loadSound('fallbig', 'sound_effect/fallbig.wav')
        ]);
    }

    async loadSound(name, path) {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`Sound file not found: ${path}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(name, audioBuffer); // Apenas o buffer, sem contexto por som
        } catch (error) {
            console.warn(`Failed to load ${name}: ${error.message}. Using silent fallback.`);
            this.sounds.set(name, null);
        }
    }

    playSound(name) {
        const now = Date.now();
        if (this.lastPlayed.get(name) && now - this.lastPlayed.get(name) < this.cooldown) return;

        const buffer = this.sounds.get(name);
        if (!buffer) return;

        // Sempre cria e toca o som, confiando que o AudioContext já foi ativado
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(0);
        this.lastPlayed.set(name, now);
    }

    // Handle block interaction sounds based on block type
    handleBlockSound(blockType) {
        console.log('blockType', blockType);
        switch(blockType) {
            case 0: // GRASS
            case 1:
                this.playSound('grass1');
                break;
            case 2: // DIRT
                this.playSound('grass3');
                break;
            case 7: // SAND
                this.playSound('sand4');
                break;
            case 5: // SNOW
                this.playSound('snow2');
                break;
            case 9: // BEDROCK
            case 13: // BRICK
                this.playSound('stone4');
                break;
            case 3: // TRUNK
            case 10: // TORCH
            case 12: // WHITE_WOOD
            case 11: // GLASS
                this.playSound('wood1');
                break;
            case 4: // LEAVES
                this.playSound('grass1');
                break;
            case undefined:
                this.playSound('grass1');
                break
        }
    }

    // Check for water collision
    checkWaterCollision(isInWater) {
        if (isInWater && !this.lastWaterCollision) {
            this.playSound('enter1');
        }
        this.lastWaterCollision = isInWater;
    }

    // Check for fall damage
    checkFallDamage(currentY) {
        const fallHeight = this.lastY - currentY;
        if (fallHeight > 3) {
            this.playSound('fallbig');
        }
        this.lastY = currentY;
    }

    // Update player position and check conditions
    update(player, blockTypeMap) {
        // Check fall damage
        if (player) {
            const currentY = Math.floor(player.position.y);
            if (currentY < this.lastY) {
                this.checkFallDamage(currentY);
            }
            this.lastY = currentY;

            // Check water collision
            const playerPos = {
                x: Math.floor(player.position.x),
                y: Math.floor(player.position.y),
                z: Math.floor(player.position.z)
            };
            const blockKey = `${playerPos.x},${playerPos.y},${playerPos.z}`;
            const isInWater = blockTypeMap[blockKey] === 6; // WATER type
            this.checkWaterCollision(isInWater);
        }
    }
}
