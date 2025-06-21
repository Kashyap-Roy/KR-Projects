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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw platforms
    ctx.fillStyle = '#888';
    for (const plat of platforms) {
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
    }
    // Draw key
    if (key && !key.collected) {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(key.x, key.y, 30, 30);
        ctx.strokeStyle = '#B8860B';
        ctx.strokeRect(key.x, key.y, 30, 30);
    }
    // Draw door
    if (door && door.open) {
        ctx.fillStyle = '#964B00';
        ctx.fillRect(door.x, door.y, 40, 60);
        ctx.fillStyle = '#fff';
        ctx.fillRect(door.x + 28, door.y + 25, 8, 8); // knob
    }
    // Draw players
    for (const p of players) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 40, 40);
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.fillText(p.nickname, p.x, p.y - 5);
    }
    // Win message
    if (win) {
        ctx.fillStyle = '#0f0';
        ctx.font = '48px Arial';
        ctx.fillText('You Win!', 300, 300);
    }
}

function sendMove() {
    if (!myRoom) return;
    let vx = 0;
    if (keys['ArrowLeft'] || keys['a']) vx -= 5;
    if (keys['ArrowRight'] || keys['d']) vx += 5;
    let jump = !!keys[' '];
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
    setTimeout(() => { win = false; }, 2000);
});

// Redraw at 60 FPS for smoothness
setInterval(drawGame, 1000/60);

// TODO: Add game rendering and multiplayer logic 