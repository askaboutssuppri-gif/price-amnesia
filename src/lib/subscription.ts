// Price Amnesia — Plus subscriptions via RevenueCat (v1.28).
// Same pattern as RouteMax Pro: the app store processes the payment,
// RevenueCat reports only the purchase status. The `plus` entitlement is
// the source of truth; the 7-tap crown tester toggle stays as a dev bypass.
//
// ── DASHBOARD SETUP (not done in code — see the handoff checklist) ──
// 1. RevenueCat (app.revenuecat.com): create a project + an iOS app for
//    bundle com.priceamnesia.app, then paste its PUBLIC SDK key into
//    REVENUECAT_API_KEY_IOS below (and the Android key into
//    REVENUECAT_API_KEY_ANDROID when the Play app exists).
// 2. In that project create entitlement `plus`, an offering (e.g. "default")
//    with two packages: Monthly ($4.99) and Annual ($24.99), each with a
//    7-day free trial (intro offer) configured in App Store Connect.
// 3. App Store Connect: create the subscription group + the two products
//    (suggested product IDs below) and attach them to the RevenueCat
//    offering. Until the key + products exist, the paywall shows the
//    "not connected yet" message and Plus stays off — never a crash.

import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';

/** Entitlement id — must match the entitlement created in RevenueCat. */
export const PLUS_ENTITLEMENT = 'plus';

/** Suggested App Store Connect product IDs (create these in ASC). */
export const PLUS_PRODUCT_MONTHLY = 'priceamnesia_plus_monthly';
export const PLUS_PRODUCT_YEARLY = 'priceamnesia_plus_yearly';

/** Promised prices — shown as fallback copy until the store returns live prices. */
export const PLUS_MONTHLY_PRICE = '$4.99';
export const PLUS_YEARLY_PRICE = '$24.99';
export const PLUS_TRIAL_DAYS = 7;

// ── TODO: paste the RevenueCat PUBLIC SDK keys here ──
// RevenueCat Dashboard -> Project settings -> API keys.
// iOS key starts with "appl_", Android key starts with "goog_".
// These are PUBLIC keys (safe to ship in the app); the SECRET key never
// goes in the app. Until the iOS key is pasted, Plus purchases stay off
// and the paywall explains that subscriptions aren't connected yet.
export const REVENUECAT_API_KEY_IOS = 'appl_RoVWjIpwYtcdmvsfOUsUYpPuaXc'; // RevenueCat iOS public SDK key (project "Price Amnesia", app "Price Amnesia (App Store)")
export const REVENUECAT_API_KEY_ANDROID = ''; // TODO: paste the Android public SDK key (goog_...)

const REVENUECAT_API_KEY =
  Capacitor.getPlatform() === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

export type { PurchasesPackage };

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True once a real public SDK key is pasted for this platform. */
export function isRevenueCatKeySet(): boolean {
  return REVENUECAT_API_KEY.length > 0;
}

let rcConfigured = false;

/** Configure the SDK once (native only, key required). Returns false when unavailable. */
export async function ensureRevenueCat(userId?: string | null): Promise<boolean> {
  if (!isNativeApp() || !isRevenueCatKeySet()) return false;
  try {
    if (!rcConfigured) {
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      rcConfigured = true;
    }
    if (userId) {
      try {
        await Purchases.logIn({ appUserID: userId });
      } catch {
        /* already logged in as this user — fine */
      }
    }
    return true;
  } catch {
    return false;
  }
}

export interface PlusStatus {
  active: boolean;
  /** ISO expiry of the current entitlement period, or null. */
  expiresDate: string | null;
  /** True when the user cancelled but the paid period is still running. */
  willRenew: boolean;
}

/** Read the `plus` entitlement from RevenueCat. False when not configured. */
export async function getPlusStatus(userId?: string | null): Promise<PlusStatus> {
  const none: PlusStatus = { active: false, expiresDate: null, willRenew: false };
  try {
    if (!(await ensureRevenueCat(userId))) return none;
    const { customerInfo } = await Purchases.getCustomerInfo();
    const ent = customerInfo?.entitlements?.active?.[PLUS_ENTITLEMENT];
    if (!ent) return none;
    return {
      active: true,
      expiresDate: ent.expirationDate ?? null,
      willRenew: ent.willRenew ?? false,
    };
  } catch {
    return none;
  }
}

