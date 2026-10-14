const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3');

// High-Performance Persistent Connection Pool with Keep-Alive (Zero TLS handshake delay on YouTube CDN)
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 100,
  maxFreeSockets: 30,
  timeout: 60000
});

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 100,
  maxFreeSockets: 30,
  timeout: 60000
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dedicated YouTube-style Video Watch Page
app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// In-memory caches to speed up requests with bounded size (Anti-memory leak)
const MAX_CACHE_ENTRIES = 250;
const searchCache = new Map();
const streamCache = new Map();
const videoStreamCache = new Map();
const infoCache = new Map();
const relatedCache = new Map();
const recommendationsCache = new Map();

function setBoundedCache(cacheMap, key, value) {
  if (cacheMap.size >= MAX_CACHE_ENTRIES) {
    const iter = cacheMap.keys();
    for (let i = 0; i < 40; i++) {
      const nextKey = iter.next().value;
      if (nextKey) cacheMap.delete(nextKey);
      else break;
    }
  }
  cacheMap.set(key, value);
}

// Auto-purge stale cache every 15 minutes to guarantee constant memory
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of searchCache.entries()) {
    if (now - v.timestamp > 1000 * 60 * 30) searchCache.delete(k);
  }
  for (const [k, v] of streamCache.entries()) {
    if (now - v.timestamp > 1000 * 60 * 60 * 2) streamCache.delete(k);
  }
  for (const [k, v] of videoStreamCache.entries()) {
    if (now - v.timestamp > 1000 * 60 * 60 * 2) videoStreamCache.delete(k);
  }
  for (const [k, v] of relatedCache.entries()) {
    if (now - v.timestamp > 1000 * 60 * 30) relatedCache.delete(k);
  }
  for (const [k, v] of recommendationsCache.entries()) {
    if (now - v.timestamp > 1000 * 60 * 30) recommendationsCache.delete(k);
  }
}, 1000 * 60 * 15).unref();

// Helper: Format seconds to mm:ss
function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Helper: YouTube Search via yt-dlp
async function searchYouTube(query, limit = 20) {
  const cacheKey = `${query.toLowerCase().trim()}_${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 30) {
    return cached.data;
  }

  const runQuery = (q) => {
    return new Promise((resolve, reject) => {
      const args = [
        '-m', 'yt_dlp',
        '--js-runtimes', 'node:node',
        '-j',
        '--flat-playlist',
        `ytsearch${limit}:${q}`
      ];

      const proc = spawn(PYTHON_CMD, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => { stderr += data.toString(); });
      proc.on('error', err => reject(err));

      proc.on('close', code => {
        const lines = stdout.trim().split('\n').filter(Boolean);
        const results = [];

        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            if (!item.id || item.id.length !== 11 || !item.duration || item.duration <= 0) {
              continue;
            }

            let thumb = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
            if (item.thumbnails && item.thumbnails.length > 0) {
              thumb = item.thumbnails[item.thumbnails.length - 1].url || thumb;
            }

            let durationFormatted = formatDuration(item.duration);
            if (item.duration_string && typeof item.duration_string === 'string' && item.duration_string.includes(':')) {
              durationFormatted = item.duration_string;
            }

            results.push({
              id: item.id,
              title: item.title,
              artist: item.uploader || item.channel || 'Artist',
              duration: item.duration,
              durationFormatted,
              thumbnail: thumb,
              url: `https://www.youtube.com/watch?v=${item.id}`
            });
          } catch (e) {
            // ignore malformed line
          }
        }
        resolve(results);
      });
    });
  };

  let results = await runQuery(query);

  // If 0 results found, try intelligent fallback with 'song' appended
  if (results.length === 0 && !query.toLowerCase().includes('song') && !query.toLowerCase().includes('music') && !query.includes('ចម្រៀង')) {
    results = await runQuery(`${query} song`);
  }

  setBoundedCache(searchCache, cacheKey, { data: results, timestamp: Date.now() });
  return results;
}

