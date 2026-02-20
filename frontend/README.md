# LINE Archive Website - Frontend

React frontend for LINE Archive Website with real-time message viewing and AI summarization.

## Features

- 📱 View LINE chat history by date
- 👥 Support for both private chats and group chats
- 🔄 Real-time message updates via Socket.IO
- 🔐 Secure authentication
- 🤖 AI-powered daily summary
- 🖼️ Image gallery support
- 🔍 Message search

## Prerequisites

- Node.js 16+ and npm
- Backend server running

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
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

4. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Build for Production

```bash
npm run build
npm run preview
```

## Usage

1. **Login**: Use admin credentials to login
2. **Select Date**: Choose a date to view messages
3. **Select Chat**: Click on a group or private chat
4. **View Messages**: Browse messages in chronological order
5. **AI Summary**: Click "สรุปทั้งวัน" to get AI summary

## Project Structure

```
frontend/
├── src/
│   ├── api/           # API client functions
│   ├── components/    # React components
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Page components
│   ├── utils/         # Utility functions
│   ├── App.jsx        # Main app component
│   └── main.jsx       # Entry point
├── public/            # Static assets
└── index.html         # HTML template
```

## Components

- **Sidebar**: Date picker and chat list
- **ChatWindow**: Message display area
- **MessageBubble**: Individual message component
- **SummaryModal**: AI summary popup
- **Avatar**: User/group avatar component

## Development

```bash
# Start dev server with hot reload
npm run dev

# Run linter
npm run lint

# Build for production
npm run build
```

## Troubleshooting

### Cannot connect to backend
- Check `VITE_API_URL` in `.env`
- Ensure backend server is running
- Check browser console for errors

### Real-time updates not working
- Verify `VITE_SOCKET_URL` is correct
- Check Socket.IO connection in browser console
- Ensure backend Socket.IO is configured

### Login fails
- Verify admin account exists in backend
- Check network tab for API errors
- Clear browser localStorage and try again

## Environment Variables

- `VITE_API_URL` - Backend API URL (default: http://localhost:3000)
- `VITE_SOCKET_URL` - Socket.IO URL (default: http://localhost:3000)

## License

ISC
