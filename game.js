// ============================================
// 3D AIM TRAINER - GAME ENGINE
// ============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================
// GAME STATE
// ============================================

const gameState = {
    running: false,
    health: 100,
    maxHealth: 100,
    ammo: 30,
    maxAmmo: 30,
    kills: 0,
    killStreak: 0,
    headshots: 0,
    shots: 0,
    hits: 0,
    frameCount: 0,
    lastSecond: Date.now(),
    fps: 0,
    difficulty: 1.0,
    difficultyTimer: 0,
};

// ============================================
// INPUT HANDLING
// ============================================

const input = {
    mouseX: canvas.width / 2,
    mouseY: canvas.height / 2,
    clicked: false,
    keys: {}
};

document.addEventListener('mousemove', (e) => {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
});

document.addEventListener('mousedown', () => {
    input.clicked = true;
});

document.addEventListener('mouseup', () => {
    input.clicked = false;
});

document.addEventListener('keydown', (e) => {
    input.keys[e.key] = true;
    if (e.key === 'r' || e.key === 'R') reloadAmmo();
});

document.addEventListener('keyup', (e) => {
    input.keys[e.key] = false;
});

// ============================================
// PLAYER SETUP
// ============================================

const player = {
    x: 0,
    y: 0,
    z: 0,
    fov: 90,
    depth: 5000
};

// ============================================
// BOT CLASS
// ============================================

class Bot {
    constructor() {
        // Spawn from random position behind or around
        const angle = Math.random() * Math.PI * 2;
        const distance = 300 + Math.random() * 500;
        
        this.x = Math.cos(angle) * distance;
        this.y = -50 + Math.random() * 300;
        this.z = Math.sin(angle) * distance + 500;
        
        this.width = 40;
        this.height = 100;
        this.health = 1;
        this.maxHealth = 1;
        this.headHeight = this.height * 0.7;
        
        this.vx = (Math.random() - 0.5) * 200;
        this.vy = 0;
        this.vz = (Math.random() - 0.5) * 200 - 100;
        
        this.shootTimer = Math.random() * 2;
        this.shootInterval = 0.5 + Math.random() * 1.5;
        this.lastDamageTime = 0;
        this.isHeadshot = false;
    }
    
    update(dt) {
        // Move
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;
        
        // Gravity
        this.vy -= 500 * dt;
        
        // Ground collision
        if (this.y + this.height > 0) {
            this.y = -this.height;
            this.vy = 0;
        }
        
        // Shoot at player
        this.shootTimer += dt;
        if (this.shootTimer > this.shootInterval) {
            this.shootTimer = 0;
            this.shootAtPlayer();
        }
    }
    
    shootAtPlayer() {
        // Calculate direction with some inaccuracy
        const dx = -this.x;
        const dy = -this.y - 50;
        const dz = -this.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        if (dist < 2000) {
            const accuracy = 0.7 + gameState.difficulty * 0.2;
            const spread = 50 * (1 - accuracy);
            
            const bulletX = this.x + (Math.random() - 0.5) * spread;
            const bulletY = this.y - 40 + (Math.random() - 0.5) * spread;
            const bulletZ = this.z + (Math.random() - 0.5) * spread;
            
            const damage = 10 + Math.random() * 5;
            gameState.health -= damage;
            
            showDamageIndicator(damage);
            
            if (gameState.health <= 0) {
                gameState.health = 0;
                endGame();
            }
        }
    }
    
    shoot() {
        // Bot gets shot
        this.health -= 1;
        this.lastDamageTime = Date.now();
    }
    
    shootHead() {
        // Headshot
        this.health = 0;
        this.isHeadshot = true;
    }
    
    draw() {
        const screenPos = worldToScreen(this.x, this.y, this.z);
        if (!screenPos) return;
        
        const scale = 2000 / (this.z + 2000);
        const width = this.width * scale;
        const height = this.height * scale;
        
        // Damage flash
        if (Date.now() - this.lastDamageTime < 100) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        } else {
            ctx.fillStyle = 'rgba(200, 50, 50, 0.8)';
        }
        
        // Body
        ctx.fillRect(screenPos.x - width/2, screenPos.y, width, height * 0.3);
        
        // Head
        ctx.fillStyle = this.isHeadshot ? 'rgba(255, 0, 0, 0.9)' : 'rgba(255, 150, 100, 0.8)';
        const headSize = width * 0.6;
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y - height * 0.15, headSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(screenPos.x - headSize * 0.3, screenPos.y - height * 0.2, headSize * 0.2, headSize * 0.15);
        ctx.fillRect(screenPos.x + headSize * 0.1, screenPos.y - height * 0.2, headSize * 0.2, headSize * 0.15);
        
        // Health bar
        if (this.health > 0) {
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(screenPos.x - width/2, screenPos.y - height * 0.5, width, 3);
        }
    }
}

// ============================================
// BOT MANAGER
// ============================================

const bots = [];
let spawnTimer = 0;
const spawnRate = 3;

function spawnBot() {
    if (bots.length < 5 + Math.floor(gameState.difficulty * 3)) {
        bots.push(new Bot());
    }
}

// ============================================
// SHOOTING & HIT DETECTION
// ============================================

