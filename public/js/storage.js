/**
 * KOT Music - Storage & State Persistence Module
 * Manages Favorites, Listen History, Autoplay, and Sound Settings
 */

const KOTStorage = {
  // Listen History
  getHistory() {
    try {
      const saved = localStorage.getItem('kot_listen_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  },

  saveToHistory(song) {
    if (!song || !song.id) return;
    try {
      let history = this.getHistory();
      history = history.filter(s => s.id !== song.id);
      history.unshift({
        id: song.id,
        title: song.title,
        artist: song.artist,
        duration: song.duration,
        durationFormatted: song.durationFormatted || song.duration || '3:30',
        thumbnail: song.thumbnail,
        playedAt: Date.now()
      });
      if (history.length > 50) history = history.slice(0, 50);
      localStorage.setItem('kot_listen_history', JSON.stringify(history));
    } catch (e) {}
  },

  // Favorites
  getFavorites() {
    try {
      const saved = localStorage.getItem('kot_music_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  },

  isFavorite(songId) {
    const list = this.getFavorites();
    return list.some(s => s.id === songId);
  },

  toggleFavorite(song) {
    let list = this.getFavorites();
    const idx = list.findIndex(s => s.id === song.id);
    let isFav = false;
    if (idx !== -1) {
      list.splice(idx, 1);
      isFav = false;
    } else {
      list.unshift({ ...song });
      isFav = true;
    }
    try {
      localStorage.setItem('kot_music_favorites', JSON.stringify(list));
    } catch (e) {}
    return { isFav, list };
  },

  // Autoplay
  getAutoplay() {
    try {
      const auto = localStorage.getItem('kot_autoplay');
      return auto === null ? true : auto === '1';
    } catch (e) {
      return true;
    }
  },

  setAutoplay(enabled) {
    try {
      localStorage.setItem('kot_autoplay', enabled ? '1' : '0');
    } catch (e) {}
  },

  // Sound Engine Settings
  getSoundSettings() {
    try {
      const preset = localStorage.getItem('kot_sound_preset') || 'bose';
      const custom = localStorage.getItem('kot_sound_custom');
      return {
        preset,
        custom: custom ? JSON.parse(custom) : null
      };
    } catch (e) {
      return { preset: 'bose', custom: null };
    }
  },

  saveSoundSettings(preset, custom = null) {
    try {
      if (preset) localStorage.setItem('kot_sound_preset', preset);
      if (custom) localStorage.setItem('kot_sound_custom', JSON.stringify(custom));
    } catch (e) {}
  }
};

window.KOTStorage = KOTStorage;
