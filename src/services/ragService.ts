import { databaseService } from './databaseService';
import { financeApiService } from './financeApiService';

/**
 * RAG (Retrieval Augmented Generation) Service
 * Prepares financial data context for LFM2-1.2B-RAG local LLM
 * OPTIMIZED FOR: Document-based Q&A, Accuracy, and Reduced Hallucinations.
 * LFM2 specializes in answering questions based on provided contextual documents.
 * 
 * SUPPORTED DATA SOURCES:
 * - Company data (quotes, overview, metrics, historical)
 * - Market movers (gainers, losers, most active)
 * - Market news (articles, videos, headlines)
 * - Earnings calendar (upcoming announcements)
 * - Market overview (sector analysis, sentiment)
 */

interface RAGContext {
  companies: string[];
  financialData: any;
  contextText: string;
}

class RAGService {

  /**
   * Helper: Trigger a fresh data fetch from API before analyzing.
   * This updates the SQLite cache so the AI has the latest numbers.
   */
  private async refreshCompanyData(symbol: string): Promise<void> {
    try {
      console.log(`RAG: Checking for fresh data for ${symbol}...`);
      // We use Promise.allSettled so if one call fails (e.g. rate limit), the others still complete.
      await Promise.allSettled([
        financeApiService.getStockQuote(symbol),
        financeApiService.getCompanyOverview(symbol),
        financeApiService.getFinancialMetrics(symbol),
      ]);
    } catch (error) {
      // If offline, we just log a warning and proceed with existing DB data
      console.warn(`RAG: Could not refresh ${symbol} (using cached data)`, error);
    }
  }

  /**
   * Build context for LLM about a specific company
   * STRATEGY: Provide clean, labeled data to reduce confusion.
   */
  async buildCompanyContext(symbol: string): Promise<string> {
    console.log(`[RAG] Building context for ${symbol}`);
    
    // 1. TRIGGER REFRESH (API -> SQLite)
    await this.refreshCompanyData(symbol);

    // 2. READ from SQLite (Now contains fresh data)
    const data = await databaseService.getCompanyDataForRAG(symbol);
    
    console.log(`[RAG] Data retrieved for ${symbol}:`, {
      quote: !!data.quote,
      overview: !!data.overview,
      metrics: !!data.metrics,
      historical: data.historical?.length || 0
    });
    
    if (!data.quote && !data.overview && !data.metrics) {
      console.warn(`[RAG] No data found for ${symbol} after refresh attempt`);
      return `### ${symbol}\n\nNo financial data available yet. The data may still be loading or the symbol might be invalid. Try searching for this company in the Browse Stocks screen first.`;
    }

    let context = `### Financial Data for ${symbol}\n`;

    // Company Overview
    if (data.overview) {
      context += `**Overview**\n`;
      context += `Name: ${data.overview.name}\n`;
      context += `Sector: ${data.overview.sector}\n`;
      context += `Industry: ${data.overview.industry}\n`;
      if (data.overview.description) {
        // Limit description length to prevent distracting the model
        const desc = data.overview.description.length > 250 
          ? data.overview.description.substring(0, 250) + "..." 
          : data.overview.description;
        context += `Description: ${desc}\n`;
      }
      context += `\n`;
    }

    // Current Quote
    if (data.quote) {
      context += `**Current Market Data**\n`;
      context += `Price: $${data.quote.price.toFixed(2)}\n`;
      context += `Change: ${data.quote.change >= 0 ? '+' : ''}${data.quote.change.toFixed(2)} (${data.quote.changePercent.toFixed(2)}%)\n`;
      context += `Day Range: $${data.quote.low.toFixed(2)} - $${data.quote.high.toFixed(2)}\n`;
      context += `Volume: ${data.quote.volume.toLocaleString()}\n`;
      context += `\n`;
    }

    // Financial Metrics
    if (data.metrics) {
      context += `**Key Fundamentals**\n`;
      if (data.metrics.peRatio) context += `P/E Ratio: ${data.metrics.peRatio.toFixed(2)}\n`;
      if (data.metrics.eps) context += `EPS: $${data.metrics.eps.toFixed(2)}\n`;
      if (data.metrics.marketCap) context += `Market Cap: $${(data.metrics.marketCap / 1e9).toFixed(2)} Billion\n`;
      if (data.metrics.dividendYield) context += `Dividend Yield: ${data.metrics.dividendYield.toFixed(2)}%\n`;
      if (data.metrics.beta) context += `Beta: ${data.metrics.beta.toFixed(2)}\n`;
      if (data.metrics.weekHigh52) context += `52-Week High: $${data.metrics.weekHigh52.toFixed(2)}\n`;
      context += `\n`;
    }

    // Recent Price Trend (Limited to 5 days for focus)
    if (data.historical && data.historical.length > 0) {
      const recent = data.historical.slice(-5);
      context += `**Recent Price History (Last 5 Days)**\n`;
      recent.forEach((point: any) => {
        context += `- ${point.date}: $${point.price.toFixed(2)}\n`;
      });
    }

    return context;
  }