function shoot() {
    if (gameState.ammo <= 0 || !gameState.running) return;
    
    gameState.ammo--;
    gameState.shots++;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const spread = 5 + (1 - gameState.ammo / gameState.maxAmmo) * 10;
    
    const shootX = input.mouseX + (Math.random() - 0.5) * spread;
    const shootY = input.mouseY + (Math.random() - 0.5) * spread;
    
    // Ray casting
    for (let bot of bots) {
        const screenPos = worldToScreen(bot.x, bot.y, bot.z);
        if (!screenPos) continue;
        
        const scale = 2000 / (bot.z + 2000);
        const headSize = bot.width * 0.6 * scale;
        const headX = screenPos.x;
        const headY = screenPos.y - (bot.height * scale) * 0.15;
        
        // Check headshot
        const dist = Math.sqrt(
            Math.pow(shootX - headX, 2) + 
            Math.pow(shootY - headY, 2)
        );
        
        if (dist < headSize) {
            bot.shootHead();
            gameState.headshots++;
            gameState.hits++;
            gameState.kills++;
            gameState.killStreak++;
            gameState.difficulty += 0.05;
            break;
        }
        
        // Check body hit
        const bodyWidth = bot.width * scale;
        const bodyHeight = bot.height * 0.3 * scale;
        const bodyY = screenPos.y;
        
        if (shootX > headX - bodyWidth/2 && 
            shootX < headX + bodyWidth/2 &&
            shootY > bodyY && 
            shootY < bodyY + bodyHeight) {
            
            bot.shoot();
            gameState.hits++;
            // Body shot - stun
            if (Math.random() > 0.7) {
                bot.health = 0;
                gameState.kills++;
                gameState.killStreak++;
                gameState.difficulty += 0.02;
            }
            break;
        }
    }
}

function reloadAmmo() {
    gameState.ammo = gameState.maxAmmo;
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function worldToScreen(x, y, z) {
    if (z <= 0) return null;
    
    const scale = 2000 / z;
    const screenX = (canvas.width / 2) + x * scale;
    const screenY = (canvas.height / 2) + y * scale;
    
    if (screenX < -100 || screenX > canvas.width + 100 ||
        screenY < -100 || screenY > canvas.height + 100) {
        return null;
    }
    
    return { x: screenX, y: screenY };
}

function drawBackground() {
    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a1a3e');
    gradient.addColorStop(1, '#2a4a6e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Ground
    ctx.fillStyle = '#333';
    ctx.fillRect(0, canvas.height/2, canvas.width, canvas.height/2);
    
    // Grid
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
        const x = (canvas.width / 2) + i * 100;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
}

function showDamageIndicator(damage) {
    const indicator = document.getElementById('damageIndicator');
    indicator.textContent = '-' + Math.round(damage);
    indicator.style.display = 'block';
    setTimeout(() => {
        indicator.style.display = 'none';
    }, 300);
}

// ============================================
// UI UPDATE
// ============================================

function updateUI() {
    document.getElementById('healthText').textContent = Math.round(gameState.health);
    document.getElementById('ammoText').textContent = gameState.ammo;
    document.getElementById('killStreakText').textContent = gameState.killStreak;
    document.getElementById('killsText').textContent = gameState.kills;
    document.getElementById('headshotsText').textContent = gameState.headshots;
    document.getElementById('fpsText').textContent = gameState.fps;
    document.getElementById('accuracyText').textContent = 
        gameState.shots > 0 ? Math.round((gameState.hits / gameState.shots) * 100) : 0;
}

function endGame() {
    gameState.running = false;
    const gameOverDiv = document.getElementById('gameOver');
    const accuracy = gameState.shots > 0 ? Math.round((gameState.hits / gameState.shots) * 100) : 0;
    document.getElementById('finalStats').innerHTML = 
        `Kills: ${gameState.kills}<br>Headshots: ${gameState.headshots}<br>Accuracy: ${accuracy}%<br>Kill Streak: ${gameState.killStreak}`;
    gameOverDiv.style.display = 'block';
}

// ============================================
// GAME LOOP
// ============================================

let lastTime = Date.now();

function gameLoop() {
    const now = Date.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    
    // FPS counter
    gameState.frameCount++;
    if (now - gameState.lastSecond > 1000) {
        gameState.fps = gameState.frameCount;
        gameState.frameCount = 0;
        gameState.lastSecond = now;
    }
    
    if (gameState.running) {
        // Spawn bots
        spawnTimer += dt;
        if (spawnTimer > spawnRate / gameState.difficulty) {
            spawnBot();
            spawnTimer = 0;
        }
        
        // Update bots
        for (let i = bots.length - 1; i >= 0; i--) {
            bots[i].update(dt);
            if (bots[i].health <= 0) {
                bots.splice(i, 1);
            }
        }
        
        // Shooting
        if (input.clicked) {
            shoot();
            input.clicked = false;
        }
        
        // Difficulty scaling
        gameState.difficultyTimer += dt;
        if (gameState.difficultyTimer > 10) {
            gameState.difficulty += 0.1;
            gameState.difficultyTimer = 0;
        }
    }
    
    // Drawing
    drawBackground();
    bots.forEach(bot => bot.draw());
    updateUI();
    
    requestAnimationFrame(gameLoop);
}

// ============================================
// START GAME
// ============================================

function startGame() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('gameOver').style.display = 'none';
    gameState.running = true;
    gameState.health = 100;
    gameState.ammo = 30;
    gameState.kills = 0;
    gameState.killStreak = 0;
    gameState.headshots = 0;
    gameState.shots = 0;
    gameState.hits = 0;
    gameState.difficulty = 1.0;
    bots.length = 0;
    canvas.focus();
}

// Start the game loop
gameLoop();
