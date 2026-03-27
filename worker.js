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
  // YouTube's transcript/timedtext API endpoint
  // Try different language codes, English first
  const langs = ['en', 'zh-Hans', 'zh-CN', 'zh-TW', 'ja', 'ko'];
  
  for (const lang of langs) {
    try {
      const timedtextUrl = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=json3&xdrs=true`;
      
      const response = await fetch(timedtextUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cf: { cacheTtl: 300, cacheEverything: true }
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json') || contentType.includes('text/plain')) {
          const text = await response.text();
          
          // Sometimes YouTube returns JSON with transcript data
          try {
            const data = JSON.parse(text);
            if (data && data.events) {
              const transcript = data.events
                .filter(event => event.segs)
                .flatMap(event => event.segs.map(seg => seg.text || ''))
                .join(' ')
                .replace(/\n/g, ' ')
                .trim();
              
              if (transcript && transcript.length > 10) {
                return transcript;
              }
            }
          } catch {
            // Not JSON, might be empty or plain text
            if (text && text.trim().length > 20) {
              return text.trim();
            }
          }
        }
      }
    } catch (err) {
      console.log(`Failed to fetch ${lang}:`, err.message);
    }
  }

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
