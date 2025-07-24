// backend/src/server.js - Fixed Version
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const MCPOrchestrator = require('./services/MCPOrchestrator');
const ChatService = require('./services/ChatService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// Body parsing middleware
app.use(express.json());

// Initialize services
const mcpOrchestrator = new MCPOrchestrator();
const chatService = new ChatService(mcpOrchestrator);

// Simple health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    mcpStatus: mcpOrchestrator.getStatus()
  });
});

// Get MCP server status
app.get('/api/mcp/status', (req, res) => {
  res.json({
    servers: mcpOrchestrator.getServerStatus(),
    initialized: mcpOrchestrator.initialized,
    placeholderMode: mcpOrchestrator.placeholderMode
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  // Send initial compliance status
  socket.emit('compliance_status', {
    mcpServers: mcpOrchestrator.getServerStatus(),
    timestamp: new Date().toISOString()
  });

  // Handle chat messages
  socket.on('send_message', async (data) => {
    try {
      console.log(`📝 Processing message: ${data.message}`);
      
      // Simple user context (no authentication needed)
      const userContext = {
        id: socket.id,
        type: data.userType || 'retail_investor',
        finraRegistered: data.finraRegistered || false,
        secRegistered: data.secRegistered || false
      };

      // Process message through MCP and get response
      const result = await chatService.processMessage(data.message, userContext);
      
      if (result.success) {
        console.log(`✅ Message processed successfully`);
        socket.emit('message_response', {
          messageId: data.messageId,
          response: result.response,
          complianceMetadata: result.complianceMetadata,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`❌ Message processing failed: ${result.error}`);
        socket.emit('processing_error', {
          messageId: data.messageId,
          error: result.error,
          suggestions: result.suggestions,
          stage: result.stage,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('❌ Message processing error:', error);
      socket.emit('processing_error', {
        messageId: data.messageId,
        error: 'Internal processing error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle compliance status requests
  socket.on('get_compliance_status', () => {
    socket.emit('compliance_status', {
      mcpServers: mcpOrchestrator.getServerStatus(),
      initialized: mcpOrchestrator.initialized,
      placeholderMode: mcpOrchestrator.placeholderMode,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Initialize MCP servers
async function initializeMCPServers() {
  try {
    console.log('🔒 Initializing MCP compliance system...');
    await mcpOrchestrator.initialize();
    console.log('✅ MCP servers initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize MCP servers:', error);
    console.log('🔧 System will continue in placeholder mode');
  }
}

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // Check if MCP should be disabled
  if (process.env.ENABLE_MCP !== 'true') {
    console.log('🔧 MCP servers disabled - running in placeholder mode');
  } else {
    console.log('🔒 MCP servers enabled - attempting to connect to real servers');
  }
  
  await initializeMCPServers();
  
  console.log('');
  console.log('🌐 Frontend: http://localhost:3000');
  console.log('⚙️  Backend: http://localhost:5000');
  console.log('📊 Health: http://localhost:5000/health');
  console.log('');
  
  if (mcpOrchestrator.placeholderMode) {
    console.log('⚠️  Running in placeholder mode - basic compliance validation only');
    console.log('💡 To enable full MCP: Ensure MCP servers are running and ENABLE_MCP=true in .env');
  } else {
    console.log('🔒 Full MCP compliance validation active');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  await mcpOrchestrator.shutdown();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  await mcpOrchestrator.shutdown();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.log('🔧 Continuing in placeholder mode');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('🔧 Continuing in placeholder mode');
});

module.exports = { app, server, io };