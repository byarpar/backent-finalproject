# A Modern Discussion Forum — Backend API

REST API for A Modern Discussion Forum, a community platform for discussions, answers, and knowledge sharing.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Express](https://img.shields.io/badge/Express-4.18-lightgrey.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Overview

A Modern Discussion Forum Backend provides a clean 4-layer REST API for a Q&A and discussion community. It handles authentication, user management, threaded discussions, answers, and an admin panel.

**Tech stack:** Node.js · Express · PostgreSQL · Passport.js · JWT · Joi · Winston · Nodemailer

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
git clone https://github.com/byarpar/ft-finalproject.git
cd ft-finalproject/backend
npm install
cp .env.example .env   # configure environment variables
node src/config/databaseInitializer.js
npm run dev
```

### Environment Variables

Create a `.env` file in `backend/`:

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

# Email
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

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection pool
│   │   ├── databaseInitializer.js
│   │   ├── index.js
│   │   └── passport.js          # Google OAuth strategy
│   ├── controllers/             # HTTP request handlers
│   │   ├── adminController.js
│   │   ├── answerController.js
│   │   ├── authController.js
│   │   ├── discussionController.js
│   │   ├── notificationController.js
│   │   └── userController.js
│   ├── services/                # Business logic
│   │   ├── adminService.js
│   │   ├── analyticsServices.js
│   │   ├── answerService.js
│   │   ├── authService.js
│   │   ├── discussionService.js
│   │   ├── emailService.js
│   │   └── userService.js
│   ├── repositories/            # Data access layer
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
│   ├── middlewares/index.js     # Auth, validation, error handling
│   ├── validations/schemas.js   # Joi validation schemas
│   ├── utils/
│   │   ├── helpers.js
│   │   ├── logger.js
│   │   └── mentionUtils.js
│   ├── app.js
│   └── server.js
├── uploads/
├── logs/
└── package.json
```

---

## Architecture

```
Request → Routes → Controllers → Services → Repositories → PostgreSQL
```

- **Routes** — define endpoints and attach middleware
- **Controllers** — parse HTTP input, format responses
- **Services** — business logic, authorization, validation
- **Repositories** — all database queries via parameterized statements

---

## API Endpoints

### Authentication — `/api/auth`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/register` | Register new user | Public |
| POST | `/login` | Login, receive JWT | Public |
| GET | `/google` | Google OAuth login | Public |
| GET | `/google/callback` | Google OAuth callback | Public |
| POST | `/forgot-password` | Request password reset email | Public |
| POST | `/reset-password` | Reset password with token | Public |
| POST | `/verify-email` | Verify email address | Public |
| POST | `/resend-verification` | Resend verification email | Public |
| POST | `/restore-account` | Restore soft-deleted account | Public |
| POST | `/logout` | Logout and invalidate token | Private |
| POST | `/refresh-token` | Refresh access token | Private |

### Users — `/api/users`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | List users (paginated) | Public |
| GET | `/search` | Search users | Public |
| GET | `/mention-suggestions` | Get mention suggestions | Public |
| GET | `/me/profile` | Get own profile | Private |
| PUT | `/me/profile` | Update own profile | Private |
| PUT | `/me/password` | Change password | Private |
| DELETE | `/me` | Delete own account | Private |
| GET | `/:userId` | Get user profile by ID | Public |

### Discussions — `/api/discussions`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/` | List discussions (paginated) | Public |
| GET | `/categories` | Get categories | Public |
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
| POST | `/discussion/:discussionId` | Post a new answer | Private |
| PUT | `/:id` | Update answer | Private |
| DELETE | `/:id` | Delete answer | Private |
| POST | `/:id/vote` | Vote on answer | Private |
| POST | `/:id/best` | Mark answer as best | Private |

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

- **JWT authentication** — access tokens (7d) + refresh tokens (30d)
- **Bcrypt password hashing** — 12 salt rounds
- **Google OAuth 2.0** via Passport.js
- **Parameterized SQL queries** — no raw string interpolation
- **Joi validation** on all inputs
- **Role-based access control** — `user`, `moderator`, `admin`, `super_admin`
- **Helmet** security headers
- **CORS** restricted to `FRONTEND_URL`
- **HTTP-only session cookies**
- **Email verification** + **password reset** via token

---

## Scripts

```bash
npm start      # production
npm run dev    # development with nodemon
```

---

## License

MIT

