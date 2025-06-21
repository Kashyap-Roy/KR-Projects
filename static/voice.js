// WebRTC voice chat logic
const muteBtn = document.getElementById('muteBtn');
const voiceStatus = document.getElementById('voiceStatus');
let muted = false;
let localStream = null;
let peers = {};

// These variables are set by game.js
// myRoom, myNickname, myColor

function setupVoiceChat() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
            localStream = stream;
            // When a new player joins, send offer to all others
            socket.on('room_joined', () => {
                // Wait a moment for other players to join
                setTimeout(() => {
                    socket.emit('voice_ready', { room: myRoom });
                }, 500);
            });
        });
}

// When a new player joins, create a peer connection for each other player
socket.on('game_state', state => {
    if (!localStream) return;
    const ids = state.players.map(p => p.sid).filter(id => id !== socket.id);
    for (const id of ids) {
        if (!peers[id]) {
            createPeerConnection(id);
        }
    }
});

function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('webrtc_ice_candidate', { room: myRoom, to: peerId, candidate: event.candidate });
        }
    };
    pc.ontrack = event => {
        let audio = document.getElementById('audio-' + peerId);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'audio-' + peerId;
            audio.autoplay = true;
            document.body.appendChild(audio);
        }
        audio.srcObject = event.streams[0];
    };
    peers[peerId] = pc;
    // Create offer
    pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { room: myRoom, offer });
    });
}

socket.on('webrtc_offer', async data => {
    const from = data.from;
    if (!peers[from]) {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        pc.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('webrtc_ice_candidate', { room: myRoom, to: from, candidate: event.candidate });
            }
        };
        pc.ontrack = event => {
            let audio = document.getElementById('audio-' + from);
            if (!audio) {
                audio = document.createElement('audio');
                audio.id = 'audio-' + from;
                audio.autoplay = true;
                document.body.appendChild(audio);
            }
            audio.srcObject = event.streams[0];
        };
        peers[from] = pc;
    }
    const pc = peers[from];
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc_answer', { room: myRoom, to: from, answer });
});

socket.on('webrtc_answer', async data => {
    const from = data.from;
    const pc = peers[from];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on('webrtc_ice_candidate', async data => {
    const from = data.from;
    const pc = peers[from];
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) { /* ignore */ }
    }
});

muteBtn.onclick = () => {
    muted = !muted;
    voiceStatus.textContent = 'Voice: ' + (muted ? 'Muted' : 'On');
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = !muted);
    }
};

// Start voice chat after joining game
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(setupVoiceChat, 500);
} else {
    window.addEventListener('DOMContentLoaded', setupVoiceChat);
}

// TODO: Implement WebRTC voice chat with SocketIO signaling 