// Helper: Staggered background prefetch (never competes with active user playback)
function prefetchAudioSequentially(songIds) {
  if (!Array.isArray(songIds) || songIds.length === 0) return;
  setTimeout(async () => {
    for (const id of songIds.slice(0, 2)) {
      if (!id || streamCache.has(id)) continue;
      try {
        await extractAudioStreamUrl(id);
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
    }
  }, 1500);
}

// In-flight extraction promises map (prevents duplicate parallel yt-dlp processes on simultaneous Range requests)
const inFlightExtractions = new Map();

// Helper: Extract pure audio stream URL via yt-dlp with caching & stampede prevention
function extractAudioStreamUrl(videoId) {
  const cached = streamCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 6) {
    return Promise.resolve(cached.url);
  }

  // Deduplicate simultaneous requests for the same song (e.g. Safari Range probe + stream)
  if (inFlightExtractions.has(videoId)) {
    return inFlightExtractions.get(videoId);
  }

  const extractionPromise = new Promise((resolve, reject) => {
    const args = [
      '-m', 'yt_dlp',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=android',
      '--skip-download',
      '-g',
      '-f', 'ba[protocol=https]/ba/b',
      `https://www.youtube.com/watch?v=${videoId}`
    ];

    const proc = spawn(PYTHON_CMD, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('error', err => reject(err));

    proc.on('close', code => {
      const urls = stdout.trim().split('\n').filter(l => l.startsWith('http'));
      if (urls.length > 0) {
        const streamUrl = urls[urls.length - 1];
        setBoundedCache(streamCache, videoId, { url: streamUrl, timestamp: Date.now() });
        resolve(streamUrl);
      } else {
        reject(new Error(stderr || 'Failed to extract audio stream URL'));
      }
    });
  }).finally(() => {
    inFlightExtractions.delete(videoId);
  });

  inFlightExtractions.set(videoId, extractionPromise);
  return extractionPromise;
}

// In-flight video extraction promises map
const inFlightVideoExtractions = new Map();

// Helper: Extract video stream URL with high resolution options (4K, 1440p, 1080p, 720p, 480p, 360p, 240p)
function extractVideoStreamUrl(videoId, quality = 'auto') {
  const q = (quality || 'auto').toLowerCase().trim();
  const cacheKey = `${videoId}_${q}`;
  const cached = videoStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 2) {
    return Promise.resolve(cached.data);
  }

  if (inFlightVideoExtractions.has(cacheKey)) {
    return inFlightVideoExtractions.get(cacheKey);
  }

  let formatArg;
  if (q === '4k' || q === '2160p') {
    formatArg = 'bestvideo[protocol=https][height<=2160][ext=mp4]/bestvideo[protocol=https][height<=2160]/bestvideo/best';
  } else if (q === '1440p' || q === '2k') {
    formatArg = 'bestvideo[protocol=https][height<=1440][ext=mp4]/bestvideo[protocol=https][height<=1440]/bestvideo/best';
  } else if (q === '1080p' || q === 'fhd') {
    formatArg = 'bestvideo[protocol=https][height<=1080][ext=mp4]/bestvideo[protocol=https][height<=1080]/bestvideo/best';
  } else if (q === '720p' || q === 'hd') {
    formatArg = '22/bestvideo[protocol=https][height<=720][ext=mp4]/bestvideo[protocol=https][height<=720]/18/best';
  } else if (q === '480p') {
    formatArg = 'bestvideo[protocol=https][height<=480][ext=mp4]/bestvideo[protocol=https][height<=480]/18/best';
  } else if (q === '360p') {
    formatArg = '18/bestvideo[protocol=https][height<=360]/best';
  } else if (q === '240p') {
    formatArg = 'bestvideo[protocol=https][height<=240]/18/best';
  } else {
    // 'auto': prioritize fast, smooth progressive MP4 (720p/360p with audio) for zero-stutter playback
    formatArg = '22/18/best[protocol=https][ext=mp4]/best[ext=mp4]/best';
  }

  const extractionPromise = new Promise((resolve, reject) => {
    const args = [
      '-m', 'yt_dlp',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=android',
      '--skip-download',
      '-g',
      '-f', formatArg,
      `https://www.youtube.com/watch?v=${videoId}`
    ];

    const proc = spawn(PYTHON_CMD, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr.on('data', data => { stderr += data.toString(); });
    proc.on('error', err => reject(err));

    proc.on('close', code => {
      const urls = stdout.trim().split('\n').filter(l => l.startsWith('http'));
      if (urls.length > 0) {
        const streamUrl = urls[urls.length - 1];
        const hasAudio = streamUrl.includes('itag=18') || streamUrl.includes('itag=22');
        const videoData = {
          url: streamUrl,
          quality: q,
          hasAudio
        };
        setBoundedCache(videoStreamCache, cacheKey, { data: videoData, timestamp: Date.now() });
        resolve(videoData);
      } else {
        reject(new Error(stderr || 'Failed to extract video stream URL'));
      }
    });
  }).finally(() => {
    inFlightVideoExtractions.delete(cacheKey);
  });

  inFlightVideoExtractions.set(cacheKey, extractionPromise);
  return extractionPromise;
}

// API: Prefetch stream URL in advance (Zero-delay next song & video playback)
app.get('/api/prefetch/:id', (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length !== 11) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }
  // Trigger background extraction in parallel without waiting
  extractAudioStreamUrl(videoId).catch(() => {});
  extractVideoStreamUrl(videoId, 'auto').catch(() => {});
  res.json({ success: true, prefetched: videoId });
});

