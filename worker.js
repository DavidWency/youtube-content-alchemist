/**
 * Cloudflare Worker - YouTube Transcript API
 * Uses YouTube's internal innerTube API (same as mobile app)
 */

const INNER_TUBE_URL = 'https://www.youtube.com/youtubei/v1/player';
const ANDROID_CLIENT = {
  clientName: 'ANDROID',
  clientVersion: '19.08.37',
};

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
  // Use YouTube's innerTube API (same as Android app)
  const response = await fetch(INNER_TUBE_URL + '?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.youtube/19.08.37 (Linux; U; Android 10)',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: ANDROID_CLIENT.clientName,
          clientVersion: ANDROID_CLIENT.clientVersion,
        },
      },
      videoId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YouTube API returned ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('该视频没有字幕或字幕已被禁用。请尝试其他视频，或使用"手动模式"粘贴字幕。');
  }

  // Get the first available caption track
  const captionTrack = captionTracks[0];
  const baseUrl = captionTrack.baseUrl + '&fmt=json3';

  // Fetch the actual caption content
  const captionResponse = await fetch(baseUrl, {
    headers: {
      'User-Agent': 'com.google.android.youtube/19.08.37 (Linux; U; Android 10)',
    },
  });

  if (!captionResponse.ok) {
    throw new Error(`Failed to fetch caption content: ${captionResponse.status}`);
  }

  const captionData = await captionResponse.json();

  // Parse the transcript from the JSON format
  if (captionData && captionData.events) {
    const transcript = captionData.events
      .filter(event => event.segs)
      .flatMap(event => event.segs.map(seg => seg.text || ''))
      .join(' ')
      .replace(/\n/g, ' ')
      .trim();

    if (transcript && transcript.length > 0) {
      return transcript;
    }
  }

  throw new Error('无法解析字幕内容。请尝试其他视频，或使用"手动模式"粘贴字幕。');
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
