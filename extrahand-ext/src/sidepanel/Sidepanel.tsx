import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, ChevronDown, Paperclip, FileText, Loader2, Settings, AlertCircle, CheckCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Attachment = { name: string; mimeType: string; dataUrl?: string };

type Message =
  | { id: string; role: 'user'; content: string; attachments?: Attachment[] }
  | { id: string; role: 'agent'; content: string; thinking?: string; isStreaming?: boolean }
  | { id: string; role: 'action'; actionName: string; payload?: any }
  | { id: string; role: 'error'; content: string }
  | { id: string; role: 'consent'; reason: string; payload: any; resolved?: boolean };

type ActiveTab = { title: string; url: string; favIconUrl?: string; progress?: number };
type UserProfile = { initial: string; email: string };

const MODELS = [
  { label: 'Auto', value: 'auto', description: 'Cheapest for the task', model: 'gpt-3.5-turbo' },
  { label: 'GPT-4o', value: 'gpt-4o', description: 'OpenAI flagship', model: 'gpt-4o' },
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini', description: 'Fast + cheap', model: 'gpt-4o-mini' },
];

function uid() { return Math.random().toString(36).slice(2, 9); }
function getInitial(email: string) { return email ? email[0].toUpperCase() : '?'; }
function getDomain(url: string) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } }
function trunc(str: string, max: number) { return str.length > max ? str.slice(0, max - 1) + '\u2026' : str; }

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[#9a9a9a] text-[13px] font-medium hover:text-gray-300 transition-colors w-fit"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
        </svg>
        <span>Thinking</span>
        <ChevronDown size={11} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="text-[#6a6a6a] text-[13px] leading-relaxed">{thinking}</p>}
    </div>
  );
}

function ActionBubble({ actionName, payload }: { actionName: string; payload?: any }) {
  const label = payload?.ref_id
    ? `${actionName} #${payload.ref_id}${payload.text ? `: "${trunc(payload.text, 28)}"` : ''}`
    : actionName;
  return (
    <div className="flex items-center gap-2 text-[#5a5a5a] text-[12px]">
      <span className="text-yellow-500/70 text-[10px]">&#9889;</span>
      <span className="font-mono">{label}</span>
    </div>
  );
}

function ConsentCard({ reason, resolved, onApprove, onDeny, payload }: {
  reason: string; payload: any; resolved?: boolean; onApprove: () => void; onDeny: () => void;
}) {
  return (
    <div className="bg-[#252525] border border-[#3a3a3a] rounded-xl p-3 flex flex-col gap-2 max-w-[92%]">
      <div className="flex items-start gap-2">
        <AlertCircle size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
        <p className="text-[13px] text-gray-300 leading-relaxed">{reason}</p>
      </div>
      {!resolved ? (
        <div className="flex gap-2 mt-1">
          <button onClick={onApprove} className="flex-1 bg-[#a8ff53] hover:bg-[#90e640] text-black text-[12px] font-semibold py-1.5 rounded-lg transition-colors">Approve</button>
          <button onClick={onDeny} className="flex-1 bg-[#333] hover:bg-[#3a3a3a] text-gray-300 text-[12px] font-semibold py-1.5 rounded-lg transition-colors">Deny</button>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[11px] text-green-400"><CheckCircle size={11} /><span>Resolved</span></div>
      )}
    </div>
  );
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const ext = attachment.mimeType?.split('/')[1]?.toUpperCase() || 'FILE';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#252525', border: '1px solid #2e2e2e', borderRadius: '12px', padding: '10px 12px', maxWidth: '220px' }}>
      <div style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', padding: '6px', borderRadius: '8px', flexShrink: 0, display: 'flex' }}><FileText size={14} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
        <span style={{ fontSize: '11px', color: '#5a5a5a' }}>{ext}</span>
      </div>
    </div>
  );
}