// API: Search
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query parameter ?q=' });
  }

  try {
    const results = await searchYouTube(query, 20);
    res.json({ success: true, count: results.length, data: results });
    // Prefetch top 2 songs in background for instant playback
    if (results.length > 0) {
      prefetchAudioSequentially(results.map(r => r.id));
    }
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// API: Autocomplete suggestions
app.get('/api/suggestions', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json({ suggestions: [] });

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const data = await response.json();
    const suggestions = Array.isArray(data[1]) ? data[1] : [];
    res.json({ suggestions: suggestions.slice(0, 8) });
  } catch (e) {
    res.json({ suggestions: [] });
  }
});

// API: Song Info + Stream URL
app.get('/api/song/:id', async (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length !== 11) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  try {
    const streamUrl = await extractAudioStreamUrl(videoId);
    res.json({
      success: true,
      id: videoId,
      streamUrl: `/api/stream/${videoId}`,
      directUrl: streamUrl
    });
  } catch (err) {
    console.error(`Stream extraction error for ${videoId}:`, err.message);
    res.status(500).json({ error: 'Stream extraction failed', message: err.message });
  }
});

// API: Proxy Audio Stream with full HTTP Range request support
// This ensures Lock Screen seeking, Safari iOS background audio, and Android Chrome work smoothly
app.get('/api/stream/:id', async (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length !== 11) {
    return res.status(400).send('Invalid video ID');
  }

  try {
    let directUrl;
    try {
      directUrl = await extractAudioStreamUrl(videoId);
    } catch (e) {
      // Clear cache and retry once if failed
      streamCache.delete(videoId);
      directUrl = await extractAudioStreamUrl(videoId);
    }

    const parsedUrl = new URL(directUrl);
    const clientReqModule = parsedUrl.protocol === 'https:' ? https : http;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    };

    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const proxyReq = clientReqModule.request(directUrl, {
      method: 'GET',
      headers: requestHeaders,
      agent: parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent
    }, (proxyRes) => {
      // If expired (403), invalidate cache
      if (proxyRes.statusCode === 403) {
        streamCache.delete(videoId);
        return res.status(502).send('Upstream stream expired. Please retry.');
      }

      res.status(proxyRes.statusCode);

      // Forward relevant audio headers
      const forwardedHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges'
      ];

      forwardedHeaders.forEach(header => {
        if (proxyRes.headers[header]) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');

      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      if (err.code === 'ECONNRESET' || err.message === 'socket hang up') {
        return; // Expected when client seeks or cancels playback
      }
      console.error('Proxy stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Audio streaming error');
      }
    });

    req.on('close', () => {
      proxyReq.destroy();
    });

    proxyReq.end();
  } catch (err) {
    console.error('Audio stream handler error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Failed to play audio stream');
    }
  }
});

