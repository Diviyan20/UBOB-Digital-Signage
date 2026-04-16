import datetime
import os

import jwt
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

def generate_admin_token(admin_id: str):
    payload = {
        "admin_id": admin_id,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15),
        "iat": datetime.datetime.now(datetime.timezone.utc),
        "type":"admin"
    }
    
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")


def verify_admin_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        
        if payload.get("type") != "admin":
            return None
        else:
            return payload
    
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None