import React, { useEffect, useMemo, useRef, useState } from 'react';
import Orb from './components/Orb';
import { Sparkline, TrendChart } from './components/Charts';
import {
  PriceEntry, Receipt, ItemStats,
  loadReceipts, loadEntries, saveAll, itemStats, normalizeName,
  money, todayStr, prettyDate, uid, compressImage, isPlusLocal, setPlusLocal,
  Prefs, TrashSnapshot, ThemeName, loadPrefs, savePrefs,
  saveTrash, loadTrash, clearTrash, backupJSON, parseBackup, storageKB,
  RECEIPT_CATS, detectCategory, receiptCatOf, catMeta,
} from './lib/store';
import { extractReceipt, orbLine } from './lib/ai';
import { storeBattle, atTheirLow, smartBasket, cheapestEver } from './lib/deals';
import { buildInsights, buildAlerts, itemCommentary, checkTip, timeGreeting, TAP_LINES } from './lib/brain';
import { askCloud, buildDealsContext, BRIEFING_QUESTION, ANALYST_QUESTION, localBriefing, localAnalyst, buildWellnessContext, READING_QUESTION, missionQuestion, reflectQuestion, coachQuestion, COACH_CHIPS, localReading, localReflection, localMission } from './lib/echoAi';
import { priceHealth, monthPulse, winsWall, loadMoods, addMood, loadIntention, saveIntention, Mood, MoodEntry } from './lib/wellness';
import { BillRecord, BillType, BillLine, BILL_ICONS, loadBills, saveBills, analyzeBill, daysUntil, dueLabel, changeVsPrev } from './lib/bills';
import { WISDOM, JOKES, dailyPick, randomPick } from './lib/wisdom';
import { Filesystem as CapFilesystem, Directory as CapDirectory, Encoding as CapEncoding } from '@capacitor/filesystem';
import { Share as CapShare } from '@capacitor/share';
import { Geolocation as CapGeolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser as CapBrowser } from '@capacitor/browser';
import AuthModal from './components/AuthModal';
import { supabase, getCurrentUser, handleAuthCallback, signOut, deleteAccount, type User } from './lib/supabase';
import {
  getPlusStatus, getPlusPackagesDetailed, purchasePlusPackage, restorePlusPurchases,
  isMonthlyPackage, isAnnualPackage, isRevenueCatKeySet, openManageSubscriptions,
  PLUS_MONTHLY_PRICE, PLUS_YEARLY_PRICE, type PlusStatus, type PurchasesPackage,
} from './lib/subscription';

/* Store wording follows the platform: App Store on iOS, Play Store on Android. */
const IS_IOS = Capacitor.getPlatform() === 'ios';
import { Topic, ResolveCat, TOPICS, CATS, topicById, billTopicFor, mapsUrl, officialSearchUrl } from './lib/resolve';
import { Account, AccountKind, LedgerEntry, KIND_ICONS, loadAccounts, saveAccounts, loadLedger, saveLedger, moneyPicture, localBankSuggestions, linkedLiquid, primaryLinked } from './lib/bank';
import { openBankLink, fetchPlaidAccounts, plaidWasLinked, hidePlaidAccount, bankContextLine, freshLabel, groupLinkedBanks, unlinkBank, openBankUpdate, unhidePlaidAccounts, LinkedBank, BankTransaction, loadTransactions, saveTransactions, syncBankData, matchReceipts, unmatchedTransactions, monthOutflow } from './lib/plaid';
import { BudgetRow, BUDGET_CATS, loadBudgets, saveBudgets, budgetRows, daysLeftInMonth, localBudgetAdvice } from './lib/budget';
import { habitAdvice, habitContextLine } from './lib/habits';
import { oneMove, okLine, journey } from './lib/calm';
import EchoChat from './components/EchoChat';

type Tab = 'home' | 'items' | 'receipts' | 'check' | 'settings';

/* Camera-return safety net: if Android kills/reloads the WebView while the
   camera app is open, a fresh mount can land back in Add Receipt instead of Home. */
