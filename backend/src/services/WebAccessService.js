// backend/src/services/WebAccessService.js
const axios = require('axios');
const cheerio = require('cheerio');
const AuditService = require('./AuditService');

class WebAccessService {
  constructor() {
    this.auditService = new AuditService();
  }

  async getMarketNews(query = '', limit = 5) {
    try {
      // Log the web access attempt
      await this.auditService.logEvent('web_access', 'market_news', {
        query,
        timestamp: new Date().toISOString()
      });

      // Use Yahoo Finance for news
      const searchQuery = encodeURIComponent(query || 'financial markets');
      const url = `https://finance.yahoo.com/search?q=${searchQuery}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      const articles = [];
      
      // Parse Yahoo Finance search results for news
      $('.NewsArticle').each((i, element) => {
        if (articles.length >= limit) return false;
        
        const title = $(element).find('h4').text().trim();
        const source = $(element).find('.C(#959595)').text().trim();
        const url = $(element).find('a').attr('href');
        const snippet = $(element).find('p').text().trim();
        
        if (title && url) {
          articles.push({
            title,
            source,
            url: url.startsWith('http') ? url : `https://finance.yahoo.com${url}`,
            publishedAt: new Date().toISOString(), // Yahoo doesn't always show time in search results
            snippet
          });
        }
      });
      
      // If we didn't get enough articles, try the general news section
      if (articles.length < limit) {
        const generalNewsUrl = 'https://finance.yahoo.com/news/';
        const newsResponse = await axios.get(generalNewsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        const news$ = cheerio.load(newsResponse.data);
        news$('li.js-stream-content').each((i, element) => {
          if (articles.length >= limit) return false;
          
          const title = news$(element).find('h3').text().trim();
          const source = news$(element).find('.C(#959595)').text().trim() || 'Yahoo Finance';
          const url = news$(element).find('a').attr('href');
          const snippet = news$(element).find('p').text().trim();
          
          if (title && url && !articles.some(a => a.title === title)) {
            articles.push({
              title,
              source,
              url: url.startsWith('http') ? url : `https://finance.yahoo.com${url}`,
              publishedAt: new Date().toISOString(),
              snippet
            });
          }
        });
      }

      return {
        success: true,
        articles: articles.length > 0 ? articles : this.getFallbackNews(query)
      };
    } catch (error) {
      console.error('Error fetching market news:', error);
      return {
        success: false,
        error: error.message,
        articles: this.getFallbackNews(query)
      };
    }
  }

  async getStockData(symbol) {
    try {
      // Log the web access attempt
      await this.auditService.logEvent('web_access', 'stock_data', {
        symbol,
        timestamp: new Date().toISOString()
      });

      console.log(`Fetching stock data for ${symbol} from Alpha Vantage...`);

      // Set your Alpha Vantage API key
      // You can get a free API key from https://www.alphavantage.co/support/#api-key
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
      
      // First try to get real-time quote data
      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
      
      console.log(`Requesting quote URL: ${quoteUrl}`);
      
      const quoteResponse = await axios.get(quoteUrl, {
        timeout: 10000 // 10 second timeout
      });
      
      const quoteData = quoteResponse.data;
      
      // Check if we received valid data
      if (quoteData && quoteData['Global Quote'] && Object.keys(quoteData['Global Quote']).length > 0) {
        const quote = quoteData['Global Quote'];
        
        const price = parseFloat(quote['05. price']);
        const change = parseFloat(quote['09. change']);
        const changePercent = quote['10. change percent'];
        const volume = parseInt(quote['06. volume']);
        
        console.log(`Alpha Vantage data: Price=${price}, Change=${change}, Percent=${changePercent}, Volume=${volume}`);
        
        return {
          success: true,
          data: {
            symbol,
            price,
            change,
            changePercent,
            volume,
            lastUpdated: new Date().toISOString(),
            source: 'Alpha Vantage API'
          }
        };
      }
      
      // If we don't have quote data, try to get some overview data
      const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
      
      console.log(`Requesting overview URL: ${overviewUrl}`);
      
      const overviewResponse = await axios.get(overviewUrl, {
        timeout: 10000
      });
      
      const overviewData = overviewResponse.data;
      
      if (overviewData && overviewData.Symbol) {
        // We have some overview data, but no real-time price
        // This is partial data, so mark as semi-successful
        
        // Try to get a price from the overview data
        let price = 0;
        if (overviewData['52WeekHigh'] && overviewData['52WeekLow']) {
          // Use average of 52 week high and low as an estimate
          price = (parseFloat(overviewData['52WeekHigh']) + parseFloat(overviewData['52WeekLow'])) / 2;
        }
        
        return {
          success: true,
          partial: true,
          data: {
            symbol,
            price,
            change: 0,
            changePercent: '0.00%',
            volume: 0,
            lastUpdated: new Date().toISOString(),
            name: overviewData.Name,
            sector: overviewData.Sector,
            industry: overviewData.Industry,
            source: 'Alpha Vantage API (Overview data)'
          }
        };
      }
      
      // Check for API limit messages
      if (quoteData && 
          (quoteData.Note || quoteData.Information) && 
          (quoteData.Note?.includes('API call frequency') || quoteData.Information?.includes('API call frequency'))) {
        console.log('Alpha Vantage API limit reached');
        
        return {
          success: false,
          error: 'API call frequency limit reached. Please try again later.',
          limitReached: true,
          data: this.getFallbackStockData(symbol)
        };
      }
      
      // If Alpha Vantage failed, try our web scraping as fallback
      console.log('Alpha Vantage API returned no data, trying web scraping as fallback...');
      
      // Use Yahoo Finance for stock data as a fallback
      const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
      
      console.log(`Requesting Yahoo Finance URL: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      let foundData = false;
      let price = null;
      
      // Try to find the price in any numeric value
      $('fin-streamer[data-field="regularMarketPrice"]').each((i, el) => {
        if (price !== null) return;
        
        const val = $(el).attr('value') || $(el).text().trim();
        if (val) {
          price = parseFloat(val.replace(/,/g, ''));
          if (!isNaN(price)) {
            foundData = true;
            console.log(`Found price from Yahoo Finance: ${price}`);
          }
        }
      });
      
      // Extract change and percent values
      let change = 0;
      let changePercent = '0.00%';
      
      $('fin-streamer[data-field="regularMarketChange"]').each((i, el) => {
        const val = $(el).attr('value');
        if (val) {
          change = parseFloat(val);
          if (!isNaN(change)) foundData = true;
        }
      });
      
      $('fin-streamer[data-field="regularMarketChangePercent"]').each((i, el) => {
        const val = $(el).attr('value');
        if (val) {
          const percentFloat = parseFloat(val);
          changePercent = (percentFloat >= 0 ? '+' : '') + percentFloat.toFixed(2) + '%';
        }
      });
      
      // Extract volume
      let volume = 0;
      $('fin-streamer[data-field="regularMarketVolume"]').each((i, el) => {
        const val = $(el).attr('value');
        if (val) {
          volume = parseInt(val);
          if (!isNaN(volume)) foundData = true;
        }
      });
      
      if (foundData && price !== null) {
        return {
          success: true,
          data: {
            symbol,
            price,
            change,
            changePercent,
            volume,
            lastUpdated: new Date().toISOString(),
            source: 'Yahoo Finance (fallback)'
          }
        };
      }
      
      // If all methods fail, use fallback data
      console.log(`Could not find valid price for ${symbol} from any source, using fallback data`);
      return {
        success: false,
        error: `Could not retrieve data for ${symbol} from any source`,
        data: this.getFallbackStockData(symbol)
      };
    } catch (error) {
      console.error(`Error fetching stock data for ${symbol}:`, error);
      return {
        success: false,
        error: error.message,
        data: this.getFallbackStockData(symbol)
      };
    }
  }

  async getMarketSentiment(symbol) {
    try {
      // Log the web access attempt
      await this.auditService.logEvent('web_access', 'market_sentiment', {
        symbol,
        timestamp: new Date().toISOString()
      });

      // Try to get analyst recommendations from Yahoo Finance
      const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysts`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      // Get recommendation summary
      let bullishCount = 0;
      let bearishCount = 0;
      let neutralCount = 0;
      let totalCount = 0;
      
      // Parse the recommendation table
      $('tr').each((i, row) => {
        const cells = $(row).find('td');
        if (cells.length >= 5) {
          const rowHeader = $(cells[0]).text().trim().toLowerCase();
          
          if (rowHeader === 'buy' || rowHeader === 'strong buy') {
            bullishCount += parseInt($(cells[1]).text()) || 0;
          } else if (rowHeader === 'sell' || rowHeader === 'strong sell') {
            bearishCount += parseInt($(cells[1]).text()) || 0;
          } else if (rowHeader === 'hold' || rowHeader === 'neutral') {
            neutralCount += parseInt($(cells[1]).text()) || 0;
          }
        }
      });
      
      totalCount = bullishCount + bearishCount + neutralCount;
      
      let sentiment = 'neutral';
      if (totalCount > 0) {
        const bullishPercent = (bullishCount / totalCount) * 100;
        const bearishPercent = (bearishCount / totalCount) * 100;
        
        if (bullishPercent > 60) sentiment = 'bullish';
        else if (bearishPercent > 60) sentiment = 'bearish';
      }
      
      // If we couldn't get sentiment data, use the fallback
      if (totalCount === 0) {
        return {
          success: false,
          error: 'Could not parse sentiment data',
          data: this.getFallbackSentiment(symbol)
        };
      }

      return {
        success: true,
        data: {
          symbol,
          sentiment,
          buzzScore: null, // Not available from scraping
          newsScore: null, // Not available from scraping
          analystCounts: {
            bullish: bullishCount,
            neutral: neutralCount,
            bearish: bearishCount,
            total: totalCount
          },
          bullishPercent: totalCount > 0 ? Math.round((bullishCount / totalCount) * 100) : 0,
          bearishPercent: totalCount > 0 ? Math.round((bearishCount / totalCount) * 100) : 0,
          lastUpdated: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`Error fetching market sentiment for ${symbol}:`, error);
      return {
        success: false,
        error: error.message,
        data: this.getFallbackSentiment(symbol)
      };
    }
  }

  async getGeneralMarketOverview() {
    try {
      // Log the web access attempt
      await this.auditService.logEvent('web_access', 'market_overview', {
        timestamp: new Date().toISOString()
      });

      // Get market summary from Yahoo Finance homepage
      const url = 'https://finance.yahoo.com/';
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      const $ = cheerio.load(response.data);
      
      const marketIndices = {};
      
      // Find the market indices section
      $('fin-streamer[data-symbol]').each((i, element) => {
        const symbol = $(element).attr('data-symbol');
        const value = parseFloat($(element).attr('value'));
        
        if (symbol && !isNaN(value)) {
          // Only grab the main indices
          if (['%5EDJI', '%5EIXIC', '%5EGSPC', '%5EVIX'].includes(symbol)) {
            const name = {
              '%5EDJI': 'Dow Jones',
              '%5EIXIC': 'NASDAQ',
              '%5EGSPC': 'S&P 500',
              '%5EVIX': 'VIX'
            }[symbol] || symbol;
            
            if (!marketIndices[symbol]) {
              marketIndices[symbol] = {
                name,
                price: value,
                change: 0,
                changePercent: '0%'
              };
            }
          }
        }
      });
      
      // Get the changes for each index
      $('fin-streamer[data-field="regularMarketChange"]').each((i, element) => {
        const symbol = $(element).attr('data-symbol');
        const change = parseFloat($(element).text().replace(/[+,]/g, ''));
        
        if (symbol && marketIndices[symbol] && !isNaN(change)) {
          marketIndices[symbol].change = change;
        }
      });
      
      // Get the percent changes
      $('fin-streamer[data-field="regularMarketChangePercent"]').each((i, element) => {
        const symbol = $(element).attr('data-symbol');
        const changePercentText = $(element).text().trim();
        
        if (symbol && marketIndices[symbol]) {
          marketIndices[symbol].changePercent = changePercentText;
        }
      });
      
      // Get top news
      const [topNews] = await Promise.all([
        this.getMarketNews('market index', 3)
      ]);

      return {
        success: true,
        data: {
          marketIndices: Object.values(marketIndices),
          latestNews: topNews.articles,
          asOf: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error fetching general market overview:', error);
      return {
        success: false,
        error: error.message,
        data: this.getFallbackMarketOverview()
      };
    }
  }

  // Fallback data methods when web scraping fails
  getFallbackNews(query) {
    return [
      {
        title: `Latest trends in ${query || 'financial markets'} (Demo data)`,
        source: 'MCP Financial Demo',
        url: '#',
        publishedAt: new Date().toISOString(),
        snippet: `This is simulated news content about ${query || 'financial markets'}. In production, real-time news would be displayed here.`
      },
      {
        title: `Analysts discuss ${query || 'market'} outlook (Demo data)`,
        source: 'MCP Financial Demo',
        url: '#',
        publishedAt: new Date().toISOString(),
        snippet: 'This is simulated news content. Web access is temporarily unavailable.'
      }
    ];
  }

  getFallbackStockData(symbol) {
    return {
      symbol,
      price: 150.25,
      change: 2.34,
      changePercent: '1.58%',
      volume: 28945671,
      lastUpdated: new Date().toISOString(),
      note: 'Demo data - web access temporarily unavailable'
    };
  }

  getFallbackSentiment(symbol) {
    return {
      symbol,
      sentiment: 'neutral',
      analystCounts: {
        bullish: 5,
        neutral: 3,
        bearish: 2,
        total: 10
      },
      bullishPercent: 50,
      bearishPercent: 20,
      lastUpdated: new Date().toISOString(),
      note: 'Demo data - web access temporarily unavailable'
    };
  }

  getFallbackMarketOverview() {
    return {
      marketIndices: [
        {
          name: 'S&P 500',
          price: 4732.75,
          change: 15.34,
          changePercent: '+0.32%'
        },
        {
          name: 'Dow Jones',
          price: 37589.43,
          change: 112.88,
          changePercent: '+0.30%'
        },
        {
          name: 'NASDAQ',
          price: 16794.82,
          change: 93.43,
          changePercent: '+0.56%'
        },
        {
          name: 'VIX',
          price: 13.25,
          change: -0.43,
          changePercent: '-3.14%'
        }
      ],
      latestNews: this.getFallbackNews('market index'),
      asOf: new Date().toISOString(),
      note: 'Demo data - web access temporarily unavailable'
    };
  }
}

module.exports = WebAccessService;