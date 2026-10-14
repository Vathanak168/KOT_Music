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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory caches to speed up requests with bounded size (Anti-memory leak)
const MAX_CACHE_ENTRIES = 250;
const searchCache = new Map();
const streamCache = new Map();
const videoStreamCache = new Map();
const infoCache = new Map();

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

            results.push({
              id: item.id,
              title: item.title,
              artist: item.uploader || item.channel || 'Artist',
              duration: item.duration,
              durationFormatted: item.duration_string || formatDuration(item.duration),
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

// In-flight extraction promises map (prevents duplicate parallel yt-dlp processes on simultaneous Range requests)
const inFlightExtractions = new Map();

// Helper: Extract pure audio stream URL via yt-dlp with caching & stampede prevention
function extractAudioStreamUrl(videoId) {
  const cached = streamCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 2) {
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
      '--extractor-args', 'youtube:player_client=android,web',
      '-g',
      '-f', 'ba/b',
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

// Helper: Extract pure video stream URL (MP4 with audio) via yt-dlp with caching & stampede prevention
function extractVideoStreamUrl(videoId, quality = 'auto') {
  const cacheKey = `${videoId}_${quality}`;
  const cached = videoStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 2) {
    return Promise.resolve(cached.url);
  }

  if (inFlightVideoExtractions.has(cacheKey)) {
    return inFlightVideoExtractions.get(cacheKey);
  }

  let formatArg = '18/b/22';
  if (quality === '720p' || quality === 'hd') {
    formatArg = '22/18/b';
  } else if (quality === '480p') {
    formatArg = '18/b/22';
  } else if (quality === '360p' || quality === '240p') {
    formatArg = '18/b';
  }

  const extractionPromise = new Promise((resolve, reject) => {
    const args = [
      '-m', 'yt_dlp',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=android,web',
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
        setBoundedCache(videoStreamCache, cacheKey, { url: streamUrl, timestamp: Date.now() });
        resolve(streamUrl);
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

// API: Prefetch stream URL in advance (Zero-delay next song playback)
app.get('/api/prefetch/:id', (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length !== 11) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }
  // Trigger background extraction without waiting
  extractAudioStreamUrl(videoId).catch(() => {});
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
    if (results.length > 0 && results[0]?.id) {
      extractAudioStreamUrl(results[0].id).catch(() => {});
      if (results[1]?.id) extractAudioStreamUrl(results[1].id).catch(() => {});
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
      headers: requestHeaders
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
        'accept-ranges',
        'cache-control'
      ];

      forwardedHeaders.forEach(header => {
        if (proxyRes.headers[header]) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });

      res.setHeader('Accept-Ranges', 'bytes');
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

  try {
    const directUrl = await extractVideoStreamUrl(videoId, req.query.quality || 'auto');
    res.json({
      success: true,
      id: videoId,
      videoStreamUrl: `/api/video-stream/${videoId}`,
      directUrl
    });
  } catch (err) {
    console.error(`Video extraction error for ${videoId}:`, err.message);
    res.status(500).json({ error: 'Video extraction failed', message: err.message });
  }
});

// API: Proxy Video Stream with full HTTP Range request support (MP4 Video Player)
app.get('/api/video-stream/:id', async (req, res) => {
  const videoId = req.params.id;
  if (!videoId || videoId.length !== 11) {
    return res.status(400).send('Invalid video ID');
  }
  const quality = req.query.quality || 'auto';

  try {
    let directUrl;
    try {
      directUrl = await extractVideoStreamUrl(videoId, quality);
    } catch (e) {
      videoStreamCache.delete(`${videoId}_${quality}`);
      directUrl = await extractVideoStreamUrl(videoId, 'auto');
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
      headers: requestHeaders
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
        'accept-ranges',
        'cache-control'
      ];

      forwardedHeaders.forEach(header => {
        if (proxyRes.headers[header]) {
          res.setHeader(header, proxyRes.headers[header]);
        }
      });

      res.setHeader('Accept-Ranges', 'bytes');
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
  const query = CURATED_LISTS[category] || CURATED_LISTS.khmer;

  try {
    const results = await searchYouTube(query, 16);
    res.json({ success: true, category, data: results });
    // Prefetch top 2 songs in background for instant playback
    if (results.length > 0 && results[0]?.id) {
      extractAudioStreamUrl(results[0].id).catch(() => {});
      if (results[1]?.id) extractAudioStreamUrl(results[1].id).catch(() => {});
    }
  } catch (err) {
    console.error('Trending fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch curated music' });
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
