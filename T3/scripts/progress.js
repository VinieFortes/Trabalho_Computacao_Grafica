let totalTasks = 0;
let completedTasks = 0;

/**
 * Reinicia os contadores de progresso.
 */
function resetProgress() {
    totalTasks = 0;
    completedTasks = 0;
}

/**
 * Incrementa o número total de tarefas.
 * @param {number} count Número de tarefas a incrementar (padrão: 1).
 */
function incrementTotalTasks(count = 1) {
    totalTasks += count;
}

/**
 * Atualiza a barra de progresso e o status na UI.
 * @param {string} statusMessage Mensagem de status para exibir.
 * @param {boolean} lastFlag Se verdadeiro, exibe o botão de start ao finalizar.
 */
function updateProgress(statusMessage, lastFlag = false) {
    completedTasks++;
    const progress = Math.min((completedTasks / totalTasks) * 100, 100);
    const loaderBar = document.getElementById("loader-bar");
    const statusDiv = document.getElementById("loading-status");
    if (loaderBar) loaderBar.style.width = `${progress}%`;
    if (statusDiv) statusDiv.textContent = statusMessage || `Progresso: ${Math.round(progress)}%`;
    if (lastFlag && completedTasks >= totalTasks) {
        const startButton = document.getElementById("start-button");
        if (startButton) {
            startButton.style.display = "block";
            startButton.addEventListener("click", () => {
                document.getElementById("loading-screen").style.display = "none";
            });
        }
    }
}

/**
 * Carrega uma textura utilizando o TextureLoader e atualiza o progresso.
 * @param {string} url URL da textura a carregar.
 * @param {THREE.TextureLoader} textureLoader Instância do TextureLoader.
 * @returns {Promise<THREE.Texture>} Promessa que retorna a textura carregada.
 */
function loadTextureWithProgress(url, textureLoader) {
    incrementTotalTasks();
    return new Promise((resolve) => {
        textureLoader.load(url, (texture) => {
            updateProgress();
            resolve(texture);
        });
    });
}

export { resetProgress, incrementTotalTasks, updateProgress, loadTextureWithProgress, totalTasks, completedTasks };
