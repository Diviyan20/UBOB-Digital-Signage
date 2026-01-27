import os
from contextlib import contextmanager

import psycopg2
from dotenv import load_dotenv

load_dotenv()


@contextmanager
def get_db_connection():
    """
    - Context manager for database connection
    - Automatically handles connection cleanup
    """

    conn = None
    cur = None
    try:
        database_url = os.getenv("DATABASE_URL")

        if not database_url:
            raise ValueError(
                "DATABASE_URL Environment Variable is invalid or does not exist!"
            )

        conn = psycopg2.connect(database_url)

        cur = conn.cursor()

        # Ensure table exists
        create_script = """
            CREATE TABLE IF NOT EXISTS outlet_devices (
                device_id VARCHAR(255) PRIMARY KEY,
                device_name VARCHAR(255) NOT NULL,
                device_status VARCHAR(50) NOT NULL,
                device_location VARCHAR(255),
                active TIMESTAMP WITH TIME ZONE,
                last_seen TIMESTAMP WITH TIME ZONE NOT NULL,
                order_api_url TEXT,
                order_api_key TEXT
            )
        """
        cur.execute(create_script)
        conn.commit()

        yield conn, cur

    except psycopg2.Error as e:
        print(f"Database connection error: {e}")
        if conn:
            conn.rollback()
        raise

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
