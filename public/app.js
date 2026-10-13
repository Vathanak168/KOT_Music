/**
 * KOT Music - Ad-Free Lock Screen Background Audio Player
 * Powered by HTML5 Audio, Web Audio API & MediaSession API
 */

// Application State
const state = {
  currentSong: null,
  isPlaying: false,
  queue: [],
  currentIndex: -1,
  currentCategory: 'khmer',
  songsList: [],
  favorites: [],
  repeatMode: 'all', // 'off' | 'all' | 'one'
  isShuffled: false,
  shuffledIndices: [],
  audioCtx: null,
  analyser: null,
  dataArray: null,
  visualizerInitialized: false
};

// DOM Elements & iOS Background Audio Controller
const audio = document.getElementById('audioPlayer');
const silentAudio = document.getElementById('silentKeepAlive');

// iOS WebKit Detection (iPhone, iPad, iPod, or iPadOS desktop mode)
const isIOS = (() => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
})();

let silentAudioStarted = false;
function ensureSilentKeepAlive() {
  if (!silentAudio) return;
  if (!silentAudioStarted) {
    try {
      silentAudio.volume = 0.001;
      const playPromise = silentAudio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          silentAudioStarted = true;
        }).catch(() => {
          // Will be retry-invoked on user touch
        });
      }
    } catch (e) {}
  }
}

// Header & Controls
const btnQueueToggle = document.getElementById('btnQueueToggle');
const btnFavToggle = document.getElementById('btnFavToggle');
const queueBadgeCount = document.getElementById('queueBadgeCount');
const favBadgeCount = document.getElementById('favBadgeCount');
const btnInstallPwa = document.getElementById('btnInstallPwa');

// Search & Categories
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const btnSearchClear = document.getElementById('btnSearchClear');
const btnSearchSubmit = document.getElementById('btnSearchSubmit');
const searchSpinner = document.getElementById('searchSpinner');
const suggestionsList = document.getElementById('suggestionsList');
const categoryChips = document.querySelectorAll('.chip-item');

// Main Views & Grid
const sectionTitle = document.getElementById('sectionTitle');
const songsCountBadge = document.getElementById('songsCountBadge');
const btnPlayAll = document.getElementById('btnPlayAll');
const songsGrid = document.getElementById('songsGrid');
const statusState = document.getElementById('statusState');
const statusIcon = document.getElementById('statusIcon');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');

// Drawers
const queueDrawer = document.getElementById('queueDrawer');
const favDrawer = document.getElementById('favDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const queueList = document.getElementById('queueList');
const favList = document.getElementById('favList');
const btnCloseQueue = document.getElementById('btnCloseQueue');
const btnCloseFav = document.getElementById('btnCloseFav');
const btnClearQueue = document.getElementById('btnClearQueue');
const queueTotalCount = document.getElementById('queueTotalCount');
const favTotalCount = document.getElementById('favTotalCount');

// Mini Player
const miniPlayer = document.getElementById('miniPlayer');
const miniProgressTrack = document.getElementById('miniProgressTrack');
const miniProgressFill = document.getElementById('miniProgressFill');
const btnOpenFullPlayer = document.getElementById('btnOpenFullPlayer');
const miniTrackArt = document.getElementById('miniTrackArt');
const miniTrackTitle = document.getElementById('miniTrackTitle');
const miniTrackArtist = document.getElementById('miniTrackArtist');
const miniPlayingAnim = document.getElementById('miniPlayingAnim');
const btnMiniPrev = document.getElementById('btnMiniPrev');
const btnMiniPlay = document.getElementById('btnMiniPlay');
const iconMiniPlay = document.getElementById('iconMiniPlay');
const iconMiniPause = document.getElementById('iconMiniPause');
const btnMiniNext = document.getElementById('btnMiniNext');
const btnMiniFav = document.getElementById('btnMiniFav');
const iconMiniFav = document.getElementById('iconMiniFav');
const btnExpandPlayer = document.getElementById('btnExpandPlayer');

// Fullscreen Player
const fullPlayerModal = document.getElementById('fullPlayerModal');
const fullPlayerBackdrop = document.getElementById('fullPlayerBackdrop');
const btnCloseFullPlayer = document.getElementById('btnCloseFullPlayer');
const btnFullQueueToggle = document.getElementById('btnFullQueueToggle');
const vinylDiscWrap = document.getElementById('vinylDiscWrap');
const fullTrackArt = document.getElementById('fullTrackArt');
const artGlowRing = document.getElementById('artGlowRing');
const visualizerCanvas = document.getElementById('visualizerCanvas');
const fullTrackTitle = document.getElementById('fullTrackTitle');
const fullTrackArtist = document.getElementById('fullTrackArtist');
const btnFullFav = document.getElementById('btnFullFav');
const iconFullFav = document.getElementById('iconFullFav');

const seekSlider = document.getElementById('seekSlider');
const seekFill = document.getElementById('seekFill');
const timeCurrent = document.getElementById('timeCurrent');
const timeTotal = document.getElementById('timeTotal');

const btnShuffle = document.getElementById('btnShuffle');
const btnFullPrev = document.getElementById('btnFullPrev');
const btnFullPlay = document.getElementById('btnFullPlay');
const iconFullPlay = document.getElementById('iconFullPlay');
const iconFullPause = document.getElementById('iconFullPause');
const btnFullNext = document.getElementById('btnFullNext');
const btnRepeat = document.getElementById('btnRepeat');
const repeatModeText = document.getElementById('repeatModeText');

const btnMute = document.getElementById('btnMute');
const iconVolHigh = document.getElementById('iconVolHigh');
const iconVolMuted = document.getElementById('iconVolMuted');
const volumeSlider = document.getElementById('volumeSlider');
const volFill = document.getElementById('volFill');

// Sound FX & DSP Elements
const btnSoundFxHeader = document.getElementById('btnSoundFxHeader');
const headerFxModeText = document.getElementById('headerFxModeText');
const btnOpenSoundFxMini = document.getElementById('btnOpenSoundFxMini');
const btnOpenSoundFxFull = document.getElementById('btnOpenSoundFxFull');
const fullFxModeText = document.getElementById('fullFxModeText');
const soundFxModal = document.getElementById('soundFxModal');
const soundFxBackdrop = document.getElementById('soundFxBackdrop');
const btnCloseSoundFx = document.getElementById('btnCloseSoundFx');
const presetCards = document.querySelectorAll('.preset-card');
const sliderBass = document.getElementById('sliderBass');
const labelBassVal = document.getElementById('labelBassVal');
const sliderSpatial = document.getElementById('sliderSpatial');
const labelSpatialVal = document.getElementById('labelSpatialVal');
const sliderReverb = document.getElementById('sliderReverb');
const labelReverbVal = document.getElementById('labelReverbVal');
const sliderSpeed = document.getElementById('sliderSpeed');
const labelSpeedVal = document.getElementById('labelSpeedVal');
const btnResetSoundFx = document.getElementById('btnResetSoundFx');
const btnApplySoundFx = document.getElementById('btnApplySoundFx');

// Mobile Bottom Navigation Elements
const bottomNavBar = document.getElementById('bottomNavBar');
const navHome = document.getElementById('navHome');
const navSearch = document.getElementById('navSearch');
const navSoundFx = document.getElementById('navSoundFx');
const navFav = document.getElementById('navFav');
const navQueue = document.getElementById('navQueue');
const navFavBadge = document.getElementById('navFavBadge');
const navQueueBadge = document.getElementById('navQueueBadge');
const sheetDragHandle = document.getElementById('sheetDragHandle');

// =========================================================
// Initialization
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  loadFavorites();
  setupAudioListeners();
  setupMediaSession();
  setupEventListeners();
  registerServiceWorker();
  
  // Load initial Khmer Trending songs
  loadTrending('khmer');
});

