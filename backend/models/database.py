import os, requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

SUPABASE_URL = os.getenv("SUPABASE_URL")
API_KEY = os.getenv("SUPABASE_API_KEY")
BEARER_TOKEN = os.getenv("SUPABASE_BEARER_TOKEN")

url = f"{SUPABASE_URL}/rest/v1/heartbeats?select=*"

headers = {
    "apikey": API_KEY,
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)

print("Status:", response.status_code)
print("Data:", response.json())