// API: Video Info & Stream Endpoint
app.get('/api/video-info/:id', async (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length !== 11) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }
  const quality = (req.query.quality || 'auto').toLowerCase();

  try {
    const videoDataPromise = extractVideoStreamUrl(videoId, quality);
    const metaPromise = fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);

    const [videoData, meta] = await Promise.all([videoDataPromise, metaPromise]);

    res.json({
      success: true,
      id: videoId,
      title: meta && meta.title ? meta.title : 'KOT Video',
      channel: meta && meta.author_name ? meta.author_name : 'YouTube',
      thumbnail: meta && meta.thumbnail_url ? meta.thumbnail_url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      quality: videoData.quality || quality,
      hasAudio: videoData.hasAudio,
      videoStreamUrl: `/api/video-stream/${videoId}?quality=${encodeURIComponent(quality)}`,
      audioStreamUrl: `/api/stream/${videoId}`,
      directUrl: videoData.url
    });
  } catch (err) {
    console.error(`Video extraction error for ${videoId}:`, err.message);
    res.status(500).json({ error: 'Video extraction failed', message: err.message });
  }
});

// API: Proxy Video Stream with full HTTP Range request support & Keep-Alive Connection Pool
app.get('/api/video-stream/:id', async (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length !== 11) {
    return res.status(400).send('Invalid video ID');
  }
  const quality = (req.query.quality || 'auto').toLowerCase();

  try {
    let videoData;
    try {
      videoData = await extractVideoStreamUrl(videoId, quality);
    } catch (e) {
      videoStreamCache.delete(`${videoId}_${quality}`);
      videoData = await extractVideoStreamUrl(videoId, 'auto');
    }

    const directUrl = typeof videoData === 'string' ? videoData : videoData.url;
    const parsedUrl = new URL(directUrl);
    const clientReqModule = parsedUrl.protocol === 'https:' ? https : http;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    };

    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const proxyReq = clientReqModule.request(directUrl, {
      method: 'GET',
      headers: requestHeaders,
      agent: parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent
    }, (proxyRes) => {
      // If expired (403), invalidate cache
      if (proxyRes.statusCode === 403) {
        videoStreamCache.delete(`${videoId}_${quality}`);
        return res.status(502).send('Upstream video stream expired. Please retry.');
      }

      res.status(proxyRes.statusCode);

      // Forward relevant video headers
      const forwardedHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges'
      ];

      forwardedHeaders.forEach(header => {
        if (proxyRes.headers[header]) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');

      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      if (err.code === 'ECONNRESET' || err.message === 'socket hang up') {
        return; // Client seek or navigation
      }
      console.error('Proxy video stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Video streaming error');
      }
    });

    req.on('close', () => {
      proxyReq.destroy();
    });

    proxyReq.end();
  } catch (err) {
    console.error('Video stream handler error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Failed to play video stream');
    }
  }
});

// API: Curated Playlists / Categories
const CURATED_LISTS = {
  khmer: 'បទចម្រៀងខ្មែរពេញនិយម VannDa G-Devith Khmer chill',
  chill: 'chill lofi acoustic music peaceful',
  pop: 'billboard top hits pop music 2025 2026',
  sad: 'បទចម្រៀងខ្មែរ កម្សត់ sad acoustic khmer song emotional',
  sleep: 'deep sleep music relaxing piano rain delta waves',
  edm: 'cyberpunk synthwave edm workout bass',
  tiktok: 'បទល្បីក្នុង TikTok khmer remix viral trend dance'
};

app.get('/api/trending', async (req, res) => {
  const category = req.query.category || 'khmer';
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 70, 16), 100);
  const query = CURATED_LISTS[category] || CURATED_LISTS.khmer;

  try {
    const results = await searchYouTube(query, limit);
    res.json({ success: true, category, data: results });
    // Prefetch top 2 songs in background for instant playback
    if (results.length > 0) {
      prefetchAudioSequentially(results.map(r => r.id));
    }
  } catch (err) {
    console.error('Trending fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch curated music' });
  }
});

