import { databaseService } from './databaseService';
import { financeApiService } from './financeApiService';
import type { ProgressCallback } from './aiService';
import { isMarketOpen, getModuleCacheTTL } from '@/utils/marketHours';

/**
 * RAG (Retrieval Augmented Generation) Service
 * Prepares financial data context for LFM2-1.2B-RAG local LLM
 * OPTIMIZED FOR: Document-based Q&A, Accuracy, and Reduced Hallucinations.
 * LFM2 specializes in answering questions based on provided contextual documents.
 * 
 * SUPPORTED DATA SOURCES (ALL synced with app screens):
 * - Company data (quotes, overview, metrics, historical, 14+ modules)
 * - Market movers (day_gainers, day_losers, most_actives, undervalued_large_caps)
 * - Market news (articles, videos, headlines)
 * - Calendars: Earnings, Dividends, IPOs, Public Offerings, Stock Splits, Economic Events
 * - Technical indicators (SMA, RSI, MACD, ADX)
 * - Financial statements (Income, Balance Sheet, Cash Flow)
 * - Watchlist data (user's tracked companies)
 */

/**
 * Helper: Safely format a number with toFixed
 * Returns formatted string or fallback if value is not a valid number
 */
const safeFixed = (value: any, decimals: number = 2, fallback: string = 'N/A'): string => {
  if (value === null || value === undefined) return fallback;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || isNaN(num)) return fallback;
  return num.toFixed(decimals);
};

/**
 * Helper: Safely format a large number (divide by billion/million)
 */
const safeBillion = (value: any, decimals: number = 2): string => {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || isNaN(num)) return 'N/A';
  return (num / 1e9).toFixed(decimals);
};

const safeMillion = (value: any, decimals: number = 2): string => {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || isNaN(num)) return 'N/A';
  return (num / 1e6).toFixed(decimals);
};

const safePercent = (value: any, decimals: number = 2): string => {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || isNaN(num)) return 'N/A';
  return (num * 100).toFixed(decimals);
};

interface RAGContext {
  companies: string[];
  financialData: any;
  contextText: string;
}

// --- SPEED OPTIMIZATION: Smart Caching (Market-Aware) ---
// Prevents redundant API calls when data was recently fetched
// Aligns with databaseService TTL: shorter during market hours, longer when closed
const lastRefreshTime: { [key: string]: number } = {};  // Tracks when each data type was last refreshed

/**
 * Get cache TTL based on market status
 * - Market Open: 5 minutes (data changes frequently)
 * - Market Closed: 30 minutes (data is static, but allow some refresh)
 */
const getRagCacheTTL = (): number => {
  if (isMarketOpen()) {
    return 5 * 60 * 1000;  // 5 minutes during trading
  }
  return 30 * 60 * 1000;   // 30 minutes when closed (database has 24hr, but RAG can be more flexible)
};

/**
 * Check if data needs refresh (older than market-aware TTL)
 */
const needsRefresh = (cacheKey: string): boolean => {
  const lastRefresh = lastRefreshTime[cacheKey] || 0;
  const age = Date.now() - lastRefresh;
  const ttl = getRagCacheTTL();
  const shouldRefresh = age > ttl;
  if (!shouldRefresh) {
    console.log(`[RAG] ⚡ Cache HIT for ${cacheKey} (${Math.round(age/1000)}s old, TTL: ${ttl/1000}s)`);
  }
  return shouldRefresh;
};

/**
 * Mark data as freshly refreshed
 */
const markRefreshed = (cacheKey: string): void => {
  lastRefreshTime[cacheKey] = Date.now();
};

class RAGService {

  /**
   * Helper: Refresh ALL market-wide data from API before AI analysis.
   * OPTIMIZED: Only refreshes if data is older than CACHE_TTL_MS (5 min)
   * This ensures LFM2 has the same data as the user sees in the app.
   */
  private async refreshMarketData(): Promise<void> {
    // ⚡ SPEED: Skip if recently refreshed
    if (!needsRefresh('market_data')) {
      return;
    }
    
    try {
      console.log(`RAG: Refreshing market-wide data...`);
      
      // Refresh market movers (same as MarketMoversScreen)
      const moversResults = await Promise.allSettled([
        financeApiService.getMarketScreener('day_gainers'),
        financeApiService.getMarketScreener('day_losers'),
        financeApiService.getMarketScreener('most_actives'),
        financeApiService.getMarketScreener('undervalued_large_caps'),
      ]);
      const moversSuccess = moversResults.filter(r => r.status === 'fulfilled').length;
      console.log(`RAG: ✅ Refreshed ${moversSuccess}/4 market mover lists`);
      
      // Refresh market news (same as news displayed in app)
      const newsResults = await Promise.allSettled([
        financeApiService.getMarketNews(),
      ]);
      const newsSuccess = newsResults.filter(r => r.status === 'fulfilled').length;
      console.log(`RAG: ✅ Refreshed ${newsSuccess}/1 news feeds`);
      
      // Refresh calendars (same as StatisticsScreen)
      const calendarResults = await Promise.allSettled([
        financeApiService.getEarningsCalendar(),
        financeApiService.getDividendsCalendar(),
        financeApiService.getIPOCalendar(),
        financeApiService.getPublicOfferingsCalendar(),
        financeApiService.getStockSplitsCalendar(),
        financeApiService.getEconomicEventsCalendar(),
      ]);
      const calendarSuccess = calendarResults.filter(r => r.status === 'fulfilled').length;
      console.log(`RAG: ✅ Refreshed ${calendarSuccess}/6 calendar feeds`);
      
      // ⚡ Mark as refreshed to prevent redundant calls
      markRefreshed('market_data');
      
    } catch (error) {
      console.warn(`RAG: Could not refresh market data (using cached)`, error);
    }
  }

  /**
   * Helper: Trigger a fresh data fetch from API before analyzing.
   * OPTIMIZED: Only refreshes if company data is older than CACHE_TTL_MS (5 min)
   * This updates the SQLite cache so the AI has the latest numbers.
   */
  private async refreshCompanyData(
    symbol: string, 
    onProgress?: (message: string, detail?: string) => void
  ): Promise<void> {
    const cacheKey = `company_${symbol}`;
    
    // ⚡ SPEED: Skip if recently refreshed (saves 20-40 seconds!)
    if (!needsRefresh(cacheKey)) {
      onProgress?.('Using cached data...', `${symbol} (fresh)`);
      return;
    }
    
    try {
      console.log(`RAG: Fetching fresh data for ${symbol}...`);
      onProgress?.('Fetching stock quote...', symbol);
      
      // Phase 1: Core financial data (most important) - ALWAYS fetch these
      const coreResults = await Promise.allSettled([
        financeApiService.getStockQuote(symbol),
        financeApiService.getCompanyOverview(symbol),
        financeApiService.getFinancialMetrics(symbol),
      ]);
      
      // Log success count for debugging
      const coreSuccessCount = coreResults.filter(r => r.status === 'fulfilled').length;
      if (coreSuccessCount > 0) {
        console.log(`RAG: ✅ Refreshed ${coreSuccessCount}/3 core endpoints for ${symbol}`);
      }
      
      // ⚡ SPEED OPTIMIZATION: Only fetch extended modules if core data succeeded
      if (coreSuccessCount >= 2) {
        onProgress?.('Loading financial modules...', `Analysis data`);
        
        // Phase 2: MINIMAL extended modules - only what we actually display in context
        // Fetches 4 key modules (was 9, originally 14) - prioritize speed!
        const extendedResults = await Promise.allSettled([
          financeApiService.getStockModule(symbol, 'financial-data'),      // Profit margins, ROE, target price
          financeApiService.getStockModule(symbol, 'earnings-history'),    // Past earnings
          financeApiService.getStockModule(symbol, 'recommendation-trend'),// Analyst buy/hold/sell
          financeApiService.getStockModule(symbol, 'calendar-events'),     // Next earnings date
          // Skipped for speed (not used in concise context):
          // 'statistics', 'upgrade-downgrade-history', 'income-statement', 
          // 'balance-sheet', 'insider-holders', 'institution-ownership', 
          // 'cashflow-statement', 'sec-filings', 'index-trend', 'net-share-purchase-activity'
        ]);
        
        const extendedSuccessCount = extendedResults.filter(r => r.status === 'fulfilled').length;
        console.log(`RAG: ✅ Refreshed ${extendedSuccessCount}/4 key modules for ${symbol}`);
      }
      
      // ⚡ Mark as refreshed to prevent redundant calls
      markRefreshed(cacheKey);
      onProgress?.('Data ready', symbol);
      
    } catch (error) {
      // If offline, we just log a warning and proceed with existing DB data
      console.warn(`RAG: Could not refresh ${symbol} (using cached data)`, error);
    }
  }

