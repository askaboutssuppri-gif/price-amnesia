#!/bin/sh
# Xcode Cloud post-clone script for Price Amnesia (Capacitor 6).
# Xcode Cloud runs this from the directory containing the .xcodeproj (ios/App).
set -e
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build
npx cap sync ios
cd ios/App
pod install
# Re-apply the RevenueCat 5.20.0 PaywallColor fix (upstream PR #6949 backport).
# pod install regenerates Pods/ and wipes the vendored patch; without this the
# build fails under Xcode 27 / Swift 6 ("Invalid redeclaration of synthesized
# memberwise init"). See REVENUECAT-5.20.0-PATCH.md.
patch -p1 --forward < ../../scripts/revenuecat-paywallcolor.patch