// Format seconds into MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// =========================================================
// Media Session API Setup (Lock Screen Controls)
// =========================================================
function setupMediaSession() {
  if (!('mediaSession' in navigator)) {
    console.warn('MediaSession API is not supported in this browser.');
    return;
  }

  // Define Lock Screen Action Handlers
  try {
    navigator.mediaSession.setActionHandler('play', () => {
      playSong();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      pauseSong();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      playPrevTrack();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNextTrack();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined && audio.duration) {
        audio.currentTime = details.seekTime;
        updatePositionState();
      }
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10;
      audio.currentTime = Math.max(audio.currentTime - skipTime, 0);
      updatePositionState();
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10;
      audio.currentTime = Math.min(audio.currentTime + skipTime, audio.duration || 0);
      updatePositionState();
    });
  } catch (err) {
    console.error('Error setting mediaSession action handlers:', err);
  }
}

// Update Lock Screen Metadata when a song changes (iOS & Android)
function updateMediaSessionMetadata(song) {
  if (!('mediaSession' in navigator) || !song) return;

  try {
    // iOS Lock Screen requires absolute HTTP(S) URLs and does not render SVG
    let artworkUrl = song.thumbnail;
    if (!artworkUrl || artworkUrl.endsWith('.svg')) {
      artworkUrl = new URL('/icons/icon.png', window.location.href).href;
    } else if (!artworkUrl.startsWith('http://') && !artworkUrl.startsWith('https://')) {
      artworkUrl = new URL(artworkUrl, window.location.href).href;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title || 'KOT Music',
      artist: song.artist || 'YouTube Music',
      album: 'KOT Music (100% Ad-Free Lock Screen)',
      artwork: [
        { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '192x192', type: 'image/png' },
        { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
        { src: artworkUrl, sizes: '512x512', type: 'image/png' }
      ]
    });
  } catch (err) {
    console.warn('Error setting MediaSession metadata:', err);
  }

  updatePositionState();
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!audio.duration || isNaN(audio.duration) || audio.duration <= 0) return;

  try {
    navigator.mediaSession.setPositionState({
      duration: Math.max(audio.duration, 0.1),
      playbackRate: audio.playbackRate || 1.0,
      position: Math.min(Math.max(audio.currentTime, 0), audio.duration)
    });
  } catch (e) {
    // Ignore transient timing errors
  }
}

// =========================================================
// Audio Engine & Listeners
// =========================================================
function setupAudioListeners() {
  audio.addEventListener('play', () => {
    state.isPlaying = true;
    updatePlayPauseUI();
    ensureSilentKeepAlive();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    initAudioVisualizer();
  });

  audio.addEventListener('pause', () => {
    state.isPlaying = false;
    updatePlayPauseUI();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const current = audio.currentTime;
    const duration = audio.duration;
    const percent = (current / duration) * 100;

    // Mini player progress
    miniProgressFill.style.width = `${percent}%`;

    // Full player progress
    seekSlider.value = percent;
    seekFill.style.width = `${percent}%`;
    timeCurrent.textContent = formatTime(current);
    timeTotal.textContent = formatTime(duration);

    updatePositionState();
  });

  audio.addEventListener('loadedmetadata', () => {
    timeTotal.textContent = formatTime(audio.duration);
    updatePositionState();
  });

  // Track ended: immediately transition to preserve iOS background audio token
  audio.addEventListener('ended', () => {
    if (state.repeatMode === 'one') {
      audio.currentTime = 0;
      audio.play().catch(console.error);
    } else {
      playNextTrack(true);
    }
  });

  audio.addEventListener('error', (e) => {
    console.error('Audio playback error:', e);
    // If stream failed or timed out, attempt next track
    if (state.queue.length > 1) {
      setTimeout(() => playNextTrack(true), 1500);
    }
  });
}

