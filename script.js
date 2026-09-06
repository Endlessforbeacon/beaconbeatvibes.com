// ==========================================
// BEACON BEATVIBES - YOUTUBE MUSIC ENGINE
// ==========================================

const YOUTUBE_API_KEY = "AIzaSyC6wP1LBnMYVa975zKwGObtVtMetoY7xb4";

let player;
let isPlaying = false;
let currentTrackData = null;

// State Data Storage
let favoriteTracks = JSON.parse(localStorage.getItem('beacon_fav_tracks')) || [];
let historyTracks = JSON.parse(localStorage.getItem('beacon_history_tracks')) || [];
let queueTracks = [];

// Sleep Timer State
let sleepTimerTimeout = null;
let sleepTimerInterval = null;
let remainingSeconds = 0;

// Visualizer Canvas State
let animFrameId = null;

// KATALOG KATEGORI LENGKAP (BARAT & INDONESIA)
const CATALOG_SECTIONS = [
    { id: 'global_top', title: '🌐 Global Billboard Top Hits', query: 'Top Billboard Hits Official Audio' },
    { id: 'indo_top', title: '🇮🇩 Top Hits Indonesia Pop', query: 'Lagu Pop Indonesia Hits Terpopuler' },
    { id: 'west_rock', title: '🎸 Western Rock & Alternative', query: 'Best Classic Rock Alternative Song' },
    { id: 'indo_rock', title: '⚡ Indo Rock & Band Hits', query: 'Lagu Band Pop Rock Indonesia Hits' },
    { id: 'rnb_pop', title: '🎧 Global R&B Pop Vibing', query: 'Top R&B Pop Song Audio' },
    { id: 'chill_indie', title: '☕ Indie & Acoustic Chill Indo', query: 'Lagu Indie Akustik Indonesia Hits' },
    { id: 'throwback_west', title: '📻 2000s Western Throwback', query: '2000s Pop Rock Hits Western Audio' },
    { id: 'throwback_indo', title: '📜 Nostalgia Indonesia 2000an', query: 'Lagu Indonesia Pop Nostalgia 2000an' }
];

// 1. Inisialisasi YouTube Player dengan Origin & Handling Lengkap
function onYouTubeIframeAPIReady() {
    player = new YT.Player('ytPlayer', {
        height: '0', 
        width: '0',
        playerVars: { 
            'autoplay': 1, 
            'controls': 0, 
            'disablekb': 1,
            'origin': window.location.origin 
        },
        events: { 
            'onReady': () => {
                console.log("YouTube Engine Ready!");
                initYouTubeMusicCatalog(); // Otomatis muat katalog saat player siap
                renderFavorites();
                renderHistory();
                renderQueue();
            },
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError 
        }
    });
}

// 2. Pantau Perubahan Status Player (Play, Pause, Ended)
function onPlayerStateChange(event) {
    const playBtn = document.getElementById('playBtn');
    
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        if(playBtn) playBtn.innerText = "⏸";
        startFakeVisualizer();
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        if(playBtn) playBtn.innerText = "▶";
        stopFakeVisualizer();
    } else if (event.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        if(playBtn) playBtn.innerText = "▶";
        stopFakeVisualizer();
        playNextInQueue(); // Otomatis putar antrean selanjutnya jika lagu habis
    }
}

// Menangani Error (Misal: Video dibatasi/embed dilarang)
function onPlayerError(event) {
    console.warn("YouTube Player Error Code:", event.data);
    if (event.data === 101 || event.data === 150 || event.data === 100) {
        alert("Lagu ini dibatasi oleh hak cipta YouTube untuk diputar di luar aplikasi. Memutar lagu berikutnya...");
        playNextInQueue();
    }
}

// 3. Fungsi Utama Pemutaran Lagu yang Diperbaiki
function playTrack(track) {
    if (!player || typeof player.loadVideoById !== 'function') {
        alert("Player YouTube sedang disiapkan, silakan tunggu 2 detik lalu klik lagi.");
        return;
    }

    currentTrackData = track;

    // Update UI Metadata
    document.getElementById('playerTitle').innerText = track.title;
    document.getElementById('playerArtist').innerText = track.artist;
    document.getElementById('playerCover').src = track.coverUrl;

    // Muat dan putar video via YouTube IFrame API
    player.loadVideoById({
        videoId: track.id,
        suggestedQuality: 'small'
    });

    player.playVideo();

    addToHistory(track);
    updateMediaSession(track.title, track.artist, track.coverUrl);
}

