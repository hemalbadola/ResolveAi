# ResolveAI — AI Complaint Categorization System

An AI-powered complaint management platform for educational institutions. Students submit complaints, AI automatically classifies them into departments (Academic, Technical, Hostel, Infrastructure, Administrative), detects duplicates, and admins manage everything through a real-time dashboard.

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Classification** | NVIDIA API (Llama 3.1) auto-categorizes complaints into 5 departments with confidence scores |
|  **Duplicate Detection** | TF-IDF + cosine similarity identifies similar complaints (threshold: 65%) |
|  **Admin Analytics** | Chart.js dashboards with trend analysis, category distribution, sentiment breakdown, SLA tracking |
|  **Real-time Updates** | Socket.IO pushes new complaints to admin dashboard instantly |
|  **Role-Based Access** | JWT authentication with admin/student role guards on both frontend and backend |
| **SLA Monitoring** | Background cron job tracks resolution deadlines and flags breaches |
| **Sentiment Analysis** | AI detects complaint urgency: Neutral, Frustrated, Urgent, Positive |

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│   Frontend (HTML)   │     │  AI Service (Python)  │
│   Tailwind + JS     │     │  FastAPI + NVIDIA API │
│   Port: 3000        │     │  Port: 8000           │
└────────┬────────────┘     └───────────┬──────────┘
         │                              │
         │  REST API + Socket.IO        │  HTTP (classify/duplicate)
         │                              │
         └──────────┬───────────────────┘
                    │
         ┌──────────▼──────────┐
         │  Backend (Node.js)  │
         │  Express + Mongoose │
         │  Port: 3000         │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │     MongoDB         │
         │  complaint_system   │
         └─────────────────────┘
```

---

##  Project Structure

```
webdev project/
├── server/                     # Node.js Backend
│   ├── server.js               # Entry point (Express + Socket.IO + SLA cron)
│   ├── config/db.js            # MongoDB connection
│   ├── middleware/auth.js      # JWT verification + admin guard
│   ├── models/
│   │   ├── User.js             # User schema (name, email, password, role)
│   │   └── Complaint.js        # Complaint schema (category, priority, SLA, sentiment)
│   ├── routes/
│   │   ├── auth.js             # POST /register, POST /login, GET /me
│   │   ├── complaints.js       # CRUD + AI classification integration
│   │   └── admin.js            # Stats aggregation + analytics
│   ├── utils/nlpClient.js      # HTTP bridge to Python AI service
│   └── .env                    # Server environment variables
│
├── ai-service/                 # Python AI Microservice
│   ├── main.py                 # FastAPI app (classify, duplicate, bulk-load endpoints)
│   ├── classifier.py           # NVIDIA API classifier + local LLM fallback
│   ├── duplicate_detector.py   # TF-IDF vectorizer + cosine similarity
│   ├── utils.py                # Text preprocessing + category validation
│   ├── data/complaints.csv     # Sample dataset (50 complaints, 5 categories)
│   ├── requirements.txt        # Python dependencies
│   └── .env                    # AI service environment variables
│
├── public/                     # Frontend (served by Express as static files)
│   ├── index.html              # Landing page
│   ├── login.html              # Authentication page
│   ├── register.html           # Registration (student/admin role picker)
│   ├── js/config.js            # API base URL configuration
│   ├── student/
│   │   └── dashboard.html      # Submit complaints + track status
│   └── admin/
│       ├── dashboard.html      # KPI cards + charts + live telemetry feed
│       ├── complaints.html     # Full complaint ledger + status management
│       └── analytics.html      # Deep analytics (trends, sentiment, SLA, priority)
```

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 16
- **Python** ≥ 3.9
- **MongoDB** running locally (default: `localhost:27017`)

### 1. Clone & Install

```bash
# Backend dependencies
cd server
npm install

# AI Service dependencies
cd ../ai-service
pip install -r requirements.txt

##./start.sh - quick start
```

### 2. Configure Environment

**`server/.env`**
```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/complaint_system
JWT_SECRET=your_jwt_secret_key_change_in_production
PYTHON_SERVICE_URL=http://localhost:8000
```

**`ai-service/.env`**
```env
NVIDIA_API_KEY=your_nvidia_api_key_here
LOCAL_LLM_URL=http://localhost:1234/v1
```

> Get an NVIDIA API key from [build.nvidia.com](https://build.nvidia.com). The system uses `meta/llama-3.1-8b-instruct` for classification.

### 3. Start Both Servers

```bash
# Terminal 1: AI Service
cd ai-service
uvicorn main:app --port 8000