// =========================================================
// TikTok & Bose Pro Sound Engine (Web Audio DSP Architecture)
// =========================================================
const SoundEngine = {
  initialized: false,
  audioCtx: null,
  sourceNode: null,

  // DSP Processing Nodes
  preamp: null,
  subBassFilter: null,
  punchFilter: null,
  midFilter: null,
  presenceFilter: null,
  airFilter: null,
  compressor: null,
  convolver: null,
  dryGain: null,
  wetGain: null,

  // Spatial Stereo 3D Nodes (Crossfeed Mid-Side Matrix)
  splitter: null,
  directL: null,
  directR: null,
  crossL: null,
  crossR: null,
  merger: null,

  masterGain: null,
  analyser: null,

  currentPreset: 'bose',
  customSettings: {
    bass: 5,
    spatial: 150,
    reverb: 0,
    speed: 1.0
  },

  // Audio Profiles Tuned for TikTok Vibes & Flagship Headphones (Bose / Sony)
  presets: {
    bose: {
      key: 'bose',
      name: 'Bose Master',
      subBass: 6.0,    // +6dB Sub-rumble for deep acoustic drivers
      punch: 4.0,      // +4dB 130Hz kick punch
      mids: 1.5,       // +1.5dB Vocal body
      presence: 2.0,   // +2dB Instruments detail
      air: 3.5,        // +3.5dB High-shelf open soundstage
      spatial: 150,    // 150% 3D Headphone Soundstage
      reverb: 0,       // 0% Clean
      compThreshold: -16, // Audiophile transparent compression
      compRatio: 3.5,
      speed: 1.0
    },
    tiktok: {
      key: 'tiktok',
      name: 'TikTok Viral',
      subBass: 8.0,    // +8dB Heavy Sub
      punch: 7.0,      // +7dB Loud 808 punch
      mids: 1.0,
      presence: 4.0,   // Crisp snap beats
      air: 4.5,
      spatial: 140,
      reverb: 12,      // 12% subtle viral room
      compThreshold: -22, // High ratio loudness & punch
      compRatio: 7.0,
      speed: 1.0
    },
    slowed_reverb: {
      key: 'slowed_reverb',
      name: 'Slowed + Reverb',
      subBass: 9.0,    // Deep atmospheric bass
      punch: 5.0,
      mids: -1.0,      // Scooped mids
      presence: 1.0,
      air: 2.5,
      spatial: 175,    // Wide concert hall
      reverb: 45,      // 45% Lush Concert Hall Reverb
      compThreshold: -18,
      compRatio: 4.0,
      speed: 0.86      // 0.86x Iconic Slowed Tempo
    },
    sped_up: {
      key: 'sped_up',
      name: 'Sped Up',
      subBass: 3.0,
      punch: 5.0,
      mids: 2.0,
      presence: 5.0,
      air: 6.0,        // Shimmering highs
      spatial: 130,
      reverb: 8,
      compThreshold: -20,
      compRatio: 5.5,
      speed: 1.18      // 1.18x Nightcore Energy
    },
    vocal: {
      key: 'vocal',
      name: 'Vocal Clarity',
      subBass: -4.0,   // Clean low-cut
      punch: 0.0,
      mids: 4.0,       // Focused vocal frequency
      presence: 6.0,   // Intimate breathy highs
      air: 4.0,
      spatial: 125,
      reverb: 15,
      compThreshold: -14,
      compRatio: 2.5,
      speed: 1.0
    },
    flat: {
      key: 'flat',
      name: 'Original (Flat)',
      subBass: 0.0,
      punch: 0.0,
      mids: 0.0,
      presence: 0.0,
      air: 0.0,
      spatial: 100,    // 100% Standard Stereo
      reverb: 0,
      compThreshold: 0,
      compRatio: 1.0,
      speed: 1.0
    }
  },

  init() {
    if (this.initialized) return;
    try {
      // CRITICAL FOR IOS: On iOS Safari/WebKit, routing <audio> into createMediaElementSource
      // causes WebKit to immediately suspend AudioContext upon lock screen or app switching,
      // terminating background playback.
      // On iOS devices, <audio> plays directly to hardware so Lock Screen playback is 100% uninterrupted!
      if (isIOS) {
        this.initialized = true;
        state.visualizerInitialized = true;
        state.dataArray = new Uint8Array(28);
        drawVisualizer();
        this.loadSettings();
        this.applyPreset(this.currentPreset, false);
        console.log('KOT Music: iOS Direct Hardware Audio Mode active (Lock Screen Guaranteed)');
        return;
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      this.audioCtx = new AudioContext();
      state.audioCtx = this.audioCtx;

      // Single source from native audio element (Desktop & Android)
      this.sourceNode = this.audioCtx.createMediaElementSource(audio);

      // Preamp
      this.preamp = this.audioCtx.createGain();
      this.preamp.gain.value = 1.0;

      // 5-Band Parametric Filter Chain
      this.subBassFilter = this.audioCtx.createBiquadFilter();
      this.subBassFilter.type = 'lowshelf';
      this.subBassFilter.frequency.value = 60; // 60Hz Sub-bass rumble

      this.punchFilter = this.audioCtx.createBiquadFilter();
      this.punchFilter.type = 'peaking';
      this.punchFilter.frequency.value = 130; // 130Hz Kick / 808 punch
      this.punchFilter.Q.value = 1.2;

      this.midFilter = this.audioCtx.createBiquadFilter();
      this.midFilter.type = 'peaking';
      this.midFilter.frequency.value = 1000; // 1kHz Vocal body
      this.midFilter.Q.value = 1.0;

      this.presenceFilter = this.audioCtx.createBiquadFilter();
      this.presenceFilter.type = 'peaking';
      this.presenceFilter.frequency.value = 3500; // 3.5kHz Clarity & snap
      this.presenceFilter.Q.value = 1.0;

      this.airFilter = this.audioCtx.createBiquadFilter();
      this.airFilter.type = 'highshelf';
      this.airFilter.frequency.value = 11000; // 11kHz Air & sparkle

      // Dynamics Compressor (Loudness normalizer & anti-clipping protection)
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 3.5;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.15;

      // Reverb Engine (Convolver with algorithmic impulse)
      this.convolver = this.audioCtx.createConvolver();
      this.convolver.buffer = this.createImpulseResponse(2.8, 2.2);

      this.dryGain = this.audioCtx.createGain();
      this.wetGain = this.audioCtx.createGain();
      this.dryGain.gain.value = 1.0;
      this.wetGain.gain.value = 0.0;

      // 3D Spatial Audio Widener (Headphone Crossfeed Matrix)
      this.splitter = this.audioCtx.createChannelSplitter(2);
      this.merger = this.audioCtx.createChannelMerger(2);

      this.directL = this.audioCtx.createGain();
      this.directR = this.audioCtx.createGain();
      this.crossL = this.audioCtx.createGain();
      this.crossR = this.audioCtx.createGain();

      this.directL.gain.value = 1.0;
      this.directR.gain.value = 1.0;
      this.crossL.gain.value = -0.22;
      this.crossR.gain.value = -0.22;

      // Master Gain & Analyser
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.0;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      state.analyser = this.analyser;

      // --- CONNECT THE PIPELINE ---
      // 1. Preamp -> EQ Chain
      this.sourceNode.connect(this.preamp);
      this.preamp.connect(this.subBassFilter);
      this.subBassFilter.connect(this.punchFilter);
      this.punchFilter.connect(this.midFilter);
      this.midFilter.connect(this.presenceFilter);
      this.presenceFilter.connect(this.airFilter);

      // 2. EQ -> Dry & Reverb Wet
      this.airFilter.connect(this.dryGain);
      this.airFilter.connect(this.convolver);
      this.convolver.connect(this.wetGain);

      // 3. Dry + Wet -> Compressor
      this.dryGain.connect(this.compressor);
      this.wetGain.connect(this.compressor);

      // 4. Compressor -> 3D Spatial Matrix
      this.compressor.connect(this.splitter);
      this.splitter.connect(this.directL, 0);
      this.splitter.connect(this.crossR, 0); // L cross-fed into R inverted
      this.splitter.connect(this.directR, 1);
      this.splitter.connect(this.crossL, 1); // R cross-fed into L inverted

      this.directL.connect(this.merger, 0, 0);
      this.crossL.connect(this.merger, 0, 0);
      this.directR.connect(this.merger, 0, 1);
      this.crossR.connect(this.merger, 0, 1);

      // 5. 3D Merger -> Master -> Analyser -> Speakers/Headphones
      this.merger.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      const bufferLength = this.analyser.frequencyBinCount;
      state.dataArray = new Uint8Array(bufferLength);
      state.visualizerInitialized = true;
      this.initialized = true;

      drawVisualizer();

      // Load and apply saved preset
      this.loadSettings();
      this.applyPreset(this.currentPreset, false);
    } catch (err) {
      console.warn('SoundEngine initialization deferred:', err.message);
    }
  },

  createImpulseResponse(duration, decay) {
    const rate = this.audioCtx.sampleRate;
    const length = rate * duration;
    const impulse = this.audioCtx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = i / length;
      const factor = Math.exp(-n * decay);
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
    return impulse;
  },

  applyPreset(presetKey, save = true) {
    const p = this.presets[presetKey];
    if (!p) return;
    this.currentPreset = presetKey;
    this.customSettings.bass = p.subBass;
    this.customSettings.spatial = p.spatial;
    this.customSettings.reverb = p.reverb;
    this.customSettings.speed = p.speed;

    if (this.initialized && this.audioCtx) {
      const t = this.audioCtx.currentTime + 0.05;

      // EQ
      this.subBassFilter.gain.setTargetAtTime(p.subBass, t, 0.05);
      this.punchFilter.gain.setTargetAtTime(p.punch, t, 0.05);
      this.midFilter.gain.setTargetAtTime(p.mids, t, 0.05);
      this.presenceFilter.gain.setTargetAtTime(p.presence, t, 0.05);
      this.airFilter.gain.setTargetAtTime(p.air, t, 0.05);

      // Reverb Wet/Dry
      const wet = p.reverb / 100;
      this.wetGain.gain.setTargetAtTime(wet, t, 0.05);
      this.dryGain.gain.setTargetAtTime(Math.max(1 - wet * 0.45, 0.35), t, 0.05);

      // Spatial Width
      this.setSpatialWidth(p.spatial);

      // Compressor
      this.compressor.threshold.setTargetAtTime(p.compThreshold, t, 0.05);
      this.compressor.ratio.setTargetAtTime(p.compRatio, t, 0.05);

      // Speed
      this.setSpeed(p.speed);
    } else {
      audio.playbackRate = p.speed;
    }

    updateSoundFxUI(presetKey, p);

    if (save) {
      this.saveSettings();
    }
  },

  setBass(db) {
    this.customSettings.bass = db;
    if (this.initialized && this.audioCtx) {
      const t = this.audioCtx.currentTime + 0.05;
      this.subBassFilter.gain.setTargetAtTime(db, t, 0.05);
      this.punchFilter.gain.setTargetAtTime(db * 0.8, t, 0.05);
    }
    labelBassVal.textContent = (db > 0 ? `+${db}` : `${db}`) + ' dB';
  },

  setSpatialWidth(percent) {
    this.customSettings.spatial = percent;
    if (this.initialized && this.audioCtx && this.crossL && this.crossR) {
      const t = this.audioCtx.currentTime + 0.05;
      // 100% = normal (cross = 0), 200% = super wide (cross = -0.42), 50% = mono (cross = +0.4)
      const norm = (percent - 100) / 100;
      const cross = -norm * 0.42;
      this.crossL.gain.setTargetAtTime(cross, t, 0.05);
      this.crossR.gain.setTargetAtTime(cross, t, 0.05);
    }
    labelSpatialVal.textContent = `${percent}%`;
  },

  setReverb(percent) {
    this.customSettings.reverb = percent;
    if (this.initialized && this.audioCtx) {
      const t = this.audioCtx.currentTime + 0.05;
      const wet = percent / 100;
      this.wetGain.gain.setTargetAtTime(wet, t, 0.05);
      this.dryGain.gain.setTargetAtTime(Math.max(1 - wet * 0.45, 0.35), t, 0.05);
    }
    labelReverbVal.textContent = `${percent}%`;
  },

  setSpeed(val) {
    const num = parseFloat(val);
    this.customSettings.speed = num;
    audio.playbackRate = num;
    labelSpeedVal.textContent = num.toFixed(2) + 'x';
  },

  saveSettings() {
    try {
      localStorage.setItem('kot_soundfx_preset', this.currentPreset);
      localStorage.setItem('kot_soundfx_custom', JSON.stringify(this.customSettings));
    } catch(e) {}
  },

  loadSettings() {
    try {
      const savedPreset = localStorage.getItem('kot_soundfx_preset');
      if (savedPreset && this.presets[savedPreset]) {
        this.currentPreset = savedPreset;
      }
      const savedCustom = localStorage.getItem('kot_soundfx_custom');
      if (savedCustom) {
        this.customSettings = Object.assign(this.customSettings, JSON.parse(savedCustom));
      }
    } catch(e) {}
  }
};

function initAudioVisualizer() {
  SoundEngine.init();
}

function updateSoundFxUI(presetKey, p) {
  // Update Header & Full player badges
  if (headerFxModeText) headerFxModeText.textContent = p.name;
  if (fullFxModeText) fullFxModeText.textContent = p.name;

  // Update preset card active state
  presetCards.forEach(card => {
    const isAct = card.dataset.preset === presetKey;
    card.classList.toggle('active', isAct);
    card.setAttribute('aria-checked', isAct ? 'true' : 'false');
  });

  // Update sliders to match active settings
  sliderBass.value = p.subBass;
  labelBassVal.textContent = (p.subBass > 0 ? `+${p.subBass}` : `${p.subBass}`) + ' dB';

  sliderSpatial.value = p.spatial;
  labelSpatialVal.textContent = `${p.spatial}%`;

  sliderReverb.value = p.reverb;
  labelReverbVal.textContent = `${p.reverb}%`;

  sliderSpeed.value = p.speed;
  labelSpeedVal.textContent = p.speed.toFixed(2) + 'x';

  // Sync Quick Preset Chips in Full Player
  document.querySelectorAll('.quick-preset-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.preset === presetKey);
  });
}

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  if (!state.visualizerInitialized || !visualizerCanvas) return;

  const ctx = visualizerCanvas.getContext('2d');
  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;

  if (state.analyser && state.dataArray && !isIOS) {
    state.analyser.getByteFrequencyData(state.dataArray);
  } else if (state.isPlaying) {
    // iOS Hardware Audio Mode: Dynamic audio-reactive wave simulation
    const now = performance.now() * 0.005;
    for (let i = 0; i < 28; i++) {
      const wave = Math.sin(now * (1.2 + i * 0.15)) * Math.cos(now * 0.7 + i * 0.4);
      const beat = (Math.sin(now * 2.5) + 1) * 0.5;
      const target = Math.max(30, Math.floor(70 + 110 * Math.abs(wave) + 65 * beat));
      // Smooth interpolation
      state.dataArray[i] = Math.floor((state.dataArray[i] || 0) * 0.4 + target * 0.6);
    }
  } else {
    for (let i = 0; i < 28; i++) {
      state.dataArray[i] = Math.max(0, Math.floor((state.dataArray[i] || 0) * 0.85));
    }
  }

  ctx.clearRect(0, 0, width, height);

  const barCount = 28;
  const barWidth = (width / barCount) - 3;
  let x = 0;

  for (let i = 0; i < barCount; i++) {
    const barHeight = ((state.dataArray[i] || 0) / 255) * height;

    const grad = ctx.createLinearGradient(0, height, 0, 0);
    grad.addColorStop(0, '#8B5CF6');
    grad.addColorStop(1, '#06B6D4');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, height - Math.max(barHeight, 4), barWidth, Math.max(barHeight, 4), [3, 3, 0, 0]);
    ctx.fill();

    x += barWidth + 3;
  }
}

