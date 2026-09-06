const CLIENT_ID = 'MASUKKAN_SPOTIFY_CLIENT_ID_KAMU';
const REDIRECT_URI = window.location.origin + window.location.pathname;
const SCOPES = ['user-read-private'];

let accessToken = null;
let currentAudio = document.getElementById('mainAudio');
let isPlaying = false;

// State Data
let favoriteTracks = JSON.parse(localStorage.getItem('beacon_fav_tracks')) || [];
let historyTracks = JSON.parse(localStorage.getItem('beacon_history_tracks')) || [];
let queueTracks = [];
let currentTrackData = null;

// Timer
let sleepTimerTimeout = null;
let sleepTimerInterval = null;
let remainingSeconds = 0;

// Audio Visualizer Context
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let visualizerInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
    checkTokenFromUrl();
    renderFavorites();
    renderHistory();
    renderQueue();
});

// ----------------------------------------------------
// 1. VISUALIZER AUDIO ENGINE
// ----------------------------------------------------
function initVisualizer() {
    if (visualizerInitialized) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        sourceNode = audioCtx.createMediaElementSource(currentAudio);

        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
        analyser.fftSize = 64;

        visualizerInitialized = true;
        drawVisualizer();
    } catch (e) {
        console.log("Audio visualizer ready:", e);
    }
}

function drawVisualizer() {
    const canvas = document.getElementById('visualizerCanvas');
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function renderFrame() {
        requestAnimationFrame(renderFrame);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 8;

            ctx.fillStyle = '#00f3ff';
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 2;
        }
    }
    renderFrame();
}

// ----------------------------------------------------
// 2. BACKGROUND PLAYBACK & LOCKSCREEN MEDIA CONTROL
// ----------------------------------------------------
function updateMediaSession(title, artist, coverUrl) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: 'Beacon BeatVibes',
            artwork: [
                { src: coverUrl, sizes: '512x512', type: 'image/jpeg' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNextInQueue());
    }
}

// ----------------------------------------------------
// 3. QUEUE & HISTORY SYSTEM
// ----------------------------------------------------
function addToQueue(track) {
    queueTracks.push(track);
    renderQueue();
}

function renderQueue() {
    const queueList = document.getElementById('queueList');
    const queueCount = document.getElementById('queueCount');
    
    queueCount.innerText = `${queueTracks.length} Lagu`;

    if (queueTracks.length === 0) {
        queueList.innerHTML = '<p class="empty-state">Belum ada lagu di antrean.</p>';
        return;
    }

    queueList.innerHTML = '';
    queueTracks.forEach((track, index) => {
        const card = document.createElement('div');
        card.className = 'smart-track-card';
        card.innerHTML = `
            <div class="track-info-group">
                <img src="${track.coverUrl}" alt="cover">
                <div class="track-meta">
                    <div class="title">${track.title}</div>
                    <div class="artist">${track.artist}</div>
                </div>
            </div>
            <button class="action-btn" onclick="removeFromQueue(${index})">✕</button>
        `;
        queueList.appendChild(card);
    });
}

function removeFromQueue(index) {
    queueTracks.splice(index, 1);
    renderQueue();
}

function playNextInQueue() {
    if (queueTracks.length > 0) {
        const nextTrack = queueTracks.shift();
        renderQueue();
        playTrack(nextTrack);
    } else {
        alert("Antrean lagu sudah habis.");
    }
}

function addToHistory(track) {
    historyTracks = historyTracks.filter(t => t.id !== track.id);
    historyTracks.unshift(track);
    if (historyTracks.length > 10) historyTracks.pop(); // Max 10 riwayat

    localStorage.setItem('beacon_history_tracks', JSON.stringify(historyTracks));
    renderHistory();
}

function renderHistory() {
    const historyList = document.getElementById('historyList');
    const historyCount = document.getElementById('historyCount');

    historyCount.innerText = `${historyTracks.length} Lagu`;

    if (historyTracks.length === 0) {
        historyList.innerHTML = '<p class="empty-state">Belum ada riwayat lagu.</p>';
        return;
    }

    historyList.innerHTML = '';
    historyTracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'smart-track-card';
        card.innerHTML = `
            <div class="track-info-group">
                <img src="${track.coverUrl}" alt="cover">
                <div class="track-meta">
                    <div class="title">${track.title}</div>
                    <div class="artist">${track.artist}</div>
                </div>
            </div>
        `;
        card.onclick = () => playTrack(track);
        historyList.appendChild(card);
    });
}

