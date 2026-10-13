const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory caches to speed up requests
const searchCache = new Map();
const streamCache = new Map();
const infoCache = new Map();

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

  searchCache.set(cacheKey, { data: results, timestamp: Date.now() });
  return results;
}

// Helper: Extract pure audio stream URL via yt-dlp
function extractAudioStreamUrl(videoId) {
  return new Promise((resolve, reject) => {
    const cached = streamCache.get(videoId);
    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 2) {
      return resolve(cached.url);
    }

    const args = [
      '-m', 'yt_dlp',
      '--js-runtimes', 'node:node',
      '-g',
      '-f', 'ba[ext=m4a]/ba[ext=mp3]/ba',
      `https://www.youtube.com/watch?v=${videoId}`
    ];

    const proc = spawn(PYTHON_CMD, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => { stdout += data.toString(); });
    proc.stderr.on('data', data => { stderr += data.toString(); });

    proc.on('close', code => {
      const urls = stdout.trim().split('\n').filter(l => l.startsWith('http'));
      if (urls.length > 0) {
        const streamUrl = urls[urls.length - 1];
        streamCache.set(videoId, { url: streamUrl, timestamp: Date.now() });
        resolve(streamUrl);
      } else {
        reject(new Error(stderr || 'Failed to extract audio stream URL'));
      }
    });
  });
}

// API: Search
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query parameter ?q=' });
  }

  try {
    const results = await searchYouTube(query, 20);
    res.json({ success: true, count: results.length, data: results });
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

// API: Curated Playlists / Categories
const CURATED_LISTS = {
  khmer: 'បទចម្រៀងខ្មែរពេញនិយម VannDa G-Devith Khmer chill',
  chill: 'chill lofi acoustic music peaceful',
  pop: 'billboard top hits pop music 2025 2026',
  sleep: 'deep sleep music relaxing piano rain delta waves',
  edm: 'cyberpunk synthwave edm workout bass'
};

app.get('/api/trending', async (req, res) => {
  const category = req.query.category || 'khmer';
  const query = CURATED_LISTS[category] || CURATED_LISTS.khmer;

  try {
    const results = await searchYouTube(query, 16);
    res.json({ success: true, category, data: results });
  } catch (err) {
    console.error('Trending fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch curated music' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Network info for easy mobile phone connection over Wi-Fi
app.get('/api/network-info', (req, res) => {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  const ip = results[0] || 'localhost';
  res.json({
    ip,
    port: PORT,
    mobileUrl: `http://${ip}:${PORT}`,
    allIps: results
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
