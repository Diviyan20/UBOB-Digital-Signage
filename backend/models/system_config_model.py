import json
import os

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

# ENVIRONMENT VARIABLES
DB_NAME = os.getenv("OUTLET_DATABASE")
DB_USERNAME = os.getenv("DB_USERNAME")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOSTNAME = os.getenv("DB_HOSTNAME")
DB_PORT = os.getenv("DB_PORT")


def get_db_credentials():
    secret_arn = os.getenv("DB_SECRET_ARN")
    
    client = boto3.client("secretsmanager")
    
    response = client.get_secret_value(SecretId=secret_arn)
    secret = json.loads(response["SecretString"])
    
    return{
        "username":secret["username"],
        "password":secret["password"]
    }

def get_system_config():
    with psycopg2.connect(
        database=DB_NAME,
        user=get_db_credentials()["username"],
        password=get_db_credentials()["password"],
        host=DB_HOSTNAME,
        port=DB_PORT,
        cursor_factory=RealDictCursor
    ) as conn:

        with conn.cursor() as cur:
            query = """
                SELECT *
                FROM system_config
                LIMIT 1
            """

            cur.execute(query)
            result = cur.fetchone()

            return result