from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import os
import random
import eventlet
import eventlet.wsgi

app = Flask(__name__, static_folder='static', template_folder='templates')
socketio = SocketIO(app)

rooms = {}  # room_id: {players: {sid: {...}}, key_collected: bool, door_open: bool}
PLAYER_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e'
]

PLATFORM_COUNT = 6
PLATFORM_MIN_WIDTH = 100
PLATFORM_MAX_WIDTH = 200
PLATFORM_HEIGHT = 20
PLATFORM_Y_START = 400
PLATFORM_Y_GAP = 60

def generate_platforms():
    platforms = []
    # Always add ground
    platforms.append({'x': 0, 'y': 550, 'width': 800, 'height': 50})
    for i in range(PLATFORM_COUNT):
        width = random.randint(PLATFORM_MIN_WIDTH, PLATFORM_MAX_WIDTH)
        x = random.randint(0, 800 - width)
        y = PLATFORM_Y_START - i * PLATFORM_Y_GAP
        platforms.append({'x': x, 'y': y, 'width': width, 'height': PLATFORM_HEIGHT})
    return platforms

def get_random_platform(platforms, exclude_ground=True):
    candidates = platforms[1:] if exclude_ground else platforms
    return random.choice(candidates)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join_room')
def handle_join_room(data):
    nickname = data.get('nickname')
    room = data.get('room') or os.urandom(4).hex()
    join_room(room)
    if room not in rooms:
        platforms = generate_platforms()
        key_plat = get_random_platform(platforms)
        door_plat = get_random_platform(platforms)
        rooms[room] = {
            'players': {},
            'key_collected': False,
            'door_open': False,
            'key': {'x': key_plat['x'] + key_plat['width']//2 - 15, 'y': key_plat['y'] - 30, 'collected': False},
            'door': {'x': door_plat['x'] + door_plat['width']//2 - 20, 'y': door_plat['y'] - 60, 'open': False},
            'at_door': set(),
            'platforms': platforms
        }
    color = PLAYER_COLORS[len(rooms[room]['players']) % len(PLAYER_COLORS)]
    player = {
        'sid': request.sid,
        'nickname': nickname,
        'color': color,
        'x': 100 + 50 * len(rooms[room]['players']),
        'y': 500,
        'vx': 0,
        'vy': 0,
        'on_ground': True
    }
    rooms[room]['players'][request.sid] = player
    emit('room_joined', {'room': room, 'nickname': nickname, 'color': color}, room=request.sid)
    send_game_state(room)

@socketio.on('move')
def handle_move(data):
    room_id = data.get('room')
    if not room_id or room_id not in rooms or request.sid not in rooms[room_id]['players']:
        return

    player = rooms[room_id]['players'][request.sid]
    state = rooms[room_id]
    players_dict = state['players']

    # --- Accurate Physics Update ---
    # 1. Player Input
    vx = data.get('vx', 0)
    player['vx'] = vx * 0.8  # Less horizontal speed for more precision

    # 2. Jumping
    if data.get('jump') and player['on_ground']:
        player['vy'] = -18  # Strong, precise jump
        player['on_ground'] = False

    # 3. Gravity
    player['vy'] += 1.2  # Stronger gravity for less "float"

    # 4. Horizontal Movement
    player['x'] += player['vx']

    # 5. Vertical Movement & Collision
    player['y'] += player['vy']
    player['on_ground'] = False

    # --- Player Stacking Logic ---
    # Check for collisions with other players first
    for other_sid, other_player in players_dict.items():
        if other_sid == request.sid:
            continue
        
        # Is player landing on top of other_player?
        is_above = player['y'] + 40 >= other_player['y'] and player['y'] < other_player['y']
        is_horizontally_aligned = player['x'] + 35 > other_player['x'] and player['x'] < other_player['x'] + 35

        if is_above and is_horizontally_aligned and player['vy'] > 0:
            player['y'] = other_player['y'] - 40
            player['vy'] = 0
            player['on_ground'] = True
            player['x'] += other_player['vx'] # Move with the player below

    # --- Platform Collision (runs after player collision) ---
    for plat in state['platforms']:
        if (player['x'] + 35 > plat['x'] and player['x'] < plat['x'] + plat['width'] and
            player['y'] + 40 >= plat['y'] and player['y'] + 40 - (player['vy'] * 1.1) <= plat['y']):
            player['y'] = plat['y'] - 40
            player['vy'] = 0
            player['on_ground'] = True
            break # Stop checking platforms once grounded

    # --- Boundary Checks ---
    if player['x'] < 0: player['x'] = 0
    if player['x'] > 760: player['x'] = 760

    # (Key/Door logic remains the same)
    # Key collection
    key = state['key']
    if not key['collected'] and abs(player['x'] - key['x']) < 30 and abs(player['y'] - key['y']) < 30:
        key['collected'] = True
        key['collectedBy'] = request.sid
        state['key_collected'] = True
        state['door']['open'] = True
        state['door_open'] = True
    
    # Door check
    door = state['door']
    if door['open'] and abs(player['x'] - door['x']) < 30 and abs(player['y'] - door['y']) < 60:
        state['at_door'].add(request.sid)
    else:
        state['at_door'].discard(request.sid)
    
    # Win check
    if door['open'] and len(state['at_door']) == len(state['players']) and len(state['players']) > 0:
        emit('win', {}, room=room_id)
        # Reset level
        platforms = generate_platforms()
        key_plat = get_random_platform(platforms)
        door_plat = get_random_platform(platforms)
        state.update({
            'key': {'x': key_plat['x'] + key_plat['width']//2 - 15, 'y': key_plat['y'] - 30, 'collected': False, 'collectedBy': None},
            'key_collected': False,
            'door': {'x': door_plat['x'] + door_plat['width']//2 - 20, 'y': door_plat['y'] - 60, 'open': False},
            'door_open': False,
            'at_door': set(),
            'platforms': platforms
        })
    
    send_game_state(room_id)

@socketio.on('disconnect')
def handle_disconnect():
    for room, state in rooms.items():
        if request.sid in state['players']:
            leave_room(room)
            del state['players'][request.sid]
            send_game_state(room)
            break

def send_game_state(room):
    state = rooms[room]
    emit('game_state', {
        'players': list(state['players'].values()),
        'key': state['key'],
        'door': state['door'],
        'platforms': state['platforms'],
        'key_collected': state['key_collected'],
        'door_open': state['door_open']
    }, room=room)

@socketio.on('webrtc_offer')
def handle_webrtc_offer(data):
    room = data.get('room')
    offer = data.get('offer')
    from_sid = request.sid
    emit('webrtc_offer', {'from': from_sid, 'offer': offer}, room=room, include_self=False)

@socketio.on('webrtc_answer')
def handle_webrtc_answer(data):
    room = data.get('room')
    answer = data.get('answer')
    to_sid = data.get('to')
    emit('webrtc_answer', {'from': request.sid, 'answer': answer}, room=to_sid)

@socketio.on('webrtc_ice_candidate')
def handle_webrtc_ice(data):
    room = data.get('room')
    candidate = data.get('candidate')
    to_sid = data.get('to')
    emit('webrtc_ice_candidate', {'from': request.sid, 'candidate': candidate}, room=to_sid)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port) 