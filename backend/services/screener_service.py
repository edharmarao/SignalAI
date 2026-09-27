"""Download fundamental reports from Screener.in."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from db import db_execute, db_query
from backend_config import get_settings

logger = logging.getLogger("signal_ai.screener")


class ScreenerConfigurationError(RuntimeError):
    """Raised when Screener.in credentials have not been configured."""


class ScreenerService:
    """Automate Screener.in login and Excel report downloads."""

    _cancel_requested = False

    def __init__(self, save_path: str | None = None) -> None:
        settings = get_settings()
        self.email = settings.screener_email
        self.password = settings.screener_password
        self.save_path = Path(
            save_path
            or settings.screener_download_dir
            or Path(__file__).resolve().parents[2] / "downloads"
        )
        self.save_path.mkdir(parents=True, exist_ok=True)

    def _validate_configuration(self) -> None:
        if not self.email or not self.password:
            raise ScreenerConfigurationError(
                "Screener.in credentials are not configured; set SCREENER_EMAIL "
                "and SCREENER_PASSWORD."
            )

    @staticmethod
    def _number(value: Any) -> float | None:
        if value is None or pd.isna(value):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _import_report(self, symbol: str, file_path: Path) -> dict[str, int | bool]:
        """Import the workbook's annual and quarterly data into fundamentals tables."""
        workbook = pd.ExcelFile(file_path)
        logger.info("Reading Screener workbook for %s: tabs=%s", symbol, ", ".join(workbook.sheet_names))
        report_tabs = {"Profit & Loss", "Quarters", "Balance Sheet", "Cash Flow"}
        loaded_tabs = [sheet for sheet in workbook.sheet_names if sheet in report_tabs]
        for sheet in loaded_tabs:
            pd.read_excel(workbook, sheet_name=sheet, header=None)
        logger.info("Screener report tabs loaded for %s: %s", symbol, ", ".join(loaded_tabs) or "none")
        data = pd.read_excel(workbook, sheet_name="Data Sheet", header=None)

        def row_values(label: str, occurrence: int = 0) -> list[Any]:
            matches = data.index[data.iloc[:, 0].astype(str).str.strip().eq(label)]
            return data.iloc[matches[occurrence], 1:].tolist() if len(matches) > occurrence else []

        def period_rows(date_occurrence: int, mappings: dict[str, tuple[str, int]]) -> list[dict[str, Any]]:
            dates = row_values("Report Date", date_occurrence)
            rows = []
            values = {
                field: row_values(label, occurrence)
                for field, (label, occurrence) in mappings.items()
            }
            for index, date_value in enumerate(dates):
                if pd.isna(date_value):
                    continue
                record: dict[str, Any] = {
                    "symbol": symbol,
                    "currency": "INR",
                    "source": "screener",
                    "source_file": str(file_path),
                    "period_date": pd.Timestamp(date_value).date(),
                }
                for field, field_values in values.items():
                    value = field_values[index] if index < len(field_values) else None
                    number = self._number(value)
                    if number is not None:
                        record[field] = round(number)
                rows.append(record)
            return rows

        yearly = period_rows(
            0,
            {
                "total_revenue": ("Sales", 0),
                "operating_income": ("Operating Profit", 0),
                "net_income": ("Net profit", 0),
                "capital_expenditure": ("Depreciation", 0),
                "operating_cashflow": ("Cash from Operating Activity", 0),
                "investing_cashflow": ("Cash from Investing Activity", 0),
                "financing_cashflow": ("Cash from Financing Activity", 0),
                "total_assets": ("Total", 1),
                "total_liabilities": ("Total", 0),
                "stockholders_equity": ("Reserves", 0),
                "total_debt": ("Borrowings", 0),
                "cash_and_equivalents": ("Cash & Bank", 0),
            },
        )
        quarterly = period_rows(
            1,
            {
                "total_revenue": ("Sales", 1),
                "operating_income": ("Operating Profit", 1),
                "net_income": ("Net profit", 1),
                "capital_expenditure": ("Depreciation", 1),
            },
        )

        def upsert(table: str, records: list[dict[str, Any]], date_column: str) -> int:
            if not records:
                return 0
            period_dates = []
            for record in records:
                record[date_column] = record.pop("period_date")
                period_dates.append(record[date_column])
                columns = ", ".join(f"`{key}`" for key in record)
                placeholders = ", ".join(["%s"] * len(record))
                updates = ", ".join(
                    f"`{key}`=VALUES(`{key}`)"
                    for key in record
                    if key not in {"symbol", date_column}
                )
                db_execute(
                    f"INSERT INTO `{table}` ({columns}) VALUES ({placeholders}) "
                    f"ON DUPLICATE KEY UPDATE {updates}",
                    list(record.values()),
                )

            placeholders = ", ".join(["%s"] * len(period_dates))
            db_execute(
                f"DELETE FROM `{table}` WHERE `symbol` = %s "
                f"AND `{date_column}` NOT IN ({placeholders})",
                [symbol, *period_dates],
            )
            return len(records)

        quarterly_count = upsert("fundamentals_quarterly", quarterly, "quarter_end_date")
        yearly_count = upsert("fundamentals_yearly", yearly, "fiscal_year_end")

        profile = {
            "symbol": symbol,
            "exchange": "NSE",
            "currency": "INR",
            "company_name": row_values("COMPANY NAME")[0] if row_values("COMPANY NAME") else None,
            "market_cap": round(self._number(row_values("Market Capitalization")[0]) or 0),
            "source": "screener",
            "source_file": str(file_path),
            "last_updated": datetime.now(),
        }
        metadata_fields = {
            "current_price": "Current Price",
            "face_value": "Face Value",
            "shares_outstanding": "No. of Equity Shares",
        }
        for field, label in metadata_fields.items():
            values = row_values(label)
            if values:
                number = self._number(values[0])
                if number is not None:
                    profile[field] = round(number) if field == "shares_outstanding" else number

        columns = ", ".join(f"`{key}`" for key in profile)
        placeholders = ", ".join(["%s"] * len(profile))
        updates = ", ".join(f"`{key}`=VALUES(`{key}`)" for key in profile if key != "symbol")
        db_execute(
            f"INSERT INTO `fundamentals_info` ({columns}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {updates}",
            list(profile.values()),
        )
        return {
            "stored": True,
            "quarterly_periods": quarterly_count,
            "yearly_periods": yearly_count,
            "tabs_processed": len(loaded_tabs) + 1,
        }

    @staticmethod
    def _rendered_number(value: Any) -> float | None:
        """Parse values copied from Screener's rendered tables."""
        if value is None:
            return None
        text = str(value).strip()
        if not text or text in {"—", "-", "NA", "N/A"}:
            return None
        negative = text.startswith("(") and text.endswith(")")
        cleaned = text.replace(",", "").replace("₹", "").replace("%", "")
        cleaned = cleaned.replace("Cr", "").replace("cr", "").strip(" ()").rstrip(" .")
        try:
            number = float(cleaned)
            return -number if negative else number
        except ValueError:
            return None

    @staticmethod
    def _period_date(value: Any) -> Any:
        parsed = pd.to_datetime(str(value).strip(), errors="coerce")
        return None if pd.isna(parsed) else parsed.date()

    def _upsert_rendered_periods(
        self,
        table: str,
        records: list[dict[str, Any]],
        date_column: str,
        symbol: str,
    ) -> int:
        """Upsert complete DOM-extracted periods and remove stale periods."""
        if not records:
            return 0
        dates = []
        for record in records:
            record[date_column] = record.pop("period_date")
            dates.append(record[date_column])
            columns = ", ".join(f"`{key}`" for key in record)
            placeholders = ", ".join(["%s"] * len(record))
            updates = ", ".join(
                f"`{key}`=VALUES(`{key}`)"
                for key in record if key not in {"symbol", date_column}
            )
            db_execute(
                f"INSERT INTO `{table}` ({columns}) VALUES ({placeholders}) "
                f"ON DUPLICATE KEY UPDATE {updates}",
                list(record.values()),
            )
        placeholders = ", ".join(["%s"] * len(dates))
        db_execute(
            f"DELETE FROM `{table}` WHERE `symbol` = %s "
            f"AND `{date_column}` NOT IN ({placeholders})",
            [symbol, *dates],
        )
        return len(records)

    async def _extract_rendered(self, page: Any, symbol: str) -> dict[str, Any]:
        """Extract Screener's visible annual and quarterly tables via Playwright."""
        tables = await page.locator("section").evaluate_all(
            """sections => sections.map(section => {
                const table = section.querySelector('table');
                if (!table) return null;
                const rows = Array.from(table.querySelectorAll('tr')).map(row =>
                    Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent.trim())
                );
                return { id: section.id, title: section.querySelector('h2')?.textContent?.trim() || '', rows };
            }).filter(Boolean)"""
        )

        def section(*names: str) -> dict[str, Any] | None:
            wanted = {name.lower() for name in names}
            return next((item for item in tables if str(item["id"]).lower() in wanted), None)

        def period_rows(item: dict[str, Any] | None, mappings: dict[str, tuple[str, ...]]) -> list[dict[str, Any]]:
            if not item or len(item["rows"]) < 2:
                return []
            headers = item["rows"][0][1:]
            parsed_dates = [self._period_date(value) for value in headers]
            row_map = {
                " ".join(str(row[0]).lower().split()): row[1:]
                for row in item["rows"][1:] if row
            }

            def values_for(labels: tuple[str, ...]) -> list[Any]:
                for label in labels:
                    if label in row_map:
                        return row_map[label]
                    for key, values in row_map.items():
                        if key.startswith(f"{label} "):
                            return values
                return []

            result = []
            for index, period_date in enumerate(parsed_dates):
                if period_date is None:
                    continue
                record: dict[str, Any] = {
                    "symbol": symbol,
                    "currency": "INR",
                    "source": "screener-rendered",
                    "source_file": f"https://www.screener.in/company/{symbol}/consolidated/",
                    "period_date": period_date,
                }
                for field, labels in mappings.items():
                    values = values_for(labels)
                    number = self._rendered_number(values[index] if index < len(values) else None)
                    if number is not None:
                        record[field] = round(number, 4) if field.startswith("eps_") else round(number)
                result.append(record)
            return result

        income = {"total_revenue": ("sales",), "operating_income": ("operating profit",), "net_income": ("net profit",), "capital_expenditure": ("depreciation",), "eps_diluted": ("eps in rs", "eps")}
        yearly = period_rows(section("profit-loss", "profit_loss"), {
            "total_revenue": ("sales",), "operating_income": ("operating profit",),
            "net_income": ("net profit",), "capital_expenditure": ("depreciation",),
            "eps_diluted": ("eps in rs", "eps"),
        })
        quarterly = period_rows(section("quarters", "quarterly-results"), income)
        balance = period_rows(section("balance-sheet", "balance_sheet"), {
            "total_assets": ("total assets", "total"), "total_liabilities": ("total liabilities",),
            "stockholders_equity": ("reserves",), "total_debt": ("borrowings",),
            "cash_and_equivalents": ("cash & bank", "cash and bank"),
        })
        cash_flow = period_rows(section("cash-flow", "cash_flow"), {
            "operating_cashflow": ("cash from operating activity",),
            "investing_cashflow": ("cash from investing activity",),
            "financing_cashflow": ("cash from financing activity",),
        })

        ratio_rows = await page.locator(
            "#top-ratios li, #shareholding li"
        ).evaluate_all(
            """items => items.map(item => ({
                label: item.querySelector('.name')?.textContent?.trim() || '',
                value: [
                    item.querySelector('.number')?.textContent?.trim() || '',
                    item.querySelector('.unit')?.textContent?.trim() || ''
                ].join(' ').trim()
            })).filter(item => item.label && item.value)"""
        )
        ratios = {
            " ".join(str(item["label"]).lower().split()): str(item["value"])
            for item in ratio_rows
        }

        def ratio_number(*labels: str) -> float | None:
            for label in labels:
                value = ratios.get(label)
                number = self._rendered_number(value)
                if number is not None:
                    return number
            return None

        high_low = ratios.get("high / low", "").split("/")
        high = self._rendered_number(high_low[0]) if high_low else None
        low = self._rendered_number(high_low[1]) if len(high_low) > 1 else None
        profile = {
            "symbol": symbol, "exchange": "NSE", "currency": "INR",
            "company_name": (
                (await page.locator("h1").first.inner_text()).strip()
                if await page.locator("h1").count() else symbol
            ),
            "source": "screener-rendered",
            "source_file": f"https://www.screener.in/company/{symbol}/consolidated/",
            "last_updated": datetime.now(),
        }
        profile_values = {
            "market_cap": ratio_number("market cap"),
            "current_price": ratio_number("current price"),
            "fifty_two_week_high": high,
            "fifty_two_week_low": low,
            "trailing_pe": ratio_number("stock p/e"),
            "book_value": ratio_number("book value"),
            "face_value": ratio_number("face value"),
            "price_to_book": ratio_number("price to book value"),
            "free_cashflow": ratio_number("free cash flow"),
            "debt_to_equity": ratio_number("debt to equity"),
            "total_revenue": ratio_number("sales"),
            "return_on_equity": ratio_number("roe"),
            "dividend_yield": ratio_number("dividend yield"),
            "held_percent_insiders": ratio_number("promoter holding"),
            "revenue_growth": ratio_number("qtr sales var"),
            "earnings_growth": ratio_number("qtr profit var"),
        }
        percentage_fields = {
            "dividend_yield", "held_percent_insiders", "revenue_growth", "earnings_growth",
        }
        for field, value in profile_values.items():
            if value is not None:
                profile[field] = value / 100 if field in percentage_fields else round(value)

        def merge(records: list[dict[str, Any]], extra: list[dict[str, Any]]) -> list[dict[str, Any]]:
            by_date = {record["period_date"]: record for record in records}
            for record in extra:
                by_date.setdefault(record["period_date"], {}).update(record)
            return list(by_date.values())

        yearly = merge(yearly, balance)
        yearly = merge(yearly, cash_flow)
        quarterly = [record for record in quarterly if "total_revenue" in record or "net_income" in record]
        return {"yearly": yearly, "quarterly": quarterly, "profile": profile}

    async def _download_rendered_single(self, page: Any, stock_code: str) -> dict[str, Any]:
        """Open the consolidated page in a browser and store visible tables."""
        symbol = stock_code.strip().upper()
        try:
            await page.goto(
                f"https://www.screener.in/company/{symbol}/consolidated/",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            await page.locator("section#profit-loss, section#quarters").first.wait_for(state="visible", timeout=30_000)
            extracted = await self._extract_rendered(page, symbol)
            yearly_count = self._upsert_rendered_periods("fundamentals_yearly", extracted["yearly"], "fiscal_year_end", symbol)
            quarterly_count = self._upsert_rendered_periods("fundamentals_quarterly", extracted["quarterly"], "quarter_end_date", symbol)
            profile = extracted["profile"]
            columns = ", ".join(f"`{key}`" for key in profile)
            placeholders = ", ".join(["%s"] * len(profile))
            updates = ", ".join(f"`{key}`=VALUES(`{key}`)" for key in profile if key != "symbol")
            db_execute(
                f"INSERT INTO `fundamentals_info` ({columns}) VALUES ({placeholders}) "
                f"ON DUPLICATE KEY UPDATE {updates}", list(profile.values())
            )
            return {"status": "success", "stock_code": symbol, "yearly_periods": yearly_count, "quarterly_periods": quarterly_count}
        except Exception as exc:
            logger.warning("Failed rendered Screener import for %s: %s", symbol, exc)
            return {"status": "failed", "stock_code": symbol, "error": str(exc)}

    async def _download_single(self, page: Any, stock_code: str) -> dict[str, Any]:
        """Download one stock report using an already authenticated page."""
        symbol = stock_code.strip().upper()
        if not symbol:
            return {"status": "failed", "stock_code": symbol, "error": "Symbol is empty"}

        try:
            await page.goto(
                f"https://www.screener.in/company/{symbol}/",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            export_button = page.locator('button[aria-label="Export to Excel"]')
            await export_button.wait_for(state="visible", timeout=30_000)

            async with page.expect_download(timeout=60_000) as download_info:
                await export_button.click()

            download = await download_info.value
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_path = self.save_path / f"{symbol}_screener_{timestamp}.xlsx"
            await download.save_as(str(file_path))
            imported = self._import_report(symbol, file_path)
            logger.info("Downloaded Screener report for %s to %s", symbol, file_path)
            return {
                "status": "success",
                "stock_code": symbol,
                "file_path": str(file_path),
                **imported,
            }
        except Exception as exc:
            logger.warning("Failed to download Screener report for %s: %s", symbol, exc)
            return {"status": "failed", "stock_code": symbol, "error": str(exc)}

    async def download_single(self, stock_code: str) -> dict[str, Any]:
        """Download one report and return its status and saved file path."""
        type(self)._cancel_requested = False
        results = await self.download_multiple([stock_code])
        if results["success"]:
            return {
                "status": "success",
                "stock_code": stock_code.strip().upper(),
                "file_path": results["downloaded_files"][0],
            }
        failure = results["failed_downloads"][0]
        return {
            "status": "failed",
            "stock_code": failure["stock_code"],
            "error": failure["error"],
        }

    async def download_multiple(self, stock_codes: list[str]) -> dict[str, Any]:
        """Download reports for multiple symbols in one authenticated session."""
        self._validate_configuration()

        from playwright.async_api import async_playwright

        downloaded_files: list[str] = []
        failed_downloads: list[dict[str, str]] = []

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                ],
            )
            try:
                context = await browser.new_context()
                page = await context.new_page()
                await page.goto(
                    "https://www.screener.in/login/",
                    wait_until="domcontentloaded",
                    timeout=60_000,
                )

                login_form = page.locator('form[action="/login/"]')
                if await login_form.count() > 0:
                    await page.fill('input[name="username"]', self.email)
                    await page.fill('input[name="password"]', self.password)
                    await page.click('button[type="submit"]')
                    await page.wait_for_load_state("domcontentloaded", timeout=60_000)

                if await page.locator('form[action="/login/"]').count() > 0:
                    raise RuntimeError("Screener.in login failed; check credentials")

                for index, stock_code in enumerate(stock_codes):
                    if type(self)._cancel_requested:
                        logger.warning("Screener import stopped before %s", stock_code)
                        failed_downloads.extend({"stock_code": code, "error": "Import stopped by user"} for code in stock_codes[index:])
                        break
                    result = await self._download_single(page, stock_code)
                    if result["status"] == "success":
                        downloaded_files.append(result["file_path"])
                    else:
                        failed_downloads.append({
                            "stock_code": result["stock_code"],
                            "error": result["error"],
                        })
                    if index < len(stock_codes) - 1:
                        await asyncio.sleep(1)
            finally:
                await browser.close()

        return {
            "total": len(stock_codes),
            "success": len(downloaded_files),
            "failed": len(failed_downloads),
            "downloaded_files": downloaded_files,
            "failed_downloads": failed_downloads,
        }

    async def download_rendered_multiple(self, stock_codes: list[str]) -> dict[str, Any]:
        """Import consolidated Screener pages through one authenticated browser session."""
        self._validate_configuration()
        from playwright.async_api import async_playwright

        successful: list[str] = []
        failed_downloads: list[dict[str, str]] = []
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            try:
                context = await browser.new_context()
                page = await context.new_page()
                await page.goto("https://www.screener.in/login/", wait_until="domcontentloaded", timeout=60_000)
                login_form = page.locator('form[action="/login/"]')
                if await login_form.count() > 0:
                    await page.fill('input[name="username"]', self.email)
                    await page.fill('input[name="password"]', self.password)
                    await page.click('button[type="submit"]')
                    await page.wait_for_load_state("domcontentloaded", timeout=60_000)
                if await page.locator('form[action="/login/"]').count() > 0:
                    raise RuntimeError("Screener.in login failed; check credentials")
                for index, stock_code in enumerate(stock_codes):
                    if type(self)._cancel_requested:
                        failed_downloads.extend({"stock_code": code, "error": "Import stopped by user"} for code in stock_codes[index:])
                        break
                    result = await self._download_rendered_single(page, stock_code)
                    if result["status"] == "success":
                        successful.append(result["stock_code"])
                    else:
                        failed_downloads.append({"stock_code": result["stock_code"], "error": result["error"]})
                    if index < len(stock_codes) - 1:
                        await asyncio.sleep(2)
            finally:
                await browser.close()
        return {
            "total": len(stock_codes), "success": len(successful), "failed": len(failed_downloads),
            "downloaded_files": successful, "failed_downloads": failed_downloads,
        }

    async def download_rendered_in_batches(
        self,
        stock_codes: list[str] | None = None,
        batch_size: int = 25,
        universe: str | None = None,
    ) -> dict[str, Any]:
        """Import consolidated rendered pages in bounded browser batches."""
        type(self)._cancel_requested = False
        if stock_codes is None:
            limit = int(universe.split("_")[1]) if universe else 750
            rows = db_query(
                "SELECT symbol FROM nse_eq_symbols WHERE symbol IS NOT NULL AND symbol <> '' "
                "ORDER BY market_cap_rank IS NULL, market_cap_rank, market_cap DESC, symbol LIMIT %s",
                (limit,),
            )
            stock_codes = [row["symbol"] for row in rows]
        symbols = list(dict.fromkeys(symbol.strip().upper() for symbol in stock_codes if symbol.strip()))
        successful: list[str] = []
        failed_downloads: list[dict[str, str]] = []
        batch_results: list[dict[str, Any]] = []
        for start in range(0, len(symbols), batch_size):
            if type(self)._cancel_requested:
                failed_downloads.extend({"stock_code": symbol, "error": "Import stopped by user"} for symbol in symbols[start:])
                break
            batch = symbols[start:start + batch_size]
            result = await self.download_rendered_multiple(batch)
            successful.extend(result["downloaded_files"])
            failed_downloads.extend(result["failed_downloads"])
            batch_results.append({
                "batch": start // batch_size + 1, "first_symbol": batch[0], "last_symbol": batch[-1],
                "total": result["total"], "success": result["success"], "failed": result["failed"],
            })
        return {
            "total": len(symbols), "success": len(successful), "failed": len(failed_downloads),
            "batches": len(batch_results), "batch_results": batch_results,
            "downloaded_files": successful, "failed_downloads": failed_downloads,
        }

    @classmethod
    def request_cancel(cls) -> None:
        cls._cancel_requested = True

    async def download_in_batches(
        self,
        stock_codes: list[str] | None = None,
        batch_size: int = 50,
        universe: str | None = None,
    ) -> dict[str, Any]:
        """Download all requested symbols sequentially in bounded batches."""
        type(self)._cancel_requested = False
        if stock_codes is None:
            limit = int(universe.split("_")[1]) if universe else 750
            rows = db_query(
                "SELECT symbol FROM nse_eq_symbols "
                "WHERE symbol IS NOT NULL AND symbol <> '' "
                "ORDER BY market_cap_rank IS NULL, market_cap_rank, "
                "market_cap DESC, symbol LIMIT %s",
                (limit,),
            )
            stock_codes = [row["symbol"] for row in rows]

        symbols = list(dict.fromkeys(symbol.strip().upper() for symbol in stock_codes if symbol.strip()))
        if not symbols:
            return {
                "total": 0,
                "success": 0,
                "failed": 0,
                "batches": 0,
                "downloaded_files": [],
                "failed_downloads": [],
            }

        downloaded_files: list[str] = []
        failed_downloads: list[dict[str, str]] = []
        batch_results: list[dict[str, Any]] = []

        for start in range(0, len(symbols), batch_size):
            if type(self)._cancel_requested:
                logger.warning("Screener batch import stopped by user")
                failed_downloads.extend({"stock_code": symbol, "error": "Import stopped by user"} for symbol in symbols[start:])
                break
            batch_number = start // batch_size + 1
            batch = symbols[start:start + batch_size]
            logger.info(
                "Starting Screener batch %d (%d symbols, %d-%d of %d)",
                batch_number,
                len(batch),
                start + 1,
                start + len(batch),
                len(symbols),
            )
            try:
                result = await self.download_multiple(batch)
            except Exception as exc:
                logger.exception("Screener batch %d failed", batch_number)
                result = {
                    "total": len(batch),
                    "success": 0,
                    "failed": len(batch),
                    "downloaded_files": [],
                    "failed_downloads": [
                        {"stock_code": symbol, "error": str(exc)} for symbol in batch
                    ],
                }

            downloaded_files.extend(result["downloaded_files"])
            failed_downloads.extend(result["failed_downloads"])
            batch_results.append({
                "batch": batch_number,
                "first_symbol": batch[0],
                "last_symbol": batch[-1],
                "total": result["total"],
                "success": result["success"],
                "failed": result["failed"],
            })

        return {
            "total": len(symbols),
            "success": len(downloaded_files),
            "failed": len(failed_downloads),
            "batches": len(batch_results),
            "batch_results": batch_results,
            "downloaded_files": downloaded_files,
            "failed_downloads": failed_downloads,
        }