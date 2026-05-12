# AI Complaint Categorization System

## Goal
Build a full-stack AI-powered complaint management system where students submit complaints, an NLP engine auto-categorizes them into departments, detects duplicates, manages priority, and provides admin dashboards for tracking and resolution.

## Project Type: **WEB** (Full-Stack)

## Success Criteria
- [ ] Students can register, login, submit complaints, and track status
- [ ] AI auto-categorizes complaints into 5 departments with >85% accuracy
- [ ] Admins can view, filter, assign, and resolve complaints
- [ ] Duplicate complaints are detected and priority is auto-escalated
- [ ] System handles 100+ concurrent complaints without degradation

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | HTML + CSS + Vanilla JS | Matches proposal, lightweight |
| Backend API | Node.js + Express.js | REST APIs, JWT auth |
| Database | MongoDB + Mongoose | Flexible document schema |
| NLP Microservice | Python + FastAPI | Classification, duplicate detection |
| NLP Engine | Google Gemini API | High accuracy, free tier available |
| Duplicate Detection | TF-IDF + cosine similarity (scikit-learn) | Fast, local, no API cost |
| Data Prep | pandas + Kaggle dataset | Training data & evaluation |
| Auth | JWT (jsonwebtoken + bcryptjs) | Stateless, simple |

---

## File Structure

```
complaint-system/
├── server/                       # Node.js backend
│   ├── package.json
│   ├── server.js                 # Express app entry point
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── middleware/
│   │   └── auth.js               # JWT middleware
│   ├── models/
│   │   ├── User.js               # User schema (student/admin)
│   │   └── Complaint.js          # Complaint schema
│   ├── routes/
│   │   ├── auth.js               # Register/login routes
│   │   ├── complaints.js         # CRUD + classification routes
│   │   └── admin.js              # Admin routes
│   └── utils/
│       └── nlpClient.js          # HTTP client to Python service
│
├── ai-service/                   # Python NLP microservice
│   ├── requirements.txt
│   ├── main.py                   # FastAPI app entry
│   ├── classifier.py             # Gemini API classification
│   ├── duplicate_detector.py     # TF-IDF duplicate detection
│   ├── data/
│   │   └── complaints.csv        # Kaggle dataset
│   └── utils.py                  # Text preprocessing
│
├── public/                       # Frontend (served by Express)
│   ├── index.html                # Landing page
│   ├── login.html                # Login page
│   ├── register.html             # Registration page
│   ├── student/
│   │   ├── dashboard.html        # Student dashboard
│   │   ├── submit.html           # Submit complaint form
│   │   └── track.html            # Track complaints
│   ├── admin/
│   │   ├── dashboard.html        # Admin dashboard
│   │   ├── complaints.html       # All complaints view
│   │   └── analytics.html        # Analytics charts
│   ├── css/
│   │   └── style.css             # Global styles
│   └── js/
│       ├── auth.js               # Auth logic (login/register)
│       ├── student.js            # Student dashboard logic
│       ├── admin.js              # Admin dashboard logic
│       └── api.js                # API helper (fetch wrapper)
│
└── README.md
```

---

## Task Breakdown

### Phase 1: Foundation
**Agent:** `backend-specialist` + `database-architect`

- [ ] **T1: Initialize Node.js project**
  - `npm init`, install express, mongoose, jsonwebtoken, bcryptjs, cors, dotenv
  - → Verify: `npm start` runs without errors

- [ ] **T2: MongoDB connection & schemas**
  - Create `User` schema (name, email, password, role)
  - Create `Complaint` schema (title, description, category, priority, status, submittedBy, duplicateOf, createdAt)
  - → Verify: Models can create/read documents

- [ ] **T3: Initialize Python FastAPI service**
  - `pip install fastapi uvicorn google-generativeai scikit-learn pandas nltk`
  - Create `main.py` with health check endpoint
  - → Verify: `uvicorn main:app` runs on port 8000

### Phase 2: Backend APIs
**Agent:** `backend-specialist` + `security-auditor`

