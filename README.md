# A Modern Discussion Forum (AMDF) - Backend API

> Final Year Project - BSc Computer Science

| Name | Student ID | Role |
|------|------------|------|
| Yuya Moe Thet | THE24639283 | Security - Fail2Ban Brute Force Protection |
| Byar Par | PAR24639286 | Full Stack Development |

[![Node.js](https://img.shields.io/badge/Node.js-18_LTS-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Express](https://img.shields.io/badge/Express-4.18-lightgrey.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Overview

AMDF backend is an Express + PostgreSQL REST API that powers authentication, discussions, answers, admin moderation, notifications, and direct messaging. The architecture follows a layered flow:

Request -> Routes -> Controllers -> Services -> Repositories -> PostgreSQL

The system uses JWT-based authentication, optional Google OAuth, Joi input validation, role-based authorization, and audit logging. Email delivery for verification and password reset is handled by Mandrill HTTP API (primary) with SMTP-capable fallback providers in the email service.

---

## Tech Stack

- Runtime: Node.js 18+
- Framework: Express 4.18
- Database: PostgreSQL 14+ (`pg`)
- Auth: JWT, Passport Google OAuth 2.0
- Validation: Joi
- Security: Helmet, CORS policy, bcrypt, Fail2Ban
- Logging: Winston + Morgan
- File handling: Multer
- Email: Axios (Mandrill HTTP API), Nodemailer (SMTP transports)

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
cd backend
npm install
cp .env.example .env
node src/config/databaseInitializer.js
npm run dev
```

Default server URL: `http://localhost:3001`

### Scripts

```bash
npm start      # node src/server.js
npm run dev    # nodemon src/server.js
```

---

## Environment Variables

```env
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d
SESSION_SECRET=your_session_secret
BCRYPT_ROUNDS=12

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

EMAIL_PROVIDER=mandrill
SMTP_USER=your_mandrill_api_key
SMTP_PASSWORD=your_mandrill_api_key
EMAIL_FROM=noreply@yourdomain.com
EMAIL_SENDER_NAME=A Modern Discussion Forum (AMDF)

ENABLE_EMAIL_VERIFICATION=true
ENABLE_GOOGLE_AUTH=true
ENABLE_CHAT=true
ENABLE_DISCUSSIONS=true
```

---

## Actual Database Schema (from databaseInitializer.js)

Core platform tables:

- `users`
- `discussions`
- `discussion_votes`
- `answers`
- `answer_votes`
- `notifications`
- `conversations`
- `messages`
- `audit_logs`

Dictionary/legacy domain tables also initialized in the same DB setup:

- `words`
- `tags`
- `word_categories`
- `word_category_mappings`
- `etymology`
- `user_favorites`
- `search_history`

Notes:

- UUID support via `uuid-ossp` extension.
- `updated_at` triggers are created for multiple tables.
- Role/account status checks and composite unique constraints are used (for example votes, favorites, conversations).

---

## API Routes

Base API prefix: `/api`

### Health and Root

- `GET /health` - API health (this is the correct health endpoint)
- `GET /` - API info payload

### Auth (`/api/auth`)

- Registration/login/password reset/email verification
- Token verify and refresh
- Google OAuth login + account link/unlink
- Account restore and deletion status check

Examples:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

### Users (`/api/users`)

- Public user listing/search/profile access
- Own profile updates
- Follow/unfollow and follow relationships
- Admin role updates/deletion

Examples:

- `GET /api/users`
- `GET /api/users/search`
- `GET /api/users/mention-suggestions`
- `GET /api/users/me/profile`
- `PUT /api/users/me/profile`
- `DELETE /api/users/me/account`
- `POST /api/users/:userId/follow`
- `DELETE /api/users/:userId/follow`

### Discussions (`/api/discussions`)

- Discussion CRUD
- Voting, save/unsave, solve/unsolve
- Pin/unpin, lock/unlock (moderator/admin)
- Reporting and related discussions

### Answers (`/api/answers`)

- Answer CRUD
- Voting/remove vote
- Answer listing by discussion

### Admin (`/api/admin`)

All admin routes require `authenticate + authorize('admin')`.

- Dashboard metrics
- User moderation
- Reports resolve/dismiss
- Analytics, moderation history, system info

### Messages (`/api/messages`)

Authenticated messaging endpoints:

- conversations list/get-or-create
- message list/send/delete

### Notifications (`/api/notifications`)

Authenticated notification endpoints:

- list
- mark read / mark all read
- delete

---

## Middleware and Security

Global middleware in `src/app.js`:

- Helmet
- Dynamic CORS (env origins + tunnel/local handling)
- JSON/urlencoded parsers (10 MB)
- Session + Passport initialize/session
- Winston request logger
- Morgan in dev mode
- Static uploads serving
- API not-found handler + global error handler

Auth middleware from `src/middlewares/index.js`:

- `authenticate`
- `optionalAuth`
- `authorize(...roles)`
- Multer upload middleware (image-only, size/count limits)
- Audit logging helper middleware

Security controls:

- Parameterized DB queries
- Bcrypt password hashing
- JWT verification + active user checks
- Role-based access checks
- Validation with Joi schemas
- Fail2Ban for brute-force login attempts

---

## Project Structure

```text
backend/
  src/
    app.js
    server.js
    config/
    controllers/
    middlewares/
    repositories/
    routes/
    services/
    utils/
    validations/
  uploads/
  logs/
  package.json
```

---

## License

MIT
