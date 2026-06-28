#!/usr/bin/env python3
"""Sync market cap from fundamentals_info to nse_eq_symbols and classify cap types."""
import sys
sys.path.insert(0, '/Users/dedula/code/personal/python/SignalAI/backend')

from db import db_query, db_execute

def sync_market_cap():
    """Copy market cap from fundamentals_info to nse_eq_symbols."""
    print("=" * 80)
    print("SYNCING MARKET CAP FROM FUNDAMENTALS TO NSE_EQ_SYMBOLS")
    print("=" * 80)

    # Get symbols with fundamentals data
    fundamentals = db_query("""
        SELECT symbol, market_cap, sector, industry
        FROM fundamentals_info
        WHERE market_cap IS NOT NULL
        ORDER BY market_cap DESC
    """)

    print(f"\nFound {len(fundamentals)} symbols with market cap data\n")

    updated = 0
    for fund in fundamentals:
        symbol = fund['symbol']
        market_cap = fund['market_cap']
        sector = fund['sector']
        industry = fund['industry']

        try:
            # Check if symbol exists in nse_eq_symbols
            exists = db_query(
                "SELECT id FROM nse_eq_symbols WHERE symbol = %s",
                (symbol,)
            )

            if exists:
                # Update market cap
                db_execute("""
                    UPDATE nse_eq_symbols
                    SET market_cap = %s,
                        industry = COALESCE(industry, %s)
                    WHERE symbol = %s
                """, (market_cap, industry, symbol))

                print(f"  ✓ {symbol}: ₹{market_cap:,.1f} Cr ({industry})")
                updated += 1
            else:
                print(f"  ⚠ {symbol}: Not found in nse_eq_symbols")
        except Exception as e:
            print(f"  ✗ {symbol}: Error - {e}")

    print(f"\n✓ Updated {updated}/{len(fundamentals)} symbols")
    return updated


def calculate_rankings_and_cap_types():
    """Calculate market cap rankings and assign cap types."""
    print("\n" + "=" * 80)
    print("CALCULATING RANKINGS AND CAP TYPES")
    print("=" * 80)

    # Get all symbols with market cap, ordered by market cap
    symbols = db_query("""
        SELECT id, symbol, market_cap
        FROM nse_eq_symbols
        WHERE market_cap IS NOT NULL
        ORDER BY market_cap DESC
    """)

    print(f"\nRanking {len(symbols)} symbols by market cap\n")

    for rank, sym in enumerate(symbols, 1):
        symbol = sym['symbol']
        market_cap = sym['market_cap']

        # Determine cap type based on rank
        if rank <= 100:
            cap_type = 'LARGE'
        elif rank <= 250:
            cap_type = 'MID'
        elif rank <= 500:
            cap_type = 'SMALL'
        else:
            cap_type = 'MICRO'

        # Update rank and cap type
        db_execute("""
            UPDATE nse_eq_symbols
            SET market_cap_rank = %s,
                cap_type = %s
            WHERE id = %s
        """, (rank, cap_type, sym['id']))

        if rank <= 10 or rank in [100, 101, 250, 251, 500, 501]:
            print(f"  Rank {rank:3d}: {symbol:15s} ₹{market_cap:>12,.1f} Cr → {cap_type}")

    # Show summary
    summary = db_query("""
        SELECT cap_type, COUNT(*) as count,
               MIN(market_cap) as min_cap,
               MAX(market_cap) as max_cap
        FROM nse_eq_symbols
        WHERE cap_type IS NOT NULL
        GROUP BY cap_type
        ORDER BY FIELD(cap_type, 'LARGE', 'MID', 'SMALL', 'MICRO')
    """)

    print("\n" + "=" * 80)
    print("CAP TYPE SUMMARY")
    print("=" * 80)
    print(f"{'Cap Type':<10} {'Count':>6} {'Min (Cr)':>15} {'Max (Cr)':>15}")
    print("-" * 80)

    for row in summary:
        cap_type = row['cap_type']
        count = row['count']
        min_cap = row['min_cap']
        max_cap = row['max_cap']
        print(f"{cap_type:<10} {count:>6} {min_cap:>15,.1f} {max_cap:>15,.1f}")

    print()


