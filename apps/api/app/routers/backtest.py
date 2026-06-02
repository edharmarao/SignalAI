from __future__ import annotations
import pandas as pd
from fastapi import APIRouter, Depends
from ..deps import get_current_user
from ..models import BacktestRequest
from ..services.engine import run_strategy
from ..services.data import synthetic_candles

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("")
def backtest(req: BacktestRequest, user=Depends(get_current_user)):
    strategy = req.strategy_json.model_dump()
    if req.candles:
        df = pd.DataFrame(req.candles)
    else:
        df = synthetic_candles(days=req.days, strategy=strategy)
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
