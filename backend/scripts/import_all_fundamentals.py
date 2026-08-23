"""Import Yahoo fundamentals for every symbol in nse_eq_symbols."""

import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pymysql


REPO_ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    env_file = REPO_ROOT / ".env.prod" if os.environ.get("APP_ENV") == "prod" else REPO_ROOT / ".env"
    if not env_file.exists():
        env_file = REPO_ROOT / ".env.local"
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def get_symbols() -> list[str]:
    connection = pymysql.connect(
        host=os.environ["MYSQL_HOST"],
        port=int(os.environ["MYSQL_PORT"]),
        user=os.environ["MYSQL_USER"],
        password=os.environ["MYSQL_PASSWORD"],
        database=os.environ["MYSQL_DATABASE"],
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT DISTINCT UPPER(TRIM(symbol)) "
                "FROM nse_eq_symbols "
                "WHERE symbol IS NOT NULL AND TRIM(symbol) <> '' ORDER BY 1"
            )
            return [row[0] for row in cursor.fetchall()]
    finally:
        connection.close()


def import_batch(api_url: str, batch: list[str]) -> tuple[int, str]:
    payload = json.dumps({"symbols": batch, "exchange": "NSE"}).encode()
    request = Request(api_url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=1800) as response:
            return response.status, response.read().decode()
    except HTTPError as error:
        return error.code, error.read().decode(errors="replace")
    except (URLError, TimeoutError) as error:
        return 0, str(error)


def main() -> None:
    load_env()
    symbols = get_symbols()
    api_url = f"http://127.0.0.1:{os.environ.get('API_PORT', '8003')}/api/v1/fundamentals/fetch"
    batch_size = 50
    total_batches = (len(symbols) + batch_size - 1) // batch_size
    print(f"Found {len(symbols)} symbols; importing in {total_batches} batches", flush=True)

    for start in range(0, len(symbols), batch_size):
        batch = symbols[start : start + batch_size]
        batch_number = start // batch_size + 1
        status, body = import_batch(api_url, batch)
        print(
            f"batch {batch_number}/{total_batches} symbols {start + 1}-{start + len(batch)} "
            f"HTTP {status}: {body[:1000]}",
            flush=True,
        )
        if start + batch_size < len(symbols):
            print("waiting 30 seconds before next batch", flush=True)
            time.sleep(30)

    print("fundamentals import run complete", flush=True)


if __name__ == "__main__":
    main()
