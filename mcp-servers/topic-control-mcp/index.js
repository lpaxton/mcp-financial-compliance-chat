// mcp-servers/topic-control-mcp/index.js
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

class TopicControlServer {
  constructor() {
    this.server = new Server(
      {
        name: 'topic-control-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
    this.setupRequestHandlers();

    // Approved financial topics
    this.approvedTopics = new Set([
      'portfolio management',
      'asset allocation',
      'risk management',
      'diversification',
      'investment fundamentals',
      'retirement planning',
      'financial planning',
      'market analysis',
      'economic indicators',
      'investment education',
      'financial literacy',
      'budgeting',
      'savings strategies',
      'debt management',
      'insurance planning',
      'tax planning',
      'estate planning',
      'mutual funds',
      'etfs',
      'bonds',
      'stocks education',
      'dollar cost averaging',
      'compound interest',
      'inflation hedging',
      'sector analysis',
      'valuation methods'
    ]);

    // Prohibited topics that require special licensing or are inappropriate
    this.prohibitedTopics = new Set([
      'insider trading',
      'market manipulation',
      'penny stock promotion',
      'cryptocurrency speculation',
      'day trading strategies',
      'options strategies',
      'futures trading',
      'forex speculation',
      'pump and dump',
      'short selling advice',
      'leveraged trading',
      'margin trading advice',
      'hot stock tips',
      'guaranteed returns',
      'get rich quick',
      'timing the market',
      'individual stock recommendations',
      'specific buy/sell advice'
    ]);

    // Topics requiring elevated permissions
    this.restrictedTopics = new Set([
      'derivatives trading',
      'structured products',
      'private placements',
      'hedge fund strategies',
      'institutional trading',
      'regulatory arbitrage',
      'tax avoidance schemes',
      'offshore investing',
      'private equity',
      'venture capital'
    ]);
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'validate_topic',
          description: 'Validates if a conversation topic is appropriate for the user type and compliant with financial regulations',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message content to validate'
              },
              userType: {
                type: 'string',
                enum: ['retail_investor', 'financial_advisor', 'institution'],
                description: 'Type of user making the request'
              },
              timestamp: {
                type: 'string',
                description: 'ISO timestamp of the request'
              }
            },
            required: ['message', 'userType']
          }
        },
        {
          name: 'suggest_alternatives',
          description: 'Suggests alternative approved topics when a topic is rejected',
          inputSchema: {
            type: 'object',
            properties: {
              rejectedTopic: {
                type: 'string',
                description: 'The topic that was rejected'
              },
              userType: {
                type: 'string',
                enum: ['retail_investor', 'financial_advisor', 'institution'],
                description: 'Type of user making the request'
              }
            },
            required: ['rejectedTopic', 'userType']
          }
        },
        {
          name: 'escalate_concern',
          description: 'Escalates a concerning topic or message for human review',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The concerning message'
              },
              reason: {
                type: 'string',
                description: 'Reason for escalation'
              },
              severity: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'Severity level of the concern'
              }
            },
            required: ['message', 'reason']
          }
        },
        {
          name: 'get_approved_topics',
          description: 'Returns list of approved topics for the user type',
          inputSchema: {
            type: 'object',
            properties: {
              userType: {
                type: 'string',
                enum: ['retail_investor', 'financial_advisor', 'institution'],
                description: 'Type of user requesting topics'
              }
            },
            required: ['userType']
          }
        }
      ]
    }));
  }

  setupRequestHandlers() {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'validate_topic':
          return this.validateTopic(request.params.arguments);
        case 'suggest_alternatives':
          return this.suggestAlternatives(request.params.arguments);
        case 'escalate_concern':
          return this.escalateConcern(request.params.arguments);
        case 'get_approved_topics':
          return this.getApprovedTopics(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  classifyMessage(message) {
    const lowerMessage = message.toLowerCase();
    const words = lowerMessage.split(/\s+/);
    
    // Check for prohibited topics
    for (const topic of this.prohibitedTopics) {
      if (lowerMessage.includes(topic.toLowerCase())) {
        return {
          classification: 'prohibited',
          matchedTopic: topic,
          confidence: 0.9
        };
      }
    }

    // Check for restricted topics
    for (const topic of this.restrictedTopics) {
      if (lowerMessage.includes(topic.toLowerCase())) {
        return {
          classification: 'restricted',
          matchedTopic: topic,
          confidence: 0.8
        };
      }
    }

    // Check for approved topics
    for (const topic of this.approvedTopics) {
      if (lowerMessage.includes(topic.toLowerCase())) {
        return {
          classification: 'approved',
          matchedTopic: topic,
          confidence: 0.9
        };
      }
    }

    // Check for financial keywords that might be acceptable
    const financialKeywords = [
      'invest', 'portfolio', 'asset', 'fund', 'bond', 'stock', 'market',
      'retirement', 'saving', 'budget', 'financial', 'money', 'wealth',
      'risk', 'return', 'dividend', 'interest', 'tax', 'insurance'
    ];

    const hasFinancialKeywords = financialKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );

    if (hasFinancialKeywords) {
      return {
        classification: 'general_financial',
        matchedTopic: 'general financial discussion',
        confidence: 0.6
      };
    }

    return {
      classification: 'unclassified',
      matchedTopic: null,
      confidence: 0.3
    };
  }

  async validateTopic(args) {
    const { message, userType, timestamp } = args;
    
    try {
      const classification = this.classifyMessage(message);
      
      let approved = false;
      let reason = '';
      let requiresEscalation = false;
      let suggestedTopics = [];

      switch (classification.classification) {
        case 'prohibited':
          approved = false;
          reason = `Topic "${classification.matchedTopic}" is prohibited for all users due to regulatory compliance requirements`;
          requiresEscalation = true;
          suggestedTopics = this.getSuggestionsForUserType(userType, 'safe_alternatives');
          break;

        case 'restricted':
          if (userType === 'financial_advisor' || userType === 'institution') {
            approved = true;
            reason = 'Topic approved for licensed professional';
          } else {
            approved = false;
            reason = `Topic "${classification.matchedTopic}" requires professional licensing`;
            suggestedTopics = this.getSuggestionsForUserType(userType, 'educational');
          }
          break;

        case 'approved':
          approved = true;
          reason = 'Topic approved for discussion';
          break;

        case 'general_financial':
          approved = true;
          reason = 'General financial topic approved';
          break;

        default:
          // For unclassified topics, be conservative
          if (userType === 'retail_investor') {
            approved = false;
            reason = 'Topic not clearly identified as approved for retail investors';
            suggestedTopics = this.getSuggestionsForUserType(userType, 'educational');
          } else {
            approved = true;
            reason = 'Topic approved for professional user';
          }
      }

      // Log the validation for audit
      const validationLog = {
        timestamp: timestamp || new Date().toISOString(),
        message: message.substring(0, 100), // Truncate for logging
        userType,
        classification: classification.classification,
        approved,
        reason,
        confidence: classification.confidence
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            approved,
            reason,
            classification: classification.classification,
            confidence: classification.confidence,
            suggestedTopics,
            requiresEscalation,
            validationLog
          })
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            approved: false,
            reason: `Validation error: ${error.message}`,
            classification: 'error',
            confidence: 0,
            suggestedTopics: this.getSuggestionsForUserType(userType, 'safe_alternatives'),
            requiresEscalation: true
          })
        }]
      };
    }
  }

  async suggestAlternatives(args) {
    const { rejectedTopic, userType } = args;
    
    const suggestions = this.getSuggestionsForUserType(userType, 'alternatives');
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          rejectedTopic,
          suggestions,
          message: `Instead of "${rejectedTopic}", consider these approved topics:`,
          userType
        })
      }]
    };
  }

  async escalateConcern(args) {
    const { message, reason, severity = 'medium' } = args;
    
    // In production, this would integrate with compliance alerting systems
    const escalationId = `ESC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    console.warn(`ESCALATION ${escalationId}: ${reason} - Message: ${message.substring(0, 100)}`);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          escalationId,
          status: 'escalated',
          reason,
          severity,
          timestamp: new Date().toISOString(),
          message: 'Concern has been escalated to compliance team'
        })
      }]
    };
  }

  async getApprovedTopics(args) {
    const { userType } = args;
    
    const topics = this.getSuggestionsForUserType(userType, 'all_approved');
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          userType,
          topics,
          message: `Approved topics for ${userType}`,
          count: topics.length
        })
      }]
    };
  }

  getSuggestionsForUserType(userType, category) {
    const baseSuggestions = [
      'portfolio diversification',
      'risk management basics',
      'investment fundamentals',
      'retirement planning',
      'financial literacy',
      'budgeting strategies'
    ];

    const educationalSuggestions = [
      'understanding asset classes',
      'compound interest explanation',
      'dollar cost averaging',
      'inflation and investing',
      'market volatility concepts',
      'investment goal setting'
    ];

    const professionalSuggestions = [
      'fiduciary duty standards',
      'regulatory compliance updates',
      'client suitability assessment',
      'portfolio rebalancing strategies',
      'tax-efficient investing',
      'estate planning considerations'
    ];

    const safeAlternatives = [
      'general financial education',
      'saving strategies',
      'emergency fund planning',
      'debt management',
      'insurance basics',
      'financial goal setting'
    ];

    switch (category) {
      case 'educational':
        return userType === 'retail_investor' ? 
          [...baseSuggestions, ...educationalSuggestions] : 
          [...baseSuggestions, ...educationalSuggestions, ...professionalSuggestions];
      
      case 'safe_alternatives':
        return safeAlternatives;
      
      case 'alternatives':
        return baseSuggestions;
      
      case 'all_approved':
        if (userType === 'retail_investor') {
          return Array.from(this.approvedTopics).filter(topic => 
            !this.restrictedTopics.has(topic)
          );
        } else {
          return [...Array.from(this.approvedTopics), ...Array.from(this.restrictedTopics)];
        }
      
      default:
        return baseSuggestions;
    }
  }
}

// Start the server
const server = new TopicControlServer();
const transport = new StdioServerTransport();

server.server.connect(transport).catch(console.error);

console.error('Topic Control MCP Server running...');