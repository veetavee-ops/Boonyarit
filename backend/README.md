# LINE Archive Website - Backend

Backend server for LINE Archive Website using Node.js, Express, PostgreSQL, and Socket.IO.

## Features

- 🤖 LINE Bot webhook integration
- 💾 PostgreSQL database for message storage
- 🔌 Real-time updates via Socket.IO
- 🔐 JWT authentication
- 🤖 AI-powered message summarization (Google Gemini)
- 📸 Image grouping for multiple images sent together
- 📁 Binary file storage in database

## Prerequisites

- Node.js 16+ and npm
- PostgreSQL 12+
- LINE Messaging API account
- Google Gemini API key (for AI summary feature)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```env
# LINE Bot
CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
CHANNEL_SECRET=your_line_channel_secret

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=line_archive
DB_USER=postgres
DB_PASSWORD=your_password

# Authentication
JWT_SECRET=your_secret_key

# AI Service
GEMINI_API_KEY=your_gemini_api_key

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

4. Create PostgreSQL database:
```sql
CREATE DATABASE line_archive;
```

5. Run the server:
```bash
npm start
```

The server will automatically create database tables on first run.

## API Endpoints

### Public Endpoints

- `POST /webhook` - LINE Bot webhook
- `POST /api/auth/login` - Admin login
- `POST /api/setup/admin` - Create first admin (one-time)

### Protected Endpoints

- `GET /api/groups?date=YYYY-MM-DD` - Get all groups for a date
- `GET /api/messages?groupId=xxx&date=YYYY-MM-DD` - Get messages
- `GET /api/attachments/:id/image` - Get image attachment
- `POST /api/messages/summarize-day` - Generate AI summary

## Database Schema

### Tables

- **Users** - LINE user profiles
- **Groups** - LINE group information
- **Messages** - All messages (text, images, videos, etc.)
- **MessageAttachments** - Binary file data for images
- **Admins** - Admin accounts

## LINE Bot Setup

1. Create a LINE Messaging API channel at https://developers.line.biz/
2. Get your Channel Access Token and Channel Secret
3. Set webhook URL to `https://your-domain.com/webhook`
4. Enable webhook in LINE console

## Development

```bash
# Start with auto-reload
npm start

# Check database connection
node -e "require('./config/database')"
```

## Troubleshooting

### Database connection failed
- Check PostgreSQL is running
- Verify database credentials in `.env`
- Ensure database exists

### Webhook not receiving messages
- Check LINE webhook URL is correct
- Verify Channel Secret and Access Token
- Check server logs for errors

### Socket.IO not connecting
- Ensure CORS is configured correctly
- Check FRONTEND_URL in `.env`
- Verify firewall settings

## Project Structure

```
backend/
├── config/          # Database configuration
├── models/          # Sequelize models
├── routes/          # Express routes
├── services/        # Business logic (LINE, AI)
├── middleware/      # Auth middleware
├── media/           # Uploaded media files
└── app.js           # Main application
```

## License

ISC
