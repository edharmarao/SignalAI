#!/usr/bin/env python3
"""Test the /api/v1/sync/symbols endpoint."""
import asyncio
import sys
sys.path.insert(0, '/backend')

from routers.sync import sync_symbols, get_sync_status, SyncRequest


async def test_single_symbol():
    """Test syncing a single symbol."""
    print("=" * 80)
    print("TEST 1: Sync single symbol (ADANIENT)")
    print("=" * 80)

    request = SyncRequest(symbols=["ADANIENT"], exchange="NSE")
    result = await sync_symbols(request, user=None)

    print(f"\nResults:")
    print(f"  Total symbols: {result.total}")
    print(f"  Fundamentals fetched: {result.fundamentals_fetched}")
    print(f"  Fundamentals failed: {result.fundamentals_failed}")
    print(f"  Symbols updated: {result.symbols_updated}")
    print(f"  Rankings updated: {result.cap_rankings_updated}")

    for detail in result.details:
        status = "✓" if detail.get("updated") else "✗"
        print(f"\n  {status} {detail['symbol']}: {detail['status']}")
        if detail.get("market_cap"):
            print(f"    Market Cap: ₹{detail['market_cap']:,.1f} Cr")


async def test_multiple_symbols():
    """Test syncing multiple symbols."""
    print("\n" + "=" * 80)
    print("TEST 2: Sync multiple symbols (HCLTECH, WIPRO, TECHM)")
    print("=" * 80)

    request = SyncRequest(symbols=["HCLTECH", "WIPRO", "TECHM"], exchange="NSE")
    result = await sync_symbols(request, user=None)

    print(f"\nResults:")
    print(f"  Total symbols: {result.total}")
    print(f"  Fundamentals fetched: {result.fundamentals_fetched}")
    print(f"  Symbols updated: {result.symbols_updated}")

    for detail in result.details:
        status = "✓" if detail.get("updated") else "✗"
        market_cap = f"₹{detail['market_cap']:,.1f} Cr" if detail.get("market_cap") else "N/A"
        print(f"  {status} {detail['symbol']:<10s}: {market_cap}")


def test_sync_status():
    """Test getting sync status."""
    print("\n" + "=" * 80)
    print("TEST 3: Get sync status")
    print("=" * 80)

    status = get_sync_status(user=None)

    print(f"\nStatus:")
    print(f"  Total symbols: {status['total_symbols']}")
    print(f"  With market cap: {status['symbols_with_market_cap']}")
    print(f"  Coverage: {status['coverage_pct']}%")

    print(f"\n  Cap Type Distribution:")
    for dist in status['cap_type_distribution']:
        print(f"    {dist['cap_type']:6s}: {dist['count']:3d} symbols")

    print(f"\n  Index Coverage:")
    cov = status['index_coverage']
    print(f"    NIFTY 50:  {int(cov['nifty_50']):3d} symbols")
    print(f"    NIFTY 100: {int(cov['nifty_100']):3d} symbols")
    print(f"    NIFTY 500: {int(cov['nifty_500']):3d} symbols")


async def main():
    """Run all tests."""
    print("\n🚀 Testing /api/v1/sync/symbols endpoint\n")

    # Test 1: Single symbol
    await test_single_symbol()

    # Wait a bit
    await asyncio.sleep(1)

    # Test 2: Multiple symbols
    await test_multiple_symbols()

    # Test 3: Status
    test_sync_status()

    print("\n" + "=" * 80)
    print("✓ ALL TESTS COMPLETE")
    print("=" * 80)
    print("\nYou can now test via HTTP:")
    print("  POST http://localhost:8003/api/v1/sync/symbols")
    print('  Body: {"symbols": ["SYMBOL1", "SYMBOL2"], "exchange": "NSE"}')
    print("\n  GET http://localhost:8003/api/v1/sync/status")


if __name__ == "__main__":
    asyncio.run(main())
