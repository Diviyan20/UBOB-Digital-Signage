# UBOB Digital Signage System

A full-stack digital signage platform built for TV displays across UBOB outlets. The system fetches promotional media and videos from cloud services, displays them on Android-based TV screens, and provides an admin portal for outlet configuration and management.

## Overview

The UBOB Digital Signage System consists of two applications:

- **Signage App** — A React Native (Expo) app running on Android TV devices at each outlet. It displays promotional images fetched from Odoo and videos stored in AWS S3, cycling between them on a timed interval.
- **Admin Portal** — A React web application hosted on AWS CloudFront. Administrators log in, select an outlet, and register it with the necessary credentials.

The backend is a Python Flask server deployed on AWS Lambda, sitting behind an API Gateway. It communicates with an Odoo ERP instance for media data, an AWS RDS PostgreSQL database for outlet and admin data, and an AWS S3 bucket for video assets.

---

## Architecture

```
Android TV (Signage App)
        │
        ▼
AWS API Gateway
        │
        ▼
AWS Lambda (Flask Backend)
        │
        ├──► AWS RDS PostgreSQL (Outlet & Admin Data)
        ├──► AWS S3 (Video Assets)
        ├──► AWS Secrets Manager (DB Credentials)
        └──► Odoo ERP (Promotional Media)

CloudFront (Admin Portal)
        │
        ▼
AWS API Gateway
        │
        ▼
AWS Lambda (Flask Backend)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Signage Frontend | React Native, Expo, TypeScript |
| Admin Frontend | React, TypeScript, Vite |
| Backend | Python 3.12, Flask |
| Database | AWS RDS (PostgreSQL via Aurora) |
| Media Storage | AWS S3 |
| Secret Management | AWS Secrets Manager |
| Deployment | AWS Lambda, API Gateway, CloudFront, Elastic Beanstalk |
| ERP Integration | Odoo (REST API) |
| Auth | JWT (PyJWT) + bcrypt |
| Build | EAS (Expo Application Services) |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- AWS CLI configured with the `bng-signage` profile
- Expo CLI and EAS CLI installed
- Access to the AWS environment (ask your AWS admin for credentials)

### Clone the Repository

```bash
git clone https://github.com/your-org/UBOB-Digital-Signage.git
cd UBOB-Digital-Signage
```

### Backend Setup

```bash
cd backend
python -m venv env
source env/bin/activate      # Windows: env\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/` (see [Environment Variables](#environment-variables)).

Run locally:
```bash
python main.py
```

### Signage App Setup

```bash
cd signage-app
npm install
npx expo start
```

### Admin Portal Setup (See Admin Portal Github Repository) 

```bash
cd admin-portal
npm install
npm run dev
```

---

## Environment Variables

### Backend `.env`

```properties
# Odoo ERP
ODOO_DATABASE_URL=https://your-odoo-instance.com
API_TOKEN=your_odoo_api_token

# AWS
VIDEO_BUCKET_NAME=your-bucket-name
DB_SECRET_ARN=arn:aws:secretsmanager:your-region:xxxxxx:secret:xxxxxx

# Database
DB_HOSTNAME=your-rds-endpoint.rds.amazonaws.com
DB_PORT=5432
OUTLET_DATABASE=your_database_name

# App
PUBLIC_HOST_URL=https://your-api-gateway-url.amazonaws.com
JWT_SECRET_KEY=your_jwt_secret
CACHE_TTL_HOURS=24
```

### Signage App

Set in `app.config.js` or `.env`:
```properties
EXPO_PUBLIC_SERVER_URL=https://your-api-gateway-url.amazonaws.com
```

### Admin Portal

```properties
VITE_ORDER_TRACKING_URL=https://your-order-tracking-url.com
VITE_API_URL=https://your-api-gateway-url.amazonaws.com
```

> **Never commit `.env` files.** All secrets in production are managed via AWS Secrets Manager and Lambda Environment Variables.

---

## Backend

### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/admin/login` | Admin authentication |
| GET | `/admin/check-auth` | Verify JWT token |
| POST | `/admin/logout` | Logout |
| POST | `/admin/register_outlet` | Register a new outlet |
| POST | `/validate_outlet` | Validate outlet ID against Odoo |
| GET | `/outlet_info/<outlet_id>` | Fetch outlet info from DB |
| POST | `/heartbeat` | Update outlet online status |
| GET | `/get_media` | Fetch promotional images (cached) |
| GET | `/image/<image_id>` | Stream cached promotional image |
| GET | `/videos` | List S3 videos with signed URLs |

