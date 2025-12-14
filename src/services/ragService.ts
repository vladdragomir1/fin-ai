import { databaseService } from './databaseService';
import { financeApiService } from './financeApiService';

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

interface RAGContext {
  companies: string[];
  financialData: any;
  contextText: string;
}

class RAGService {

  /**
   * Helper: Refresh ALL market-wide data from API before AI analysis.
   * This ensures LFM2 has the same data as the user sees in the app.
   */
  private async refreshMarketData(): Promise<void> {
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
      
    } catch (error) {
      console.warn(`RAG: Could not refresh market data (using cached)`, error);
    }
  }

  /**
   * Helper: Trigger a fresh data fetch from API before analyzing.
   * This updates the SQLite cache so the AI has the latest numbers.
   */
  private async refreshCompanyData(symbol: string): Promise<void> {
    try {
      console.log(`RAG: Checking for fresh data for ${symbol}...`);
      
      // Phase 1: Core financial data (most important)
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
      
      // Phase 2: Extended modules (same as CompanyDetailsScreen)
      // These are fetched in background to populate the cache for comprehensive AI context
      const extendedResults = await Promise.allSettled([
        financeApiService.getStockModule(symbol, 'financial-data'),
        financeApiService.getStockModule(symbol, 'statistics'),
        financeApiService.getStockModule(symbol, 'earnings-history'),
        financeApiService.getStockModule(symbol, 'recommendation-trend'),
        financeApiService.getStockModule(symbol, 'insider-holders'),
        financeApiService.getStockModule(symbol, 'institution-ownership'),
        financeApiService.getStockModule(symbol, 'income-statement'),
        financeApiService.getStockModule(symbol, 'balance-sheet'),
        financeApiService.getStockModule(symbol, 'cashflow-statement'),
        financeApiService.getStockModule(symbol, 'upgrade-downgrade-history'),
        financeApiService.getStockModule(symbol, 'sec-filings'),
        financeApiService.getStockModule(symbol, 'calendar-events'),
        financeApiService.getStockModule(symbol, 'index-trend'),
        financeApiService.getStockModule(symbol, 'net-share-purchase-activity'),
      ]);
      
      const extendedSuccessCount = extendedResults.filter(r => r.status === 'fulfilled').length;
      console.log(`RAG: ✅ Refreshed ${extendedSuccessCount}/14 extended modules for ${symbol}`);
      
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
    
    // Log comprehensive data availability
    console.log(`[RAG] Data retrieved for ${symbol}:`, {
      // Core data
      quote: !!data.quote,
      overview: !!data.overview,
      metrics: !!data.metrics,
      historical: data.historical?.length || 0,
      // Extended modules
      financialData: !!data.financialData,
      statistics: !!data.statistics,
      earnings: data.earnings?.length || 0,
      recommendations: data.recommendations?.length || 0,
      insiders: data.insiders?.length || 0,
      institutions: data.institutions?.length || 0,
      // Financial statements
      incomeStatement: data.incomeStatement?.length || 0,
      balanceSheet: data.balanceSheet?.length || 0,
      cashflowStatement: data.cashflowStatement?.length || 0,
      // Additional modules
      secFilings: data.secFilings?.length || 0,
      upgradeDowngrade: data.upgradeDowngrade?.length || 0,
      calendarEvents: data.calendarEvents?.length || 0,
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

    let context = `### Financial Data for ${symbol}\n`;

    // Company Overview
    if (data.overview) {
      context += `**Overview**\n`;
      context += `Name: ${data.overview.name}\n`;
      context += `Sector: ${data.overview.sector}\n`;
      context += `Industry: ${data.overview.industry}\n`;
      if (data.overview.exchange) context += `Exchange: ${data.overview.exchange}\n`;
      if (data.overview.country) context += `Country: ${data.overview.country}\n`;
      if (data.overview.website) context += `Website: ${data.overview.website}\n`;
      if (data.overview.employees) context += `Employees: ${data.overview.employees.toLocaleString()}\n`;
      if (data.overview.description) {
        // Increased description length for better context
        const desc = data.overview.description.length > 500 
          ? data.overview.description.substring(0, 500) + "..." 
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
      if (data.quote.open) context += `Open: $${data.quote.open.toFixed(2)}\n`;
      if (data.quote.previousClose) context += `Previous Close: $${data.quote.previousClose.toFixed(2)}\n`;
      // Only show volume if it's available and greater than 0
      if (data.quote.volume && data.quote.volume > 0) {
        context += `Volume: ${data.quote.volume.toLocaleString()}\n`;
      }
      if (data.quote.avgVolume && data.quote.avgVolume > 0) {
        context += `Avg Volume: ${data.quote.avgVolume.toLocaleString()}\n`;
      }
      context += `\n`;
    }

    // Financial Metrics
    if (data.metrics) {
      context += `**Key Fundamentals**\n`;
      if (data.metrics.peRatio) context += `P/E Ratio: ${data.metrics.peRatio.toFixed(2)}\n`;
      if (data.metrics.forwardPE) context += `Forward P/E: ${data.metrics.forwardPE.toFixed(2)}\n`;
      if (data.metrics.eps) context += `EPS: $${data.metrics.eps.toFixed(2)}\n`;
      if (data.metrics.forwardEps) context += `Forward EPS: $${data.metrics.forwardEps.toFixed(2)}\n`;
      if (data.metrics.marketCap) context += `Market Cap: $${(data.metrics.marketCap / 1e9).toFixed(2)} Billion\n`;
      if (data.metrics.dividendYield) context += `Dividend Yield: ${data.metrics.dividendYield.toFixed(2)}%\n`;
      if (data.metrics.dividendRate) context += `Dividend Rate: $${data.metrics.dividendRate.toFixed(2)}\n`;
      if (data.metrics.beta) context += `Beta: ${data.metrics.beta.toFixed(2)}\n`;
      if (data.metrics.weekHigh52) context += `52-Week High: $${data.metrics.weekHigh52.toFixed(2)}\n`;
      if (data.metrics.weekLow52) context += `52-Week Low: $${data.metrics.weekLow52.toFixed(2)}\n`;
      if (data.metrics.avgVolume10Day) context += `10-Day Avg Volume: ${data.metrics.avgVolume10Day.toLocaleString()}\n`;
      context += `\n`;
    }

    // Recent Price Trend (Limited to 5 days for focus)
    if (data.historical && data.historical.length > 0) {
      const recent = data.historical.slice(-5);
      context += `**Recent Price History (Last 5 Days)**\n`;
      recent.forEach((point: any) => {
        context += `- ${point.date}: $${point.price.toFixed(2)}\n`;
      });
      context += `\n`;
    }

    // Earnings History (if available)
    if (data.earnings && Array.isArray(data.earnings) && data.earnings.length > 0) {
      context += `**Recent Earnings (Last 4 Quarters)**\n`;
      data.earnings.slice(-4).forEach((earning: any) => {
        if (earning.date && earning.epsActual) {
          context += `- ${earning.date}: EPS ${earning.epsActual} (Est: ${earning.epsEstimate || 'N/A'})\n`;
        }
      });
      context += `\n`;
    }

    // Analyst Recommendations (if available)
    if (data.recommendations && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
      const latest = data.recommendations[0];
      if (latest) {
        context += `**Analyst Recommendations**\n`;
        if (latest.strongBuy) context += `Strong Buy: ${latest.strongBuy}\n`;
        if (latest.buy) context += `Buy: ${latest.buy}\n`;
        if (latest.hold) context += `Hold: ${latest.hold}\n`;
        if (latest.sell) context += `Sell: ${latest.sell}\n`;
        context += `\n`;
      }
    }

    // Insider Trading (if available)
    if (data.insiders && Array.isArray(data.insiders) && data.insiders.length > 0) {
      context += `**Recent Insider Activity (Last 3 Transactions)**\n`;
      data.insiders.slice(0, 3).forEach((insider: any) => {
        if (insider.name && insider.shares) {
          const action = insider.transactionType || 'Transaction';
          context += `- ${insider.name}: ${action} ${insider.shares.toLocaleString()} shares\n`;
        }
      });
      context += `\n`;
    }

    // Institutional Ownership (if available)
    if (data.institutions && Array.isArray(data.institutions) && data.institutions.length > 0) {
      context += `**Top Institutional Holders (Top 3)**\n`;
      data.institutions.slice(0, 3).forEach((inst: any) => {
        if (inst.holder && inst.shares) {
          context += `- ${inst.holder}: ${inst.shares.toLocaleString()} shares (${inst.pctHeld?.toFixed(2) || '?'}%)\n`;
        }
      });
      context += `\n`;
    }

    // Technical Indicators (if available)
    if (data.technicalIndicators) {
      const hasAnyIndicator = data.technicalIndicators.sma || data.technicalIndicators.rsi || 
                              data.technicalIndicators.macd || data.technicalIndicators.adx;
      if (hasAnyIndicator) {
        context += `**Technical Indicators**\n`;
        if (data.technicalIndicators.rsi) {
          const rsiValues = Object.values(data.technicalIndicators.rsi);
          const latestRSI: any = rsiValues[rsiValues.length - 1];
          if (latestRSI?.rsi) {
            context += `RSI (14): ${latestRSI.rsi.toFixed(2)} - `;
            if (latestRSI.rsi > 70) context += `Overbought\n`;
            else if (latestRSI.rsi < 30) context += `Oversold\n`;
            else context += `Neutral\n`;
          }
        }
        if (data.technicalIndicators.macd) {
          const macdValues = Object.values(data.technicalIndicators.macd);
          const latestMACD: any = macdValues[macdValues.length - 1];
          if (latestMACD?.macd && latestMACD?.signal) {
            const signal = latestMACD.macd > latestMACD.signal ? 'Bullish' : 'Bearish';
            context += `MACD: ${signal} signal\n`;
          }
        }
        context += `\n`;
      }
    }

    // Financial Data (if available) - Profitability & Valuation metrics
    if (data.financialData) {
      const fd = data.financialData;
      const hasFinancialMetrics = fd.profitMargins || fd.grossMargins || fd.operatingMargins || 
                                   fd.returnOnAssets || fd.returnOnEquity || fd.currentRatio ||
                                   fd.debtToEquity || fd.freeCashflow || fd.revenueGrowth;
      if (hasFinancialMetrics) {
        context += `**Financial Health Metrics**\n`;
        if (fd.profitMargins) context += `Profit Margin: ${(fd.profitMargins * 100).toFixed(2)}%\n`;
        if (fd.grossMargins) context += `Gross Margin: ${(fd.grossMargins * 100).toFixed(2)}%\n`;
        if (fd.operatingMargins) context += `Operating Margin: ${(fd.operatingMargins * 100).toFixed(2)}%\n`;
        if (fd.returnOnAssets) context += `Return on Assets: ${(fd.returnOnAssets * 100).toFixed(2)}%\n`;
        if (fd.returnOnEquity) context += `Return on Equity: ${(fd.returnOnEquity * 100).toFixed(2)}%\n`;
        if (fd.currentRatio) context += `Current Ratio: ${fd.currentRatio.toFixed(2)}\n`;
        if (fd.debtToEquity) context += `Debt to Equity: ${fd.debtToEquity.toFixed(2)}\n`;
        if (fd.freeCashflow) context += `Free Cash Flow: $${(fd.freeCashflow / 1e9).toFixed(2)}B\n`;
        if (fd.revenueGrowth) context += `Revenue Growth: ${(fd.revenueGrowth * 100).toFixed(2)}%\n`;
        if (fd.earningsGrowth) context += `Earnings Growth: ${(fd.earningsGrowth * 100).toFixed(2)}%\n`;
        if (fd.targetHighPrice && fd.targetLowPrice) {
          context += `Analyst Price Target: $${fd.targetLowPrice.toFixed(2)} - $${fd.targetHighPrice.toFixed(2)}\n`;
        }
        if (fd.recommendationKey) context += `Analyst Consensus: ${fd.recommendationKey.toUpperCase()}\n`;
        context += `\n`;
      }
    }

    // Statistics Module (if available) - Share statistics
    if (data.statistics) {
      const stats = data.statistics;
      const hasStats = stats.sharesOutstanding || stats.floatShares || stats.sharesShort ||
                       stats.shortRatio || stats.enterpriseValue || stats.forwardPE;
      if (hasStats) {
        context += `**Share Statistics**\n`;
        if (stats.sharesOutstanding) context += `Shares Outstanding: ${(stats.sharesOutstanding / 1e9).toFixed(2)}B\n`;
        if (stats.floatShares) context += `Float Shares: ${(stats.floatShares / 1e9).toFixed(2)}B\n`;
        if (stats.sharesShort) context += `Shares Short: ${(stats.sharesShort / 1e6).toFixed(2)}M\n`;
        if (stats.shortRatio) context += `Short Ratio: ${stats.shortRatio.toFixed(2)}\n`;
        if (stats.shortPercentOfFloat) context += `Short % of Float: ${(stats.shortPercentOfFloat * 100).toFixed(2)}%\n`;
        if (stats.enterpriseValue) context += `Enterprise Value: $${(stats.enterpriseValue / 1e9).toFixed(2)}B\n`;
        if (stats.forwardPE) context += `Forward P/E: ${stats.forwardPE.toFixed(2)}\n`;
        if (stats.pegRatio) context += `PEG Ratio: ${stats.pegRatio.toFixed(2)}\n`;
        if (stats.priceToBook) context += `Price to Book: ${stats.priceToBook.toFixed(2)}\n`;
        context += `\n`;
      }
    }

    // Financial Statement Summary with key figures (if available)
    if (data.incomeStatement || data.balanceSheet || data.cashflowStatement) {
      context += `**Financial Statements**\n`;
      
      // Income Statement highlights
      if (data.incomeStatement && Array.isArray(data.incomeStatement) && data.incomeStatement.length > 0) {
        const latest = data.incomeStatement[0];
        context += `Income Statement (${latest.asOfDate || latest.endDate || 'Latest'}):\n`;
        if (latest.totalRevenue) context += `  Revenue: $${(latest.totalRevenue / 1e9).toFixed(2)}B\n`;
        if (latest.grossProfit) context += `  Gross Profit: $${(latest.grossProfit / 1e9).toFixed(2)}B\n`;
        if (latest.operatingIncome) context += `  Operating Income: $${(latest.operatingIncome / 1e9).toFixed(2)}B\n`;
        if (latest.netIncome) context += `  Net Income: $${(latest.netIncome / 1e9).toFixed(2)}B\n`;
      }
      
      // Balance Sheet highlights
      if (data.balanceSheet && Array.isArray(data.balanceSheet) && data.balanceSheet.length > 0) {
        const latest = data.balanceSheet[0];
        context += `Balance Sheet (${latest.asOfDate || latest.endDate || 'Latest'}):\n`;
        if (latest.totalAssets) context += `  Total Assets: $${(latest.totalAssets / 1e9).toFixed(2)}B\n`;
        if (latest.totalLiabilities) context += `  Total Liabilities: $${(latest.totalLiabilities / 1e9).toFixed(2)}B\n`;
        if (latest.totalEquity || latest.stockholdersEquity) context += `  Stockholders Equity: $${((latest.totalEquity || latest.stockholdersEquity) / 1e9).toFixed(2)}B\n`;
        if (latest.cash || latest.cashAndCashEquivalents) context += `  Cash: $${((latest.cash || latest.cashAndCashEquivalents) / 1e9).toFixed(2)}B\n`;
        if (latest.totalDebt || latest.longTermDebt) context += `  Total Debt: $${((latest.totalDebt || latest.longTermDebt) / 1e9).toFixed(2)}B\n`;
      }
      
      // Cashflow highlights
      if (data.cashflowStatement && Array.isArray(data.cashflowStatement) && data.cashflowStatement.length > 0) {
        const latest = data.cashflowStatement[0];
        context += `Cash Flow (${latest.asOfDate || latest.endDate || 'Latest'}):\n`;
        if (latest.operatingCashFlow) context += `  Operating CF: $${(latest.operatingCashFlow / 1e9).toFixed(2)}B\n`;
        if (latest.capitalExpenditure) context += `  CapEx: $${(latest.capitalExpenditure / 1e9).toFixed(2)}B\n`;
        if (latest.freeCashFlow) context += `  Free CF: $${(latest.freeCashFlow / 1e9).toFixed(2)}B\n`;
      }
      context += `\n`;
    }

    // Upgrade/Downgrade History (if available)
    if (data.upgradeDowngrade && Array.isArray(data.upgradeDowngrade) && data.upgradeDowngrade.length > 0) {
      context += `**Recent Analyst Actions (Last 3)**\n`;
      data.upgradeDowngrade.slice(0, 3).forEach((action: any) => {
        if (action.firm && action.toGrade) {
          const date = action.date || action.epochGradeDate || '';
          context += `- ${action.firm}: ${action.action || 'Rating'} to ${action.toGrade}`;
          if (date) context += ` (${date})`;
          context += `\n`;
        }
      });
      context += `\n`;
    }

    // SEC Filings (if available)
    if (data.secFilings && Array.isArray(data.secFilings) && data.secFilings.length > 0) {
      context += `**Recent SEC Filings (Last 3)**\n`;
      data.secFilings.slice(0, 3).forEach((filing: any) => {
        if (filing.type && filing.date) {
          context += `- ${filing.type}: Filed ${filing.date}`;
          if (filing.title) context += ` - ${filing.title.substring(0, 50)}...`;
          context += `\n`;
        }
      });
      context += `\n`;
    }

    // Upcoming Calendar Events (if available)
    if (data.calendarEvents && Array.isArray(data.calendarEvents) && data.calendarEvents.length > 0) {
      context += `**Upcoming Events**\n`;
      data.calendarEvents.slice(0, 3).forEach((event: any) => {
        if (event.eventName && event.date) {
          context += `- ${event.eventName}: ${event.date}\n`;
        }
      });
      context += `\n`;
    }

    // Net Share Purchase Activity (if available)
    if (data.netSharePurchase) {
      const activity = data.netSharePurchase;
      if (activity.netSharesInsiderPurchases || activity.netSharesInstitutionalPurchases) {
        context += `**Share Purchase Activity**\n`;
        if (activity.netSharesInsiderPurchases) {
          context += `Insider Net Purchases: ${activity.netSharesInsiderPurchases.toLocaleString()} shares\n`;
        }
        if (activity.netSharesInstitutionalPurchases) {
          context += `Institutional Net Purchases: ${activity.netSharesInstitutionalPurchases.toLocaleString()} shares\n`;
        }
        context += `\n`;
      }
    }

    // Index Trend (if available)
    if (data.indexTrend && data.indexTrend.estimates) {
      context += `**Analyst Estimates & Trends**\n`;
      const estimates = data.indexTrend.estimates;
      if (estimates.length > 0) {
        const latest = estimates[0];
        if (latest.period && latest.growth) {
          context += `${latest.period}: ${(latest.growth * 100).toFixed(2)}% growth estimate\n`;
        }
      }
      context += `\n`;
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

      // Add Undervalued Large Caps
      const undervalued = await databaseService.getMarketData('screener_undervalued_large_caps', 60 * 60 * 1000);
      if (undervalued && undervalued.length > 0) {
        context += `**Undervalued Large Caps (${undervalued.length}):**\n`;
        undervalued.slice(0, 5).forEach((stock: any) => {
          context += `- ${stock.symbol} (${stock.shortName || stock.name}): $${stock.regularMarketPrice?.toFixed(2) || '0'}`;
          if (stock.forwardPE) context += ` | Fwd P/E: ${stock.forwardPE.toFixed(2)}`;
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