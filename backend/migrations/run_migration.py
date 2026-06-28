#!/usr/bin/env python3
"""Run SQL migration scripts."""
import sys
import os

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import db_execute
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migration(sql_file: str):
    """Execute a SQL migration file."""
    if not os.path.exists(sql_file):
        logger.error(f"Migration file not found: {sql_file}")
        return False

    logger.info(f"Running migration: {sql_file}")

    with open(sql_file, 'r') as f:
        sql = f.read()

    # Split by semicolon and execute each statement
    statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

    for idx, stmt in enumerate(statements, 1):
        try:
            logger.info(f"Executing statement {idx}/{len(statements)}")
            db_execute(stmt)
            logger.info(f"✓ Statement {idx} executed successfully")
        except Exception as e:
            logger.error(f"✗ Failed to execute statement {idx}: {e}")
            logger.error(f"Statement: {stmt[:200]}...")
            return False

    logger.info(f"✓ Migration completed successfully: {sql_file}")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file.sql>")
        print("\nAvailable migrations:")
        migrations_dir = os.path.dirname(os.path.abspath(__file__))
        for f in sorted(os.listdir(migrations_dir)):
            if f.endswith('.sql'):
                print(f"  - {f}")
        sys.exit(1)

    migration_file = sys.argv[1]
    if not migration_file.endswith('.sql'):
        migration_file = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            migration_file
        )

    success = run_migration(migration_file)
    sys.exit(0 if success else 1)
