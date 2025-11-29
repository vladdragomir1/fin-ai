import { databaseService } from './databaseService';
import { financeApiService } from './financeApiService';

/**
 * RAG (Retrieval Augmented Generation) Service
 * Prepares financial data context for Llama-3.2 local LLM
 * OPTIMIZED FOR: Accuracy, Reduced Hallucinations, and "Smart" Analysis.
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
    // 1. TRIGGER REFRESH (API -> SQLite)
    await this.refreshCompanyData(symbol);

    // 2. READ from SQLite (Now contains fresh data)
    const data = await databaseService.getCompanyDataForRAG(symbol);
    
    if (!data.quote && !data.overview && !data.metrics) {
      return `No data available for ${symbol}. The company has not been searched or cached yet.`;
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
   * Build general market context from all cached data
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
    context += `Negative Movers: ${negativeMovers}\n`;

    return context;
  }

  /**
   * Extract relevant context based on user query
   */
  async extractRelevantContext(query: string): Promise<string> {
    const cleanQuery = query.trim();

    // 1. Symbol Match (e.g. AAPL)
    const symbolMatch = cleanQuery.match(/\b[A-Za-z]{1,5}\b/);
    if (symbolMatch) {
      const potentialSymbol = symbolMatch[0].toUpperCase();
      const data = await databaseService.getCompanyOverview(potentialSymbol);
      if (data) {
        return await this.buildCompanyContext(potentialSymbol);
      }
    }

    // 2. Name Match (e.g. Apple)
    const allSymbols = await databaseService.getAllCachedSymbols();
    for (const sym of allSymbols) {
      const overview = await databaseService.getCompanyOverview(sym);
      if (overview && overview.name) {
        if (cleanQuery.toLowerCase().includes(overview.name.toLowerCase().split(' ')[0])) {
           return await this.buildCompanyContext(sym);
        }
      }
    }

    // 3. Comparison Logic
    const compareKeywords = ['compare', 'vs', 'versus', 'difference'];
    if (compareKeywords.some(k => cleanQuery.toLowerCase().includes(k))) {
      const foundSymbols: string[] = [];
      for (const sym of allSymbols) {
         if (cleanQuery.toUpperCase().includes(sym)) foundSymbols.push(sym);
      }
      if (foundSymbols.length >= 2) {
        return await this.buildComparisonContext(foundSymbols);
      }
    }

    // 4. Market Overview
    const marketKeywords = ['market', 'overview', 'sector', 'industry'];
    if (marketKeywords.some(k => cleanQuery.toLowerCase().includes(k))) {
      return await this.buildMarketContext();
    }

    // Default Fallback
    return `System Message: The user asked "${cleanQuery}", but no specific company data was found in the local cache. Answer generally or ask them to search for a specific ticker symbol first.`;
  }

  /**
   * Format prompt for Llama-3.2
   * "SMART" PROMPT: Designed for accuracy and reasoning over speed.
   */
  async formatPromptForLLM(userQuery: string): Promise<string> {
    const context = await this.extractRelevantContext(userQuery);
    
    // --- FIX: Defined date here ---
    const date = new Date().toISOString().split('T')[0];
    // ------------------------------

    return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are FinAI, a senior investment strategist and expert financial analyst.
Current Date: ${date}

### CORE INSTRUCTIONS (STRICT ADHERENCE REQUIRED):
1.  **Source of Truth:** You must answer using ONLY the "Context Data" provided below. Do not use outside knowledge to hallucinate prices.
2.  **No Guessing:** If the data (e.g., Dividend or P/E) is missing from the Context, state clearly: "I do not have that data."
3.  **Citation:** When mentioning a number, ensure it exists in the Context Data.

### ANALYSIS STEPS:
1.  **Check Data:** Look at the "Context Data" section.
2.  **Analyze:** Identify trends (is the price up or down over the last 5 days?).
3.  **Evaluate:** Look at P/E and Market Cap. Is it a large cap? Is it expensive?
4.  **Synthesize:** Combine these facts into a concise, professional answer.
5.  **Format:** Use Markdown (Bold for numbers, tables for lists).

### CONTEXT DATA:
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