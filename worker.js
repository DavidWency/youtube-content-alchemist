/**
 * Cloudflare Worker - YouTube Transcript API
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/api/transcript') {
      const videoUrl = url.searchParams.get('url');

      if (!videoUrl) {
        return jsonResponse({ error: 'Missing url parameter' }, 400);
      }

      try {
        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
          return jsonResponse({ error: 'Invalid YouTube URL' }, 400);
        }

        const transcript = await fetchYouTubeTranscript(videoId);
        return jsonResponse({ transcript });
      } catch (err) {
        console.error('Transcript fetch error:', err);
        return jsonResponse({ error: err.message || 'Failed to fetch transcript' }, 500);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v');
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1);
    }
    if (u.pathname.startsWith('/embed/')) {
      return u.pathname.split('/')[2];
    }
  } catch {}
  return null;
}

async function fetchYouTubeTranscript(videoId) {
  // Try multiple transcript sources
  
  // Source 1: youtubetranscript.com API
  try {
    const apiUrl = `https://youtubetranscript.com/?video_id=${videoId}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (response.ok) {
      const text = await response.text();
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    }
  } catch {}

  // Source 2: Direct YouTube timedtext API (for some videos)
  try {
    const timedtextUrl = `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}&fmt=json3`;
    const response = await fetch(timedtextUrl);
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.events) {
        const text = data.events
          .filter(e => e.segs)
          .flatMap(e => e.segs.map(s => s.text || ''))
          .join(' ')
          .trim();
        if (text) return text;
      }
    }
  } catch {}

  throw new Error('无法获取字幕：该视频可能没有字幕或字幕已被禁用。请尝试其他视频，或使用"手动模式"粘贴字幕。');
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
