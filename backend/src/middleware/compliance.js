class ComplianceMiddleware {
  static async validateMessage(message, user) {
    // Basic compliance check
    const prohibitedTerms = ['guaranteed profit', 'risk-free', 'sure thing'];
    
    const lowerMessage = message.toLowerCase();
    for (const term of prohibitedTerms) {
      if (lowerMessage.includes(term)) {
        return {
          approved: false,
          reason: `Message contains prohibited term: ${term}`,
          suggestions: ['Remove prohibited terminology', 'Use compliant language']
        };
      }
    }

    return {
      approved: true,
      reason: 'Message passed compliance check'
    };
  }
}

module.exports = ComplianceMiddleware;