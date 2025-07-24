# MCP Financial Chat Application

A comprehensive financial chat application that integrates Model Context Protocol (MCP) servers for enhanced compliance and financial data processing capabilities.

## 🏗️ Application Architecture

This application consists of three main components:

### Frontend (React Application)
- **Technology**: React 18 with Socket.IO client
- **Port**: 3000 (development)
- **Purpose**: User interface for the financial chat application
- **Features**: Real-time chat, authentication, compliance monitoring

### Backend (Express Server)
- **Technology**: Node.js with Express and Socket.IO
- **Port**: 5000 (default)
- **Purpose**: API server and WebSocket handler
- **Features**: MCP orchestration, chat services, audit logging

### MCP Servers (Model Context Protocol)
- **FINRA Compliance MCP**: Handles FINRA regulatory compliance
- **SEC Compliance MCP**: Manages SEC regulatory requirements  
- **Topic Control MCP**: Controls and monitors conversation topics

## 🚀 How the Application Works

1. **User Interface**: The React frontend provides a modern chat interface where users can interact with the financial AI assistant
2. **Real-time Communication**: Socket.IO enables real-time bidirectional communication between the frontend and backend
3. **MCP Integration**: The backend orchestrates multiple MCP servers to provide specialized financial compliance and data services
4. **Compliance Monitoring**: All conversations are monitored for compliance with FINRA and SEC regulations
5. **Topic Control**: The topic control MCP ensures conversations stay within appropriate financial domains

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager

## 🚀 Getting Started

### 1. Install Dependencies

First, install dependencies for all components:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install MCP server dependencies
cd ../mcp-servers/topic-control-mcp
npm install

cd ../finra-compliance-mcp
npm install

cd ../sec-compliance-mcp
npm install
```

### 2. Start the Application

You have two options for starting the application:

#### Option A: Start All Services from Backend (Recommended)

```bash
# Navigate to backend directory
cd backend

# Start all MCP servers
npm run mcp:start

# In a new terminal, start the backend server
npm run dev

# In another terminal, start the frontend
cd ../frontend
npm start
```

#### Option B: Start Each Service Individually

**Terminal 1 - MCP Servers:**
```bash
# Start Topic Control MCP
cd mcp-servers/topic-control-mcp
npm start
```

**Terminal 2 - FINRA Compliance MCP:**
```bash
cd mcp-servers/finra-compliance-mcp
npm start
```

**Terminal 3 - SEC Compliance MCP:**
```bash
cd mcp-servers/sec-compliance-mcp
npm start
```

**Terminal 4 - Backend Server:**
```bash
cd backend
npm run dev
```

**Terminal 5 - Frontend:**
```bash
cd frontend
npm start
```

### 3. Access the Application

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Health Check**: [http://localhost:5000/health](http://localhost:5000/health)
- **MCP Status**: [http://localhost:5000/api/mcp/status](http://localhost:5000/api/mcp/status)

## 📜 Available Scripts

### Frontend Scripts
- `npm start` - Runs the app in development mode
- `npm test` - Launches the test runner
- `npm run build` - Builds the app for production
- `npm run eject` - Ejects from Create React App (one-way operation)

### Backend Scripts
- `npm start` - Starts the production server
- `npm run dev` - Starts the development server with nodemon
- `npm run mcp:start` - Starts all MCP servers concurrently
- `npm run mcp:topic` - Starts only the Topic Control MCP server
- `npm run mcp:finra` - Starts only the FINRA Compliance MCP server
- `npm run mcp:sec` - Starts only the SEC Compliance MCP server

### MCP Server Scripts
Each MCP server supports:
- `npm start` - Starts the MCP server
- `npm run dev` - Starts with nodemon for development

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=5000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

## 🏗️ Project Structure

```
mcp-financial-chat/
├── backend/                 # Express.js backend server
│   ├── src/
│   │   ├── server.js       # Main server file
│   │   ├── config/         # Configuration files
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # Data models
│   │   ├── routes/         # API routes
│   │   └── services/       # Business logic services
│   ├── logs/               # Application logs
│   └── package.json
├── frontend/               # React.js frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   └── styles/         # CSS styles
│   ├── public/             # Static files
│   └── package.json
└── mcp-servers/            # Model Context Protocol servers
    ├── finra-compliance-mcp/
    ├── sec-compliance-mcp/
    └── topic-control-mcp/
```

## 🛠️ Development

### Adding New Features
1. Frontend changes go in the `frontend/src` directory
2. Backend API changes go in the `backend/src` directory
3. MCP server modifications go in their respective `mcp-servers/` subdirectories

### Debugging
- Use `npm run dev` for hot-reloading during development
- Check the browser console for frontend issues
- Monitor backend logs for server-side debugging
- Use the health check endpoints to verify service status

## 📚 Learn More

- [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started)
- [Model Context Protocol](https://modelcontextprotocol.io/docs)
- [Socket.IO documentation](https://socket.io/docs/v4/)
- [Express.js documentation](https://expressjs.com/)


