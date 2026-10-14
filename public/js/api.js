/**
 * KOT Music - API Service Client
 * Handles music search, recommendations, trending, related tracks, and streaming
 */

const KOTApi = {
  async fetchTrending(category = 'khmer') {
    const res = await fetch(`/api/trending?category=${encodeURIComponent(category)}`);
    return await res.json();
  },

  async fetchRecommendations(history = [], favorites = [], limit = 24) {
    const res = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, favorites, limit })
    });
    return await res.json();
  },

  async fetchRelated(songId, title = '', artist = '') {
    const params = new URLSearchParams({ id: songId, title, artist });
    const res = await fetch(`/api/related?${params.toString()}`);
    return await res.json();
  },

  async searchSongs(query) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    return await res.json();
  },

  async fetchSuggestions(query) {
    const res = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`);
    return await res.json();
  },

  async fetchVideoStream(songId, quality = 'auto') {
    const res = await fetch(`/api/video-stream/${encodeURIComponent(songId)}?quality=${encodeURIComponent(quality)}`);
    return await res.json();
  },

  getAudioStreamUrl(songId) {
    return `/api/stream/${encodeURIComponent(songId)}`;
  },

  async fetchNetworkInfo() {
    const res = await fetch('/api/network-info');
    return await res.json();
  },

  prefetchSong(songId) {
    if (!songId) return;
    fetch(`/api/prefetch/${encodeURIComponent(songId)}`).catch(() => {});
  }
};

window.KOTApi = KOTApi;
