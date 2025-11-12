import os
from pymongo import MongoClient
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

def connect_to_database():
    connection_string = os.getenv("MONGODB_CONNECTION_STRING")

    client = MongoClient(connection_string)
    return client