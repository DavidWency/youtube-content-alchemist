/**
 * Cloudflare Worker - YouTube Transcript API
 * Uses RapidAPI YouTube Transcript API
 */

const RAPIDAPI_HOST = 'youtube-transcript3.p.rapidapi.com';
const RAPIDAPI_KEY = 'aedaaef5c9msh519eaa27ded12cbp1e089fjsn5a719549ab88';

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

        const result = await fetchTranscript(videoId);
        return jsonResponse({ transcript: result.text, lang: result.lang });
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
