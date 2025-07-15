// backend/src/services/ChatService.js
const axios = require('axios');
const AuditService = require('./AuditService');

class ChatService {
  constructor(mcpOrchestrator) {
    this.mcpOrchestrator = mcpOrchestrator;
    this.auditService = new AuditService();
    this.claudeApiKey = process.env.CLAUDE_API_KEY;
    this.claudeApiUrl = 'https://api.anthropic.com/v1/messages';
  }

  async processMessage(message, userContext) {
    const processingId = `PROC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Log message processing start
      await this.auditService.logEvent('processing', 'message_start', {
        processingId,
        userId: userContext.id,
        messageLength: message.content.length,
        timestamp: new Date().toISOString()
      });

      // Step 1: MCP Pre-validation
      const validationResult = await this.mcpOrchestrator.validateMessage(message, userContext);
      
      if (!validationResult.approved) {
        await this.auditService.logEvent('compliance', 'validation_failed', {
          processingId,
          reason: validationResult.reason,
          stage: validationResult.stage
        });

        return {
          success: false,
          error: validationResult.reason,
          suggestions: validationResult.suggestions,
          stage: 'validation'
        };
      }

      // Step 2: Generate Claude response
      const claudeResponse = await this.generateClaudeResponse(message, userContext, validationResult);
      
      if (!claudeResponse.success) {
        await this.auditService.logEvent('processing', 'claude_error', {
          processingId,
          error: claudeResponse.error
        });

        return {
          success: false,
          error: 'Failed to generate response',
          stage: 'generation'
        };
      }

      // Step 3: MCP Post-validation (Response Audit)
      const auditResult = await this.mcpOrchestrator.auditResponse(
        claudeResponse.response,
        message,
        userContext,
        validationResult.validationResults
      );

      if (!auditResult.approved) {
        await this.auditService.logEvent('compliance', 'response_audit_failed', {
          processingId,
          auditResult
        });

        return {
          success: false,
          error: 'Response failed compliance audit',
          stage: 'audit'
        };
      }

      // Step 4: Finalize response with disclaimers
      const finalResponse = {
        content: claudeResponse.response.content,
        disclaimers: auditResult.disclaimers,
        complianceMetadata: auditResult.complianceMetadata,
        processingId
      };

      // Log successful processing
      await this.auditService.logEvent('processing', 'message_completed', {
        processingId,
        userId: userContext.id,
        complianceStatus: 'approved',
        responseLength: finalResponse.content.length,
        disclaimerCount: finalResponse.disclaimers.length
      });

      return {
        success: true,
        response: finalResponse,
        complianceMetadata: auditResult.complianceMetadata
      };

    } catch (error) {
      console.error('Chat processing error:', error);
      
      await this.auditService.logEvent('error', 'processing_exception', {
        processingId,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: 'Internal processing error',
        stage: 'system_error'
      };
    }
  }

  async generateClaudeResponse(message, userContext, validationResult) {
    try {
      // Build context for Claude with compliance constraints
      const systemPrompt = this.buildSystemPrompt(userContext, validationResult);
      const userPrompt = this.buildUserPrompt(message, userContext);

      const requestBody = {
        model: 'claude-3-haiku-20240307', // Using Haiku for faster responses
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ],
        system: systemPrompt
      };

      const response = await axios.post(this.claudeApiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000 // 30 second timeout
      });

      return {
        success: true,
        response: {
          content: response.data.content[0].text,
          usage: response.data.usage,
          model: response.data.model
        }
      };

    } catch (error) {
      console.error('Claude API error:', error.response?.data || error.message);
      
      // Fallback response for API failures
      if (error.response?.status === 429) {
        return {
          success: false,
          error: 'Service temporarily unavailable due to high demand'
        };
      }

      return {
        success: false,
        error: 'Unable to generate response at this time'
      };
    }
  }

  buildSystemPrompt(userContext, validationResult) {
    const basePrompt = `You are a financial education assistant operating under strict FINRA and SEC compliance requirements. You must:

1. NEVER make specific investment recommendations
2. NEVER guarantee returns or claim investments are risk-free
3. Always emphasize that investments involve risk
4. Focus on general financial education
5. Encourage users to consult with qualified financial advisors
6. Stay within approved topic boundaries

User Type: ${userContext.type}
FINRA Registered: ${userContext.finraRegistered || false}
Approved Topics: General financial education, risk management, portfolio basics`;

    if (userContext.type === 'retail_investor') {
      return basePrompt + `

Additional Constraints for Retail Investors:
- Provide only educational information
- Emphasize the importance of professional advice
- Avoid complex investment strategies
- Focus on fundamental concepts`;
    }

    if (userContext.type === 'financial_advisor') {
      return basePrompt + `

Additional Context for Financial Advisors:
- You may discuss more advanced topics
- Include relevant regulatory considerations
- Emphasize fiduciary duty
- Reference appropriate compliance requirements`;
    }

    return basePrompt;
  }

  buildUserPrompt(message, userContext) {
    return `User Question: "${message.content}"

User Context:
- Type: ${userContext.type}
- Registration Status: ${userContext.finraRegistered ? 'Registered' : 'Not Registered'}

Please provide an educational response that is appropriate for this user type and compliant with financial regulations. Remember to include appropriate disclaimers and encourage professional consultation when appropriate.`;
  }

  // Fallback educational responses for when Claude API is unavailable
  getFallbackResponse(message, userContext) {
    const fallbacks = {
      portfolio: "A diversified portfolio typically includes different asset classes to help manage risk. The specific allocation should be based on your individual circumstances, risk tolerance, and investment timeline. Please consult with a qualified financial advisor for personalized guidance.",
      
      risk: "All investments carry some level of risk, including the potential loss of principal. Understanding and managing risk through diversification and appropriate asset allocation is fundamental to investing. A financial advisor can help assess your risk tolerance.",
      
      retirement: "Retirement planning involves considering multiple factors including your current age, target retirement age, expected expenses, and risk tolerance. Common retirement accounts include 401(k)s and IRAs, each with different rules and benefits. Professional guidance is recommended for retirement planning.",
      
      default: "I can provide general financial education on topics like portfolio basics, risk management, and investment fundamentals. For specific advice tailored to your situation, please consult with a qualified financial advisor. What aspect of financial education would you like to learn about?"
    };

    const key = Object.keys(fallbacks).find(k => 
      message.content.toLowerCase().includes(k)
    ) || 'default';

    return {
      success: true,
      response: {
        content: fallbacks[key],
        usage: { tokens: 0 },
        model: 'fallback'
      }
    };
  }
}

module.exports = ChatService;