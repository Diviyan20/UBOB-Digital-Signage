import xmlrpc.client
import os
from dotenv import load_dotenv

def __init__():
    # Load Environment variables from env file
    load_dotenv()
    
    url =os.getenv("ODOO_DATABASE_URL")
    db = os.getenv("ODOO_DATABASE_NAME")
    username = os.getenv("ODOO_USERNAME")
    password = os.getenv("ODOO_DATABASE_PASSWORD")
    
    common = xmlrpc.client.ServerProxy('{}/xmlrpc/2/common'.format(url))
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")
    
    uid = common.authenticate(db, username, password,{})
    
    if not all ([url,db, username, password]):
        raise ValueError("Missing one or more required environment variables.")
    else:
         print(f"Connected to Odoo ({db}) as {username}, uid={uid}")
    return common, models, password, uid

__init__()