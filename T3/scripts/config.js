// -------------------
// GENERAL CONFIGURATION
// -------------------
export const planeSize = 250; // World size
export const voxelSize = 1.0; // Cube size (1x1x1)
export const playerSpeed = 3; // Character movement speed
export const jumpSpeed = 10.0; // Jump speed
export const gravity = 25; // Gravity force
export const HALF_PLANE_SIZE = planeSize / 2;

// Mouse sensitivity
export let mouseSensitivityX = 0.0015;
export let mouseSensitivityY = 0.0015;
export let invertY = false;

// Trees
export const totalTreesNeeded = 50;

// Chunks and fog
export const CHUNK_SIZE = 6;
export let currentFogDistance = 30;
export let fogEnabled = true;

// Player dimensions
export const playerHeight = 1.6;
export const playerWidth = 0.6;
export const playerDepth = 0.6;

// Block types and terrain
export const BLOCK_TYPES = {
    GRASS: 0,
    DIRT: 1,
    STONE: 2,
    TRUNK: 3,
    LEAVES: 4,
    SNOW: 5,
    PURLE_LEAVES: 6,
    SAND: 7,
    WATER: 8,
    BEDROCK: 9,
    TORCH: 10,
    GLASS: 11,
    WHITE_WOOD: 12,
    BRICK: 13,
};

export const typeHeightMap = {
    [BLOCK_TYPES.GRASS]: 1,
    [BLOCK_TYPES.DIRT]: 3,
    [BLOCK_TYPES.STONE]: 20,
    [BLOCK_TYPES.SNOW]: 1,
};

export const colorMap = {
    [BLOCK_TYPES.GRASS]: 0x00ff00,
    [BLOCK_TYPES.DIRT]: 0xffa500,
    [BLOCK_TYPES.STONE]: 0x808080,
    [BLOCK_TYPES.TRUNK]: 0x8b4513,
    [BLOCK_TYPES.LEAVES]: 0x006400,
    [BLOCK_TYPES.SNOW]: 0xffffff,
    [BLOCK_TYPES.PURLE_LEAVES]: 0x892cdc,
    [BLOCK_TYPES.SAND]: 0xffff00,
    [BLOCK_TYPES.WATER]: 0x1e90ff,
    [BLOCK_TYPES.TORCH]: 0xFFAA00,
    [BLOCK_TYPES.GLASS]: 0xaaaaaa,
    [BLOCK_TYPES.WHITE_WOOD]: 0xf5f5f5,
    [BLOCK_TYPES.BRICK]: 0xb22222,
};

// Terrain constants
export const seaLevel = 10;

// Camera settings
export const DEFAULT_FOV = 75;
export const RUNNING_FOV = 90;
export const FOV_LERP_SPEED = 5;
export const cameraDistance = 6;
export const cameraHeight = 3;

// Movement and animation
export const RUN_SPEED_MULTIPLIER = 2;
export const DOUBLE_TAP_DELAY = 300;
export const STEVE_ROTATION_SPEED = 10;

// Animation names
export const WALK_ANIMATION_NAME = "animation.steve.walk";
export const IDLE_ANIMATION_NAME = "animation.steve.idle";

// Block interaction
export const reachDistance = 8;
export const LONG_PRESS_THRESHOLD = 200;

// Tree data files
export const treeFiles = ["tree1.json", "tree2.json", "tree3.json"];
