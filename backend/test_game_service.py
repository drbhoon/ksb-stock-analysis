import unittest
from unittest.mock import patch, MagicMock
import os
import sys
import sqlite3
from datetime import datetime, timedelta, timezone

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(__file__))

import game_service
import database

class TestGameService(unittest.TestCase):
    
    def setUp(self):
        # Create a unique database file name for this specific test case
        self.db_fd = f"test_game_{self.id().split('.')[-1]}.db"
        game_service.DB_PATH = self.db_fd
        database.DB_PATH = self.db_fd
        
        # Initialize schema
        database.init_db()
        
        # Create a test user
        with game_service.get_conn() as conn:
            conn.execute("""
                INSERT INTO users (id, email, name)
                VALUES ('test-user', 'test@user.com', 'Test User')
            """)
            conn.commit()

    def tearDown(self):
        # Force garbage collection to close any residual sqlite handles
        import gc
        gc.collect()
        # Remove database file
        if os.path.exists(self.db_fd):
            try:
                os.remove(self.db_fd)
            except Exception as e:
                print(f"Warning: could not delete {self.db_fd}: {e}")

    @patch('game_service.get_live_price')
    @patch('game_service.is_market_open')
    def test_portfolio_creation_and_restarts(self, mock_market, mock_price):
        mock_market.return_value = True
        mock_price.return_value = 2000.0
        
        # 1. Fetching a new portfolio creates season 1 with 60,000 cash (50k capital + 10k loan)
        summary = game_service.get_portfolio_summary('test-user')
        self.assertEqual(summary["season"], 1)
        self.assertEqual(summary["cash"], 60000.0)
        self.assertEqual(summary["loan_principal"], 10000.0)
        self.assertAlmostEqual(summary["net_worth"], 50000.0, places=1) # net worth is 60k cash - 10k loan = 50k
        self.assertAlmostEqual(summary["lifetime_pnl"], 0.0, places=1)
        
        # Buy 5 shares of a stock
        game_service.execute_trade('test-user', 'RELIANCE.NS', 'BUY', 5)
        
        # Net worth should stay approximately ₹50,000 (minus ₹10 transaction fee)
        summary = game_service.get_portfolio_summary('test-user')
        self.assertAlmostEqual(summary["net_worth"], 49990.0, places=1) # 5 * 2000 * 0.001 = 10 fee
        
        # 2. Restarting deactivates current season and preserves lifetime P&L
        new_season = game_service.restart_portfolio('test-user')
        self.assertEqual(new_season, 2)
        
        # New season portfolio should have ₹60,000 cash, 10,000 loan, 0 holdings
        summary = game_service.get_portfolio_summary('test-user')
        self.assertEqual(summary["season"], 2)
        self.assertEqual(summary["cash"], 60000.0)
        self.assertEqual(summary["loan_principal"], 10000.0)
        self.assertAlmostEqual(summary["net_worth"], 50000.0, places=1)
        
        # Lifetime P&L should reflect the ₹10 loss from season 1
        self.assertAlmostEqual(summary["lifetime_pnl"], -10.0, places=1)

    @patch('game_service.get_live_price')
    @patch('game_service.is_market_open')
    def test_trading_math_and_fees(self, mock_market, mock_price):
        mock_market.return_value = True
        mock_price.return_value = 2000.0
        
        # Initialize portfolio
        game_service.get_portfolio_summary('test-user')
        
        # 1. BUY trade reduces cash and includes 0.1% fee
        # Buy 10 shares of RELIANCE.NS at ₹2000. Total trade: 20,000. Fee: 20. Total cash reduction: 20,020.
        res = game_service.execute_trade('test-user', 'RELIANCE.NS', 'BUY', 10)
        self.assertTrue(res["success"])
        
        summary = game_service.get_portfolio_summary('test-user')
        self.assertEqual(summary["cash"], 60000.0 - 20020.0)
        
        # Average buy price should be execution price (excluding fee)
        holdings = game_service.get_holdings_list('test-user')
        self.assertEqual(len(holdings), 1)
        self.assertEqual(holdings[0]["symbol"], "RELIANCE.NS")
        self.assertEqual(holdings[0]["quantity"], 10)
        self.assertEqual(holdings[0]["average_buy_price"], 2000.0)
        
        # 2. Recalculates average price on subsequent BUYs
        # Buy another 10 shares at ₹2100.
        mock_price.return_value = 2100.0
        game_service.execute_trade('test-user', 'RELIANCE.NS', 'BUY', 10)
        
        holdings = game_service.get_holdings_list('test-user')
        self.assertEqual(holdings[0]["quantity"], 20)
        # Avg cost: (10 * 2000 + 10 * 2100) / 20 = 2050
        self.assertEqual(holdings[0]["average_buy_price"], 2050.0)
        
        # 3. SELL trade increases cash and subtracts 0.1% fee
        # Sell 5 shares at ₹2200. Total trade: 11,000. Fee: 11. Cash added: 10,989.
        mock_price.return_value = 2200.0
        res = game_service.execute_trade('test-user', 'RELIANCE.NS', 'SELL', 5)
        self.assertTrue(res["success"])
        
        expected_cash = (60000.0 - 20020.0 - (2100.0 * 10 * 1.001)) + 10989.0
        summary = game_service.get_portfolio_summary('test-user')
        self.assertAlmostEqual(summary["cash"], expected_cash)

    @patch('game_service.get_live_price')
    @patch('game_service.is_market_open')
    def test_short_selling_rejection(self, mock_market, mock_price):
        mock_market.return_value = True
        mock_price.return_value = 2000.0
        
        game_service.get_portfolio_summary('test-user')
        
        # Sell without holding any shares
        with self.assertRaises(ValueError) as ctx:
            game_service.execute_trade('test-user', 'RELIANCE.NS', 'SELL', 5)
        self.assertIn("Short-selling is rejected", str(ctx.exception))
        
        # Buy 5, try to sell 6
        game_service.execute_trade('test-user', 'RELIANCE.NS', 'BUY', 5)
        with self.assertRaises(ValueError) as ctx:
            game_service.execute_trade('test-user', 'RELIANCE.NS', 'SELL', 6)
        self.assertIn("Short-selling is rejected", str(ctx.exception))

    @patch('game_service.get_live_price')
    @patch('game_service.is_market_open')
    def test_off_hours_order_queuing_and_execution(self, mock_market, mock_price):
        # 1. Market is CLOSED
        mock_market.return_value = False
        mock_price.return_value = 2000.0
        
        game_service.get_portfolio_summary('test-user')
        
        # Placing a trade off hours queues it in database instead of rejecting!
        res = game_service.execute_trade('test-user', 'RELIANCE.NS', 'BUY', 5)
        self.assertTrue(res["success"])
        self.assertIn("Off-hours BUY order", res["message"])
        
        # Check database queues
        with game_service.get_conn() as conn:
            pending = conn.execute("SELECT * FROM game_pending_orders").fetchall()
            self.assertEqual(len(pending), 1)
            self.assertEqual(pending[0]["symbol"], "RELIANCE.NS")
            self.assertEqual(pending[0]["quantity"], 5)
            self.assertEqual(pending[0]["type"], "BUY")

        # 2. Market OPENS - loading holdings or summary should execute the order at opening price
        mock_market.return_value = True
        
        # Mock yfinance history ticker download
        with patch('yfinance.Ticker') as mock_ticker:
            mock_ticker_inst = MagicMock()
            mock_ticker.return_value = mock_ticker_inst
            
            # Setup history dataframe mock
            import pandas as pd
            df = pd.DataFrame({"Open": [2100.0], "Close": [2150.0]})
            mock_ticker_inst.history.return_value = df
            
            # Loading holdings processes pending order
            holdings = game_service.get_holdings_list('test-user')
            self.assertEqual(len(holdings), 1)
            self.assertEqual(holdings[0]["symbol"], "RELIANCE.NS")
            self.assertEqual(holdings[0]["quantity"], 5)
            self.assertEqual(holdings[0]["average_buy_price"], 2100.0) # Executed at open price

            # Verify pending orders are cleared
            with game_service.get_conn() as conn:
                pending = conn.execute("SELECT * FROM game_pending_orders").fetchall()
                self.assertEqual(len(pending), 0)

    def test_loan_draw_repay_and_exposure_cap(self):
        # Initialize
        game_service.get_portfolio_summary('test-user')
        
        # 1. Borrow virtual cash
        # Initial loan is 10k, borrowing 20k makes it 30k. Cash becomes 80k.
        res = game_service.draw_loan_funds('test-user', 20000.0)
        self.assertTrue(res["success"])
        self.assertEqual(res["cash"], 80000.0)
        self.assertEqual(res["loan_principal"], 30000.0)
        
        # 2. Exposure cap limit: total loan principal cannot exceed ₹50,000
        # Borrow another 20,000 is allowed (reaches ₹50,000)
        game_service.draw_loan_funds('test-user', 20000.0)
        
        # Borrowing more should fail
        with self.assertRaises(ValueError) as ctx:
            game_service.draw_loan_funds('test-user', 10.0)
        self.assertIn("Borrowing cap breached", str(ctx.exception))
        
        # 3. Repayment of loan
        res = game_service.repay_loan_funds('test-user', 10000.0)
        self.assertTrue(res["success"])
        self.assertEqual(res["cash"], 90000.0) # 100,000 - 10,000
        self.assertEqual(res["loan_principal"], 40000.0)
        
        # Repay exceeds principal should fail
        with self.assertRaises(ValueError) as ctx:
            game_service.repay_loan_funds('test-user', 50000.0)
        self.assertIn("exceeds total outstanding debt", str(ctx.exception))
        
        # Repay exceeds cash should fail
        # Artificially set cash to 100
        with game_service.get_conn() as conn:
            conn.execute("UPDATE game_portfolios SET cash = 100 WHERE user_id = 'test-user' AND is_active = 1")
            conn.commit()
            
        with self.assertRaises(ValueError) as ctx:
            game_service.repay_loan_funds('test-user', 1000.0)
        self.assertIn("Insufficient cash", str(ctx.exception))

    def test_loan_interest_accrual_pro_rata(self):
        # Initialize (which sets initial loan to 10k) and draw ₹20,000 loan -> total 30,000 loan
        game_service.get_portfolio_summary('test-user')
        game_service.draw_loan_funds('test-user', 20000.0)
        
        # Artificially shift last_interest_accrual back by 30 days in DB
        with game_service.get_conn() as conn:
            past_time = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            conn.execute("""
                UPDATE game_portfolios 
                SET last_interest_accrual = ? 
                WHERE user_id = 'test-user' AND is_active = 1
            """, (past_time,))
            conn.commit()
            
        # Interest should accrue pro-rata. For 30 days, interest = 30,000 * 1% = ₹300.0
        with game_service.get_conn() as conn:
            row = conn.execute("SELECT id FROM game_portfolios WHERE user_id = 'test-user' AND is_active = 1").fetchone()
            portfolio_id = row["id"]
            game_service.accrue_interest_lazy(portfolio_id, conn)
            conn.commit()
            
            reloaded = conn.execute("SELECT accrued_interest FROM game_portfolios WHERE id = ?", (portfolio_id,)).fetchone()
            self.assertAlmostEqual(reloaded["accrued_interest"], 300.0, places=1)

if __name__ == '__main__':
    unittest.main()
