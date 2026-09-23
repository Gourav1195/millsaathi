'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Button, Field, Input, Textarea } from './ui';
import { api, json } from '../lib/api';
import { useSession } from '../lib/session';

type AssistantTab = 'ai' | 'human';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  citations?: { label: string; detail: string }[];
  provenance?: string;
};

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3C7.03 3 3 6.58 3 11c0 2.02.9 3.85 2.36 5.2L4 21l4.2-1.1c1.12.31 2.31.48 3.55.48 4.97 0 9-3.58 9-8s-4.03-8-9-8Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M8.5 10.5h7M8.5 13.5h4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 14-7-7 14-2-5-5-2Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

export function HelpAssistant() {
  const { session } = useSession();
  const pathname = usePathname();
  const chatRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AssistantTab>('ai');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi — I can review current stock, posted production, documents, and a historical-average forecast. I never make changes to your mill data.',
    },
  ]);
  const [aiMessage, setAiMessage] = useState('');
  const [humanMessage, setHumanMessage] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, tab, open]);

  if (!session) return null;

  const page = pathname.replace(/^\/app\/?/, '') || 'dashboard';

  function openWidget() {
    setOpen(true);
    setSent(false);
    setError(null);
  }

  function closeWidget() {
    setOpen(false);
  }

  async function askAi(event: FormEvent) {
    event.preventDefault();
    const message = aiMessage.trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    setAiMessage('');
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text: message }]);
    try {
      const reply = await api<{
        answer: string;
        citations?: { label: string; detail: string }[];
        provider?: string;
        capability?: string;
      }>('/api/assistant/chat', json('POST', { message }));
      const provenance =
        reply.provider === 'tool'
          ? `Verified ${reply.capability || 'read-only'} calculation`
          : reply.provider === 'gemini'
            ? 'Gemini explanation; verify important decisions against the cited records.'
            : 'Local read-only guidance';
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: reply.answer,
          citations: reply.citations,
          provenance,
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The assistant could not answer right now.');
    } finally {
      setBusy(false);
    }
  }

  async function sendHuman(event: FormEvent) {
    event.preventDefault();
    const message = humanMessage.trim();
    if (message.length < 5) {
      setError('Please write a little more detail.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/feedback', json('POST', { kind: 'help', message, contact: contact || null, page }));
      setSent(true);
      setHumanMessage('');
      setContact('');
      closeWidget();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your support request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`help-widget${open ? ' open' : ''}`}>
      <div
        className="assistant-panel"
        role="dialog"
        aria-label="MillSaathi AI Assistant"
        aria-hidden={!open}
      >
        <header className="assistant-panel-head">
          <div className="assistant-avatar" aria-hidden="true">MS</div>
          <div className="assistant-panel-title">
            <strong>MillSaathi AI</strong>
            <span className="assistant-status">
              <span className="assistant-status-dot" />
              Read-only · your mill data
            </span>
          </div>
          <button
            type="button"
            className="assistant-minimize ms-focus-ring"
            aria-label="Minimize assistant"
            onClick={closeWidget}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="assistant-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ai'}
            className={tab === 'ai' ? 'on' : ''}
            onClick={() => setTab('ai')}
          >
            AI assistant
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'human'}
            className={tab === 'human' ? 'on' : ''}
            onClick={() => setTab('human')}
          >
            Human support
          </button>
        </div>

        <div className="assistant-body">
          {tab === 'ai' ? (
            <>
              <div ref={chatRef} className="assistant-chat" aria-live="polite">
                {messages.map((message) => (
                  <div key={message.id} className={`assistant-message${message.role === 'user' ? ' user' : ''}`}>
                    <div>{message.text}</div>
                    {message.citations?.length ? (
                      <div className="assistant-sources">
                        <b>Sources</b>
                        <ul>
                          {message.citations.map((citation) => (
                            <li key={`${citation.label}-${citation.detail}`}>
                              <strong>{citation.label}</strong>
                              <span>{citation.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {message.provenance ? <small>{message.provenance}</small> : null}
                  </div>
                ))}
                {busy ? <div className="assistant-typing">Thinking…</div> : null}
              </div>
              <form className="assistant-compose" onSubmit={askAi}>
                <Textarea
                  name="message"
                  maxLength={2000}
                  rows={1}
                  placeholder="Ask about stock, production, or forecasts…"
                  value={aiMessage}
                  onChange={(event) => setAiMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="assistant-send ms-focus-ring"
                  disabled={busy || !aiMessage.trim()}
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              </form>
              {error ? <p className="assistant-error">{error}</p> : null}
            </>
          ) : (
            <form className="assistant-human" onSubmit={sendHuman}>
              {sent ? <p className="muted">Your support request was sent.</p> : null}
              <Field label="What do you need help with?">
                <Textarea
                  required
                  placeholder="Tell us what is stuck or confusing."
                  value={humanMessage}
                  onChange={(event) => setHumanMessage(event.target.value)}
                />
              </Field>
              <Field label="Phone or WhatsApp (optional)">
                <Input
                  placeholder="So we can reply if needed"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                />
              </Field>
              {error ? <p className="assistant-error">{error}</p> : null}
              <Button type="submit" disabled={busy} className="assistant-human-submit">
                {busy ? 'Sending…' : 'Send to support'}
              </Button>
            </form>
          )}
        </div>
      </div>

      <button
        type="button"
        className="help-fab ms-focus-ring"
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        onClick={() => (open ? closeWidget() : openWidget())}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  );
}