// 4. Fetch Katalog dari YouTube Data API v3
async function initYouTubeMusicCatalog() {
    const catalogContainer = document.getElementById('ytMusicCatalog');
    if (!catalogContainer) return;
    catalogContainer.innerHTML = '';

    for (const section of CATALOG_SECTIONS) {
        const shelfEl = document.createElement('div');
        shelfEl.className = 'catalog-shelf';
        shelfEl.innerHTML = `
            <div class="shelf-title"><span>${section.title}</span></div>
            <div class="shelf-carousel" id="carousel-${section.id}">
                <p class="empty-state">Memuat lagu dari YouTube Music...</p>
            </div>
        `;
        catalogContainer.appendChild(shelfEl);
    }

    for (const section of CATALOG_SECTIONS) {
        await fetchYouTubeCatalog(section.query, `carousel-${section.id}`);
        await new Promise(r => setTimeout(r, 100));
    }
}

async function fetchYouTubeCatalog(query, carouselId) {
    const carouselEl = document.getElementById(carouselId);
    if (!carouselEl) return;

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=12&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${YOUTUBE_API_KEY}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
            renderCardsToCarousel(data.items.map(item => ({
                id: item.id.videoId,
                title: item.snippet.title,
                artist: item.snippet.channelTitle,
                coverUrl: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url
            })), carouselEl);
        } else {
            carouselEl.innerHTML = '<p class="empty-state">Tidak ada lagu ditemukan.</p>';
        }
    } catch (err) {
        carouselEl.innerHTML = '<p class="empty-state">Gagal memuat katalog jaringan.</p>';
    }
}

function renderCardsToCarousel(songs, carouselEl) {
    carouselEl.innerHTML = '';

    songs.forEach(trackData => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = trackData.title;
        trackData.title = tempDiv.textContent || tempDiv.innerText || "";

        const isLiked = favoriteTracks.some(t => t.id === trackData.id);

        const card = document.createElement('div');
        card.className = 'yt-music-card';
        card.innerHTML = `
            <div class="card-thumb-wrapper">
                <img src="${trackData.coverUrl}" alt="cover" onerror="this.src='https://via.placeholder.com/120/1a1a24/ffffff?text=BEACON'">
                <div class="play-hover-btn">▶</div>
            </div>
            <div class="yt-card-meta">
                <div class="yt-card-title">${trackData.title}</div>
                <div class="yt-card-artist">${trackData.artist}</div>
            </div>
            <div class="card-quick-actions">
                <button class="action-btn" title="Tambah ke Antrean" onclick="event.stopPropagation(); addToQueue(${JSON.stringify(trackData).replace(/"/g, '&quot;')})">➕</button>
                <button class="action-btn ${isLiked ? 'liked' : ''}">${isLiked ? '❤️' : '🤍'}</button>
            </div>
        `;

        card.onclick = () => playTrack(trackData);

        const likeBtn = card.querySelectorAll('.action-btn')[1];
        likeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleLikeTrack(trackData);
            likeBtn.classList.toggle('liked');
            likeBtn.innerText = favoriteTracks.some(t => t.id === trackData.id) ? '❤️' : '🤍';
        };

        carouselEl.appendChild(card);
    });
}

// 5. Pencarian Musik YouTube
async function searchMusic() {
    const queryInput = document.getElementById('searchInput');
    if (!queryInput) return;
    const query = queryInput.value;
    if (!query) return;

    const catalogContainer = document.getElementById('ytMusicCatalog');
    document.getElementById('sectionTitle').innerText = `🔍 Hasil Pencarian: "${query}"`;
    
    catalogContainer.innerHTML = `
        <div class="catalog-shelf">
            <div class="shelf-carousel" id="carousel-search">
                <p class="empty-state">Mencari lagu di YouTube Music...</p>
            </div>
        </div>
    `;

    fetchYouTubeCatalog(query + " music audio", "carousel-search");
}

// 6. Player Core Controls
function togglePlay() {
    if (!player || !currentTrackData) {
        alert("Belum ada lagu yang dipilih!");
        return;
    }
    if (isPlaying) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
}

function adjustMainVolume() {
    const volInput = document.getElementById('mainVolume');
    if (!volInput) return;
    const vol = volInput.value * 100;
    if (player && player.setVolume) player.setVolume(vol);
}

function updateMediaSession(title, artist, coverUrl) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title, artist: artist, album: 'Beacon BeatVibes',
            artwork: [{ src: coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        });

        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNextInQueue());
    }
}

// 7. Antrean, Riwayat, & Favorit
function addToQueue(track) { 
    queueTracks.push(track); 
    renderQueue(); 
    alert(`Berhasil menambahkan "${track.title}" ke antrean!`);
}

function renderQueue() {
    const queueList = document.getElementById('queueList');
    const queueCount = document.getElementById('queueCount');
    if (!queueList || !queueCount) return;

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
    }
}

function addToHistory(track) {
    historyTracks = historyTracks.filter(t => t.id !== track.id);
    historyTracks.unshift(track);
    if (historyTracks.length > 10) historyTracks.pop();
    localStorage.setItem('beacon_history_tracks', JSON.stringify(historyTracks));
    renderHistory();
}