// =========================================================
// Track Playback & Queue Management
// =========================================================
async function playSongObject(song, addToQueueList = true) {
  if (!song || !song.id) return;

  // Keep iOS background audio session alive
  ensureSilentKeepAlive();

  // Add to queue if not present
  if (addToQueueList) {
    const existingIndex = state.queue.findIndex(s => s.id === song.id);
    if (existingIndex === -1) {
      state.queue.push(song);
      state.currentIndex = state.queue.length - 1;
    } else {
      state.currentIndex = existingIndex;
    }
  }

  state.currentSong = song;

  // Update Mini Player UI
  miniPlayer.classList.remove('hidden');
  miniTrackArt.src = song.thumbnail || '/icons/icon.png';
  miniTrackTitle.textContent = song.title;
  miniTrackArtist.textContent = song.artist;
  miniPlayingAnim.classList.add('active');

  // Update Full Player UI
  fullTrackArt.src = song.thumbnail || '/icons/icon.png';
  fullTrackTitle.textContent = song.title;
  fullTrackArtist.textContent = song.artist;
  fullPlayerBackdrop.style.backgroundImage = `url('${song.thumbnail}')`;

  updateFavoriteButtons(song.id);
  updateQueueBadge();
  highlightActiveCard(song.id);

  // Set audio source to direct stream endpoint
  audio.src = `/api/stream/${song.id}`;
  audio.load();

  // Update MediaSession immediately so iOS Lock Screen binds the song instantly
  updateMediaSessionMetadata(song);

  // Resume AudioContext only on non-iOS
  if (!isIOS && state.audioCtx && state.audioCtx.state === 'suspended') {
    try {
      state.audioCtx.resume().catch(() => {});
    } catch (e) {}
  }

  try {
    await audio.play();
  } catch (err) {
    console.warn('Playback gesture requirement or error:', err.message);
  }
}