# Terminal 2: Node.js Server
cd server
node server.js
```

### 4. Open the App

Navigate to **http://localhost:3000** in your browser.

---

##  User Roles & Login Flow

| Role | Registration | Dashboard | Capabilities |
|------|-------------|-----------|-------------|
| **Student** | Select "Student" on register page | `/student/dashboard.html` | Submit complaints, track status |
| **Admin/Teacher** | Select "Admin" on register page | `/admin/dashboard.html` | View all complaints, update status, analytics |

**Authentication Flow:**
1. Register with name, email, password, and role
2. Password is hashed with **bcryptjs** before storage
3. Login returns a **JWT token** (stored in localStorage)
4. Every API request includes the token in `Authorization: Bearer <token>` header
5. Admin pages verify role server-side via `/api/auth/me` — students are redirected

---

##  API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/auth/register` | Create new user | ❌ |
| `POST` | `/api/auth/login` | Get JWT token | ❌ |
| `GET` | `/api/auth/me` | Get current user info | ✅ |

### Complaints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/complaints` | List complaints (paginated, filterable) | ✅ |
| `POST` | `/api/complaints` | Submit new complaint (triggers AI classification) | ✅ |
| `PATCH` | `/api/complaints/:id/status` | Update complaint status (admin only) | ✅ Admin |

### Admin

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/admin/stats` | Dashboard statistics (counts by category, status, priority) | ✅ Admin |
| `GET` | `/api/admin/analytics` | Time-series data, resolution metrics, duplicate counts | ✅ Admin |

### AI Service (Python — internal)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `http://localhost:8000/health` | Health check |
| `POST` | `http://localhost:8000/classify` | Classify complaint text → category + confidence + sentiment |
| `POST` | `http://localhost:8000/check-duplicate` | Check if complaint is a duplicate |
| `POST` | `http://localhost:8000/bulk-load` | Load existing complaints for duplicate comparison |

---

## Tech Stack

### Backend
| Library | Version | Purpose |
|---------|---------|---------|
| Express | 5.2 | Web framework + static file server |
| Mongoose | 9.3 | MongoDB ODM |
| Socket.IO | 4.8 | Real-time WebSocket events |
| jsonwebtoken | 9.0 | JWT authentication |
| bcryptjs | 3.0 | Password hashing |
| axios | 1.13 | HTTP client (calls AI service) |
| dotenv | 17.3 | Environment variables |

### AI Service
| Library | Version | Purpose |
|---------|---------|---------|
| FastAPI | 0.115 | Python web framework |
| httpx | 0.27 | Async HTTP client (NVIDIA API calls) |
| scikit-learn | 1.5 | TF-IDF vectorizer + cosine similarity |
| pandas | 2.2 | Data handling |
| nltk | 3.9 | Natural language preprocessing |
| pydantic | 2.9 | Request/response validation 

### Frontend
| Library | Source | Purpose |
|---------|--------|---------|
| Tailwind CSS | CDN | Utility-first CSS framework |
| Chart.js | CDN | Dashboard charts (line, doughnut, bar) |
| Lucide Icons | CDN | Icon system |
| Socket.IO Client | CDN | Real-time live feed |

---

## Design System

- **Theme**: Dark mode with glass-panel aesthetic
- **Fonts**: Cinzel (headings), Josefin Sans (body), Fira Code (data/mono)
- **Colors**: Teal (#14B8A6) primary, Slate grays, amber/red for alerts
- **Branding**: "SYS_CORE" terminal-inspired theme

---

## Security

- Passwords hashed with **bcryptjs** (salt rounds: 10)
- Stateless **JWT** authentication on all protected routes
- **`isAdmin` middleware** on backend blocks non-admin API access (403)
- **Frontend role guards** verify user role via `/api/auth/me` on page load
- CORS enabled for development (configure for production)

---

## Testing the AI

```bash
# Health check
curl http://localhost:8000/health

# Classify a complaint
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "The WiFi in the library has been down for 3 days"}'

# Expected response:
# {"category": "Technical", "confidence": 0.9, "sentiment": "Frustrated"}
```

**AI Classification Categories:**
| Category | Example Complaints |
|----------|--------------------|
| Academic | Exam schedule conflicts, wrong grades, absent faculty |
| Technical | WiFi down, projector broken, lab computers crashing |
| Hostel | Mess food quality, room maintenance, hot water issues |
| Infrastructure | Broken chairs, leaking ceiling, no drinking water |
| Administrative | Fee receipts, ID card delays, certificate issues |

---

##  License

ISC
