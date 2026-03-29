/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Youtube, Wand2, Loader2, FileText, AlertCircle, Copy, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const EXAMPLE_VIDEOS = [
  { label: 'TED Talk', url: 'https://www.youtube.com/watch?v=ojttMNOW6zM' },
  { label: 'MKBHD', url: 'https://www.youtube.com/watch?v=iGeXGdYE7UE' },
];

// Simple language detection from transcript text (no external deps)
function detectLanguage(text: string): string {
  if (!text) return 'en';
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const totalChars = (text.match(/[\u4e00-\u9fff]|[a-zA-Z]/g) || []).length;
  if (totalChars === 0) return 'en';
  return chineseChars / totalChars > 0.2 ? 'cn' : 'en';
}

const LOADING_MESSAGES = [
  'Extracting essence from video...',
  'Purifying transcripts...',
  'Transmuting to content gold...',
];

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCCGuide, setShowCCGuide] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  const [transcriptLang, setTranscriptLang] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [inputFlash, setInputFlash] = useState(false);
  const [tone, setTone] = useState<'professional' | 'conversational' | 'academic'>('conversational');

  const TONE_OPTIONS = [
    { value: 'professional', label: 'Professional', desc: 'Authoritative & data-driven' },
    { value: 'conversational', label: 'Conversational', desc: 'Friendly & coffee-shop chat' },
    { value: 'academic', label: 'Academic', desc: 'Rigorous & objective' },
  ] as const;

  // Auto-clear flash effect (must be after inputFlash declaration)
  React.useEffect(() => {
    if (inputFlash) {
      const t = setTimeout(() => setInputFlash(false), 600);
      return () => clearTimeout(t);
    }
  }, [inputFlash]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url && !manualTranscript) return;

    setLoading(true);
    setError(null);
    setSummary(null);
    setShowCCGuide(false);
    setTranscriptLang(manualMode ? 'cn' : null);
    setLoadingMessage(LOADING_MESSAGES[0]);

    // Cycle loading messages
    let msgIdx = 0;
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[msgIdx]);
    }, 2000);

    try {
      let transcript = '';
      let detectedLang = manualMode ? 'cn' : 'en';

      if (manualMode) {
        transcript = manualTranscript;
        if (!transcript.trim()) throw new Error('请提供视频字幕内容');
        detectedLang = detectLanguage(transcript);
      } else {
        const apiBase = import.meta.env.VITE_API_URL;
        if (!apiBase) throw new Error('Missing VITE_API_URL. Please configure your Worker URL.');

        try {
          const resp = await fetch(`${apiBase}/api/transcript?url=${encodeURIComponent(url)}`);
          const data = await resp.json();
          if (data.transcript) {
            transcript = data.transcript;
            detectedLang = data.lang || 'en';
            setTranscriptLang(detectedLang);
          } else {
            throw new Error(data.error || 'Worker returned no transcript');
          }
        } catch (err: any) {
          console.error('Worker transcript fetch error:', err);
          const errorMsg = err?.message || '';
          if (errorMsg.includes('transcript') || errorMsg.includes('字幕') || errorMsg.includes('not available') || errorMsg.includes('Failed to fetch') || errorMsg.includes('not found')) {
            setShowCCGuide(true);
            throw new Error('无法找到该视频的字幕。请确认视频已开启 CC 字幕（见下方提示）。');
          }
          throw err;
        }
      }

      const apiKey = import.meta.env.VITE_MINIMAX_API_KEY as string;
      if (!apiKey) throw new Error('Missing MINIMAX API KEY. Please set VITE_MINIMAX_API_KEY in your environment.');

      const langCode = detectedLang;
      const langMap: Record<string, { name: string; articleLang: string }> = {
        en: { name: 'English', articleLang: 'English' },
        cn: { name: '简体中文', articleLang: '简体中文' },
        ok: { name: '한국어', articleLang: 'Korean' },
      };
      const lang = langMap[langCode] || langMap['en'];

      const response = await fetch('https://api.minimaxi.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "MiniMax-M2.7",
          stream: true,
          messages: [
            {
              role: "user",
              content: `# Role: World-Class Content Alchemist & SEO Editor

# Mission:
Transmute the provided raw YouTube transcript into a high-authority, engaging, and professional blog post. Your goal is to make the reader forget this was ever a video transcript.

# Writing Principles (The Human Touch):
1. **Kill the "Video Talk":** NEVER use phrases like "In this video," "The speaker says," or "Click the link below." Write as a direct authority on the subject.
2. **The "Hook" Start:** Start with a compelling introduction that defines the problem or the "why" behind the topic. Do not just summarize.
3. **Natural Transitions:** Use logical flow between paragraphs. Avoid robotic bullet-point lists unless they add genuine value.
4. **Formatting for Skimmers:** Use H2 and H3 headers that are catchy, not just "Section 1." Use bold text for key insights.
5. **Clean the "Noise":** Automatically remove filler words (um, ah, you know, like), repetitive stammers, and sponsor shoutouts.
6. **Insight Extraction:** If the speaker makes a great point or a "golden quote," format it as a blockquote or a standalone highlight.

# Structure:
- **Title:** Create a click-worthy, SEO-optimized H1 title (different from the video title).
- **Introduction:** A 2-3 sentence hook to grab the reader's attention.
- **Body Content:** Logical sections with H2/H3 headers. Blend stories, facts, and advice.
- **Key Takeaways:** A concise bulleted list of the most actionable points.
- **Conclusion:** A strong closing thought that leaves the reader inspired or informed.

# Tone:
Professional yet conversational, authoritative, and helpful. (Adjust based on the content's niche).

# Output Language:
English (Standard US).

# Tone:
${tone === 'professional' ? 'Tone: Authoritative, formal, and data-driven.' : tone === 'conversational' ? 'Tone: Friendly, casual, and like a coffee-shop chat.' : 'Tone: Rigorous, structured, and objective.'}

Transcript:
${transcript}`
            }
          ]
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Minimax API error: ${response.status} - ${errorText}`);
      }

      // Stream the response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                setStreamingText(fullText);
              }
            } catch {}
          }
        }
      }

      // Remove thinking tags
      const text = fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      setStreamingText('');
      setSummary(text);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
      clearInterval(msgInterval);
    }
  };

  const copyToClipboard = () => {
    if (summary) {
      navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-gray-100 font-sans selection:bg-alchemist-purple/30">
      {/* Header */}
      <header className="border-b border-dark-border bg-dark-bg/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-alchemist-purple to-alchemist-gold shadow-[0_0_20px_rgba(139,92,246,0.4)]">
              <Wand2 className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-alchemist-gold to-alchemist-gold-light bg-clip-text text-transparent">
              YouTube Alchemist
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <section className="mb-12">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-extrabold mb-4 tracking-tight bg-gradient-to-r from-amber-400 via-yellow-200 to-yellow-500 bg-clip-text text-transparent">
              Turn Video Noise into Content Gold
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Stop wasting hours transcribing. YouTube Alchemist distills your favorite videos into professional, SEO-optimized articles in seconds.
            </p>
            <p className="text-gray-500 text-sm mt-3">
              Loved by indie hackers and content creators worldwide ✨
            </p>
          </div>

          <div className="flex justify-center mb-8">
            <div className="inline-flex p-1 bg-dark-card rounded-xl border border-dark-border">
              <button
                onClick={() => setManualMode(false)}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  !manualMode
                    ? "bg-gradient-to-r from-alchemist-purple to-purple-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                Auto Fetch
              </button>
              <button
                onClick={() => setManualMode(true)}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  manualMode
                    ? "bg-gradient-to-r from-alchemist-purple to-purple-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                Paste Transcript
              </button>
            </div>
          </div>

          {/* Tone Selector */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Tone:</span>
              <div className="inline-flex p-1 bg-dark-card rounded-lg border border-dark-border">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTone(opt.value)}
                    title={opt.desc}
                    className={cn(
                      "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
                      tone === opt.value
                        ? "bg-alchemist-purple/20 text-alchemist-purple border border-alchemist-purple/40"
                        : "text-gray-400 hover:text-gray-200 border border-transparent"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="relative">
            <div className="flex flex-col gap-3 p-2 bg-dark-card rounded-2xl border border-dark-border focus-within:border-alchemist-purple/50 transition-all duration-500 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
              {!manualMode ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 flex items-center px-4 gap-3">
                    <Youtube className="text-gray-500 w-5 h-5 shrink-0" />
                    <input
                      type="url"
                      placeholder="Paste your YouTube link here..."
                      className={cn(
                        "w-full py-4 bg-transparent outline-none text-base text-gray-100 placeholder:text-gray-500 rounded-xl transition-all duration-300",
                        inputFlash
                          ? "shadow-[0_0_30px_rgba(139,92,246,0.7)] border-alchemist-purple/60"
                          : "focus:shadow-[0_0_25px_rgba(139,92,246,0.4)]"
                      )}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required={!manualMode}
                    />
                  </div>
                  {/* Video type tags */}
                  <div className="flex items-center justify-center gap-3 px-4 pb-1">
                    <span className="text-zinc-500 text-sm">Try it:</span>
                    {EXAMPLE_VIDEOS.map((video) => (
                      <button
                        key={video.title}
                        type="button"
                        onClick={() => {
                          setUrl(video.url);
                          setInputFlash(true);
                        }}
                        className="px-3 py-1 rounded-full text-xs font-medium border border-dark-border hover:border-alchemist-purple/50 hover:bg-alchemist-purple/10 text-gray-300 hover:text-alchemist-purple transition-all"
                      >
                        {video.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200",
                      loading
                        ? "bg-dark-border text-gray-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-alchemist-purple to-purple-500 text-white hover:from-purple-500 hover:to-purple-400 active:scale-[0.98] shadow-[0_0_25px_rgba(139,92,246,0.5)]"
                    )}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Transmuting...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        Transmute
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="px-4 pt-2">
                    <textarea
                      placeholder="Paste your video transcript here..."
                      className="w-full min-h-[160px] py-3 bg-transparent outline-none text-base resize-none text-gray-100 placeholder:text-gray-500 focus:shadow-[0_0_25px_rgba(139,92,246,0.4)] rounded-xl transition-all duration-300"
                      value={manualTranscript}
                      onChange={(e) => setManualTranscript(e.target.value)}
                      required={manualMode}
                    />
                  </div>
                  <div className="flex justify-end p-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className={cn(
                        "px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200",
                        loading
                          ? "bg-dark-border text-gray-500 cursor-not-allowed"
                          : "bg-gradient-to-r from-alchemist-purple to-purple-500 text-white hover:from-purple-500 hover:to-purple-400 active:scale-[0.98] shadow-[0_0_25px_rgba(139,92,246,0.5)]"
                      )}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Transmuting...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          Start Transmuting — It's Free
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>

          {/* Animated Loading Progress */}
          {loading && (
            <div className="mt-6 animate-in fade-in slide-in-from-top-2">
              <div className="flex flex-col items-center gap-3">
                <div className="w-full max-w-md">
                  {/* Sliding gradient progress bar */}
                  <div className="h-1 bg-dark-border rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-alchemist-purple to-alchemist-gold rounded-full animate-slide" />
                  </div>
                </div>
                <p className="text-sm text-gray-400 animate-pulse">{loadingMessage}</p>
              </div>
            </div>
          )}

          {showCCGuide && (
            <div className="mt-4 p-5 bg-dark-card border border-amber-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-400">Transcript not found</p>
                  <p className="text-xs text-gray-400 mt-1">Make sure the video has CC subtitles enabled (see image below)</p>
                </div>
              </div>
              <div className="bg-dark-bg rounded-xl p-3 border border-dark-border">
                <p className="text-xs text-gray-400 mb-2 font-medium">How to enable CC:</p>
                <img src="/assets/cc-icon.jpg" alt="CC icon location on YouTube" className="w-full max-w-md rounded-lg" />
                <p className="text-xs text-gray-500 mt-2">Click the CC icon at the bottom right of the video</p>
              </div>
              <button
                onClick={() => setShowCCGuide(false)}
                className="mt-3 text-xs text-amber-500 hover:text-amber-400 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {error && !showCCGuide && (
            <div className="mt-4 p-4 bg-dark-card border border-red-500/30 rounded-xl flex items-start gap-3 text-red-400 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </section>

        {/* Result Section - Glassmorphism Card (shows streaming or final) */}
        {(summary || streamingText) && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="rounded-3xl border border-white/10 bg-dark-card/60 backdrop-blur-md shadow-[0_0_40px_rgba(139,92,246,0.15)] overflow-hidden">
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-dark-bg/30">
                <div className="flex items-center gap-2 text-gray-400">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Generated Article</span>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium text-gray-400 hover:text-gray-200"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="p-8 md:p-12 prose prose-invert max-w-none">
                <div className="markdown-body text-gray-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText || summary}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!summary && !streamingText && !loading && !error && (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500">
            <div className="w-20 h-20 border-2 border-dashed border-dark-border rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8" />
            </div>
            <p className="text-sm font-medium">Paste a YouTube link to begin</p>
          </div>
        )}
      </main>

      {/* Early Bird / Pro Waitlist */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-dark-card to-dark-bg p-8 text-center">
          <div className="flex justify-center mb-4">
            {/* Product Hunt Coming Soon Badge */}
            <a href="https://www.producthunt.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1a1a2e] border border-[#fg5438]/20 hover:border-[#fg5438]/40 transition-colors">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-sm text-gray-300">Coming soon on</span>
              <span className="text-sm font-bold text-[#fg5438]">Product Hunt</span>
            </a>
          </div>
          <h3 className="text-xl font-bold text-gray-100 mb-2">Get Early Bird Discount</h3>
          <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Pro version with unlimited transcriptions, custom tone styles, and API access. Leave your email for exclusive launch pricing.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const email = (e.currentTarget.elements.namedItem('email') as HTMLInputElement).value;
              if (email) {
                alert(`Thanks! We'll notify you at ${email}`);
                (e.currentTarget as HTMLFormElement).reset();
              }
            }}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              required
              className="flex-1 px-4 py-3 rounded-xl bg-dark-bg border border-dark-border text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-alchemist-purple/50 transition-colors"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-alchemist-purple to-purple-500 text-white hover:from-purple-500 hover:to-purple-400 transition-all shadow-[0_0_20px_rgba(139,92,246,0.4)]"
            >
              Notify Me
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-dark-border text-center text-gray-500 text-sm">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <p>© 2026 YouTube Content Alchemist · Built by an independent developer for creators</p>
          <a
            href="https://www.buymeacoffee.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-amber-400 transition-colors"
          >
            ☕ Support the developer
          </a>
        </div>
      </footer>
    </div>
  );
}
// UNIQUE_TEST_12345
// XYZ123_UNIQUE_ABC456
