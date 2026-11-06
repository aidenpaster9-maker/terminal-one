# Terminal One

A memecoin terminal built around risk management. This is step 1: live data, real wallet balances, and paper trading. No real money moves.

## What works

- Live coins, prices, contract addresses and links from DexScreener
- Daily gainers, daily losers and most active coins
- Search by name, ticker or contract address
- Live price charts from GeckoTerminal (1m, 5m, 15m, 1h, 4h, 1d)
- A basic risk check built from market data
- Phantom (Solana) and MetaMask (Ethereum, Base, BNB Chain) balances
- Paper trading on live prices, saved in your browser

## Put it online for free (GitHub Pages)

1. Sign in at github.com.
2. Click **+** (top right), then **New repository**.
3. Name it `terminal-one`. Choose **Public**. Click **Create repository**.
4. Click **uploading an existing file**.
5. Drag in `index.html`, `styles.css`, `app.js` and `README.md`.
6. Click **Commit changes**.
7. Go to **Settings**, then **Pages** (left menu).
8. Under **Branch**, pick **main** and **/ (root)**. Click **Save**.
9. Wait 1 to 2 minutes, then refresh the Pages screen.
10. Your site is at `https://YOUR-USERNAME.github.io/terminal-one/`.

To update the site later, upload the changed file again and commit. It goes live in about a minute.

## If wallet balances don't load

The free public Solana server often blocks websites. To fix it:

1. Make a free account at a Solana RPC provider such as Helius.
2. Copy your free RPC link.
3. On the site, open **Portfolio**, then **Settings**, paste the link and click **Save RPC link**.

Never share your wallet's recovery phrase with anyone or any website, including this one.

## Cost

Free. GitHub Pages, DexScreener, GeckoTerminal, Phantom and MetaMask cost nothing. A custom domain name is optional.

## Known limits

- 15-second and 30-second candles aren't offered by the free chart data. The site says so and you can pick 1m or longer.
- The risk check uses market data only. Holder, creator and bundle checks need more data and come later.
- Bitcoin wallets and runes aren't supported yet.
- Paper trades are stored in your browser, so they don't follow you to another device.

## Credits

Market data from DexScreener. Charts from GeckoTerminal. Not financial advice.