function renderHistory() {
    const historyList = document.getElementById('historyList');
    const historyCount = document.getElementById('historyCount');
    if (!historyList || !historyCount) return;

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

function toggleLikeTrack(track) {
    const index = favoriteTracks.findIndex(t => t.id === track.id);
    if (index === -1) favoriteTracks.push(track);
    else favoriteTracks.splice(index, 1);

    localStorage.setItem('beacon_fav_tracks', JSON.stringify(favoriteTracks));
    renderFavorites();
}

function renderFavorites() {
    const favSection = document.getElementById('favSection');
    const favSongList = document.getElementById('favSongList');
    const favCount = document.getElementById('favCount');
    if (!favSection || !favSongList || !favCount) return;

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
                <button class="action-btn liked">❤️</button>
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

// 8. Visualizer & Lyrics
async function toggleLyricsModal() {
    const modal = document.getElementById('lyricsModal');
    modal.classList.toggle('active');

    if (modal.classList.contains('active') && currentTrackData) {
        const lyricsBody = document.getElementById('lyricsBody');
        lyricsBody.innerText = "Mencari lirik...";

        const cleanTitle = currentTrackData.title.replace(/\([^)]*\)|\[[^\]]*\]|Official|Music|Video|Audio/gi, '').trim();

        try {
            const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(currentTrackData.artist)}/${encodeURIComponent(cleanTitle)}`);
            const data = await res.json();
            lyricsBody.innerText = data.lyrics || "Maaf, lirik tidak ditemukan untuk lagu ini.";
        } catch (err) {
            lyricsBody.innerText = "Lirik tidak dapat dimuat saat ini.";
        }
    }
}

function startFakeVisualizer() {
    const canvas = document.getElementById('visualizerCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const bars = 25;
        const barWidth = canvas.width / bars;

        for (let i = 0; i < bars; i++) {
            const barHeight = Math.random() * canvas.height;
            ctx.fillStyle = '#00f3ff';
            ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 2, barHeight);
        }
        animFrameId = requestAnimationFrame(animate);
    }
    stopFakeVisualizer();
    animate();
}

function stopFakeVisualizer() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    const canvas = document.getElementById('visualizerCanvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// 9. Sleep Timer & Ambience
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
            const timerDisplay = document.getElementById('timerDisplay');
            if(timerDisplay) timerDisplay.innerText = "Timer Selesai";
        }
    }, 1000);
}

function cancelSleepTimer() {
    if (sleepTimerTimeout) clearTimeout(sleepTimerTimeout);
    if (sleepTimerInterval) clearInterval(sleepTimerInterval);
    const timerDisplay = document.getElementById('timerDisplay');
    if(timerDisplay) timerDisplay.innerText = "Timer: Off";
}

function updateTimerDisplay() {
    const timerDisplay = document.getElementById('timerDisplay');
    if (!timerDisplay) return;
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    timerDisplay.innerText = `Mati dalam: ${m}m ${s < 10 ? '0' : ''}${s}s`;
}

function stopAllAudio() {
    if (isPlaying && player && player.pauseVideo) player.pauseVideo();
    const rainVol = document.getElementById('rainVol');
    const cafeVol = document.getElementById('cafeVol');
    const fireVol = document.getElementById('fireVol');
    if(rainVol) rainVol.value = 0;
    if(cafeVol) cafeVol.value = 0;
    if(fireVol) fireVol.value = 0;
    updateAmbience();
}

function updateAmbience() {
    const rainVolEl = document.getElementById('rainVol');
    const cafeVolEl = document.getElementById('cafeVol');
    const fireVolEl = document.getElementById('fireVol');
    if(!rainVolEl || !cafeVolEl || !fireVolEl) return;

    const rainVol = rainVolEl.value;
    const cafeVol = cafeVolEl.value;
    const fireVol = fireVolEl.value;

    document.getElementById('rainVal').innerText = Math.round(rainVol * 100) + '%';
    document.getElementById('cafeVal').innerText = Math.round(cafeVol * 100) + '%';
    document.getElementById('fireVal').innerText = Math.round(fireVol * 100) + '%';

    const rainAudio = document.getElementById('rainAudio');
    const cafeAudio = document.getElementById('cafeAudio');
    const fireAudio = document.getElementById('fireAudio');

    if(rainAudio) rainAudio.volume = rainVol;
    if(cafeAudio) cafeAudio.volume = cafeVol;
    if(fireAudio) fireAudio.volume = fireVol;

    if (rainVol > 0 && rainAudio && rainAudio.paused) rainAudio.play();
    if (cafeVol > 0 && cafeAudio && cafeAudio.paused) cafeAudio.play();
    if (fireVol > 0 && fireAudio && fireAudio.paused) fireAudio.play();
}