// Helper: Clean title for smart search & related queries
function cleanSearchTitle(title) {
  if (!title) return '';
  return title
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/official|music|video|audio|lyrics|mv|hd|4k|feat\.|ft\./gi, '')
    .replace(/[|•–—\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// API: Related Songs (Up Next & Recommendations for currently playing song, like YouTube)
app.get('/api/related', async (req, res) => {
  const videoId = req.query.id;
  const rawTitle = req.query.title || '';
  const rawArtist = req.query.artist || '';

  if (!videoId || videoId.length !== 11) {
    return res.status(400).json({ error: 'Missing or invalid video ID ?id=' });
  }

  const cacheKey = `related_${videoId}`;
  const cached = relatedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 30) {
    return res.json({ success: true, count: cached.data.length, data: cached.data });
  }

  try {
    const cleanTitle = cleanSearchTitle(rawTitle);
    const cleanArtist = rawArtist.replace(/Official|Channel|Topic|VEVO/gi, '').trim();

    // Construct high-precision search query to get YouTube-like mix of related songs
    let query = '';
    if (cleanArtist && cleanArtist.toLowerCase() !== 'youtube' && cleanArtist.toLowerCase() !== 'artist') {
      query = `${cleanArtist} ${cleanTitle}`;
    } else if (cleanTitle) {
      query = `${cleanTitle} khmer song`;
    } else {
      query = 'បទចម្រៀងខ្មែរពេញនិយម VannDa G-Devith';
    }

    let results = await searchYouTube(query, 18);

    // If few results found, supplement with artist popular tracks
    if (results.length < 6 && cleanArtist && cleanArtist.toLowerCase() !== 'youtube') {
      const moreResults = await searchYouTube(`${cleanArtist} popular music`, 12);
      results = [...results, ...moreResults];
    }

    // Exclude the current song itself
    const filtered = results.filter(item => item.id !== videoId);

    // Deduplicate by ID
    const seen = new Set();
    const unique = filtered.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, 16);

    setBoundedCache(relatedCache, cacheKey, { data: unique, timestamp: Date.now() });

    res.json({ success: true, count: unique.length, data: unique });

    // Prefetch top 2 related songs in background for instant gapless next play
    if (unique.length > 0) {
      prefetchAudioSequentially(unique.map(r => r.id));
    }
  } catch (err) {
    console.error('Related songs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch related songs' });
  }
});

