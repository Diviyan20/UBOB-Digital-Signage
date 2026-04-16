import json
import logging
import os
from contextlib import contextmanager

import bcrypt
import boto3
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# ENVIRONMENT VARIABLES
OUTLET_DATABASE = os.getenv("OUTLET_DATABASE")
DB_USERNAME = os.getenv("DB_USERNAME")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOSTNAME = os.getenv("DB_HOSTNAME")
DB_PORT = os.getenv("DB_PORT")

# ================
# LOGGING SETUP
# ================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

def get_db_credentials():
    secret_arn = os.getenv("DB_SECRET_ARN")
    
    client = boto3.client("secretsmanager")
    
    response = client.get_secret_value(SecretId=secret_arn)
    secret = json.loads(response["SecretString"])
    
    return{
        "username":secret["username"],
        "password:":secret["password"]
    }
    
@contextmanager
def get_db_connection():
    """Connect to the database with Environment Variables using psycopg2"""
    creds = get_db_credentials()
    conn = None
    cur = None
    try:
        conn = psycopg2.connect(
            database = OUTLET_DATABASE,
            user = creds["username"],
            password = creds["password"],
            host = DB_HOSTNAME,
            port = DB_PORT
        )
        
        cur = conn.cursor()
    
        yield conn, cur
    
    # Error handling for Connection Error
    except psycopg2.Error as e:
        log.error(f"Database connection Error: {e}")
        if conn:
            conn.rollback()
        raise

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

def retrieve_credentials(email, password):
    try:
        with get_db_connection() as (conn, cur):
        
            query = """SELECT email, password FROM admin_credentials WHERE email=%s;"""
            cur.execute(query, (email,))
            row = cur.fetchone()
            
            if not row:
                return None
            stored_hash = row[1]
            
            # Compare plaintext password against the stored hash
            if bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8")):
                return row  # Valid
            else:
                return None  # Wrong password
            
    except psycopg2.Error as e:
        log.error(f"Database Error: {e}")