### Lambda Handler

The Flask app uses a custom Lambda handler instead of Mangum to correctly handle POST request bodies:

```python
def handler(event, context):
    # Handles OPTIONS preflight, body decoding, and CORS headers
    # See main.py for full implementation
```

### Media Caching

Promotional images are fetched from Odoo, converted from base64 to PNG, and cached in `/tmp`. The cache index (`index.json`) stores metadata including a `cached_at` timestamp. On every `/get_media` request, expired items are pruned before returning results. TTL is controlled by `CACHE_TTL_HOURS`.

### Authentication

- Passwords are hashed with bcrypt and stored in the `admin_credentials` table
- Login returns a JWT token in the response body
- The token is stored in `localStorage` on the admin portal
- Protected routes require `Authorization: Bearer <token>` header
- Token expiry is 15 minutes

---

## Frontend

### Signage App

The signage app runs in a continuous loop:

1. Displays promotional images via `ImageComponent` for 3 minutes
2. Switches to `VideoComponent` and plays a batch of 2 videos from S3
3. When videos finish, fetches fresh signed URLs and returns to images
4. Sends a heartbeat to the backend every 2 minutes
5. Refreshes media on app foreground and screen focus events

**Media refresh triggers:**
- App comes to foreground from background (`AppState` listener)
- Screen gains focus (`useFocusEffect`)
- Video batch finishes playback

### Admin Portal

1. Admin logs in at `/` with email and password
2. Token is stored in `localStorage`
3. `/configuration` page verifies token via `check-auth` on load
4. Admin selects an outlet from the dropdown, enters an access token, and submits
5. Backend registers the outlet in the database

---

## AWS Infrastructure

### Services Used

| Service | Purpose |
|---|---|
| Lambda | Flask backend runtime |
| API Gateway (HTTP API v2) | Routes HTTP requests to Lambda |
| RDS (Aurora PostgreSQL) | Stores outlet and admin data |
| S3 | Stores video assets |
| Secrets Manager | Stores RDS credentials securely |
| CloudFront | Hosts and serves the admin portal |
| Systems Manager (SSM) | Jump server access to private RDS |

### Accessing the Private RDS

RDS is in a private subnet with no public access. Use the SSM jump server provided by the AWS team:

```bash
aws ssm start-session \
  --target i-xxxxxxxxxxxxxxxxx \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["your-rds-endpoint.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5432"]}' \
  --region your-region \
  --profile your-aws-profile
```

Then connect PgAdmin or psql to `localhost:5432`.

### CORS

CORS is handled entirely in the Lambda handler (`main.py`). API Gateway CORS configuration should be cleared to avoid conflicts. The handler explicitly sets:

- `Access-Control-Allow-Origin`: CloudFront URL
- `Access-Control-Allow-Credentials`: true
- `Access-Control-Allow-Methods`: GET, POST, OPTIONS
- OPTIONS preflight requests are returned immediately with 200

---

## Database

### Tables

**`admin_credentials`**
```sql
CREATE TABLE admin_credentials (
    id      SERIAL PRIMARY KEY,
    email   VARCHAR(255) UNIQUE NOT NULL,
    password TEXT NOT NULL  -- bcrypt hashed
);
```

**`active_outlets`**
```sql
CREATE TABLE active_outlets (
    outlet_id       VARCHAR(50) PRIMARY KEY,
    outlet_name     VARCHAR(255),
    outlet_status   VARCHAR(50),
    outlet_location VARCHAR(255),
    active          TIMESTAMP,
    last_seen       TIMESTAMP,
    order_api_url   TEXT,
    order_api_key   TEXT
);
```

### Adding an Admin User

Generate a bcrypt hash locally:
```python
import bcrypt
hashed = bcrypt.hashpw("yourpassword".encode("utf-8"), bcrypt.gensalt())
print(hashed.decode("utf-8"))
```

Insert into the database:
```sql
INSERT INTO admin_credentials (email, password)
VALUES ('admin@example.com', '$2b$12$your_generated_hash');
```

---

## Deployment (AWS Lambda)

### Python Dependencies
> **Always use Docker to build the files**. AWS is built on Amazon Linux, and Windows will break certain packages.