def mark_index_memberships():
    """Mark index memberships based on rankings."""
    print("=" * 80)
    print("MARKING INDEX MEMBERSHIPS")
    print("=" * 80)

    # NIFTY 50 - Top 50
    db_execute("UPDATE nse_eq_symbols SET is_nifty_50 = TRUE WHERE market_cap_rank <= 50")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_50 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY 50: {count} symbols")

    # NIFTY Next 50 - Rank 51-100
    db_execute("UPDATE nse_eq_symbols SET is_nifty_next_50 = TRUE WHERE market_cap_rank BETWEEN 51 AND 100")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_next_50 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY Next 50: {count} symbols")

    # NIFTY 100 - Top 100
    db_execute("UPDATE nse_eq_symbols SET is_nifty_100 = TRUE WHERE market_cap_rank <= 100")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_100 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY 100: {count} symbols")

    # NIFTY 200 - Top 200
    db_execute("UPDATE nse_eq_symbols SET is_nifty_200 = TRUE WHERE market_cap_rank <= 200")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_200 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY 200: {count} symbols")

    # NIFTY 500 - Top 500
    db_execute("UPDATE nse_eq_symbols SET is_nifty_500 = TRUE WHERE market_cap_rank <= 500")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_500 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY 500: {count} symbols")

    # NIFTY Midcap 150 - Rank 101-250
    db_execute("UPDATE nse_eq_symbols SET is_nifty_midcap_150 = TRUE WHERE market_cap_rank BETWEEN 101 AND 250")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_midcap_150 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY Midcap 150: {count} symbols")

    # NIFTY Smallcap 250 - Rank 251-500
    db_execute("UPDATE nse_eq_symbols SET is_nifty_smallcap_250 = TRUE WHERE market_cap_rank BETWEEN 251 AND 500")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_smallcap_250 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY Smallcap 250: {count} symbols")

    # NIFTY Microcap 250 - Rank 501+
    db_execute("UPDATE nse_eq_symbols SET is_nifty_microcap_250 = TRUE WHERE market_cap_rank > 500 AND market_cap_rank <= 750")
    count = db_query("SELECT COUNT(*) as cnt FROM nse_eq_symbols WHERE is_nifty_microcap_250 = TRUE")[0]['cnt']
    print(f"  ✓ NIFTY Microcap 250: {count} symbols")

    print()


def show_sample_data():
    """Show sample data for verification."""
    print("=" * 80)
    print("SAMPLE DATA (Top 10 by Market Cap)")
    print("=" * 80)

    samples = db_query("""
        SELECT symbol, company_name, market_cap, market_cap_rank, cap_type,
               is_nifty_50, is_nifty_100, is_nifty_500, industry
        FROM nse_eq_symbols
        WHERE market_cap IS NOT NULL
        ORDER BY market_cap DESC
        LIMIT 10
    """)

    for sym in samples:
        n50 = "N50" if sym['is_nifty_50'] else "   "
        n100 = "N100" if sym['is_nifty_100'] else "    "
        n500 = "N500" if sym['is_nifty_500'] else "    "

        print(f"{sym['symbol']:10s} {sym['cap_type']:6s} "
              f"₹{sym['market_cap']:>12,.1f} Cr  "
              f"{n50} {n100} {n500}  "
              f"{(sym['company_name'] or '')[:40]}")

    print()


if __name__ == "__main__":
    print("\n🚀 Starting Market Cap Sync\n")

    # Step 1: Sync market cap from fundamentals
    updated = sync_market_cap()

    if updated > 0:
        # Step 2: Calculate rankings and cap types
        calculate_rankings_and_cap_types()

        # Step 3: Mark index memberships
        mark_index_memberships()

        # Step 4: Show sample data
        show_sample_data()

        print("=" * 80)
        print("✓ SYNC COMPLETE")
        print("=" * 80)
    else:
        print("\n⚠ No data to sync. Fetch fundamentals first using:")
        print("  POST /api/v1/fundamentals/fetch")
        print("  Body: {\"symbols\": [\"RELIANCE\", \"TCS\", ...], \"exchange\": \"NSE\"}")