function ModelDropdown({ selected, onChange }: { selected: typeof MODELS[0]; onChange: (m: typeof MODELS[0]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', gap: '4px', color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', padding: 0 }}>
        <span>{selected.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 bg-[#333] border border-[#444] rounded shadow-lg overflow-hidden z-50 w-44">
          {MODELS.map(m => (
            <button key={m.value} onClick={() => { onChange(m); setOpen(false); }}
              className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 hover:bg-[#444] transition-colors ${m.value === selected.value ? 'bg-[#444]' : ''}`}>
              <span className="text-[12px] text-gray-200 font-medium">{m.label}</span>
              <span className="text-[10px] text-[#8a8a8a]">{m.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Sidepanel ───────────────────────────────────────────────────────────

export default function Sidepanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [hasAuth, setHasAuth] = useState<boolean | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showApiScreen, setShowApiScreen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bootstrap
  useEffect(() => {
    chrome.storage.local.get(['auth_token', 'hasSeenAuth'], async (res) => {
      const token = res.auth_token;
      if (token) {
        setHasAuth(true);
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const sb = createClient(
            'https://qqrsbytiqwwuumyctrsc.supabase.co',
            'sb_publishable_OYYr4EQYe1swYIu8rNG5Iw_JWZtXI5W',
            { global: { headers: { Authorization: `Bearer ${token}` } } }
          );
          const { data: { user } } = await sb.auth.getUser();
          if (user) {
            const email = user.email || '';
            setUserProfile({ initial: getInitial(email), email });
          }
        } catch (e) {
          console.warn('Profile fetch failed', e);
          setUserProfile({ initial: '?', email: '' });
        }
      } else {
        setHasAuth(!!res.hasSeenAuth);
      }
    });

    const refreshTab = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab) setActiveTab({ title: tab.title || getDomain(tab.url || ''), url: tab.url || '', favIconUrl: tab.favIconUrl });
      });
    };
    refreshTab();
    chrome.tabs.onActivated.addListener(refreshTab);
    chrome.tabs.onUpdated.addListener(refreshTab);

    const listener = (request: any) => {
      if (request.type !== 'UI_UPDATE') return;
      const { text, type, payload } = request.message as { text: string; type: string; payload: any };

      if (type === 'agent_stream_start') {
        setAgentRunning(true);
        setMessages(prev => [...prev, { id: uid(), role: 'agent', content: '', isStreaming: true }]);
      } else if (type === 'agent_stream_chunk') {
        setMessages(prev => {
          const idx = [...prev].reverse().findIndex(m => m.role === 'agent' && (m as any).isStreaming);
          if (idx === -1) return prev;
          const ri = prev.length - 1 - idx;
          const updated = [...prev];
          const msg = { ...(updated[ri] as any) };
          msg.content = (msg.content || '') + text;
          updated[ri] = msg;
          return updated;
        });
      } else if (type === 'agent') {
        setAgentRunning(false);
        setMessages(prev => {
          const streamIdx = [...prev].reverse().findIndex(m => m.role === 'agent' && (m as any).isStreaming);
          if (streamIdx !== -1) {
            const ri = prev.length - 1 - streamIdx;
            const updated = [...prev];
            (updated[ri] as any).isStreaming = false;
            if (text) (updated[ri] as any).content = text;
            return updated;
          }
          return [...prev, { id: uid(), role: 'agent', content: text, thinking: payload?.thinking }];
        });
      } else if (type === 'action') {
        setMessages(prev => [...prev, { id: uid(), role: 'action', actionName: text, payload }]);
        if (payload?.progress !== undefined) setActiveTab(t => t ? { ...t, progress: payload.progress } : t);
      } else if (type === 'consent') {
        setMessages(prev => [...prev, { id: uid(), role: 'consent', reason: text, payload }]);
      } else if (type === 'error') {
        setAgentRunning(false);
        if (text === 'MISSING_API') {
          setShowApiScreen(true);
        } else {
          setMessages(prev => [...prev, { id: uid(), role: 'error', content: text }]);
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.tabs.onActivated.removeListener(refreshTab);
      chrome.tabs.onUpdated.removeListener(refreshTab);
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleSend = useCallback(() => {
    if (!input.trim() && attachments.length === 0) return;
    setMessages(prev => [...prev, {
      id: uid(), role: 'user', content: input.trim(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }]);
    const modelToSend = selectedModel.value === 'auto' ? selectedModel.model : selectedModel.value;
    chrome.runtime.sendMessage({ 
      type: 'START_AGENT_LOOP', 
      prompt: input.trim(), 
      provider: 'openai', 
      model: modelToSend, 
      dryRun: false,
      attachments: attachments.length > 0 ? attachments : undefined
    });
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, attachments, selectedModel]);

  const handleStop = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'STOP_AGENT' });
    setAgentRunning(false);
    setMessages(prev => prev.map(m => m.role === 'agent' && (m as any).isStreaming ? { ...m, isStreaming: false } : m));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      agentRunning ? handleStop() : handleSend();
    }
  };

  const handleConsent = useCallback((msgId: string, approved: boolean) => {
    chrome.runtime.sendMessage({ type: 'CONSENT_RESPONSE', approved });
    setMessages(prev => prev.map(m => m.id === msgId && m.role === 'consent' ? { ...m, resolved: true } : m));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachments(prev => [...prev, { name: f.name, mimeType: f.type || 'application/octet-stream', dataUrl: event.target?.result as string }]);
      };
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  // Loading
  if (hasAuth === null) {
    return <div className="flex h-screen bg-[#212121] items-center justify-center"><Loader2 size={20} className="animate-spin text-[#a8ff53]" /></div>;
  }

  return (
    <div className="bg-[#212121] h-screen flex flex-col font-[Inter,sans-serif] m-0 overflow-hidden relative" style={{ minWidth: '360px' }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #dfe3e8; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #c1c6d6; }
      `}</style>

      {/* ── Auth Overlay ─────────────────────────────────────────────────────── */}
      {!hasAuth && (
        <div className="absolute inset-0 bg-[#1e1e1e] z-[100] flex flex-col items-center justify-center p-6 text-center text-white transition-opacity duration-300">
          <div className="bg-[#292929] border border-[#333] rounded-2xl p-6 flex flex-col items-center shadow-2xl w-full max-w-[320px] relative overflow-hidden h-[380px]">
            <img src="extrahand.png" alt="Extra Hand" className="w-16 h-16 mb-4 object-contain" />
            <h2 className="text-lg font-bold mb-2 tracking-tight text-[#a8ff53]">Sign In Required</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              You must sign in to use the features. The sign in should be done on the website itself.
            </p>
            <a href="http://localhost:3000/dashboard" target="_blank" rel="noreferrer" className="mt-auto w-full bg-[#a8ff53] text-black font-semibold py-2.5 px-4 rounded-lg transition-colors hover:brightness-110 flex items-center justify-center gap-2">
              Open Dashboard
            </a>
            <button onClick={() => { setHasAuth(true); chrome.storage.local.set({ hasSeenAuth: true }); }} className="mt-3 w-full bg-transparent hover:bg-[#333] text-gray-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
              I've signed in
            </button>
          </div>
        </div>
      )}

      {/* ── API Keys Missing Overlay ─────────────────────────────────────────── */}
      {showApiScreen && (
        <div className="absolute inset-0 bg-[#1e1e1e] z-[100] flex flex-col items-center justify-center p-6 text-center text-white transition-opacity duration-300">
          <div className="bg-[#292929] border border-[#333] rounded-2xl p-6 flex flex-col items-center shadow-2xl w-full max-w-[320px] relative overflow-hidden h-[380px]">
            <AlertCircle className="text-[40px] text-[#a8ff53] mb-4 w-10 h-10" />
            <h2 className="text-lg font-bold mb-2 tracking-tight text-[#a8ff53]">Missing API Keys</h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Please configure your API keys in the dashboard to continue using ExtraHand.
            </p>
            <button onClick={() => { setShowApiScreen(false); window.open('http://localhost:3000/dashboard', '_blank'); }} className="mt-auto w-full bg-[#a8ff53] text-black font-semibold py-2.5 px-4 rounded-lg transition-colors hover:brightness-110">
              Open Dashboard
            </button>
            <button onClick={() => setShowApiScreen(false)} className="mt-3 w-full bg-transparent hover:bg-[#333] text-gray-300 font-medium py-2 px-4 rounded-lg transition-colors text-sm">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Custom Header ──────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center w-full px-4 py-3 sticky top-0 bg-[#212121] z-50 border-b border-[#333]">
        <div className="flex items-center gap-3">
          <img src="extrahand.png" alt="Extra Hand Logo" className="w-8 h-8 object-cover aspect-square rounded-lg" />
          <h1 className="text-base font-semibold tracking-wide text-white">Extra Hand</h1>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <button onClick={() => window.open('http://localhost:3000/dashboard', '_blank')} className="cursor-pointer hover:text-white transition-colors flex items-center" title="Settings">
            <Settings size={22} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Chat Area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 relative pb-16" id="chat-container">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-16">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#3a3a3a]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="text-[13px] text-[#5a5a5a]">Type a command to get started</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'user') return (
            <div key={msg.id} className="w-full flex justify-end mt-2">
              <div className="flex flex-col items-end gap-1.5 max-w-[85%]">
                {msg.attachments?.map((att, i) => <AttachmentCard key={i} attachment={att} />)}
                {msg.content && (
                  <div style={{ background: '#3a3a3a', color: '#fff', fontSize: '15px', fontWeight: 500, lineHeight: '1.5', padding: '12px 16px', borderRadius: '16px', textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </div>
                )}
              </div>
            </div>
          );

          if (msg.role === 'agent') return (
            <div key={msg.id} className="flex items-start gap-3 mt-2">
              <div className="w-7 h-7 rounded-full bg-[#151515] border border-[#2a2a2a] flex-shrink-0 flex items-center justify-center mt-0.5 shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a8ff53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 1.1-.9 2-2 2a2 2 0 0 1-2-2 2 2 0 0 1 2-2z"/><path d="M4.5 12h15"/><path d="M12 6v16"/></svg>
              </div>
              <div className="flex flex-col items-start gap-2 max-w-[88%]">
                {msg.thinking && <ThinkingBlock thinking={msg.thinking} />}
                {(msg.content || msg.isStreaming) && (
                  <div className="text-[#e0e0e0] text-[14px] leading-relaxed whitespace-pre-wrap mt-1">
                    {msg.content}
                    {msg.isStreaming && <span className="inline-block w-[4px] h-[14px] bg-[#a8ff53] rounded-sm ml-1.5 animate-pulse align-middle" />}
                  </div>
                )}
              </div>
            </div>
          );

          if (msg.role === 'action') return <div key={msg.id}><ActionBubble actionName={msg.actionName} payload={msg.payload} /></div>;

          if (msg.role === 'error') return (
            <div key={msg.id} className="flex items-start gap-3 bg-[#303030] rounded-xl px-4 py-4 max-w-[94%] border border-[#3a3a3a] mt-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a0a0a0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
              <p className="text-[15px] font-bold text-white leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          );

          if (msg.role === 'consent') return (
            <ConsentCard key={msg.id} reason={msg.reason} payload={msg.payload} resolved={(msg as any).resolved}
              onApprove={() => handleConsent(msg.id, true)} onDeny={() => handleConsent(msg.id, false)} />
          );

          return null;
        })}
        <div ref={chatEndRef} />
      </div>

      {/* ── Fixed Footer Input ─────────────────────────────────────────────────── */}
      <div className="bg-[#292929] border border-[#a10000] rounded-xl m-3 p-3 flex flex-col gap-2 relative z-40 shadow-lg">
        {/* Pending attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1 bg-[#333] rounded-lg px-2 py-1">
                <FileText size={10} className="text-gray-300 flex-shrink-0" />
                <span className="text-[11px] text-gray-200 truncate max-w-[80px]">{att.name}</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  className="text-[#888] hover:text-white ml-0.5 text-[14px] leading-none">&times;</button>
              </div>
            ))}
          </div>
        )}

        <textarea 
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none text-sm text-white resize-none focus:ring-0 p-0 placeholder:text-gray-500 min-h-[40px] focus:outline-none" 
          placeholder="Type a command..." 
          rows={2}
          style={{ maxHeight: '160px' }}
        />
          
        {/* Hidden File Input for Attachments */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
        
        <div className="flex justify-between items-center mt-2 text-gray-400">
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1 cursor-pointer hover:text-white">
              <div className="w-2 h-2 rounded-full bg-[#a10000]"></div> Agent
            </div>
            <div className="flex items-center gap-1 cursor-pointer hover:text-white">
              <ModelDropdown selected={selectedModel} onChange={setSelectedModel} />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={() => fileInputRef.current?.click()} id="attach-btn" className="hover:text-white transition-colors flex items-center">
              <Paperclip size={18} />
            </button>
            <button id="more-options-btn" className="hover:text-white transition-colors flex items-center" onClick={() => {
              chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (response) => {
                if (response && response.dataUrl) {
                  setAttachments(prev => [...prev, { name: 'screenshot.png', mimeType: 'image/png', dataUrl: response.dataUrl }]);
                }
              });
            }} title="Capture page">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
              </svg>
            </button>
            {agentRunning ? (
              <button onClick={handleStop} id="stop-btn" className="bg-[#444] hover:bg-[#555] text-white p-1.5 rounded-full transition-colors flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-white rounded-[2px] m-0.5" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0} id="send-btn" className="bg-[#444] hover:bg-[#555] disabled:opacity-50 text-white p-1.5 rounded-full transition-colors flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5 mt-0.5">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
