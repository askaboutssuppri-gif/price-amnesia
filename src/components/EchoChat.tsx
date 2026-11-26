import React, { useEffect, useRef, useState } from 'react';
import Orb from './Orb';
import type { ItemStats, Receipt } from '../lib/store';
import { answerQuestion } from '../lib/brain';
import { askCloud, buildContext } from '../lib/echoAi';
import type { Account } from '../lib/bank';
import { bankContextLine } from '../lib/plaid';
import { habitContextLine } from '../lib/habits';

interface Msg { who: 'you' | 'echo'; text: string }

const CHAT_KEY = 'priceamnesia:chat';

function loadChat(): Msg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch { /* fresh */ }
  return [{ who: 'echo', text: "I'm Echo — ask me what anything cost, what dropped, or where to stock up. I answer from your own receipts. 🧠" }];
}

export default function EchoChat({ stats, receipts, accounts, onClose }: {
  stats: ItemStats[]; receipts: Receipt[]; accounts: Account[]; onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(loadChat);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const context = buildContext(stats) + (bankContextLine(accounts) ? `\n${bankContextLine(accounts)}` : '')
    + (habitContextLine({ receipts, entries: [], stats, bills: [], accounts, ledger: [], budgets: {} }) ? `\n${habitContextLine({ receipts, entries: [], stats, bills: [], accounts, ledger: [], budgets: {} })}` : '');

  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-40))); } catch { /* full */ }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    setMsgs(m => [...m, { who: 'you', text }]);
    setThinking(true);

    // Data-shaped questions are answered on-device instantly and exactly.
    const local = answerQuestion(text, stats, receipts);
    const isFallback = local.startsWith("I couldn't match") || local.startsWith("I don't have any prices");
    let reply = local;
    if (isFallback) {
      const cloud = await askCloud(text, context);
      if (cloud) reply = cloud;
    }
    // Small human-feeling pause so Echo feels alive, not instant-machinery.
    setTimeout(() => {
      setMsgs(m => [...m, { who: 'echo', text: reply }]);
      setThinking(false);
    }, isFallback ? 150 : 550);
  };

  const quickAsk = (q: string) => { setInput(q); };

  return (
    <div className="overlay">
      <div className="overlay-inner chat-inner">
        <div className="overlay-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Orb size={44} mood={thinking ? 'alert' : 'happy'} />
            <div>
              <div className="overlay-title" style={{ fontSize: 20 }}>Talk to Echo</div>
              <div className="small-note">{thinking ? 'Echo is thinking…' : 'Echo remembers everything'}</div>
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`chat-row ${m.who}`}>
              {m.who === 'echo' && <span className="chat-ava">🔮</span>}
              <div className={`chat-bubble ${m.who}`}>{m.text}</div>
            </div>
          ))}
          {thinking && (
            <div className="chat-row echo">
              <span className="chat-ava">🔮</span>
              <div className="chat-bubble echo typing"><span /><span /><span /></div>
            </div>
          )}
        </div>

        {stats.length > 0 && (
          <div className="chat-chips">
            <button onClick={() => quickAsk('What dropped?')}>What dropped?</button>
            <button onClick={() => quickAsk('What went up?')}>What went up?</button>
            <button onClick={() => quickAsk('How much have I spent?')}>Total spent?</button>
          </div>
        )}
        <div className="chat-bar">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Ask Echo… e.g. what did eggs cost?"
          />
          <button className="chat-send" onClick={send} disabled={thinking || !input.trim()}>➤</button>
        </div>
      </div>
    </div>
  );
}
