/**
 * Cloudflare Worker - YouTube Transcript API
 * Uses RapidAPI YouTube Transcript API
 * D1 Database for article storage
 */

const RAPIDAPI_HOST = 'youtube-transcript3.p.rapidapi.com';
const RAPIDAPI_KEY = 'aedaaef5c9msh519eaa27ded12cbp1e089fjsn5a719549ab88';
const LOOPS_API_KEY = '182bcd9e8a61a198cfa49c94b0947732';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Transcript endpoint
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

        const result = await fetchTranscript(videoId);
        return jsonResponse({ transcript: result.text, lang: result.lang });
      } catch (err) {
        console.error('Transcript fetch error:', err);
        return jsonResponse({ error: err.message || 'Failed to fetch transcript' }, 500);
      }
    }

    // Loops newsletter subscription proxy
    if (url.pathname === '/api/subscribe' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { email } = body;

        if (!email) {
          return jsonResponse({ error: 'Missing email' }, 400);
        }

        const loopsResp = await fetch('https://app.loops.so/api/v1/contacts/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOOPS_API_KEY}`,
          },
          body: JSON.stringify({
            email,
            source: 'Youtube Alchemist Waitlist',
            userGroup: 'Waitlist',
          }),
        });

        const data = await loopsResp.json();
        return jsonResponse(data, loopsResp.status);
      } catch (err) {
        console.error('Subscribe error:', err);
        return jsonResponse({ error: 'Subscription failed' }, 500);
      }
    }

    // === Articles API ===

    // POST /api/articles - Save article
    if (url.pathname === '/api/articles' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { video_id, title, content, summary, status } = body;

        if (!video_id || !title || !content) {
          return jsonResponse({ error: 'Missing required fields: video_id, title, content' }, 400);
        }

        const articleStatus = status || 'published';
        
        await env.youtube_alchemist_db
          .prepare(`INSERT OR REPLACE INTO articles (video_id, title, content, summary, status, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
          .bind(video_id, title, content, summary || '', articleStatus)
          .run();

        return jsonResponse({ success: true, video_id }, 201);
      } catch (err) {
        console.error('Save article error:', err);
        return jsonResponse({ error: 'Failed to save article' }, 500);
      }
    }

    // GET /api/articles - List articles
    if (url.pathname === '/api/articles' && request.method === 'GET') {
      try {
        const status = url.searchParams.get('status');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        
        let query = 'SELECT * FROM articles';
        const bindings = [];
        
        if (status) {
          query += ' WHERE status = ?';
          bindings.push(status);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ?';
        bindings.push(limit);

        const result = await env.youtube_alchemist_db
          .prepare(query)
          .bind(...bindings)
          .all();

        return jsonResponse({ articles: result.results });
      } catch (err) {
        console.error('List articles error:', err);
        return jsonResponse({ error: 'Failed to list articles' }, 500);
      }
    }

    // GET /api/articles/:video_id - Get article by video_id
    const articleMatch = url.pathname.match(/^\/api\/articles\/(.+)$/);
    if (articleMatch && request.method === 'GET') {
      try {
        const videoId = articleMatch[1];
        
        const result = await env.youtube_alchemist_db
          .prepare('SELECT * FROM articles WHERE video_id = ?')
          .bind(videoId)
          .first();

        if (!result) {
          return jsonResponse({ error: 'Article not found' }, 404);
        }

        return jsonResponse({ article: result });
      } catch (err) {
        console.error('Get article error:', err);
        return jsonResponse({ error: 'Failed to get article' }, 500);
      }
    }

    // GET /article/:video_id - Render article page with caching
    const articlePageMatch = url.pathname.match(/^\/article\/(.+)$/);
    if (articlePageMatch && request.method === 'GET') {
      const videoId = articlePageMatch[1];
      const cacheKey = `https://youtube-alchemist-api/cdn/article/${videoId}`;
      const cache = caches.default;
      const cached = await cache.match(cacheKey);

      if (cached) {
        const cachedTime = cached.headers.get('X-Cached-Time');
        const cacheAge = Date.now() - parseInt(cachedTime || '0');
        const ONE_HOUR = 60 * 60 * 1000;

        if (cacheAge < ONE_HOUR) {
          return new Response(cached.body, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Cache': 'HIT',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }

      // Cache miss or expired - fetch from D1
      const article = await env.youtube_alchemist_db
        .prepare('SELECT * FROM articles WHERE video_id = ?')
        .bind(videoId)
        .first();

      if (!article) {
        return new Response('Article not found', { status: 404 });
      }

      // Generate SEO meta tags
      const videoUrl = `https://youtube.com/watch?v=${videoId}`;
      const metaTags = `
        <title>${escapeHtml(article.title)}</title>
        <meta name="description" content="${escapeHtml(article.summary || '')}">
        <meta property="og:title" content="${escapeHtml(article.title)}">
        <meta property="og:description" content="${escapeHtml(article.summary || '')}">
        <meta property="og:type" content="article">
        <meta property="og:url" content="https://youtube-alchemist.com/article/${videoId}">
        <link rel="canonical" href="https://youtube-alchemist.com/article/${videoId}">
      `;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${metaTags}
  <style>
    :root {
      --bg: #0A0A0B;
      --gold: #FACC15;
      --gold-start: #FDE047;
      --gold-end: #EAB308;
      --purple: #A855F7;
      --text: #F4F4F5;
      --text-muted: #A1A1AA;
      --border: rgba(255,255,255,0.1);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: var(--text); background: var(--bg); max-width: 800px; margin: 0 auto; padding: 40px 24px; }
    header { border-bottom: 1px solid var(--border); padding: 20px 0; margin-bottom: 40px; }
    header a { color: var(--purple); text-decoration: none; font-size: 0.95rem; transition: color 0.2s; }
    header a:hover { color: var(--gold); }
    .meta { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 24px; }
    .meta a { color: var(--purple); text-decoration: none; }
    .meta a:hover { text-decoration: underline; }
    .content { line-height: 1.8; }
    .content h1 { font-size: 2.5rem; margin-bottom: 24px; color: var(--text); font-weight: 800; background: linear-gradient(to right, var(--gold-start), var(--gold-end)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .content h2 { font-size: 1.5rem; margin: 40px 0 16px; color: var(--text); font-weight: 700; }
    .content h3 { font-size: 1.2rem; margin: 28px 0 12px; color: var(--text); font-weight: 600; }
    .content p { margin-bottom: 18px; color: var(--text); }
    .content blockquote { border-left: 4px solid var(--purple); padding-left: 20px; margin: 24px 0; color: var(--text-muted); font-style: italic; background: rgba(168,85,247,0.05); padding: 16px 20px; border-radius: 0 8px 8px 0; }
    .content ul, .content ol { margin: 16px 0; padding-left: 24px; color: var(--text); }
    .content li { margin-bottom: 10px; }
    .content strong { color: var(--text); font-weight: 600; }
    .content pre { background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 24px 0; }
    .content code { background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em; }
    .content pre code { background: none; padding: 0; }
    .video-link { display: inline-block; margin-top: 40px; padding: 12px 24px; background: linear-gradient(to right, var(--purple), #9333ea); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; transition: transform 0.2s, box-shadow 0.2s; }
    .video-link:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(168,85,247,0.4); }
    footer { margin-top: 60px; padding-top: 24px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
    footer a { color: var(--purple); text-decoration: none; }
    footer a:hover { color: var(--gold); }
  </style>
</head>
<body>
  <header>
    <a href="https://youtube-alchemist.com">← YouTube Alchemist</a>
  </header>
  <article>
    <h1>${escapeHtml(article.title)}</h1>
    <div class="meta">
      Video: <a href="${videoUrl}" target="_blank">${videoId}</a>
    </div>
    <div class="content">
      ${article.content}
    </div>
    <a href="${videoUrl}" target="_blank" class="video-link">Watch on YouTube →</a>
  </article>
  <footer>
    <p>Generated by <a href="https://youtube-alchemist.com">YouTube Alchemist</a></p>
  </footer>
</body>
</html>`;

      const response = new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Cache': 'MISS',
          'Cache-Control': 'public, max-age=3600',
          'X-Cached-Time': Date.now().toString(),
        },
      });

      // Store in cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

async function fetchTranscript(videoId) {
  const apiUrl = `https://${RAPIDAPI_HOST}/api/transcript?videoId=${encodeURIComponent(videoId)}&flat_text=true`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Host': RAPIDAPI_HOST,
      'X-RapidAPI-Key': RAPIDAPI_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RapidAPI returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch transcript from RapidAPI');
  }

  // If flat_text was returned, use it directly (no lang info available, default to en)
  if (typeof data.transcript === 'string') {
    return { text: data.transcript, lang: 'en' };
  }

  // Otherwise parse the array format
  if (Array.isArray(data.transcript)) {
    const text = data.transcript
      .map(item => item.text)
      .join(' ')
      .replace(/\n/g, ' ')
      .trim();
    // Get the language from the first segment
    const lang = data.transcript[0]?.lang || 'en';
    return { text, lang };
  }

  throw new Error('Invalid transcript format from RapidAPI');
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