  /**
   * Build context for LLM about a specific company
   * STRATEGY: Provide clean, labeled data to reduce confusion.
   */
  async buildCompanyContext(
    symbol: string,
    onProgress?: (message: string, detail?: string) => void
  ): Promise<string> {
    console.log(`[RAG] Building context for ${symbol}`);
    
    // 1. TRIGGER REFRESH (API -> SQLite)
    await this.refreshCompanyData(symbol, onProgress);

    onProgress?.('Reading from database...', symbol);
    
    // 2. READ from SQLite (Now contains fresh data)
    const data = await databaseService.getCompanyDataForRAG(symbol);
    
    // Log comprehensive data availability (with nested structure awareness)
    console.log(`[RAG] Data retrieved for ${symbol}:`, {
      // Core data
      quote: !!data.quote,
      overview: !!data.overview,
      metrics: !!data.metrics,
      historical: data.historical?.length || 0,
      // Extended modules
      financialData: !!data.financialData,
      statistics: !!data.statistics,
      earnings: data.earnings?.history?.length || (Array.isArray(data.earnings) ? data.earnings.length : 0),
      recommendations: data.recommendations?.trend?.length || (Array.isArray(data.recommendations) ? data.recommendations.length : 0),
      // Insider/Institution data (nested in API response)
      insiders: data.insiders?.holders?.length || (Array.isArray(data.insiders) ? data.insiders.length : 0),
      institutions: data.institutions?.ownershipList?.length || (Array.isArray(data.institutions) ? data.institutions.length : 0),
      // Financial statements
      incomeStatement: data.incomeStatement?.length || 0,
      balanceSheet: data.balanceSheet?.length || 0,
      cashflowStatement: data.cashflowStatement?.length || 0,
      // Additional modules (nested in API response)
      secFilings: data.secFilings?.filings?.length || (Array.isArray(data.secFilings) ? data.secFilings.length : 0),
      upgradeDowngrade: data.upgradeDowngrade?.history?.length || (Array.isArray(data.upgradeDowngrade) ? data.upgradeDowngrade.length : 0),
      calendarEvents: data.calendarEvents?.earnings ? 'has earnings' : (data.calendarEvents ? 'has data' : 0),
      netSharePurchase: !!data.netSharePurchase,
      indexTrend: !!data.indexTrend,
      // Technical indicators
      technicals: !!(data.technicalIndicators?.sma || data.technicalIndicators?.rsi || 
                     data.technicalIndicators?.macd || data.technicalIndicators?.adx),
    });
    
    if (!data.quote && !data.overview && !data.metrics) {
      console.warn(`[RAG] No data found for ${symbol} after refresh attempt`);
      return `### ${symbol}\n\nNo financial data available yet. The data may still be loading or the symbol might be invalid. Try searching for this company in the Browse Stocks screen first.`;
    }

    let context = `### ${symbol}\n`;

    // Company Overview - CONCISE version
    if (data.overview) {
      context += `**${data.overview.name}** | ${data.overview.sector} | ${data.overview.industry}\n`;
      // Skip: exchange, country, website, employees, description (too verbose)
    }

    // Current Quote - CONCISE
    if (data.quote) {
      context += `\n**Price:** $${safeFixed(data.quote.price)} (${data.quote.change >= 0 ? '+' : ''}${safeFixed(data.quote.changePercent)}%)\n`;
    }

    // Key Metrics - CONCISE (only most important)
    if (data.metrics) {
      let metricsLine = '**Metrics:** ';
      const parts = [];
      if (data.metrics.peRatio) parts.push(`P/E ${safeFixed(data.metrics.peRatio)}`);
      if (data.metrics.eps) parts.push(`EPS $${safeFixed(data.metrics.eps)}`);
      if (data.metrics.marketCap) parts.push(`MCap $${safeBillion(data.metrics.marketCap)}B`);
      if (data.metrics.dividendYield) parts.push(`Div ${safeFixed(data.metrics.dividendYield)}%`);
      context += metricsLine + parts.join(' | ') + '\n';
    }

    // SKIP: Recent Price History - not needed for most questions
    // if (data.historical) { ... }

    // Earnings History - CONCISE (only last 2 quarters)
    const earningsList = data.earnings?.history || (Array.isArray(data.earnings) ? data.earnings : null);
    if (earningsList && earningsList.length > 0) {
      context += `**Earnings:** `;
      const parts = earningsList.slice(-2).map((e: any) => {
        // Handle various date formats (some are objects with .fmt, some are strings)
        let dateStr = 'Q?';
        if (e.quarterDisplay?.fmt) dateStr = e.quarterDisplay.fmt;
        else if (typeof e.quarterDisplay === 'string') dateStr = e.quarterDisplay;
        else if (e.quarter?.fmt) dateStr = e.quarter.fmt;
        else if (typeof e.quarter === 'string') dateStr = e.quarter;
        else if (e.fiscalDateEnding) dateStr = e.fiscalDateEnding;
        const eps = e.epsActual?.raw ?? e.epsActual ?? e.actual;
        return `${dateStr}: $${safeFixed(eps)}`;
      });
      context += parts.join(', ') + '\n';
    }

    // Analyst Recommendations - CONCISE (one line)
    const recommendationList = data.recommendations?.trend || (Array.isArray(data.recommendations) ? data.recommendations : null);
    if (recommendationList && recommendationList.length > 0) {
      const latest = recommendationList[0];
      if (latest) {
        const buy = (latest.strongBuy || 0) + (latest.buy || 0);
        const hold = latest.hold || 0;
        const sell = (latest.sell || 0) + (latest.strongSell || 0);
        context += `**Analysts:** ${buy} Buy, ${hold} Hold, ${sell} Sell\n`;
      }
    }

    // SKIP verbose sections for speed - only include if specifically asked
    // Insider Trading, Institutional Ownership, Technical Indicators - skipped

    // Calendar Events - CONCISE (only next earnings date)
    if (data.calendarEvents?.earnings?.earningsDate?.[0]) {
      const earningsDate = data.calendarEvents.earnings.earningsDate[0];
      const dateStr = earningsDate.fmt || (earningsDate.raw ? new Date(earningsDate.raw * 1000).toLocaleDateString() : null);
      if (dateStr) context += `**Next Earnings:** ${dateStr}\n`;
    }

    // Financial Data - CONCISE (key metrics only in one line)
    if (data.financialData) {
      const fd = data.financialData;
      const getValue = (val: any) => val?.raw ?? val;
      const parts = [];
      if (fd.profitMargins) parts.push(`Profit Margin: ${safePercent(getValue(fd.profitMargins))}%`);
      if (fd.returnOnEquity) parts.push(`ROE: ${safePercent(getValue(fd.returnOnEquity))}%`);
      if (fd.targetMeanPrice) parts.push(`Target: $${safeFixed(getValue(fd.targetMeanPrice))}`);
      if (parts.length > 0) context += `**Financials:** ${parts.join(', ')}\n`;
    }

    return context;
  }

  /**
   * Build context for comparing multiple companies
   */
  async buildComparisonContext(
    symbols: string[],
    onProgress?: (message: string, detail?: string) => void
  ): Promise<string> {
    // 1. Refresh all companies in parallel
    onProgress?.('Fetching data for comparison...', symbols.join(', '));
    await Promise.allSettled(symbols.map(s => this.refreshCompanyData(s, onProgress)));

    onProgress?.('Building comparison...', `Analyzing ${symbols.length} companies`);
    let context = `### Comparison of ${symbols.join(', ')}\n\n`;

    for (const symbol of symbols) {
      const data = await databaseService.getCompanyDataForRAG(symbol);
      
      if (!data.quote) {
        context += `${symbol}: No data available\n`;
        continue;
      }

      context += `**${symbol} (${data.overview?.name || 'Unknown'})**\n`;
      context += `Price: $${safeFixed(data.quote.price)}\n`;
      if (data.metrics?.peRatio) context += `P/E Ratio: ${safeFixed(data.metrics.peRatio)}\n`;
      if (data.metrics?.marketCap) context += `Market Cap: $${safeBillion(data.metrics.marketCap)}B\n`;
      context += `\n`;
    }

    return context;
  }

  /**
   * Build a list of all cached companies with names for "browse stocks" queries
   */
  async buildCachedCompaniesContext(): Promise<string> {
    console.log(`[RAG] Building cached companies list context...`);
    
    const symbols = await databaseService.getAllCachedSymbols();
    
    if (symbols.length === 0) {
      return 'No companies have been browsed yet. The Browse Stocks screen loads companies from the market.';
    }

    let context = `### Companies in Knowledge Base (Browse Stocks Data)\n`;
    context += `**Total Companies Cached:** ${symbols.length}\n\n`;
    context += `**Company List (Symbol - Name):**\n`;

    // Get company names for all cached symbols
    const companyList: string[] = [];
    for (const symbol of symbols.slice(0, 50)) { // Limit to 50 to keep context manageable
      const overview = await databaseService.getCompanyOverview(symbol);
      const name = overview?.name || symbol;
      companyList.push(`- ${symbol}: ${name}`);
    }

    context += companyList.join('\n');
    
    if (symbols.length > 50) {
      context += `\n\n...and ${symbols.length - 50} more companies in the database.`;
    }

    context += `\n\n**Note:** These are companies the user has browsed or searched for. I have detailed financial data for all of them.`;

    return context;
  }

  /**
   * Build general market context from all cached data + market movers + news + calendars
   * This provides LFM2 with the SAME data the user sees across all app screens
   */
  async buildMarketContext(): Promise<string> {
    console.log(`[RAG] Building comprehensive market context...`);
    
    // 1. REFRESH market data first (API -> SQLite)
    await this.refreshMarketData();
    
    // 2. Get all cached company symbols
    const symbols = await databaseService.getAllCachedSymbols();
    
    if (symbols.length === 0) {
      return 'No cached market data available. Search for companies first.';
    }

    let context = `### Market Overview\n`;
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

    context += `Total Companies in Knowledge Base: ${symbols.length}\n`;
    context += `Positive Movers: ${positiveMovers}\n`;
    context += `Negative Movers: ${negativeMovers}\n\n`;

    // Add Market Movers data
    const moversData = await this.getMarketMoversData();
    if (moversData) context += moversData + '\n';

    // Add Recent News
    const newsData = await this.getMarketNewsData();
    if (newsData) context += newsData + '\n';

    // Add Market Calendar Data (Dividends, IPOs, Splits, Offerings)
    const calendarData = await this.getMarketCalendarData();
    if (calendarData) context += calendarData + '\n';

    // Add Earnings Calendar
    const earningsData = await this.getEarningsCalendarData();
    if (earningsData) context += earningsData + '\n';

    // Add Economic Events Calendar
    const economicData = await this.getEconomicEventsData();
    if (economicData) context += economicData + '\n';

    return context;
  }

  /**
   * Get Economic Events Calendar (Fed meetings, GDP reports, CPI, etc.)
   */
  private async getEconomicEventsData(): Promise<string> {
    try {
      const events = await databaseService.getMarketData('calendar_economic_events', 60 * 60 * 1000);
      
      if (!events || events.length === 0) return '';

      let context = `**Upcoming Economic Events (${events.length}):**\n`;
      
      // Show top 10 most relevant events
      events.slice(0, 10).forEach((event: any) => {
        const eventName = event.event || event.eventName || event.name;
        const eventDate = event.date || event.eventDate;
        const country = event.country || 'US';
        const impact = event.impact || event.importance || '';
        
        if (eventName) {
          context += `- ${eventName}`;
          if (country) context += ` (${country})`;
          if (eventDate) context += `: ${eventDate}`;
          if (impact) context += ` [${impact}]`;
          context += '\n';
        }
      });

      return context + '\n';
    } catch (error) {
      console.warn('[RAG] Failed to load economic events:', error);
      return '';
    }
  }

