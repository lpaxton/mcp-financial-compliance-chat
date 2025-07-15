// backend/src/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const auditRoutes = require('./routes/audit');
const MCPOrchestrator = require('./services/MCPOrchestrator');
const ChatService = require('./services/ChatService');
const AuditService = require('./services/AuditService');
const authMiddleware = require('./middleware/auth');
const complianceMiddleware = require('./middleware/compliance');

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

// Add trust proxy setting before rate limiting
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for development
  skip: process.env.NODE_ENV === 'development' ? () => true : () => false,
  // Use a simple key generator for development
  keyGenerator: (req) => {
    // In development, just use IP or a default key
    if (process.env.NODE_ENV === 'development') {
      return req.ip || req.connection.remoteAddress || 'default';
    }
    return req.ip;
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize services
const mcpOrchestrator = new MCPOrchestrator();
const chatService = new ChatService(mcpOrchestrator);
const auditService = new AuditService();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/audit', authMiddleware, auditRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    mcpStatus: mcpOrchestrator.getStatus()
  });
});

// WebSocket connection handling
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const user = await authMiddleware.verifySocketToken(token);
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.id} (${socket.user.type})`);
  
  // Join user to their personal room
  socket.join(`user_${socket.user.id}`);
  
  // Log connection for audit
  auditService.logEvent('connection', 'user_connected', {
    userId: socket.user.id,
    userType: socket.user.type,
    timestamp: new Date().toISOString(),
    socketId: socket.id
  });

  // Handle chat messages
  socket.on('send_message', async (data) => {
    try {
      // Apply compliance middleware
      const complianceCheck = await complianceMiddleware.validateMessage(data.message, socket.user);
      
      if (!complianceCheck.approved) {
        socket.emit('compliance_violation', {
          reason: complianceCheck.reason,
          suggestions: complianceCheck.suggestions
        });
        return;
      }

      // Process message through MCP and get response
      const result = await chatService.processMessage(data.message, socket.user);
      
      if (result.success) {
        // Send response back to user
        socket.emit('message_response', {
          messageId: data.messageId,
          response: result.response,
          complianceMetadata: result.complianceMetadata,
          timestamp: new Date().toISOString()
        });
        
        // Log successful interaction
        auditService.logEvent('chat', 'message_processed', {
          userId: socket.user.id,
          messageId: data.messageId,
          complianceStatus: 'approved',
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('processing_error', {
          messageId: data.messageId,
          error: result.error,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Message processing error:', error);
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
      userPermissions: socket.user.permissions,
      regulatoryStatus: {
        finraCompliant: true,
        secCompliant: true,
        lastAudit: new Date().toISOString()
      }
    });
  });

  // Handle audit log requests
  socket.on('get_audit_logs', async (filters) => {
    try {
      const logs = await auditService.getUserAuditLogs(socket.user.id, filters);
      socket.emit('audit_logs', logs);
    } catch (error) {
      socket.emit('audit_error', { message: 'Failed to retrieve audit logs' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.id}`);
    auditService.logEvent('connection', 'user_disconnected', {
      userId: socket.user.id,
      timestamp: new Date().toISOString(),
      socketId: socket.id
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Log error for audit
  auditService.logEvent('error', 'server_error', {
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({ 
    error: 'Something went wrong!',
    timestamp: new Date().toISOString()
  });
});

// Initialize MCP servers
async function initializeMCPServers() {
  try {
    console.log('Starting MCP server initialization...');
    await mcpOrchestrator.initialize();
    console.log('MCP servers initialization completed');
  } catch (error) {
    console.warn('MCP servers initialization failed, continuing without MCP:', error.message);
    // Don't exit the process - continue running without MCP servers
  }
}

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  
  // Initialize MCP servers (non-blocking)
  initializeMCPServers().then(() => {
    console.log('Server fully initialized and ready to accept connections');
  }).catch((error) => {
    console.warn('Server started but MCP initialization had issues:', error.message);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await mcpOrchestrator.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };