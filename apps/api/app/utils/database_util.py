"""
Database utility for MySQL operations — mirrors vasudha-backend/utils/database_util.py.

Uses mysql.connector with autocommit=True and supports context manager usage:

    with DatabaseUtil() as db:
        db.execute_many(sql, params_list)
"""
import logging
from typing import Any, List, Optional, Tuple

import mysql.connector
from mysql.connector import Error

from ..config import get_settings

logger = logging.getLogger("signal_ai")


class DatabaseUtil:
    def __init__(self, autocommit: bool = True):
        s = get_settings()
        self.host = s.mysql_host
        self.port = s.mysql_port
        self.user = s.mysql_user
        self.password = s.mysql_password
        self.database = s.mysql_database
        self.autocommit = autocommit
        self.connection = None
        self.cursor = None

    def connect(self) -> bool:
        """Establish database connection"""
        try:
            self.connection = mysql.connector.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                database=self.database,
                autocommit=self.autocommit,
            )
            self.cursor = self.connection.cursor()
            logger.debug("Database connection established")
            return True
        except Error as e:
            logger.error("Error connecting to database: %s", e)
            return False

    def disconnect(self):
        """Close database connection"""
        try:
            if self.cursor:
                self.cursor.close()
                self.cursor = None
            if self.connection and self.connection.is_connected():
                self.connection.close()
                self.connection = None
        except Error as e:
            logger.error("Error closing database connection: %s", e)

    def ping(self) -> bool:
        """Ping the connection to keep it alive and check if it's valid"""
        try:
            if self.connection and self.connection.is_connected():
                self.connection.ping(reconnect=True, attempts=3, delay=1)
                return True
            return False
        except Error as e:
            logger.warning("Ping failed: %s", e)
            return False

    def ensure_connection(self) -> bool:
        """Ensure connection is valid, reconnect if needed"""
        if not self.ping():
            logger.info("Connection lost, reconnecting...")
            self.disconnect()
            return self.connect()
        return True

    def execute_query(self, query: str, params: Optional[Tuple] = None, max_retries: int = 3) -> bool:
        """Execute a single query with retry on connection loss"""
        for attempt in range(max_retries):
            try:
                self.ensure_connection()
                self.cursor.execute(query, params)
                return True
            except Error as e:
                error_code = e.errno if hasattr(e, "errno") else None
                if error_code in (2006, 2013) and attempt < max_retries - 1:
                    logger.warning("Connection lost (attempt %d/%d), reconnecting...", attempt + 1, max_retries)
                    self.disconnect()
                    self.connect()
                    continue
                logger.error("Error executing query: %s", e)
                return False
        return False

    def execute_many(self, query: str, params_list: List[Tuple]) -> int:
        """Execute multiple queries with different parameters"""
        try:
            if not self.connection or not self.connection.is_connected():
                self.connect()
            self.cursor.executemany(query, params_list)
            return self.cursor.rowcount
        except Error as e:
            logger.error("Error executing batch query: %s", e)
            return 0

    def fetch_one(self, query: str, params: Optional[Tuple] = None) -> Optional[Tuple]:
        """Fetch single row"""
        try:
            if not self.connection or not self.connection.is_connected():
                self.connect()
            self.cursor.execute(query, params)
            return self.cursor.fetchone()
        except Error as e:
            logger.error("Error fetching single row: %s", e)
            return None

    def fetch_all(self, query: str, params: Optional[Tuple] = None) -> List[Tuple]:
        """Fetch all rows"""
        try:
            if not self.connection or not self.connection.is_connected():
                self.connect()
            self.cursor.execute(query, params)
            return self.cursor.fetchall()
        except Error as e:
            logger.error("Error fetching all rows: %s", e)
            return []

    def get_last_insert_id(self) -> int:
        return self.cursor.lastrowid if self.cursor else 0

    def commit(self) -> bool:
        """Commit the current transaction (only meaningful when autocommit=False)."""
        try:
            if self.connection and self.connection.is_connected():
                self.connection.commit()
                return True
        except Error as e:
            logger.error("Error committing transaction: %s", e)
        return False

    def rollback(self) -> bool:
        """Rollback the current transaction (only meaningful when autocommit=False)."""
        try:
            if self.connection and self.connection.is_connected():
                self.connection.rollback()
                return True
        except Error as e:
            logger.error("Error rolling back transaction: %s", e)
        return False

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type and not self.autocommit:
            logger.warning("Exception in DB context — rolling back: %s", exc_val)
            self.rollback()
        self.disconnect()
