/**
 * KOT Music - TikTok & Bose Pro Sound Engine (Web Audio DSP Architecture)
 * High-End Acoustic Processing for Flagship Headphones (Bose, Sony) & TikTok Audio
 */

const SoundEngine = {
  initialized: false,
  audioCtx: null,
  sourceNode: null,
  mediaElement: null,

  // DSP Filter Nodes
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

  // 3D Spatial Stereo Matrix
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

  presets: {
    bose: {
      key: 'bose',
      name: 'Bose Master',
      subBass: 6.0,
      punch: 4.0,
      mids: 1.5,
      presence: 2.0,
      air: 3.5,
      spatial: 150,
      reverb: 0,
      compThreshold: -16,
      compRatio: 3.5,
      speed: 1.0
    },
    tiktok: {
      key: 'tiktok',
      name: 'TikTok Viral 808',
      subBass: 8.0,
      punch: 7.0,
      mids: 1.0,
      presence: 4.0,
      air: 4.5,
      spatial: 140,
      reverb: 12,
      compThreshold: -22,
      compRatio: 7.0,
      speed: 1.0
    },
    slowed_reverb: {
      key: 'slowed_reverb',
      name: 'Slowed + Reverb',
      subBass: 9.0,
      punch: 5.0,
      mids: -1.0,
      presence: 1.0,
      air: 2.5,
      spatial: 175,
      reverb: 45,
      compThreshold: -18,
      compRatio: 4.0,
      speed: 0.86
    },
    sped_up: {
      key: 'sped_up',
      name: 'Sped Up Nightcore',
      subBass: 3.0,
      punch: 5.0,
      mids: 2.0,
      presence: 5.0,
      air: 6.0,
      spatial: 130,
      reverb: 8,
      compThreshold: -20,
      compRatio: 5.5,
      speed: 1.18
    },
    vocal: {
      key: 'vocal',
      name: 'Vocal Clarity',
      subBass: -4.0,
      punch: 0.0,
      mids: 4.0,
      presence: 6.0,
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
      spatial: 100,
      reverb: 0,
      compThreshold: 0,
      compRatio: 1.0,
      speed: 1.0
    }
  },

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  init(element) {
    if (this.initialized) return;
    this.mediaElement = element;

    // Load saved settings
    if (window.KOTStorage) {
      const saved = KOTStorage.getSoundSettings();
      if (saved.preset && this.presets[saved.preset]) this.currentPreset = saved.preset;
      if (saved.custom) this.customSettings = { ...this.customSettings, ...saved.custom };
    }

    if (this.isIOS()) {
      this.initialized = true;
      this.applyPreset(this.currentPreset, false);
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !this.mediaElement) return;

      this.audioCtx = new AudioCtx();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.mediaElement);

      this.preamp = this.audioCtx.createGain();
      this.preamp.gain.value = 1.0;

      // 5-Band Equalizer Filters
      this.subBassFilter = this.audioCtx.createBiquadFilter();
      this.subBassFilter.type = 'lowshelf';
      this.subBassFilter.frequency.value = 60;

      this.punchFilter = this.audioCtx.createBiquadFilter();
      this.punchFilter.type = 'peaking';
      this.punchFilter.frequency.value = 130;
      this.punchFilter.Q.value = 1.2;

      this.midFilter = this.audioCtx.createBiquadFilter();
      this.midFilter.type = 'peaking';
      this.midFilter.frequency.value = 1000;
      this.midFilter.Q.value = 1.0;

      this.presenceFilter = this.audioCtx.createBiquadFilter();
      this.presenceFilter.type = 'peaking';
      this.presenceFilter.frequency.value = 3500;
      this.presenceFilter.Q.value = 1.0;

      this.airFilter = this.audioCtx.createBiquadFilter();
      this.airFilter.type = 'highshelf';
      this.airFilter.frequency.value = 11000;

      // Compressor & Reverb
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 3.5;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.15;

      this.convolver = this.audioCtx.createConvolver();
      this.convolver.buffer = this.createImpulse(2.8, 2.2);

      this.dryGain = this.audioCtx.createGain();
      this.wetGain = this.audioCtx.createGain();
      this.dryGain.gain.value = 1.0;
      this.wetGain.gain.value = 0.0;

      // Spatial 3D
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

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.0;

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;

      // Connect pipeline
      this.sourceNode.connect(this.preamp);
      this.preamp.connect(this.subBassFilter);
      this.subBassFilter.connect(this.punchFilter);
      this.punchFilter.connect(this.midFilter);
      this.midFilter.connect(this.presenceFilter);
      this.presenceFilter.connect(this.airFilter);
      this.airFilter.connect(this.compressor);

      // Branch to Reverb
      this.compressor.connect(this.dryGain);
      this.compressor.connect(this.convolver);
      this.convolver.connect(this.wetGain);

      this.dryGain.connect(this.splitter);
      this.wetGain.connect(this.splitter);

      this.splitter.connect(this.directL, 0);
      this.splitter.connect(this.crossR, 0);
      this.splitter.connect(this.directR, 1);
      this.splitter.connect(this.crossL, 1);

      this.directL.connect(this.merger, 0, 0);
      this.crossL.connect(this.merger, 0, 0);
      this.directR.connect(this.merger, 0, 1);
      this.crossR.connect(this.merger, 0, 1);

      this.merger.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      this.initialized = true;
      this.applyPreset(this.currentPreset, false);
    } catch (e) {
      console.warn('SoundEngine init notice:', e.message);
    }
  },

  createImpulse(duration, decay) {
    if (!this.audioCtx) return null;
    const rate = this.audioCtx.sampleRate;
    const length = rate * duration;
    const impulse = this.audioCtx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const factor = Math.pow(1 - i / length, decay);
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
    return impulse;
  },

  applyPreset(presetKey, updateUi = true) {
    const p = this.presets[presetKey];
    if (!p) return;
    this.currentPreset = presetKey;

    if (window.KOTStorage) {
      KOTStorage.saveSoundSettings(presetKey);
    }

    if (this.mediaElement && p.speed) {
      this.mediaElement.playbackRate = p.speed;
    }

    if (!this.audioCtx || this.isIOS()) {
      if (updateUi) this.syncUI();
      return;
    }

    const t = this.audioCtx.currentTime;
    try {
      this.subBassFilter.gain.setTargetAtTime(p.subBass, t, 0.08);
      this.punchFilter.gain.setTargetAtTime(p.punch, t, 0.08);
      this.midFilter.gain.setTargetAtTime(p.mids, t, 0.08);
      this.presenceFilter.gain.setTargetAtTime(p.presence, t, 0.08);
      this.airFilter.gain.setTargetAtTime(p.air, t, 0.08);

      const wetVal = (p.reverb / 100) * 0.45;
      this.wetGain.gain.setTargetAtTime(wetVal, t, 0.08);
      this.dryGain.gain.setTargetAtTime(1.0 - wetVal * 0.4, t, 0.08);

      const crossAmt = -0.15 * (p.spatial / 100);
      this.crossL.gain.setTargetAtTime(crossAmt, t, 0.08);
      this.crossR.gain.setTargetAtTime(crossAmt, t, 0.08);
    } catch (e) {}

    if (updateUi) this.syncUI();
  },

  setBass(val) {
    this.customSettings.bass = val;
    if (this.audioCtx && this.subBassFilter) {
      this.subBassFilter.gain.setTargetAtTime(val, this.audioCtx.currentTime, 0.08);
    }
    if (window.KOTStorage) KOTStorage.saveSoundSettings(this.currentPreset, this.customSettings);
  },

  setSpatialWidth(val) {
    this.customSettings.spatial = val;
    if (this.audioCtx && this.crossL) {
      const crossAmt = -0.15 * (val / 100);
      this.crossL.gain.setTargetAtTime(crossAmt, this.audioCtx.currentTime, 0.08);
      this.crossR.gain.setTargetAtTime(crossAmt, this.audioCtx.currentTime, 0.08);
    }
    if (window.KOTStorage) KOTStorage.saveSoundSettings(this.currentPreset, this.customSettings);
  },

  setReverb(val) {
    this.customSettings.reverb = val;
    if (this.audioCtx && this.wetGain) {
      const wetVal = (val / 100) * 0.45;
      this.wetGain.gain.setTargetAtTime(wetVal, this.audioCtx.currentTime, 0.08);
      this.dryGain.gain.setTargetAtTime(1.0 - wetVal * 0.4, this.audioCtx.currentTime, 0.08);
    }
    if (window.KOTStorage) KOTStorage.saveSoundSettings(this.currentPreset, this.customSettings);
  },

  setSpeed(val) {
    this.customSettings.speed = val;
    if (this.mediaElement) this.mediaElement.playbackRate = val;
    if (window.KOTStorage) KOTStorage.saveSoundSettings(this.currentPreset, this.customSettings);
  },

  syncUI() {
    const cards = document.querySelectorAll('.sound-preset-card, .preset-card');
    cards.forEach(c => {
      c.classList.toggle('active', c.dataset.preset === this.currentPreset);
    });

    const activePresetNameEl = document.getElementById('activeSoundPresetName');
    if (activePresetNameEl && this.presets[this.currentPreset]) {
      activePresetNameEl.textContent = this.presets[this.currentPreset].name;
    }
  }
};

window.SoundEngine = SoundEngine;