// ----------------------------------------------------
// 4. MINI LYRICS DISPLAY
// ----------------------------------------------------
async function toggleLyricsModal() {
    const modal = document.getElementById('lyricsModal');
    modal.classList.toggle('active');

    if (modal.classList.contains('active') && currentTrackData) {
        const lyricsBody = document.getElementById('lyricsBody');
        lyricsBody.innerText = "Mencari lirik...";

        try {
            const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(currentTrackData.artist)}/${encodeURIComponent(currentTrackData.title)}`);
            const data = await res.json();

            if (data.lyrics) {
                lyricsBody.innerText = data.lyrics;
            } else {
                lyricsBody.innerText = "Maaf, lirik tidak ditemukan untuk lagu ini.";
            }
        } catch (err) {
            lyricsBody.innerText = "Lirik tidak dapat dimuat saat ini.";
        }
    }
}

// ----------------------------------------------------
// SPOTIFY ENGINE & CORE AUDIO PLAYER
// ----------------------------------------------------
function playTrack(track) {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    initVisualizer();

    currentTrackData = track;

    document.getElementById('playerTitle').innerText = track.title;
    document.getElementById('playerArtist').innerText = track.artist;
    document.getElementById('playerCover').src = track.coverUrl;

    if (!track.previewUrl) {
        alert("Track ini tidak menyediakan pratinjau audio gratis.");
        return;
    }

    currentAudio.src = track.previewUrl;
    currentAudio.play();
    isPlaying = true;
    document.getElementById('playBtn').innerText = '⏸';

    // Panggil Fitur Integrasi
    addToHistory(track);
    updateMediaSession(track.title, track.artist, track.coverUrl);
}

currentAudio.addEventListener('ended', () => {
    playNextInQueue();
});

function togglePlay() {
    if (!currentAudio.src) return;

    if (isPlaying) {
        currentAudio.pause();
        document.getElementById('playBtn').innerText = '▶';
        isPlaying = false;
    } else {
        currentAudio.play();
        document.getElementById('playBtn').innerText = '⏸';
        isPlaying = true;
    }
}

function adjustMainVolume() {
    currentAudio.volume = document.getElementById('mainVolume').value;
}

// ----------------------------------------------------
// BOOKMARK / LIKE SYSTEM
// ----------------------------------------------------
function toggleLikeTrack(track) {
    const index = favoriteTracks.findIndex(t => t.id === track.id);
    if (index === -1) {
        favoriteTracks.push(track);
    } else {
        favoriteTracks.splice(index, 1);
    }

    localStorage.setItem('beacon_fav_tracks', JSON.stringify(favoriteTracks));
    renderFavorites();
}

function renderFavorites() {
    const favSection = document.getElementById('favSection');
    const favSongList = document.getElementById('favSongList');
    const favCount = document.getElementById('favCount');

    if (favoriteTracks.length === 0) {
        favSection.style.display = 'none';
        return;
    }

    favSection.style.display = 'block';
    favCount.innerText = `${favoriteTracks.length} Lagu`;
    favSongList.innerHTML = '';

    favoriteTracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'smart-track-card';

        card.innerHTML = `
            <div class="track-info-group">
                <img src="${track.coverUrl}" alt="cover">
                <div class="track-meta">
                    <div class="title">${track.title}</div>
                    <div class="artist">${track.artist}</div>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn liked" data-id="${track.id}">❤️</button>
            </div>
        `;

        card.querySelector('.track-info-group').onclick = () => playTrack(track);
        card.querySelector('.action-btn').onclick = (e) => {
            e.stopPropagation();
            toggleLikeTrack(track);
        };

        favSongList.appendChild(card);
    });
}

// ----------------------------------------------------
// SPOTIFY SEARCH & API PIPELINE
// ----------------------------------------------------
function loginSpotify() {
    if (CLIENT_ID === 'MASUKKAN_SPOTIFY_CLIENT_ID_KAMU') {
        alert("Masukkan Client ID Spotify di file script.js terlebih dahulu.");
        return;
    }
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES.join(' '))}`;
    window.location.href = authUrl;
}

function checkTokenFromUrl() {
    const hash = window.location.hash;
    if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        accessToken = params.get('access_token');
        if (accessToken) {
            document.getElementById('statusText').innerText = "Connected";
            document.getElementById('statusDot').style.backgroundColor = "var(--status-green)";
            document.getElementById('statusDot').style.boxShadow = "0 0 10px var(--status-green)";
            document.getElementById('loginBtn').innerText = "Active ⚡";
            window.location.hash = '';
            
            searchInitialSongs();
        }
    }
}

