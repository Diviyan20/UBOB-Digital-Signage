import os
from pymongo import MongoClient
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

connection_string = os.getenv("MONGODB_CONNECTION_STRING")

client = MongoClient(connection_string)

heartbeats_db = client.heartbeats

collections = heartbeats_db.list_collection_names()
print(collections)
