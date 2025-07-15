// backend/src/services/MCPOrchestrator.js
const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

class MCPClient extends EventEmitter {
  constructor(serverPath, serverName) {
    super();
    this.serverPath = serverPath;
    this.serverName = serverName;
    this.process = null;
    this.connected = false;
    this.messageId = 0;
    this.pendingRequests = new Map();
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const serverDir = path.resolve(__dirname, '../../mcp-servers', this.serverPath);
      
      this.process = spawn('node', ['index.js'], {
        cwd: serverDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          lines.forEach(line => this.handleMessage(JSON.parse(line)));
        } catch (error) {
          console.error(`Error parsing message from ${this.serverName}:`, error);
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error(`${this.serverName} stderr:`, data.toString());
      });

      this.process.on('close', (code) => {
        console.log(`${this.serverName} process exited with code ${code}`);
        this.connected = false;
        this.emit('disconnected');
      });

      // Send initialization request
      this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'MCP Financial Chat',
          version: '1.0.0'
        }
      }).then(() => {
        this.connected = true;
        resolve();
      }).catch(reject);
    });
  }

  handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'MCP request failed'));
      } else {
        resolve(message.result);
      }
    } else if (message.method) {
      // Handle notifications
      this.emit('notification', message);
    }
  }

  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.connected) {
        reject(new Error(`${this.serverName} not connected`));
        return;
      }

      const id = ++this.messageId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      
      this.process.stdin.write(JSON.stringify(request) + '\n');
      
      // Set timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, 30000);
    });
  }

  async callTool(name, arguments_) {
    return this.sendRequest('tools/call', {
      name,
      arguments: arguments_
    });
  }

  async listTools() {
    return this.sendRequest('tools/list');
  }

  shutdown() {
    if (this.process) {
      this.process.kill();
      this.connected = false;
    }
  }
}

class MCPOrchestrator {
  constructor() {
    this.clients = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize Topic Control MCP
      const topicControlClient = new MCPClient('topic-control-mcp', 'Topic Control');
      await topicControlClient.initialize();
      this.clients.set('topic-control', topicControlClient);

      // Initialize FINRA Compliance MCP
      const finraClient = new MCPClient('finra-compliance-mcp', 'FINRA Compliance');
      await finraClient.initialize();
      this.clients.set('finra-compliance', finraClient);

      // Initialize SEC Compliance MCP
      const secClient = new MCPClient('sec-compliance-mcp', 'SEC Compliance');
      await secClient.initialize();
      this.clients.set('sec-compliance', secClient);

      this.initialized = true;
      console.log('All MCP servers initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MCP servers:', error);
      throw error;
    }
  }

  async validateMessage(message, userContext) {
    if (!this.initialized) {
      throw new Error('MCP Orchestrator not initialized');
    }

    const validationResults = {};

    try {
      // Step 1: Topic Control Validation
      const topicClient = this.clients.get('topic-control');
      validationResults.topicControl = await topicClient.callTool('validate_topic', {
        message: message.content,
        userType: userContext.type,
        timestamp: new Date().toISOString()
      });

      if (!validationResults.topicControl.approved) {
        return {
          approved: false,
          reason: validationResults.topicControl.reason,
          suggestions: validationResults.topicControl.suggestedTopics,
          stage: 'topic_control'
        };
      }

      // Step 2: FINRA Compliance Check
      const finraClient = this.clients.get('finra-compliance');
      validationResults.finraCompliance = await finraClient.callTool('audit_communication', {
        content: message.content,
        userProfile: {
          type: userContext.type,
          finraRegistered: userContext.finraRegistered,
          permissions: userContext.permissions
        },
        communicationType: 'chat'
      });

      if (!validationResults.finraCompliance.compliant) {
        return {
          approved: false,
          reason: 'FINRA compliance violation',
          violations: validationResults.finraCompliance.violations,
          stage: 'finra_compliance'
        };
      }

      // Step 3: SEC Compliance Check
      const secClient = this.clients.get('sec-compliance');
      validationResults.secCompliance = await secClient.callTool('validate_investment_advice', {
        content: message.content,
        advisorRegistration: userContext.secRegistration,
        fiduciaryContext: userContext.type === 'financial_advisor'
      });

      if (!validationResults.secCompliance.compliant) {
        return {
          approved: false,
          reason: 'SEC compliance violation',
          violations: validationResults.secCompliance.violations,
          stage: 'sec_compliance'
        };
      }

      return {
        approved: true,
        validationResults,
        requirements: [
          ...validationResults.finraCompliance.requirements || [],
          ...validationResults.secCompliance.requirements || []
        ]
      };

    } catch (error) {
      console.error('MCP validation error:', error);
      throw new Error(`Compliance validation failed: ${error.message}`);
    }
  }

  async auditResponse(response, originalMessage, userContext, validationResults) {
    if (!this.initialized) {
      throw new Error('MCP Orchestrator not initialized');
    }

    try {
      const auditResults = {};

      // FINRA response audit
      const finraClient = this.clients.get('finra-compliance');
      auditResults.finraAudit = await finraClient.callTool('audit_response', {
        response: response.content,
        originalMessage: originalMessage.content,
        userContext,
        preValidationResults: validationResults.finraCompliance
      });

      // SEC response audit
      const secClient = this.clients.get('sec-compliance');
      auditResults.secAudit = await secClient.callTool('audit_response', {
        response: response.content,
        originalMessage: originalMessage.content,
        userContext,
        preValidationResults: validationResults.secCompliance
      });

      // Get required disclaimers
      const disclaimers = [];
      
      if (auditResults.finraAudit.disclaimers) {
        disclaimers.push(...auditResults.finraAudit.disclaimers);
      }
      
      if (auditResults.secAudit.disclaimers) {
        disclaimers.push(...auditResults.secAudit.disclaimers);
      }

      return {
        approved: auditResults.finraAudit.compliant && auditResults.secAudit.compliant,
        disclaimers: [...new Set(disclaimers)], // Remove duplicates
        auditResults,
        complianceMetadata: {
          finraCompliant: auditResults.finraAudit.compliant,
          secCompliant: auditResults.secAudit.compliant,
          auditTrail: `Processed at ${new Date().toISOString()}`,
          validationId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      };
    } catch (error) {
      console.error('MCP response audit error:', error);
      throw new Error(`Response audit failed: ${error.message}`);
    }
  }

  getServerStatus() {
    const status = {};
    for (const [name, client] of this.clients) {
      status[name] = {
        connected: client.connected,
        name: client.serverName,
        lastPing: new Date().toISOString()
      };
    }
    return status;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      serverCount: this.clients.size,
      servers: this.getServerStatus()
    };
  }

  async shutdown() {
    console.log('Shutting down MCP servers...');
    for (const [name, client] of this.clients) {
      try {
        client.shutdown();
        console.log(`${name} server shut down`);
      } catch (error) {
        console.error(`Error shutting down ${name}:`, error);
      }
    }
    this.clients.clear();
    this.initialized = false;
  }
}

module.exports = MCPOrchestrator;