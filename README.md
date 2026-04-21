# A Modern Discussion Forum — Backend API

> **Final Year Project** — BSc Computer Science

| Presenter | Student ID | Role |
|-----------|------------|------|
| Yuya Moe Thet | THE24639283 | Security & Backend Development |
| Byar Par | PAR24639286 | Front & Backend Development |

[![Node.js](https://img.shields.io/badge/Node.js-18_LTS-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Express](https://img.shields.io/badge/Express-4.18-lightgrey.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Problem Statement

Developer communities are scattered across multiple platforms, making it difficult to find reliable programming discussions in one place. Many existing forums have outdated interfaces and poor user experience. Additionally, login systems are vulnerable to brute force attacks where attackers repeatedly try passwords, putting user accounts at risk.

**Who benefits:** Developers · Computer Science Students · Tech Communities · Website Administrators

---

## Project Aim

To develop a modern and secure online discussion forum where developers can share knowledge, ask questions, and collaborate safely.

### Objectives

- Develop a responsive web forum using modern technologies
- Implement user registration and login authentication
- Enable users to create and interact with discussion posts
- Provide Google OAuth login functionality
- Protect the login system using Fail2Ban to prevent brute force attacks
- Monitor and block malicious IP addresses automatically

---

## Role Allocation

**Yuya Moe Thet (THE24639283) — Security & Backend Development**
- Configure Fail2Ban for brute force protection
- Setup and manage server security
- Assist with backend API development

**Byar Par (PAR24639286) — Front & Backend Development**
- Develop user interface using React.js
- Design responsive layout with Tailwind CSS
- Implement login and forum pages
- Connect frontend to backend APIs

---

## Overview

**A Modern Discussion Forum** provides a centralized platform for developers to share knowledge with a secure, modern interface. The backend is a four-layer REST API that addresses key security concerns:

- **Brute force protection** — Fail2Ban monitors SSH and web server logs, automatically blocking malicious IP addresses after repeated failed login attempts
- **JWT revocation** — Hybrid JWT + live DB query on every protected request closes the standard JWT revocation gap; deactivated accounts are rejected immediately
- **Soft-deletion with anonymisation** — `account_status = 'anonymized'` preserves thread integrity while replacing all PII

**Architecture:** Four-layer REST API — Routes → Controllers → Services → Repositories → PostgreSQL

**Tech stack:** Node.js 18 LTS · Express 4.18 · PostgreSQL 14+ · Passport.js · JWT · Joi 17.9 · Helmet.js 7.2 · Winston 3.17 · Nodemailer 7.0 · DOMPurify 3.3 · bcrypt (cost 12) · Fail2Ban

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
git clone https://github.com/byarpar/backent-finalproject.git
cd backent-finalproject
npm install
cp .env.example .env   # configure environment variables
node src/config/databaseInitializer.js
npm run dev
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Server
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=devforum
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRES_IN=30d

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Email (supports gmail / outlook / sendgrid / ses / smtp)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=A Modern Discussion Forum <noreply@moderndiscussionforum.com>

# Frontend
FRONTEND_URL=http://localhost:3000

# Session
SESSION_SECRET=your_session_secret
```

> Generate secure secrets: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Architecture

### Four-Layer Design

```
Request → Routes → Controllers → Services → Repositories → PostgreSQL
```

| Layer | Responsibility |
|-------|---------------|
| **Routes** | Endpoint definitions, middleware attachment, Joi validation |
| **Controllers** | HTTP input parsing, response formatting |
| **Services** | Business logic, authorization, `extractMentions()` pipeline |
| **Repositories** | All DB queries via parameterized statements; `BaseRepository` extended by domain repos |

### Key Design Decisions

| Decision | Problem Solved |
|----------|---------------|
| Hybrid JWT + live DB verify on every request | Closes JWT revocation gap — deactivated accounts rejected immediately |
| `account_status = 'anonymized'` soft-deletion | Preserves thread integrity; replaces PII while keeping content |
| JSONB single-level nested replies | Bounded reply depth; `parent_answer_id` validated against same discussion |
| Vote count separated from best-answer designation | Eliminates first-mover acceptance bias |
| `normalizeImages()` / `normalizeAnswerImages()` hooks | Handles images stored as string, array, or JSONB uniformly |
| `emailService.js` multi-provider support | `gmail`, `outlook`, `sendgrid`, `ses`, `smtp`; console fallback in dev |

---

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js             # PostgreSQL connection pool (pg 8.11)
│   │   ├── databaseInitializer.js  # Auto-provisions all 8 tables + indexes
│   │   ├── index.js
│   │   └── passport.js             # Google OAuth — server-side code exchange
│   ├── controllers/                # HTTP handlers
│   │   ├── adminController.js
│   │   ├── answerController.js
│   │   ├── authController.js
│   │   ├── discussionController.js
│   │   ├── notificationController.js
│   │   └── userController.js
│   ├── services/                   # Business logic
│   │   ├── adminService.js
│   │   ├── analyticsServices.js
│   │   ├── answerService.js
│   │   ├── authService.js
│   │   ├── discussionService.js
│   │   ├── emailService.js
│   │   └── userService.js
│   ├── repositories/               # Data access layer
│   │   ├── BaseRepository.js
│   │   ├── AdminRepository.js
│   │   ├── AnswerRepository.js
│   │   ├── DiscussionRepository.js
│   │   └── UserRepository.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── discussions.js
│   │   ├── answers.js
│   │   └── admin.js
│   ├── middlewares/index.js        # authenticate(), authorize(), error handler
│   ├── validations/schemas.js      # Joi schemas — stripUnknown: true
│   ├── utils/
│   │   ├── helpers.js              # sendSuccess / sendError utilities
│   │   ├── logger.js               # Winston — file + console transports
│   │   └── mentionUtils.js         # extractMentions() + normalizeMentions()
│   ├── app.js
│   └── server.js                   # Graceful SIGTERM/SIGINT shutdown
├── uploads/
├── logs/
└── package.json
```

---

## Database Schema

8 tables, auto-provisioned by `databaseInitializer.js`:

| Table | Primary Key | Notable Columns |
|-------|------------|-----------------|
| `users` | UUID `uuid_generate_v4()` | `role CHECK`, `account_status CHECK`, `email_verified`, `deleted_at TIMESTAMPTZ` |
| `discussions` | SERIAL INT | `tags TEXT[]`, `images JSONB`, `is_pinned`, `is_locked`, `category` (22 options) |
| `answers` | SERIAL INT | `replies JSONB`, `is_best_answer`, `vote_count` |
| `notifications` | SERIAL INT | `type`, `data JSONB`, `is_read` |
| `audit_logs` | SERIAL INT | `old_values JSONB`, `new_values JSONB`, `ip_address` |

Indexed on: `email`, `username`, `category`, `author_id`, `discussion_id`

---

## API Endpoints

### Authentication — `/api/auth`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/register` | Register new user | Public |
| POST | `/login` | Login, receive JWT | Public |
| GET | `/google` | Google OAuth (server-side exchange) | Public |
| GET | `/google/callback` | Google OAuth callback | Public |
| POST | `/forgot-password` | Request password reset email | Public |
| POST | `/reset-password` | Reset password with token | Public |
| POST | `/verify-email` | Verify email address | Public |
| POST | `/resend-verification` | Resend verification email | Public |
| POST | `/restore-account` | Restore soft-deleted account (30-day grace) | Public |
| POST | `/logout` | Logout and invalidate token | Private |
| POST | `/refresh-token` | Refresh access token | Private |

JWT error codes: `TOKEN_EXPIRED` · `INVALID_TOKEN` · `ACCOUNT_DEACTIVATED` · `EMAIL_NOT_VERIFIED`

### Users — `/api/users`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | List users (paginated) | Public |
| GET | `/search` | Search users | Public |
| GET | `/mention-suggestions` | `@mention` autocomplete | Public |
| GET | `/me/profile` | Get own profile | Private |
| PUT | `/me/profile` | Update own profile | Private |
| PUT | `/me/password` | Change password | Private |
| DELETE | `/me` | Soft-delete own account | Private |
| GET | `/:userId` | Get user profile by ID | Public |

### Discussions — `/api/discussions`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | List discussions (paginated, filtered) | Public |
| GET | `/categories` | Get all 22 categories | Public |
| GET | `/user/saved` | Get saved discussions | Private |
| GET | `/:id` | Get discussion by ID | Public |
| GET | `/:id/related` | Get related discussions | Public |
| POST | `/` | Create discussion | Private |
| PUT | `/:id` | Update discussion | Private |
| DELETE | `/:id` | Delete discussion | Private |
| POST | `/:id/vote` | Vote on discussion | Private |
| POST | `/:id/save` | Save/unsave discussion | Private |
| POST | `/:id/view` | Record view | Public |
| POST | `/upload-image` | Upload inline image | Private |

### Answers — `/api/answers`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/discussion/:discussionId` | Get answers for discussion | Public |
| POST | `/discussion/:discussionId` | Post answer | Private |
| PUT | `/:id` | Update answer | Private |
| DELETE | `/:id` | Delete answer | Private |
| POST | `/:id/vote` | Vote on answer | Private |
| POST | `/:id/best` | Mark best answer (author only) | Private |

### Admin — `/api/admin`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/dashboard` | Dashboard statistics | Admin |
| GET | `/users` | List all users | Admin |
| PUT | `/users/:id/status` | Update user status | Admin |
| PUT | `/users/:id/role` | Update user role | Admin |
| DELETE | `/users/:id` | Delete user | Admin |
| GET | `/reports` | List reported content | Admin |
| PUT | `/reports/:id` | Resolve report | Admin |
| GET | `/analytics` | Platform analytics | Admin |
| POST | `/import` | Import data (CSV/Excel) | Admin |

### Health Check

```
GET /api/health
```

---

## Security

Evaluated against OWASP Top 10:

| Control | Implementation |
|---------|---------------|
| SQL Injection (A03) | Parameterized queries via `pg`; no string interpolation |
| XSS (A03) | DOMPurify 3.3.0 on all rendered content |
| Broken Auth (A07) | JWT + live DB verify; bcrypt cost 12; email verification required |
| Security Misconfiguration (A05) | Helmet.js 7.2 — CSP, HSTS, X-Frame-Options |
| Broken Access Control (A01) | `authorize()` middleware; role CHECK constraint in DB |
| GDPR / Data Minimisation | Soft-deletion anonymisation; `deleted_at` + `account_status` |

Roles: `user` · `moderator` · `admin` · `super_admin`

---

## Scripts

```bash
npm start      # production
npm run dev    # development with nodemon
```

---

## Testing

22 functional test cases covering all user journeys:
- Guest: register, login, email verify, browse, forgot/reset password
- Registered user: create discussion, post answer, vote, @mention, notifications
- Admin: user management, analytics, reports, audit logs

---

## License

MIT