// API: Personalized Recommendations based on listening history & favorite artists
app.post('/api/recommendations', async (req, res) => {
  try {
    const { history = [], favorites = [], limit = 70 } = req.body || {};
    const targetLimit = Math.min(Math.max(parseInt(limit) || 70, 20), 100);

    // Analyze user's favorite artists & genres
    const artistCounts = {};
    const playedIds = new Set();

    [...history, ...favorites].forEach(song => {
      if (!song) return;
      if (song.id) playedIds.add(song.id);
      let artist = (song.artist || '')
        .replace(/Official|Channel|Topic|VEVO/gi, '')
        .trim();
      if (artist && artist.toLowerCase() !== 'youtube' && artist.toLowerCase() !== 'artist' && artist.length > 1) {
        artistCounts[artist] = (artistCounts[artist] || 0) + 1;
      }
    });

    const topArtists = Object.keys(artistCounts)
      .sort((a, b) => artistCounts[b] - artistCounts[a])
      .slice(0, 5);

    let finalSongs = [];
    let isPersonalized = false;

    if (topArtists.length > 0) {
      isPersonalized = true;
      // Fetch fresh songs for each top artist in parallel
      const searches = topArtists.map(artist => searchYouTube(`${artist} popular songs`, 15));
      const searchResults = await Promise.allSettled(searches);

      const pool = [];
      searchResults.forEach(r => {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          pool.push(...r.value);
        }
      });

      // Deduplicate
      const seen = new Set();
      pool.forEach(song => {
        if (!seen.has(song.id)) {
          seen.add(song.id);
          finalSongs.push(song);
        }
      });

      // Shuffle slightly for organic YouTube-style feed
      finalSongs = finalSongs.sort(() => 0.5 - Math.random());
    }

    // Fallback or blend with curated trending to reach full targetLimit (up to 70 videos)
    if (finalSongs.length < targetLimit) {
      const needed = targetLimit - finalSongs.length;
      const trendingQueries = [
        'បទចម្រៀងខ្មែរពេញនិយម 2026 VannDa G-Devith',
        'khmer remix tiktok viral songs 2026',
        'chill lofi khmer acoustic pop hits 2026'
      ];
      const perQuery = Math.max(Math.ceil(needed / trendingQueries.length) + 10, 25);
      const trendingSearches = trendingQueries.map(q => searchYouTube(q, perQuery));
      const trendingResults = await Promise.allSettled(trendingSearches);

      const seen = new Set(finalSongs.map(s => s.id));
      trendingResults.forEach(r => {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          r.value.forEach(s => {
            if (!seen.has(s.id) && finalSongs.length < targetLimit) {
              seen.add(s.id);
              finalSongs.push(s);
            }
          });
        }
      });
    }

    finalSongs = finalSongs.slice(0, targetLimit);

    res.json({
      success: true,
      personalized: isPersonalized,
      topArtists,
      count: finalSongs.length,
      data: finalSongs
    });

    // Prefetch top 2 songs
    if (finalSongs.length > 0) {
      prefetchAudioSequentially(finalSongs.map(r => r.id));
    }
  } catch (err) {
    console.error('Recommendations error:', err.message);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Network info for easy mobile phone connection (LAN & Public Tunnel)
app.get('/api/network-info', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const currentOrigin = `${proto}://${host}`;

  const nets = os.networkInterfaces();
  const physicalIps = [];
  const allIps = [];

  for (const name of Object.keys(nets)) {
    const isVirtual = /vmnet|vethernet|hyper-v|virtual|loopback|warp|wsl/i.test(name);
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        allIps.push(net.address);
        // Exclude Cloudflare WARP internal tunnel IP 172.16.0.2 from physical LAN candidates
        if (!isVirtual && net.address !== '172.16.0.2') {
          physicalIps.push({ name, ip: net.address });
        }
      }
    }
  }

  // Check if a Cloudflare tunnel is currently active in tunnel.log
  let tunnelUrl = null;
  try {
    const tunnelLogPath = path.join(__dirname, 'tunnel.log');
    if (fs.existsSync(tunnelLogPath)) {
      const raw = fs.readFileSync(tunnelLogPath);
      const content = raw.toString('utf16le') + ' ' + raw.toString('utf8');
      const matches = content.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
      if (matches && matches.length > 0) {
        tunnelUrl = matches[matches.length - 1];
      }
    }
  } catch (e) {}

  // Prioritize physical Wi-Fi/Ethernet IP (e.g., 172.16.0.219 or 192.168.x.x)
  const ip = (physicalIps[0] && physicalIps[0].ip) || allIps[0] || 'localhost';
  const lanUrl = `http://${ip}:${PORT}`;
  
  // If accessed via public domain (Cloudflare tunnel, Render, custom domain), use that
  const isPublicDomain = host.includes('trycloudflare.com') || host.includes('loca.lt') || host.includes('render.com') || (host.includes('.') && !host.startsWith('192.') && !host.startsWith('10.') && !host.startsWith('172.') && !host.startsWith('127.') && !host.startsWith('localhost'));
  
  // Prefer HTTPS public tunnel when available for seamless iOS lock screen & outside access
  const mobileUrl = isPublicDomain ? currentOrigin : (tunnelUrl || lanUrl);

  res.json({
    ip,
    port: PORT,
    mobileUrl,
    currentOrigin,
    allIps,
    lanUrl,
    tunnelUrl
  });
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🎵 KOT Music Server is running!`);
  console.log(`🚀 URL: http://localhost:${PORT}`);
  console.log(`📱 Ad-Free & Lock Screen Playback Enabled`);
  console.log(`===============================================`);
});