  /**
   * Build context for comparing multiple companies
   */
  async buildComparisonContext(symbols: string[]): Promise<string> {
    // 1. Refresh all companies in parallel
    await Promise.allSettled(symbols.map(s => this.refreshCompanyData(s)));

    let context = `### Comparison of ${symbols.join(', ')}\n\n`;

    for (const symbol of symbols) {
      const data = await databaseService.getCompanyDataForRAG(symbol);
      
      if (!data.quote) {
        context += `${symbol}: No data available\n`;
        continue;
      }

      context += `**${symbol} (${data.overview?.name || 'Unknown'})**\n`;
      context += `Price: $${data.quote.price.toFixed(2)}\n`;
      if (data.metrics?.peRatio) context += `P/E Ratio: ${data.metrics.peRatio.toFixed(2)}\n`;
      if (data.metrics?.marketCap) context += `Market Cap: $${(data.metrics.marketCap / 1e9).toFixed(2)}B\n`;
      context += `\n`;
    }

    return context;
  }

  /**
   * Build general market context from all cached data + market movers + news
   */
  async buildMarketContext(): Promise<string> {
    const symbols = await databaseService.getAllCachedSymbols();
    
    if (symbols.length === 0) {
      return 'No cached market data available. Search for companies first.';
    }

    let context = `### Market Overview (Local Cache)\n`;
    let positiveMovers = 0;
    let negativeMovers = 0;

    // Limit to 15 companies to keep context focused
    for (const symbol of symbols.slice(0, 15)) { 
      const data = await databaseService.getCompanyDataForRAG(symbol);
      
      if (data.quote) {
        if (data.quote.changePercent > 0) positiveMovers++;
        else negativeMovers++;
      }
    }

    context += `Total Companies Analyzed: ${symbols.length}\n`;
    context += `Positive Movers: ${positiveMovers}\n`;
    context += `Negative Movers: ${negativeMovers}\n\n`;

    // Add Market Movers data
    const moversData = await this.getMarketMoversData();
    if (moversData) context += moversData + '\n';

    // Add Recent News
    const newsData = await this.getMarketNewsData();
    if (newsData) context += newsData + '\n';

    return context;
  }

