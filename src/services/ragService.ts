import { databaseService } from './databaseService';

/**
 * RAG (Retrieval Augmented Generation) Service
 * Prepares financial data context for Phi-3-mini local LLM
 */

interface RAGContext {
  companies: string[];
  financialData: any;
  contextText: string;
}

class RAGService {
  /**
   * Build context for LLM about a specific company
   */
  async buildCompanyContext(symbol: string): Promise<string> {
    const data = await databaseService.getCompanyDataForRAG(symbol);
    
    if (!data.quote && !data.overview && !data.metrics) {
      return `No data available for ${symbol}. The company has not been searched or cached yet.`;
    }

    let context = `Financial Analysis for ${symbol}:\n\n`;

    // Company Overview
    if (data.overview) {
      context += `Company: ${data.overview.name}\n`;
      context += `Sector: ${data.overview.sector}\n`;
      context += `Industry: ${data.overview.industry}\n`;
      context += `Exchange: ${data.overview.exchange}\n`;
      if (data.overview.employees) {
        context += `Employees: ${data.overview.employees.toLocaleString()}\n`;
      }
      if (data.overview.description) {
        context += `\nDescription: ${data.overview.description}\n`;
      }
      context += `\n`;
    }

    // Current Quote
    if (data.quote) {
      context += `Current Price: $${data.quote.price.toFixed(2)}\n`;
      context += `Change: ${data.quote.change >= 0 ? '+' : ''}${data.quote.change.toFixed(2)} (${data.quote.changePercent.toFixed(2)}%)\n`;
      context += `Day Range: $${data.quote.low.toFixed(2)} - $${data.quote.high.toFixed(2)}\n`;
      context += `Volume: ${data.quote.volume.toLocaleString()}\n`;
      context += `Previous Close: $${data.quote.previousClose.toFixed(2)}\n`;
      context += `\n`;
    }

    // Financial Metrics
    if (data.metrics) {
      context += `Financial Metrics:\n`;
      if (data.metrics.peRatio) context += `P/E Ratio: ${data.metrics.peRatio.toFixed(2)}\n`;
      if (data.metrics.eps) context += `EPS: $${data.metrics.eps.toFixed(2)}\n`;
      if (data.metrics.marketCap) context += `Market Cap: $${(data.metrics.marketCap / 1e9).toFixed(2)}B\n`;
      if (data.metrics.dividendYield) context += `Dividend Yield: ${data.metrics.dividendYield.toFixed(2)}%\n`;
      if (data.metrics.beta) context += `Beta: ${data.metrics.beta.toFixed(2)}\n`;
      if (data.metrics.weekHigh52 && data.metrics.weekLow52) {
        context += `52-Week Range: $${data.metrics.weekLow52.toFixed(2)} - $${data.metrics.weekHigh52.toFixed(2)}\n`;
      }
      context += `\n`;
    }

    // Recent Price Trend
    if (data.historical && data.historical.length > 0) {
      const recent = data.historical.slice(-5);
      context += `Recent Price History (last 5 days):\n`;
      recent.forEach((point: any) => {
        context += `${point.date}: $${point.price.toFixed(2)}\n`;
      });
      
      // Calculate trend
      if (recent.length >= 2) {
        const firstPrice = recent[0].price;
        const lastPrice = recent[recent.length - 1].price;
        const change = ((lastPrice - firstPrice) / firstPrice) * 100;
        context += `\n5-day trend: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%\n`;
      }
    }

    return context;
  }

