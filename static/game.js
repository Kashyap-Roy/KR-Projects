const socket = io();
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const joinBtn = document.getElementById('joinBtn');
const nicknameInput = document.getElementById('nickname');
const roomInput = document.getElementById('room');

let myRoom = null;
let myColor = null;
let myNickname = null;
let keys = {};
let players = [];
let key = null;
let door = null;
let win = false;
let platforms = [];
let particles = [];
let gameTime = 0;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Player sprites and animations
const playerSprites = {
    idle: { frames: 4, speed: 0.1 },
    walk: { frames: 6, speed: 0.15 },
    jump: { frames: 2, speed: 0.1 }
};

function drawPlayer(player, isMe = false) {
    // --- Accurate Visuals Update ---
    // Draw player body as a more accurate cat-like character
    ctx.save();
    ctx.translate(player.x + 20, player.y + 20);
    
    // Flip sprite based on direction
    if (player.vx < 0 && !player.facingLeft) {
        player.facingLeft = true;
    } else if (player.vx > 0 && player.facingLeft) {
        player.facingLeft = false;
    }
    if (player.facingLeft) {
        ctx.scale(-1, 1);
    }
    
    // Body
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    
    // Ears
    ctx.beginPath();
    ctx.moveTo(-18, -15);
    ctx.lineTo(-10, -25);
    ctx.lineTo(-2, -15);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(18, -15);
    ctx.lineTo(10, -25);
    ctx.lineTo(2, -15);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-7, -5, 4, 0, Math.PI*2);
    ctx.arc(7, -5, 4, 0, Math.PI*2);
    ctx.fill();
    
    // Pupils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-7, -5, 2, 0, Math.PI*2);
    ctx.arc(7, -5, 2, 0, Math.PI*2);
    ctx.fill();
    
    // Feet (subtle)
    ctx.fillStyle = player.color;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(-12, 15, 8, 5);
    ctx.fillRect(4, 15, 8, 5);
    ctx.globalAlpha = 1.0;

    ctx.restore();
    
    // Draw nickname
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(player.nickname, player.x + 20, player.y - 15);
    
    // Draw key indicator
    if (key && key.collected && key.collectedBy === player.sid) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('🔑', player.x + 20, player.y - 35);
    }
}

function drawPlatform(platform) {
    // --- Minimalist Platform Design ---
    ctx.fillStyle = '#2c3e50'; // Dark, solid color
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
}

function drawKey() {
    if (key && !key.collected) {
        // Draw key with glow effect
        ctx.save();
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;
        
        // Key body
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(key.x + 5, key.y + 10, 20, 10);
        
        // Key head
        ctx.beginPath();
        ctx.arc(key.x + 15, key.y + 15, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Key teeth
        ctx.fillStyle = '#B8860B';
        ctx.fillRect(key.x + 8, key.y + 12, 3, 6);
        ctx.fillRect(key.x + 12, key.y + 12, 3, 6);
        
        ctx.restore();
        
        // Floating animation
        key.y += Math.sin(gameTime * 0.005) * 0.5;
    }
}

function drawDoor() {
    if (door && door.open) {
        // Draw door with better graphics
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(door.x, door.y, 40, 60);
        
        // Door frame
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 3;
        ctx.strokeRect(door.x, door.y, 40, 60);
        
        // Door knob
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(door.x + 30, door.y + 30, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Glow effect
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 15;
        ctx.fillStyle = 'rgba(0,255,0,0.3)';
        ctx.fillRect(door.x - 10, door.y - 10, 60, 80);
        ctx.shadowBlur = 0;
    }
}

function createParticle(x, y, color, vx, vy) {
    particles.push({
        x, y, vx, vy,
        life: 1.0,
        color: color
    });
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // gravity
        p.life -= 0.02;
        
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
        ctx.restore();
    });
}

function drawGame() {
    gameTime += 1;
    
    // --- Minimalist Background ---
    ctx.fillStyle = '#d0f4f7'; // Light blue sky
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw platforms
    platforms.forEach(drawPlatform);
    
    // Draw key
    drawKey();
    
    // Draw door
    drawDoor();
    
    // Update and draw particles
    updateParticles();
    drawParticles();
    
    // Draw players
    players.forEach(player => {
        drawPlayer(player, player.sid === socket.id);
    });
    
    // Win message with animation
    if (win) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        
        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎉 YOU WIN! 🎉', canvas.width/2, canvas.height/2);
        
        ctx.font = '24px Arial';
        ctx.fillText('Level Complete!', canvas.width/2, canvas.height/2 + 40);
        ctx.restore();
    }
}

function sendMove() {
    if (!myRoom) return;
    let vx = 0;
    if (keys['ArrowLeft'] || keys['a']) vx -= 5;
    if (keys['ArrowRight'] || keys['d']) vx += 5;
    let jump = !!keys[' '];
    
    // Create particles when jumping
    if (jump && !keys['jumped']) {
        createParticle(100, 500, '#fff', -2, -3);
        createParticle(100, 500, '#fff', 2, -3);
        keys['jumped'] = true;
    }
    if (!jump) keys['jumped'] = false;
    
    socket.emit('move', { room: myRoom, vx, jump });
}

document.addEventListener('keydown', e => {
    keys[e.key] = true;
    sendMove();
});
document.addEventListener('keyup', e => {
    keys[e.key] = false;
    sendMove();
});

joinBtn.onclick = () => {
    const nickname = nicknameInput.value.trim();
    const room = roomInput.value.trim();
    if (!nickname) return alert('Enter a nickname!');
    socket.emit('join_room', { nickname, room });
};

socket.on('room_joined', data => {
    lobby.style.display = 'none';
    game.style.display = 'block';
    myRoom = data.room;
    myColor = data.color;
    myNickname = data.nickname;
});

socket.on('game_state', state => {
    players = state.players;
    key = state.key;
    door = state.door;
    platforms = state.platforms;
    win = false;
    drawGame();
});

socket.on('win', () => {
    win = true;
    drawGame();
    // Create celebration particles
    for (let i = 0; i < 20; i++) {
        createParticle(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
            ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'][Math.floor(Math.random() * 4)],
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );
    }
    setTimeout(() => { win = false; }, 3000);
});

// Redraw at 60 FPS for smoothness
setInterval(drawGame, 1000/60);

// TODO: Add game rendering and multiplayer logic 