/** The current offering's packages (Monthly / Annual), or null when not configured.
 * Falls back to the "default" offering (or any offering with packages) when
 * the dashboard's current offering is unset — a missing "current" flag must
 * never silently hide the buy buttons. */
export async function getPlusPackages(userId?: string | null): Promise<PurchasesPackage[] | null> {
  const r = await getPlusPackagesDetailed(userId);
  return r.packages;
}

export interface PlusPackagesResult {
  packages: PurchasesPackage[] | null;
  /** Plain-English reason the plans could not be loaded, or null. */
  error: string | null;
}

/** Same as getPlusPackages, but keeps the failure reason for the paywall. */
export async function getPlusPackagesDetailed(userId?: string | null): Promise<PlusPackagesResult> {
  try {
    if (!(await ensureRevenueCat(userId))) {
      return { packages: null, error: isRevenueCatKeySet() ? 'Plus isn\u2019t available on this device right now.' : null };
    }
    const offerings = await Purchases.getOfferings();
    const currentPkgs = offerings?.current?.availablePackages;
    if (currentPkgs && currentPkgs.length > 0) return { packages: currentPkgs, error: null };
    // Current offering unset in the dashboard — fall back to "default",
    // then to any offering that actually has packages.
    const all = offerings?.all ? Object.values(offerings.all) : [];
    const fallback =
      all.find(o => o.identifier === 'default' && o.availablePackages?.length) ||
      all.find(o => o.availablePackages?.length);
    if (fallback?.availablePackages?.length) return { packages: fallback.availablePackages, error: null };
    return { packages: null, error: 'No Plus plans came back from the store — check the connection and try again.' };
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || e || '').toLowerCase();
    const detail = /network|fetch|offline|not reachable/i.test(msg)
      ? 'Couldn\u2019t reach the store — check your connection and try again.'
      : 'Couldn\u2019t load the Plus plans — try again.';
    return { packages: null, error: detail };
  }
}

/** Open the store's subscriptions page so the user can manage / cancel Plus. */
export function openManageSubscriptions(): void {
  try {
    window.open(
      Capacitor.getPlatform() === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions',
      '_blank',
    );
  } catch { /* noop */ }
}

export function isMonthlyPackage(pkg: PurchasesPackage): boolean {
  return String(pkg.packageType) === 'MONTHLY' || pkg.identifier === '$rc_monthly';
}

export function isAnnualPackage(pkg: PurchasesPackage): boolean {
  return String(pkg.packageType) === 'ANNUAL' || pkg.identifier === '$rc_annual';
}

/** Purchase a package. Returns true when the `plus` entitlement is active after. */
export async function purchasePlusPackage(pkg: PurchasesPackage): Promise<{ ok: boolean; cancelled: boolean; error?: string }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    if (customerInfo?.entitlements?.active?.[PLUS_ENTITLEMENT]) return { ok: true, cancelled: false };
    return { ok: false, cancelled: false, error: 'Purchase went through but Plus isn\u2019t active yet — tap Restore purchases below.' };
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message || e || '');
    const code = String((e as { code?: string | number })?.code || '');
    if (code === '1' || /cancel/i.test(msg)) return { ok: false, cancelled: true };
    return { ok: false, cancelled: false, error: 'Couldn\u2019t complete the purchase. Try again.' };
  }
}

/** Restore past purchases. Returns true when the `plus` entitlement is active after. */
export async function restorePlusPurchases(userId?: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await ensureRevenueCat(userId))) {
      return { ok: false, error: 'Plus purchases aren\u2019t connected yet — the store subscription is still being set up.' };
    }
    const { customerInfo } = await Purchases.restorePurchases();
    if (customerInfo?.entitlements?.active?.[PLUS_ENTITLEMENT]) return { ok: true };
    return { ok: false, error: 'No Plus purchase found on this store account.' };
  } catch {
    return { ok: false, error: 'Couldn\u2019t check purchases. Try again.' };
  }
}
