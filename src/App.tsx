/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Youtube, Wand2, Loader2, FileText, AlertCircle, Copy, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCCGuide, setShowCCGuide] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  const [transcriptLang, setTranscriptLang] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url && !manualTranscript) return;

    setLoading(true);
    setError(null);
    setSummary(null);
    setShowCCGuide(false);
    setTranscriptLang(manualMode ? 'cn' : null); // Manual mode defaults to Chinese

    try {
      let transcript = '';
      let detectedLang = manualMode ? 'cn' : 'en'; // Default, will be overridden in auto mode

      if (manualMode) {
        transcript = manualTranscript;
        if (!transcript.trim()) throw new Error('请提供视频字幕内容');
      } else {
        // Fetch transcript via Worker (RapidAPI backend)
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
          // Check if it's a "transcript not found" error
          const errorMsg = err?.message || '';
          if (errorMsg.includes('transcript') || errorMsg.includes('字幕') || errorMsg.includes('not available') || errorMsg.includes('Failed to fetch') || errorMsg.includes('not found')) {
            setShowCCGuide(true);
            throw new Error('无法找到该视频的字幕。请确认视频已开启 CC 字幕（见下方提示）。');
          }
          throw err;
        }
      }

      // 2. Use Minimax to generate the article
      const apiKey = import.meta.env.VITE_MINIMAX_API_KEY as string;
      if (!apiKey) throw new Error('Missing MINIMAX API KEY. Please set VITE_MINIMAX_API_KEY in your environment.');

      // Detect output language based on transcript language (use detectedLang directly)
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
          messages: [
            {
              role: "user",
              content: `You are a professional content writer. Based on the following YouTube video transcript, generate a high-quality, well-structured article in ${lang.articleLang} Markdown format.

Requirements:
- Use clear H2 headings to divide different sections
- Make the article engaging and informative
- Maintain the original video's tone and style, but improve readability
- Include an introduction and summary
- Output language: ${lang.articleLang}

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

      const data = await response.json();
      let text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('AI failed to generate content');

      // Remove thinking tags and their content
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      setSummary(text);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-[#f8f9fa] text-[#1a1a1a] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Youtube className="text-white w-5 h-5" />
            </div>
            <span className="font-semibold text-lg tracking-tight">YouTube Alchemist</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Input Section */}
        <section className="mb-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              将视频转化为深度文章
            </h1>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              输入 YouTube 链接或直接粘贴字幕,AI 将为您生成一篇结构清晰的 Markdown 文章。
            </p>
          </div>

          <div className="flex justify-center mb-6">
            <div className="inline-flex p-1 bg-gray-100 rounded-xl">
              <button
                onClick={() => setManualMode(false)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  !manualMode ? "bg-white shadow-sm text-emerald-700" : "text-gray-500 hover:text-gray-700"
                )}
              >
                自动抓取
              </button>
              <button
                onClick={() => setManualMode(true)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  manualMode ? "bg-white shadow-sm text-emerald-700" : "text-gray-500 hover:text-gray-700"
                )}
              >
                手动粘贴字幕
              </button>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="relative group">
            <div className="flex flex-col gap-3 p-2 bg-white rounded-2xl shadow-sm border border-black/5 focus-within:border-emerald-500/50 transition-all duration-300">
              {!manualMode ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 flex items-center px-4 gap-3">
                    <Youtube className="text-gray-400 w-5 h-5" />
                    <input
                      type="url"
                      placeholder="粘贴 YouTube 视频链接 (例如: https://www.youtube.com/watch?v=...)"
                      className="w-full py-3 bg-transparent outline-none text-base"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required={!manualMode}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "px-8 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200",
                      loading
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                    )}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在炼金...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        生成文章
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="px-4 pt-2">
                    <textarea
                      placeholder="在此粘贴视频的字幕内容..."
                      className="w-full min-h-[150px] py-3 bg-transparent outline-none text-base resize-none"
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
                        "px-8 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-200",
                        loading
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                      )}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          正在炼金...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          基于字幕生成
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>

          {showCCGuide && (
            <div className="mt-4 p-5 bg-amber-50 border border-amber-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-800">无法找到字幕</p>
                  <p className="text-xs text-amber-600 mt-1">请确认视频已在 YouTube 开启 CC 字幕（见下图）</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-gray-500 mb-2 font-medium">开启 CC 字幕步骤：</p>
                <img src="/assets/cc-icon.jpg" alt="CC icon location on YouTube" className="w-full max-w-md rounded-lg" />
                <p className="text-xs text-gray-400 mt-2">点击视频右下角的 CC 图标即可开启/关闭字幕</p>
              </div>
              <button
                onClick={() => setShowCCGuide(false)}
                className="mt-3 text-xs text-amber-600 hover:text-amber-800 underline"
              >
                关闭提示
              </button>
            </div>
          )}

          {error && !showCCGuide && (
            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </section>

        {/* Result Section */}
        {summary && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2 text-gray-500">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">生成的文章 (Markdown)</span>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-white rounded-lg transition-colors flex items-center gap-2 text-xs font-medium text-gray-600"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      复制全文
                    </>
                  )}
                </button>
              </div>
              <div className="p-8 md:p-12 prose prose-slate max-w-none">
                <div className="markdown-body">
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!summary && !loading && !error && (
          <div className="py-20 flex flex-col items-center justify-center text-gray-300">
            <div className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8" />
            </div>
            <p className="text-sm font-medium">等待您的第一个视频链接</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-black/5 text-center text-gray-400 text-sm">
        <p>© 2026 YouTube Content Alchemist. Powered by Gemini 3.1 Pro.</p>
      </footer>
    </div>
  );
}
