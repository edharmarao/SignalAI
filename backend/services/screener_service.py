"""Download fundamental reports from Screener.in."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from db import db_execute
from backend_config import get_settings

logger = logging.getLogger("signal_ai.screener")


class ScreenerConfigurationError(RuntimeError):
    """Raised when Screener.in credentials have not been configured."""


class ScreenerService:
    """Automate Screener.in login and Excel report downloads."""

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
            for record in records:
                record[date_column] = record.pop("period_date")
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
        return {"stored": True, "quarterly_periods": quarterly_count, "yearly_periods": yearly_count}

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