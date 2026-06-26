from __future__ import annotations
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from deps import get_current_user
from models import BacktestRequest
from services.engine import run_strategy
from services.orb_service import fetch_orb_data

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("")
def backtest(req: BacktestRequest, user=Depends(get_current_user)):
    strategy = req.strategy_json.model_dump()

    if req.candles:
        df = pd.DataFrame(req.candles)
    else:
        # Fetch real OHLCV from stock_data_* tables
        symbol = strategy.get("symbol") or strategy.get("index") or ""
        timeframe = strategy.get("candleTime", "5min")
        if not symbol:
            raise HTTPException(
                status_code=400,
                detail="No candles provided and no symbol in strategy_json. "
                       "Supply candles or set strategy_json.symbol.",
            )
        try:
            df = fetch_orb_data(symbol, timeframe)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    result = run_strategy(df, strategy)
    return {
        "totalTrades": len(result.trades),
        "wins": result.wins,
        "losses": result.losses,
        "winRate": round(result.win_rate, 4),
        "pnl": round(result.pnl, 2),
        "maxDrawdown": round(result.max_drawdown, 2),
        "trades": [t.__dict__ for t in result.trades],
    }