  /**
   * Get Market Movers (Gainers, Losers, Most Active)
   */
  private async getMarketMoversData(): Promise<string> {
    try {
      const [gainers, losers, mostActive] = await Promise.all([
        databaseService.getMarketData('screener_day_gainers', 60 * 60 * 1000),
        databaseService.getMarketData('screener_day_losers', 60 * 60 * 1000),
        databaseService.getMarketData('screener_most_actives', 60 * 60 * 1000),
      ]);

      let context = '';

      if (gainers && gainers.length > 0) {
        context += `**Top Gainers (${gainers.length}):**\n`;
        gainers.slice(0, 5).forEach((stock: any) => {
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): +${stock.regularMarketChangePercent?.toFixed(2) || '0'}%\n`;
        });
        context += '\n';
      }

      if (losers && losers.length > 0) {
        context += `**Top Losers (${losers.length}):**\n`;
        losers.slice(0, 5).forEach((stock: any) => {
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): ${stock.regularMarketChangePercent?.toFixed(2) || '0'}%\n`;
        });
        context += '\n';
      }

      if (mostActive && mostActive.length > 0) {
        context += `**Most Active (${mostActive.length}):**\n`;
        mostActive.slice(0, 5).forEach((stock: any) => {
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): Vol ${(stock.regularMarketVolume / 1e6)?.toFixed(1) || '0'}M\n`;
        });
        context += '\n';
      }

      return context;
    } catch (error) {
      console.warn('[RAG] Failed to load market movers:', error);
      return '';
    }
  }

  /**
   * Get Market News
   */
  private async getMarketNewsData(): Promise<string> {
    try {
      const news = await databaseService.getMarketData('news_v2_ALL_ALL', 15 * 60 * 1000);
      
      if (!news || news.length === 0) return '';

      let context = `**Recent Market News (${news.length} articles):**\n`;
      
      // Show top 5 most recent news
      news.slice(0, 5).forEach((article: any, index: number) => {
        context += `${index + 1}. **${article.title}**\n`;
        if (article.pubDate) context += `   Published: ${article.pubDate}\n`;
        if (article.summary) {
          const summary = article.summary.length > 150 
            ? article.summary.substring(0, 150) + '...' 
            : article.summary;
          context += `   ${summary}\n`;
        }
        context += '\n';
      });

      return context;
    } catch (error) {
      console.warn('[RAG] Failed to load market news:', error);
      return '';
    }
  }

  /**
   * Get Earnings Calendar data
   */
  private async getEarningsCalendarData(): Promise<string> {
    try {
      const earnings = await databaseService.getMarketData('calendar_earnings', 60 * 60 * 1000);
      
      if (!earnings || earnings.length === 0) return '';

      let context = `**Upcoming Earnings (${earnings.length} companies):**\n`;
      
      // Show top 10 most relevant earnings
      earnings.slice(0, 10).forEach((event: any) => {
        // The API returns: { ticker, name, date, eps_estimate, eps_actual, etc. }
        const symbol = event.ticker || event.symbol;
        const companyName = event.name || event.companyName || symbol;
        const earningsDate = event.date || event.earningsDate || event.reportDate;
        const epsEst = event.eps_estimate || event.epsEstimate;
        
        if (symbol) {
          context += `- ${symbol}`;
          if (companyName && companyName !== symbol) context += ` (${companyName})`;
          if (earningsDate) context += `: ${earningsDate}`;
          context += '\n';
          if (epsEst) context += `  EPS Estimate: $${epsEst}\n`;
        }
      });

      return context + '\n';
    } catch (error) {
      console.warn('[RAG] Failed to load earnings calendar:', error);
      return '';
    }
  }

  /**
   * Extract relevant context based on user query
   * FIXED: Better symbol detection and informative fallback
   */
  async extractRelevantContext(query: string): Promise<string> {
    const cleanQuery = query.trim();
    const queryLower = cleanQuery.toLowerCase();
    const allSymbols = await databaseService.getAllCachedSymbols();

    console.log(`[RAG] Processing query: "${cleanQuery}"`);
    console.log(`[RAG] Database has ${allSymbols.length} cached symbols:`, allSymbols.slice(0, 10).join(', '));

    // 1. Direct Symbol Match - Look for exact ticker symbols (2-5 uppercase letters)
    const words = cleanQuery.toUpperCase().split(/\s+/);
    for (const word of words) {
      // Check if word matches a cached symbol (must be 2-5 chars and in our DB)
      if (word.length >= 2 && word.length <= 5 && allSymbols.includes(word)) {
        console.log(`[RAG] Found direct symbol match: ${word}`);
        return await this.buildCompanyContext(word);
      }
    }

    // 2. Company Name Match (e.g., "Apple", "Microsoft", "Tesla", "Amazon")
    // Use hardcoded mapping for common symbols (faster + no DB dependency)
    const commonCompanies: { [key: string]: string } = {
      'apple': 'AAPL',
      'microsoft': 'MSFT',
      'google': 'GOOGL',
      'alphabet': 'GOOGL',
      'amazon': 'AMZN',
      'tesla': 'TSLA',
      'meta': 'META',
      'facebook': 'META',
      'nvidia': 'NVDA',
      'netflix': 'NFLX',
    };
    
    for (const [companyName, symbol] of Object.entries(commonCompanies)) {
      if (queryLower.includes(companyName) && allSymbols.includes(symbol)) {
        console.log(`[RAG] Found common company match: ${companyName} -> ${symbol}`);
        return await this.buildCompanyContext(symbol);
      }
    }
    
    // Check company overview (includes full name) for other companies
    for (const sym of allSymbols) {
      const overview = await databaseService.getCompanyOverview(sym);
      if (overview && overview.name) {
        const companyWords = overview.name.toLowerCase().split(/[\s,]+/);
        for (const companyWord of companyWords) {
          // Match significant words (3+ chars)
          if (companyWord.length >= 3 && queryLower.includes(companyWord)) {
            console.log(`[RAG] Found company name match: ${overview.name} (${sym})`);
            return await this.buildCompanyContext(sym);
          }
        }
      }
      
      // If no overview, check if symbol name itself matches (case-insensitive)
      if (sym.length <= 5 && queryLower.includes(sym.toLowerCase())) {
        console.log(`[RAG] Found symbol in query text: ${sym}`);
        return await this.buildCompanyContext(sym);
      }
    }

    // 3. Multiple symbols mentioned - Comparison
    const foundSymbols = allSymbols.filter(sym => cleanQuery.toUpperCase().includes(sym));
    if (foundSymbols.length >= 2) {
      console.log(`[RAG] Found comparison request: ${foundSymbols.join(', ')}`);
      return await this.buildComparisonContext(foundSymbols);
    }

    // 4. Watchlist queries - special handling
    const watchlistKeywords = ['watchlist', 'portfolio', 'my stocks', 'my companies'];
    if (watchlistKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected watchlist query`);
      // Extract any company names mentioned with watchlist
      for (const sym of allSymbols) {
        if (queryLower.includes(sym.toLowerCase())) {
          console.log(`[RAG] Found symbol in watchlist query: ${sym}`);
          return await this.buildCompanyContext(sym);
        }
        // Check company names
        const overview = await databaseService.getCompanyOverview(sym);
        if (overview && overview.name) {
          const nameWords = overview.name.toLowerCase().split(/[\s,]+/);
          for (const nameWord of nameWords) {
            if (nameWord.length >= 4 && queryLower.includes(nameWord)) {
              console.log(`[RAG] Found company in watchlist query: ${overview.name} (${sym})`);
              return await this.buildCompanyContext(sym);
            }
          }
        }
      }
      // If no specific company, show all watchlist
      return await this.buildMarketContext();
    }

    // 5. News-specific queries
    const newsKeywords = ['news', 'headline', 'article', 'latest', 'breaking', 'update'];
    if (newsKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected news query`);
      const newsData = await this.getMarketNewsData();
      if (newsData) {
        return `### Market News\n\n${newsData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // 6. Earnings/Calendar queries
    const earningsKeywords = ['earnings', 'report', 'announcement', 'calendar', 'upcoming'];
    if (earningsKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected earnings query`);
      const earningsData = await this.getEarningsCalendarData();
      if (earningsData) {
        return `### Earnings Calendar\n\n${earningsData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // 7. Market Movers queries (gainers, losers, active)
    const moversKeywords = ['gainer', 'loser', 'active', 'mover', 'winner', 'performer'];
    if (moversKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected market movers query`);
      const moversData = await this.getMarketMoversData();
      if (moversData) {
        return `### Market Movers\n\n${moversData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // 8. Market Overview Keywords
    const marketKeywords = ['market', 'overview', 'sector', 'industry', 'trends', 'summary'];
    if (marketKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Building comprehensive market overview context`);
      return await this.buildMarketContext();
    }

    // 9. General questions with available data
    if (allSymbols.length > 0) {
      console.log(`[RAG] No specific match, showing available companies`);
      const preview = await this.buildMarketContext();
      return `${preview}\n\n**Available Companies:** ${allSymbols.slice(0, 20).join(', ')}${allSymbols.length > 20 ? ` and ${allSymbols.length - 20} more...` : ''}\n\nThe user asked: "${cleanQuery}"`;
    }

    // 10. No data available
    console.log(`[RAG] No cached data available`);
    return `**System Status:** The knowledge base is currently empty. No companies have been searched yet.\n\n**To get started:**\n1. Search for a company (e.g., AAPL, MSFT, TSLA)\n2. Browse stocks in the app\n3. Add companies to your watchlist\n4. Check Market Movers or Statistics screens\n\nThen I'll be able to provide detailed financial analysis!\n\nUser asked: "${cleanQuery}"`;
  }

  /**
   * Format prompt for LFM2-1.2B-RAG
   * Uses ChatML format optimized for document-based question answering
   */
  async formatPromptForLLM(userQuery: string): Promise<string> {
    const context = await this.extractRelevantContext(userQuery);
    
    const date = new Date().toISOString().split('T')[0];

    // ChatML format for LFM2-1.2B-RAG (optimized for document-based Q&A)
    // System prompt: Optional but recommended for output language and behavior control
    // Context: Must be in user message (LFM2 is trained for this pattern)
    const prompt = `<|startoftext|><|im_start|>system
You are FinAI, an expert financial analyst. Always respond in English. Current Date: ${date}. Answer questions based strictly on the provided financial data. If data is missing, state it clearly. Use Markdown formatting with bold for key numbers.<|im_end|>
<|im_start|>user
Use the following context to answer questions:

${context}

---

Question: ${userQuery}<|im_end|>
<|im_start|>assistant
`;

    console.log('[RAG] Prompt length:', prompt.length);
    console.log('[RAG] Context preview:', context.substring(0, 200) + '...');
    
    return prompt;
  }

  /**
   * Debug: Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    const symbols = await databaseService.getAllCachedSymbols();
    const [gainers, losers, mostActive, news, earnings] = await Promise.all([
      databaseService.getMarketData('screener_day_gainers', Infinity),
      databaseService.getMarketData('screener_day_losers', Infinity),
      databaseService.getMarketData('screener_most_actives', Infinity),
      databaseService.getMarketData('news_v2_ALL_ALL', Infinity),
      databaseService.getMarketData('calendar_earnings', Infinity),
    ]);

    return {
      companies: symbols.length,
      gainers: gainers?.length || 0,
      losers: losers?.length || 0,
      mostActive: mostActive?.length || 0,
      news: news?.length || 0,
      earnings: earnings?.length || 0,
    };
  }

  /**
   * Prepare structured data for LLM fine-tuning (future use)
   */
  async prepareTrainingData(): Promise<any[]> {
    const symbols = await databaseService.getAllCachedSymbols();
    const trainingData = [];

    for (const symbol of symbols) {
      const data = await databaseService.getCompanyDataForRAG(symbol);
      
      if (data.quote && data.overview && data.metrics) {
        trainingData.push({
          input: `Analyze ${symbol}`,
          output: await this.buildCompanyContext(symbol),
          metadata: {
            symbol,
            sector: data.overview.sector,
            price: data.quote.price,
          },
        });
      }
    }

    return trainingData;
  }
}

export const ragService = new RAGService();