const PENDING_SCAN_KEY = 'priceamnesia:pendingScan';
const markPendingScan = () => { try { sessionStorage.setItem(PENDING_SCAN_KEY, String(Date.now())); } catch { /* noop */ } };
const clearPendingScan = () => { try { sessionStorage.removeItem(PENDING_SCAN_KEY); } catch { /* noop */ } };
const HIDDEN_INPUT_STYLE: React.CSSProperties = { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' };

/* ---------------- shared bits ---------------- */

const BG_STARS = Array.from({ length: 34 }, (_, i) => {
  const rnd = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  return { left: `${(rnd(i + 1) * 100).toFixed(1)}%`, top: `${(rnd(i + 40) * 100).toFixed(1)}%`, size: 1.5 + rnd(i + 80) * 2, delay: `${(rnd(i + 120) * 3).toFixed(1)}s` };
});

function Background() {
  return (
    <div className="bg" aria-hidden="true">
      <div className="bg-blob bg-blob-a" />
      <div className="bg-blob bg-blob-b" />
      <div className="bg-blob bg-blob-c" />
      <div className="bg-grid" />
      {BG_STARS.map((s, i) => <span key={i} className="bg-star" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />)}
      <div className="bg-comet" />
      <span className="bg-star" style={{ top: '8%', left: '14%' }} />
      <span className="bg-star" style={{ top: '16%', left: '78%', animationDelay: '0.8s' }} />
      <span className="bg-star" style={{ top: '30%', left: '38%', animationDelay: '1.6s' }} />
      <span className="bg-star" style={{ top: '12%', left: '55%', animationDelay: '2.2s' }} />
      <span className="bg-star" style={{ top: '42%', left: '88%', animationDelay: '0.4s' }} />
      <span className="bg-mote" style={{ left: '12%', animationDelay: '0s' }} />
      <span className="bg-mote" style={{ left: '32%', animationDelay: '3.5s', background: '#8b7cff' }} />
      <span className="bg-mote" style={{ left: '58%', animationDelay: '7s' }} />
      <span className="bg-mote" style={{ left: '76%', animationDelay: '1.8s', background: '#ffd166' }} />
      <span className="bg-mote" style={{ left: '90%', animationDelay: '5.4s', background: '#ff5d8f' }} />
    </div>
  );
}

function TrendTag({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="trend flat">first sighting</span>;
  if (Math.abs(pct) < 0.5) return <span className="trend flat">→ steady</span>;
  if (pct < 0) return <span className="trend down">▼ {Math.abs(pct).toFixed(0)}% vs last</span>;
  return <span className="trend up">▲ {pct.toFixed(0)}% vs last</span>;
}

const shortEmail = (email: string | undefined): string => {
  if (!email) return 'Account';
  const name = email.split('@')[0];
  return name.length > 12 ? name.slice(0, 11) + '…' : name;
};

function TopBar({ plus, onPlus, user, onAccount }: { plus: boolean; onPlus: () => void; user: User | null; onAccount: () => void }) {
  return (
    <div className="topbar">
      <div className="logo-wrap">
        <div className="logo"><span className="logo-a">Price</span> <span className="logo-b">Amnesia</span></div>
      </div>
      <div className="topbar-pills">
        <button className="plus-chip account-chip" onClick={onAccount}>{user ? `👤 ${shortEmail(user.email)}` : '👤 Sign in'}</button>
        <button className="plus-chip" onClick={onPlus}>{plus ? '👑 Plus ON' : '👑 Go Plus'}</button>
      </div>
    </div>
  );
}

/* ---------------- Home ---------------- */

function Home({ receipts, stats, entries, bills, accounts, ledger, plus, prefs, user, onAccount, onDeals, onBriefing, onWellness, onBills, onResolve, onBank, onScan, onUpload, onOpenItem, onPlus, onType, onTalk, onPrices, onReceipts, onCheck, onMore }: {
  receipts: Receipt[]; stats: ItemStats[]; entries: PriceEntry[]; bills: BillRecord[]; accounts: Account[]; ledger: LedgerEntry[]; plus: boolean; prefs: Prefs;
  user: User | null; onAccount: () => void;
  onDeals: () => void; onBriefing: () => void; onWellness: () => void; onBills: () => void; onResolve: () => void; onBank: () => void;
  onScan: () => void; onUpload: () => void;
  onOpenItem: (n: string) => void; onPlus: () => void;
  onType: () => void; onTalk: () => void;
  onPrices: () => void; onReceipts: () => void; onCheck: () => void; onMore: () => void;
}) {
  const [tapCount, setTapCount] = useState(0);
  const [tapLine, setTapLine] = useState<string | null>(null);
  const [sparkMode, setSparkMode] = useState<'wisdom' | 'joke'>('wisdom');
  const [spark, setSpark] = useState<string>(() => dailyPick(WISDOM, 3));
  const tapEcho = () => {
    setTapLine(TAP_LINES[Math.floor(Math.random() * TAP_LINES.length)]);
    setTapCount(c => c + 1);
  };
  const drops = stats.filter(s => s.trendPct !== null && s.trendPct < 0).sort((a, b) => (a.trendPct! - b.trendPct!)).slice(0, 3);
  const rises = stats.filter(s => s.trendPct !== null && s.trendPct > 0).sort((a, b) => (b.trendPct! - a.trendPct!)).slice(0, 3);
  const movers = [...drops.map(d => ({ ...d, kind: 'drop' as const })), ...rises.map(r => ({ ...r, kind: 'rise' as const }))];
  const maxAbs = Math.max(10, ...movers.map(m => Math.abs(m.trendPct || 0)));
  const savedEst = stats.reduce((sum, s) => sum + Math.max(0, (s.avg - s.lastPrice)) * 1, 0);
  const topDrop = drops[0] ? { name: drops[0].displayName, pct: drops[0].trendPct! } : undefined;
  const topRise = rises[0] ? { name: rises[0].displayName, pct: rises[0].trendPct! } : undefined;
  const mood = topDrop ? 'happy' : topRise && topRise.pct >= 12 ? 'alert' : 'calm';
  const recent = stats.slice(0, 5);
  const calmInp = { receipts, entries, stats, bills, accounts, ledger, budgets: loadBudgets() };
  const move = oneMove(calmInp);
  const ok = okLine(calmInp);
  const jn = journey(calmInp);
  const moveGo = () => {
    switch (move.target) {
      case 'bills': onBills(); break;
      case 'bank': onBank(); break;
      case 'scan': onScan(); break;
      case 'wellness': onWellness(); break;
      case 'briefing': onBriefing(); break;
      default: onDeals();
    }
  };

  /* Bubble Space (v1.21) — the app's rooms float as labeled bubbles in a
     calm patch of space. Tapping one swells it open into its page. This
     replaces the six-tile grid that made the front feel crowded and
     technical; every destination is unchanged, only the doorway changed. */
  const [expanding, setExpanding] = useState<string | null>(null);
  const stars = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    x: `${(i * 37.7 + 5) % 96}%`, y: `${(i * 53.3 + 3) % 96}%`, r: 2 + (i % 3), d: `${(i % 7) * 0.55}s`,
  })), []);
  const bubbles = [
    { id: 'scan', icon: '📸', label: 'Scan', sub: 'Snap or upload a receipt', size: 134, x: 'calc(50% - 127px)', y: 6, dur: '8.8s', tint: 'rgba(34,255,224,0.55)', go: onScan },
    { id: 'deals', icon: '🛒', label: 'Deals', sub: stats.some(s => s.count >= 2) ? `${atTheirLow(stats).length} at their all-time low` : 'Cheapest prices & stock-up signals', size: 106, x: 'calc(50% + 21px)', y: 22, dur: '7.5s', tint: 'rgba(34,255,224,0.45)', go: onDeals },
    { id: 'talk', icon: '💬', label: 'Echo', sub: 'Ask Echo anything', size: 93, x: 'calc(50% - 104.5px)', y: 160, dur: '7.7s', tint: 'rgba(139,124,255,0.45)', go: onTalk },
    { id: 'bills', icon: '📄', label: 'Bills', sub: (() => { const next = bills.filter(b => b.dueDate).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0]; return bills.length ? (next ? `Next: ${next.biller}` : `${bills.length} watched`) : 'Snap a bill — never miss one'; })(), size: 102, x: 'calc(50% + 2.5px)', y: 171, dur: '7.9s', tint: 'rgba(255,209,102,0.45)', go: onBills },
    { id: 'bank', icon: '🏦', label: 'Bank', sub: (() => { if (!accounts.length) return 'Accounts, budgets & goals'; const p = primaryLinked(accounts); return p ? `${p.institution || 'Bank'} linked · ${freshLabel() || 'auto-updates'}` : `Net ${money(moneyPicture(accounts, bills, receipts, ledger).net)}`; })(), size: 117, x: 'calc(50% - 113.5px)', y: 288, dur: '8.2s', tint: 'rgba(139,124,255,0.50)', go: onBank },
    { id: 'prices', icon: '🏷️', label: 'Prices', sub: stats.length ? `${stats.length} items tracked` : 'Everything you track', size: 96, x: 'calc(50% + 17.5px)', y: 301, dur: '8.4s', tint: 'rgba(34,255,224,0.40)', go: onPrices },
    { id: 'wellness', icon: '🌿', label: 'Wellness', sub: stats.length ? `Health ${priceHealth(stats, entries, receipts).score}/100` : 'Coaching & your health score', size: 93, x: 'calc(50% - 100.5px)', y: 435, dur: '8.6s', tint: 'rgba(45,255,179,0.40)', go: onWellness },
    { id: 'receipts', icon: '🧾', label: 'Receipts', sub: receipts.length ? `${receipts.length} saved` : 'All your receipts', size: 94, x: 'calc(50% + 6.5px)', y: 426, dur: '7.4s', tint: 'rgba(255,209,102,0.40)', go: onReceipts },
    { id: 'check', icon: '🔍', label: 'Check', sub: 'Is this price good?', size: 98, x: 'calc(50% - 100px)', y: 555, dur: '8.1s', tint: 'rgba(34,255,224,0.40)', go: onCheck },
    { id: 'briefing', icon: '🧠', label: 'Briefing', sub: 'Your prices, analyzed for you', size: 88, x: 'calc(50% + 12px)', y: 563, dur: '9.1s', tint: 'rgba(139,124,255,0.35)', go: onBriefing },
    { id: 'resolve', icon: '🛟', label: 'Help & Fixes', sub: 'Wrong bill or price? Fight plans', size: 94, x: 'calc(50% - 142px)', y: 685, dur: '7.2s', tint: 'rgba(255,209,102,0.35)', go: onResolve },
    { id: 'plus', icon: '👑', label: 'Plus', sub: plus ? 'Plus is on — thank you' : 'Unlock everything', size: 80, x: 'calc(50% - 34px)', y: 698, dur: '6.9s', tint: 'rgba(255,209,102,0.60)', go: onPlus },
    { id: 'more', icon: '⚙️', label: 'More', sub: 'Settings & extras', size: 82, x: 'calc(50% + 60px)', y: 690, dur: '7.8s', tint: 'rgba(139,124,255,0.35)', go: onMore },
  ];
  const openBubble = (b: { id: string; go: () => void }) => {
    if (expanding) return;
    setExpanding(b.id);
    if (b.id === 'scan') {
      // Scan must fire synchronously inside the real click gesture so the
      // Android WebView reliably launches the file chooser / camera.
      b.go();
      setTimeout(() => setExpanding(null), 350);
      return;
    }
    setTimeout(() => { b.go(); setExpanding(null); }, 320);
  };
  const bubbleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const bubbleDown = (b: { id: string }) => {
    const el = bubbleRefs.current[b.id]; if (el) el.style.scale = '1.07 0.93';
  };
  const bubbleClear = (b: { id: string }) => {
    const el = bubbleRefs.current[b.id]; if (el) el.style.scale = '';
  };

  return (
    <div className="screen home-space">
      <TopBar plus={plus} onPlus={onPlus} user={user} onAccount={onAccount} />
      <div className="orb-zone">
        <button onClick={tapEcho} aria-label="Tap Echo" style={{ borderRadius: '50%' }}>
          <span className="orb-bounce" key={tapCount} style={{ display: 'block' }}>
            <Orb size={150} mood={tapLine ? 'happy' : mood} />
          </span>
        </button>
        <div className="speech">
          {tapLine ? tapLine : `${timeGreeting()} — ${orbLine({ items: stats.length, receipts: receipts.length, topDrop, topRise })}`}
        </div>
        <button className="pill-btn gold" style={{ marginTop: 12 }} onClick={onTalk}>💬 Talk to Echo</button>
      </div>

      <p className="small-note section-gap" style={{ textAlign: 'center', fontWeight: 800 }}>🌌 Your whole app floats here — tap a bubble to open it</p>
      <div className="bubble-field" style={{ marginTop: 10 }}>
        {stars.map((s, i) => <span key={i} className="star" style={{ left: s.x, top: s.y, width: s.r, height: s.r, animationDelay: s.d }} />)}
        {bubbles.map(b => (
          <button key={b.id} ref={el => { bubbleRefs.current[b.id] = el; }} className={`bubble ${expanding === b.id ? 'bubble-open' : ''}`} style={{ left: b.x, top: b.y, width: b.size, height: b.size, animationDuration: b.dur, '--tint': b.tint } as React.CSSProperties}
            onPointerDown={() => bubbleDown(b)}
            onPointerUp={() => bubbleClear(b)} onPointerCancel={() => bubbleClear(b)} onPointerLeave={() => bubbleClear(b)}
            onClick={() => openBubble(b)} aria-label={b.label}>
            <span className="bubble-ico">{b.icon}</span>
            <span className="bubble-name">{b.label}</span>
            <span className="bubble-sub">{b.sub}</span>
          </button>
        ))}
      </div>

      <div className="card section-gap" style={move.tone === 'attention' ? { border: '1px solid rgba(255,209,102,0.5)' } : move.tone === 'celebrate' ? { border: '1px solid rgba(45,255,179,0.4)' } : undefined}>
        <div className="card-title" style={{ marginBottom: 6 }}>🧭 Am I OK?</div>
        <p style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.5 }}>{ok}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 30 }}>{move.icon}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 900, fontSize: 16.5 }}>{move.title}</span>
            <span className="small-note" style={{ display: 'block', marginTop: 3, lineHeight: 1.55 }}>{move.body}</span>
          </span>
        </div>
        <button className="big-btn" style={{ marginTop: 12 }} onClick={moveGo}>{move.cta}</button>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="small-note" style={{ fontWeight: 800 }}>🌱 Your Echo journey · {jn.doneCount} of {jn.steps.length}</span>
            {jn.next && <span className="small-note" style={{ textAlign: 'right' }}>Next: {jn.next.icon} {jn.next.label}</span>}
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
            {jn.steps.map((s, i) => <span key={i} style={{ flex: 1, height: 7, borderRadius: 99, background: s.done ? 'linear-gradient(90deg, var(--cyan), var(--violet))' : 'rgba(255,255,255,0.1)' }} />)}
          </div>
        </div>
      </div>

      {stats.length >= 2 && (
        <div className="ticker-wrap" aria-hidden="true">
          <div className="ticker">
            {[...stats, ...stats].map((s, i) => (
              <span className="ticker-item" key={i}>
                {s.displayName} <strong>{money(s.lastPrice)}</strong>
                <span style={{ color: s.trendPct === null ? 'var(--faint)' : s.trendPct < 0 ? 'var(--drop)' : s.trendPct > 0 ? 'var(--rise)' : 'var(--faint)' }}>
                  {s.trendPct === null ? ' • new' : s.trendPct < 0 ? ` ▼${Math.abs(s.trendPct).toFixed(0)}%` : s.trendPct > 0 ? ` ▲${s.trendPct.toFixed(0)}%` : ' →'}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="scan-zone">
        <button className="scan-btn" onClick={onScan} aria-label="Snap a receipt">
          <span className="scan-ring" />
          <span className="scan-ring scan-ring2" />
          <span className="scan-btn-core" />
          <span className="scan-beam" />
          <span className="scan-btn-label">Snap<br />Receipt</span>
          <span className="scan-btn-sub">Tap to scan</span>
        </button>
        <div className="upload-row">
          <button className="pill-btn" onClick={onUpload}>📁 Upload photo</button>
          <button className="pill-btn gold" onClick={onType}>✍️ Type it in</button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-cell"><div className="stat-num solid">{receipts.length}</div><div className="stat-lbl">Receipts</div></div>
        <div className="stat-cell"><div className="stat-num solid">{stats.length}</div><div className="stat-lbl">Items tracked</div></div>
        <div className="stat-cell"><div className="stat-num">{money(savedEst)}</div><div className="stat-lbl">Under your avg</div></div>
      </div>

      {prefs.echoCards && (() => { const ins = buildInsights(stats, receipts); return ins.length > 0 ? (
        <div className="card section-gap insight-card">
          <div className="card-title">🔮 Echo's insights</div>
          {ins.map((t, i) => <p className="insight-line" key={i}>{t}</p>)}
        </div>
      ) : null; })()}

      {prefs.echoCards && (() => { const als = buildAlerts(stats, prefs.alertPct); return als.length > 0 ? (
        <div className="card section-gap">
          <div className="card-title">🚨 Echo's alerts</div>
          {als.map((a, i) => (
            <div className="alert-line" key={i}>
              <span>{a.kind === 'stockup' ? '🛒' : '🧨'}</span>
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      ) : null; })()}

      <div className="card section-gap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="card-title" style={{ margin: 0 }}>✨ Echo's daily spark</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`chip-btn ${sparkMode === 'wisdom' ? 'chip-on' : ''}`} onClick={() => { setSparkMode('wisdom'); setSpark(dailyPick(WISDOM, 3)); }}>💡 Wisdom</button>
            <button className={`chip-btn ${sparkMode === 'joke' ? 'chip-on' : ''}`} onClick={() => { setSparkMode('joke'); setSpark(dailyPick(JOKES, 7)); }}>😂 Joke</button>
          </div>
        </div>
        <p style={{ lineHeight: 1.65, fontSize: 15, marginTop: 10 }}>{spark}</p>
        <button className="pill-btn" style={{ marginTop: 10 }} onClick={() => setSpark(randomPick(sparkMode === 'wisdom' ? WISDOM : JOKES, spark))}>
          {sparkMode === 'wisdom' ? 'Another note ↻' : 'Another one 😂'}
        </button>
      </div>

      {movers.length > 0 && (
        <div className="card section-gap">
          <div className="card-title">⚡ Biggest movers</div>
          {movers.map(m => (
            <div className="mover" key={m.normalized + m.kind}>
              <div className="mover-name">{m.displayName}</div>
              <div className="mover-bar-wrap"><div className={`mover-bar ${m.kind}`} style={{ width: `${Math.max(8, (Math.abs(m.trendPct || 0) / maxAbs) * 100)}%` }} /></div>
              <div className="mover-pct" style={{ color: m.kind === 'drop' ? 'var(--drop)' : 'var(--rise)' }}>
                {m.kind === 'drop' ? '▼' : '▲'} {Math.abs(m.trendPct || 0).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card section-gap">
        <div className="card-title">🕒 Recent prices</div>
        {recent.length === 0 && <div className="empty"><span className="big-emoji">🧾</span>No prices remembered yet.<br />Snap your first receipt and I'll never let you forget what things cost.</div>}
        {recent.map(s => (
          <button className="item-row" key={s.normalized} onClick={() => onOpenItem(s.normalized)}>
            <div className="item-main">
              <div className="item-name">{s.displayName}</div>
              <div className="item-meta">{s.lastStore} · {prettyDate(s.lastDate)} · seen {s.count}×</div>
            </div>
            <Sparkline history={s.history} />
            <div className="item-price">
              <div className="item-price-num">{money(s.lastPrice)}</div>
              <TrendTag pct={s.trendPct} />
            </div>
          </button>
        ))}
      </div>

      {/* Bottom breathing room (v1.28.4): the last row must clear the floating
          tab bar with air to spare — never end flush under it. */}
      <div className="home-end" aria-hidden="true" />
    </div>
  );
}

/* ---------------- Items + detail ---------------- */

function Items({ stats, onOpenItem }: { stats: ItemStats[]; onOpenItem: (n: string) => void }) {
  const [q, setQ] = useState('');
  const filtered = stats.filter(s => s.normalized.includes(normalizeName(q)) || s.displayName.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="screen">
      <h2 className="display" style={{ fontSize: 26, margin: '8px 0 14px' }}>Your price memory</h2>
      <input className="search-input" placeholder="Search eggs, milk, coffee…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="card">
        {filtered.length === 0 && <div className="empty"><span className="big-emoji">🔍</span>{stats.length === 0 ? 'Nothing tracked yet — snap a receipt first.' : 'No item matches that search.'}</div>}
        {filtered.map(s => (
          <button className="item-row" key={s.normalized} onClick={() => onOpenItem(s.normalized)}>
            <div className="item-main">
              <div className="item-name">{s.displayName}</div>
              <div className="item-meta">avg {money(s.avg)} · low {money(s.low)} · seen {s.count}×</div>
            </div>
            <Sparkline history={s.history} />
            <div className="item-price">
              <div className="item-price-num">{money(s.lastPrice)}</div>
              <TrendTag pct={s.trendPct} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemDetail({ item, onClose }: { item: ItemStats; onClose: () => void }) {
  const [dive, setDive] = useState<{ text: string; source: 'cloud' | 'local' } | null>(null);
  const [diving, setDiving] = useState(false);
  const runDive = async () => {
    setDiving(true);
    const ctx = `${item.displayName} sightings (oldest to newest): ` +
      item.history.map(h => `${h.date} ${money(h.price)} at ${h.store}`).join('; ') +
      `. Average ${money(item.avg)}, lowest ${money(item.low)}, highest ${money(item.high)}, last ${money(item.lastPrice)} at ${item.lastStore}.`;
    const q = `Give me your deep dive on ${item.displayName}: is now a good time to buy it, where should I get it, and what should I watch for? Use only the history in the context.`;
    const cloud = await askCloud(q, ctx);
    setDive(cloud ? { text: cloud, source: 'cloud' } : { text: itemCommentary(item), source: 'local' });
    setDiving(false);
  };
  const stores = useMemo(() => {
    const m = new Map<string, PriceEntry[]>();
    for (const h of item.history) { const l = m.get(h.store) || []; l.push(h); m.set(h.store, l); }
    return [...m.entries()].map(([store, list]) => ({ store, avg: list.reduce((a, b) => a + b.price, 0) / list.length, last: list[list.length - 1] })).sort((a, b) => a.avg - b.avg);
  }, [item]);
  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div className="overlay-title" style={{ textTransform: 'capitalize' }}>{item.displayName}</div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="card">
          <div className="card-title">Price trend</div>
          <TrendChart history={item.history} />
          <div className="detail-stats">
            <div className="detail-stat"><div className="n">{money(item.lastPrice)}</div><div className="l">Last</div></div>
            <div className="detail-stat"><div className="n">{money(item.avg)}</div><div className="l">Average</div></div>
            <div className="detail-stat"><div className="n">{money(item.low)}</div><div className="l">Lowest</div></div>
            <div className="detail-stat"><div className="n">{money(item.high)}</div><div className="l">Highest</div></div>
          </div>
          <p className="small-note" style={{ marginTop: 12 }}>
            {item.vsAvgPct <= -5 ? `🎉 Your last price was ${Math.abs(item.vsAvgPct).toFixed(0)}% under your average — good buy.` :
             item.vsAvgPct >= 8 ? `⚠️ Your last price was ${item.vsAvgPct.toFixed(0)}% over your average.` :
             'Your last price was right around your average.'}
          </p>
        </div>
        <div className="card insight-card">
          <div className="card-title">🔮 Echo says</div>
          <p className="insight-line" style={{ borderBottom: 'none', paddingBottom: 0 }}>{itemCommentary(item)}</p>
        </div>
        <div className="card">
          <div className="card-title">🔬 AI deep dive</div>
          {!dive && !diving && (<>
            <p className="small-note">Echo's cloud brain studies every sighting of this item — timing, store strategy, and what to watch.</p>
            <button className="big-btn" style={{ marginTop: 10 }} onClick={runDive}>Deep-dive this item</button>
          </>)}
          {diving && <p className="small-note">Echo is studying every sighting…</p>}
          {dive && (<>
            <p style={{ lineHeight: 1.65, fontSize: 14.5 }}>{dive.text}</p>
            <p className="small-note" style={{ marginTop: 8 }}>{dive.source === 'cloud' ? '☁️ Echo\'s cloud brain' : '📱 Composed on-device — cloud unreachable'}</p>
          </>)}
        </div>
        {stores.length > 1 && (
          <div className="card">
            <div className="card-title">Store comparison</div>
            {stores.map(s => (
              <div className="history-row" key={s.store}><span>{s.store}</span><span>avg <strong>{money(s.avg)}</strong></span></div>
            ))}
          </div>
        )}
        <div className="card">
          <div className="card-title">Every sighting</div>
          {[...item.history].reverse().map(h => (
            <div className="history-row" key={h.id}>
              <span>{prettyDate(h.date)}<div className="h-store">{h.store}{h.quantity ? ` · qty ${h.quantity}` : ''}</div></span>
              <strong>{money(h.price)}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Receipts ---------------- */

function Receipts({ receipts, entries, onDelete }: { receipts: Receipt[]; entries: PriceEntry[]; onDelete: (id: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>('all');
  const present = RECEIPT_CATS.filter(c => receipts.some(r => receiptCatOf(r) === c.id));
  const sorted = [...receipts].filter(r => catFilter === 'all' || receiptCatOf(r) === catFilter).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="screen">
      <h2 className="display" style={{ fontSize: 26, margin: '8px 0 14px' }}>Receipts</h2>
      {present.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button className={`chip-btn ${catFilter === 'all' ? 'chip-on' : ''}`} onClick={() => setCatFilter('all')}>All types</button>
          {present.map(c => <button key={c.id} className={`chip-btn ${catFilter === c.id ? 'chip-on' : ''}`} onClick={() => setCatFilter(c.id)}>{c.icon} {c.label}</button>)}
        </div>
      )}
      {sorted.length === 0 && (
        <div className="card"><div className="empty"><span className="big-emoji">🧾</span>No receipts yet.<br />Tap the big scan button on Home to add your first one.</div></div>
      )}
      {sorted.map(r => {
        const lines = entries.filter(e => e.receiptId === r.id);
        const open = openId === r.id;
        return (
          <div className="card" key={r.id}>
            <button className="receipt-row" onClick={() => setOpenId(open ? null : r.id)}>
              <span className="receipt-head">
                {r.photo ? <img className="receipt-thumb" src={r.photo} alt="receipt" /> : <span className="receipt-thumb-ph">🧾</span>}
                <span>
                  <span className="receipt-store">{r.store}</span>
                  <div className="receipt-meta">{catMeta(receiptCatOf(r)).icon} {catMeta(receiptCatOf(r)).label} · {prettyDate(r.date)} · {r.itemCount} item{r.itemCount === 1 ? '' : 's'} · {r.source === 'scan' ? 'scanned' : 'typed in'}</div>
                </span>
                <span className="receipt-total">{money(r.total)}</span>
              </span>
            </button>
            {open && (
              <div style={{ marginTop: 10 }}>
                {lines.map(l => (
                  <div className="history-row" key={l.id}><span style={{ textTransform: 'capitalize' }}>{l.name}</span><strong>{money(l.price)}</strong></div>
                ))}
                {confirmId === r.id ? (
                  <button className="danger-btn" style={{ marginTop: 10 }} onClick={() => onDelete(r.id)}>Tap again to delete this receipt + its prices</button>
                ) : (
                  <button className="ghost-btn" style={{ marginTop: 10 }} onClick={() => setConfirmId(r.id)}>Delete receipt</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Check price ---------------- */

function Check({ stats, onOpenItem }: { stats: ItemStats[]; onOpenItem: (n: string) => void }) {
  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const match = useMemo(() => {
    const n = normalizeName(name);
    if (!n) return null;
    return stats.find(s => s.normalized === n) || stats.find(s => s.normalized.includes(n) || n.includes(s.normalized)) || null;
  }, [name, stats]);
  const price = parseFloat(priceStr);
  const hasPrice = !isNaN(price) && price > 0;
  let verdict: { cls: string; word: string; text: string; gauge: number } | null = null;
  if (match && hasPrice) {
    const vsAvg = ((price - match.avg) / match.avg) * 100;
    const lo = match.low * 0.85, hi = Math.max(match.high * 1.15, match.avg * 1.3);
    const gauge = Math.max(2, Math.min(98, ((price - lo) / (hi - lo)) * 100));
    if (price <= match.low * 1.02) verdict = { cls: 'good', word: 'Great price!', text: `That's at or under the lowest you've ever paid for ${match.displayName} (${money(match.low)}). Stock up if you can.`, gauge };
    else if (vsAvg <= -5) verdict = { cls: 'good', word: 'Good deal', text: `That's ${Math.abs(vsAvg).toFixed(0)}% under your average of ${money(match.avg)} for ${match.displayName}.`, gauge };
    else if (vsAvg >= 12) verdict = { cls: 'bad', word: 'Pricey', text: `That's ${vsAvg.toFixed(0)}% over your average of ${money(match.avg)}. Your lowest was ${money(match.low)} at ${match.history.find(h => h.price === match.low)?.store || 'another store'}.`, gauge };
    else verdict = { cls: 'ok', word: 'About normal', text: `Right around your average of ${money(match.avg)} for ${match.displayName}. Nothing special, nothing bad.`, gauge };
  }
  return (
    <div className="screen">
      <h2 className="display" style={{ fontSize: 26, margin: '8px 0 14px' }}>Is this a good price?</h2>
      <div className="card">
        <div className="field">
          <label>Item</label>
          <input placeholder="e.g. eggs" value={name} onChange={e => setName(e.target.value)} list="pa-items" />
          <datalist id="pa-items">{stats.map(s => <option key={s.normalized} value={s.displayName} />)}</datalist>
        </div>
        <div className="field">
          <label>Price you see today ($)</label>
          <input placeholder="0.00" inputMode="decimal" type="number" min="0" step="0.01" value={priceStr} onChange={e => setPriceStr(e.target.value)} />
        </div>
        {name.trim() && !match && <p className="small-note">I don't have any history for that item yet — snap a receipt with it on there and I'll remember it forever.</p>}
        {match && !hasPrice && <p className="small-note">Your history for {match.displayName}: average {money(match.avg)} · lowest {money(match.low)} · last {money(match.lastPrice)} on {prettyDate(match.lastDate)}.</p>}
      </div>
      {!verdict && !name.trim() && (
        <div className="card section-gap">
          <div className="card-title">🔍 How this works</div>
          <p className="small-note" style={{ lineHeight: 1.65 }}>Echo checks the price you see against your own history — your average, lowest and highest for that item — and tells you if it's a good price.</p>
          <p className="small-note" style={{ marginTop: 8, lineHeight: 1.65 }}>Nothing logged yet? Snap your first receipt and she'll start remembering every price.</p>
        </div>
      )}
      {verdict && match && (
        <div className={`card verdict ${verdict.cls}`}>
          <div className="verdict-word">{verdict.word}</div>
          <p>{verdict.text}</p>
          <div className="gauge"><div className="gauge-dot" style={{ left: `${verdict.gauge}%` }} /></div>
          <div className="gauge-labels"><span>Low {money(match.low)}</span><span>Avg {money(match.avg)}</span><span>High {money(match.high)}</span></div>
          <p className="small-note" style={{ marginTop: 12 }}>{checkTip(match, price)}</p>
          <button className="pill-btn" style={{ marginTop: 14 }} onClick={() => onOpenItem(match.normalized)}>See full history →</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Plus modal (real paywall, v1.28) ---------------- */

function PlusModal({ plus, testerMode, plusStatus, userId, onClose, onUnlocked, onDisableTesterMode }: {
  plus: boolean; testerMode: boolean; plusStatus: PlusStatus | null;
  userId: string | null; onClose: () => void; onUnlocked: () => void; onDisableTesterMode: () => void;
}) {
  const [pkgs, setPkgs] = useState<PurchasesPackage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [justUnlocked, setJustUnlocked] = useState(false);

  const loadPkgs = () => {
    setLoading(true); setLoadError(''); setError('');
    getPlusPackagesDetailed(userId).then(r => { setPkgs(r.packages); setLoadError(r.error || ''); setLoading(false); });
  };
  useEffect(() => {
    loadPkgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthly = pkgs?.find(isMonthlyPackage) || null;
  const annual = pkgs?.find(isAnnualPackage) || null;
  const otherPkgs = (pkgs || []).filter(p => p !== monthly && p !== annual);
  const trialNote = (pkg: PurchasesPackage | null, fallback: string) => {
    const price = pkg?.product.priceString || fallback;
    const intro = pkg?.product?.introPrice;
    // A free trial's intro price is $0 — show the friendly trial line, not "$0.00 for P7D".
    if (intro && intro.price === 0) return `7-day free trial, then ${price}`;
    if (intro && intro.priceString) return `${intro.priceString} for ${intro.period || 'the trial period'} then ${price}`;
    return `7-day free trial, then ${price}`;
  };

  const buy = async (pkg: PurchasesPackage) => {
    setBusyId(pkg.identifier); setError('');
    const r = await purchasePlusPackage(pkg);
    setBusyId('');
    if (r.cancelled) return; // user backed out — stay quiet
    if (r.ok) { setJustUnlocked(true); onUnlocked(); return; }
    setError(r.error || 'Couldn\u2019t complete the purchase. Try again.');
  };

  const restore = async () => {
    setBusyId('restore'); setError('');
    const r = await restorePlusPurchases(userId);
    setBusyId('');
    if (r.ok) { setJustUnlocked(true); onUnlocked(); return; }
    setError(r.error || 'No Plus purchase found on this store account.');
  };

  const priceBtn = (pkg: PurchasesPackage | null, label: string, fallback: string) => (
    <button
      className="big-btn"
      style={{ marginTop: 8 }}
      disabled={!pkg || busyId !== ''}
      onClick={() => { if (pkg) void buy(pkg); }}
    >
      {busyId === pkg?.identifier ? 'Working…' : `${label} — ${pkg ? pkg.product.priceString : fallback}`}
    </button>
  );

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div className="overlay-title">Price Amnesia Plus</div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="card">
          <div className="plus-hero">
            <span className="plus-crown">👑</span>
            <h3 className="display" style={{ fontSize: 24, marginTop: 6 }}>Never overpay again</h3>
            <p className="small-note" style={{ marginTop: 6 }}>$4.99/month or $24.99/year · 7-day free trial</p>
          </div>
          <table className="vs-table">
            <thead><tr><th></th><th className="c">Free</th><th className="c">Plus</th></tr></thead>
            <tbody>
              <tr><td>Receipt scans</td><td className="c">5 / month</td><td className="c yes">Unlimited</td></tr>
              <tr><td>Price history + trends</td><td className="c yes">✓</td><td className="c yes">✓</td></tr>
              <tr><td>Check Price verdicts</td><td className="c yes">✓</td><td className="c yes">✓</td></tr>
              <tr><td>Price-drop alerts</td><td className="c no">—</td><td className="c yes">✓</td></tr>
              <tr><td>Bank CSV import</td><td className="c no">—</td><td className="c yes">✓</td></tr>
              <tr><td>Store comparisons</td><td className="c no">—</td><td className="c yes">✓</td></tr>
            </tbody>
          </table>

          {plus ? (
            <>
              <p className="small-note" style={{ textAlign: 'center', marginTop: 16 }}>
                {justUnlocked ? '🎉 Welcome to Plus — thank you!' : '👑 Plus is ON — thank you!'}
                {testerMode && !justUnlocked ? ' (tester mode on this device)' : ''}
                {plusStatus?.expiresDate && !testerMode ? ` Renews ${new Date(plusStatus.expiresDate).toLocaleDateString()}.` : ''}
              </p>
              {testerMode && !justUnlocked && (
                <>
                  <p className="small-note" style={{ textAlign: 'center', marginTop: 8 }}>
                    Tester mode is a free preview on this device — not a real purchase.
                    Turn it off to buy a real subscription.
                  </p>
                  <button className="big-btn" style={{ marginTop: 10 }} onClick={() => { onDisableTesterMode(); loadPkgs(); }}>
                    Turn off tester mode &amp; buy for real
                  </button>
                </>
              )}
              {!testerMode && (
                <button className="ghost-btn" style={{ marginTop: 10 }} onClick={openManageSubscriptions}>
                  Manage subscription ({IS_IOS ? 'App Store' : 'Google Play'})
                </button>
              )}
              <button className="ghost-btn" style={{ marginTop: 8 }} onClick={onClose}>Keep going</button>
            </>
          ) : loading ? (
            <p className="small-note" style={{ textAlign: 'center', marginTop: 16 }}>Checking the store for Plus plans…</p>
          ) : !isRevenueCatKeySet() ? (
            <>
              <p className="small-note" style={{ textAlign: 'center', marginTop: 16 }}>
                Plus purchases aren&rsquo;t connected yet — the store subscription is still being set up.
                Nothing to pay today; the Free version keeps working fully.
              </p>
              <button className="big-btn" style={{ marginTop: 12 }} onClick={onClose}>Got it</button>
            </>
          ) : !pkgs ? (
            <>
              <p className="small-note" style={{ textAlign: 'center', marginTop: 16 }}>
                ⚠️ {loadError || 'The Plus plans didn\u2019t load.'}
              </p>
              <button className="big-btn" style={{ marginTop: 12 }} onClick={loadPkgs}>Try again</button>
              <button className="ghost-btn" style={{ marginTop: 8 }} onClick={onClose}>Not now</button>
            </>
          ) : (
            <>
              {priceBtn(monthly, 'Monthly', PLUS_MONTHLY_PRICE)}
              <p className="small-note" style={{ textAlign: 'center', marginTop: 6 }}>{trialNote(monthly, PLUS_MONTHLY_PRICE)}</p>
              {priceBtn(annual, 'Yearly — best value', PLUS_YEARLY_PRICE)}
              <p className="small-note" style={{ textAlign: 'center', marginTop: 6 }}>{trialNote(annual, PLUS_YEARLY_PRICE)} · works out to about $2.08/month</p>
              {otherPkgs.map(p => (
                <button key={p.identifier} className="big-btn" style={{ marginTop: 8 }} disabled={busyId !== ''} onClick={() => void buy(p)}>
                  {busyId === p.identifier ? 'Working…' : `${p.product.title || 'Plus'} — ${p.product.priceString}`}
                </button>
              ))}
              {error && <p className="small-note" style={{ color: 'var(--rise)', textAlign: 'center', marginTop: 10 }}>⚠️ {error}</p>}
              <button className="ghost-btn" style={{ marginTop: 12 }} onClick={restore} disabled={busyId !== ''}>
                {busyId === 'restore' ? 'Checking…' : 'Restore purchases'}
              </button>
              <p className="small-note" style={{ textAlign: 'center', marginTop: 10 }}>
                Payment is handled by {IS_IOS ? 'Apple' : 'Google Play'} under its own terms. Cancel anytime from your store subscriptions.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Settings (RouteMax-style chapters) ---------------- */

async function shareTextFile(name: string, content: string, type: string): Promise<'shared' | 'fallback'> {
  /* 1) Native Capacitor path — talks to Android directly.
     (v1.12: the WebView in this app exposes no navigator.share at all,
     so the web chain below always fell through to the copy sheet —
     confirmed on-device 2026-10-22.) */
  try {
    const written = await CapFilesystem.writeFile({
      path: name, data: content, directory: CapDirectory.Cache, encoding: CapEncoding.UTF8,
    });
    await CapShare.share({ title: name, files: [written.uri] });
    return 'shared';
  } catch (e) {
    const msg = String((e as { message?: string })?.message || e || '');
    if (/cancel|abort|dismiss/i.test(msg)) return 'shared'; // user closed the sheet on purpose
  }
  /* 2) Web fallbacks — browser builds only. */
  try {
    const file = new File([content], name, { type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title: name, text: content });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
  }
  return 'fallback';
}

type SettingsView = 'main' | 'profile' | 'app' | 'data' | 'about' | 'privacy' | 'terms' | 'account';

function Settings({ receipts, entries, plus, setPlus, onPlus, onClear, prefs, setPrefs, trash, onRecover, onRestore, user, plusStatus, onSignIn, onSignOut }: {
  receipts: Receipt[]; entries: PriceEntry[]; plus: boolean;
  setPlus: (v: boolean) => void; onPlus: () => void; onClear: () => void;
  prefs: Prefs; setPrefs: (p: Prefs) => void;
  trash: TrashSnapshot | null; onRecover: () => void;
  onRestore: (r: Receipt[], e: PriceEntry[]) => void;
  user: User | null; plusStatus: PlusStatus | null;
  onSignIn: () => void; onSignOut: () => void;
}) {
  const [view, setView] = useState<SettingsView>('main');
  const [crownTaps, setCrownTaps] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [delStep, setDelStep] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle');
  const [delError, setDelError] = useState('');
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState<{ title: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [storeDraft, setStoreDraft] = useState(prefs.homeStore);
  const [pendingRestore, setPendingRestore] = useState<{ receipts: Receipt[]; entries: PriceEntry[] } | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  const tapCrown = () => {
    const n = crownTaps + 1;
    setCrownTaps(n);
    if (n >= 7) { setPlus(!plus); setCrownTaps(0); }
  };

  const csvText = () => {
    const rows = [['item', 'price', 'store', 'date'], ...entries.map(e => [e.name, e.price.toFixed(2), e.store, e.date])];
    return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  };
  const exportCsv = async () => {
    const csv = csvText();
    const r = await shareTextFile('price-amnesia-prices.csv', csv, 'text/csv');
    if (r === 'shared') setNote('✅ Export shared — look for price-amnesia-prices.csv');
    else setSheet({ title: 'Your prices (CSV)', text: csv });
  };
  const exportBackup = async () => {
    const json = backupJSON(receipts, entries);
    const r = await shareTextFile('price-amnesia-backup.json', json, 'application/json');
    if (r === 'shared') setNote('✅ Backup shared — keep that file somewhere safe');
    else setSheet({ title: 'Your backup (JSON)', text: json });
  };
  const pickRestore = async (f: File | undefined) => {
    if (!f) return;
    const parsed = parseBackup(await f.text());
    if (!parsed) { setNote('⚠️ That file is not a Price Amnesia backup — nothing was changed.'); return; }
    setPendingRestore(parsed);
  };
  const copySheet = async () => {
    if (!sheet) return;
    try { await navigator.clipboard.writeText(sheet.text); setCopied(true); }
    catch { setNote('Copy button blocked — long-press the text, Select all, then Copy.'); }
  };
  const clearChat = () => {
    try { localStorage.removeItem('priceamnesia:chat'); } catch { /* noop */ }
    setNote('🧹 Echo chat history cleared. She still remembers every price.');
  };

  /* Delete account (v1.28.4, Apple Guideline 5.1.1(v)): two taps, then the
     server function removes the Supabase login itself — the app alone
     cannot delete its own login. Local prices stay on this phone; the
     tester-mode Plus flag is cleared so a fresh sign-up starts clean. */
  const handleDeleteAccount = async () => {
    if (delStep === 'busy' || delStep === 'done') return;
    if (delStep === 'idle') { setDelStep('confirm'); setDelError(''); return; }
    setDelStep('busy'); setDelError('');
    try {
      await deleteAccount();
      setPlus(false);
      onSignOut();
      setDelStep('done');
      setNote('Account deleted. Your prices stay right here on this phone — sign in again anytime to start fresh.');
    } catch (e) {
      setDelError('Couldn\u2019t delete the account — check your connection and try again.');
      setDelStep('confirm');
    }
  };

  const Row = ({ icon, title, sub, go }: { icon: string; title: string; sub: string; go: SettingsView }) => (
    <button className="set-row" onClick={() => { setView(go); setNote(''); }}>
      <span className="set-row-ico">{icon}</span>
      <span className="set-row-txt"><strong>{title}</strong><small>{sub}</small></span>
      <span className="set-row-chev">›</span>
    </button>
  );
  const BackHead = ({ title }: { title: string }) => (
    <div className="overlay-head" style={{ marginBottom: 14 }}>
      <button className="x-btn" onClick={() => { setView('main'); setNote(''); setPendingRestore(null); }}>‹</button>
      <div className="overlay-title" style={{ fontSize: 21 }}>{title}</div>
      <span style={{ width: 38 }} />
    </div>
  );

  return (
    <div className="screen">
      {view === 'main' && (<>
        <h2 className="display" style={{ fontSize: 26, margin: '8px 0 14px' }}>Settings</h2>
        <div className="card">
          <button style={{ width: '100%', textAlign: 'left' }} onClick={tapCrown}>
            <div style={{ fontSize: 26 }}>👑</div>
            <div style={{ fontWeight: 900, fontSize: 16, marginTop: 4 }}>Price Amnesia Plus {plus ? '— ON' : ''}</div>
            <p className="small-note" style={{ marginTop: 4 }}>Unlimited scans, drop alerts, CSV import and store comparisons. $4.99/month at launch.</p>
          </button>
          <button className="big-btn" style={{ marginTop: 12 }} onClick={onPlus}>See Free vs Plus</button>
        </div>

        <div className="card">
          <div className="card-title">Chapters</div>
          <Row icon="🔑" title="Account" sub={user ? `Signed in as ${user.email || 'you'}` : 'Sign in — optional'} go="account" />
          <Row icon="👤" title="Profile & shopping" sub="Home store · alert sensitivity" go="profile" />
          <Row icon="🎛️" title="The App" sub="Echo cards · appearance · chat" go="app" />
          <Row icon="🗄️" title="Data & storage" sub="Backup · restore · recover · export" go="data" />
        </div>

        <div className="card">
          <div className="card-title">Echo's AI — two brains</div>
          <p className="small-note"><strong>On-device brain (always on):</strong> Echo answers price questions, writes your insights and alerts, and comments on every item — straight from the prices stored on this phone. No internet needed.</p>
          <p className="small-note" style={{ marginTop: 8 }}><strong>Cloud brain + AI readers (live):</strong> Echo's open-ended chat, receipt reading, and bill reading all run through your own private backend. Receipt and bill photos are only sent when you snap or upload one.</p>
        </div>

        <div className="card">
          <div className="card-title">Legal & about</div>
          <Row icon="🔮" title="About Price Amnesia" sub="What it is · version" go="about" />
          <Row icon="🔒" title="Privacy policy" sub="What leaves this phone, and when" go="privacy" />
          <Row icon="📜" title="Terms of use" sub="The plain-English deal" go="terms" />
        </div>
        <p className="small-note" style={{ textAlign: 'center', marginTop: 16 }}>Price Amnesia v1.28.12<br />Prices are your own logged history — informational only.</p>
      </>)}

      {view === 'account' && (<>
        <BackHead title="Account" />
        <div className="card">
          <div className="card-title">🔑 {user ? 'Signed in' : 'Sign in — optional'}</div>
          {user ? (
            <>
              <p className="small-note" style={{ lineHeight: 1.6 }}>
                Signed in as <strong>{user.email}</strong>. Plus follows your account, so it comes with you to a new phone.
                Your receipts and prices still live only on this phone — signing in doesn&rsquo;t move them anywhere.
              </p>
              <button className="ghost-btn" style={{ marginTop: 12 }} onClick={() => { onSignOut(); setNote('Signed out — your prices stay right here.'); }}>Sign out</button>
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--stroke)' }}>
                <div className="card-title" style={{ marginBottom: 6 }}>🗑️ Delete account</div>
                {delStep === 'done' ? (
                  <p className="small-note" style={{ lineHeight: 1.6 }}>Your account is deleted. Your prices stay on this phone.</p>
                ) : delStep === 'confirm' || delStep === 'busy' ? (
                  <>
                    <p className="small-note" style={{ lineHeight: 1.6 }}>
                      This permanently deletes your sign-in and any Plus tied to it. Your receipts
                      and prices stay on this phone — only the account goes.
                    </p>
                    {delError && <p className="small-note" style={{ color: 'var(--rise)', marginTop: 8 }}>⚠️ {delError}</p>}
                    <button className="danger-btn" style={{ marginTop: 10 }} onClick={() => void handleDeleteAccount()} disabled={delStep === 'busy'}>
                      {delStep === 'busy' ? 'Deleting…' : 'Yes, delete my account'}
                    </button>
                    <button className="ghost-btn" style={{ marginTop: 8 }} onClick={() => { setDelStep('idle'); setDelError(''); }} disabled={delStep === 'busy'}>Keep my account</button>
                  </>
                ) : (
                  <button className="ghost-btn" style={{ marginTop: 4 }} onClick={() => void handleDeleteAccount()}>Delete account…</button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="small-note" style={{ lineHeight: 1.6 }}>
                You&rsquo;re using Price Amnesia without an account — everything works. Sign in to tie Plus to your email
                (so a subscription follows you to a new phone) and to let Echo know it&rsquo;s you.
              </p>
              <button className="big-btn" style={{ marginTop: 12 }} onClick={onSignIn}>Sign in / create account</button>
            </>
          )}
        </div>
        {note && <p className="small-note" style={{ textAlign: 'center' }}>{note}</p>}
      </>)}

      {view === 'profile' && (<>
        <BackHead title="Profile & shopping" />
        <div className="card">
          <div className="card-title">🏠 Home store</div>
          <p className="small-note">Your usual store. New receipts start with this name filled in — change it on any receipt that came from somewhere else.</p>
          <input value={storeDraft} onChange={e => setStoreDraft(e.target.value)} placeholder="e.g. Walmart" style={{ marginTop: 10 }} />
          <button className="pill-btn gold" style={{ marginTop: 10 }} onClick={() => { setPrefs({ ...prefs, homeStore: storeDraft.trim() }); setNote('✅ Home store saved'); }}>Save home store</button>
        </div>
        <div className="card">
          <div className="card-title">🚨 Echo's alert sensitivity</div>
          <p className="small-note">How far under your average a price must fall before Echo calls it a stock-up alert.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {[{ v: 0.05, label: 'Eager · 5%' }, { v: 0.10, label: 'Normal · 10%' }, { v: 0.15, label: 'Relaxed · 15%' }].map(o => (
              <button key={o.v} className={`chip-btn ${prefs.alertPct === o.v ? 'chip-on' : ''}`} onClick={() => { setPrefs({ ...prefs, alertPct: o.v }); setNote(`✅ Alerts set to ${o.label}`); }}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Subscription</div>
          <p className="small-note">
            {plus
              ? (plusStatus?.active
                ? `Plus is ON — your subscription${plusStatus.expiresDate ? ` renews ${new Date(plusStatus.expiresDate).toLocaleDateString()}` : ' is active'}.`
                : 'Plus is ON for this device (tester mode).')
              : 'You are on the Free plan.'} $4.99/month or $24.99/year with a 7-day free trial.
          </p>
          {plus && plusStatus?.active && (
            <button className="ghost-btn" style={{ marginTop: 10 }} onClick={openManageSubscriptions}>
              Manage subscription ({IS_IOS ? 'App Store' : 'Google Play'})
            </button>
          )}
          {!plus && (
            <button className="big-btn" style={{ marginTop: 10 }} onClick={onPlus}>See Free vs Plus</button>
          )}
        </div>
        {note && <p className="small-note" style={{ textAlign: 'center' }}>{note}</p>}
      </>)}

      {view === 'app' && (<>
        <BackHead title="The App" />
        <div className="card">
          <div className="card-title">🔮 Echo on Home</div>
          <p className="small-note">Echo's insights and alert cards on the Home screen — her living commentary on your prices.</p>
          <button className="pill-btn" style={{ marginTop: 10 }} onClick={() => { setPrefs({ ...prefs, echoCards: !prefs.echoCards }); setNote(prefs.echoCards ? 'Echo cards hidden on Home' : '✅ Echo cards back on Home'); }}>
            {prefs.echoCards ? 'On — tap to hide' : 'Off — tap to show'}
          </button>
        </div>
        <div className="card">
          <div className="card-title">🎨 Appearance</div>
          <p className="small-note">Pick the light Echo lives in.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {([{ v: 'aurora', label: '🌌 Aurora' }, { v: 'gentle', label: '🌸 Gentle' }, { v: 'day', label: '🌌 Starlight' }] as { v: ThemeName; label: string }[]).map(o => (
              <button key={o.v} className={`chip-btn ${prefs.theme === o.v ? 'chip-on' : ''}`} onClick={() => setPrefs({ ...prefs, theme: o.v })}>{o.label}</button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">💬 Echo chat</div>
          <p className="small-note">Your conversation with Echo lives on this phone. Clear it any time — her price memory is separate and stays.</p>
          <button className="ghost-btn" style={{ marginTop: 10 }} onClick={clearChat}>Clear chat history</button>
        </div>
        {note && <p className="small-note" style={{ textAlign: 'center' }}>{note}</p>}
      </>)}

      {view === 'data' && (<>
        <BackHead title="Data & storage" />
        <div className="card">
          <div className="card-title">Your data — on this phone</div>
          <p className="small-note">{receipts.length} receipts · {entries.length} prices remembered · about {storageKB()} KB. Everything is stored on your device first, so the app works offline and never dies on a network error.</p>
          <button className="ghost-btn" style={{ marginTop: 12 }} onClick={exportCsv}>⬇️ Export prices as CSV</button>
          <p className="small-note" style={{ marginTop: 6 }}>Opens your share sheet — save it to Files, Drive, or email it to yourself.</p>
        </div>
        <div className="card">
          <div className="card-title">Backup & restore</div>
          <p className="small-note">A backup file holds every receipt and price. Keep one somewhere safe and a new phone is never a lost memory.</p>
          <button className="ghost-btn" style={{ marginTop: 10 }} onClick={exportBackup}>💾 Back up my data</button>
          <button className="ghost-btn" style={{ marginTop: 8 }} onClick={() => restoreFileRef.current?.click()}>📥 Restore from a backup file</button>
          <input ref={restoreFileRef} type="file" accept=".json,application/json" style={HIDDEN_INPUT_STYLE}
            onChange={e => { void pickRestore(e.target.files?.[0]); e.target.value = ''; }} />
          {pendingRestore && (
            <div style={{ marginTop: 12 }}>
              <p className="small-note">This backup has {pendingRestore.receipts.length} receipts and {pendingRestore.entries.length} prices. Restoring **replaces** everything currently in the app (your current data is kept as the recover copy first).</p>
              <button className="danger-btn" style={{ marginTop: 8 }} onClick={() => { onRestore(pendingRestore.receipts, pendingRestore.entries); setPendingRestore(null); setNote('✅ Backup restored'); }}>Tap to restore it</button>
            </div>
          )}
        </div>
        {trash && trash.receipts.length + trash.entries.length > 0 && (
          <div className="card">
            <div className="card-title">Recover</div>
            <p className="small-note">An erased copy from {new Date(trash.at).toLocaleDateString()} is being kept: {trash.receipts.length} receipts · {trash.entries.length} prices. Bring it back?</p>
            <button className="pill-btn gold" style={{ marginTop: 10 }} onClick={() => { onRecover(); setNote('✅ Recovered'); }}>Recover my erased data</button>
          </div>
        )}
        <div className="card">
          <div className="card-title">Danger zone</div>
          <p className="small-note" style={{ marginBottom: 8 }}>Erasing keeps a recover copy in Data & storage until you erase again or restore over it.</p>
          {confirmClear ? (
            <button className="danger-btn" onClick={() => { onClear(); setConfirmClear(false); setNote('Erased — your recover copy is above when you need it.'); }}>Tap again — erase every receipt + price</button>
          ) : (
            <button className="ghost-btn" onClick={() => setConfirmClear(true)}>Erase all data</button>
          )}
        </div>
        {note && <p className="small-note" style={{ textAlign: 'center' }}>{note}</p>}
      </>)}

      {view === 'about' && (<>
        <BackHead title="About" />
        <div className="card">
          <p className="small-note" style={{ lineHeight: 1.65 }}>
            <strong>Price Amnesia</strong> is your grocery price memory. Snap a receipt and Echo — the living orb on your Home screen — remembers every price forever, spots drops and creep, compares your stores, and answers questions like “what did eggs cost?”
          </p>
          <p className="small-note" style={{ marginTop: 10, lineHeight: 1.65 }}>
            Version 1.28.12 · Package com.priceamnesia.app<br />
            Your prices live on this phone. Echo's cloud brain and her receipt + bill readers run through your own private backend.
          </p>
        </div>
      </>)}

      {view === 'privacy' && (<>
        <BackHead title="Privacy policy" />
        <div className="card">
          <p className="small-note" style={{ lineHeight: 1.65 }}>
            • <strong>Your prices stay on your phone.</strong> Receipts, prices, Echo chat and settings are stored on this device. Signing in is optional; an account only ties Plus to your email. Nothing is sold or shared with advertisers.<br /><br />
            • <strong>Account:</strong> if you sign in, your email is kept by the sign-in provider so you can sign back in. Sign out any time in Settings → Account — your prices stay on the phone.<br /><br />
            • <strong>Receipt photos:</strong> only when you snap or upload one, the photo is sent over an encrypted connection to Echo's receipt-reading AI through a private relay, purely to read the items and prices off it.<br /><br />
            • <strong>Echo chat:</strong> when you ask Echo something her on-device brain can't answer, your question plus a summary of your price history is sent to Echo's chat AI the same way.<br /><br />
            • <strong>Erase any time:</strong> Settings → Data & storage → Erase all data removes everything from this phone.
          </p>
        </div>
      </>)}

      {view === 'terms' && (<>
        <BackHead title="Terms of use" />
        <div className="card">
          <p className="small-note" style={{ lineHeight: 1.65 }}>
            • Price Amnesia tracks the prices <em>you</em> log. It is an informational memory aid, not financial advice, and it can't see live store prices.<br /><br />
            • AI reading can make mistakes — glance over the review screen before saving a receipt.<br /><br />
            • The app is provided as-is. Keep a backup (Data & storage) of anything you'd hate to lose.<br /><br />
            • Plus billing is handled by {IS_IOS ? 'Apple' : 'Google Play'} under its own terms — $4.99/month or $24.99/year, 7-day free trial, cancel anytime from your store subscriptions.
          </p>
        </div>
      </>)}

      {sheet !== null && (
        <div className="overlay">
          <div className="overlay-inner">
            <div className="overlay-head">
              <div className="overlay-title" style={{ fontSize: 19 }}>{sheet.title}</div>
              <button className="x-btn" onClick={() => { setSheet(null); setCopied(false); }}>✕</button>
            </div>
            <p className="small-note">Sharing isn't available in this view, so here it is as text — copy it and paste it anywhere.</p>
            <textarea readOnly value={sheet.text} rows={10} style={{ width: '100%', marginTop: 12, borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--stroke)', color: 'var(--txt)', fontSize: 12.5, fontFamily: 'monospace' }} />
            <button className="big-btn" style={{ marginTop: 12 }} onClick={copySheet}>{copied ? '✅ Copied!' : 'Copy it'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Scan flow ---------------- */

interface DraftLine { name: string; price: string; qty: string }

function ScanFlow({ initialPhoto, initialStore, plus, onClose, onSave }: {
  initialPhoto: string | null;
  initialStore?: string;
  plus?: boolean;
  onClose: () => void;
  onSave: (store: string, date: string, photo: string | null, lines: { name: string; price: number; quantity: number | null }[], category: string) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(initialPhoto);
  const [store, setStore] = useState(initialStore || '');
  const [category, setCategory] = useState<string>(() => detectCategory(initialStore || ''));
  const catTouched = useRef(false);
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState<DraftLine[]>([{ name: '', price: '', qty: '' }]);
  const [aiState, setAiState] = useState<'idle' | 'working' | 'done' | 'fallback'>('idle');
  const [aiMsg, setAiMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const upRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (f: File | undefined, input: HTMLInputElement | null) => {
    clearPendingScan();
    if (input) input.value = '';
    if (!f) return;
    try {
      const dataUrl = await compressImage(f);
      setPhoto(dataUrl);
      setAiState('idle'); setAiMsg('');
    } catch { setAiMsg('That photo could not be opened — try another one, or type the items in below.'); setAiState('fallback'); }
  };

  const runAi = async () => {
    if (!photo) return;
    setAiState('working'); setAiMsg('Echo is reading your receipt…');
    const res = await extractReceipt(photo);
    if (res.ok && res.items.length > 0) {
      if (res.store) { setStore(res.store); if (!catTouched.current) setCategory(detectCategory(res.store)); }
      if (res.date) setDate(res.date);
      setLines(res.items.map(it => ({ name: it.name, price: it.price.toFixed(2), qty: it.quantity ? String(it.quantity) : '' })));
      setAiState('done'); setAiMsg(`AI read ${res.items.length} item${res.items.length === 1 ? '' : 's'} — check them over, fix anything, then save.`);
    } else if (res.ok) {
      setAiState('fallback'); setAiMsg('The AI could not read that photo. Type the items in below — it only takes a few seconds.');
    } else {
      setAiState('fallback'); setAiMsg(`Echo couldn't reach her reader just now (${res.error || 'connection hiccup'}) — she tried 3 times. The reader IS switched on; this is a connection hiccup. Check your signal, then tap "Read it with AI" again — or type the items in below.`);
    }
  };

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = lines.filter(l => l.name.trim() && parseFloat(l.price) > 0);

  const save = () => {
    onSave(store.trim() || 'Unknown store', date || todayStr(), photo,
      valid.map(l => ({ name: l.name.trim(), price: parseFloat(l.price), quantity: l.qty ? parseFloat(l.qty) : null })), category);
    setSaved(true);
    setTimeout(onClose, 1500);
  };

  if (saved) {
    return (
      <div className="overlay"><div className="overlay-inner" style={{ textAlign: 'center', paddingTop: 90 }}>
        <Orb size={130} mood="happy" />
        <h3 className="display" style={{ fontSize: 26, marginTop: 22 }}>Remembered forever 🧠</h3>
        <p className="small-note" style={{ marginTop: 8 }}>Those prices are in your history now.</p>
        {!plus && <p className="small-note" style={{ marginTop: 10 }}>🌟 Moments like this are what Plus multiplies — AI deep dives on everything you save. Find it under More, whenever you're ready.</p>}
        <div className="confetti"><span>🎉</span></div>
      </div></div>
    );
  }

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div className="overlay-title">Add receipt</div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        <input ref={camRef} type="file" accept="image/*" capture="environment" style={HIDDEN_INPUT_STYLE} onChange={e => pickPhoto(e.target.files?.[0], camRef.current)} />
        <input ref={upRef} type="file" accept="image/*" style={HIDDEN_INPUT_STYLE} onChange={e => pickPhoto(e.target.files?.[0], upRef.current)} />

        {!photo && (
          <div className="upload-row" style={{ marginTop: 0 }}>
            <button className="pill-btn" onClick={() => { markPendingScan(); camRef.current?.click(); }}>📸 Take photo</button>
            <button className="pill-btn" onClick={() => { markPendingScan(); upRef.current?.click(); }}>📁 Upload photo</button>
          </div>
        )}
        {photo && (
          <div className={aiState === 'working' ? 'scanning' : ''}>
            <img className="receipt-preview" src={photo} alt="your receipt" />
          </div>
        )}
        {photo && aiState !== 'done' && (
          <button className="big-btn" style={{ marginTop: 12 }} onClick={runAi} disabled={aiState === 'working'}>
            {aiState === 'working' ? 'Reading…' : '✨ Read it with AI'}
          </button>
        )}
        {aiMsg && <div className={`ai-status ${aiState === 'done' ? 'done' : aiState === 'working' ? 'working' : 'fallback'}`}>{aiMsg}</div>}

        <div className="card" style={{ marginTop: 12 }}>
          <div className="field-row">
            <div className="field"><label>Store / business</label><input placeholder="e.g. Walmart, Shell, Starbucks" value={store} onChange={e => { setStore(e.target.value); if (!catTouched.current) setCategory(detectCategory(e.target.value)); }} /></div>
            <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <div className="fld-label">Receipt type — Echo guessed, tap to fix</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {RECEIPT_CATS.map(c => (
              <button key={c.id} className={`chip-btn ${category === c.id ? 'chip-on' : ''}`} onClick={() => { catTouched.current = true; setCategory(c.id); }}>{c.icon} {c.label}</button>
            ))}
          </div>
          <div className="card-title" style={{ marginTop: 4 }}>Items</div>
          {lines.map((l, i) => (
            <div className="line-row" key={i}>
              <input className="line-name" placeholder="Item name" value={l.name} onChange={e => setLine(i, { name: e.target.value })} />
              <input className="line-price" placeholder="$" inputMode="decimal" type="number" min="0" step="0.01" value={l.price} onChange={e => setLine(i, { price: e.target.value })} />
              <input className="line-qty" placeholder="Qty" inputMode="decimal" type="number" min="0" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} />
              <button className="line-del" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} aria-label="remove line">✕</button>
            </div>
          ))}
          <button className="add-line" onClick={() => setLines(ls => [...ls, { name: '', price: '', qty: '' }])}>+ Add item</button>
          <button className="big-btn" style={{ marginTop: 16 }} onClick={save} disabled={valid.length === 0}>
            Save {valid.length > 0 ? `${valid.length} price${valid.length === 1 ? '' : 's'}` : 'receipt'}
          </button>
          {valid.length === 0 && <p className="small-note" style={{ textAlign: 'center', marginTop: 8 }}>Add at least one item with a name and a price.</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Deals Hub (Basecamp-style) ---------------- */

function DealsHub({ stats, entries, receipts, accounts, onOpenItem, onClose }: { accounts: Account[];
  stats: ItemStats[]; entries: PriceEntry[]; receipts: Receipt[];
  onOpenItem: (n: string) => void; onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<{ text: string; source: 'cloud' | 'local' } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const runAnalyst = async () => {
    setAnalyzing(true);
    const cloud = await askCloud(ANALYST_QUESTION, buildDealsContext(stats, entries, receipts) + (bankContextLine(accounts) ? `\n${bankContextLine(accounts)}` : '') + (habitContextLine({ receipts, entries, stats, bills: [], accounts, ledger: [], budgets: {} }) ? `\n${habitContextLine({ receipts, entries, stats, bills: [], accounts, ledger: [], budgets: {} })}` : ''));
    setAnalysis(cloud ? { text: cloud, source: 'cloud' } : { text: localAnalyst(stats, entries), source: 'local' });
    setAnalyzing(false);
  };
  const lows = atTheirLow(stats);
  const battle = storeBattle(entries);
  const basket = smartBasket(stats, entries);
  const ever = cheapestEver(stats);
  const tracked = stats.filter(s => s.count >= 2).length;

  const echoLine = tracked === 0
    ? 'Log the same item twice and I can start hunting real deals for you — one receipt is a sighting, two is a pattern.'
    : lows.length > 0
      ? `I found ${lows.length} item${lows.length === 1 ? '' : 's'} sitting at the cheapest price I've ever seen for them. That's your stock-up signal.`
      : battle.rows.length > 0
        ? `Nothing is at its all-time low today, but I know exactly which of your stores wins — scroll down and see who's cheapest.`
        : 'Your prices are building nicely. A second store for the same items would unlock my store-battle verdicts.';

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Orb mood="happy" size={44} />
            <div>
              <div className="overlay-title" style={{ fontSize: 22 }}>Deals Hub</div>
              <div className="small-note">The cheapest prices you've ever caught</div>
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="echo-says">
          <Orb mood="happy" size={34} />
          <p>{echoLine}</p>
        </div>

        <div className="card">
          <div className="card-title">🧠 Echo's AI — deal analysis</div>
          {!analysis && !analyzing && (<>
            <p className="small-note">Let Echo's cloud brain study your whole deal board — store strategy, stock-ups, and where you're overpaying.</p>
            <button className="big-btn" style={{ marginTop: 10 }} onClick={runAnalyst}>Analyze my deals</button>
          </>)}
          {analyzing && <p className="small-note">Echo is studying your deals…</p>}
          {analysis && (<>
            <p style={{ lineHeight: 1.65, fontSize: 14.5 }}>{analysis.text}</p>
            <p className="small-note" style={{ marginTop: 8 }}>{analysis.source === 'cloud' ? '☁️ Echo\'s cloud brain' : '📱 Composed on-device — cloud unreachable'} · <button style={{ textDecoration: 'underline', fontWeight: 800 }} onClick={runAnalyst}>Run it again</button></p>
          </>)}
        </div>

        <div className="card">
          <div className="card-title">🎯 At their low — right now</div>
          {lows.length === 0 ? (
            <p className="small-note">Nothing you track is at its all-time low today. When a price falls back to the cheapest you've ever paid, it lands here with a stock-up signal.</p>
          ) : lows.slice(0, 6).map(l => (
            <button key={l.normalized} className="set-row" onClick={() => onOpenItem(l.normalized)}>
              <span className="set-row-txt"><strong style={{ textTransform: 'capitalize' }}>{l.displayName}</strong><small>{l.store} · {l.vsAvgPct}% under your average</small></span>
              <span style={{ fontWeight: 900, color: 'var(--drop)' }}>{money(l.price)}</span>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-title">🧺 Your smart basket</div>
          {basket.lines.length === 0 ? (
            <p className="small-note">Buy any item twice and I'll build your basket — every repeat item priced at its cheapest-seen store versus what you paid last time.</p>
          ) : (<>
            <div className="stat-grid">
              <div className="stat-cell"><div className="stat-num" style={{ color: 'var(--drop)' }}>{money(basket.bestTotal)}</div><div className="stat-lbl">At your best prices</div></div>
              <div className="stat-cell"><div className="stat-num">{money(basket.lastTotal)}</div><div className="stat-lbl">At last-paid prices</div></div>
              <div className="stat-cell"><div className="stat-num" style={{ color: 'var(--gold)' }}>{money(basket.saveTotal)}</div><div className="stat-lbl">You could save</div></div>
            </div>
            {basket.lines.filter(l => l.save > 0).slice(0, 6).map(l => (
              <div key={l.normalized} className="set-row">
                <span className="set-row-txt"><strong style={{ textTransform: 'capitalize' }}>{l.displayName}</strong><small>Best: {money(l.bestPrice)} at {l.bestStore} · Last: {money(l.lastPrice)} at {l.lastStore}</small></span>
                <span style={{ fontWeight: 900, color: 'var(--drop)' }}>-{money(l.save)}</span>
              </div>
            ))}
            {basket.lines.every(l => l.save === 0) && <p className="small-note" style={{ marginTop: 8 }}>You're already paying your best prices on everything. Ruthless. I approve.</p>}
          </>)}
        </div>

        <div className="card">
          <div className="card-title">⚔️ Store battle</div>
          {battle.rows.length === 0 ? (
            <p className="small-note">A battle needs the same item from two different stores. Log eggs at Walmart AND Target, and I'll crown the winner — with the exact gap.</p>
          ) : (<>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              {battle.standings.map((s, i) => (
                <span key={s.store} className="plus-chip">{i === 0 ? '👑 ' : ''}{s.store} · {s.wins} win{s.wins === 1 ? '' : 's'}</span>
              ))}
            </div>
            {battle.rows.slice(0, 6).map(r => (
              <div key={r.normalized} className="set-row">
                <span className="set-row-txt"><strong style={{ textTransform: 'capitalize' }}>{r.displayName}</strong><small>{r.cheapestStore} {money(r.cheapestPrice)} beats {r.priciestStore} {money(r.priciestPrice)}</small></span>
                <span style={{ fontWeight: 900, color: 'var(--cyan)' }}>-{r.gapPct}%</span>
              </div>
            ))}
          </>)}
        </div>

        <div className="card">
          <div className="card-title">🏆 Cheapest you've ever caught it</div>
          {ever.length === 0 ? (
            <p className="small-note">Your hall of fame is empty — it fills with the lowest price you've ever logged for each repeat item.</p>
          ) : ever.slice(0, 8).map(c => (
            <button key={c.normalized} className="set-row" onClick={() => onOpenItem(c.normalized)}>
              <span className="set-row-txt"><strong style={{ textTransform: 'capitalize' }}>{c.displayName}</strong><small>{c.store} · {c.date} · seen {c.timesSeen}×</small></span>
              <span style={{ fontWeight: 900 }}>{money(c.low)}</span>
            </button>
          ))}
        </div>

        <p className="small-note" style={{ textAlign: 'center', marginTop: 4 }}>Every deal here is computed from prices you personally logged — never live store data. — Echo</p>
      </div>
    </div>
  );
}

/* ---------------- AI Briefing (v1.6) ---------------- */

const BRIEFING_KEY = 'priceamnesia:briefing';

function BriefingOverlay({ stats, entries, receipts, accounts, onClose }: { accounts: Account[];
  stats: ItemStats[]; entries: PriceEntry[]; receipts: Receipt[]; onClose: () => void;
}) {
  const sig = `${entries.length}:${receipts.length}:${entries.length ? entries[entries.length - 1].createdAt : 0}`;
  const [result, setResult] = useState<{ text: string; source: 'cloud' | 'local' } | null>(() => {
    try {
      const raw = localStorage.getItem(BRIEFING_KEY);
      if (raw) { const c = JSON.parse(raw); if (c && c.sig === sig && typeof c.text === 'string') return { text: c.text, source: c.source }; }
    } catch { /* regenerate */ }
    return null;
  });
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const cloud = await askCloud(BRIEFING_QUESTION, buildDealsContext(stats, entries, receipts) + (bankContextLine(accounts) ? `\n${bankContextLine(accounts)}` : '') + (habitContextLine({ receipts, entries, stats, bills: [], accounts, ledger: [], budgets: {} }) ? `\n${habitContextLine({ receipts, entries, stats, bills: [], accounts, ledger: [], budgets: {} })}` : ''));
    const next = cloud
      ? { text: cloud, source: 'cloud' as const }
      : { text: localBriefing(stats, entries, receipts), source: 'local' as const };
    setResult(next);
    try { localStorage.setItem(BRIEFING_KEY, JSON.stringify({ sig, text: next.text, source: next.source })); } catch { /* full */ }
    setLoading(false);
  };
  useEffect(() => { if (!result) { void generate(); } }, []);

  const lows = atTheirLow(stats);
  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Orb mood="happy" size={44} />
            <div>
              <div className="overlay-title" style={{ fontSize: 22 }}>Echo's AI Briefing</div>
              <div className="small-note">{loading ? 'Echo is thinking…' : result ? (result.source === 'cloud' ? '☁️ Written by her cloud brain' : '📱 Composed on-device — cloud unreachable') : ''}</div>
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="stat-grid">
          <div className="stat-cell"><div className="stat-num solid">{receipts.length}</div><div className="stat-lbl">Receipts</div></div>
          <div className="stat-cell"><div className="stat-num solid">{stats.length}</div><div className="stat-lbl">Items tracked</div></div>
          <div className="stat-cell"><div className="stat-num">{lows.length}</div><div className="stat-lbl">At all-time low</div></div>
        </div>

        <div className="card">
          {loading && !result && <p className="small-note">Echo is reading your whole price history and writing your briefing…</p>}
          {result && <p style={{ lineHeight: 1.7, fontSize: 15.5 }}>{result.text}</p>}
        </div>

        <button className="big-btn" onClick={generate} disabled={loading}>{loading ? 'Writing…' : '↻ Write a fresh briefing'}</button>
        <p className="small-note" style={{ textAlign: 'center', marginTop: 10 }}>Briefings are written from your logged prices only.</p>
      </div>
    </div>
  );
}

/* ---------------- Money Wellness Hub (v1.8, AI-first) ---------------- */

type AiSlot = { text: string; source: 'cloud' | 'local' } | null;
const MOODS: { v: Mood; label: string; emoji: string }[] = [
  { v: 'calm', label: 'Calm', emoji: '😌' },
  { v: 'rushed', label: 'Rushed', emoji: '🏃' },
  { v: 'stressed', label: 'Stressed', emoji: '😖' },
  { v: 'stocked', label: 'Stocked up', emoji: '🛒' },
];
const INTENTIONS = ['Beat my average', 'Hunt one real deal', 'Stick to my list'];

function WellnessHub({ stats, entries, receipts, accounts, onClose }: { accounts: Account[];
  stats: ItemStats[]; entries: PriceEntry[]; receipts: Receipt[]; onClose: () => void;
}) {
  const health = priceHealth(stats, entries, receipts);
  const pulse = monthPulse(receipts);
  const wins = winsWall(stats);
  const [moods, setMoods] = useState<MoodEntry[]>(() => loadMoods());
  const [intention, setIntention] = useState(() => loadIntention());
  const [reading, setReading] = useState<AiSlot>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  const [reflection, setReflection] = useState<AiSlot>(null);
  const [reflectBusy, setReflectBusy] = useState(false);
  const [mission, setMission] = useState<AiSlot>(null);
  const [missionBusy, setMissionBusy] = useState(false);
  const [coachQ, setCoachQ] = useState<string | null>(null);
  const [coach, setCoach] = useState<AiSlot>(null);
  const [coachBusy, setCoachBusy] = useState(false);

  const ctx = () => buildWellnessContext(stats, entries, receipts, moods) + (bankContextLine(accounts) ? `\n${bankContextLine(accounts)}` : '') + (habitContextLine({ receipts, entries, stats, bills: [], accounts, ledger: [], budgets: {} }) ? `\n${habitContextLine({ receipts, entries, stats, bills: [], accounts, ledger: [], budgets: {} })}` : '');
  const sourceNote = (s: 'cloud' | 'local') => s === 'cloud' ? '☁️ Echo\'s cloud brain' : '📱 Composed on-device';

  const runReading = async () => {
    setReadingBusy(true);
    const cloud = await askCloud(READING_QUESTION, ctx());
    setReading(cloud ? { text: cloud, source: 'cloud' } : { text: localReading(stats, entries, receipts), source: 'local' });
    setReadingBusy(false);
  };
  const checkIn = async (mood: Mood) => {
    setMoods(addMood(mood));
    setReflectBusy(true); setReflection(null);
    const cloud = await askCloud(reflectQuestion(mood), ctx());
    setReflection(cloud ? { text: cloud, source: 'cloud' } : { text: localReflection(mood), source: 'local' });
    setReflectBusy(false);
  };
  const runMission = async (text: string) => {
    setMissionBusy(true);
    const cloud = await askCloud(missionQuestion(text), ctx());
    const m = cloud || localMission(text, stats, entries);
    saveIntention(text, m);
    setIntention({ day: new Date().toDateString(), text, mission: m });
    setMission({ text: m, source: cloud ? 'cloud' : 'local' });
    setMissionBusy(false);
  };
  const askCoach = async (q: string) => {
    setCoachQ(q); setCoachBusy(true); setCoach(null);
    const cloud = await askCloud(coachQuestion(q), ctx());
    setCoach(cloud ? { text: cloud, source: 'cloud' } : { text: q.includes('leak') || q.includes('overspending') ? localAnalyst(stats, entries) : localBriefing(stats, entries, receipts), source: 'local' });
    setCoachBusy(false);
  };

  const bar = (label: string, val: number, max: number) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--dim)', fontWeight: 700 }}><span>{label}</span><span>{val}/{max}</span></div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(val / max * 100)}%`, borderRadius: 99, background: 'linear-gradient(90deg, var(--cyan), var(--violet))', transition: 'width .8s ease' }} />
      </div>
    </div>
  );
  const pulseMax = Math.max(pulse.thisMonth, pulse.lastMonth, 1);

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Orb mood="happy" size={44} />
            <div>
              <div className="overlay-title" style={{ fontSize: 22 }}>Money Wellness</div>
              <div className="small-note">Your calm-money headquarters — Echo coaches, you shop</div>
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-title" style={{ textAlign: 'left' }}>💗 Price Health Score</div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.05, background: 'linear-gradient(90deg, var(--cyan), var(--violet), var(--gold))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{health.score}</div>
          <div style={{ fontWeight: 900, color: 'var(--gold)' }}>{health.band}</div>
          <div style={{ textAlign: 'left', marginTop: 6 }}>
            {bar('Buying below your average', health.parts.belowAvg, 40)}
            {bar('Tracking consistency', health.parts.consistency, 25)}
            {bar('Store smarts', health.parts.storeSmarts, 20)}
            {bar('Deal readiness', health.parts.dealReady, 15)}
          </div>
          {!reading && !readingBusy && <button className="big-btn" style={{ marginTop: 14 }} onClick={runReading}>🧠 Echo's reading of my score</button>}
          {readingBusy && <p className="small-note" style={{ marginTop: 12 }}>Echo is reading your money habits…</p>}
          {reading && (<>
            <p style={{ textAlign: 'left', lineHeight: 1.65, fontSize: 14.5, marginTop: 12 }}>{reading.text}</p>
            <p className="small-note" style={{ textAlign: 'left', marginTop: 6 }}>{sourceNote(reading.source)} · <button style={{ textDecoration: 'underline', fontWeight: 800 }} onClick={runReading}>Read it again</button></p>
          </>)}
        </div>

        <div className="card">
          <div className="card-title">🌿 Shop check-in</div>
          <p className="small-note">How did your last shop feel? Echo reflects with you — no judgment, ever.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {MOODS.map(m => (
              <button key={m.v} className="chip-btn" onClick={() => checkIn(m.v)} disabled={reflectBusy}>{m.emoji} {m.label}</button>
            ))}
          </div>
          {reflectBusy && <p className="small-note" style={{ marginTop: 10 }}>Echo is sitting with that…</p>}
          {reflection && (<>
            <p style={{ lineHeight: 1.65, fontSize: 14.5, marginTop: 10 }}>{reflection.text}</p>
            <p className="small-note" style={{ marginTop: 6 }}>{sourceNote(reflection.source)}</p>
          </>)}
          {moods.length > 0 && (
            <p className="small-note" style={{ marginTop: 10 }}>
              Your check-ins: {MOODS.map(m => { const n = moods.filter(x => x.mood === m.v).length; return n ? `${m.emoji} ${n}` : null; }).filter(Boolean).join(' · ')}
              {' '}({moods.length} total)
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-title">🫀 Spending pulse</div>
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--dim)', fontWeight: 700 }}><span>This month · {pulse.thisCount} receipts</span><span>{money(pulse.thisMonth)}</span></div>
            <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginTop: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.round(pulse.thisMonth / pulseMax * 100)}%`, background: 'linear-gradient(90deg, var(--cyan), var(--drop))', borderRadius: 99 }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--dim)', fontWeight: 700, marginTop: 10 }}><span>Last month · {pulse.lastCount} receipts</span><span>{money(pulse.lastMonth)}</span></div>
            <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginTop: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.round(pulse.lastMonth / pulseMax * 100)}%`, background: 'rgba(255,255,255,0.35)', borderRadius: 99 }} /></div>
          </div>
          <p className="small-note" style={{ marginTop: 10 }}>
            {pulse.lastMonth === 0 ? 'This is your first tracked month — your pulse baseline starts here.'
              : pulse.thisMonth <= pulse.lastMonth ? 'Running calmer than last month. That\'s the wellness trend I like to see.'
              : 'Running above last month — could be stock-up wins (good!) or creep (worth a look in the Deals Hub).'}
          </p>
        </div>

        <div className="card">
          <div className="card-title">🏆 Your wins wall</div>
          {wins.length === 0
            ? <p className="small-note">No wins pinned yet — your first price drop or all-time low lands here like a trophy.</p>
            : wins.map((w, i) => (
              <div key={i} className="set-row"><span className="set-row-ico">{w.icon}</span><span className="set-row-txt"><strong style={{ fontWeight: 700, fontSize: 14.5 }}>{w.text}</strong><small>{w.when === 'now' ? 'Right now' : w.when}</small></span></div>
            ))}
        </div>

        <div className="card">
          <div className="card-title">🎯 Today's intention</div>
          {intention ? (<>
            <p style={{ fontSize: 16, fontWeight: 900 }}>"{intention.text}"</p>
            {intention.mission && <p style={{ lineHeight: 1.65, fontSize: 14.5, marginTop: 8 }}>{intention.mission}</p>}
            <button className="ghost-btn" style={{ marginTop: 10 }} onClick={() => { saveIntention(''); try { localStorage.removeItem('priceamnesia:intention'); } catch { /* noop */ } setIntention(null); setMission(null); }}>Set a different intention</button>
          </>) : (<>
            <p className="small-note">Pick one, and Echo turns it into a specific mission with real target prices from your history.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {INTENTIONS.map(t => (
                <button key={t} className="chip-btn" onClick={() => runMission(t)} disabled={missionBusy}>{t}</button>
              ))}
            </div>
            {missionBusy && <p className="small-note" style={{ marginTop: 10 }}>Echo is crafting your mission…</p>}
          </>)}
        </div>

        <div className="card">
          <div className="card-title">🧠 Ask your money coach</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COACH_CHIPS.map(q => (
              <button key={q} className={`chip-btn ${coachQ === q ? 'chip-on' : ''}`} onClick={() => askCoach(q)} disabled={coachBusy}>{q}</button>
            ))}
          </div>
          {coachBusy && <p className="small-note" style={{ marginTop: 10 }}>Echo is thinking like a coach…</p>}
          {coach && (<>
            <p style={{ lineHeight: 1.65, fontSize: 14.5, marginTop: 10 }}>{coach.text}</p>
            <p className="small-note" style={{ marginTop: 6 }}>{sourceNote(coach.source)}</p>
          </>)}
        </div>

        <p className="small-note" style={{ textAlign: 'center', marginTop: 4 }}>Wellness here means knowing your numbers calmly — every figure comes from your own receipts. — Echo</p>
      </div>
    </div>
  );
}

/* ---------------- Bill Lens (v1.9) ---------------- */

function BillFlow({ initialPhoto, onClose, onSave }: {
  initialPhoto: string | null;
  onClose: () => void;
  onSave: (bill: Omit<BillRecord, 'id' | 'createdAt'>) => void;
}) {
  const [photo, setPhoto] = useState<string | null>(initialPhoto);
  const [biller, setBiller] = useState('');
  const [type, setType] = useState<BillType>('other');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [analysis, setAnalysis] = useState<Omit<BillRecord, 'id' | 'photo' | 'createdAt' | 'biller' | 'type' | 'amountDue' | 'dueDate'> | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'working' | 'done' | 'fallback' | 'setup'>('idle');
  const [aiMsg, setAiMsg] = useState('');
  const [saved, setSaved] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const upRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (f: File | undefined, input: HTMLInputElement | null) => {
    if (input) input.value = '';
    if (!f) return;
    try { setPhoto(await compressImage(f)); setAiState('idle'); setAiMsg(''); }
    catch { setAiMsg('That photo could not be opened — try another one.'); }
  };

  const runAi = async () => {
    if (!photo) return;
    setAiState('working'); setAiMsg('Echo is reading your bill…');
    const res = await analyzeBill(photo);
    if (res.ok && res.bill) {
      const b = res.bill;
      setBiller(b.biller); setType(b.type);
      if (b.amountDue !== null) setAmount(b.amountDue.toFixed(2));
      if (b.dueDate) setDue(b.dueDate);
      setAnalysis({ periodStart: b.periodStart, periodEnd: b.periodEnd, accountLast4: b.accountLast4, usage: b.usage, lineItems: b.lineItems, summary: b.summary, watchFor: b.watchFor });
      setAiState('done');
      setAiMsg(b.summary ? 'Echo read it — check the details, fix anything, then save.' : 'Echo read the numbers — check them over, then save.');
    } else if (res.status === 404) {
      setAiState('setup');
      setAiMsg('The bill reader needs its one quick switch-on in Supabase (Milo has the steps — same dance as the receipt reader, the key it needs is already saved). Type the basics below for now and this bill still saves.');
    } else {
      setAiState('fallback');
      setAiMsg(`Echo couldn't reach the bill reader just now (${res.error || 'connection hiccup'}) — she tried 3 times. Tap "Read my bill" again, or type the basics below.`);
    }
  };

  const save = () => {
    onSave({
      biller: biller.trim() || 'Unknown biller',
      type,
      amountDue: amount ? parseFloat(amount) : null,
      dueDate: due || null,
      periodStart: analysis?.periodStart ?? null,
      periodEnd: analysis?.periodEnd ?? null,
      accountLast4: analysis?.accountLast4 ?? null,
      usage: analysis?.usage ?? null,
      lineItems: analysis?.lineItems ?? [],
      summary: analysis?.summary ?? '',
      watchFor: analysis?.watchFor ?? [],
      photo,
    });
    setSaved(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div className="overlay-title">Add a bill</div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={HIDDEN_INPUT_STYLE} onChange={e => pickPhoto(e.target.files?.[0], camRef.current)} />
        <input ref={upRef} type="file" accept="image/*" style={HIDDEN_INPUT_STYLE} onChange={e => pickPhoto(e.target.files?.[0], upRef.current)} />
        {photo ? (
          <div className={aiState === 'working' ? 'scanning' : ''}>
            <img src={photo} alt="Your bill" style={{ width: '100%', borderRadius: 16, border: '1px solid var(--stroke)' }} />
          </div>
        ) : (
          <div className="upload-row" style={{ marginTop: 4 }}>
            <button className="pill-btn" onClick={() => camRef.current?.click()}>📸 Snap the bill</button>
            <button className="pill-btn gold" onClick={() => upRef.current?.click()}>📁 Upload a photo</button>
          </div>
        )}
        {photo && aiState !== 'done' && (
          <button className="big-btn" style={{ marginTop: 12 }} onClick={runAi} disabled={aiState === 'working'}>
            {aiState === 'working' ? 'Reading…' : '✨ Read my bill'}
          </button>
        )}
        {aiMsg && <div className={`ai-status ${aiState === 'done' ? 'done' : aiState === 'working' ? 'working' : 'fallback'}`}>{aiMsg}</div>}
        {analysis && aiState === 'done' && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">🔮 Echo's interpretation</div>
            <p className="small-note" style={{ lineHeight: 1.6 }}>{analysis.summary || 'No summary came back — the numbers above are the read.'}</p>
            {analysis.watchFor.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {analysis.watchFor.map((w, i) => <span key={i} className="plus-chip">⚠️ {w}</span>)}
              </div>
            )}
            {analysis.lineItems.length > 0 && <p className="small-note" style={{ marginTop: 8 }}>{analysis.lineItems.length} charge lines captured — see them after saving, in the bill's page.</p>}
            {analysis.usage && <p className="small-note" style={{ marginTop: 4 }}>Usage read: {analysis.usage}</p>}
          </div>
        )}
        <div className="card" style={{ marginTop: 12 }}>
          <label className="fld-label">Biller</label>
          <input value={biller} onChange={e => setBiller(e.target.value)} placeholder="e.g. City Power" />
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <label className="fld-label">Amount due</label>
              <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" style={{ width: '100%', minWidth: 0 }} />
            </div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <label className="fld-label">Due date</label>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ width: '100%', minWidth: 0 }} />
            </div>
          </div>
          <label className="fld-label" style={{ marginTop: 10 }}>Type</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(BILL_ICONS) as BillType[]).map(t => (
              <button key={t} className={`chip-btn ${type === t ? 'chip-on' : ''}`} onClick={() => setType(t)}>{BILL_ICONS[t]} {t}</button>
            ))}
          </div>
        </div>
        <button className="big-btn" style={{ marginTop: 12 }} onClick={save} disabled={saved || (!biller.trim() && !amount)}>
          {saved ? '✅ Saved!' : 'Save this bill'}
        </button>
      </div>
    </div>
  );
}

function BillsHub({ bills, accounts, onSnap, onUpload, onManual, onOpenBill, onClose }: { accounts: Account[];
  bills: BillRecord[];
  onSnap: () => void; onUpload: () => void; onManual: () => void;
  onOpenBill: (id: string) => void; onClose: () => void;
}) {
  const dueSoon = bills
    .filter(b => b.dueDate && daysUntil(b.dueDate) <= 21)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
  const latestByBiller = [...new Map(
    [...bills].sort((a, b) => b.createdAt - a.createdAt).map(b => [b.biller, b]),
  ).values()];
  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div>
            <div className="overlay-title" style={{ fontSize: 22 }}>Bill Lens</div>
            <div className="small-note">Read & understand any bill</div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="upload-row" style={{ marginTop: 2 }}>
          <button className="pill-btn" onClick={onSnap}>📸 Snap a bill</button>
          <button className="pill-btn" onClick={onUpload}>📁 Upload</button>
          <button className="pill-btn gold" onClick={onManual}>✍️ Type it in</button>
        </div>

        {dueSoon.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title">⏰ Due soon</div>
            {accounts.length > 0 && (() => { const pic = moneyPicture(accounts, bills, [], []); return (
              <p className="small-note" style={{ marginBottom: 8 }}>🏦 Liquid on hand <strong>{money(pic.liquid)}</strong> · due in 14 days <strong>{money(pic.dueNext14)}</strong> — {pic.dueNext14 === 0 ? 'nothing due — clear runway.' : pic.covered ? 'covered ✓' : '⚠️ a gap to plan for.'}</p>
            ); })()}
            {dueSoon.map(b => (
              <button key={b.id} className="set-row" onClick={() => onOpenBill(b.id)}>
                <span className="set-row-ico">{BILL_ICONS[b.type]}</span>
                <span className="set-row-txt"><strong>{b.biller}</strong><small style={{ color: daysUntil(b.dueDate!) < 0 ? 'var(--rise)' : daysUntil(b.dueDate!) <= 3 ? 'var(--gold)' : undefined }}>{dueLabel(b.dueDate!)} · {prettyDate(b.dueDate!)}</small></span>
                <span style={{ fontWeight: 900 }}>{b.amountDue !== null ? money(b.amountDue) : '—'}</span>
              </button>
            ))}
          </div>
        )}

        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title">Your bills</div>
          {bills.length === 0 ? (
            <p className="small-note">No bills yet. Snap the next one that lands — electric, water, phone, medical, any of them — and Echo will read it, explain it in plain English, and keep every one here so month-to-month changes jump out.</p>
          ) : latestByBiller.map(b => {
            const count = bills.filter(x => x.biller === b.biller).length;
            const chg = changeVsPrev(b, bills);
            return (
              <button key={b.id} className="set-row" onClick={() => onOpenBill(b.id)}>
                <span className="set-row-ico">{BILL_ICONS[b.type]}</span>
                <span className="set-row-txt"><strong>{b.biller}</strong><small>{count} bill{count === 1 ? '' : 's'} saved{chg !== null ? ` · ${chg > 0 ? '▲' : '▼'} ${Math.abs(chg)}% vs previous` : ''}</small></span>
                <span style={{ fontWeight: 900 }}>{b.amountDue !== null ? money(b.amountDue) : '—'}</span>
              </button>
            );
          })}
        </div>
        <p className="small-note" style={{ textAlign: 'center' }}>Bills live on this phone. Photos are only sent to the reader when you tap Read.</p>
      </div>
    </div>
  );
}

function BillDetail({ bill, all, accounts, onDelete, onClose, onResolve }: {
  bill: BillRecord; all: BillRecord[]; accounts: Account[];
  onDelete: (id: string) => void; onClose: () => void; onResolve?: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [answer, setAnswer] = useState<AiSlot>(null);
  const [asking, setAsking] = useState(false);
  const chg = changeVsPrev(bill, all);
  const history = all.filter(b => b.biller === bill.biller).sort((a, b) => a.createdAt - b.createdAt);
  const askEcho = async () => {
    setAsking(true);
    const ctx = `Bill from ${bill.biller} (${bill.type}). Amount due: ${bill.amountDue !== null ? money(bill.amountDue) : 'unknown'}. Due: ${bill.dueDate || 'unknown'}. Period: ${bill.periodStart || '?'} to ${bill.periodEnd || '?'}. Usage: ${bill.usage || 'n/a'}. Charges: ${bill.lineItems.map(l => `${l.label} ${money(l.amount)}`).join('; ') || 'none captured'}. Echo's earlier interpretation: ${bill.summary || 'none'}${chg !== null ? `. This bill is ${chg > 0 ? 'up' : 'down'} ${Math.abs(chg)}% vs the previous ${bill.biller} bill.` : ''}${bankContextLine(accounts) ? ` ${bankContextLine(accounts)}` : ''}`;
    const cloud = await askCloud(`Explain this ${bill.biller} bill to me like a helpful friend: where is my money going on it, is anything on it unusual or worth questioning, and what is the one thing I should do about it?`, ctx);
    setAnswer(cloud ? { text: cloud, source: 'cloud' } : { text: bill.summary || 'I read this one before my cloud brain was handy — the interpretation from the scan is above, and my numbers here are exact.', source: 'local' });
    setAsking(false);
  };
  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 30 }}>{BILL_ICONS[bill.type]}</span>
            <div>
              <div className="overlay-title" style={{ fontSize: 21 }}>{bill.biller}</div>
              <div className="small-note" style={{ textTransform: 'capitalize' }}>{bill.type}{bill.accountLast4 ? ` · acct …${bill.accountLast4}` : ''}</div>
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="stat-grid">
          <div className="stat-cell"><div className="stat-num solid">{bill.amountDue !== null ? money(bill.amountDue) : '—'}</div><div className="stat-lbl">Amount due</div></div>
          <div className="stat-cell"><div className="stat-num solid">{bill.dueDate ? prettyDate(bill.dueDate) : '—'}</div><div className="stat-lbl">{bill.dueDate ? dueLabel(bill.dueDate) : 'Due date'}</div></div>
          <div className="stat-cell"><div className="stat-num">{chg === null ? '—' : `${chg > 0 ? '+' : ''}${chg}%`}</div><div className="stat-lbl">Vs previous</div></div>
        </div>

        <div className="card">
          <div className="card-title">⚡ Handle this bill</div>
          <button className="set-row" onClick={() => { try { window.open(officialSearchUrl(bill.biller, 'pay my bill online'), '_blank'); } catch { /* noop */ } }}>
            <span className="set-row-ico">💳</span>
            <span className="set-row-txt"><strong>Pay this bill online</strong><small>Opens the search for {bill.biller}'s official pay page — check the address is really theirs before paying</small></span>
            <span className="set-row-chev">↗</span>
          </button>
          <button className="set-row" onClick={() => { try { window.open(mapsUrl(`${bill.biller} payment center office`), '_blank'); } catch { /* noop */ } }}>
            <span className="set-row-ico">📍</span>
            <span className="set-row-txt"><strong>Pay in person near you</strong><small>{bill.biller} payment centers & offices — ranked by closest, with navigation</small></span>
            <span className="set-row-chev">↗</span>
          </button>
          <button className="set-row" onClick={() => { try { window.open(mapsUrl('bill payment service money center'), '_blank'); } catch { /* noop */ } }}>
            <span className="set-row-ico">🏪</span>
            <span className="set-row-txt"><strong>Any bill-pay location</strong><small>Money centers & bill-pay counters near you — most take utility & phone bills for a small fee</small></span>
            <span className="set-row-chev">↗</span>
          </button>
          {onResolve && (
            <button className="set-row" onClick={onResolve}>
              <span className="set-row-ico">🛟</span>
              <span className="set-row-txt"><strong>Something wrong? Ways to handle it</strong><small>The fight plan for this kind of bill — steps, scripts, complaint channels</small></span>
              <span className="set-row-chev">›</span>
            </button>
          )}
          {accounts.length > 0 && bill.amountDue !== null && (() => { const liquid = moneyPicture(accounts, all, [], []).liquid; const ok = liquid >= (bill.amountDue ?? 0); const linked = accounts.some(a => a.plaidId); return (
            <p className="small-note" style={{ marginTop: 10, lineHeight: 1.6 }}>{ok
              ? `🏦 Covered — your ${linked ? 'linked ' : ''}accounts hold ${money(liquid)} liquid, so this ${money(bill.amountDue)} bill fits.`
              : `⚠️ Heads-up — your ${linked ? 'linked ' : ''}accounts hold ${money(liquid)} liquid, less than this ${money(bill.amountDue)} bill. The options below can help close the gap.`}</p>
          ); })()}
        </div>

        {bill.summary && (
          <div className="card insight-card">
            <div className="card-title">🔮 Echo's interpretation</div>
            <p className="small-note" style={{ lineHeight: 1.65 }}>{bill.summary}</p>
            {bill.watchFor.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {bill.watchFor.map((w, i) => <span key={i} className="plus-chip">⚠️ {w}</span>)}
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-title">🧠 Ask Echo about this bill</div>
          {!answer && !asking && <button className="big-btn" onClick={askEcho}>Explain it & tell me what to do</button>}
          {asking && <p className="small-note">Echo is studying this bill…</p>}
          {answer && (<>
            <p style={{ lineHeight: 1.65, fontSize: 14.5 }}>{answer.text}</p>
            <p className="small-note" style={{ marginTop: 6 }}>{answer.source === 'cloud' ? '☁️ Echo\'s cloud brain' : '📱 Composed on-device'}</p>
          </>)}
        </div>

        {bill.lineItems.length > 0 && (
          <div className="card">
            <div className="card-title">Charges on this bill</div>
            {bill.lineItems.map((l, i) => (
              <div className="history-row" key={i}><span>{l.label}</span><strong>{money(l.amount)}</strong></div>
            ))}
            {bill.usage && <p className="small-note" style={{ marginTop: 8 }}>Usage: {bill.usage}</p>}
            {(bill.periodStart || bill.periodEnd) && <p className="small-note">Period: {bill.periodStart || '?'} → {bill.periodEnd || '?'}</p>}
          </div>
        )}

        {history.length > 1 && (
          <div className="card">
            <div className="card-title">{bill.biller} history</div>
            {[...history].reverse().map(h => (
              <div className="history-row" key={h.id}><span>{h.dueDate ? prettyDate(h.dueDate) : new Date(h.createdAt).toLocaleDateString()}</span><strong>{h.amountDue !== null ? money(h.amountDue) : '—'}</strong></div>
            ))}
          </div>
        )}

        {bill.photo && <img src={bill.photo} alt="The bill" style={{ width: '100%', borderRadius: 16, border: '1px solid var(--stroke)' }} />}

        {confirmDel
          ? <button className="danger-btn" onClick={() => { onDelete(bill.id); onClose(); }}>Tap again — delete this bill forever</button>
          : <button className="ghost-btn" onClick={() => setConfirmDel(true)}>Delete this bill</button>}
      </div>
    </div>
  );
}

/* ---------------- Resolution Center (v1.10) ---------------- */

function ResolveHub({ bills, receipts, initialTopicId, focusBill, onOpenBills, onClose }: {
  bills: BillRecord[]; receipts: Receipt[];
  initialTopicId?: string | null; focusBill?: BillRecord | null;
  onOpenBills: () => void; onClose: () => void;
}) {
  const [cat, setCat] = useState<ResolveCat | 'all'>('all');
  const [topicId, setTopicId] = useState<string | null>(initialTopicId || null);
  const [plan, setPlan] = useState<AiSlot>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [nearText, setNearText] = useState('');
  const [nearLabel, setNearLabel] = useState<string | null>(null);
  const topic = topicId ? topicById(topicId) : undefined;
  const openUrl = (u: string) => { try { window.open(u, '_blank'); } catch { /* noop */ } };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const pos = await CapGeolocation.getCurrentPosition({ timeout: 8000, enableHighAccuracy: false });
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
        const data = await res.json();
        const a = data?.address || {};
        const city = a.city || a.town || a.village || a.suburb || a.county || '';
        const state = a.state_code || a.state || '';
        if (live && city) setNearLabel(`📍 You're near ${city}${state ? ', ' + state : ''} — place results open in Maps, ranked by closest first, each with its own Navigate button.`);
      } catch { /* location off/denied — Maps still ranks by the phone's own location */ }
    })();
    return () => { live = false; };
  }, []);
  const shown = cat === 'all' ? TOPICS : TOPICS.filter(t => t.cat === cat);

  const runPlan = async (t: Topic) => {
    setPlanBusy(true); setPlan(null);
    const ctx = [
      `Resolution topic: ${t.title}. ${t.about}`,
      'Standard ladder: ' + t.steps.join(' | '),
      focusBill ? `The user's actual bill: ${focusBill.biller} (${focusBill.type}), amount due ${focusBill.amountDue !== null ? money(focusBill.amountDue) : 'unknown'}, due ${focusBill.dueDate || 'unknown'}${focusBill.summary ? `. Echo's read of it: ${focusBill.summary}` : ''}` : '',
      `The user has ${bills.length} bills and ${receipts.length} grocery receipts saved in the app to use as evidence.`,
    ].filter(Boolean).join('\n');
    const cloud = await askCloud(`Make me a personal battle plan for this fight: the exact order of moves, what to say at each step, and what outcome to accept vs escalate. Use the context — especially my actual bill if one is included.`, ctx);
    setPlan(cloud ? { text: cloud, source: 'cloud' } : { text: `Here's your ladder: ${t.steps.join(' Then: ')} Open with this line: ${t.script}`, source: 'local' });
    setPlanBusy(false);
  };

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div>
            <div className="overlay-title" style={{ fontSize: 22 }}>🛟 Resolution Center</div>
            <div className="small-note">The right channel for every money fight</div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        {!topic && (<>
          <div className="echo-says">
            <Orb mood="calm" size={34} />
            <p>Something wrong — a bill, a price, a charge? Pick the fight below. I'll show you who to contact, in what order, what to say, and what evidence to bring. Your saved bills and receipts in this app are half the battle already.</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <button className={`chip-btn ${cat === 'all' ? 'chip-on' : ''}`} onClick={() => setCat('all')}>All fights</button>
            {CATS.map(c => <button key={c.v} className={`chip-btn ${cat === c.v ? 'chip-on' : ''}`} onClick={() => setCat(c.v)}>{c.label}</button>)}
          </div>
          {shown.map(t => (
            <button key={t.id} className="set-row" onClick={() => { setTopicId(t.id); setPlan(null); }}>
              <span className="set-row-ico">{t.icon}</span>
              <span className="set-row-txt"><strong>{t.title}</strong><small>{t.about}</small></span>
              <span className="set-row-chev">›</span>
            </button>
          ))}
          <p className="small-note" style={{ textAlign: 'center', marginTop: 10 }}>General information about US consumer channels — not legal advice.</p>
        </>)}

        {topic && (<>
          <div className="overlay-head" style={{ marginBottom: 10 }}>
            <button className="x-btn" onClick={() => setTopicId(null)}>‹</button>
            <div className="overlay-title" style={{ fontSize: 19 }}>{topic.icon} {topic.title}</div>
            <span style={{ width: 38 }} />
          </div>
          <p className="small-note" style={{ lineHeight: 1.6 }}>{topic.about}</p>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title">Your evidence — already in this app</div>
            {topic.gather.map((g, i) => <p key={i} className="insight-line">{g}</p>)}
            {topic.cat === 'bills' && <button className="pill-btn gold" style={{ marginTop: 8 }} onClick={onOpenBills}>Open my bills ({bills.length})</button>}
            {topic.cat === 'prices' && <p className="small-note" style={{ marginTop: 8 }}>You have {receipts.length} grocery receipt{receipts.length === 1 ? '' : 's'} saved — that's your evidence folder.</p>}
          </div>

          <div className="card">
            <div className="card-title">The ladder — in this order</div>
            {topic.steps.map((s, i) => (
              <div key={i} className="alert-line"><span style={{ fontWeight: 900, color: 'var(--cyan)' }}>{i + 1}.</span><span>{s}</span></div>
            ))}
          </div>

          <div className="card insight-card">
            <div className="card-title">🗣️ Say this</div>
            <p style={{ lineHeight: 1.65, fontSize: 15, fontStyle: 'italic' }}>{topic.script}</p>
          </div>

          <div className="card">
            <div className="card-title">Channels</div>
            {topic.channels.map((c, i) => (
              <div key={i} className="set-row"><span className="set-row-txt"><strong>{c.name}</strong><small>{c.detail}</small></span></div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">🔗 Do it online</div>
            {focusBill && (
              <button className="set-row" onClick={() => openUrl(officialSearchUrl(focusBill.biller, 'pay my bill online'))}>
                <span className="set-row-ico">💳</span>
                <span className="set-row-txt"><strong>Pay or manage your {focusBill.biller} bill</strong><small>Opens the search for their official pay page — check the address is really theirs before paying</small></span>
                <span className="set-row-chev">↗</span>
              </button>
            )}
            {topic.links.map((l, i) => (
              <button key={i} className="set-row" onClick={() => openUrl(l.url)}>
                <span className="set-row-ico">🔗</span>
                <span className="set-row-txt"><strong>{l.label}</strong><small>{l.url.replace('https://', '').replace('www.', '').split('/')[0]}</small></span>
                <span className="set-row-chev">↗</span>
              </button>
            ))}
          </div>

          <div className="card">
            <div className="card-title">📍 Places near you</div>
            <p className="small-note" style={{ lineHeight: 1.6 }}>{nearLabel || 'Tap a place below — it opens in Maps, ranked by closest to you, with a Navigate button on every result.'}</p>
            <input value={nearText} onChange={e => setNearText(e.target.value)} placeholder="Or search near a city or ZIP instead…" style={{ marginTop: 10 }} />
            {focusBill && topic.cat === 'bills' && (
              <button className="set-row" onClick={() => openUrl(mapsUrl(`${focusBill.biller} payment center office`, nearText))}>
                <span className="set-row-ico">🏢</span>
                <span className="set-row-txt"><strong>{focusBill.biller} — payment centers & offices</strong><small>Ranked by closest{nearText ? ` to ${nearText}` : ''}</small></span>
                <span className="set-row-chev">↗</span>
              </button>
            )}
            {topic.places.map((pl, i) => (
              <button key={i} className="set-row" onClick={() => openUrl(mapsUrl(pl.query, nearText))}>
                <span className="set-row-ico">📍</span>
                <span className="set-row-txt"><strong>{pl.label}</strong><small>Ranked by closest{nearText ? ` to ${nearText}` : ''} · tap a result in Maps to navigate</small></span>
                <span className="set-row-chev">↗</span>
              </button>
            ))}
          </div>

          <div className="card">
            <div className="card-title">🧠 Echo's battle plan</div>
            {!plan && !planBusy && <button className="big-btn" onClick={() => runPlan(topic)}>Plan my fight{focusBill ? ` — for my ${focusBill.biller} bill` : ''}</button>}
            {planBusy && <p className="small-note">Echo is mapping your fight…</p>}
            {plan && (<>
              <p style={{ lineHeight: 1.65, fontSize: 14.5 }}>{plan.text}</p>
              <p className="small-note" style={{ marginTop: 6 }}>{plan.source === 'cloud' ? '☁️ Echo\'s cloud brain' : '📱 Composed on-device'}</p>
            </>)}
          </div>
          <p className="small-note" style={{ textAlign: 'center' }}>General information — not legal advice. Deadlines and laws vary by state.</p>
        </>)}
      </div>
    </div>
  );
}

/* ---------------- Monthly budgets (v1.13) ---------------- */

function BudgetSection({ receipts, bills, ledger, accounts, stats, entries, transactions }: { receipts: Receipt[]; bills: BillRecord[]; ledger: LedgerEntry[]; accounts: Account[]; stats: ItemStats[]; entries: PriceEntry[]; transactions: BankTransaction[] }) {
  const [budgets, setBudgetsState] = useState<Record<string, number>>(() => loadBudgets());
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmt, setEditAmt] = useState('');
  const [coach, setCoach] = useState<AiSlot>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const now = new Date();
  const rows = budgetRows(budgets, receipts, bills, ledger, now, transactions);
  const advice = localBudgetAdvice(rows, now);
  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalLeft = totalLimit - totalSpent;
  const daysLeft = daysLeftInMonth(now);
  // v1.28.1: month only — "November 2026" made the card title wrap with a
  // lone "2026" orphaned on line 2 on a 390px phone.
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const setBudgets = (b: Record<string, number>) => { setBudgetsState(b); saveBudgets(b); };
  const barColor = (s: BudgetRow['state']) => s === 'over' ? 'var(--rise)' : s === 'hot' ? 'var(--gold)' : 'linear-gradient(90deg, var(--cyan), var(--violet))';

  const runCoach = async () => {
    setCoachBusy(true);
    const ctx = rows.map(r => `${r.cat.label}: spent ${money(r.spent)} of ${money(r.limit)} budget (${Math.round(r.pct * 100)}%, ${r.state})`).join('\n')
      + `\nMonth: ${monthName}, ${daysLeft} days left. Total left across budgets: ${money(totalLeft)}.${bankContextLine(accounts) ? ` ${bankContextLine(accounts)}` : ''}${habitContextLine({ receipts, bills, ledger, accounts, stats, entries, budgets }) ? ` ${habitContextLine({ receipts, bills, ledger, accounts, stats, entries, budgets })}` : ''}`;
    const cloud = await askCloud('You are my budget coach. Looking at my category budgets vs what I have actually spent this month, tell me where I stand, the one category to watch, and a realistic move for the rest of the month using my real numbers.', ctx);
    setCoach(cloud ? { text: cloud, source: 'cloud' } : { text: advice.join(' '), source: 'local' });
    setCoachBusy(false);
  };

  return (
    <div className="card">
      <div className="card-title">🎯 Monthly budgets — {monthName}</div>
      {/* v1.28.1: stacked, not space-between — the two halves together are
          wider than the card, so each wrapped mid-number on a phone. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, fontWeight: 800, color: 'var(--dim)' }}>
        <span>Spent {money(totalSpent)} of {money(totalLimit)}</span>
        <span>{totalLeft >= 0 ? `${money(totalLeft)} left · ≈ ${money(totalLeft / daysLeft)}/day` : `Over by ${money(Math.abs(totalLeft))}`}</span>
      </div>
      <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginTop: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, Math.round(totalSpent / Math.max(1, totalLimit) * 100))}%`, background: totalLeft >= 0 ? 'linear-gradient(90deg, var(--cyan), var(--violet))' : 'var(--rise)', borderRadius: 99 }} />
      </div>
      {accounts.some(a => a.plaidId) && (
        <p className="small-note" style={{ marginTop: 8, lineHeight: 1.6 }}>🏦 Money you actually have in linked accounts: <strong>{money(linkedLiquid(accounts))}</strong> — {totalLeft >= 0 ? `your budgets still have ${money(totalLeft)} of room inside it.` : `your budgets run ${money(Math.abs(totalLeft))} past it. The coach below can find the room.`}</p>
      )}

      {rows.map(r => (
        <div key={r.cat.id} style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 17 }}>{r.cat.icon}</span>
            <span style={{ flex: 1, fontWeight: 800, fontSize: 14.5 }}>{r.cat.label}
              <span className="small-note" style={{ display: 'block', fontWeight: 600 }}>
                {r.cat.source === 'bills' ? 'auto from Bill Lens' : 'auto from receipts + bank + logs'}
              </span>
            </span>
            <span style={{ fontWeight: 900, fontSize: 14, color: r.state === 'over' ? 'var(--rise)' : r.state === 'hot' ? 'var(--gold)' : 'var(--txt)' }}>{money(r.spent)} <span style={{ color: 'var(--faint)', fontWeight: 700 }}>/ {money(r.limit)}</span></span>
            <button className="chip-btn" onClick={() => { setEditId(editId === r.cat.id ? null : r.cat.id); setEditAmt(String(r.limit)); }}>Set</button>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginTop: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.round(r.pct * 100))}%`, background: barColor(r.state), borderRadius: 99 }} />
          </div>
          <div className="small-note" style={{ marginTop: 3 }}>
            {r.state === 'over' ? `🔴 Over by ${money(Math.abs(r.left))}` : r.state === 'hot' ? `🟠 Pacing hot — ${money(r.left)} left` : `${money(r.left)} left`}
          </div>
          {editId === r.cat.id && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={editAmt} onChange={e => setEditAmt(e.target.value)} inputMode="decimal" placeholder="Monthly limit $" style={{ flex: 1, minWidth: 0 }} />
              <button className="pill-btn gold" onClick={() => { const v = parseFloat(editAmt); if (!isNaN(v) && v >= 0) setBudgets({ ...budgets, [r.cat.id]: v }); setEditId(null); }}>Save</button>
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 14 }}>
        {[...advice, ...habitAdvice({ receipts, bills, ledger, accounts, stats, entries, budgets })].map((a, i) => <p key={i} className="insight-line">{a}</p>)}
      </div>
      {!coach && !coachBusy && <button className="big-btn" style={{ marginTop: 10 }} onClick={runCoach}>🧠 Ask Echo's budget coach</button>}
      {coachBusy && <p className="small-note" style={{ marginTop: 10 }}>Echo is reading your budgets against your real spending…</p>}
      {coach && (<>
        <p style={{ lineHeight: 1.65, fontSize: 14.5, marginTop: 10 }}>{coach.text}</p>
        <p className="small-note" style={{ marginTop: 6 }}>{coach.source === 'cloud' ? '☁️ Echo\'s cloud brain' : '📱 Composed on-device'}</p>
      </>)}
      <p className="small-note" style={{ marginTop: 10 }}>Receipts fill their own category automatically — groceries, gas, dining, all of them. For cash spending, log it in This month's flow below and pick the category.</p>
    </div>
  );
}

/* ---------------- Bank & Cash Flow Hub (v1.10) ---------------- */

function BankHub({ accounts, bills, receipts, ledger, stats, entries, transactions, onAccounts, onLedger, onTransactions, onClose }: {
  accounts: Account[]; bills: BillRecord[]; receipts: Receipt[]; ledger: LedgerEntry[];
  stats: ItemStats[]; entries: PriceEntry[]; transactions: BankTransaction[];
  onAccounts: (a: Account[]) => void; onLedger: (l: LedgerEntry[]) => void; onTransactions: (t: BankTransaction[]) => void; onClose: () => void;
}) {
  // v1.28.14: buys with no matching scanned receipt are the ones that still
  // need to count — matched buys already count through their receipt.
  const matchedMap = matchReceipts(receipts, transactions);
  const unmatchedTxns = unmatchedTransactions(receipts, transactions);
  const monthBank = monthOutflow(unmatchedTxns);
  const pic = moneyPicture(accounts, bills, receipts, ledger, new Date(), monthBank);
  const habitInp = { receipts, entries, stats, bills, accounts, ledger, budgets: loadBudgets() };
  const suggestions = [...localBankSuggestions(pic, accounts), ...habitAdvice(habitInp)];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('checking');
  const [bal, setBal] = useState('');
  // v1.28.6: shown under the add-account form when the tap can't proceed
  // (empty/invalid balance) — the button used to fail silently.
  const [addHint, setAddHint] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editBal, setEditBal] = useState('');
  const [logKind, setLogKind] = useState<'income' | 'expense'>('income');
  const [logCat, setLogCat] = useState('dining');
  const [logLabel, setLogLabel] = useState('');
  const [logAmt, setLogAmt] = useState('');
  const [coach, setCoach] = useState<AiSlot>(null);
  const [coachBusy, setCoachBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const hasLinked = accounts.some(a => a.plaidId) || plaidWasLinked();

  // Opening the hub quietly refreshes linked-bank balances AND purchases
  // (backend verified live 2026-10-22). The hub unmounts when closed, so
  // this runs on EVERY open, not just the first. A failed auto-sync is said
  // out loud here (v1.28.7) instead of failing silently — manual numbers
  // keep working.
  useEffect(() => {
    if (!plaidWasLinked()) return;
    let alive = true;
    syncBankData(accounts)
      .then(d => { if (alive) { onAccounts(d.accounts); onTransactions(d.transactions); } })
      .catch(() => { if (alive) setLinkMsg("Couldn't reach the bank — showing last saved balances."); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshLinked = async () => {
    setLinkBusy(true); setLinkMsg('Refreshing your bank balances and purchases…');
    try {
      const remote = await fetchPlaidAccounts();
      if (remote.length) { const d = await syncBankData(accounts); onAccounts(d.accounts); onTransactions(d.transactions); setLinkMsg('Balances and purchases are fresh ✓'); }
      else setLinkMsg('No linked bank found yet — link one below.');
    } catch { setLinkMsg('Refresh did not go through. Check your connection and try again.'); }
    setLinkBusy(false);
  };
  const doLink = async () => {
    setLinkBusy(true); setLinkMsg('Opening your bank\u2019s secure login…');
    const r = await openBankLink();
    setLinkMsg(r.message);
    if (r.linked) {
      try { const d = await syncBankData(accounts); onAccounts(d.accounts); onTransactions(d.transactions); } catch { /* accounts appear on next open */ }
    }
    setLinkBusy(false);
  };
  const [confirmBank, setConfirmBank] = useState<string | null>(null);
  const banks = groupLinkedBanks(accounts);
  const doReconnect = async (bank: LinkedBank) => {
    if (!bank.itemId) return;
    setLinkBusy(true); setLinkMsg(`Opening ${bank.institution}\u2019s secure login…`);
    const r = await openBankUpdate(bank.itemId);
    setLinkMsg(r.message);
    if (r.linked) { try { const d = await syncBankData(accounts); onAccounts(d.accounts); onTransactions(d.transactions); } catch { /* next open */ } }
    setLinkBusy(false);
  };
  const doRemoveBank = async (bank: LinkedBank) => {
    setConfirmBank(null);
    if (!bank.itemId) {
      bank.accounts.forEach(a => { if (a.plaidId) hidePlaidAccount(a.plaidId); });
      onAccounts(accounts.filter(a => !bank.accounts.includes(a)));
      setLinkMsg(`Removed ${bank.institution} from the app.`);
      return;
    }
    setLinkBusy(true); setLinkMsg(`Removing ${bank.institution}…`);
    try { await unlinkBank(bank.itemId); }
    catch { setLinkMsg('Remove did not go through — check your connection and try again.'); setLinkBusy(false); return; }
    unhidePlaidAccounts(bank.accounts.map(a => a.plaidId).filter(Boolean) as string[]);
    onAccounts(accounts.filter(a => a.plaidItem !== bank.itemId));
    setLinkMsg(`${bank.institution} unlinked — its token was revoked and deleted.`);
    setLinkBusy(false);
  };

  const addAccount = () => {
    const b = parseFloat(bal);
    if (isNaN(b)) { setAddHint('Add a balance first.'); return; }
    // v1.28.6: an empty name used to silently swallow the tap, so the
    // button looked dead (a 2000 balance with no name never saved).
    // Default the name to the selected kind's label instead.
    const label = name.trim() || (kind.charAt(0).toUpperCase() + kind.slice(1));
    onAccounts([...accounts, { id: uid(), name: label, kind, balance: b, history: [{ at: Date.now(), balance: b }], updatedAt: Date.now() }]);
    setName(''); setBal(''); setAddHint('');
  };
  const saveEdit = (a: Account) => {
    const b = parseFloat(editBal);
    if (isNaN(b)) return;
    onAccounts(accounts.map(x => x.id === a.id ? { ...x, balance: b, history: [...x.history, { at: Date.now(), balance: b }].slice(-24), updatedAt: Date.now() } : x));
    setEditId(null);
  };
  const trend = (a: Account) => {
    if (a.history.length < 2) return null;
    const d = a.balance - a.history[0].balance;
    return d === 0 ? '→ steady' : d > 0 ? `▲ ${money(d)} since first tracked` : `▼ ${money(Math.abs(d))} since first tracked`;
  };
  const addLog = () => {
    const amt = parseFloat(logAmt);
    if (!logLabel.trim() || isNaN(amt) || amt <= 0) return;
    onLedger([{ id: uid(), kind: logKind, label: logLabel.trim(), amount: amt, date: new Date().toISOString().slice(0, 10), createdAt: Date.now(), category: logKind === 'expense' ? logCat : undefined }, ...ledger]);
    setLogLabel(''); setLogAmt('');
  };
  const runCoach = async () => {
    setCoachBusy(true);
    const ctx = [
      `Accounts: ${accounts.map(a => `${a.name} (${a.kind}) ${money(a.balance)}`).join('; ') || 'none yet'}.`,
      `Liquid ${money(pic.liquid)}, credit debt ${money(pic.debt)}, net position ${money(pic.net)}. Bills due in next 14 days: ${money(pic.dueNext14)} across ${pic.dueCount} bills — ${pic.covered ? 'covered' : 'NOT fully covered'}.`,
      `This month so far: income logged ${money(pic.monthIn)}; out — groceries ${money(pic.monthGroceries)}, bills ${money(pic.monthBills)}, other ${money(pic.monthOtherOut)}, bank card buys ${money(pic.monthBank)}; net ${money(pic.monthNet)}. Bank card buys are the ones with no matching scanned receipt${matchedMap.size ? ` — ${matchedMap.size} more buy${matchedMap.size === 1 ? '' : 's'} matched receipts you scanned, same money, counted once` : ''}.`,
      'Budgets: ' + budgetRows(loadBudgets(), receipts, bills, ledger).map(r => `${r.cat.label} ${money(r.spent)}/${money(r.limit)} (${r.state})`).join('; ') + '.',
      buildDealsContext(stats, entries, receipts),
      habitContextLine(habitInp),
    ].join('\n');
    const cloud = await askCloud('You are my money coach looking at my bank picture, bills and grocery prices together. Give me your top suggestions: what to pay, what to protect, and the one move that would calm my money down most this month. Be specific with my numbers.', ctx);
    setCoach(cloud ? { text: cloud, source: 'cloud' } : { text: suggestions.join(' '), source: 'local' });
    setCoachBusy(false);
  };

  const flowRow = (label: string, amt: number, max: number, color: string) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--dim)', fontWeight: 700 }}><span>{label}</span><span>{money(amt)}</span></div>
      <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', marginTop: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(2, Math.round(amt / Math.max(1, max) * 100))}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
  const flowMax = Math.max(pic.monthIn, pic.monthOut, 1);

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div>
            <div className="overlay-title" style={{ fontSize: 22 }}>🏦 Bank & Cash Flow</div>
            <div className="small-note">Your whole money picture — accounts, bills, groceries</div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        <div className="stat-grid">
          <div className="stat-cell"><div className="stat-num solid">{money(pic.net)}</div><div className="stat-lbl">Net position</div></div>
          <div className="stat-cell"><div className="stat-num solid">{money(pic.liquid)}</div><div className="stat-lbl">Liquid money</div></div>
          <div className="stat-cell"><div className="stat-num">{money(pic.debt)}</div><div className="stat-lbl">Credit owed</div></div>
        </div>

        <div className="card">
          <div className="card-title">Your accounts</div>
          {accounts.length === 0 && <p className="small-note">No accounts yet. Add your checking, savings, cards, or cash below — rough numbers are fine, you can freshen them any time and I'll track the trend.</p>}
          {accounts.map(a => (
            <div key={a.id} className="set-row" style={{ display: 'block' }}>
              {/* v1.28.1: the bank subline ("U.S. Bank ••4453 · auto-updated")
                  used to wrap onto its own line, pushing the row to 3 lines
                  and squeezing the balance mid-row. It now ellipsises on one
                  line; balance + button never shrink or wrap. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span className="set-row-ico">{KIND_ICONS[a.kind]}</span>
                <span className="set-row-txt"><strong>{a.name}</strong><small style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.plaidId ? `🏦 ${a.institution || 'Linked bank'}${a.last4 ? ` ••${a.last4}` : ''} · auto-updated` : `${a.kind}${trend(a) ? ` · ${trend(a)}` : ''}`}</small></span>
                <span style={{ fontWeight: 900, flex: 'none', whiteSpace: 'nowrap' }}>{money(a.balance)}</span>
                {!a.plaidId && <button className="chip-btn" style={{ flex: 'none' }} onClick={() => { setEditId(editId === a.id ? null : a.id); setEditBal(String(a.balance)); }}>Update</button>}
                {a.plaidId && <button className="chip-btn" style={{ flex: 'none' }} onClick={() => { setEditId(editId === a.id ? null : a.id); }}>Remove</button>}
              </div>
              {editId === a.id && !a.plaidId && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input value={editBal} onChange={e => setEditBal(e.target.value)} inputMode="decimal" placeholder="New balance" style={{ flex: 1, minWidth: 0 }} />
                  <button className="pill-btn gold" onClick={() => saveEdit(a)}>Save</button>
                  <button className="pill-btn" onClick={() => { onAccounts(accounts.filter(x => x.id !== a.id)); setEditId(null); }}>Delete</button>
                </div>
              )}
              {editId === a.id && a.plaidId && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <span className="small-note" style={{ flex: 1 }}>This balance updates itself from your bank. Removing it here just hides it in the app.</span>
                  <button className="pill-btn" onClick={() => { hidePlaidAccount(a.plaidId!); onAccounts(accounts.filter(x => x.id !== a.id)); setEditId(null); }}>Remove</button>
                </div>
              )}
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            {/* v1.28.1: this input had no width at all, so it rendered at the
                WebView's narrow default and cut the placeholder off mid-word. */}
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Account name — e.g. Chime checking" style={{ width: '100%', minWidth: 0 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {(Object.keys(KIND_ICONS) as AccountKind[]).map(k => (
                <button key={k} className={`chip-btn ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(k)}>{KIND_ICONS[k]} {k}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input value={bal} onChange={e => { setBal(e.target.value); setAddHint(''); }} inputMode="decimal" placeholder="Balance $" style={{ flex: 1, minWidth: 0 }} />
              <button className="pill-btn gold" onClick={addAccount}>Add account</button>
            </div>
            {addHint && <p className="small-note" style={{ color: 'var(--gold)', marginTop: 8 }}>⚠️ {addHint}</p>}
          </div>
        </div>

        {/* v1.28.14: what the bank says you bought — fills in on its own
            when the bank refreshes. The bank only knows the store total;
            your scanned receipts still hold the per-item prices. A buy that
            matches a receipt you scanned is the same money, counted once. */}
        <div className="card">
          <div className="card-title">🛍️ Recent purchases</div>
          <p className="small-note" style={{ lineHeight: 1.6 }}>Your bank's own list of what you bought — no scanning needed. The bank knows the store total; your scanned receipts still hold the per-item prices.</p>
          {!hasLinked && <p className="small-note">No bank linked yet — link one below and your card purchases will show up here on their own.</p>}
          {hasLinked && transactions.length === 0 && <p className="small-note">No card purchases in the last 30 days yet — new buys appear here after each refresh.</p>}
          {transactions.filter(t => t.amount > 0).slice(0, 15).map(t => {
            const acc = accounts.find(a => a.plaidId === t.accountId);
            return (
              <div key={t.id} className="history-row">
                <span>{t.merchant}<div className="h-store">{prettyDate(t.date)}{acc ? ` · ${acc.institution || 'Bank'}${acc.last4 ? ` ••${acc.last4}` : ''}` : ''}{t.pending ? ' · Pending' : ''}{matchedMap.has(t.id) ? ' · ✓ matches a receipt' : ''}</div></span>
                <strong>{money(t.amount)}</strong>
              </div>
            );
          })}
          {transactions.filter(t => t.amount > 0).length > 15 && <p className="small-note" style={{ marginTop: 6 }}>Showing the newest 15 of {transactions.filter(t => t.amount > 0).length} purchases from the last 30 days.</p>}
        </div>

        <div className="card">
          <div className="card-title">🛡️ Next 14 days coverage</div>
          <p className="small-note" style={{ lineHeight: 1.6 }}>
            Bills due: <strong>{money(pic.dueNext14)}</strong> ({pic.dueCount}) · Liquid: <strong>{money(pic.liquid)}</strong><br />
            {pic.dueNext14 === 0 ? 'Nothing due in the next two weeks — the runway is clear.'
              : pic.covered ? '✅ Covered — your liquid money handles everything coming due.'
              : '⚠️ Gap alert — due bills are bigger than your liquid money. That\'s the gap to close first.'}
          </p>
        </div>

        <BudgetSection receipts={receipts} bills={bills} ledger={ledger} accounts={accounts} stats={stats} entries={entries} transactions={transactions} />

        <div className="card">
          <div className="card-title">🌊 This month's flow</div>
          {flowRow('Money in (logged)', pic.monthIn, flowMax, 'var(--drop)')}
          {flowRow('Groceries (your receipts)', pic.monthGroceries, flowMax, 'var(--cyan)')}
          {flowRow('Card purchases (your bank)', pic.monthBank, flowMax, 'var(--rise)')}
          {flowRow('Bills (due this month)', pic.monthBills, flowMax, 'var(--violet)')}
          {flowRow('Other (logged)', pic.monthOtherOut, flowMax, 'var(--gold)')}
          <p className="small-note" style={{ marginTop: 10 }}>Net this month: <strong style={{ color: pic.monthNet >= 0 ? 'var(--drop)' : 'var(--rise)' }}>{money(pic.monthNet)}</strong></p>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className={`chip-btn ${logKind === 'income' ? 'chip-on' : ''}`} onClick={() => setLogKind('income')}>＋ Income</button>
            <button className={`chip-btn ${logKind === 'expense' ? 'chip-on' : ''}`} onClick={() => setLogKind('expense')}>－ Expense</button>
          </div>
          {logKind === 'expense' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {BUDGET_CATS.filter(c => c.source === 'mixed' && c.id !== 'groceries').map(c => (
                <button key={c.id} className={`chip-btn ${logCat === c.id ? 'chip-on' : ''}`} onClick={() => setLogCat(c.id)}>{c.icon} {c.label}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <input value={logLabel} onChange={e => setLogLabel(e.target.value)} placeholder={logKind === 'income' ? 'Paycheck, side gig…' : 'Gas, rent top-up…'} style={{ flex: 1.4, minWidth: 0 }} />
            <input value={logAmt} onChange={e => setLogAmt(e.target.value)} inputMode="decimal" placeholder="$" style={{ flex: 0.7, minWidth: 0 }} />
            <button className="pill-btn gold" onClick={addLog}>Log it</button>
          </div>
          {ledger.slice(0, 4).map(l => {
            const cat = l.category ? BUDGET_CATS.find(c => c.id === l.category) : undefined;
            return <div key={l.id} className="history-row"><span>{l.kind === 'income' ? '＋' : '－'} {l.label}<div className="h-store">{l.date}{cat ? ` · ${cat.icon} ${cat.label}` : ''}</div></span><strong>{money(l.amount)}</strong></div>;
          })}
        </div>

        <div className="card">
          <div className="card-title">🔮 Echo suggests</div>
          {suggestions.map((s, i) => <p key={i} className="insight-line">{s}</p>)}
          {!coach && !coachBusy && <button className="big-btn" style={{ marginTop: 10 }} onClick={runCoach}>🧠 Ask Echo's AI coach</button>}
          {coachBusy && <p className="small-note" style={{ marginTop: 10 }}>Echo is studying your whole money picture…</p>}
          {coach && (<>
            <p style={{ lineHeight: 1.65, fontSize: 14.5, marginTop: 10 }}>{coach.text}</p>
            <p className="small-note" style={{ marginTop: 6 }}>{coach.source === 'cloud' ? '☁️ Echo\'s cloud brain' : '📱 Composed on-device'}</p>
          </>)}
        </div>

        <div className="card">
          <div className="card-title">🔗 Linked banks</div>
          <p className="small-note" style={{ lineHeight: 1.6 }}>
            Each bank logs you in <strong>itself</strong> on its own secure page — this app never sees your passwords, and it can't move your money. Link as many banks as you like; balances stay fresh on their own.
          </p>
          {banks.map(bank => {
            const key = bank.itemId || `inst:${bank.institution}`;
            return (
              <div key={key} className="set-row" style={{ display: 'block' }}>
                {/* v1.28.1: same wrap fix as the account rows above. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span className="set-row-ico">🏦</span>
                  <span className="set-row-txt"><strong>{bank.institution}</strong><small style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bank.accounts.length} account{bank.accounts.length === 1 ? '' : 's'} · auto-updated</small></span>
                  <span style={{ fontWeight: 900, flex: 'none', whiteSpace: 'nowrap' }}>{money(bank.accounts.reduce((s, a) => s + (a.kind === 'credit' ? 0 : a.balance), 0))}</span>
                </div>
                {bank.accounts.map(a => (
                  <div key={a.id} className="history-row"><span>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</span><strong>{money(a.balance)}</strong></div>
                ))}
                {!linkBusy && confirmBank !== key && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {bank.itemId && <button className="chip-btn" onClick={() => doReconnect(bank)}>🔄 Reconnect</button>}
                    <button className="chip-btn" onClick={() => setConfirmBank(key)}>Remove bank</button>
                  </div>
                )}
                {confirmBank === key && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <span className="small-note" style={{ flex: 1 }}>Unlink {bank.institution} for real? Its token gets revoked and deleted — you can re-link any time.</span>
                    <button className="pill-btn" onClick={() => doRemoveBank(bank)}>Yes, remove</button>
                    <button className="pill-btn gold" onClick={() => setConfirmBank(null)}>Keep</button>
                  </div>
                )}
              </div>
            );
          })}
          {!linkBusy && <button className="big-btn" style={{ marginTop: 10 }} onClick={doLink}>{banks.length ? '＋ Link another bank' : '🏦 Link a bank'}</button>}
          {hasLinked && !linkBusy && <button className="pill-btn" style={{ marginTop: 8 }} onClick={refreshLinked}>🔄 Refresh balances</button>}
          {linkBusy && <p className="small-note" style={{ marginTop: 10 }}>Working…</p>}
          {linkMsg && <p className="small-note" style={{ marginTop: 8 }}>{linkMsg}</p>}
        </div>
        <p className="small-note" style={{ textAlign: 'center' }}>Accounts and money logs live on this phone only.</p>
      </div>
    </div>
  );
}

/* ---------------- App root ---------------- */

export default function App() {
  const [receipts, setReceipts] = useState<Receipt[]>(() => loadReceipts());
  const [entries, setEntries] = useState<PriceEntry[]>(() => loadEntries());
  const [tab, setTab] = useState<Tab>('home');
  /* v1.28.10: this app is a single-column phone layout — horizontal scroll
     is never valid. The receipt sheet + keyboard dismissal left the Prices
     screen ~16px off the left edge in 1.28.9 (title clipped, tab bar
     shifted) and the shift stuck because nothing re-zeroed it. After every
     render, snap any stray sideways scroll back to 0. Vertical scroll is
     the user's own — never touched. */
  useEffect(() => {
    if (document.documentElement.scrollLeft) document.documentElement.scrollLeft = 0;
    if (document.body.scrollLeft) document.body.scrollLeft = 0;
  });
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [dealsOpen, setDealsOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false);
  const [testerPlus, setTesterPlusState] = useState<boolean>(() => isPlusLocal());
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'newpassword'>('signin');
  // v1.28.6: an OAuth attempt that came back with an error (e.g. Google) —
  // surfaced inside the sign-in sheet after the browser closes.
  const [oauthError, setOauthError] = useState('');
  /* True while the password-reset screen is open: a recovery session landing
     must NOT auto-close the sheet the way a normal sign-in does. */
  const recoveryOpenRef = useRef(false);
  const [rcPlus, setRcPlus] = useState(false);
  const [plusStatus, setPlusStatus] = useState<PlusStatus | null>(null);
  /* Effective Plus: the 7-tap crown tester toggle OR a live store
     entitlement from RevenueCat. The tester toggle is the dev bypass. */
  const plus = testerPlus || rcPlus;
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [trash, setTrash] = useState<TrashSnapshot | null>(() => loadTrash());
  const homeCamRef = useRef<HTMLInputElement>(null);
  const homeUpRef = useRef<HTMLInputElement>(null);
  const [bills, setBills] = useState<BillRecord[]>(() => loadBills());
  const [accounts, setAccountsState] = useState<Account[]>(() => loadAccounts());
  // v1.28.14: the bank's own list of card buys (last 30 days) — synced
  // alongside balances, stored on-device, merged with scanned receipts.
  const [transactions, setTransactionsState] = useState<BankTransaction[]>(() => loadTransactions());
  const [ledger, setLedgerState] = useState<LedgerEntry[]>(() => loadLedger());
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveTopicId, setResolveTopicId] = useState<string | null>(null);
  const [resolveBill, setResolveBill] = useState<BillRecord | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);
  const [billFlowOpen, setBillFlowOpen] = useState(false);
  const [billPhoto, setBillPhoto] = useState<string | null>(null);
  const [billDetailId, setBillDetailId] = useState<string | null>(null);
  const billCamRef = useRef<HTMLInputElement>(null);
  const billUpRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => itemStats(entries), [entries]);
  const detailItem = detail ? stats.find(s => s.normalized === detail) || null : null;

  const persist = (r: Receipt[], e: PriceEntry[]) => { setReceipts(r); setEntries(e); saveAll(r, e); };

  const persistBills = (b: BillRecord[]) => { setBills(b); saveBills(b); };
  const setAccounts = (a: Account[]) => { setAccountsState(a); saveAccounts(a); };
  const setTransactions = (t: BankTransaction[]) => { setTransactionsState(t); saveTransactions(t); };

  // v1.18: linked-bank benefits everywhere start here — balances quietly
  // refresh at app start so Home, bills, budgets and Echo all speak from
  // fresh numbers without the user opening the Bank hub first. v1.28.14:
  // card purchases ride along with the same refresh.
  useEffect(() => {
    if (!plaidWasLinked()) return;
    syncBankData(loadAccounts()).then(d => { setAccounts(d.accounts); setTransactions(d.transactions); }).catch(() => { /* silent */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Camera-return safety net (mount only): if the WebView was reloaded while
  // the camera app was open, reopen Add Receipt instead of stranding on Home.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_SCAN_KEY);
      if (!raw) return;
      const ts = Number(raw);
      clearPendingScan();
      if (Number.isFinite(ts) && Date.now() - ts < 10 * 60 * 1000) {
        setScanPhoto(null);
        setScanOpen(true);
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setLedger = (l: LedgerEntry[]) => { setLedgerState(l); saveLedger(l); };
  const openResolve = (topicId: string | null, bill: BillRecord | null) => { setResolveTopicId(topicId); setResolveBill(bill); setResolveOpen(true); };
  const handleSaveBill = (bill: Omit<BillRecord, 'id' | 'createdAt'>) => {
    persistBills([{ ...bill, id: uid(), createdAt: Date.now() }, ...bills]);
  };
  const deleteBill = (id: string) => persistBills(bills.filter(b => b.id !== id));
  const detailBill = billDetailId ? bills.find(b => b.id === billDetailId) || null : null;
  const openBillWithPhoto = async (f: File | undefined, input: HTMLInputElement | null) => {
    if (input) input.value = '';
    if (!f) { setBillPhoto(null); setBillFlowOpen(true); return; }
    try { setBillPhoto(await compressImage(f)); } catch { setBillPhoto(null); }
    setBillFlowOpen(true);
  };

  const handleSaveReceipt = (store: string, date: string, photo: string | null, lines: { name: string; price: number; quantity: number | null }[], category?: string) => {
    const receiptId = uid();
    const total = lines.reduce((a, l) => a + l.price, 0);
    const receipt: Receipt = { id: receiptId, store, date, photo, source: photo ? 'scan' : 'manual', total, itemCount: lines.length, createdAt: Date.now(), category: category || detectCategory(store) };
    const newEntries: PriceEntry[] = lines.map(l => ({
      id: uid(), receiptId, name: l.name, normalized: normalizeName(l.name),
      price: l.price, quantity: l.quantity, unit: null, store, date, createdAt: Date.now(),
    }));
    persist([receipt, ...receipts], [...entries, ...newEntries]);
  };

  const deleteReceipt = (id: string) => {
    persist(receipts.filter(r => r.id !== id), entries.filter(e => e.receiptId !== id));
  };

  const setPrefs = (p: Prefs) => { setPrefsState(p); savePrefs(p); };

  const clearAll = () => {
    saveTrash(receipts, entries); // RouteMax-style Recover: erasing keeps a copy
    setTrash(loadTrash());
    persist([], []);
  };
  const recoverTrash = () => {
    const t = loadTrash();
    if (!t) return;
    persist(t.receipts, t.entries);
    clearTrash();
    setTrash(null);
  };
  const restoreBackup = (r: Receipt[], e: PriceEntry[]) => {
    saveTrash(receipts, entries); // current data becomes the recover copy
    setTrash(loadTrash());
    persist(r, e);
  };

  const setPlus = (v: boolean) => { setTesterPlusState(v); setPlusLocal(v); };

  /* v1.28: Supabase session (persists across restarts) + RevenueCat Plus.
     Sign-in is optional — a null user is a normal signed-out state. */
  const refreshPlusNow = async (uid: string | null) => {
    const s = await getPlusStatus(uid);
    setPlusStatus(s.active ? s : null);
    setRcPlus(s.active);
  };
  useEffect(() => {
    let live = true;
    getCurrentUser().then(u => { if (live) setUser(u); });
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      setUser(session?.user ?? null);
      // Password-reset link tapped: Supabase emits PASSWORD_RECOVERY when the
      // recovery session lands — open the set-a-new-password screen.
      if (ev === 'PASSWORD_RECOVERY') {
        recoveryOpenRef.current = true;
        setAuthMode('newpassword');
        setAuthOpen(true);
      }
    });
    return () => { live = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Close the sign-in sheet once a session lands — unless the sheet is the
    // password-reset screen, which the recovery session itself opened.
    if (user && !recoveryOpenRef.current) setAuthOpen(false);
    // Plus follows the signed-in account (RevenueCat logIn + entitlement).
    void refreshPlusNow(user?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  useEffect(() => {
    // OAuth deep link: the system browser returns to
    // com.priceamnesia.app://auth/callback?code=... — exchange it, then
    // close the in-app browser (v1.28.6: it used to stay open on a blank
    // page while the app behind it was already signed in).
    let remove: (() => void) | undefined;
    CapApp.addListener('appUrlOpen', async ({ url }) => {
      const handled = await handleAuthCallback(url);
      if (handled) {
        try { await CapBrowser.close(); } catch { /* browser already closed */ }
        return;
      }
      // Our scheme, but the callback did not land — an OAuth error param
      // (e.g. cancelled at Google) or a code that failed to exchange.
      // Never strand the user on the blank browser page: close it and
      // say so in the sign-in sheet. Non-auth deep links are untouched.
      if (!url.startsWith('com.priceamnesia.app://')) return;
      try { await CapBrowser.close(); } catch { /* noop */ }
      try {
        const u = new URL(url);
        const err = u.searchParams.get('error') || new URLSearchParams(u.hash.replace(/^#/, '')).get('error');
        const code = u.searchParams.get('code');
        if (err || code) setOauthError("Google sign-in didn't finish — try again.");
      } catch { setOauthError("Google sign-in didn't finish — try again."); }
    }).then(l => { remove = () => void l.remove(); }).catch(() => { /* web build */ });
    return () => { remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // v1.28.7: refresh linked-bank balances every time the app comes back
    // to the foreground — no tap needed ("It should refresh every time
    // without my input"). Silent here, like the launch sync: the Bank hub
    // is the one place a failed refresh says so out loud.
    let remove: (() => void) | undefined;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive || !plaidWasLinked()) return;
      syncBankData(loadAccounts()).then(d => { setAccounts(d.accounts); setTransactions(d.transactions); }).catch(() => { /* stays silent outside the hub */ });
    }).then(l => { remove = () => void l.remove(); }).catch(() => { /* web build */ });
    return () => { remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openScanWithPhoto = async (f: File | undefined, input: HTMLInputElement | null) => {
    clearPendingScan();
    if (input) input.value = '';
    if (!f) { setScanPhoto(null); setScanOpen(true); return; }
    try { setScanPhoto(await compressImage(f)); } catch { setScanPhoto(null); }
    setScanOpen(true);
  };

  return (
    <div className={prefs.theme !== 'aurora' ? `theme-${prefs.theme}` : undefined}>
      <Background />
      <input ref={homeCamRef} type="file" accept="image/*" capture="environment" style={HIDDEN_INPUT_STYLE} onChange={e => openScanWithPhoto(e.target.files?.[0], homeCamRef.current)} />
      <input ref={homeUpRef} type="file" accept="image/*" style={HIDDEN_INPUT_STYLE} onChange={e => openScanWithPhoto(e.target.files?.[0], homeUpRef.current)} />
      <input ref={billCamRef} type="file" accept="image/*" capture="environment" style={HIDDEN_INPUT_STYLE} onChange={e => openBillWithPhoto(e.target.files?.[0], billCamRef.current)} />
      <input ref={billUpRef} type="file" accept="image/*" style={HIDDEN_INPUT_STYLE} onChange={e => openBillWithPhoto(e.target.files?.[0], billUpRef.current)} />

      <div className="app">
        {tab === 'home' && (
          <Home receipts={receipts} stats={stats} entries={entries} bills={bills} accounts={accounts} ledger={ledger} plus={plus} prefs={prefs} user={user} onAccount={() => { if (user) setTab('settings'); else setAuthOpen(true); }} onDeals={() => setDealsOpen(true)} onBriefing={() => setBriefingOpen(true)} onWellness={() => setWellnessOpen(true)} onBills={() => setBillsOpen(true)} onResolve={() => openResolve(null, null)} onBank={() => setBankOpen(true)}
            onScan={() => { markPendingScan(); homeCamRef.current?.click(); }}
            onUpload={() => { markPendingScan(); homeUpRef.current?.click(); }}
            onOpenItem={setDetail} onPlus={() => setPlusOpen(true)}
            onType={() => { setScanPhoto(null); setScanOpen(true); }}
            onTalk={() => setChatOpen(true)}
            onPrices={() => setTab('items')} onReceipts={() => setTab('receipts')} onCheck={() => setTab('check')} onMore={() => setTab('settings')} />
        )}
        {tab === 'items' && <Items stats={stats} onOpenItem={setDetail} />}
        {tab === 'receipts' && <Receipts receipts={receipts} entries={entries} onDelete={deleteReceipt} />}
        {tab === 'check' && <Check stats={stats} onOpenItem={setDetail} />}
        {tab === 'settings' && (
          <Settings receipts={receipts} entries={entries} plus={plus} setPlus={setPlus}
            onPlus={() => setPlusOpen(true)} onClear={clearAll}
            prefs={prefs} setPrefs={setPrefs}
            trash={trash} onRecover={recoverTrash} onRestore={restoreBackup}
            user={user} plusStatus={plusStatus}
            onSignIn={() => setAuthOpen(true)} onSignOut={() => { void signOut(); }} />
        )}
      </div>

      <nav className="tabbar">
        <button className={`tab ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}><span className="tab-ico">🏠</span>Home</button>
        <button className={`tab ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')}><span className="tab-ico">🧠</span>Prices</button>
        <button className="tab scan-tab" onClick={() => { setScanPhoto(null); setScanOpen(true); }} aria-label="Add receipt"><span className="tab-ico">📸</span></button>
        <button className={`tab ${tab === 'receipts' ? 'active' : ''}`} onClick={() => setTab('receipts')}><span className="tab-ico">🧾</span>Receipts</button>
        <button className={`tab ${tab === 'check' ? 'active' : ''}`} onClick={() => setTab('check')}><span className="tab-ico">⚖️</span>Check</button>
        <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}><span className="tab-ico">⚙️</span>More</button>
      </nav>

      {dealsOpen && <DealsHub stats={stats} entries={entries} receipts={receipts} accounts={accounts} onOpenItem={setDetail} onClose={() => setDealsOpen(false)} />}
      {briefingOpen && <BriefingOverlay stats={stats} entries={entries} receipts={receipts} accounts={accounts} onClose={() => setBriefingOpen(false)} />}
      {wellnessOpen && <WellnessHub stats={stats} entries={entries} receipts={receipts} accounts={accounts} onClose={() => setWellnessOpen(false)} />}
      {billsOpen && <BillsHub bills={bills} accounts={accounts} onSnap={() => billCamRef.current?.click()} onUpload={() => billUpRef.current?.click()} onManual={() => { setBillPhoto(null); setBillFlowOpen(true); }} onOpenBill={setBillDetailId} onClose={() => setBillsOpen(false)} />}
      {billFlowOpen && <BillFlow initialPhoto={billPhoto} onClose={() => setBillFlowOpen(false)} onSave={handleSaveBill} />}
      {detailBill && <BillDetail bill={detailBill} all={bills} accounts={accounts} onDelete={deleteBill} onClose={() => setBillDetailId(null)} onResolve={() => openResolve(billTopicFor(detailBill.type), detailBill)} />}
      {resolveOpen && <ResolveHub bills={bills} receipts={receipts} initialTopicId={resolveTopicId} focusBill={resolveBill} onOpenBills={() => { setResolveOpen(false); setBillsOpen(true); }} onClose={() => setResolveOpen(false)} />}
      {bankOpen && <BankHub accounts={accounts} bills={bills} receipts={receipts} ledger={ledger} stats={stats} entries={entries} transactions={transactions} onAccounts={setAccounts} onLedger={setLedger} onTransactions={setTransactions} onClose={() => setBankOpen(false)} />}
      {chatOpen && <EchoChat stats={stats} receipts={receipts} accounts={accounts} onClose={() => setChatOpen(false)} />}
      {scanOpen && <ScanFlow initialPhoto={scanPhoto} initialStore={prefs.homeStore} plus={plus} onClose={() => { clearPendingScan(); setScanOpen(false); }} onSave={handleSaveReceipt} />}
      {detailItem && <ItemDetail item={detailItem} onClose={() => setDetail(null)} />}
      {plusOpen && <PlusModal plus={plus} testerMode={testerPlus} plusStatus={plusStatus} userId={user?.id ?? null} onClose={() => setPlusOpen(false)} onUnlocked={() => { void refreshPlusNow(user?.id ?? null); }} onDisableTesterMode={() => setPlus(false)} />}
      {authOpen && <AuthModal key={authMode} startMode={authMode} oauthError={oauthError} onClose={() => { recoveryOpenRef.current = false; setAuthOpen(false); setOauthError(''); }} />}
    </div>
  );
}
