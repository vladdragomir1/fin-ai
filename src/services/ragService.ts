import { databaseService } from './databaseService';
import { financeApiService } from './financeApiService';

/**
 * RAG (Retrieval Augmented Generation) Service
 * Prepares financial data context for Llama-3.2 local LLM
 * Features:
 * - Real-Time Data Fetching (API -> SQLite -> AI)
 * - Intelligent Name Matching (e.g. "Apple" -> "AAPL")
 * - Smart Context Formatting
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
   * UPDATED: Fetches fresh API data first
   */
  async buildCompanyContext(symbol: string): Promise<string> {
    // 1. TRIGGER REFRESH (API -> SQLite)
    await this.refreshCompanyData(symbol);

    // 2. READ from SQLite (Now contains fresh data)
    const data = await databaseService.getCompanyDataForRAG(symbol);
    
    if (!data.quote && !data.overview && !data.metrics) {
      return `No data available for ${symbol}. The company has not been searched or cached yet.`;
    }

    let context = `Financial Analysis for ${symbol}:\n\n`;

    // Company Overview
    if (data.overview) {
      context += `Company: ${data.overview.name}\n`;
      context += `Sector: ${data.overview.sector} | Industry: ${data.overview.industry}\n`;
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
   * UPDATED: Fetches fresh data for ALL symbols
   */
  async buildComparisonContext(symbols: string[]): Promise<string> {
    // 1. Refresh all companies in parallel
    await Promise.allSettled(symbols.map(s => this.refreshCompanyData(s)));

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

    // Note: We do NOT refresh all symbols here because calling API for 20+ companies 
    // at once would instantly hit the Alpha Vantage rate limit. We use cached data only.

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
   * FIXED: Now searches for Company Names (e.g. "Apple") not just Symbols ("AAPL")
   */
  async extractRelevantContext(query: string): Promise<string> {
    const cleanQuery = query.trim();

    // 1. Try to find a Symbol directly (e.g. "AAPL", "MSFT")
    const symbolMatch = cleanQuery.match(/\b[A-Za-z]{1,5}\b/);
    if (symbolMatch) {
      const potentialSymbol = symbolMatch[0].toUpperCase();
      // Verify if we actually have data for this symbol
      const data = await databaseService.getCompanyOverview(potentialSymbol);
      if (data) {
        return await this.buildCompanyContext(potentialSymbol);
      }
    }

    // 2. Try to find Company Name in Database (e.g. "Apple", "Tesla")
    // We get all cached companies and check if the query contains their name
    const allSymbols = await databaseService.getAllCachedSymbols();
    for (const sym of allSymbols) {
      const overview = await databaseService.getCompanyOverview(sym);
      if (overview && overview.name) {
        // If query contains "Apple" and we have "Apple Inc." in DB
        // We match only the first word to be safe (e.g. "Apple" matches "Apple Inc")
        if (cleanQuery.toLowerCase().includes(overview.name.toLowerCase().split(' ')[0])) {
           console.log(`RAG: Found match for name "${overview.name}" -> Symbol ${sym}`);
           return await this.buildCompanyContext(sym);
        }
      }
    }

    // 3. Comparison Logic
    const compareKeywords = ['compare', 'vs', 'versus', 'difference'];
    if (compareKeywords.some(k => cleanQuery.toLowerCase().includes(k))) {
      // Find all symbols mentioned in the query
      const foundSymbols: string[] = [];
      for (const sym of allSymbols) {
         if (cleanQuery.toUpperCase().includes(sym)) foundSymbols.push(sym);
      }
      if (foundSymbols.length >= 2) {
        return await this.buildComparisonContext(foundSymbols);
      }
    }

    // 4. Fallback for general market queries
    const marketKeywords = ['market', 'overview', 'sector', 'industry', 'general'];
    if (marketKeywords.some(k => cleanQuery.toLowerCase().includes(k))) {
      return await this.buildMarketContext();
    }

    // Default: return general guidance
    return `I can help you analyze financial data. Ask me about:
- Specific companies (e.g., "Analyze Apple" or "AAPL")
- Compare companies (e.g., "compare Apple vs Microsoft")
- Market overview

Note: Make sure to search for companies first to add them to my knowledge base.`;
  }

  /**
   * Format prompt for Llama-3.2
   */
  async formatPromptForLLM(userQuery: string): Promise<string> {
    const context = await this.extractRelevantContext(userQuery);

    return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
    
You are FinAI, a senior investment strategist and expert financial analyst.
Your goal is to provide accurate, data-driven, and concise market insights based STRICTLY on the provided Context Data.

### PRIME DIRECTIVES (ANTI-HALLUCINATION RULES):
1.  **Source of Truth:** The "Context Data" below is your ONLY source of truth. If a fact is not in the context, DO NOT invent it.
2.  **Missing Data:** If the user asks for a metric (e.g., "What is the Dividend?") and it is not in the context, state clearly: "I do not have current dividend data for this company in the local database."
3.  **No External Knowledge:** Do not use your pre-training knowledge to guess stock prices. Old training data is obsolete. Only use the price provided in the context.
4.  **No Speculation:** Do not predict the future price (e.g., "It will go up tomorrow") unless there is a clear trend in the context. Use phrases like "The current trend suggests..." instead of "It will..."
5. **Use Exact Figures:** Always quote exact figures from the context when answering (e.g., "The P/E ratio is 25.4" not "The P/E ratio is around 25").
6. **Admit Uncertainty:** If the context is insufficient to answer confidently, say "The provided data is insufficient to draw a conclusion on that matter."
7. **Stay Relevant:** Only discuss information directly related to the user's query and the provided context.
8. **Tone and Style:** Maintain a professional and analytical tone. Avoid casual language or humor.



### ANALYST BEHAVIOR:
1.  **Explain the "Why":** Don't just list numbers. If P/E is > 30, mention it implies high growth expectations or overvaluation. If P/E is < 15, mention it might be a value stock.
2.  **Contextualize:** If the stock is down (-2%), mention if this is a buying opportunity or a bearish signal based on the technicals provided.
3.  **Professional Tone:** Be confident, professional, but concise. Avoid robotic phrases like "According to the provided text."
4.  **Format:** Use **Bold** for key metrics (e.g., **Price**, **P/E Ratio**) to make it readable on a phone screen.
5. **Summarize:** If the context is long, provide a brief summary of key points before diving into details.
6. **Overall Advice:** If asked for buy/sell advice, provide a balanced view based on fundamentals and recent trends, but always remind the user to do their own research.
7. **Analyze Trends:** If recent price history is provided, comment on short-term trends (e.g., "The stock has risen 5% over the last week, indicating positive momentum.")
8. **Comparisons:** When comparing companies, highlight differences in valuation metrics, recent performance, and sector trends.
9. **Investment Horizon:** Tailor advice based on implied investment horizon (e.g., long-term vs short-term) if mentioned by the user.
### 📉 CONTEXT DATA (LIVE MARKET INFO):
${context}

<|eot_id|><|start_header_id|>user<|end_header_id|>

${userQuery}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
`;
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