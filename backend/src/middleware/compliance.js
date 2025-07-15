const ComplianceMiddleware = {
  validateMessage: async (message, user) => {
    try {
      // Check if message is a string or an object with content property
      const messageText = typeof message === 'string' 
        ? message 
        : (message?.content || message?.message || '');
      
      // Convert to lowercase for case-insensitive checks
      const lowercaseMessage = String(messageText).toLowerCase();
      
      // Simple profanity check
      const forbiddenTerms = [
        'insider trading', 'pump and dump', 'market manipulation', 
        'illegal', 'guaranteed return', 'risk-free investment'
      ];
      
      for (const term of forbiddenTerms) {
        if (lowercaseMessage.includes(term)) {
          return {
            approved: false,
            reason: `Message contains prohibited term: "${term}"`,
            suggestions: ['Please avoid discussing illegal activities or making guarantees about investments.']
          };
        }
      }
      
      // Check message length
      if (messageText.length > 1000) {
        return {
          approved: false,
          reason: 'Message exceeds maximum length',
          suggestions: ['Please limit your message to 1000 characters.']
        };
      }
      
      return { approved: true };
    } catch (error) {
      console.error('Compliance validation error:', error);
      return { 
        approved: false, 
        reason: 'Error during compliance check',
        suggestions: ['Please try again with a different message.']
      };
    }
  }
};

module.exports = ComplianceMiddleware;