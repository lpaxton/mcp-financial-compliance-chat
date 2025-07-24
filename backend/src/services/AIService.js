const axios = require('axios');
const AuditService = require('./AuditService');
const WebAccessService = require('./WebAccessService');

class AIService {
  constructor() {
    this.auditService = new AuditService();
    this.webAccessService = new WebAccessService();
  }

  async processMessage(message, userId, userType) {
    try {
      await this.auditService.logEvent('message_received', 'user_message', {
        userId,
        userType,
        message,
        timestamp: new Date().toISOString()
      });

      console.log(`Processing message: "${message}" for user ${userId} (${userType})`);

      // Check if this is a comparison query
      const isComparison = /compare|vs|versus|difference between/i.test(message);
      
      // Check for stock symbols in the query
      const stockSymbols = this.extractStockSymbols(message);
      console.log(`Extracted stock symbols: ${stockSymbols.join(', ')}`);
      
      let stockData = {};
      let webAccessUsed = false;
      let webAccessSources = [];
      
      // Fetch stock data if we have symbols
      if (stockSymbols.length > 0) {
        try {
          const promises = stockSymbols.map(symbol => 
            this.webAccessService.getStockData(symbol)
          );
          
          const results = await Promise.all(promises);
          
          results.forEach((result, index) => {
            if (result.success) {
              stockData[stockSymbols[index]] = result.data;
              webAccessUsed = true;
              if (result.data.source && !webAccessSources.includes(result.data.source)) {
                webAccessSources.push(result.data.source);
              }
            } else {
              console.log(`Failed to get stock data for ${stockSymbols[index]}: ${result.error}`);
            }
          });
          
        } catch (error) {
          console.error(`Error getting stock data: ${error.message}`);
        }
      }
      
      // Generate a response based on the message type and data
      let responseMessage;
      let disclaimers = [
        "This information is for educational purposes only and not financial advice.",
        "Past performance is not indicative of future results."
      ];

      // Handle comparison queries specifically
      if (isComparison && Object.keys(stockData).length >= 2) {
        responseMessage = this.generateComparisonResponse(stockData, stockSymbols);
      }
      // Handle single stock price queries
      else if (Object.keys(stockData).length === 1) {
        const symbol = Object.keys(stockData)[0];
        const data = stockData[symbol];
        responseMessage = this.generateSingleStockResponse(symbol, data);
      }
      // Fallback for other queries or when data isn't available
      else {
        responseMessage = this.generateFallbackResponse(message, stockSymbols);
      }
      
      // Log the response
      await this.auditService.logEvent('message_sent', 'ai_response', {
        userId,
        userType,
        response: responseMessage,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        message: responseMessage,
        disclaimers,
        webAccess: {
          accessed: webAccessUsed,
          sources: webAccessSources
        }
      };
    } catch (error) {
      console.error('Error in AI service:', error);
      await this.auditService.logEvent('error', 'ai_service', {
        userId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: `This is a fallback response to your question about "${message}" since the AI service is not available. In production, you would receive an AI-generated answer about your financial question.`,
        error: error.message,
        disclaimers: ["This information is for educational purposes only and not financial advice."]
      };
    }
  }

  extractStockSymbols(message) {
    console.log(`Extracting stock symbols from: "${message}"`);
    
    // For explicit comparisons, try harder to find symbols
    const isComparison = /compare|vs|versus|difference between/i.test(message);
    
    // Direct symbol pattern match - case insensitive search
    const symbolPattern = /\b(SPY|VOO|VTI|QQQ|AAPL|MSFT|GOOGL|GOOG|AMZN|META|TSLA|NVDA|BRK\.B|BRK\.A|JPM|JNJ|V|PG|DIS|NFLX)\b/gi;
    
    let matches = [];
    let match;
    
    // Use a loop to find all matches
    while ((match = symbolPattern.exec(message)) !== null) {
      console.log(`Found symbol match: ${match[1]}`);
      matches.push(match[1].toUpperCase());
    }
    
    // If we found explicit symbols, return them (with duplicates removed)
    if (matches.length > 0) {
      const uniqueSymbols = [...new Set(matches)];
      console.log(`Extracted unique symbols: ${uniqueSymbols.join(', ')}`);
      return uniqueSymbols;
    }
    
    // Special case for SPY vs VOO comparison which is a common question
    if (isComparison && 
        (message.toLowerCase().includes('spy') || message.toLowerCase().includes('s&p')) && 
        (message.toLowerCase().includes('voo') || message.toLowerCase().includes('vanguard'))) {
      console.log('Special case: SPY vs VOO comparison detected');
      return ['SPY', 'VOO'];
    }
    
    // Check for company names if no explicit symbols found
    const companyMap = {
      'apple': 'AAPL',
      'microsoft': 'MSFT',
      'google': 'GOOGL',
      'alphabet': 'GOOGL',
      'amazon': 'AMZN',
      'meta': 'META',
      'facebook': 'META',
      'tesla': 'TSLA',
      'netflix': 'NFLX',
      'nvidia': 'NVDA',
      'berkshire': 'BRK.B',
      's&p': 'SPY',
      'vanguard': 'VOO',
      'spdr': 'SPY'
    };
    
    const companySymbols = [];
    for (const [company, symbol] of Object.entries(companyMap)) {
      if (message.toLowerCase().includes(company)) {
        console.log(`Found company name match: ${company} -> ${symbol}`);
        companySymbols.push(symbol);
      }
    }
    
    console.log(`Extracted company symbols: ${companySymbols.join(', ')}`);
    return [...new Set(companySymbols)]; // Remove duplicates
  }
  
  generateComparisonResponse(stockData, symbols) {
    const timestamp = new Date().toLocaleTimeString();
    let response = `# Comparison of ${symbols.join(' vs ')} as of ${timestamp}\n\n`;
    
    // Create a comparison table in text
    for (const symbol of symbols) {
      if (stockData[symbol]) {
        const data = stockData[symbol];
        response += `## ${symbol} (${this.getCompanyName(symbol)})\n`;
        response += `- **Price:** $${data.price.toFixed(2)}\n`;
        response += `- **Change:** ${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)} (${data.changePercent})\n`;
        response += `- **Volume:** ${data.volume.toLocaleString()}\n\n`;
      }
    }
    
    // If we're comparing SPY and VOO specifically, add special context
    if (symbols.includes('SPY') && symbols.includes('VOO')) {
      response += `## Comparison Analysis\n\n`;
      response += `SPY and VOO are both ETFs that track the S&P 500 index, but they have some key differences:\n\n`;
      response += `- **Expense Ratio:** VOO has a slightly lower expense ratio (0.03%) compared to SPY (0.09%)\n`;
      response += `- **Provider:** SPY is managed by State Street Global Advisors, while VOO is managed by Vanguard\n`;
      response += `- **Inception:** SPY is older (launched in 1993) compared to VOO (launched in 2010)\n`;
      response += `- **Liquidity:** SPY typically has higher trading volume and greater liquidity\n`;
      response += `- **Dividends:** VOO automatically reinvests dividends until distribution, while SPY holds them as cash\n\n`;
      response += `For long-term investors, the slight expense ratio advantage of VOO may lead to better returns over time, while traders might prefer SPY for its higher liquidity.`;
    }
    
    return response;
  }
  
  generateSingleStockResponse(symbol, data) {
    const companyName = this.getCompanyName(symbol);
    const direction = data.change >= 0 ? "up" : "down";
    const changeAbs = Math.abs(data.change);
    const timestamp = new Date(data.lastUpdated).toLocaleTimeString();
    
    let response = `# ${symbol} (${companyName}) Price Information\n\n`;
    response += `Based on the latest data from ${data.source || 'financial data sources'} as of ${timestamp}, ${symbol} is currently trading at **$${data.price.toFixed(2)}**.\n\n`;
    response += `Today, the stock is ${direction} $${changeAbs.toFixed(2)} (${data.changePercent}) with a volume of ${data.volume.toLocaleString()} shares.\n\n`;
    
    // Add some basic context about the company
    response += this.getCompanyContext(symbol);
    
    return response;
  }
  
  generateFallbackResponse(message, attemptedSymbols) {
    let response = `I don't have the latest real-time stock data`;
    
    if (attemptedSymbols.length > 0) {
      response += ` for ${attemptedSymbols.join(', ')}`;
    }
    
    response += ` at this moment.\n\n`;
    response += `To find current stock prices, you can:\n`;
    response += `• Check financial websites like Yahoo Finance, MarketWatch, or Google Finance\n`;
    response += `• Use your brokerage's platform for real-time quotes\n`;
    response += `• Look at financial news sites for recent market coverage\n\n`;
    response += `Stock prices change constantly during market hours (9:30 AM - 4:00 PM ET on trading days).`;
    
    return response;
  }

  getCompanyName(symbol) {
    const companies = {
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc. (Class A)',
      'GOOG': 'Alphabet Inc. (Class C)',
      'AMZN': 'Amazon.com Inc.',
      'META': 'Meta Platforms Inc.',
      'TSLA': 'Tesla Inc.',
      'NVDA': 'NVIDIA Corporation',
      'NFLX': 'Netflix Inc.',
      'BRK.A': 'Berkshire Hathaway Inc. (Class A)',
      'BRK.B': 'Berkshire Hathaway Inc. (Class B)',
      'JPM': 'JPMorgan Chase & Co.',
      'V': 'Visa Inc.',
      'SPY': 'SPDR S&P 500 ETF Trust',
      'VOO': 'Vanguard S&P 500 ETF',
      'QQQ': 'Invesco QQQ Trust (NASDAQ-100 Index)',
      'VTI': 'Vanguard Total Stock Market ETF'
    };
    
    return companies[symbol] || symbol;
  }
  
  getCompanyContext(symbol) {
    const contexts = {
      'AAPL': "Apple is a technology company that designs, manufactures, and markets smartphones, computers, tablets, wearables and accessories.",
      'MSFT': "Microsoft is a technology company that develops, licenses, and supports software, services, devices, and solutions worldwide.",
      'GOOGL': "Alphabet (Google) is a technology company specializing in internet-related services and products, including online advertising, search engine, cloud computing, and software.",
      'AMZN': "Amazon is an e-commerce and cloud computing company, known for its online marketplace, digital streaming, and artificial intelligence.",
      'META': "Meta Platforms (formerly Facebook) operates social media platforms including Facebook, Instagram, and WhatsApp, and is investing in metaverse technologies.",
      'TSLA': "Tesla designs, manufactures and sells electric vehicles, solar products, energy storage systems, and related services.",
      'SPY': "SPY is an ETF that tracks the S&P 500 index, providing exposure to 500 of the largest U.S. companies.",
      'VOO': "VOO is Vanguard's ETF that tracks the S&P 500 index, known for its low expense ratio."
    };
    
    return contexts[symbol] || "";
  }
}

module.exports = AIService;