async function searchSpotify() {
    const query = document.getElementById('searchInput').value;
    if (!query || !accessToken) return;

    document.getElementById('sectionTitle').innerText = `Hasil: "${query}"`;

    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=12`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        renderSongs(data.tracks.items);
    } catch (err) {
        console.error("Error API:", err);
    }
}

async function searchInitialSongs() {
    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=Pop%20Indonesia&type=track&limit=9`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = await response.json();
        renderSongs(data.tracks.items);
    } catch (err) {
        console.error(err);
    }
}

function renderSongs(tracks) {
    const songListEl = document.getElementById('songList');
    songListEl.innerHTML = '';

    tracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'smart-track-card';
        
        const trackData = {
            id: track.id,
            title: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            coverUrl: track.album.images[1]?.url || 'https://via.placeholder.com/50',
            previewUrl: track.preview_url
        };

        const isLiked = favoriteTracks.some(t => t.id === trackData.id);

        card.innerHTML = `
            <div class="track-info-group">
                <img src="${trackData.coverUrl}" alt="cover">
                <div class="track-meta">
                    <div class="title">${trackData.title}</div>
                    <div class="artist">${trackData.artist}</div>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn" title="Tambah ke Antrean" onclick="event.stopPropagation(); addToQueue(${JSON.stringify(trackData).replace(/"/g, '&quot;')})">➕</button>
                <button class="action-btn ${isLiked ? 'liked' : ''}">${isLiked ? '❤️' : '🤍'}</button>
            </div>
        `;

        card.querySelector('.track-info-group').onclick = () => playTrack(trackData);
        
        const likeBtn = card.querySelectorAll('.action-btn')[1];
        likeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleLikeTrack(trackData);
            likeBtn.classList.toggle('liked');
            likeBtn.innerText = favoriteTracks.some(t => t.id === trackData.id) ? '❤️' : '🤍';
        };

        songListEl.appendChild(card);
    });
}

// ----------------------------------------------------
// SLEEP TIMER & AMBIENCE
// ----------------------------------------------------
function setSleepTimer(minutes) {
    cancelSleepTimer();
    remainingSeconds = minutes * 60;
    updateTimerDisplay();

    sleepTimerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay();

        if (remainingSeconds <= 0) {
            stopAllAudio();
            cancelSleepTimer();
            document.getElementById('timerDisplay').innerText = "Timer Selesai (Audio Dimatikan)";
        }
    }, 1000);
}

function cancelSleepTimer() {
    if (sleepTimerTimeout) clearTimeout(sleepTimerTimeout);
    if (sleepTimerInterval) clearInterval(sleepTimerInterval);
    document.getElementById('timerDisplay').innerText = "Timer: Off";
}

function updateTimerDisplay() {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    document.getElementById('timerDisplay').innerText = `Mati dalam: ${m}m ${s < 10 ? '0' : ''}${s}s`;
}

function stopAllAudio() {
    if (isPlaying) togglePlay();
    document.getElementById('rainVol').value = 0;
    document.getElementById('cafeVol').value = 0;
    document.getElementById('fireVol').value = 0;
    updateAmbience();
}

function updateAmbience() {
    const rainVol = document.getElementById('rainVol').value;
    const cafeVol = document.getElementById('cafeVol').value;
    const fireVol = document.getElementById('fireVol').value;

    document.getElementById('rainVal').innerText = Math.round(rainVol * 100) + '%';
    document.getElementById('cafeVal').innerText = Math.round(cafeVol * 100) + '%';
    document.getElementById('fireVal').innerText = Math.round(fireVol * 100) + '%';

    const rainAudio = document.getElementById('rainAudio');
    const cafeAudio = document.getElementById('cafeAudio');
    const fireAudio = document.getElementById('fireAudio');

    rainAudio.volume = rainVol;
    cafeAudio.volume = cafeVol;
    fireAudio.volume = fireVol;

    if (rainVol > 0 && rainAudio.paused) rainAudio.play();
    if (cafeVol > 0 && cafeAudio.paused) cafeAudio.play();
    if (fireVol > 0 && fireAudio.paused) fireAudio.play();
}