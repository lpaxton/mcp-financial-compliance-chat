# MCP Financial Compliance Chat - Frontend

This is the React-based frontend for the MCP Financial Compliance Chat application.

## Features

- Real-time chat interface with Socket.IO
- User type selection (Retail Investor, Financial Advisor, Institutional Investor)
- FINRA/SEC registration status controls
- Compliance status monitoring
- Real-time connection status indicator
- Message history with metadata

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm

### Installation

```bash
npm install
```

### Development

To run the frontend in development mode:

```bash
npm start
```

This will start the development server on http://localhost:3000 and automatically connect to the backend on http://localhost:5000.

### Building for Production

```bash
npm run build
```

This creates a `build` folder with optimized production files.

### Testing

```bash
npm test
```

## Usage

1. Make sure the backend server is running on http://localhost:5000
2. Start the frontend with `npm start`
3. Open http://localhost:3000 in your browser
4. Configure your user type and registration status
5. Start chatting with compliance-aware responses

## Architecture

- **React**: Main UI framework
- **Socket.IO Client**: Real-time communication with backend
- **Create React App**: Build tooling and development server

## Communication with Backend

The frontend communicates with the backend using Socket.IO WebSockets:

- Connects to `http://localhost:5000`
- Sends messages with user context (type, FINRA/SEC status)
- Receives real-time responses and compliance metadata
- Monitors MCP server status

## Configuration

The frontend is configured to work with the backend through:

- Proxy configuration in package.json for API calls
- Direct Socket.IO connection to http://localhost:5000
- CORS headers handled by backend

## Troubleshooting

### Connection Issues

- Verify backend is running on port 5000
- Check browser console for connection errors
- Ensure CORS is properly configured in backend

### Build Issues

- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Update dependencies if needed
- Check Node.js version compatibility