function playSong() {
  ensureSilentKeepAlive();
  if (audio.src) {
    if (!isIOS && state.audioCtx && state.audioCtx.state === 'suspended') {
      try {
        state.audioCtx.resume().catch(() => {});
      } catch (e) {}
    }
    audio.play().catch(console.error);
  }
}

function pauseSong() {
  audio.pause();
}

function togglePlay() {
  if (state.isPlaying) {
    pauseSong();
  } else {
    playSong();
  }
}

function playNextTrack(isAutoNext = false) {
  if (state.queue.length === 0) return;

  if (state.isShuffled) {
    const randIndex = Math.floor(Math.random() * state.queue.length);
    state.currentIndex = randIndex;
  } else {
    if (state.currentIndex + 1 < state.queue.length) {
      state.currentIndex++;
    } else {
      if (state.repeatMode === 'all' || !isAutoNext) {
        state.currentIndex = 0;
      } else {
        return; // End of playlist
      }
    }
  }

  const nextSong = state.queue[state.currentIndex];
  playSongObject(nextSong, false);
}

function playPrevTrack() {
  if (state.queue.length === 0) return;

  if (audio.currentTime > 4) {
    audio.currentTime = 0;
    return;
  }

  if (state.currentIndex > 0) {
    state.currentIndex--;
  } else {
    state.currentIndex = state.queue.length - 1;
  }

  const prevSong = state.queue[state.currentIndex];
  playSongObject(prevSong, false);
}

function updatePlayPauseUI() {
  if (state.isPlaying) {
    iconMiniPlay.classList.add('hidden');
    iconMiniPause.classList.remove('hidden');
    iconFullPlay.classList.add('hidden');
    iconFullPause.classList.remove('hidden');
    miniPlayingAnim.classList.add('active');
    vinylDiscWrap.classList.add('playing');
    artGlowRing.style.opacity = '0.7';
  } else {
    iconMiniPlay.classList.remove('hidden');
    iconMiniPause.classList.add('hidden');
    iconFullPlay.classList.remove('hidden');
    iconFullPause.classList.add('hidden');
    miniPlayingAnim.classList.remove('active');
    vinylDiscWrap.classList.remove('playing');
    artGlowRing.style.opacity = '0.3';
  }
}

function highlightActiveCard(songId) {
  document.querySelectorAll('.song-card').forEach(card => {
    if (card.dataset.id === songId) {
      card.classList.add('active-playing');
    } else {
      card.classList.remove('active-playing');
    }
  });
}

// =========================================================
// YouTube Search & Categorized Playlists
// =========================================================
async function searchSongs(query) {
  if (!query || !query.trim()) return;

  // Check if query is a direct YouTube URL
  const youtubeId = extractYouTubeId(query);
  if (youtubeId) {
    playSongObject({
      id: youtubeId,
      title: 'YouTube Track (' + youtubeId + ')',
      artist: 'YouTube',
      thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      duration: 0
    });
    return;
  }

  renderSkeletonLoading();
  searchSpinner.classList.remove('hidden');
  sectionTitle.textContent = `លទ្ធផលស្វែងរក: "${query}"`;
  songsCountBadge.textContent = 'កំពុងស្វែងរក...';
  hideStatusState();

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    searchSpinner.classList.add('hidden');

    if (data.success && data.data && data.data.length > 0) {
      state.songsList = data.data;
      renderSongCards(data.data);
      songsCountBadge.textContent = `${data.data.length} បទ`;
    } else {
      showStatusState('🔍', 'រកមិនឃើញបទចម្រៀង', 'សូមសាកល្បងវាយឈ្មោះបទចម្រៀង ឬតារាចម្រៀងផ្សេងទៀត។');
      songsCountBadge.textContent = '0 បទ';
    }
  } catch (err) {
    searchSpinner.classList.add('hidden');
    showStatusState('⚠️', 'មានបញ្ហាតភ្ជាប់', 'មិនអាចស្វែងរកចម្រៀងបានទេ។ សូមពិនិត្យអ៊ីនធឺណិត។');
    console.error('Search fetch error:', err);
  }
}

async function loadTrending(category = 'khmer') {
  renderSkeletonLoading();
  hideStatusState();
  state.currentCategory = category;

  const titles = {
    khmer: '🇰🇭 ចម្រៀងខ្មែរពេញនិយម',
    chill: '☕ Chill & Lo-Fi Beats',
    pop: '🔥 Pop Hits ពិភពលោក',
    sleep: '🌙 គេងលក់ស្រួល (Deep Sleep)',
    edm: '⚡ Cyber EDM Beats'
  };

  sectionTitle.textContent = titles[category] || titles.khmer;
  songsCountBadge.textContent = 'កំពុងទាញយក...';

  try {
    const res = await fetch(`/api/trending?category=${category}`);
    const data = await res.json();

    if (data.success && data.data && data.data.length > 0) {
      state.songsList = data.data;
      renderSongCards(data.data);
      songsCountBadge.textContent = `${data.data.length} បទ`;
    } else {
      showStatusState('🎵', 'មិនទាន់មានចម្រៀង', 'សូមសាកល្បងជ្រើសរើស Category ផ្សេង។');
    }
  } catch (err) {
    console.error('Trending fetch error:', err);
    showStatusState('⚠️', 'មានបញ្ហាតភ្ជាប់', 'មិនអាចផ្ទុកចម្រៀងបានទេ។ សូមព្យាយាមម្តងទៀត។');
  }
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

// =========================================================
// Rendering Song Cards & Skeletons
// =========================================================
function renderSongCards(songs) {
  songsGrid.innerHTML = '';
  hideStatusState();

  songs.forEach(song => {
    const isLiked = isSongFavorite(song.id);
    const isCurrentPlaying = state.currentSong && state.currentSong.id === song.id;

    const card = document.createElement('div');
    card.className = `song-card ${isCurrentPlaying ? 'active-playing' : ''}`;
    card.dataset.id = song.id;

    card.innerHTML = `
      <div class="card-thumbnail-wrap">
        <img class="card-thumb" src="${song.thumbnail}" alt="${escapeHtml(song.title)}" loading="lazy">
        <span class="card-duration">${song.durationFormatted || '3:30'}</span>
        <div class="card-play-overlay">
          <div class="play-circle-btn">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <polygon points="6 4 19 12 6 20 6 4"></polygon>
            </svg>
          </div>
        </div>
      </div>
      <div class="card-details">
        <h4 class="card-title" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</h4>
        <p class="card-artist">${escapeHtml(song.artist)}</p>
        <div class="card-actions">
          <button class="btn-card-action btn-add-queue" title="ដាក់ក្នុង Queue" data-id="${song.id}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="btn-card-action btn-card-like ${isLiked ? 'liked' : ''}" title="ចូលចិត្ត" data-id="${song.id}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Click card to play
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-card-action')) return;
      playSongObject(song);
    });

    // Add to Queue with instant luxury check feedback
    const btnQueue = card.querySelector('.btn-add-queue');
    btnQueue.addEventListener('click', (e) => {
      e.stopPropagation();
      addToQueue(song);
      btnQueue.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#06B6D4" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      btnQueue.style.borderColor = 'rgba(6, 182, 212, 0.8)';
      btnQueue.style.boxShadow = '0 0 14px rgba(6, 182, 212, 0.6)';
      setTimeout(() => {
        btnQueue.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        `;
        btnQueue.style.borderColor = '';
        btnQueue.style.boxShadow = '';
      }, 700);
    });

    // Like button with pulse animation
    const btnLike = card.querySelector('.btn-card-like');
    btnLike.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(song);
      const isFav = isSongFavorite(song.id);
      btnLike.classList.toggle('liked', isFav);
      btnLike.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
      btnLike.style.transform = 'scale(1.25)';
      setTimeout(() => {
        btnLike.style.transform = '';
      }, 200);
    });

    songsGrid.appendChild(card);
  });
}

