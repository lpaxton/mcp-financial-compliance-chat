// mcp-servers/sec-compliance-mcp/index.js
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

class SECComplianceServer {
  constructor() {
    this.server = new Server(
      {
        name: 'sec-compliance-mcp',
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

    // SEC Investment Advisers Act compliance rules
    this.investmentAdviceKeywords = [
      'buy', 'sell', 'purchase', 'invest in', 'recommend', 'suggest',
      'should invest', 'ought to buy', 'consider buying', 'time to sell',
      'good investment', 'bad investment', 'overvalued', 'undervalued',
      'price target', 'rating', 'upgrade', 'downgrade'
    ];

    // Fiduciary duty triggers
    this.fiduciaryTriggers = [
      'best for you', 'in your interest', 'suitable for you',
      'right choice', 'perfect investment', 'ideal allocation',
      'what you should do', 'my recommendation'
    ];

    // Material information keywords (Reg FD)
    this.materialInfoKeywords = [
      'earnings', 'guidance', 'merger', 'acquisition', 'bankruptcy',
      'regulatory action', 'lawsuit', 'management change', 'dividend',
      'stock split', 'restructuring', 'insider trading'
    ];

    // Required SEC disclosures by context
    this.secDisclosures = {
      investment_advice: [
        'Investment advice is provided by SEC-registered investment adviser.',
        'Past performance does not guarantee future results.',
        'All investments involve risk of loss, including loss of principal.'
      ],
      
      fiduciary_duty: [
        'As a fiduciary, we are required to act in your best interest.',
        'We have a duty to provide suitable investment advice based on your circumstances.',
        'Any conflicts of interest will be disclosed in writing.'
      ],
      
      performance_claims: [
        'Performance results are hypothetical and do not represent actual trading.',
        'Individual results may vary significantly from presented performance.',
        'Past performance is not indicative of future results.'
      ],
      
      fee_disclosure: [
        'Advisory fees and compensation arrangements are detailed in Form ADV.',
        'Additional fees and expenses may apply to recommended investments.',
        'Fee structures may create conflicts of interest.'
      ],
      
      reg_fd_material: [
        'This information may constitute material non-public information.',
        'Trading on material non-public information is prohibited.',
        'Information sharing is subject to Regulation FD requirements.'
      ]
    };

    // SEC rules and violations
    this.secRules = {
      advisers_act: {
        rule: 'Investment Advisers Act Section 206',
        description: 'Prohibits fraudulent, deceptive, or manipulative conduct',
        violations: ['false statements', 'omitted material facts', 'unsuitable advice']
      },
      
      fiduciary_standard: {
        rule: 'Investment Advisers Act Section 206(1) & (2)',
        description: 'Fiduciary duty to act in client\'s best interest',
        violations: ['conflicts not disclosed', 'unsuitable recommendations', 'self-dealing']
      },
      
      advertising_rule: {
        rule: 'SEC Rule 206(4)-1',
        description: 'Investment adviser advertising regulations',
        violations: ['false performance claims', 'testimonials', 'guaranteed returns']
      },
      
      reg_fd: {
        rule: 'Regulation FD',
        description: 'Fair Disclosure of material information',
        violations: ['selective disclosure', 'material non-public info', 'insider information']
      }
    };
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'validate_investment_advice',
          description: 'Validates content against SEC Investment Advisers Act requirements',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Content to validate for SEC compliance'
              },
              advisorRegistration: {
                type: 'object',
                properties: {
                  valid: { type: 'boolean' },
                  crd_number: { type: 'string' },
                  registration_type: { type: 'string' }
                },
                description: 'SEC registration status of advisor'
              },
              fiduciaryContext: {
                type: 'boolean',
                description: 'Whether fiduciary duty applies to this interaction'
              }
            },
            required: ['content']
          }
        },
        {
          name: 'check_disclosure_requirements',
          description: 'Determines required SEC disclosures for content',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Content to analyze for disclosure requirements'
              },
              advisorType: {
                type: 'string',
                enum: ['registered_ia', 'exempt_advisor', 'broker_dealer', 'none'],
                description: 'Type of advisor providing content'
              }
            },
            required: ['content']
          }
        },
        {
          name: 'monitor_fiduciary_duty',
          description: 'Monitors compliance with SEC fiduciary duty standards',
          inputSchema: {
            type: 'object',
            properties: {
              advice: {
                type: 'string',
                description: 'Investment advice content'
              },
              clientProfile: {
                type: 'object',
                description: 'Client profile and circumstances'
              },
              advisorContext: {
                type: 'object',
                description: 'Advisor registration and conflicts'
              }
            },
            required: ['advice']
          }
        },
        {
          name: 'enforce_reg_fd',
          description: 'Validates compliance with SEC Regulation FD (Fair Disclosure)',
          inputSchema: {
            type: 'object',
            properties: {
              information: {
                type: 'string',
                description: 'Information content to check for Reg FD compliance'
              },
              audience: {
                type: 'string',
                enum: ['public', 'selective', 'private'],
                description: 'Intended audience for the information'
              },
              sourceType: {
                type: 'string',
                enum: ['issuer', 'insider', 'analyst', 'advisor'],
                description: 'Source of the information'
              }
            },
            required: ['information', 'audience']
          }
        },
        {
          name: 'validate_advertisements',
          description: 'Validates content against SEC advertising rules (Rule 206(4)-1)',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Advertisement content to validate'
              },
              contentType: {
                type: 'string',
                enum: ['performance_claim', 'testimonial', 'general_ad', 'social_media'],
                description: 'Type of advertising content'
              },
              targetAudience: {
                type: 'string',
                enum: ['retail', 'institutional', 'qualified_investors'],
                description: 'Target audience for advertisement'
              }
            },
            required: ['content', 'contentType']
          }
        },
        {
          name: 'audit_response',
          description: 'Comprehensive SEC compliance audit of AI response',
          inputSchema: {
            type: 'object',
            properties: {
              response: {
                type: 'string',
                description: 'AI response content to audit'
              },
              originalMessage: {
                type: 'string',
                description: 'Original user message'
              },
              userContext: {
                type: 'object',
                description: 'User context and registration status'
              },
              preValidationResults: {
                type: 'object',
                description: 'Results from pre-validation checks'
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
        case 'validate_investment_advice':
          return this.validateInvestmentAdvice(request.params.arguments);
        case 'check_disclosure_requirements':
          return this.checkDisclosureRequirements(request.params.arguments);
        case 'monitor_fiduciary_duty':
          return this.monitorFiduciaryDuty(request.params.arguments);
        case 'enforce_reg_fd':
          return this.enforceRegFD(request.params.arguments);
        case 'validate_advertisements':
          return this.validateAdvertisements(request.params.arguments);
        case 'audit_response':
          return this.auditResponse(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  async validateInvestmentAdvice(args) {
    const { content, advisorRegistration, fiduciaryContext = false } = args;

    try {
      const violations = [];
      const warnings = [];
      const requirements = [];
      const lowerContent = content.toLowerCase();

      // Check if content contains investment advice
      const containsAdvice = this.investmentAdviceKeywords.some(keyword =>
        lowerContent.includes(keyword.toLowerCase())
      );

      if (containsAdvice) {
        // Check advisor registration
        if (!advisorRegistration?.valid) {
          violations.push({
            rule: 'Investment Advisers Act Section 203',
            violation: 'Providing investment advice without SEC registration',
            severity: 'high',
            description: 'Investment advice can only be provided by registered investment advisers'
          });
        }

        requirements.push('investment_advice_disclosure');
        requirements.push('registration_disclosure');
      }

      // Check for fiduciary duty violations
      const hasFiduciaryLanguage = this.fiduciaryTriggers.some(trigger =>
        lowerContent.includes(trigger.toLowerCase())
      );

      if (hasFiduciaryLanguage && fiduciaryContext) {
        requirements.push('fiduciary_duty_disclosure');
      }

      // Check for prohibited guarantee language
      const guaranteePattern = /guarantee|assured|certain|promise|risk.?free/gi;
      if (guaranteePattern.test(content)) {
        violations.push({
          rule: 'Investment Advisers Act Section 206(4)',
          violation: 'Prohibited guarantee or assurance claims',
          severity: 'high',
          description: 'Investment advisers cannot guarantee returns or claim investments are risk-free'
        });
      }

      // Check for performance claims without proper disclosure
      const performancePattern = /return|performance|profit|gain|\d+%/gi;
      if (performancePattern.test(content)) {
        requirements.push('performance_disclosure');
        warnings.push({
          rule: 'SEC Rule 206(4)-1',
          warning: 'Performance claims require specific disclosures',
          recommendation: 'Include performance disclaimers and substantiation'
        });
      }

      const compliant = violations.length === 0;
      const disclaimers = this.getRequiredDisclosures(requirements);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            compliant,
            violations,
            warnings,
            requirements,
            disclaimers,
            containsInvestmentAdvice: containsAdvice,
            requiresRegistration: containsAdvice && !advisorRegistration?.valid,
            fiduciaryDutyApplies: hasFiduciaryLanguage && fiduciaryContext,
            auditTimestamp: new Date().toISOString()
          })
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            compliant: false,
            error: `SEC validation error: ${error.message}`,
            violations: [{
              rule: 'System Error',
              violation: 'Unable to complete SEC compliance validation',
              severity: 'high'
            }]
          })
        }]
      };
    }
  }

  async checkDisclosureRequirements(args) {
    const { content, advisorType = 'none' } = args;
    
    const requirements = [];
    const lowerContent = content.toLowerCase();

    // Investment advice disclosure
    if (this.investmentAdviceKeywords.some(keyword => lowerContent.includes(keyword))) {
      requirements.push('investment_advice');
      
      if (advisorType === 'registered_ia') {
        requirements.push('form_adv_disclosure');
      }
    }

    // Performance disclosure
    if (lowerContent.includes('performance') || lowerContent.includes('return') || /\d+%/.test(content)) {
      requirements.push('performance_claims');
    }

    // Fee disclosure
    if (lowerContent.includes('fee') || lowerContent.includes('cost') || lowerContent.includes('charge')) {
      requirements.push('fee_disclosure');
    }

    // Fiduciary disclosure
    if (this.fiduciaryTriggers.some(trigger => lowerContent.includes(trigger))) {
      requirements.push('fiduciary_duty');
    }

    const disclosures = this.getRequiredDisclosures(requirements);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          requirements,
          disclosures,
          advisorType,
          analysisTimestamp: new Date().toISOString()
        })
      }]
    };
  }

  async monitorFiduciaryDuty(args) {
    const { advice, clientProfile = {}, advisorContext = {} } = args;

    const fiduciaryViolations = [];
    const fiduciaryWarnings = [];
    const lowerAdvice = advice.toLowerCase();

    // Check for suitability consideration
    const suitabilityKeywords = ['suitable', 'appropriate', 'right for you', 'fits your'];
    const mentionsSuitability = suitabilityKeywords.some(keyword => 
      lowerAdvice.includes(keyword)
    );

    if (!mentionsSuitability && this.investmentAdviceKeywords.some(keyword => lowerAdvice.includes(keyword))) {
      fiduciaryWarnings.push({
        rule: 'Investment Advisers Act Section 206(1)',
        warning: 'Investment advice should include suitability consideration',
        recommendation: 'Consider client circumstances and suitability'
      });
    }

    // Check for conflict of interest disclosure
    if (advisorContext.hasConflicts && !lowerAdvice.includes('conflict')) {
      fiduciaryViolations.push({
        rule: 'Investment Advisers Act Section 206(2)',
        violation: 'Material conflicts of interest not disclosed',
        severity: 'high',
        description: 'Advisers must disclose material conflicts of interest'
      });
    }

    // Check for self-dealing
    const selfDealingPattern = /our product|we offer|our fund|our service/gi;
    if (selfDealingPattern.test(advice) && !lowerAdvice.includes('conflict')) {
      fiduciaryViolations.push({
        rule: 'Investment Advisers Act Section 206(3)',
        violation: 'Potential self-dealing without proper disclosure',
        severity: 'medium',
        description: 'Recommendations of proprietary products require conflict disclosure'
      });
    }

    const fiduciaryCompliant = fiduciaryViolations.length === 0;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          fiduciaryCompliant,
          violations: fiduciaryViolations,
          warnings: fiduciaryWarnings,
          suitabilityConsidered: mentionsSuitability,
          conflictsDisclosed: lowerAdvice.includes('conflict'),
          recommendedActions: fiduciaryCompliant ? [] : [
            'Disclose material conflicts of interest',
            'Consider client suitability factors',
            'Document best interest analysis'
          ]
        })
      }]
    };
  }

  async enforceRegFD(args) {
    const { information, audience, sourceType } = args;

    const regFDViolations = [];
    const regFDWarnings = [];
    const lowerInfo = information.toLowerCase();

    // Check for material information
    const containsMaterialInfo = this.materialInfoKeywords.some(keyword =>
      lowerInfo.includes(keyword.toLowerCase())
    );

    if (containsMaterialInfo) {
      if (audience === 'selective' && sourceType === 'issuer') {
        regFDViolations.push({
          rule: 'Regulation FD Section 100.1',
          violation: 'Selective disclosure of material information',
          severity: 'high',
          description: 'Material information must be disclosed publicly, not selectively'
        });
      }

      if (sourceType === 'insider' && audience !== 'public') {
        regFDWarnings.push({
          rule: 'Regulation FD Section 100.2',
          warning: 'Potential insider information sharing',
          recommendation: 'Ensure information is publicly available before sharing'
        });
      }
    }

    const regFDCompliant = regFDViolations.length === 0;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          regFDCompliant,
          violations: regFDViolations,
          warnings: regFDWarnings,
          containsMaterialInfo,
          audience,
          sourceType,
          recommendedActions: regFDCompliant ? [] : [
            'Make public disclosure before selective communication',
            'Verify information is already public',
            'Consider timing restrictions'
          ]
        })
      }]
    };
  }

  async validateAdvertisements(args) {
    const { content, contentType, targetAudience = 'retail' } = args;

    const adViolations = [];
    const adWarnings = [];
    const lowerContent = content.toLowerCase();

    // Check for prohibited content based on Rule 206(4)-1
    switch (contentType) {
      case 'performance_claim':
        if (!lowerContent.includes('past performance') || !lowerContent.includes('future results')) {
          adViolations.push({
            rule: 'SEC Rule 206(4)-1(a)(5)',
            violation: 'Performance claims lack required disclaimers',
            severity: 'high',
            description: 'Performance advertisements must include specific disclaimers'
          });
        }
        break;

      case 'testimonial':
        adViolations.push({
          rule: 'SEC Rule 206(4)-1(b)(1)',
          violation: 'Testimonials prohibited in investment adviser advertisements',
          severity: 'high',
          description: 'Investment advisers cannot use client testimonials in advertisements'
        });
        break;

      case 'social_media':
        if (lowerContent.includes('guarantee') || lowerContent.includes('risk-free')) {
          adViolations.push({
            rule: 'SEC Rule 206(4)-1(a)(1)',
            violation: 'False or misleading statements in social media',
            severity: 'high',
            description: 'Social media posts cannot contain false or misleading statements'
          });
        }
        break;
    }

    // General advertising violations
    const prohibitedClaims = ['best', 'top', '#1', 'guaranteed', 'risk-free', 'certain'];
    const hasProhibitedClaims = prohibitedClaims.some(claim => 
      lowerContent.includes(claim)
    );

    if (hasProhibitedClaims) {
      adWarnings.push({
        rule: 'SEC Rule 206(4)-1(a)(1)',
        warning: 'Potentially misleading claims detected',
        recommendation: 'Avoid superlative claims and guarantees'
      });
    }

    const advertisingCompliant = adViolations.length === 0;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          advertisingCompliant,
          violations: adViolations,
          warnings: adWarnings,
          contentType,
          targetAudience,
          requiredDisclosures: contentType === 'performance_claim' ? 
            this.secDisclosures.performance_claims : [],
          recommendedActions: advertisingCompliant ? [] : [
            'Add required performance disclaimers',
            'Remove prohibited testimonials',
            'Substantiate any claims made'
          ]
        })
      }]
    };
  }

  async auditResponse(args) {
    const { response, originalMessage, userContext, preValidationResults } = args;

    try {
      const auditResults = {
        compliant: true,
        violations: [],
        disclaimers: [],
        modifications: []
      };

      // Comprehensive SEC compliance audit
      const adviceValidation = await this.validateInvestmentAdvice({
        content: response,
        advisorRegistration: userContext.secRegistration,
        fiduciaryContext: userContext.type === 'financial_advisor'
      });

      const adviceData = JSON.parse(adviceValidation.content[0].text);

      if (!adviceData.compliant) {
        auditResults.compliant = false;
        auditResults.violations.push(...adviceData.violations);
      }

      // Check disclosure requirements
      const disclosureCheck = await this.checkDisclosureRequirements({
        content: response,
        advisorType: userContext.secRegistered ? 'registered_ia' : 'none'
      });

      const disclosureData = JSON.parse(disclosureCheck.content[0].text);
      auditResults.disclaimers = disclosureData.disclaimers || [];

      // Fiduciary duty check for advisors
      if (userContext.type === 'financial_advisor') {
        const fiduciaryCheck = await this.monitorFiduciaryDuty({
          advice: response,
          clientProfile: userContext.clientProfile || {},
          advisorContext: userContext
        });

        const fiduciaryData = JSON.parse(fiduciaryCheck.content[0].text);
        
        if (!fiduciaryData.fiduciaryCompliant) {
          auditResults.compliant = false;
          auditResults.violations.push(...fiduciaryData.violations);
        }
      }

      // Determine required modifications
      if (auditResults.violations.length > 0) {
        auditResults.modifications.push('Remove prohibited investment advice');
        auditResults.modifications.push('Add required SEC disclosures');
        
        if (userContext.type === 'financial_advisor') {
          auditResults.modifications.push('Include fiduciary duty disclosures');
        }
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
            error: `SEC response audit failed: ${error.message}`,
            disclaimers: this.secDisclosures.investment_advice
          })
        }]
      };
    }
  }

  getRequiredDisclosures(requirements) {
    const disclosures = [];
    
    requirements.forEach(req => {
      if (this.secDisclosures[req]) {
        disclosures.push(...this.secDisclosures[req]);
      }
    });
    
    // Remove duplicates
    return [...new Set(disclosures)];
  }
}

// Start the server
const server = new SECComplianceServer();
const transport = new StdioServerTransport();

server.server.connect(transport).catch(console.error);

console.error('SEC Compliance MCP Server running...');