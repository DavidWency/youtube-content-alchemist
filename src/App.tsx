/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Wand2, Loader2, FileText, AlertCircle, Copy, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url && !manualTranscript) return;

    setLoading(true);
    setError(null);
    setSummary(null);

    try {
      const transcript = manualTranscript;
      if (!transcript.trim()) throw new Error('请先粘贴视频字幕内容');

      // 2. Use Minimax to generate the article
      const apiKey = import.meta.env.VITE_MINIMAX_API_KEY as string;
      if (!apiKey) throw new Error('Missing MINIMAX API KEY. Please set VITE_MINIMAX_API_KEY in your environment.');
      
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
              content: `你是一位专业的内容写手。根据以下YouTube视频字幕，生成一篇高质量、结构化的中文Markdown文章。

要求：
- 使用清晰的H2标题划分不同章节
- 文章要有吸引力且信息丰富
- 保持原视频的语气和风格，但提升可读性
- 包含简介和总结
- 语言：简体中文

字幕内容：
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

          <form onSubmit={handleGenerate} className="relative group">
            <div className="flex flex-col gap-3 p-2 bg-white rounded-2xl shadow-sm border border-black/5 focus-within:border-emerald-500/50 transition-all duration-300">
              <div className="flex flex-col gap-3">
                <div className="px-4 pt-2">
                  <textarea
                    placeholder="在此粘贴视频的字幕内容..."
                    className="w-full min-h-[150px] py-3 bg-transparent outline-none text-base resize-none"
                    value={manualTranscript}
                    onChange={(e) => setManualTranscript(e.target.value)}
                    required
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
            </div>
          </form>

          {error && (
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