function renderSkeletonLoading(count = 12) {
  songsGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skel = document.createElement('div');
    skel.className = 'skeleton-card';
    skel.innerHTML = `
      <div class="skeleton-thumb"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    `;
    songsGrid.appendChild(skel);
  }
}

function showStatusState(icon, title, desc) {
  songsGrid.innerHTML = '';
  statusIcon.textContent = icon;
  statusTitle.textContent = title;
  statusDesc.textContent = desc;
  statusState.classList.remove('hidden');
}

function hideStatusState() {
  statusState.classList.add('hidden');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// =========================================================
// Queue Management
// =========================================================
function addToQueue(song) {
  state.queue.push(song);
  updateQueueBadge();
  renderQueueList();
}

function updateQueueBadge() {
  const count = state.queue.length;
  if (count > 0) {
    queueBadgeCount.textContent = count;
    queueBadgeCount.classList.remove('hidden');
    queueTotalCount.textContent = `${count} បទ`;
    if (navQueueBadge) {
      navQueueBadge.textContent = count;
      navQueueBadge.classList.remove('hidden');
    }
  } else {
    queueBadgeCount.classList.add('hidden');
    queueTotalCount.textContent = '0 បទ';
    if (navQueueBadge) {
      navQueueBadge.classList.add('hidden');
    }
  }
}

function renderQueueList() {
  queueList.innerHTML = '';
  if (state.queue.length === 0) {
    queueList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-dim);">មិនទាន់មានបទចម្រៀងក្នុង Queue</div>';
    return;
  }

  state.queue.forEach((song, idx) => {
    const isCurrent = state.currentIndex === idx;
    const item = document.createElement('div');
    item.className = `drawer-item ${isCurrent ? 'active' : ''}`;
    item.innerHTML = `
      <img src="${song.thumbnail}" class="drawer-item-thumb" alt="${escapeHtml(song.title)}">
      <div class="drawer-item-info">
        <div class="drawer-item-title">${escapeHtml(song.title)}</div>
        <div class="drawer-item-artist">${escapeHtml(song.artist)}</div>
      </div>
      <button class="btn-card-action btn-remove-queue" title="ដកចេញ">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-queue')) return;
      state.currentIndex = idx;
      playSongObject(song, false);
      renderQueueList();
    });

    item.querySelector('.btn-remove-queue').addEventListener('click', (e) => {
      e.stopPropagation();
      state.queue.splice(idx, 1);
      if (state.currentIndex >= idx) state.currentIndex--;
      updateQueueBadge();
      renderQueueList();
    });

    queueList.appendChild(item);
  });
}

// =========================================================
// Favorites (LocalStorage)
// =========================================================
function loadFavorites() {
  try {
    const saved = localStorage.getItem('kot_music_favorites');
    state.favorites = saved ? JSON.parse(saved) : [];
  } catch (e) {
    state.favorites = [];
  }
  updateFavBadge();
}

function saveFavorites() {
  try {
    localStorage.setItem('kot_music_favorites', JSON.stringify(state.favorites));
  } catch (e) {}
  updateFavBadge();
}

function isSongFavorite(id) {
  return state.favorites.some(s => s.id === id);
}

function toggleFavorite(song) {
  if (isSongFavorite(song.id)) {
    state.favorites = state.favorites.filter(s => s.id !== song.id);
  } else {
    state.favorites.unshift(song);
  }
  saveFavorites();
  updateFavoriteButtons(song.id);
  renderFavList();
}

function updateFavBadge() {
  const count = state.favorites.length;
  if (count > 0) {
    favBadgeCount.textContent = count;
    favBadgeCount.classList.remove('hidden');
    favTotalCount.textContent = `${count} បទ`;
    if (navFavBadge) {
      navFavBadge.textContent = count;
      navFavBadge.classList.remove('hidden');
    }
  } else {
    favBadgeCount.classList.add('hidden');
    favTotalCount.textContent = '0 បទ';
    if (navFavBadge) {
      navFavBadge.classList.add('hidden');
    }
  }
}

function updateFavoriteButtons(songId) {
  const liked = isSongFavorite(songId);
  if (btnMiniFav) {
    btnMiniFav.classList.toggle('liked', liked);
    iconMiniFav.setAttribute('fill', liked ? 'currentColor' : 'none');
  }
  if (btnFullFav) {
    btnFullFav.classList.toggle('liked', liked);
    iconFullFav.setAttribute('fill', liked ? 'currentColor' : 'none');
  }
}

function renderFavList() {
  favList.innerHTML = '';
  if (state.favorites.length === 0) {
    favList.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-dim);">មិនទាន់មានចម្រៀងចូលចិត្ត</div>';
    return;
  }

  state.favorites.forEach((song) => {
    const item = document.createElement('div');
    item.className = 'drawer-item';
    item.innerHTML = `
      <img src="${song.thumbnail}" class="drawer-item-thumb" alt="${escapeHtml(song.title)}">
      <div class="drawer-item-info">
        <div class="drawer-item-title">${escapeHtml(song.title)}</div>
        <div class="drawer-item-artist">${escapeHtml(song.artist)}</div>
      </div>
      <button class="btn-card-action liked" title="លុបចេញពី Favorites">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-card-action')) return;
      playSongObject(song);
    });

    item.querySelector('.btn-card-action').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(song);
    });

    favList.appendChild(item);
  });
}

// =========================================================
// Autocomplete Suggestions
// =========================================================
let suggestionDebounceTimer;
function fetchSuggestions(query) {
  clearTimeout(suggestionDebounceTimer);
  if (!query || query.trim().length < 2) {
    suggestionsList.classList.add('hidden');
    return;
  }

  suggestionDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.suggestions && data.suggestions.length > 0) {
        renderSuggestions(data.suggestions);
      } else {
        suggestionsList.classList.add('hidden');
      }
    } catch (e) {
      suggestionsList.classList.add('hidden');
    }
  }, 200);
}

function renderSuggestions(list) {
  suggestionsList.innerHTML = '';
  list.forEach(item => {
    const li = document.createElement('li');
    li.className = 'suggestion-item';
    li.innerHTML = `
      <span class="suggestion-icon">🔍</span>
      <span>${escapeHtml(item)}</span>
    `;
    li.addEventListener('click', () => {
      searchInput.value = item;
      suggestionsList.classList.add('hidden');
      searchSongs(item);
    });
    suggestionsList.appendChild(li);
  });
  suggestionsList.classList.remove('hidden');
}

