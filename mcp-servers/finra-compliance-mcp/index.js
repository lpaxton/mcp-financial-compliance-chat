// mcp-servers/finra-compliance-mcp/index.js
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

class FINRAComplianceServer {
  constructor() {
    this.server = new Server(
      {
        name: 'finra-compliance-mcp',
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

    // FINRA Rule 2210 Communication Standards
    this.communicationRules = {
      prohibitedClaims: [
        'guaranteed returns',
        'risk-free investment',
        'sure thing',
        'can\'t lose',
        'guaranteed profit',
        'no risk',
        'certain returns',
        'promise',
        'assure',
        'will definitely'
      ],
      
      requiresDisclaimer: [
        'invest',
        'recommendation',
        'advice',
        'suggest',
        'should buy',
        'should sell',
        'opportunity',
        'performance',
        'returns'
      ],

      suitabilityKeywords: [
        'suitable',
        'appropriate',
        'right for you',
        'matches your',
        'fits your profile',
        'recommended for your'
      ],

      supervisionTriggers: [
        'specific stock recommendation',
        'timing advice',
        'individual security advice',
        'investment strategy recommendation'
      ]
    };

    // Required disclaimers by context
    this.disclaimers = {
      investment_advice: [
        'Past performance does not guarantee future results.',
        'All investments involve risk, including potential loss of principal.',
        'This information is for educational purposes only and should not be considered personalized investment advice.'
      ],
      
      performance_data: [
        'Past performance is not indicative of future results.',
        'Investment returns and principal value will fluctuate.'
      ],
      
      suitability: [
        'Suitability determinations require consideration of individual circumstances.',
        'Consult with a qualified financial advisor regarding your specific situation.'
      ],
      
      general: [
        'Securities offered through FINRA member firm.',
        'This communication has not been approved by any regulatory authority.'
      ]
    };
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'audit_communication',
          description: 'Audits communication content against FINRA Rule 2210 standards',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The communication content to audit'
              },
              userProfile: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  finraRegistered: { type: 'boolean' },
                  permissions: { type: 'array', items: { type: 'string' } }
                },
                description: 'User profile information'
              },
              communicationType: {
                type: 'string',
                enum: ['chat', 'email', 'public', 'retail', 'institutional'],
                description: 'Type of communication'
              }
            },
            required: ['content', 'userProfile', 'communicationType']
          }
        },
        {
          name: 'check_suitability',
          description: 'Validates suitability requirements for investment advice',
          inputSchema: {
            type: 'object',
            properties: {
              advice: {
                type: 'string',
                description: 'Investment advice content'
              },
              clientProfile: {
                type: 'object',
                description: 'Client profile for suitability assessment'
              }
            },
            required: ['advice', 'clientProfile']
          }
        },
        {
          name: 'flag_violations',
          description: 'Identifies potential FINRA rule violations',
          inputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'Response content to check for violations'
              },
              context: {
                type: 'object',
                description: 'Context of the communication'
              }
            },
            required: ['response']
          }
        },
        {
          name: 'require_disclaimers',
          description: 'Determines required disclaimers for content',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Content to analyze for disclaimer requirements'
              },
              type: {
                type: 'string',
                description: 'Type of content (advice, performance, etc.)'
              }
            },
            required: ['content']
          }
        },
        {
          name: 'log_supervision',
          description: 'Logs interaction for supervisory review',
          inputSchema: {
            type: 'object',
            properties: {
              interaction: {
                type: 'object',
                description: 'Interaction details for supervision logging'
              }
            },
            required: ['interaction']
          }
        },
        {
          name: 'audit_response',
          description: 'Audits AI response for FINRA compliance before delivery',
          inputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'AI response content'
              },
              originalMessage: {
                type: 'string',
                description: 'Original user message'
              },
              userContext: {
                type: 'object',
                description: 'User context and profile'
              },
              preValidationResults: {
                type: 'object',
                description: 'Results from pre-validation'
              }
            },
            required: ['response', 'originalMessage', 'userContext']
          }
        }
      ]
    }));
  }

  setupRequestHandlers() {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'audit_communication':
          return this.auditCommunication(request.params.arguments);
        case 'check_suitability':
          return this.checkSuitability(request.params.arguments);
        case 'flag_violations':
          return this.flagViolations(request.params.arguments);
        case 'require_disclaimers':
          return this.requireDisclaimers(request.params.arguments);
        case 'log_supervision':
          return this.logSupervision(request.params.arguments);
        case 'audit_response':
          return this.auditResponse(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  async auditCommunication(args) {
    const { content, userProfile, communicationType } = args;
    
    try {
      const violations = [];
      const warnings = [];
      const requirements = [];
      
      // Check for prohibited claims (Rule 2210)
      const prohibitedFound = this.communicationRules.prohibitedClaims.filter(claim => 
        content.toLowerCase().includes(claim.toLowerCase())
      );
      
      if (prohibitedFound.length > 0) {
        violations.push({
          rule: 'FINRA Rule 2210(d)(1)(A)',
          violation: 'Prohibited claims detected',
          details: prohibitedFound,
          severity: 'high'
        });
      }

      // Check for disclaimer requirements
      const disclaimerTriggers = this.communicationRules.requiresDisclaimer.filter(trigger => 
        content.toLowerCase().includes(trigger.toLowerCase())
      );
      
      if (disclaimerTriggers.length > 0) {
        requirements.push('investment_disclaimer');
      }

      // Check suitability requirements
      const suitabilityMentioned = this.communicationRules.suitabilityKeywords.some(keyword => 
        content.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (suitabilityMentioned && userProfile.type === 'retail_investor') {
        requirements.push('suitability_disclaimer');
        warnings.push({
          rule: 'FINRA Rule 2111',
          warning: 'Suitability assessment may be required',
          recommendation: 'Include suitability disclaimer'
        });
      }

      // Check supervision requirements
      const supervisionNeeded = this.communicationRules.supervisionTriggers.some(trigger => 
        content.toLowerCase().includes(trigger.toLowerCase())
      );
      
      if (supervisionNeeded && !userProfile.finraRegistered) {
        violations.push({
          rule: 'FINRA Rule 3110',
          violation: 'Supervisory approval required for this content',
          severity: 'medium'
        });
      }

      // Determine compliance status
      const compliant = violations.length === 0;
      
      // Get required disclaimers
      const disclaimers = this.getRequiredDisclaimers(requirements, content);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            compliant,
            violations,
            warnings,
            requirements,
            disclaimers,
            auditTimestamp: new Date().toISOString(),
            rule2210Compliant: prohibitedFound.length === 0,
            supervisionRequired: supervisionNeeded && !userProfile.finraRegistered
          })
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            compliant: false,
            error: `FINRA audit error: ${error.message}`,
            violations: [{
              rule: 'System Error',
              violation: 'Unable to complete compliance audit',
              severity: 'high'
            }]
          })
        }]
      };
    }
  }

  async checkSuitability(args) {
    const { advice, clientProfile } = args;
    
    // Simplified suitability check - in production this would be more comprehensive
    const suitabilityFactors = {
      hasInvestmentExperience: clientProfile.investmentExperience || false,
      hasRiskTolerance: clientProfile.riskTolerance || 'unknown',
      hasInvestmentObjectives: clientProfile.investmentObjectives || false,
      hasFinancialSituation: clientProfile.financialSituation || false
    };
    
    const missingFactors = Object.entries(suitabilityFactors)
      .filter(([key, value]) => !value || value === 'unknown')
      .map(([key]) => key);
    
    const suitable = missingFactors.length === 0;
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          suitable,
          missingFactors,
          rule: 'FINRA Rule 2111',
          recommendation: suitable ? 
            'Suitability factors appear adequate' : 
            'Additional client information required for suitability determination',
          requiredActions: suitable ? [] : [
            'Gather complete client profile',
            'Document suitability analysis',
            'Obtain supervisory approval if needed'
          ]
        })
      }]
    };
  }

  async flagViolations(args) {
    const { response, context = {} } = args;
    
    const violations = [];
    const content = response.toLowerCase();
    
    // Check for specific FINRA violations
    const violationChecks = [
      {
        pattern: /guarantee|assured|certain|promise/gi,
        rule: 'FINRA Rule 2210(d)(1)(A)',
        description: 'Prohibited guarantee claims'
      },
      {
        pattern: /risk.?free|no.?risk|safe.?investment/gi,
        rule: 'FINRA Rule 2210(d)(1)(A)', 
        description: 'Misleading risk statements'
      },
      {
        pattern: /hot.?tip|insider|sure.?thing/gi,
        rule: 'FINRA Rule 2210(d)(1)(B)',
        description: 'Inappropriate investment recommendations'
      }
    ];
    
    violationChecks.forEach(check => {
      if (check.pattern.test(response)) {
        violations.push({
          rule: check.rule,
          description: check.description,
          severity: 'high',
          action: 'Content must be revised before delivery'
        });
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          violations,
          compliant: violations.length === 0,
          auditTimestamp: new Date().toISOString()
        })
      }]
    };
  }

  async requireDisclaimers(args) {
    const { content, type } = args;
    
    const requiredDisclaimers = this.getRequiredDisclaimers(
      this.analyzeContentForDisclaimers(content), 
      content
    );
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          disclaimers: requiredDisclaimers,
          type: type || 'general',
          contentAnalysis: this.analyzeContentForDisclaimers(content)
        })
      }]
    };
  }

  async logSupervision(args) {
    const { interaction } = args;
    
    // In production, this would log to a compliance database
    const supervisionLog = {
      logId: `SUP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      interaction,
      status: 'logged',
      reviewRequired: interaction.supervisionRequired || false
    };
    
    console.log('SUPERVISION LOG:', JSON.stringify(supervisionLog, null, 2));
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          logged: true,
          logId: supervisionLog.logId,
          reviewRequired: supervisionLog.reviewRequired
        })
      }]
    };
  }

  async auditResponse(args) {
    const { response, originalMessage, userContext, preValidationResults } = args;
    
    try {
      // Comprehensive response audit
      const auditResults = {
        compliant: true,
        violations: [],
        disclaimers: [],
        modifications: []
      };

      // Check response content for FINRA compliance
      const responseAudit = await this.auditCommunication({
        content: response,
        userProfile: userContext,
        communicationType: 'chat'
      });

      const responseData = JSON.parse(responseAudit.content[0].text);
      
      if (!responseData.compliant) {
        auditResults.compliant = false;
        auditResults.violations.push(...responseData.violations);
      }

      // Add required disclaimers
      auditResults.disclaimers = responseData.disclaimers || [];

      // Check if response needs modification
      if (auditResults.violations.length > 0) {
        auditResults.modifications.push('Remove prohibited claims');
        auditResults.modifications.push('Add compliance disclaimers');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(auditResults)
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            compliant: false,
            error: `Response audit failed: ${error.message}`,
            disclaimers: this.disclaimers.general
          })
        }]
      };
    }
  }

  analyzeContentForDisclaimers(content) {
    const requirements = [];
    const lowerContent = content.toLowerCase();
    
    if (this.communicationRules.requiresDisclaimer.some(trigger => 
        lowerContent.includes(trigger.toLowerCase()))) {
      requirements.push('investment_advice');
    }
    
    if (lowerContent.includes('performance') || lowerContent.includes('return')) {
      requirements.push('performance_data');
    }
    
    if (this.communicationRules.suitabilityKeywords.some(keyword => 
        lowerContent.includes(keyword.toLowerCase()))) {
      requirements.push('suitability');
    }
    
    return requirements;
  }

  getRequiredDisclaimers(requirements, content) {
    const disclaimers = [];
    
    requirements.forEach(req => {
      if (this.disclaimers[req]) {
        disclaimers.push(...this.disclaimers[req]);
      }
    });
    
    // Always include general disclaimers for financial content
    if (content.toLowerCase().match(/invest|financial|money|portfolio/)) {
      disclaimers.push(...this.disclaimers.general);
    }
    
    // Remove duplicates
    return [...new Set(disclaimers)];
  }
}

// Start the server
const server = new FINRAComplianceServer();
const transport = new StdioServerTransport();

server.server.connect(transport).catch(console.error);

console.error('FINRA Compliance MCP Server running...');