1. Open Docker Desktop, and navigate to the terminal using the **Terminal Button**
<img width="940" height="296" alt="image" src="https://github.com/user-attachments/assets/f5993687-df73-4289-966d-fc724850fe46" />

2. Run the following Command (Specific command to run AWS Lambda, Python version 3.12):
   `docker run -it --rm -v ${PWD}:/var/task public.ecr.aws/lambda/python:3.12 bash`

3. Once the container starts running, click **Open in Terminal**
   <img width="940" height="329" alt="image" src="https://github.com/user-attachments/assets/78441a4e-aa73-4d17-a3f5-aeb9ebf563c8" />

4. Run the command below to where your `requirements.txt` for AWS Lambda is located:
   <img width="595" height="241" alt="image" src="https://github.com/user-attachments/assets/004ea83d-01b4-4a55-8344-68d1ff80af61" />
   > If you do not have the `requirements.txt`, you can make one inside a folder specifically for AWS Lambda (layer-build), and create a `requirements.txt` with the following packages:
    `asgiref==3.11.1
    aws-wsgi==0.2.7
    Flask==2.2.5
    flask-cors==4.0.0
    Werkzeug==2.2.3
    DateTime==6.0
    requests==2.31.0
    urllib3==1.26.18
    bcrypt==5.0.0
    boto3==1.33.13
    botocore==1.33.13
    s3transfer==0.8.2
    python-dotenv==0.21.1
    Pillow==12.2.0
    PyJWT==2.10.1
    psutil==7.1.3
    psycopg2-binary==2.9.9
    pymongo==4.6.1
    supabase==0.7.1
    pydantic==1.10.13
    annotated-types==0.5.0
    typing_extensions==4.7.1
    mangum==0.17.0
    APScheduler==3.10.4
    `
   > Then, create another **python/** folder to store the packages so that they can be zipped up later.

5. Run this command in the terminal: `pip install -r requirements.txt -t python/` (This installs all the necessary packages into the **python/** directory)
6. Create a **Layer** in AWS Lambda and upload the zip file, your backend should now be able to run the packages

### Source Code
1. Zip your source code (excluding `env/`, `.env`, `__pycache__/`)
2. Upload the source zip to Lambda
3. Attach your newly created layer to the lambda function
4. Set all environment variables in **Lambda → Configuration → Environment Variables**

> The Lambda layer must have the structure `python/<packages>/` or imports will fail.

### Signage App (EAS)

```bash
# Preview APK (for testing)
eas build --platform android --profile preview

# Production APK (for sideloading onto TV devices)
eas build --platform android --profile production-apk

# Production AAB (for Play Store)
eas build --platform android --profile production
```

### Admin Portal (CloudFront)

```bash
cd admin-portal
npm run build
# Upload the dist/ folder to the S3 bucket backing CloudFront
# Or use the Elastic Beanstalk deployment if configured
```

---

## Testing

### Lambda Test Events

Use the AWS Lambda console test feature with these event formats.

**GET request:**
```json
{
  "version": "2.0",
  "routeKey": "GET /get_media",
  "rawPath": "/get_media",
  "rawQueryString": "",
  "headers": { "content-type": "application/json" },
  "requestContext": {
    "accountId": "123456789012",
    "apiId": "abc123",
    "http": {
      "method": "GET",
      "path": "/get_media",
      "protocol": "HTTP/1.1",
      "sourceIp": "1.2.3.4",
      "userAgent": "test"
    },
    "requestId": "test-id",
    "routeKey": "GET /get_media",
    "stage": "$default"
  },
  "isBase64Encoded": false
}
```

**POST request:**
```json
{
  "version": "2.0",
  "routeKey": "POST /admin/login",
  "rawPath": "/admin/login",
  "rawQueryString": "",
  "headers": { "content-type": "application/json" },
  "requestContext": {
    "accountId": "123456789012",
    "apiId": "abc123",
    "http": {
      "method": "POST",
      "path": "/admin/login",
      "protocol": "HTTP/1.1",
      "sourceIp": "1.2.3.4",
      "userAgent": "test"
    },
    "requestId": "test-id",
    "routeKey": "POST /admin/login",
    "stage": "$default"
  },
  "body": "{\"email\":\"admin@example.com\",\"password\":\"yourpassword\"}",
  "isBase64Encoded": false
}
```

Save each endpoint as a named test event in the Lambda console for easy reuse.