// =========================================================
// Event Listeners Binding
// =========================================================
function setupEventListeners() {
  // Search Form Submit
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    suggestionsList.classList.add('hidden');
    const q = searchInput.value.trim();
    if (q) searchSongs(q);
  });

  // Search Input live suggestions
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    btnSearchClear.classList.toggle('hidden', !val);
    fetchSuggestions(val);
  });

  // Clear search
  btnSearchClear.addEventListener('click', () => {
    searchInput.value = '';
    btnSearchClear.classList.add('hidden');
    suggestionsList.classList.add('hidden');
    searchInput.focus();
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box-wrapper')) {
      suggestionsList.classList.add('hidden');
    }
  });

  // Category Tabs
  categoryChips.forEach(chip => {
    chip.addEventListener('click', () => {
      categoryChips.forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });
      chip.classList.add('active');
      chip.setAttribute('aria-selected', 'true');
      const cat = chip.dataset.cat;
      loadTrending(cat);
    });
  });

  // Play All Button
  btnPlayAll.addEventListener('click', () => {
    if (state.songsList.length > 0) {
      state.queue = [...state.songsList];
      state.currentIndex = 0;
      updateQueueBadge();
      playSongObject(state.queue[0], false);
    }
  });

  // Mini Player Controls
  btnMiniPlay.addEventListener('click', togglePlay);
  btnMiniPrev.addEventListener('click', playPrevTrack);
  btnMiniNext.addEventListener('click', () => playNextTrack());
  btnMiniFav.addEventListener('click', () => {
    if (state.currentSong) toggleFavorite(state.currentSong);
  });

  // Scrubber click on mini player
  miniProgressTrack.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = miniProgressTrack.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
  });

  // Expand Fullscreen Player
  btnOpenFullPlayer.addEventListener('click', openFullPlayer);
  btnExpandPlayer.addEventListener('click', openFullPlayer);
  btnCloseFullPlayer.addEventListener('click', closeFullPlayer);

  // Full Player Controls
  btnFullPlay.addEventListener('click', togglePlay);
  btnFullPrev.addEventListener('click', playPrevTrack);
  btnFullNext.addEventListener('click', () => playNextTrack());
  btnFullFav.addEventListener('click', () => {
    if (state.currentSong) toggleFavorite(state.currentSong);
  });

  // Full Player Seek Slider
  seekSlider.addEventListener('input', () => {
    if (!audio.duration) return;
    const percent = seekSlider.value;
    seekFill.style.width = `${percent}%`;
    const targetTime = (percent / 100) * audio.duration;
    timeCurrent.textContent = formatTime(targetTime);
  });

  seekSlider.addEventListener('change', () => {
    if (!audio.duration) return;
    const targetTime = (seekSlider.value / 100) * audio.duration;
    audio.currentTime = targetTime;
  });

  // Volume Slider
  volumeSlider.addEventListener('input', () => {
    const val = parseFloat(volumeSlider.value);
    audio.volume = val;
    volFill.style.width = `${val * 100}%`;
    updateVolumeIcon(val);
  });

  btnMute.addEventListener('click', () => {
    if (audio.volume > 0) {
      audio.volume = 0;
      volumeSlider.value = 0;
      volFill.style.width = '0%';
      updateVolumeIcon(0);
    } else {
      audio.volume = 1;
      volumeSlider.value = 1;
      volFill.style.width = '100%';
      updateVolumeIcon(1);
    }
  });

  // Shuffle & Repeat
  btnShuffle.addEventListener('click', () => {
    state.isShuffled = !state.isShuffled;
    btnShuffle.classList.toggle('active', state.isShuffled);
  });

  btnRepeat.addEventListener('click', () => {
    if (state.repeatMode === 'off') {
      state.repeatMode = 'all';
      btnRepeat.classList.add('active');
      repeatModeText.classList.add('hidden');
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      btnRepeat.classList.add('active');
      repeatModeText.classList.remove('hidden');
    } else {
      state.repeatMode = 'off';
      btnRepeat.classList.remove('active');
      repeatModeText.classList.add('hidden');
    }
  });

  // Drawers Toggle
  btnQueueToggle.addEventListener('click', () => openDrawer(queueDrawer));
  btnFullQueueToggle.addEventListener('click', () => {
    closeFullPlayer();
    openDrawer(queueDrawer);
  });
  btnCloseQueue.addEventListener('click', closeAllDrawers);
  btnClearQueue.addEventListener('click', () => {
    state.queue = [];
    state.currentIndex = -1;
    updateQueueBadge();
    renderQueueList();
  });

  btnFavToggle.addEventListener('click', () => {
    renderFavList();
    openDrawer(favDrawer);
  });
  btnCloseFav.addEventListener('click', closeAllDrawers);
  drawerOverlay.addEventListener('click', closeAllDrawers);

  // Sound FX Engine Modal Controls
  if (btnSoundFxHeader) btnSoundFxHeader.addEventListener('click', openSoundFxModal);
  if (btnOpenSoundFxMini) btnOpenSoundFxMini.addEventListener('click', openSoundFxModal);
  if (btnOpenSoundFxFull) btnOpenSoundFxFull.addEventListener('click', openSoundFxModal);
  if (btnCloseSoundFx) btnCloseSoundFx.addEventListener('click', closeSoundFxModal);
  if (soundFxBackdrop) soundFxBackdrop.addEventListener('click', closeSoundFxModal);
  if (btnApplySoundFx) btnApplySoundFx.addEventListener('click', closeSoundFxModal);

  // Preset Cards click
  presetCards.forEach(card => {
    card.addEventListener('click', () => {
      const presetKey = card.dataset.preset;
      SoundEngine.init();
      SoundEngine.applyPreset(presetKey);
    });
  });

  // Sliders input
  if (sliderBass) {
    sliderBass.addEventListener('input', (e) => {
      SoundEngine.init();
      SoundEngine.setBass(parseFloat(e.target.value));
    });
  }

  if (sliderSpatial) {
    sliderSpatial.addEventListener('input', (e) => {
      SoundEngine.init();
      SoundEngine.setSpatialWidth(parseFloat(e.target.value));
    });
  }

  if (sliderReverb) {
    sliderReverb.addEventListener('input', (e) => {
      SoundEngine.init();
      SoundEngine.setReverb(parseFloat(e.target.value));
    });
  }

  if (sliderSpeed) {
    sliderSpeed.addEventListener('input', (e) => {
      SoundEngine.init();
      SoundEngine.setSpeed(parseFloat(e.target.value));
    });
  }

  if (btnResetSoundFx) {
    btnResetSoundFx.addEventListener('click', () => {
      SoundEngine.init();
      SoundEngine.applyPreset(SoundEngine.currentPreset);
    });
  }

  // Mobile Bottom Navigation Bar Events (Thumb-Friendly Touch)
  const navItems = [navHome, navSearch, navSoundFx, navFav, navQueue];
  function setActiveNavItem(activeEl) {
    navItems.forEach(item => {
      if (item) item.classList.toggle('active', item === activeEl);
    });
  }

  if (navHome) {
    navHome.addEventListener('click', () => {
      setActiveNavItem(navHome);
      closeAllDrawers();
      closeSoundFxModal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (navSearch) {
    navSearch.addEventListener('click', () => {
      setActiveNavItem(navSearch);
      closeAllDrawers();
      closeSoundFxModal();
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  if (navSoundFx) {
    navSoundFx.addEventListener('click', () => {
      setActiveNavItem(navSoundFx);
      closeAllDrawers();
      openSoundFxModal();
    });
  }

  if (navFav) {
    navFav.addEventListener('click', () => {
      setActiveNavItem(navFav);
      renderFavList();
      openDrawer(favDrawer);
    });
  }

  if (navQueue) {
    navQueue.addEventListener('click', () => {
      setActiveNavItem(navQueue);
      openDrawer(queueDrawer);
    });
  }

  // Mobile Pull Down / Click on Drag Handle
  if (sheetDragHandle) {
    sheetDragHandle.addEventListener('click', closeFullPlayer);
  }

  // Quick Preset Chips in Full Player (Thumb-Friendly Touch Row)
  const quickChips = document.querySelectorAll('.quick-preset-chip');
  quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const presetKey = chip.dataset.preset;
      SoundEngine.init();
      SoundEngine.applyPreset(presetKey);
      if (navigator.vibrate) navigator.vibrate(12);
    });
  });

  // Phone Connect Modal Controls (QR Code & Dynamic IP)
  const btnPhoneConnect = document.getElementById('btnPhoneConnect');
  const phoneConnectModal = document.getElementById('phoneConnectModal');
  const phoneConnectBackdrop = document.getElementById('phoneConnectBackdrop');
  const btnClosePhoneConnect = document.getElementById('btnClosePhoneConnect');
  const btnCopyPhoneUrl = document.getElementById('btnCopyPhoneUrl');
  const phoneUrlInput = document.getElementById('phoneUrlInput');
  const copyUrlText = document.getElementById('copyUrlText');
  const qrCodeImg = document.getElementById('qrCodeImg');

  function openPhoneConnect() {
    if (phoneConnectModal) {
      phoneConnectModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      // Fetch dynamic network IP
      fetch('/api/network-info')
        .then(r => r.json())
        .then(info => {
          if (info && info.mobileUrl) {
            if (phoneUrlInput) phoneUrlInput.value = info.mobileUrl;
            if (qrCodeImg) {
              qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(info.mobileUrl)}&color=8B5CF6&bgcolor=0E1326`;
            }
          }
        })
        .catch(err => console.log('Network info fetch error:', err));
    }
  }

  function closePhoneConnect() {
    if (phoneConnectModal) {
      phoneConnectModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  if (btnPhoneConnect) btnPhoneConnect.addEventListener('click', openPhoneConnect);
  if (btnClosePhoneConnect) btnClosePhoneConnect.addEventListener('click', closePhoneConnect);
  if (phoneConnectBackdrop) phoneConnectBackdrop.addEventListener('click', closePhoneConnect);

  if (btnCopyPhoneUrl && phoneUrlInput) {
    btnCopyPhoneUrl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(phoneUrlInput.value);
        if (copyUrlText) copyUrlText.textContent = 'បានចម្លង! ✓';
        if (navigator.vibrate) navigator.vibrate(15);
        setTimeout(() => {
          if (copyUrlText) copyUrlText.textContent = 'ចម្លង Link';
        }, 2000);
      } catch (err) {
        phoneUrlInput.select();
        document.execCommand('copy');
        if (copyUrlText) copyUrlText.textContent = 'បានចម្លង! ✓';
        setTimeout(() => {
          if (copyUrlText) copyUrlText.textContent = 'ចម្លង Link';
        }, 2000);
      }
    });
  }

  // Touch Swipe Gestures for Mobile Fullscreen Player Sheet
  let sheetTouchStartY = 0;
  let sheetTouchCurrentY = 0;
  const fullPlayerContainer = document.querySelector('.full-player-container');

  if (fullPlayerModal && fullPlayerContainer) {
    fullPlayerModal.addEventListener('touchstart', (e) => {
      if (e.target.closest('input[type="range"]')) return;
      sheetTouchStartY = e.touches[0].clientY;
      sheetTouchCurrentY = sheetTouchStartY;
    }, { passive: true });

    fullPlayerModal.addEventListener('touchmove', (e) => {
      if (e.target.closest('input[type="range"]')) return;
      sheetTouchCurrentY = e.touches[0].clientY;
      const deltaY = sheetTouchCurrentY - sheetTouchStartY;
      if (deltaY > 0) {
        fullPlayerContainer.style.transform = `translateY(${Math.min(deltaY * 0.7, 260)}px)`;
        fullPlayerContainer.style.transition = 'none';
      }
    }, { passive: true });

    fullPlayerModal.addEventListener('touchend', (e) => {
      const deltaY = sheetTouchCurrentY - sheetTouchStartY;
      fullPlayerContainer.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      if (deltaY > 90) {
        closeFullPlayer();
        if (navigator.vibrate) navigator.vibrate(10);
      }
      fullPlayerContainer.style.transform = '';
      sheetTouchStartY = 0;
      sheetTouchCurrentY = 0;
    });
  }

  // Mini Player Swipe Gestures (Swipe Left: Next, Swipe Right: Prev)
  let miniTouchStartX = 0;
  let miniTouchEndX = 0;
  if (miniPlayer) {
    miniPlayer.addEventListener('touchstart', (e) => {
      if (e.target.closest('.mini-actions')) return;
      miniTouchStartX = e.touches[0].clientX;
      miniTouchEndX = miniTouchStartX;
    }, { passive: true });

    miniPlayer.addEventListener('touchmove', (e) => {
      miniTouchEndX = e.touches[0].clientX;
    }, { passive: true });

    miniPlayer.addEventListener('touchend', (e) => {
      const deltaX = miniTouchEndX - miniTouchStartX;
      if (deltaX < -50) {
        playNextTrack();
        if (navigator.vibrate) navigator.vibrate(15);
      } else if (deltaX > 50) {
        playPrevTrack();
        if (navigator.vibrate) navigator.vibrate(15);
      }
    });
  }
}

function openSoundFxModal() {
  SoundEngine.init();
  const iosBanner = document.getElementById('iosModeBanner');
  if (iosBanner) {
    iosBanner.classList.toggle('hidden', !isIOS);
  }
  if (soundFxModal) {
    soundFxModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeSoundFxModal() {
  if (soundFxModal) {
    soundFxModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function updateVolumeIcon(vol) {
  if (vol === 0) {
    iconVolHigh.classList.add('hidden');
    iconVolMuted.classList.remove('hidden');
  } else {
    iconVolHigh.classList.remove('hidden');
    iconVolMuted.classList.add('hidden');
  }
}

function openFullPlayer() {
  fullPlayerModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFullPlayer() {
  fullPlayerModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function openDrawer(drawer) {
  closeAllDrawers();
  drawer.classList.remove('hidden');
  drawerOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (drawer === queueDrawer) renderQueueList();
}

function closeAllDrawers() {
  queueDrawer.classList.add('hidden');
  favDrawer.classList.add('hidden');
  drawerOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// =========================================================
// PWA Install & Service Worker Registration
// =========================================================
let deferredInstallPrompt = null;

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('KOT Music SW registered:', reg.scope))
      .catch(err => console.log('SW registration error:', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstallPwa.classList.remove('hidden');
  });

  btnInstallPwa.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      btnInstallPwa.classList.add('hidden');
    }
    deferredInstallPrompt = null;
  });
}
