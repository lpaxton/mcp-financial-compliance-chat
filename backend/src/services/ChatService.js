// backend/src/services/ChatService.js
const axios = require('axios');
const AuditService = require('./AuditService');

class ChatService {
  constructor(mcpOrchestrator) {
    this.mcpOrchestrator = mcpOrchestrator;
    this.auditService = new AuditService();
    this.claudeApiKey = process.env.CLAUDE_API_KEY;
    this.claudeApiUrl = process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages';
    this.claudeModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
  }

  async processMessage(message, userContext) {
    const processingId = `PROC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Extract the message content if it's an object
      let messageContent = message;
      if (typeof message === 'object') {
        messageContent = message.content || message.message || JSON.stringify(message);
      }
      
      // Log message processing start
      await this.auditService.logEvent('processing', 'message_start', {
        processingId,
        userId: userContext.id,
        messageLength: String(messageContent).length,
        timestamp: new Date().toISOString()
      });

      // Step 1: MCP Pre-validation (simplified for now)
      const validationResult = { approved: true };
      
      // Step 2: Generate AI response
      const aiResponse = await this.generateAIResponse(messageContent, userContext);
      
      if (!aiResponse.success) {
        await this.auditService.logEvent('processing', 'ai_error', {
          processingId,
          error: aiResponse.error
        });
        
        return {
          success: false,
          error: "Failed to generate AI response",
          stage: 'generation'
        };
      }

      // Step 3: Return successful response
      await this.auditService.logEvent('processing', 'message_complete', {
        processingId,
        userId: userContext.id,
        messageLength: String(messageContent).length,
        responseLength: aiResponse.response.length,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        response: aiResponse.response,
        complianceMetadata: {
          processingId,
          disclaimers: this.getDisclaimers(userContext.type, messageContent),
          regulations: this.getApplicableRegulations(userContext.type),
          processingTime: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Message processing error:', error);
      await this.auditService.logEvent('processing', 'error', {
        processingId,
        error: error.message
      });
      return {
        success: false,
        error: "Internal processing error",
        stage: 'processing'
      };
    }
  }

  async generateAIResponse(message, userContext) {
    try {
      // Extract message content if it's an object
      let messageContent = message;
      if (typeof message === 'object') {
        messageContent = message.content || message.message || JSON.stringify(message);
      }

      // Check if we have an API key
      if (!this.claudeApiKey || this.claudeApiKey === 'your-anthropic-api-key-here') {
        console.warn('No valid Claude API key found, using placeholder response');
        return {
          success: true,
          response: `Thank you for your question about "${messageContent}". This is a placeholder response since the Claude API key is not configured. In a real setup, you would receive an AI-generated answer about your financial question.`
        };
      }

      // Call Claude 3.5 Sonnet API
      const response = await axios.post(this.claudeApiUrl, {
        model: this.claudeModel,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are a financial education assistant. The user is a ${userContext.type}. Please provide helpful, educational information about: ${messageContent}

Important: Keep responses factual and educational. Include appropriate disclaimers about investment risks.`
          }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      const aiResponse = response.data.content[0].text;

      return {
        success: true,
        response: aiResponse
      };

    } catch (error) {
      console.error('AI response generation error:', error);
      // Provide fallback response for development
      if (process.env.NODE_ENV === 'development') {
        let messageContent = typeof message === 'string' ? message : JSON.stringify(message);
        return {
          success: true,
          response: `This is a fallback response to your question about "${messageContent}" since the AI service is not available. In production, you would receive an AI-generated answer about your financial question.`
        };
      }
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods for compliance metadata
  getDisclaimers(userType, message) {
    const generalDisclaimer = "This information is for educational purposes only and not financial advice.";
    const investmentDisclaimer = "All investments involve risk, including the possible loss of principal.";
    
    let disclaimers = [generalDisclaimer];
    
    // Safely handle message content
    let messageText = '';
    if (typeof message === 'string') {
      messageText = message.toLowerCase();
    } else if (typeof message === 'object' && message !== null) {
      messageText = (message.content || message.message || '').toLowerCase();
    }
    
    // Add specific disclaimers based on message content
    if (messageText.includes("investment") || 
        messageText.includes("stock") || 
        messageText.includes("portfolio")) {
      disclaimers.push(investmentDisclaimer);
    }
    
    return disclaimers;
  }

  getApplicableRegulations(userType) {
    // Base regulations that apply to all
    const regulations = ["SEC Securities Act"];
    
    // Add specific regulations based on user type
    if (userType === "financial_advisor") {
      regulations.push("FINRA Rule 2210", "SEC Investment Advisers Act");
    } else if (userType === "institution") {
      regulations.push("SEC Regulation S-P", "Bank Secrecy Act");
    }
    
    return regulations;
  }
}

module.exports = ChatService;