  /**
   * Build context for comparing multiple companies
   */
  async buildComparisonContext(symbols: string[]): Promise<string> {
    let context = `Comparing ${symbols.length} companies:\n\n`;

    for (const symbol of symbols) {
      const data = await databaseService.getCompanyDataForRAG(symbol);
      
      if (!data.quote && !data.overview) {
        context += `${symbol}: No data available\n\n`;
        continue;
      }

      context += `${symbol} - ${data.overview?.name || 'Unknown'}\n`;
      if (data.quote) {
        context += `  Price: $${data.quote.price.toFixed(2)} (${data.quote.changePercent >= 0 ? '+' : ''}${data.quote.changePercent.toFixed(2)}%)\n`;
      }
      if (data.metrics) {
        if (data.metrics.peRatio) context += `  P/E: ${data.metrics.peRatio.toFixed(2)}\n`;
        if (data.metrics.marketCap) context += `  Market Cap: $${(data.metrics.marketCap / 1e9).toFixed(2)}B\n`;
      }
      if (data.overview) {
        context += `  Sector: ${data.overview.sector}\n`;
      }
      context += `\n`;
    }

    return context;
  }

  /**
   * Build general market context from all cached data
   */
  async buildMarketContext(): Promise<string> {
    const symbols = await databaseService.getAllCachedSymbols();
    
    if (symbols.length === 0) {
      return 'No cached market data available. Search for companies first to build the knowledge base.';
    }

    let context = `Market Overview (${symbols.length} companies in knowledge base):\n\n`;

    const sectorData: Record<string, number> = {};
    let totalValue = 0;
    let positiveMovers = 0;
    let negativeMovers = 0;

    for (const symbol of symbols.slice(0, 20)) { // Limit to 20 for performance
      const data = await databaseService.getCompanyDataForRAG(symbol);
      
      if (data.overview?.sector) {
        sectorData[data.overview.sector] = (sectorData[data.overview.sector] || 0) + 1;
      }
      
      if (data.quote) {
        if (data.quote.changePercent > 0) positiveMovers++;
        else if (data.quote.changePercent < 0) negativeMovers++;
        
        if (data.metrics?.marketCap) {
          totalValue += data.metrics.marketCap;
        }
      }
    }

    context += `Sector Distribution:\n`;
    Object.entries(sectorData)
      .sort(([, a], [, b]) => b - a)
      .forEach(([sector, count]) => {
        context += `  ${sector}: ${count} companies\n`;
      });

    context += `\nMarket Sentiment:\n`;
    context += `  Positive movers: ${positiveMovers}\n`;
    context += `  Negative movers: ${negativeMovers}\n`;

    return context;
  }

  /**
   * Extract relevant context based on user query
   */
  async extractRelevantContext(query: string): Promise<string> {
    // Detect if query is about specific company (contains stock symbol)
    const symbolMatch = query.match(/\b[A-Z]{1,5}\b/);
    
    if (symbolMatch) {
      const symbol = symbolMatch[0];
      return await this.buildCompanyContext(symbol);
    }

    // Detect comparison queries
    const compareKeywords = ['compare', 'vs', 'versus', 'difference between'];
    if (compareKeywords.some(keyword => query.toLowerCase().includes(keyword))) {
      const symbols = query.match(/\b[A-Z]{1,5}\b/g);
      if (symbols && symbols.length >= 2) {
        return await this.buildComparisonContext(symbols);
      }
    }

    // General market query
    const marketKeywords = ['market', 'overview', 'sector', 'industry', 'general'];
    if (marketKeywords.some(keyword => query.toLowerCase().includes(keyword))) {
      return await this.buildMarketContext();
    }

    // Default: return general guidance
    return `I can help you analyze financial data. Ask me about:
- Specific companies (use ticker symbols like AAPL, GOOGL, MSFT)
- Compare companies (e.g., "compare AAPL vs GOOGL")
- Market overview and sectors
- Financial metrics and analysis

Note: Make sure to search for companies first to add them to my knowledge base.`;
  }

  /**
   * Format prompt for Phi-3-mini with context
   */
  async formatPromptForLLM(userQuery: string): Promise<string> {
    const context = await this.extractRelevantContext(userQuery);

    return `<|system|>
You are a professional financial analyst AI assistant. You have access to real-time financial data from a local database. Provide accurate, data-driven insights based on the context provided. Be concise, professional, and helpful.
<|end|>
<|user|>
Context:
${context}

Question: ${userQuery}
<|end|>
<|assistant|>`;
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