  /**
   * Get Market Calendar Data (Dividends, IPOs, Offerings, Splits)
   */
  private async getMarketCalendarData(): Promise<string> {
    try {
      const calendars = await databaseService.getMarketCalendarsForRAG();
      let context = '';

      // Dividends
      if (calendars.dividends && Array.isArray(calendars.dividends) && calendars.dividends.length > 0) {
        context += `**Upcoming Dividends (${calendars.dividends.length} companies):**\n`;
        calendars.dividends.slice(0, 5).forEach((div: any) => {
          if (div.symbol && div.amount) {
            context += `- ${div.symbol}: $${div.amount}`;
            if (div.paymentDate) context += ` (Pay: ${div.paymentDate})`;
            context += `\n`;
          }
        });
        context += '\n';
      }

      // IPOs
      if (calendars.ipos) {
        const upcomingIPOs = calendars.ipos.upcoming || [];
        const pricedIPOs = calendars.ipos.priced || [];
        if (upcomingIPOs.length > 0 || pricedIPOs.length > 0) {
          context += `**IPO Calendar:**\n`;
          if (pricedIPOs.length > 0) {
            context += `Recently Priced: ${pricedIPOs.slice(0, 3).map((ipo: any) => ipo.symbol || ipo.company).join(', ')}\n`;
          }
          if (upcomingIPOs.length > 0) {
            context += `Upcoming: ${upcomingIPOs.slice(0, 3).map((ipo: any) => ipo.symbol || ipo.company).join(', ')}\n`;
          }
          context += '\n';
        }
      }

      // Public Offerings
      if (calendars.offerings) {
        const upcomingOfferings = calendars.offerings.upcoming || [];
        if (upcomingOfferings.length > 0) {
          context += `**Public Offerings (${upcomingOfferings.length} upcoming):**\n`;
          upcomingOfferings.slice(0, 3).forEach((offer: any) => {
            if (offer.symbol) {
              context += `- ${offer.symbol}: ${offer.offeringType || 'Secondary'}\n`;
            }
          });
          context += '\n';
        }
      }

      // Stock Splits
      if (calendars.splits && Array.isArray(calendars.splits) && calendars.splits.length > 0) {
        context += `**Recent Stock Splits (${calendars.splits.length} companies):**\n`;
        calendars.splits.slice(0, 5).forEach((split: any) => {
          if (split.symbol && split.splitRatio) {
            context += `- ${split.symbol}: ${split.splitRatio} split`;
            if (split.date) context += ` (${split.date})`;
            context += `\n`;
          }
        });
        context += '\n';
      }

      return context;
    } catch (error) {
      console.warn('[RAG] Failed to load market calendar data:', error);
      return '';
    }
  }

