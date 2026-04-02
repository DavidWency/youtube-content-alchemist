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
        const { id, title, content, summary, video_url, status } = body;

        if (!id || !title || !content) {
          return jsonResponse({ error: 'Missing required fields: id, title, content' }, 400);
        }

        const articleStatus = status || 'published';
        
        await env.youtube_alchemist_db
          .prepare(`INSERT OR REPLACE INTO articles (id, title, content, summary, video_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
          .bind(id, title, content, summary || '', video_url || '', articleStatus)
          .run();

        return jsonResponse({ success: true, id }, 201);
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

    // GET /api/articles/:id - Get single article
    const articleMatch = url.pathname.match(/^\/api\/articles\/(.+)$/);
    if (articleMatch && request.method === 'GET') {
      try {
        const articleId = articleMatch[1];
        
        const result = await env.youtube_alchemist_db
          .prepare('SELECT * FROM articles WHERE id = ?')
          .bind(articleId)
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
