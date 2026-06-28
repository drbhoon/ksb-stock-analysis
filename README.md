# Stock Portfolio Analyser & Paper Trading Simulator

A premium, interactive web application for stock and mutual fund analysis, built with FastAPI (Python) and React + Vite (TypeScript). Features a multi-user dashboard, beginners learning guide, and a simulated Paper Trading mode for stock market education.

---

## Getting Started

### 1. Requirements
* Python 3.10+
* Node.js 18+
* Google OAuth credentials (optional for development, bypass option available)

### 2. Development Setup
To start the backend server:
```bash
cd backend
pip install -r requirements.txt
python main.py
```
*By default, the backend runs on `http://localhost:8000`.*

To start the frontend developer server:
```bash
cd frontend
npm install
npm run dev
```
*The React client will run on `http://localhost:5173`.*

---

## Paper Trading Simulator

The Paper Trading mode allows beginners to practice trading Indian stocks at live exchange prices without financial risk.

### 1. How to Play
* **Starting Capital**: Every user starts the game (Season 1) with **₹0** of virtual cash and **₹0** loan.
* **Symbol Format**: Tickers follow the Yahoo Finance suffix standard ending in `.NS` (e.g. `RELIANCE.NS`, `TCS.NS`).
* **Order Executions**: Buy and sell orders execute instantly at the current live market price with a configurable **0.1% transaction fee** (brokerage and slippage tax) applied to both sides.
* **No Short Selling**: Selling a stock is strictly validated; users cannot sell more shares of a security than they currently hold.

### 2. Loan & Leverage Rules
* **Simulated Loans**: Users can borrow virtual cash to increase their buying power.
* **Total Exposure Cap**: The maximum outstanding loan a user can borrow is **₹50,000**.
* **Interest Accrual Formula**: Loans accrue interest at a notional rate of **1% per month**, calculated on a calendar-day pro-rata basis:
  $$\text{Interest Increment} = \text{Outstanding Principal} \times \frac{0.01}{30} \times \text{Days Elapsed}$$
  * Interest accrues continuously every single second, including weekends and market holidays.
* **Repayment**: Users can repay their loan principal at any time using available cash. Repayments reduce the outstanding principal directly, immediately slowing interest accumulation.

### 3. Net Worth & Restarts
* **Net Worth Calculation**: Net Worth represents total account asset value (cash + stock holdings value) minus interest liabilities:
  $$\text{Net Worth} = \text{Cash} + \text{Market Value of Holdings} - \text{Accrued Interest}$$
* **Season P&L Calculation**: Season P&L represents the user's own capital performance (net worth minus outstanding loan debt):
  $$\text{Season P&L} = \text{Net Worth} - \text{Loan Principal}$$
* **Going Bust**: If a user's net worth falls below **₹0 (or negative)** while they have active loans or holdings, they are flagged as bust and can trigger a fresh game restart.
* **Restarting Logic (Seasons)**:
  * Restarting liquidates all active holdings, settles outstanding debts, and resets cash and loan principal to **₹0**.
  * The game is bumped to the next **Season** (e.g., Season 2).
  * The final gain/loss of the closed season (Season P&L) is added to the user's **Lifetime P&L** tracker. Prior losses or gains are preserved and displayed separately, so the user starts the new season with a clean sheet.

### 4. Market Hours & Timing
* **Market Hours**: Stock executions are only allowed during official Indian market trading hours: **Monday to Friday, 9:15 AM to 3:30 PM IST (Asia/Kolkata)**.
* **Trading Holiday Rejections**: Any buy or sell order submitted outside these hours is rejected by the server with a `Market is closed` error.
* **Loan Operations**: Borrowing and repaying loans are administrative tasks and can be performed **anytime**, even when the exchange is closed.
