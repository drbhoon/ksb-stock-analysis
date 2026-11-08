# Google Play Store Submission Kit — KSB Stock Analyser (`org.bhoon.stocks`)

Everything in this folder is pre-built, signed, and configured so you can upload and submit your app in Google Play Console without needing an Android phone.

---

## 1. Ready-to-Upload Files (`playstore-release/`)

| File / Asset | Path | Where to Upload in Google Play Console |
| :--- | :--- | :--- |
| **Signed Play Store Bundle (`.aab`)** | `playstore-release/ksb-stocks-release.aab` | **Release → Production (or Closed Testing) → Create new release → App bundles** |
| **Signed Direct-Install APK (`.apk`)** | `playstore-release/ksb-stocks-release.apk` | Optional: install directly on any Android phone without Play Store |
| **App Icon (512 × 512 px PNG)** | `playstore-release/assets/icon-512.png` | **Grow → Store presence → Main store listing → App icon** |
| **Feature Graphic (1024 × 500 px PNG)** | `playstore-release/assets/feature-graphic-1024x500.png` | **Grow → Store presence → Main store listing → Feature graphic** |
| **Phone Screenshots (1080 × 1920 px PNG)** | `playstore-release/assets/phone-screenshot-1-1080x1920.png` through `phone-screenshot-4-1080x1920.png` | **Grow → Store presence → Main store listing → Phone screenshots** |
| **Private Upload Keystore (KEEP SAFE!)** | `playstore-release/keystore/android.keystore` *(gitignored)* | Keep backed up safely; see `keystore/keystore-info.json` for alias & password |

---

## 2. Copy-Paste Store Listing Text

- **App Name (max 30 chars):**
  `KSB Stock Analyser & AI Sim`
- **Short Description (max 80 chars):**
  `12-Agent AI Stock Simulator, NSE Portfolio Analyser, Mutual Funds & Paper Trade`
- **Full Description:**
  ```text
  KSB Stock Analyser & AI Simulator by Dr KS Bhoon is an independent, data-driven mathematical equity analysis platform and 12-agent AI investment committee simulator for Indian (NSE/BSE) and Global equities.

  KEY CAPABILITIES:
  1. AI Powered Multi-Agent Stock Simulator:
     Simulates a 4-stage institutional investment committee powered by Google Gemini:
     • Stage 1 (Specialist Analysts): Live technical indicators (RSI, MACD, Bollinger Bands, Moving Averages) and company fundamentals (Balance Sheet, Cash Flow, P/E, ROE).
     • Stage 2 (Bull vs. Bear Debate): Bull and Bear Researchers debate upside catalysts against valuation and downside risks.
     • Stage 3 (Trader & Risk Committee): Aggressive, Neutral, and Conservative Risk Analysts stress-test proposed trades.
     • Stage 4 (Portfolio Manager Verdict): Transparent BUY / HOLD / SELL consensus signal with full transcripts.

  2. Portfolio Health & Single Stock Analysis:
     Upload your CDSL / NSDL / Broker portfolio or search any NSE India equity to evaluate Sharpe Ratio, Sortino Ratio, Alpha, Beta, Max Drawdown, and composite technical + fundamental scores.

  3. Mutual Funds & Smart Goal Planner:
     Analyze AMFI mutual fund schemes, compare rolling returns and risk ratios, and build goal-based SIP & asset allocation plans.

  4. Virtual Paper Trading Game:
     Practice disciplined equity investing with virtual capital and live market prices with zero real-money risk.

  DISCLAIMER:
  KSB Stock Analyser & AI Simulator is strictly an educational, mathematical, and analytical research tool and virtual paper-trading simulator. It does NOT execute real-money brokerage trades, does NOT hold or transfer user funds, and does NOT provide SEBI-registered investment advice.
  ```

---

## 3. Mandatory URLs & Policy Declarations (Already Live on `bhoon.org`)

- **Privacy Policy URL:**
  `https://bhoon.org/stocks/privacy`
- **Account & Data Deletion URL (for Data Safety section):**
  `https://bhoon.org/stocks/privacy#data-deletion`
- **Digital Asset Links URL (for full-screen TWA verification):**
  `https://bhoon.org/.well-known/assetlinks.json`
- **Financial Features Declaration (App Content → Financial features):**
  Select **"My app doesn't provide any financial products or services"** (educational / market data / simulator only — no real-money brokerage or fund custody).

---

## 4. One Final Step After Uploading `.aab` to Google Play Console

When Google Play App Signing is enabled in Play Console:
1. Go to **Setup → App signing** in Google Play Console.
2. Copy the **SHA-256 certificate fingerprint** under **App signing key certificate**.
3. Add it as an environment variable `ANDROID_PLAY_SHA256` on your `bhoon-org Project` (`stocks` and `Bhoon-Org-website` services) in Railway so Play-Store-resigned builds also verify automatically against `https://bhoon.org/.well-known/assetlinks.json`.
