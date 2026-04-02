import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'youtube-transcript-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/transcript')) {
              try {
                const urlParams = new URL(req.url, `http://${req.headers.host}`);
                const videoUrl = urlParams.searchParams.get('url');

                if (!videoUrl) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Missing video URL" }));
                  return;
                }

                console.log(`[Vite Plugin] Fetching transcript for: ${videoUrl}`);
                
                // Use a custom fetch to provide more realistic headers
                try {
                  const transcript = await YoutubeTranscript.fetchTranscript(videoUrl, {
                    fetch: (url: string, options: any) => fetch(url, {
                      ...options,
                      headers: {
                        ...options?.headers,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                      }
                    })
                  });
                  
                  const fullText = transcript.map((t: any) => t.text).join(" ");
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ transcript: fullText }));
                } catch (fetchError: any) {
                  const errorMessage = fetchError.message || String(fetchError);
                  console.error("[Vite Plugin] Transcript fetch error:", errorMessage);
                  
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  
                  if (errorMessage.includes('Transcript is disabled')) {
                    res.end(JSON.stringify({ error: "该视频未启用字幕（包括自动生成的字幕也未开启）。请尝试其他视频，或使用“手动模式”粘贴内容。" }));
                  } else if (errorMessage.includes('too many requests') || errorMessage.includes('captcha')) {
                    res.end(JSON.stringify({ error: "YouTube 暂时限制了自动抓取（触发了人机验证）。请切换到“手动模式”并粘贴视频字幕。" }));
                  } else {
                    res.end(JSON.stringify({ error: `无法获取字幕: ${errorMessage}` }));
                  }
                }
              } catch (outerError: any) {
                console.error("[Vite Plugin] Outer error:", outerError);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Internal server error" }));
              }
              return;
            }
            if (req.url === '/api/health') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: "ok" }));
              return;
            }
            next();
          });
        }
      }
    ],
    build: {
      rollupOptions: {
        input: {
          main: './index.html',
          library: './library.html',
        },
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
