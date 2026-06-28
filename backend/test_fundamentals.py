#!/usr/bin/env python3
"""Quick test script for fundamentals API."""
import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.yahoo_fundamentals import fetch_and_store_fundamentals, get_fundamentals_info


async def test_single_symbol():
    """Test fetching fundamentals for a single symbol."""
    print("\n" + "="*70)
    print("Testing: Fetch fundamentals for RELIANCE")
    print("="*70 + "\n")

    result = await fetch_and_store_fundamentals(["RELIANCE"], "NSE")

    print(f"\nResult: {result['status']}")
    print(f"Success: {result['success']}, Failed: {result['failed']}")

    if result['details']:
        detail = result['details'][0]
        print(f"\nDetails for RELIANCE:")
        print(f"  Status: {detail.get('status')}")
        print(f"  Info stored: {detail.get('info_stored')}")
        print(f"  Quarterly periods: {detail.get('quarterly_periods')}")
        print(f"  Yearly periods: {detail.get('yearly_periods')}")

    # Retrieve and display
    print("\n" + "="*70)
    print("Retrieving stored data...")
    print("="*70 + "\n")

    info = await get_fundamentals_info("RELIANCE")
    if info:
        print(f"Company: {info.get('company_name')}")
        print(f"Sector: {info.get('sector')}")
        print(f"Industry: {info.get('industry')}")
        print(f"Market Cap: ₹{info.get('market_cap', 0):,.0f}")
        print(f"PE Ratio: {info.get('trailing_pe')}")
        print(f"ROE: {info.get('return_on_equity')}")
        print(f"Debt/Equity: {info.get('debt_to_equity')}")
        print(f"Last Updated: {info.get('last_updated')}")
    else:
        print("No data found!")


async def test_multiple_symbols():
    """Test fetching fundamentals for multiple symbols."""
    print("\n" + "="*70)
    print("Testing: Fetch fundamentals for multiple symbols")
    print("="*70 + "\n")

    symbols = ["TCS", "INFY", "WIPRO"]
    result = await fetch_and_store_fundamentals(symbols, "NSE")

    print(f"\nResult: {result['status']}")
    print(f"Total: {result['total']}, Success: {result['success']}, Failed: {result['failed']}")

    for detail in result['details']:
        symbol = detail['symbol']
        status = detail.get('status')
        if status == 'success':
            print(f"  ✓ {symbol}: Q={detail.get('quarterly_periods')}, Y={detail.get('yearly_periods')}")
        else:
            print(f"  ✗ {symbol}: {detail.get('error')}")


if __name__ == "__main__":
    print("\n🚀 Fundamentals API Test Script\n")

    # Test 1: Single symbol
    asyncio.run(test_single_symbol())

    # Test 2: Multiple symbols (optional, uncomment to run)
    # asyncio.run(test_multiple_symbols())

    print("\n✅ Tests completed!\n")