  /**
   * Helper: Get common companies name-to-symbol mapping
   * Used by smart priority detection to check if query mentions a company
   */
  private getCommonCompaniesMap(): { [key: string]: string } {
    return {
      'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
      'amazon': 'AMZN', 'tesla': 'TSLA', 'meta': 'META', 'facebook': 'META',
      'nvidia': 'NVDA', 'netflix': 'NFLX', 'amd': 'AMD', 'intel': 'INTC',
      'broadcom': 'AVGO', 'qualcomm': 'QCOM', 'salesforce': 'CRM', 'oracle': 'ORCL',
      'adobe': 'ADBE', 'cisco': 'CSCO', 'ibm': 'IBM', 'walmart': 'WMT',
      'costco': 'COST', 'home depot': 'HD', 'target': 'TGT', 'nike': 'NKE',
      'disney': 'DIS', 'starbucks': 'SBUX', 'mcdonalds': 'MCD', 'chevron': 'CVX',
      'exxon': 'XOM', 'jpmorgan': 'JPM', 'goldman': 'GS', 'berkshire': 'BRK-B',
      'visa': 'V', 'mastercard': 'MA', 'palantir': 'PLTR', 'uber': 'UBER',
      'paypal': 'PYPL', 'square': 'SQ', 'block': 'SQ', 'shopify': 'SHOP',
      'spotify': 'SPOT', 'zoom': 'ZM', 'snowflake': 'SNOW', 'crowdstrike': 'CRWD',
      'coinbase': 'COIN', 'robinhood': 'HOOD', 'airbnb': 'ABNB', 'doordash': 'DASH',
      'rivian': 'RIVN', 'lucid': 'LCID', 'nio': 'NIO', 'boeing': 'BA',
      'pfizer': 'PFE', 'moderna': 'MRNA', 'johnson': 'JNJ', 'merck': 'MRK',
      'coca-cola': 'KO', 'coca cola': 'KO', 'pepsi': 'PEP', 'pepsico': 'PEP',
      'procter': 'PG', 'p&g': 'PG', 'at&t': 'T', 'verizon': 'VZ',
      'bank of america': 'BAC', 'wells fargo': 'WFC', 'citigroup': 'C',
      'morgan stanley': 'MS', 'blackrock': 'BLK', 'general electric': 'GE'
    };
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
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): +${safeFixed(stock.regularMarketChangePercent, 2, '0')}%\n`;
        });
        context += '\n';
      }

      if (losers && losers.length > 0) {
        context += `**Top Losers (${losers.length}):**\n`;
        losers.slice(0, 5).forEach((stock: any) => {
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): ${safeFixed(stock.regularMarketChangePercent, 2, '0')}%\n`;
        });
        context += '\n';
      }

      if (mostActive && mostActive.length > 0) {
        context += `**Most Active (${mostActive.length}):**\n`;
        mostActive.slice(0, 5).forEach((stock: any) => {
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): Vol ${safeMillion(stock.regularMarketVolume, 1)}M\n`;
        });
        context += '\n';
      }

      // Add Undervalued Large Caps
      const undervalued = await databaseService.getMarketData('screener_undervalued_large_caps', 60 * 60 * 1000);
      if (undervalued && undervalued.length > 0) {
        context += `**Undervalued Large Caps (${undervalued.length}):**\n`;
        undervalued.slice(0, 5).forEach((stock: any) => {
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): $${safeFixed(stock.regularMarketPrice, 2, '0')}`;
          if (stock.forwardPE) context += ` | Fwd P/E: ${safeFixed(stock.forwardPE)}`;
          context += '\n';
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
   * FIXED: Better symbol detection - prioritize company names, filter common English words
   * IMPROVED: Support for multi-company comparison queries
   * IMPROVED: Check chat history for company context (follow-up questions)
   */
  async extractRelevantContext(
    query: string, 
    chatHistory: string = '',
    onProgress?: ProgressCallback
  ): Promise<string> {
    // Helper to safely report progress to UI
    const reportProgress = (message: string, detail?: string) => {
      if (onProgress) {
        onProgress({ stage: 'fetching', message, detail });
      }
    };
    
    // Helper for buildCompanyContext - passes progress updates through
    const buildContextProgress = (message: string, detail?: string) => {
      reportProgress(message, detail);
    };
    
    const cleanQuery = query.trim();
    const queryLower = cleanQuery.toLowerCase();
    const allSymbols = await databaseService.getAllCachedSymbols();

    console.log(`[RAG] Processing query: "${cleanQuery}"`);
    console.log(`[RAG] Database has ${allSymbols.length} cached symbols:`, allSymbols.slice(0, 10).join(', '));
    if (chatHistory) {
      console.log(`[RAG] Chat history available (${chatHistory.length} chars)`);
    }

    // =========================================================================
    // SMART PRIORITY DETECTION - Route queries to the right data FIRST
    // This runs BEFORE chat history company lookup to avoid wrong context
    // =========================================================================

    // --- PRIORITY 0A: Market Movers (Gainers, Losers, Active, Undervalued) ---
    const marketMoversKeywords = [
      'gainer', 'gainers', 'loser', 'losers', 'active', 'actives', 
      'mover', 'movers', 'winner', 'winners', 'performer', 'performers', 
      'top stocks', 'hot stocks', 'trending stocks', 'best stocks today',
      'worst stocks today', 'biggest gain', 'biggest loss', 'biggest drop',
      'market today', "today's market", "what's hot", "what's up", "what's down",
      'most traded', 'high volume', 'undervalued', 'cheap stocks', 'value stocks'
    ];
    if (marketMoversKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: Market Movers query detected`);
      reportProgress('Loading market movers...');
      const moversData = await this.getMarketMoversData();
      if (moversData) {
        return `### Today's Market Movers\n\n${moversData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0B: Market News ---
    const newsKeywords = [
      'news', 'headline', 'headlines', 'article', 'articles', 'breaking',
      'latest news', 'market news', 'stock news', 'financial news',
      'what happened', "what's happening", 'update', 'updates', 'announcement',
      'press release', 'media', 'report', 'reports', 'story', 'stories'
    ];
    // Exclude company-specific news (e.g., "Tesla news" should go to company context)
    const isGeneralNewsQuery = newsKeywords.some(k => queryLower.includes(k)) && 
      !allSymbols.some(s => queryLower.includes(s.toLowerCase())) &&
      !Object.keys(this.getCommonCompaniesMap()).some(c => queryLower.includes(c));
    if (isGeneralNewsQuery) {
      console.log(`[RAG] 🎯 PRIORITY: General News query detected`);
      reportProgress('Loading market news...');
      const newsData = await this.getMarketNewsData();
      if (newsData) {
        return `### Market News\n\n${newsData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0C: Earnings Calendar ---
    const earningsKeywords = [
      'earnings calendar', 'earnings this week', 'earnings today', 'earnings tomorrow',
      'who reports', 'reporting earnings', 'earnings season', 'quarterly reports',
      'upcoming earnings', 'next earnings', 'earnings schedule', 'earnings dates',
      'when does.*report', 'companies reporting'
    ];
    if (earningsKeywords.some(k => queryLower.includes(k) || new RegExp(k).test(queryLower))) {
      console.log(`[RAG] 🎯 PRIORITY: Earnings Calendar query detected`);
      reportProgress('Loading earnings calendar...');
      const earningsData = await this.getEarningsCalendarData();
      if (earningsData) {
        return `### Earnings Calendar\n\n${earningsData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0D: Dividends Calendar ---
    const dividendKeywords = [
      'dividend calendar', 'dividends this week', 'dividends today', 'upcoming dividends',
      'dividend schedule', 'ex-dividend', 'ex dividend', 'dividend dates', 'dividend payout',
      'who pays dividend', 'dividend stocks', 'high dividend', 'best dividend',
      'dividend yield stocks', 'income stocks', 'dividend aristocrat'
    ];
    if (dividendKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: Dividends Calendar query detected`);
      reportProgress('Loading dividend calendar...');
      const calendarData = await this.getMarketCalendarData();
      if (calendarData) {
        return `### Dividend & Market Calendar\n\n${calendarData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0E: IPO Calendar ---
    const ipoKeywords = [
      'ipo', 'ipos', 'initial public offering', 'going public', 'new listing',
      'upcoming ipo', 'ipo calendar', 'ipo this week', 'ipo schedule',
      'recent ipo', 'new stocks', 'newly listed', 'ipo market', 'hot ipo'
    ];
    if (ipoKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: IPO Calendar query detected`);
      reportProgress('Loading IPO calendar...');
      const calendarData = await this.getMarketCalendarData();
      if (calendarData) {
        return `### IPO & Market Calendar\n\n${calendarData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0F: Stock Splits ---
    const splitKeywords = [
      'stock split', 'stock splits', 'split calendar', 'upcoming split',
      'reverse split', 'split ratio', 'split date', 'who is splitting',
      'recent splits', 'split announcement'
    ];
    if (splitKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: Stock Splits query detected`);
      reportProgress('Loading splits calendar...');
      const calendarData = await this.getMarketCalendarData();
      if (calendarData) {
        return `### Stock Splits & Calendar\n\n${calendarData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0G: Economic Events (Fed, GDP, CPI, Jobs) ---
    const economicKeywords = [
      'fed', 'federal reserve', 'fomc', 'interest rate', 'rate hike', 'rate cut',
      'gdp', 'gross domestic product', 'economic growth', 'recession',
      'cpi', 'inflation', 'consumer price', 'ppi', 'producer price',
      'jobs report', 'unemployment', 'nonfarm', 'payroll', 'jobless claims',
      'economic calendar', 'economic events', 'economic data', 'macro',
      'treasury', 'bond yield', 'yield curve', 'economic outlook',
      'retail sales', 'consumer confidence', 'housing', 'manufacturing'
    ];
    if (economicKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: Economic Events query detected`);
      reportProgress('Loading economic calendar...');
      const economicData = await this.getEconomicEventsData();
      if (economicData) {
        return `### Economic Events & Calendar\n\n${economicData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0H: Public Offerings (Secondary offerings, follow-ons) ---
    const offeringKeywords = [
      'public offering', 'secondary offering', 'follow-on offering', 'stock offering',
      'share offering', 'equity offering', 'shelf offering', 'dilution',
      'raising capital', 'capital raise', 'new shares'
    ];
    if (offeringKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: Public Offerings query detected`);
      reportProgress('Loading offerings calendar...');
      const calendarData = await this.getMarketCalendarData();
      if (calendarData) {
        return `### Public Offerings & Calendar\n\n${calendarData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0I: General Market Overview ---
    const marketOverviewKeywords = [
      'market overview', 'market summary', 'how is the market', "how's the market",
      'market status', 'market performance', 'stock market today', 'wall street',
      'market open', 'market close', 'premarket', 'after hours', 'futures',
      's&p', 'dow jones', 'nasdaq', 'russell', 'market index', 'indices'
    ];
    if (marketOverviewKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: Market Overview query detected`);
      reportProgress('Building market overview...');
      const overviewContext = await this.buildMarketContext();
      if (overviewContext) {
        return `### Market Overview\n\n${overviewContext}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // --- PRIORITY 0J: Technical Analysis (when not company-specific) ---
    const technicalKeywords = [
      'rsi overbought', 'rsi oversold', 'macd signal', 'macd crossover',
      'golden cross', 'death cross', 'technical analysis', 'chart pattern',
      'support level', 'resistance level', 'breakout', 'breakdown',
      'moving average', 'bollinger', 'fibonacci', 'trend line'
    ];
    const isGeneralTechnicalQuery = technicalKeywords.some(k => queryLower.includes(k)) &&
      !allSymbols.some(s => queryLower.includes(s.toLowerCase())) &&
      !Object.keys(this.getCommonCompaniesMap()).some(c => queryLower.includes(c));
    if (isGeneralTechnicalQuery) {
      console.log(`[RAG] 🎯 PRIORITY: General Technical Analysis query detected`);
      reportProgress('Loading market analysis...');
      // For general technical queries, provide market movers + context
      const moversData = await this.getMarketMoversData();
      if (moversData) {
        return `### Market Technical Overview\n\n${moversData}\n\n*For specific technical analysis, please mention a stock symbol or company name.*\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // Common English words that happen to be stock symbols - SKIP these in direct matching
    const commonEnglishWords = new Set([
      'YOU', 'IT', 'AT', 'BE', 'SO', 'DO', 'GO', 'IS', 'AS', 'OR', 'AN', 'AM', 'ON', 'IN', 
      'TO', 'UP', 'BY', 'MY', 'NO', 'IF', 'ALL', 'CAN', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS',
      'MAY', 'NEW', 'NOW', 'OLD', 'OUT', 'OWN', 'SAY', 'SHE', 'THE', 'TOO', 'TWO', 'WAY',
      'WHO', 'BOY', 'DID', 'GET', 'GOT', 'HER', 'LET', 'MAN', 'MEN', 'PUT', 'RAN', 'RUN',
      'SEE', 'TEN', 'TOP', 'TRY', 'USE', 'WAS', 'WIN', 'WON', 'YES', 'YET', 'FOR', 'ARE',
      'BUT', 'NOT', 'ANY', 'OUR', 'DAY', 'HAD', 'ONE', 'BIG', 'CAR', 'GOOD', 'VERY', 'JUST',
      'OVER', 'SUCH', 'MAKE', 'LIKE', 'WELL', 'BACK', 'ONLY', 'COME', 'KNOW', 'TAKE', 'YEAR',
      'WHAT', 'WHEN', 'WILL', 'WITH', 'THEM', 'THEN', 'THAN', 'SOME', 'TELL', 'ABOUT', 'REAL'
    ]);

    // =========================================================================
    // PRIORITY 0: Check chat history for company context (follow-up questions)
    // If the user is asking a follow-up question (e.g., "what's the CEO?", "what about earnings?"),
    // we should use the company from the previous conversation
    // =========================================================================
    
    // Keywords that indicate a company-specific follow-up question
    // These are topics from our API data that only make sense with a specific company
    const companySpecificKeywords = [
      // Leadership & Structure
      'ceo', 'cfo', 'coo', 'cto', 'chief', 'executive', 'officer', 'founder', 'leadership', 'management',
      'board', 'director', 'chairman', 'president',
      // Analyst & Ratings (like Morgan Stanley analyst action)
      'analyst', 'rating', 'upgrade', 'downgrade', 'price target', 'recommendation', 'buy', 'sell', 'hold',
      'overweight', 'underweight', 'outperform', 'underperform', 'neutral',
      // Earnings & Financials
      'earnings', 'revenue', 'profit', 'loss', 'eps', 'income', 'margin', 'guidance', 'forecast',
      'quarterly', 'annual', 'q1', 'q2', 'q3', 'q4', 'fiscal', 'beat', 'miss',
      // Balance Sheet & Cash Flow
      'balance sheet', 'cash flow', 'debt', 'assets', 'liabilities', 'equity', 'cash', 'free cash',
      'working capital', 'current ratio', 'quick ratio',
      // Valuation & Metrics
      'valuation', 'pe ratio', 'p/e', 'pb ratio', 'p/b', 'ps ratio', 'p/s', 'ev/ebitda', 'peg',
      'market cap', 'enterprise value', 'book value', 'intrinsic',
      // Ownership & Insiders
      'insider', 'institution', 'ownership', 'holder', 'shareholder', 'stake', 'bought', 'sold',
      'purchase', 'transaction', 'filing', 'sec', '13f', '10-k', '10-q', '8-k',
      // Dividends & Returns
      'dividend', 'yield', 'payout', 'buyback', 'repurchase', 'return',
      // Stock Performance
      'stock', 'share', 'price', 'chart', 'technical', 'indicator', 'moving average', 'rsi', 'macd',
      'support', 'resistance', 'trend', 'momentum', 'volume', '52 week', '52-week',
      // Company Info
      'sector', 'industry', 'business', 'product', 'service', 'competitor', 'competition',
      'headquarter', 'employee', 'founded', 'history', 'description',
      // Events & Calendar  
      'earnings date', 'ex-dividend', 'split', 'event', 'conference', 'call',
      // Analysis Questions
      'outlook', 'future', 'growth', 'risk', 'opportunity', 'strength', 'weakness',
      'invest', 'portfolio', 'position', 'allocation'
    ];
    
    // Check if current query is asking about company-specific topics
    const isCompanySpecificQuery = companySpecificKeywords.some(kw => queryLower.includes(kw));
    
    // Helper function to check if a symbol/word appears as a standalone word (not inside another word)
    const isStandaloneWord = (text: string, word: string): boolean => {
      // Use word boundary regex to avoid matching "AR" inside "market", "car", etc.
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(text);
    };

    // =========================================================================
    // PRIORITY 1: Check if CURRENT QUERY mentions a company (takes precedence!)
    // This ensures "Tell me about Nvidia" returns NVDA, not a company from history
    // =========================================================================
    // Full S&P 500 company name to symbol mapping (~500 companies)
    const queryCompanyMap: { [key: string]: string } = {
      // === TECHNOLOGY (Information Technology) ===
      'apple': 'AAPL', 'microsoft': 'MSFT', 'nvidia': 'NVDA', 'broadcom': 'AVGO',
      'oracle': 'ORCL', 'salesforce': 'CRM', 'adobe': 'ADBE', 'amd': 'AMD',
      'advanced micro': 'AMD', 'cisco': 'CSCO', 'accenture': 'ACN', 'intuit': 'INTU',
      'ibm': 'IBM', 'texas instruments': 'TXN', 'qualcomm': 'QCOM', 'applied materials': 'AMAT',
      'servicenow': 'NOW', 'intel': 'INTC', 'lam research': 'LRCX', 'analog devices': 'ADI',
      'synopsys': 'SNPS', 'klac': 'KLAC', 'kla': 'KLAC', 'cadence': 'CDNS',
      'autodesk': 'ADSK', 'palo alto': 'PANW', 'palo alto networks': 'PANW',
      'microchip': 'MCHP', 'marvell': 'MRVL', 'fortinet': 'FTNT', 'crowdstrike': 'CRWD',
      'arista': 'ANET', 'arista networks': 'ANET', 'nxp': 'NXPI', 'nxp semiconductors': 'NXPI',
      'motorola': 'MSI', 'motorola solutions': 'MSI', 'te connectivity': 'TEL',
      'amphenol': 'APH', 'keysight': 'KEYS', 'ansys': 'ANSS', 'gartner': 'IT',
      'ptc': 'PTC', 'hewlett packard enterprise': 'HPE', 'hpe': 'HPE',
      'hp': 'HPQ', 'hp inc': 'HPQ', 'western digital': 'WDC', 'seagate': 'STX',
      'netapp': 'NTAP', 'juniper': 'JNPR', 'juniper networks': 'JNPR',
      'ceridian': 'CDAY', 'paycom': 'PAYC', 'tyler': 'TYL', 'tyler technologies': 'TYL',
      'akamai': 'AKAM', 'f5': 'FFIV', 'f5 networks': 'FFIV', 'epam': 'EPAM',
      'teradyne': 'TER', 'trimble': 'TRMB', 'cognizant': 'CTSH',
      'gen digital': 'GEN', 'fair isaac': 'FICO', 'fico': 'FICO',
      
      // === COMMUNICATION SERVICES ===
      'google': 'GOOGL', 'alphabet': 'GOOGL', 'meta': 'META', 'facebook': 'META',
      'netflix': 'NFLX', 'disney': 'DIS', 'walt disney': 'DIS', 'comcast': 'CMCSA',
      'verizon': 'VZ', 't-mobile': 'TMUS', 'at&t': 'T', 'att': 'T',
      'charter': 'CHTR', 'charter communications': 'CHTR', 'activision': 'ATVI',
      'activision blizzard': 'ATVI', 'electronic arts': 'EA', 'ea': 'EA',
      'take-two': 'TTWO', 'take two': 'TTWO', 'warner bros': 'WBD', 'warner brothers': 'WBD',
      'paramount': 'PARA', 'paramount global': 'PARA', 'fox': 'FOXA', 'fox corporation': 'FOXA',
      'live nation': 'LYV', 'omnicom': 'OMC', 'interpublic': 'IPG', 'news corp': 'NWSA',
      'match': 'MTCH', 'match group': 'MTCH', 'pinterest': 'PINS',
      
      // === CONSUMER DISCRETIONARY ===
      'amazon': 'AMZN', 'tesla': 'TSLA', 'home depot': 'HD', 'mcdonalds': 'MCD',
      "mcdonald's": 'MCD', 'nike': 'NKE', 'lowes': 'LOW', "lowe's": 'LOW',
      'booking': 'BKNG', 'booking holdings': 'BKNG', 'starbucks': 'SBUX',
      'tjx': 'TJX', 'tj maxx': 'TJX', 'marshalls': 'TJX', 'target': 'TGT',
      'ross stores': 'ROST', 'ross': 'ROST', 'chipotle': 'CMG', 'chipotle mexican': 'CMG',
      'general motors': 'GM', 'gm': 'GM', 'ford': 'F', 'ford motor': 'F',
      'marriott': 'MAR', 'marriott international': 'MAR', 'hilton': 'HLT',
      'oreilley': 'ORLY', "o'reilly": 'ORLY', 'o reilly': 'ORLY', 'autozone': 'AZO',
      'yum brands': 'YUM', 'yum': 'YUM', 'aptiv': 'APTV', 'ebay': 'EBAY',
      'las vegas sands': 'LVS', 'royal caribbean': 'RCL', 'carnival': 'CCL',
      'norwegian cruise': 'NCLH', 'darden': 'DRI', 'darden restaurants': 'DRI',
      'dominos': 'DPZ', "domino's": 'DPZ', 'wynn': 'WYNN', 'wynn resorts': 'WYNN',
      'mgm': 'MGM', 'mgm resorts': 'MGM', 'caesars': 'CZR', 'caesars entertainment': 'CZR',
      'expedia': 'EXPE', 'etsy': 'ETSY', 'bath body works': 'BBWI',
      'best buy': 'BBY', 'ulta': 'ULTA', 'ulta beauty': 'ULTA', 'garmin': 'GRMN',
      'hasbro': 'HAS', 'pool': 'POOL', 'pool corporation': 'POOL', 'tractor supply': 'TSCO',
      'pulte': 'PHM', 'pultegroup': 'PHM', 'lennar': 'LEN', 'dr horton': 'DHI',
      'd.r. horton': 'DHI', 'nv homes': 'NVR', 'nvr': 'NVR', 'mohawk': 'MHK',
      'whirlpool': 'WHR', 'leggett platt': 'LEG', 'tapestry': 'TPR', 'ralph lauren': 'RL',
      'pvh': 'PVH', 'vf corporation': 'VFC', 'vf corp': 'VFC', 'capri': 'CPRI',
      'nordstrom': 'JWN', 'gap': 'GPS', 'penn entertainment': 'PENN', 'draft kings': 'DKNG',
      
      // === CONSUMER STAPLES ===
      'walmart': 'WMT', 'procter': 'PG', 'procter & gamble': 'PG', 'p&g': 'PG',
      'costco': 'COST', 'coca-cola': 'KO', 'coca cola': 'KO', 'coke': 'KO',
      'pepsi': 'PEP', 'pepsico': 'PEP', 'philip morris': 'PM', 'mondelez': 'MDLZ',
      'altria': 'MO', 'colgate': 'CL', 'colgate palmolive': 'CL', 'general mills': 'GIS',
      'kellogg': 'K', 'kelloggs': 'K', 'kraft heinz': 'KHC', 'kraft': 'KHC', 'heinz': 'KHC',
      'estee lauder': 'EL', 'hershey': 'HSY', 'hersheys': 'HSY', 'sysco': 'SYY',
      'kroger': 'KR', 'walgreens': 'WBA', 'constellation brands': 'STZ',
      'molson coors': 'TAP', 'brown forman': 'BF-B', 'jack daniels': 'BF-B',
      'tyson': 'TSN', 'tyson foods': 'TSN', 'hormel': 'HRL', 'hormel foods': 'HRL',
      'mccormick': 'MKC', 'jm smucker': 'SJM', 'smuckers': 'SJM', 'campbell': 'CPB',
      'campbells': 'CPB', 'kimberly clark': 'KMB', 'church dwight': 'CHD',
      'clorox': 'CLX', 'conagra': 'CAG', 'conagra brands': 'CAG', 'lamb weston': 'LW',
      'archer daniels': 'ADM', 'adm': 'ADM', 'bunge': 'BG',
      
      // === HEALTHCARE ===
      'unitedhealth': 'UNH', 'united health': 'UNH', 'eli lilly': 'LLY', 'lilly': 'LLY',
      'johnson': 'JNJ', 'johnson & johnson': 'JNJ', 'j&j': 'JNJ', 'merck': 'MRK',
      'abbvie': 'ABBV', 'pfizer': 'PFE', 'thermo fisher': 'TMO', 'abbott': 'ABT',
      'abbott labs': 'ABT', 'danaher': 'DHR', 'amgen': 'AMGN', 'bristol-myers': 'BMY',
      'bristol myers': 'BMY', 'bristol myers squibb': 'BMY', 'astrazeneca': 'AZN',
      'intuitive surgical': 'ISRG', 'gilead': 'GILD', 'gilead sciences': 'GILD',
      'regeneron': 'REGN', 'vertex': 'VRTX', 'vertex pharmaceuticals': 'VRTX',
      'boston scientific': 'BSX', 'becton dickinson': 'BDX', 'bd': 'BDX',
      'stryker': 'SYK', 'cigna': 'CI', 'elevance': 'ELV', 'elevance health': 'ELV',
      'anthem': 'ELV', 'centene': 'CNC', 'hca': 'HCA', 'hca healthcare': 'HCA',
      'mckesson': 'MCK', 'cardinal health': 'CAH', 'amerisource': 'ABC',
      'amerisourcebergen': 'ABC', 'cencora': 'COR', 'cvs': 'CVS', 'cvs health': 'CVS',
      'humana': 'HUM', 'molina': 'MOH', 'molina healthcare': 'MOH',
      'zimmer biomet': 'ZBH', 'zimmer': 'ZBH', 'edwards lifesciences': 'EW',
      'idexx': 'IDXX', 'idexx labs': 'IDXX', 'medtronic': 'MDT', 'baxter': 'BAX',
      'biogen': 'BIIB', 'illumina': 'ILMN', 'agilent': 'A', 'agilent technologies': 'A',
      'waters': 'WAT', 'waters corporation': 'WAT', 'mettler toledo': 'MTD',
      'west pharmaceutical': 'WST', 'dexcom': 'DXCM', 'align': 'ALGN', 'align technology': 'ALGN',
      'resmed': 'RMD', 'teleflex': 'TFX', 'steris': 'STE', 'labcorp': 'LH',
      'quest diagnostics': 'DGX', 'quest': 'DGX', 'organon': 'OGN',
      'viatris': 'VTRS', 'catalent': 'CTLT', 'bio-rad': 'BIO', 'bio rad': 'BIO',
      'incyte': 'INCY', 'iqvia': 'IQV', 'charles river': 'CRL',
      'revvity': 'RVTY', 'perkin elmer': 'RVTY',
      
      // === FINANCIALS ===
      'berkshire': 'BRK-B', 'berkshire hathaway': 'BRK-B', 'jpmorgan': 'JPM',
      'jp morgan': 'JPM', 'chase': 'JPM', 'visa': 'V', 'mastercard': 'MA',
      'bank of america': 'BAC', 'bofa': 'BAC', 'wells fargo': 'WFC',
      'morgan stanley': 'MS', 'goldman': 'GS', 'goldman sachs': 'GS',
      'charles schwab': 'SCHW', 'schwab': 'SCHW', 'blackrock': 'BLK',
      'american express': 'AXP', 'amex': 'AXP', 'citigroup': 'C', 'citi': 'C',
      's&p global': 'SPGI', 'sp global': 'SPGI', 'cme group': 'CME', 'cme': 'CME',
      'intercontinental exchange': 'ICE', 'ice': 'ICE', 'progressive': 'PGR',
      'marsh mclennan': 'MMC', 'marsh': 'MMC', 'aon': 'AON', 'pnc': 'PNC',
      'pnc financial': 'PNC', 'u.s. bancorp': 'USB', 'us bancorp': 'USB', 'us bank': 'USB',
      'truist': 'TFC', 'truist financial': 'TFC', 'travelers': 'TRV',
      'metlife': 'MET', 'aflac': 'AFL', 'prudential': 'PRU', 'prudential financial': 'PRU',
      'allstate': 'ALL', 'hartford': 'HIG', 'the hartford': 'HIG',
      'capital one': 'COF', 'discover': 'DFS', 'discover financial': 'DFS',
      'american international': 'AIG', 'aig': 'AIG', 'chubb': 'CB',
      'state street': 'STT', 'northern trust': 'NTRS', 'bny mellon': 'BK',
      'bank of new york': 'BK', 'blackstone': 'BX', 'kkr': 'KKR',
      'apollo': 'APO', 'apollo global': 'APO', 'carlyle': 'CG', 'carlyle group': 'CG',
      't. rowe price': 't rowe price', 'franklin templeton': 'BEN',
      'raymond james': 'RJF', 'lpl financial': 'LPLA', 'nasdaq': 'NDAQ',
      'cboe': 'CBOE', 'msci': 'MSCI', 'moodys': 'MCO', "moody's": 'MCO',
      'markel': 'MKL', 'cincinnati financial': 'CINF', 'globe life': 'GL',
      'w.r. berkley': 'WRB', 'wr berkley': 'WRB', 'everest': 'EG', 'renaissancere': 'RNR',
      'arch capital': 'ACGL', 'principal': 'PFG', 'principal financial': 'PFG',
      'lincoln national': 'LNC', 'unum': 'UNM', 'invesco': 'IVZ',
      'synchrony': 'SYF', 'synchrony financial': 'SYF', 'ally financial': 'ALLY', 'ally': 'ALLY',
      'fifth third': 'FITB', 'fifth third bank': 'FITB', 'regions': 'RF', 'regions financial': 'RF',
      'citizens': 'CFG', 'citizens financial': 'CFG', 'keycorp': 'KEY', 'key bank': 'KEY',
      'huntington': 'HBAN', 'huntington bank': 'HBAN', 'm&t bank': 'MTB', 'm&t': 'MTB',
      'comerica': 'CMA', 'zions': 'ZION', 'zions bancorp': 'ZION',
      'factset': 'FDS', 'ameriprise': 'AMP',
      
      // === INDUSTRIALS ===
      'raytheon': 'RTX', 'rtx': 'RTX', 'caterpillar': 'CAT', 'boeing': 'BA',
      'honeywell': 'HON', 'union pacific': 'UNP', 'ge aerospace': 'GE',
      'general electric': 'GE', 'ge': 'GE', 'lockheed': 'LMT', 'lockheed martin': 'LMT',
      'ups': 'UPS', 'united parcel': 'UPS', 'deere': 'DE', 'john deere': 'DE',
      'eaton': 'ETN', '3m': 'MMM', 'northrop grumman': 'NOC', 'northrop': 'NOC',
      'csx': 'CSX', 'norfolk southern': 'NSC', 'general dynamics': 'GD',
      'illinois tool works': 'ITW', 'itw': 'ITW', 'parker hannifin': 'PH',
      'fedex': 'FDX', 'federal express': 'FDX', 'emerson': 'EMR', 'emerson electric': 'EMR',
      'waste management': 'WM', 'republic services': 'RSG', 'johnson controls': 'JCI',
      'paccar': 'PCAR', 'cummins': 'CMI', 'rockwell': 'ROK', 'rockwell automation': 'ROK',
      'otis': 'OTIS', 'otis elevator': 'OTIS', 'carrier': 'CARR', 'carrier global': 'CARR',
      'trane': 'TT', 'trane technologies': 'TT', 'dover': 'DOV',
      'stanley black decker': 'SWK', 'stanley': 'SWK', 'snap-on': 'SNA', 'snap on': 'SNA',
      'xylem': 'XYL', 'fortive': 'FTV', 'ametek': 'AME', 'idex': 'IEX',
      'graco': 'GGG', 'nordson': 'NDSN', 'lincoln electric': 'LECO',
      'flowserve': 'FLS', 'pentair': 'PNR', 'hubbell': 'HUBB',
      'ww grainger': 'GWW', 'grainger': 'GWW', 'fastenal': 'FAST',
      'cintas': 'CTAS', 'copart': 'CPRT', 'verisign': 'VRSN', 'rollins': 'ROL',
      'expeditors': 'EXPD', 'ch robinson': 'CHRW', 'jb hunt': 'JBHT',
      'old dominion': 'ODFL', 'old dominion freight': 'ODFL', 'transdigm': 'TDG',
      'howmet': 'HWM', 'howmet aerospace': 'HWM', 'textron': 'TXT',
      'l3harris': 'LHX', 'l3 harris': 'LHX', 'leidos': 'LDOS',
      'generac': 'GNRC', 'ingersoll rand': 'IR', 'westinghouse': 'WAB',
      'wabtec': 'WAB', 'southwest airlines': 'LUV', 'southwest': 'LUV',
      'delta': 'DAL', 'delta airlines': 'DAL', 'united airlines': 'UAL',
      'american airlines': 'AAL', 'alaska air': 'ALK',
      
      // === ENERGY ===
      'exxon': 'XOM', 'exxon mobil': 'XOM', 'exxonmobil': 'XOM', 'chevron': 'CVX',
      'conocophillips': 'COP', 'conoco phillips': 'COP', 'conoco': 'COP',
      'eog': 'EOG', 'eog resources': 'EOG', 'schlumberger': 'SLB', 'slb': 'SLB',
      'pioneer': 'PXD', 'pioneer natural': 'PXD', 'marathon petroleum': 'MPC',
      'phillips 66': 'PSX', 'valero': 'VLO', 'valero energy': 'VLO',
      'occidental': 'OXY', 'occidental petroleum': 'OXY', 'hess': 'HES',
      'williams': 'WMB', 'williams companies': 'WMB', 'kinder morgan': 'KMI',
      'oneok': 'OKE', 'devon': 'DVN', 'devon energy': 'DVN',
      'diamondback': 'FANG', 'diamondback energy': 'FANG', 'coterra': 'CTRA',
      'coterra energy': 'CTRA', 'marathon oil': 'MRO', 'apa': 'APA', 'apache': 'APA',
      'baker hughes': 'BKR', 'halliburton': 'HAL', 'targa': 'TRGP', 'targa resources': 'TRGP',
      
      // === UTILITIES ===
      'nextera': 'NEE', 'nextera energy': 'NEE', 'fpl': 'NEE',
      'duke energy': 'DUK', 'duke': 'DUK', 'southern company': 'SO', 'southern': 'SO',
      'dominion': 'D', 'dominion energy': 'D', 'american electric': 'AEP', 'aep': 'AEP',
      'exelon': 'EXC', 'sempra': 'SRE', 'sempra energy': 'SRE',
      'xcel': 'XEL', 'xcel energy': 'XEL', 'public service': 'PEG',
      'pseg': 'PEG', 'consolidated edison': 'ED', 'con edison': 'ED', 'con ed': 'ED',
      'wec energy': 'WEC', 'wec': 'WEC', 'eversource': 'ES', 'eversource energy': 'ES',
      'entergy': 'ETR', 'dte energy': 'DTE', 'dte': 'DTE', 'centerpoint': 'CNP',
      'centerpoint energy': 'CNP', 'ameren': 'AEE', 'cms energy': 'CMS', 'cms': 'CMS',
      'atmos energy': 'ATO', 'atmos': 'ATO', 'firstenergy': 'FE', 'first energy': 'FE',
      'edison international': 'EIX', 'ppl': 'PPL', 'ppl corporation': 'PPL',
      'alliant energy': 'LNT', 'evergy': 'EVRG', 'nrg': 'NRG', 'nrg energy': 'NRG',
      'aes': 'AES', 'aes corporation': 'AES', 'pinnacle west': 'PNW',
      'american water': 'AWK', 'american water works': 'AWK',
      
      // === MATERIALS ===
      'linde': 'LIN', 'sherwin williams': 'SHW', 'sherwin-williams': 'SHW',
      'air products': 'APD', 'freeport': 'FCX', 'freeport mcmoran': 'FCX',
      'newmont': 'NEM', 'newmont mining': 'NEM', 'nucor': 'NUE',
      'ecolab': 'ECL', 'dow': 'DOW', 'dow chemical': 'DOW', 'dupont': 'DD',
      'corteva': 'CTVA', 'ppg': 'PPG', 'ppg industries': 'PPG',
      'martin marietta': 'MLM', 'vulcan': 'VMC', 'vulcan materials': 'VMC',
      'ball': 'BALL', 'ball corporation': 'BALL', 'packaging corp': 'PKG',
      'international paper': 'IP', 'westrock': 'WRK', 'avery dennison': 'AVY',
      'celanese': 'CE', 'eastman': 'EMN', 'eastman chemical': 'EMN',
      'cf industries': 'CF', 'mosaic': 'MOS', 'mosaic company': 'MOS',
      'fmc': 'FMC', 'fmc corporation': 'FMC', 'albemarle': 'ALB',
      'international flavors': 'IFF', 'iff': 'IFF', 'steel dynamics': 'STLD',
      'cleveland cliffs': 'CLF', 'cliffs': 'CLF',
      
      // === REAL ESTATE ===
      'prologis': 'PLD', 'american tower': 'AMT', 'equinix': 'EQIX',
      'crown castle': 'CCI', 'public storage': 'PSA', 'realty income': 'O',
      'digital realty': 'DLR', 'simon property': 'SPG', 'simon': 'SPG',
      'welltower': 'WELL', 'cbre': 'CBRE', 'cbre group': 'CBRE',
      'ventas': 'VTR', 'avalonbay': 'AVB', 'equity residential': 'EQR',
      'alexandria': 'ARE', 'alexandria real estate': 'ARE', 'healthpeak': 'PEAK',
      'extra space': 'EXR', 'extra space storage': 'EXR', 'kimco': 'KIM', 'kimco realty': 'KIM',
      'mid-america': 'MAA', 'mid america': 'MAA', 'essex': 'ESS', 'essex property': 'ESS',
      'iron mountain': 'IRM', 'udr': 'UDR', 'camden': 'CPT', 'camden property': 'CPT',
      'regency centers': 'REG', 'federal realty': 'FRT', 'host hotels': 'HST',
      'vornado': 'VNO', 'vornado realty': 'VNO', 'boston properties': 'BXP',
      'sl green': 'SLG', 'duke realty': 'DRE',
      
      // === POPULAR NON-S&P 500 (User Requests) ===
      'palantir': 'PLTR', 'uber': 'UBER', 'lyft': 'LYFT', 'square': 'SQ', 'block': 'SQ',
      'shopify': 'SHOP', 'spotify': 'SPOT', 'zoom': 'ZM', 'snowflake': 'SNOW',
      'datadog': 'DDOG', 'mongodb': 'MDB', 'twilio': 'TWLO', 'okta': 'OKTA',
      'coinbase': 'COIN', 'robinhood': 'HOOD', 'doordash': 'DASH',
      'rivian': 'RIVN', 'lucid': 'LCID', 'nio': 'NIO', 'xpeng': 'XPEV', 'li auto': 'LI',
      'baba': 'BABA', 'alibaba': 'BABA', 'bidu': 'BIDU', 'baidu': 'BIDU',
      'jd': 'JD', 'jd.com': 'JD', 'pinduoduo': 'PDD', 'pdd': 'PDD',
      'tencent': 'TCEHY', 'temu': 'PDD', 'bytedance': 'BDNCE', 'tiktok': 'BDNCE',
      'samsung': 'SSNLF', 'sony': 'SONY', 'nintendo': 'NTDOY', 'arm': 'ARM',
      'asml': 'ASML', 'tsmc': 'TSM', 'taiwan semi': 'TSM'
    };

    // Check if current query mentions a company name
    for (const [companyName, symbol] of Object.entries(queryCompanyMap)) {
      if (isStandaloneWord(queryLower, companyName) && allSymbols.includes(symbol)) {
        console.log(`[RAG] 🎯 PRIORITY: Found "${companyName}" (${symbol}) in CURRENT QUERY`);
        reportProgress('Looking up ' + companyName + '...', symbol);
        return await this.buildCompanyContext(symbol, buildContextProgress);
      }
    }

    // Also check for direct symbol mentions in query (e.g., "NVDA", "TSLA")
    for (const sym of allSymbols) {
      if (sym.length >= 2 && isStandaloneWord(cleanQuery.toUpperCase(), sym) && !commonEnglishWords.has(sym)) {
        console.log(`[RAG] 🎯 PRIORITY: Found symbol ${sym} in CURRENT QUERY`);
        reportProgress('Looking up ' + sym + '...');
        return await this.buildCompanyContext(sym, buildContextProgress);
      }
    }

    // =========================================================================
    // PRIORITY 2: Chat history for FOLLOW-UP questions only
    // Only used when current query doesn't mention a specific company
    // =========================================================================
    if (chatHistory && chatHistory.trim()) {
      const historyLower = chatHistory.toLowerCase();
      
      // If query is about company-specific topics, prioritize finding company from history
      if (isCompanySpecificQuery) {
        console.log(`[RAG] Query contains company-specific keywords - checking chat history for context`);
      }
      
      // PRIORITY: Check for company names FIRST (more reliable than short symbols)
      // This prevents "AR" matching inside "market" before "Tesla" is found
      // Use same comprehensive S&P 500 map for chat history detection
      const historyCompanyMap = queryCompanyMap;
      
      // Check company names first (more reliable than short symbols)
      for (const [companyName, symbol] of Object.entries(historyCompanyMap)) {
        if (isStandaloneWord(historyLower, companyName) && allSymbols.includes(symbol)) {
          console.log(`[RAG] Found company "${companyName}" (${symbol}) in chat history - using for context`);
          reportProgress('Found ' + companyName + ' in conversation', symbol);
          return await this.buildCompanyContext(symbol, buildContextProgress);
        }
      }
      
      // Then check for direct symbol mentions in history (e.g., "about TSLA", "analyzed AAPL")
      // Use word boundary matching to avoid "AR" matching inside "market", "car", etc.
      // Also skip very short symbols (1-2 chars) as they're prone to false positives
      for (const sym of allSymbols) {
        // Skip short symbols in history matching (too many false positives)
        if (sym.length <= 2) continue;
        
        if (isStandaloneWord(historyLower, sym)) {
          console.log(`[RAG] Found symbol ${sym} in chat history - using for context`);
          reportProgress('Found ' + sym + ' in conversation');
          return await this.buildCompanyContext(sym, buildContextProgress);
        }
      }
      
      // If query is company-specific but no company found in history, 
      // try to find ANY company that was discussed (from database names)
      if (isCompanySpecificQuery) {
        for (const sym of allSymbols) {
          const overview = await databaseService.getCompanyOverview(sym);
          if (overview && overview.name) {
            const nameLower = overview.name.toLowerCase();
            // Check if company name appears in history (using word boundary for multi-word names)
            if (isStandaloneWord(historyLower, nameLower) || 
                nameLower.split(/[\s,]+/).some(word => word.length >= 5 && isStandaloneWord(historyLower, word))) {
              console.log(`[RAG] Found company "${overview.name}" (${sym}) in chat history via DB lookup`);
              reportProgress('Found ' + overview.name + ' in conversation', sym);
              return await this.buildCompanyContext(sym, buildContextProgress);
            }
          }
        }
      }
    }

    // 1. Company Name Match FIRST (e.g., "Apple", "Microsoft", "Tesla", "Amazon", "Nvidia")
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
      'amd': 'AMD',
      'intel': 'INTC',
      'broadcom': 'AVGO',
      'qualcomm': 'QCOM',
      'adobe': 'ADBE',
      'salesforce': 'CRM',
      'oracle': 'ORCL',
      'ibm': 'IBM',
      'cisco': 'CSCO',
      'paypal': 'PYPL',
      'uber': 'UBER',
      'airbnb': 'ABNB',
      'spotify': 'SPOT',
      'snap': 'SNAP',
      'twitter': 'X',
      'disney': 'DIS',
      'walmart': 'WMT',
      'costco': 'COST',
      'target': 'TGT',
      'nike': 'NKE',
      'starbucks': 'SBUX',
      'mcdonalds': 'MCD',
      "mcdonald's": 'MCD',
      'coca-cola': 'KO',
      'cocacola': 'KO',
      'coke': 'KO',
      'pepsi': 'PEP',
      'pepsico': 'PEP',
      'boeing': 'BA',
      'ford': 'F',
      'gm': 'GM',
      'general motors': 'GM',
      'chevron': 'CVX',
      'exxon': 'XOM',
      'exxonmobil': 'XOM',
      'jpmorgan': 'JPM',
      'jp morgan': 'JPM',
      'goldman': 'GS',
      'goldman sachs': 'GS',
      'berkshire': 'BRK-B',
      'visa': 'V',
      'mastercard': 'MA',
      'american express': 'AXP',
      'amex': 'AXP',
      // Canadian Banks
      'royal bank': 'RY',
      'royal bank of canada': 'RY',
      'rbc': 'RY',
      'td bank': 'TD',
      'toronto-dominion': 'TD',
      'toronto dominion': 'TD',
      'bank of montreal': 'BMO',
      'bmo': 'BMO',
      'scotiabank': 'BNS',
      'bank of nova scotia': 'BNS',
      'cibc': 'CM',
      'canadian imperial': 'CM',
      // More US banks
      'bank of america': 'BAC',
      'bofa': 'BAC',
      'wells fargo': 'WFC',
      'citigroup': 'C',
      'citi': 'C',
      'morgan stanley': 'MS',
      // Healthcare
      'johnson & johnson': 'JNJ',
      'johnson and johnson': 'JNJ',
      'pfizer': 'PFE',
      'moderna': 'MRNA',
      'unitedhealth': 'UNH',
      'eli lilly': 'LLY',
      'lilly': 'LLY',
      'abbvie': 'ABBV',
      'merck': 'MRK',
      // Other major companies
      'home depot': 'HD',
      'lowes': 'LOW',
      "lowe's": 'LOW',
      'procter': 'PG',
      'procter & gamble': 'PG',
      'johnson controls': 'JCI',
      'caterpillar': 'CAT',
      'deere': 'DE',
      'john deere': 'DE',
      '3m': 'MMM',
      'honeywell': 'HON',
      'lockheed': 'LMT',
      'lockheed martin': 'LMT',
      'raytheon': 'RTX',
      'general electric': 'GE',
      'ge': 'GE',
    };

    // =========================================================================
    // NEW: Detect ALL mentioned companies FIRST (for comparison queries)
    // =========================================================================
    const mentionedSymbols: Set<string> = new Set();
    
    // Check common company names
    for (const [companyName, symbol] of Object.entries(commonCompanies)) {
      if (queryLower.includes(companyName) && allSymbols.includes(symbol)) {
        mentionedSymbols.add(symbol);
      }
    }
    
    // Also check direct symbol mentions (e.g., "AAPL vs MSFT")
    const words = cleanQuery.toUpperCase().split(/[\s,]+/);
    for (const word of words) {
      if (word.length >= 2 && word.length <= 5 && 
          allSymbols.includes(word) && 
          !commonEnglishWords.has(word)) {
        mentionedSymbols.add(word);
      }
    }
    
    // Detect comparison keywords
    const comparisonKeywords = ['compare', 'versus', ' vs ', ' vs.', 'between', 'better', 'which one', 'difference', 'invest'];
    const isComparisonQuery = comparisonKeywords.some(k => queryLower.includes(k));
    
    // If multiple companies found - build combined context
    if (mentionedSymbols.size >= 2) {
      const symbolsArray = Array.from(mentionedSymbols);
      console.log(`[RAG] Multi-company query detected: ${symbolsArray.join(', ')}`);
      reportProgress('Comparing ' + symbolsArray.join(' vs ') + '...');
      
      // Build combined context for comparison (limit to 3 companies max for context size)
      const contexts: string[] = [];
      for (const sym of symbolsArray.slice(0, 3)) {
        console.log(`[RAG] Building context for comparison: ${sym}`);
        const context = await this.buildCompanyContext(sym, buildContextProgress);
        contexts.push(context);
      }
      
      const combinedContext = contexts.join('\n\n---\n\n');
      console.log(`[RAG] Built comparison context for ${symbolsArray.length} companies`);
      return `${combinedContext}\n\n---\n\n**Comparison Request:** The user wants to compare ${symbolsArray.join(' vs ')}. Analyze the financial data above to provide a comprehensive comparison.`;
    }
    
    // Single company found - return its context
    if (mentionedSymbols.size === 1) {
      const symbol = Array.from(mentionedSymbols)[0];
      console.log(`[RAG] Found single company match: ${symbol}`);
      reportProgress('Looking up ' + symbol + '...');
      return await this.buildCompanyContext(symbol, buildContextProgress);
    }
    
    // No companies found from common names - continue with fallback methods
    
    // 3. Check company overview (includes full name) for other companies
    // IMPROVED: First check full company names, then partial word matches
    for (const sym of allSymbols) {
      const overview = await databaseService.getCompanyOverview(sym);
      if (overview && overview.name) {
        const nameLower = overview.name.toLowerCase();
        
        // First: Check if full company name is in query (e.g., "Royal Bank of Canada")
        if (queryLower.includes(nameLower)) {
          console.log(`[RAG] Found EXACT company name match: ${overview.name} (${sym})`);
          reportProgress('Found ' + overview.name, sym);
          return await this.buildCompanyContext(sym, buildContextProgress);
        }
        
        // Second: Check if query is in company name (e.g., "Royal Bank" matches "Royal Bank of Canada")
        // Remove common suffixes for better matching
        const queryClean = queryLower
          .replace(/\b(inc\.?|corp\.?|corporation|company|ltd\.?|limited|plc)\b/gi, '')
          .trim();
        const nameClean = nameLower
          .replace(/\b(inc\.?|corp\.?|corporation|company|ltd\.?|limited|plc|common stock)\b/gi, '')
          .trim();
        
        // Check if significant parts of query match company name
        if (queryClean.length >= 6 && nameClean.includes(queryClean)) {
          console.log(`[RAG] Found partial company name match: ${overview.name} (${sym})`);
          reportProgress('Found ' + overview.name, sym);
          return await this.buildCompanyContext(sym, buildContextProgress);
        }
        
        // Third: Check individual significant words (original logic)
        const companyWords = overview.name.toLowerCase().split(/[\s,]+/);
        for (const companyWord of companyWords) {
          // Match significant words (4+ chars to avoid false positives)
          if (companyWord.length >= 4 && queryLower.includes(companyWord)) {
            console.log(`[RAG] Found company word match: ${overview.name} (${sym})`);
            reportProgress('Found ' + overview.name, sym);
            return await this.buildCompanyContext(sym, buildContextProgress);
          }
        }
      }
    }

    // 4. Calendar/Market queries - check BEFORE comparison to avoid false matches
    // IPO/Splits/Dividends queries
    const calendarKeywords = ['ipo', 'ipos', 'split', 'splits', 'dividend', 'dividends', 'offering', 'offerings'];
    if (calendarKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected calendar/IPO/splits query`);
      const calendarData = await this.getMarketCalendarData();
      if (calendarData) {
        return `### Market Calendar & Events\n\n${calendarData}\n\nThe user asked: "${cleanQuery}"`;
      }
    }

    // 5-7. (MOVED TO SMART PRIORITY DETECTION at start of function)
    // News, Earnings, Market Movers are now detected BEFORE chat history lookup

    // 8. Multiple symbols mentioned - Comparison (only match WHOLE words, not substrings)
    // Use word boundary regex to avoid matching "perForming" as F, "stocK" as K, etc.
    const foundSymbols = allSymbols.filter(sym => {
      if (commonEnglishWords.has(sym)) return false;
      // For single-char symbols, require exact word match
      // For multi-char symbols, check word boundaries
      const wordBoundaryRegex = new RegExp(`\\b${sym}\\b`, 'i');
      return wordBoundaryRegex.test(cleanQuery.toUpperCase());
    });
    if (foundSymbols.length >= 2) {
      console.log(`[RAG] Found comparison request: ${foundSymbols.join(', ')}`);
      reportProgress('Comparing ' + foundSymbols.join(' vs ') + '...');
      return await this.buildComparisonContext(foundSymbols, buildContextProgress);
    }

    // 9. Watchlist queries - special handling
    const watchlistKeywords = ['watchlist', 'portfolio', 'my stocks', 'my companies'];
    if (watchlistKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected watchlist query`);
      reportProgress('Loading your watchlist...');
      return await this.buildMarketContext();
    }

    // 10. Browse Stocks / Company List queries - show cached company names
    const browseKeywords = ['browse', 'list', 'companies', 'stocks screen', 'what companies', 'which companies', 'company names', 'stock names', 'all stocks', 'available stocks', 'see the names', 'their names'];
    if (browseKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected browse stocks / company list query`);
      reportProgress('Loading company list...');
      return await this.buildCachedCompaniesContext();
    }

    // 11. Market Overview Keywords
    const marketKeywords = ['market', 'overview', 'sector', 'industry', 'trends', 'summary'];
    if (marketKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Building comprehensive market overview context`);
      reportProgress('Building market overview...');
      return await this.buildMarketContext();
    }

    // 12. General questions with available data
    if (allSymbols.length > 0) {
      console.log(`[RAG] No specific match, showing available companies`);
      reportProgress('Searching knowledge base...');
      // Include company names list for better context
      const companiesList = await this.buildCachedCompaniesContext();
      return `${companiesList}\n\nThe user asked: "${cleanQuery}"`;
    }

    // 12. No data available
    console.log(`[RAG] No cached data available`);
    return `**System Status:** The knowledge base is currently empty. No companies have been searched yet.\n\n**To get started:**\n1. Search for a company (e.g., AAPL, MSFT, TSLA)\n2. Browse stocks in the app\n3. Add companies to your watchlist\n4. Check Market Movers or Statistics screens\n\nThen I'll be able to provide detailed financial analysis!\n\nUser asked: "${cleanQuery}"`;
  }

  /**
   * Format prompt for LFM2-1.2B-RAG
   * Uses ChatML format optimized for document-based question answering
   * @param userQuery - Current user question
   * @param chatHistory - Formatted conversation history (optional)
   * @param onProgress - Callback for live progress updates (optional)
   */
  async formatPromptForLLM(
    userQuery: string, 
    chatHistory: string = '',
    onProgress?: ProgressCallback
  ): Promise<string> {
    // Helper to safely report progress
    const reportProgress = (stage: 'searching' | 'fetching' | 'building', message: string, detail?: string) => {
      if (onProgress) {
        onProgress({ stage, message, detail });
      }
    };
    
    reportProgress('searching', 'Searching knowledge base...');
    
    // Pass chat history to context extraction for follow-up questions
    const context = await this.extractRelevantContext(userQuery, chatHistory, onProgress);
    
    reportProgress('building', 'Preparing analysis...');
    
    const date = new Date().toISOString().split('T')[0];

    // Build the user message with clear sections
    let userMessage = '';
    
    // 1. Chat History FIRST (if exists) - provides conversation context
    if (chatHistory && chatHistory.trim()) {
      userMessage += `${chatHistory}\n---\n\n`;
    }
    
    // 2. Financial Data Context
    userMessage += `**Financial Data Context:**\n${context}\n\n---\n\n`;
    
    // 3. Current Question (with reminder about history if applicable)
    if (chatHistory && chatHistory.trim()) {
      userMessage += `**Current Question** (continuing the conversation above): ${userQuery}`;
    } else {
      userMessage += `**Question:** ${userQuery}`;
    }

    // ChatML format for LFM2-1.2B-RAG (optimized for document-based Q&A)
    // System prompt explains the context structure
    const prompt = `<|startoftext|><|im_start|>system
You are a friendly financial assistant.

RULES:
- Talk naturally like a helpful friend
- NEVER start with labels like "Answer:" or "Response:"
- NEVER end with signatures, dates, or sign-offs
- Just answer directly in 2-4 casual sentences
- Use **bold** for 1-2 key numbers only
- Don't repeat data the user can already see<|im_end|>
<|im_start|>user
${userMessage}<|im_end|>
<|im_start|>assistant
`;

    console.log('[RAG] Prompt length:', prompt.length, 'chars (~', Math.ceil(prompt.length / 4), 'tokens)');
    console.log('[RAG] Context preview:', context.substring(0, 200) + '...');
    
    
    return prompt;
  }

  /**
   * Debug: Get cache statistics - shows ALL data sources available to LFM2
   */
  async getCacheStats(): Promise<any> {
    const symbols = await databaseService.getAllCachedSymbols();
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const [
      gainers, losers, mostActive, undervalued,
      news, earnings, dividends, ipos, splits, economicEvents, offerings
    ] = await Promise.all([
      // Market Movers (4 lists)
      databaseService.getMarketData('screener_day_gainers', Infinity),
      databaseService.getMarketData('screener_day_losers', Infinity),
      databaseService.getMarketData('screener_most_actives', Infinity),
      databaseService.getMarketData('screener_undervalued_large_caps', Infinity),
      // News
      databaseService.getMarketData('news_v2_ALL_ALL', Infinity),
      // Calendars (6 types)
      databaseService.getMarketData('calendar_earnings', Infinity),
      databaseService.getMarketData(`calendar_dividends_${today}`, Infinity),
      databaseService.getMarketData(`calendar_ipo_${currentMonth}`, Infinity),
      databaseService.getMarketData('calendar_splits', Infinity),
      databaseService.getMarketData('calendar_economic_events', Infinity),
      databaseService.getMarketData(`calendar_offerings_${currentMonth}`, Infinity),
    ]);

    return {
      // Company data
      companies: symbols.length,
      companySymbols: symbols.slice(0, 20),
      // Market Movers
      gainers: gainers?.length || 0,
      losers: losers?.length || 0,
      mostActive: mostActive?.length || 0,
      undervalued: undervalued?.length || 0,
      // News
      news: news?.length || 0,
      // Calendars
      earnings: earnings?.length || 0,
      dividends: dividends?.length || 0,
      ipos: (ipos?.upcoming?.length || 0) + (ipos?.priced?.length || 0),
      splits: splits?.length || 0,
      economicEvents: economicEvents?.length || 0,
      offerings: (offerings?.upcoming?.length || 0) + (offerings?.priced?.length || 0),
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