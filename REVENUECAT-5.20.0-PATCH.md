# RevenueCat 5.20.0 — PaywallColor Swift 6 patch (applied 2026-11-22, for 1.28.3)

## What was changed
File patched in place:
`ios/App/Pods/RevenueCat/Sources/Paywalls/PaywallColor.swift`

This is the EXACT upstream fix from RevenueCat purchases-ios PR #6949
(released in purchases-ios 5.78.0), backported to the vendored 5.20.0:
the private "designated" initializer
`init(stringRepresentation: String, underlyingColor: (any Sendable)?)`
was moved OUT of the `private extension PaywallColor` and INTO the
struct body itself (right after `fileprivate var _underlyingColor`).

## Why
Eric's Mac runs Xcode 27 (Swift 6.x). Under Swift 6.x the compiler
synthesizes a memberwise init for `PaywallColor` that collides with the
explicit init sitting in the extension, so the 1.28.2 Archive failed
with 4 Swift errors:
- "Invalid redeclaration of synthesized memberwise 'init(stringRepresentation:)'"
  (PaywallColor.swift)
- "Ambiguous use of 'init(stringRepresentation:)'"
  (PaywallColor.swift + CustomerCenterConfigData.swift)
Moving the init into the struct body suppresses the synthesized
memberwise init. The CustomerCenterConfigData errors were knock-on
ambiguity from the same duplicate init — no change needed there.

## Why not a real SDK update to 5.89.0?
Updating RevenueCat to 5.89.0 requires PurchasesHybridCommon 18.36.1+,
which requires @revenuecat/purchases-capacitor 13.1.6+, which requires
@capacitor/core >= 8.0.0 AND uses the Capacitor 7+ plugin registration
API (`CAPBridgedPlugin` / `CAPPluginMethod`). This app is on Capacitor 6.
The proper long-term fix is a Capacitor 6 → 8 upgrade, then
purchases-capacitor 13.5.1 (RevenueCat 5.89.0 exactly). That is a major
change and was out of scope for 1.28.3.

## WARNING — the patch is fragile
`pod install` regenerates `ios/App/Pods/` and WIPES this patch.
If you ever run `pod install` (or `pod update`) in `ios/App`, you MUST
re-apply this patch before archiving, or the Archive will fail again
with the same 4 Swift errors. Re-apply by moving the init back into the
struct body as described above (or cherry-pick PR #6949's PaywallColor
hunk). The Mac Archive flow (unzip + npm install + open .xcworkspace)
does NOT run pod install, so the patch survives in the shipped zip.

## Verification status
The VM has no Swift toolchain, so the fix could NOT be compile-verified
here. The Mac Archive is the real check.
