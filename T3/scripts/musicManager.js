export default class MusicManager {
    constructor() {
        this.tracks = [
            'sounds/calm.mp3',
            'sounds/haggstrom.mp3',
            'sounds/sweden.mp3'
        ];
        this.currentTrackIndex = -1;
        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 0.3; // Low volume by default

        // Create UI elements
        this.createUI();

        // Bind keyboard events
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyQ') {
                this.toggleMusic();
            }
        });
    }

    createUI() {
        this.statusContainer = document.createElement('div');
        this.statusContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 10px;
            border-radius: 5px;
            display: none;
            transition: opacity 0.5s;
            z-index: 1000;
        `;
        document.body.appendChild(this.statusContainer);
    }

    showStatus(message, duration = 2000) {
        this.statusContainer.textContent = message;
        this.statusContainer.style.display = 'block';
        this.statusContainer.style.opacity = '1';

        setTimeout(() => {
            this.statusContainer.style.opacity = '0';
            setTimeout(() => {
                this.statusContainer.style.display = 'none';
            }, 500);
        }, duration);
    }

    async initializeTracks() {
        // Pre-load a random track but don't play it yet
        const randomIndex = Math.floor(Math.random() * this.tracks.length);
        await this.loadTrack(randomIndex);
        // Playback will start only after user interaction (e.g., via toggleMusic)
    }

    async loadTrack(index) {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }

        const audio = new Audio();
        audio.volume = this.volume;
        audio.src = this.tracks[index];

        // Set up events for auto-playing next track
        audio.addEventListener('ended', () => {
            this.playNextTrack();
        });

        return new Promise((resolve, reject) => {
            audio.addEventListener('canplaythrough', () => {
                this.currentTrack = audio;
                this.currentTrackIndex = index;
                resolve();
            });
            audio.addEventListener('error', reject);
        });
    }

    async playNextTrack() {
        await this.fadeOut();
        const randomIndex = Math.floor(Math.random() * this.tracks.length);
        await this.loadTrack(randomIndex);
        await this.fadeIn();
    }

    async fadeOut(duration = 1000) {
        if (!this.currentTrack) return;

        const steps = 20;
        const initialVolume = this.currentTrack.volume;
        const volumeStep = initialVolume / steps;
        const stepDuration = duration / steps;

        return new Promise(resolve => {
            const fadeInterval = setInterval(() => {
                if (this.currentTrack.volume - volumeStep <= 0) {
                    this.currentTrack.volume = 0;
                    clearInterval(fadeInterval);
                    resolve();
                } else {
                    this.currentTrack.volume -= volumeStep;
                }
            }, stepDuration);
        });
    }

    async fadeIn(duration = 1000) {
        if (!this.currentTrack) return;

        const steps = 20;
        const targetVolume = this.volume;
        const volumeStep = targetVolume / steps;
        const stepDuration = duration / steps;

        this.currentTrack.volume = 0;
        this.currentTrack.play().catch(err => {
            console.error("Failed to play audio:", err);
            this.showStatus('Erro ao tocar música');
        });

        return new Promise(resolve => {
            const fadeInterval = setInterval(() => {
                if (this.currentTrack.volume + volumeStep >= targetVolume) {
                    this.currentTrack.volume = targetVolume;
                    clearInterval(fadeInterval);
                    resolve();
                } else {
                    this.currentTrack.volume += volumeStep;
                }
            }, stepDuration);
        });
    }

    async play() {
        if (!this.currentTrack) {
            // If no track is loaded, load a random one
            const randomIndex = Math.floor(Math.random() * this.tracks.length);
            await this.loadTrack(randomIndex);
        }

        this.isPlaying = true;
        await this.fadeIn();
        this.showStatus('🎵 Música Ligada');
    }

    async pause() {
        if (!this.currentTrack) return;

        await this.fadeOut();
        this.currentTrack.pause();
        this.isPlaying = false;
        this.showStatus('🔇 Música Desligada');
    }

    async toggleMusic() {
        if (this.isPlaying) {
            await this.pause();
        } else {
            await this.play();
        }
    }
}