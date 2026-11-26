import { PriceEntry, ItemStats } from './store';

/* Deals engine — every "deal" is computed from the prices the user has
   personally logged. No live store data: honesty is the feature. */

export interface StorePrice { store: string; min: number; last: number; count: number }

export interface ItemStores {
  normalized: string;
  displayName: string;
  stores: StorePrice[];      // sorted cheapest-min first
  cheapestStore: string;
  cheapestPrice: number;
}

/** Per item, the price picture at every store it was ever bought. */
export function storeBreakdown(entries: PriceEntry[]): ItemStores[] {
  const byItem = new Map<string, Map<string, PriceEntry[]>>();
  const names = new Map<string, string>();
  for (const e of entries) {
    if (!byItem.has(e.normalized)) byItem.set(e.normalized, new Map());
    const byStore = byItem.get(e.normalized)!;
    const list = byStore.get(e.store) || [];
    list.push(e);
    byStore.set(e.store, list);
    names.set(e.normalized, e.name);
  }
  const out: ItemStores[] = [];
  for (const [normalized, byStore] of byItem) {
    const stores: StorePrice[] = [...byStore.entries()].map(([store, list]) => {
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
      return { store, min: Math.min(...list.map(x => x.price)), last: sorted[sorted.length - 1].price, count: list.length };
    }).sort((a, b) => a.min - b.min);
    out.push({ normalized, displayName: names.get(normalized) || normalized, stores, cheapestStore: stores[0].store, cheapestPrice: stores[0].min });
  }
  return out;
}

export interface BattleRow {
  normalized: string; displayName: string;
  cheapestStore: string; cheapestPrice: number;
  priciestStore: string; priciestPrice: number;
  gapPct: number; // how much more the priciest store charges, %
}
export interface StoreStanding { store: string; wins: number; items: number }

/** Head-to-head: only items bought at 2+ stores can battle. */
export function storeBattle(entries: PriceEntry[]): { rows: BattleRow[]; standings: StoreStanding[] } {
  const breakdown = storeBreakdown(entries);
  const rows: BattleRow[] = [];
  const winCount = new Map<string, number>();
  const contested = new Map<string, Set<string>>();
  for (const item of breakdown) {
    if (item.stores.length < 2) continue;
    const cheapest = item.stores[0];
    const priciest = item.stores[item.stores.length - 1];
    rows.push({
      normalized: item.normalized, displayName: item.displayName,
      cheapestStore: cheapest.store, cheapestPrice: cheapest.min,
      priciestStore: priciest.store, priciestPrice: priciest.min,
      gapPct: priciest.min > 0 ? Math.round((priciest.min - cheapest.min) / priciest.min * 100) : 0,
    });
    winCount.set(cheapest.store, (winCount.get(cheapest.store) || 0) + 1);
    for (const s of item.stores) {
      if (!contested.has(s.store)) contested.set(s.store, new Set());
      contested.get(s.store)!.add(item.normalized);
    }
  }
  rows.sort((a, b) => b.gapPct - a.gapPct);
  const standings = [...winCount.entries()]
    .map(([store, wins]) => ({ store, wins, items: contested.get(store)?.size || wins }))
    .sort((a, b) => b.wins - a.wins);
  return { rows, standings };
}

export interface AtLow { normalized: string; displayName: string; price: number; store: string; low: number; vsAvgPct: number }

/** Items whose latest price is at (or within 2% of) their all-time low. */
export function atTheirLow(stats: ItemStats[]): AtLow[] {
  return stats
    .filter(s => s.count >= 2 && s.lastPrice <= s.low * 1.02)
    .map(s => ({
      normalized: s.normalized, displayName: s.displayName,
      price: s.lastPrice, store: s.lastStore, low: s.low,
      vsAvgPct: s.avg > 0 ? Math.round((s.avg - s.lastPrice) / s.avg * 100) : 0,
    }))
    .sort((a, b) => b.vsAvgPct - a.vsAvgPct);
}

export interface BasketLine { normalized: string; displayName: string; bestPrice: number; bestStore: string; lastPrice: number; lastStore: string; save: number }
export interface Basket { lines: BasketLine[]; bestTotal: number; lastTotal: number; saveTotal: number }

/** Recurring items priced two ways: everything at its cheapest-seen
    store vs everything at the price you last paid. */
export function smartBasket(stats: ItemStats[], entries: PriceEntry[]): Basket {
  const breakdown = new Map(storeBreakdown(entries).map(b => [b.normalized, b]));
  const lines: BasketLine[] = [];
  for (const s of stats) {
    if (s.count < 2) continue;
    const b = breakdown.get(s.normalized);
    if (!b) continue;
    lines.push({
      normalized: s.normalized, displayName: s.displayName,
      bestPrice: b.cheapestPrice, bestStore: b.cheapestStore,
      lastPrice: s.lastPrice, lastStore: s.lastStore,
      save: Math.max(0, s.lastPrice - b.cheapestPrice),
    });
  }
  lines.sort((a, b) => b.save - a.save);
  return {
    lines,
    bestTotal: lines.reduce((a, l) => a + l.bestPrice, 0),
    lastTotal: lines.reduce((a, l) => a + l.lastPrice, 0),
    saveTotal: lines.reduce((a, l) => a + l.save, 0),
  };
}

export interface CheapEver { normalized: string; displayName: string; low: number; store: string; date: string; timesSeen: number }

/** All-time cheapest sightings, biggest histories first. */
export function cheapestEver(stats: ItemStats[]): CheapEver[] {
  return stats
    .filter(s => s.count >= 2)
    .map(s => {
      const lowEntry = s.history.find(e => e.price === s.low) || s.history[0];
      return { normalized: s.normalized, displayName: s.displayName, low: s.low, store: lowEntry.store, date: lowEntry.date, timesSeen: s.count };
    })
    .sort((a, b) => b.timesSeen - a.timesSeen);
}
