// backend/src/services/ChatService.js
const axios = require('axios');

class ChatService {
  constructor(mcpOrchestrator) {
    this.mcpOrchestrator = mcpOrchestrator;
    this.claudeApiKey = process.env.CLAUDE_API_KEY;
    this.claudeApiUrl = 'https://api.anthropic.com/v1/messages';
  }

  async processMessage(message, userContext) {
    const processingId = `PROC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`📝 Processing message: ${processingId}`);

      // Step 1: MCP Pre-validation
      const validationResult = await this.mcpOrchestrator.validateMessage(message, userContext);
      
      if (!validationResult.approved) {
        console.log(`❌ Validation failed: ${validationResult.reason}`);
        return {
          success: false,
          error: validationResult.reason,
          suggestions: validationResult.suggestions,
          stage: 'validation'
        };
      }

      console.log('✅ MCP validation passed');

      // Step 2: Generate Claude response
      const claudeResponse = await this.generateClaudeResponse(message, userContext, validationResult);
      
      if (!claudeResponse.success) {
        console.log(`❌ Claude generation failed: ${claudeResponse.error}`);
        return {
          success: false,
          error: claudeResponse.error,
          stage: 'generation'
        };
      }

      console.log('✅ Claude response generated');

      // Step 3: MCP Post-validation (Response Audit)
      const auditResult = await this.mcpOrchestrator.auditResponse(
        claudeResponse.response,
        message,
        userContext,
        validationResult.validationResults
      );

      if (!auditResult.approved) {
        console.log(`❌ Response audit failed`);
        return {
          success: false,
          error: 'Response failed compliance audit',
          stage: 'audit'
        };
      }

      console.log('✅ Response audit passed');

      // Step 4: Finalize response with disclaimers
      const finalResponse = {
        content: claudeResponse.response.content,
        disclaimers: auditResult.disclaimers,
        complianceMetadata: auditResult.complianceMetadata,
        processingId
      };

      console.log(`✅ Message processed successfully: ${processingId}`);

      return {
        success: true,
        response: finalResponse,
        complianceMetadata: auditResult.complianceMetadata
      };

    } catch (error) {
      console.error('❌ Chat processing error:', error);
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
      const userPrompt = message.content || message;

      const requestBody = {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ],
        system: systemPrompt
      };

      console.log('🤖 Calling Claude API...');

      const response = await axios.post(this.claudeApiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
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
      console.error('❌ Claude API error:', error.response?.data || error.message);
      
      // Return fallback response if Claude fails
      return this.getFallbackResponse(message, userContext);
    }
  }

  buildSystemPrompt(userContext, validationResult) {
    return `You are a financial education assistant operating under strict FINRA and SEC compliance requirements. You must:

1. NEVER make specific investment recommendations
2. NEVER guarantee returns or claim investments are risk-free
3. Always emphasize that investments involve risk
4. Focus on general financial education
5. Encourage users to consult with qualified financial advisors
6. Stay within approved topic boundaries

User Type: ${userContext.type}
FINRA Registered: ${userContext.finraRegistered}
SEC Registered: ${userContext.secRegistered}

Provide educational, compliant responses about financial topics. Keep responses informative but general, avoiding specific investment advice.`;
  }

  getFallbackResponse(message, userContext) {
    const fallbacks = {
      portfolio: "A diversified portfolio typically includes different asset classes to help manage risk. The specific allocation should be based on your individual circumstances, risk tolerance, and investment timeline. Please consult with a qualified financial advisor for personalized guidance.",
      
      risk: "All investments carry some level of risk, including the potential loss of principal. Understanding and managing risk through diversification and appropriate asset allocation is fundamental to investing.",
      
      retirement: "Retirement planning involves considering multiple factors including your current age, target retirement age, expected expenses, and risk tolerance. Professional guidance is recommended for retirement planning.",
      
      default: "I can provide general financial education on topics like portfolio basics, risk management, and investment fundamentals. For specific advice tailored to your situation, please consult with a qualified financial advisor."
    };

    const messageText = typeof message === 'string' ? message : message.content || '';
    const key = Object.keys(fallbacks).find(k => 
      messageText.toLowerCase().includes(k)
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