- [ ] **T4: Auth APIs**
  - POST `/api/auth/register` — create user (student/admin)
  - POST `/api/auth/login` — return JWT token
  - GET `/api/auth/me` — get current user
  - Middleware: `auth.js` — verify JWT on protected routes
  - → Verify: Register user → Login → Access protected route

- [ ] **T5: Complaint APIs**
  - POST `/api/complaints` — submit complaint (student, auth required)
  - GET `/api/complaints` — get user's complaints (student) or all (admin)
  - PATCH `/api/complaints/:id/status` — update status (admin only)
  - → Verify: Create complaint → fetch list → update status

- [ ] **T6: NLP Bridge**
  - `nlpClient.js` — HTTP client calling FastAPI endpoints
  - When complaint is submitted: auto-call classifier → save category
  - When complaint is submitted: auto-call duplicate detector → link if found
  - → Verify: Submitting complaint returns auto-assigned category

### Phase 3: AI/NLP Service
**Agent:** `backend-specialist` (Python)

- [ ] **T7: Gemini API classifier**
  - Take complaint text → prompt Gemini to classify into one of 5 categories
  - Return category + confidence score
  - → Verify: `POST /classify` with sample text returns valid category

- [ ] **T8: Duplicate detection**
  - TF-IDF vectorization of all existing complaints
  - Cosine similarity against new complaint
  - If similarity > 0.8 → flag as duplicate, boost priority
  - → Verify: Submit near-identical complaint → flagged as duplicate

- [ ] **T9: Kaggle data integration**
  - Download/import consumer complaints dataset
  - Map to 5 categories
  - Use for testing classification accuracy
  - → Verify: Accuracy metrics printed to console

### Phase 4: Frontend — Student
**Agent:** `frontend-specialist`

- [ ] **T10: Auth pages (login/register)**
  - Clean, modern forms with validation
  - JWT stored in localStorage
  - → Verify: Register → Login → redirect to dashboard

- [ ] **T11: Student dashboard**
  - Welcome message, recent complaints, quick stats
  - Submit new complaint button
  - → Verify: Shows complaints for logged-in user

- [ ] **T12: Complaint form**
  - Title, description textarea, optional category override
  - Submit → shows spinner → shows AI-assigned category
  - → Verify: Submit complaint → see category + success message

- [ ] **T13: Complaint tracker**
  - List of all user's complaints with status badges
  - Filter by status, category
  - → Verify: Filed complaints appear with correct statuses

### Phase 5: Frontend — Admin
**Agent:** `frontend-specialist`

- [ ] **T14: Admin dashboard**
  - Overview: total complaints, by category, by status (charts)
  - Recent complaints feed
  - → Verify: Shows aggregate data + chart renders

- [ ] **T15: Complaint management**
  - Table with all complaints, sortable/filterable
  - Click to view details, update status, see duplicate chain
  - → Verify: Filter by category → update status → see change

- [ ] **T16: Analytics page**
  - Charts: complaints over time, category distribution, resolution time
  - Priority heatmap, frequent issue trends
  - → Verify: Charts render with real data

### Phase 6: Integration & Polish
**Agent:** `test-engineer` + `security-auditor`

- [ ] **T17: End-to-end flow test**
  - Student registers → logs in → submits complaint → sees category → admin views → updates status → student sees update
  - → Verify: Complete flow works in browser

- [ ] **T18: Security check**
  - Password hashing (bcrypt), JWT secret in .env
  - Input sanitization, rate limiting
  - → Verify: `security_scan.py` passes

---

## Phase X: Final Verification

- [ ] Run `npm run dev` — Node server starts on 3000
- [ ] Run `uvicorn main:app` — Python service starts on 8000
- [ ] E2E flow: student submits complaint → auto-classified → admin sees it
- [ ] Duplicate detection works on similar complaints
- [ ] Priority escalation works on repeated issues
- [ ] All CRUD operations work for both roles
- [ ] No hardcoded secrets (check `.env`)
