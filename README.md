
# UBOB Digital Signage System
A production-grade digital signage solution built for Android TV devices.
Frontend developed with React Native, backend powered by Flask (Python), integrated with Odoo and PostgreSQL, and designed for deployment on AWS using best-practice cloud architecture.


## 📌 Overview
This system is designed for restaurant outlets to display promotional content, outlet information, updated orders, and operational data. Devices periodically communicate with the backend to validate outlet identity, fetch updated media, and send heartbeat notifications.

The system is optimized for:

- Low bandwidth

- High availability

- Horizontal scaling

- Cloud-native deployment
## ⚛️ Tech Stack

**Frontend** 
- **React Native (Android TV)**

- Communicates via REST with Flask backend

- Caches images locally

- Sends periodic heartbeat (every 30s)
- Fetches: 
    - Promotion Images
    - Promotion Metadata
    - Outlet branding assets

**Backend** 
- **Python Flask API**
- Controllers:
    - **device_controller** – login          validation, heartbeat writes, order tracking
    - **media_controller** - fetch promotions/images from Odo
    - **outlet_controller** - fetch outlet logos and metadata

- Background scheduler (APScheduler): checks stale devices


## 💾 Data Sources
    
- **Odoo External API**
    - Promotion images (base64)
    - Promotion metadata
    - Outlet branding assets

- **PostgreSQL**
    - Outlet validation
    - Heartbeat monitoring
    - Token storage
    - Order tracking metadata
## ☁️ AWS Deployment Architecture

**Core AWS Components**

- **VPC** (Company's existing VPC)
- Subnets
    - **Public Subnet** → Elastic Beanstalk (Flask API)
    - **Private Subnet** → RDS PostgreSQL
- **Internet Gateway** → allows devices to reach Flask API
- **NAT Gateway** → allows Flask backend to call external Odoo API
- **AWS WAF** → security layer filtering App→API traffic
- **CloudFront** → CDN + security + caching layer when scaling to >200 outlets

**Traffic Flow**

`Signage App → CloudFront (optional) → WAF → Elastic Beanstalk (Flask)
↘︎ Odoo API (external)
 → RDS (private) `

**Security Groups**
| Component  | Allowed From |
| ------------- | ------------- |
| CloudFront/WAF  | Internet |
| Elastic Beanstalk | WAF only |
| RDS PostgreSQL  | EB only  |

**Scaling Plan**
| Phase  |  Method |
| ------------- | ------------- |
| Now | Single EB instance (public subnet) |
| Later (>150–200 devices) | Move EB behind ALB + Auto Scaling + CloudFront |

## 🔗 API Endpoints

#### Device

```bash
  POST /device/validate
  POST /device/heartbeat
```

| Method | Endpoint     | Description                |
| :-------- | :------- | :------------------------- |
| `POST` | `/device/validate` | Validate outlet ID at login |
| `POST` | `/device/heartbeat` | Update device heartbeat timestamp |

#### Media

```bash
  GET /media/promotions
```

| Method | Endpoint     | Description                |
| :-------- | :------- | :------------------------- |
| `GET` | `/media/promotions` | Fetch all promotion images + metadata |

#### Outlet

```bash
  GET /outlet/logo
```

| Method | Endpoint     | Description                |
| :-------- | :------- | :------------------------- |
| `GET` | `/outlet/logo` | Fetch logo/branding image |


## 🗄 Database Schema (PostgreSQL + RDS)
    
**outlet_devices**
- id (PRIMARY KEY)
- device_name
- device_id
- device_location
- active
- last_seen
- order_tracking_url
- access_token

## ⚙️ Local Development
#### Requirements
- Python ≥ 3.10

- Node.js ≥ 18

- Android SDK / Android Studio

- PostgreSQL (local or remote)

#### Setup
```bash
  # Backend 
  cd backend/
  python -m venv venv source venv/bin/activate
  pip install -r requirements.txt 
  python application.py

  # Frontend 
  cd signage-app/ 
  npm install / yarn install 
  npm run android / npx expo start
```

## 🛠️ Testing
- Local testing with mocked Odoo API

- Remote test database (e.g., Supabase, Render PostgreSQL)

- Test network latency with throttling
