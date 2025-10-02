# Lisu Dictionary - Backend

Backend API server for the Lisu Dictionary application built with Node.js and Express.

## Features

- RESTful API for word management
- User authentication and authorization
- Admin dashboard functionality
- Etymology management
- Search functionality with pagination
- Audit logging
- Rate limiting and security

## Technologies

- **Framework**: Node.js with Express
- **Database**: PostgreSQL
- **Authentication**: JWT with bcrypt
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate limiting
- **Logging**: Winston with Morgan

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/change-password` - Change password

### Words
- `GET /api/words` - Get all words (paginated)
- `POST /api/words` - Create new word (admin)
- `PUT /api/words/:id` - Update word (admin)
- `DELETE /api/words/:id` - Delete word (admin)

### Search
- `GET /api/search` - Search words
- `GET /api/search/suggestions` - Get search suggestions

### Etymology
- `GET /api/etymology` - Get etymologies
- `POST /api/etymology` - Create etymology (admin)
- `PUT /api/etymology/:id` - Update etymology (admin)
- `DELETE /api/etymology/:id` - Delete etymology (admin)

### Admin
- `GET /api/admin/stats` - Get system statistics
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id/role` - Update user role
- `PUT /api/admin/users/:id/status` - Update user status
- `POST /api/admin/import` - Import words from Excel

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Set up PostgreSQL database
5. Run the application: `npm start`

## Development

- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm start` - Start production server

## Environment Variables

```
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=english_lisu_dictionary
DB_USER=your_username
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

## License

MIT
