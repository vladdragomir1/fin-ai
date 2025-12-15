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
      context += `Price: $${safeFixed(data.quote.price)}\n`;
      context += `Change: ${data.quote.change >= 0 ? '+' : ''}${safeFixed(data.quote.change)} (${safeFixed(data.quote.changePercent)}%)\n`;
      context += `Day Range: $${safeFixed(data.quote.low)} - $${safeFixed(data.quote.high)}\n`;
      if (data.quote.open) context += `Open: $${safeFixed(data.quote.open)}\n`;
      if (data.quote.previousClose) context += `Previous Close: $${safeFixed(data.quote.previousClose)}\n`;
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
      if (data.metrics.peRatio) context += `P/E Ratio: ${safeFixed(data.metrics.peRatio)}\n`;
      if (data.metrics.forwardPE) context += `Forward P/E: ${safeFixed(data.metrics.forwardPE)}\n`;
      if (data.metrics.eps) context += `EPS: $${safeFixed(data.metrics.eps)}\n`;
      if (data.metrics.forwardEps) context += `Forward EPS: $${safeFixed(data.metrics.forwardEps)}\n`;
      if (data.metrics.marketCap) context += `Market Cap: $${safeBillion(data.metrics.marketCap)} Billion\n`;
      if (data.metrics.dividendYield) context += `Dividend Yield: ${safeFixed(data.metrics.dividendYield)}%\n`;
      if (data.metrics.dividendRate) context += `Dividend Rate: $${safeFixed(data.metrics.dividendRate)}\n`;
      if (data.metrics.beta) context += `Beta: ${safeFixed(data.metrics.beta)}\n`;
      if (data.metrics.weekHigh52) context += `52-Week High: $${safeFixed(data.metrics.weekHigh52)}\n`;
      if (data.metrics.weekLow52) context += `52-Week Low: $${safeFixed(data.metrics.weekLow52)}\n`;
      if (data.metrics.avgVolume10Day) context += `10-Day Avg Volume: ${data.metrics.avgVolume10Day.toLocaleString()}\n`;
      context += `\n`;
    }

    // Recent Price Trend (Limited to 5 days for focus)
    if (data.historical && data.historical.length > 0) {
      const recent = data.historical.slice(-5);
      context += `**Recent Price History (Last 5 Days)**\n`;
      recent.forEach((point: any) => {
        context += `- ${point.date}: $${safeFixed(point.price)}\n`;
      });
      context += `\n`;
    }

    // Earnings History (if available)
    // API returns: { history: [...] } - need to access the nested array
    const earningsList = data.earnings?.history || (Array.isArray(data.earnings) ? data.earnings : null);
    if (earningsList && earningsList.length > 0) {
      context += `**Recent Earnings (Last 4 Quarters)**\n`;
      earningsList.slice(-4).forEach((earning: any) => {
        const date = earning.quarterDisplay || earning.date || earning.quarter || 'N/A';
        const epsActual = earning.epsActual ?? earning.actual;
        const epsEstimate = earning.epsEstimate ?? earning.estimate;
        const surprise = earning.epsSurprise ?? earning.surprise;
        const surprisePct = earning.surprisePercent ?? earning.epsSurprisePercent;
        
        context += `- **${date}**: `;
        if (epsActual !== undefined) context += `EPS $${safeFixed(epsActual)}`;
        if (epsEstimate !== undefined) context += ` (Est: $${safeFixed(epsEstimate)})`;
        if (surprisePct !== undefined) {
          const sign = surprisePct >= 0 ? '+' : '';
          context += ` | Surprise: ${sign}${safeFixed(surprisePct)}%`;
        }
        context += `\n`;
      });
      context += `\n`;
    }

    // Analyst Recommendations (if available)
    // API returns: { trend: [...] } - need to access the nested array
    const recommendationList = data.recommendations?.trend || (Array.isArray(data.recommendations) ? data.recommendations : null);
    if (recommendationList && recommendationList.length > 0) {
      const latest = recommendationList[0];
      if (latest) {
        context += `**Analyst Recommendations**\n`;
        const period = latest.period || latest.date || 'Current';
        context += `Period: ${period}\n`;
        if (latest.strongBuy) context += `Strong Buy: ${latest.strongBuy}\n`;
        if (latest.buy) context += `Buy: ${latest.buy}\n`;
        if (latest.hold) context += `Hold: ${latest.hold}\n`;
        if (latest.sell) context += `Sell: ${latest.sell}\n`;
        if (latest.strongSell) context += `Strong Sell: ${latest.strongSell}\n`;
        context += `\n`;
      }
    }

    // Insider Trading (if available)
    // API returns: { holders: [...] } - need to access the nested array
    const insiderList = data.insiders?.holders || (Array.isArray(data.insiders) ? data.insiders : null);
    if (insiderList && insiderList.length > 0) {
      context += `**Recent Insider Activity (Last 5 Holders)**\n`;
      insiderList.slice(0, 5).forEach((insider: any) => {
        const name = insider.name || insider.filerName || 'Unknown';
        const position = insider.relation || insider.position || '';
        const shares = insider.positionDirect || insider.shares || insider.latestTransDate;
        const transactionType = insider.transactionDescription || insider.transactionType || '';
        
        context += `- **${name}**`;
        if (position) context += ` (${position})`;
        context += `\n`;
        if (shares && typeof shares === 'number') {
          context += `  Direct Holdings: ${shares.toLocaleString()} shares\n`;
        }
        if (transactionType) context += `  Latest: ${transactionType}\n`;
      });
      context += `\n`;
    }

    // Institutional Ownership (if available)
    // API returns: { ownershipList: [...] } - need to access the nested array
    const institutionList = data.institutions?.ownershipList || (Array.isArray(data.institutions) ? data.institutions : null);
    if (institutionList && institutionList.length > 0) {
      context += `**Top Institutional Holders (Top 5)**\n`;
      institutionList.slice(0, 5).forEach((inst: any) => {
        const holder = inst.organization || inst.holder || inst.name || 'Unknown';
        const shares = inst.position || inst.shares || inst.value;
        const pctHeld = inst.pctHeld || inst.percentHeld;
        const reportDate = inst.reportDate || '';
        
        context += `- **${holder}**`;
        if (shares && typeof shares === 'number') {
          context += `: ${shares.toLocaleString()} shares`;
        }
        if (pctHeld) {
          context += ` (${safeFixed(pctHeld, 2, '?')}%)`;
        }
        if (reportDate) context += ` - as of ${reportDate}`;
        context += `\n`;
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
          if (latestRSI?.rsi && typeof latestRSI.rsi === 'number') {
            context += `RSI (14): ${safeFixed(latestRSI.rsi)} - `;
            if (latestRSI.rsi > 70) context += `Overbought\n`;
            else if (latestRSI.rsi < 30) context += `Oversold\n`;
            else context += `Neutral\n`;
          }
        }
        if (data.technicalIndicators.macd) {
          const macdValues = Object.values(data.technicalIndicators.macd);
          const latestMACD: any = macdValues[macdValues.length - 1];
          if (latestMACD?.macd && latestMACD?.signal && typeof latestMACD.macd === 'number') {
            const signal = latestMACD.macd > latestMACD.signal ? 'Bullish' : 'Bearish';
            context += `MACD: ${signal} signal\n`;
          }
        }
        context += `\n`;
      }
    }

    // Financial Data (if available) - Profitability & Valuation metrics
    // API returns: { profitMargins: {fmt, raw}, grossMargins: {fmt, raw}, ... }
    if (data.financialData) {
      const fd = data.financialData;
      // Helper to extract value (supports both {raw, fmt} and plain values)
      const getValue = (val: any) => val?.raw ?? val;
      const getFmt = (val: any) => val?.fmt || null;
      
      const hasFinancialMetrics = fd.profitMargins || fd.grossMargins || fd.operatingMargins || 
                                   fd.returnOnAssets || fd.returnOnEquity || fd.currentRatio ||
                                   fd.debtToEquity || fd.freeCashflow || fd.revenueGrowth;
      if (hasFinancialMetrics) {
        context += `**Financial Health Metrics**\n`;
        if (fd.profitMargins) context += `Profit Margin: ${getFmt(fd.profitMargins) || safePercent(getValue(fd.profitMargins)) + '%'}\n`;
        if (fd.grossMargins) context += `Gross Margin: ${getFmt(fd.grossMargins) || safePercent(getValue(fd.grossMargins)) + '%'}\n`;
        if (fd.operatingMargins) context += `Operating Margin: ${getFmt(fd.operatingMargins) || safePercent(getValue(fd.operatingMargins)) + '%'}\n`;
        if (fd.returnOnAssets) context += `Return on Assets: ${getFmt(fd.returnOnAssets) || safePercent(getValue(fd.returnOnAssets)) + '%'}\n`;
        if (fd.returnOnEquity) context += `Return on Equity: ${getFmt(fd.returnOnEquity) || safePercent(getValue(fd.returnOnEquity)) + '%'}\n`;
        if (fd.currentRatio) context += `Current Ratio: ${getFmt(fd.currentRatio) || safeFixed(getValue(fd.currentRatio))}\n`;
        if (fd.debtToEquity) context += `Debt to Equity: ${getFmt(fd.debtToEquity) || safeFixed(getValue(fd.debtToEquity))}\n`;
        if (fd.freeCashflow) context += `Free Cash Flow: ${getFmt(fd.freeCashflow) || '$' + safeBillion(getValue(fd.freeCashflow)) + 'B'}\n`;
        if (fd.revenueGrowth) context += `Revenue Growth: ${getFmt(fd.revenueGrowth) || safePercent(getValue(fd.revenueGrowth)) + '%'}\n`;
        if (fd.earningsGrowth) context += `Earnings Growth: ${getFmt(fd.earningsGrowth) || safePercent(getValue(fd.earningsGrowth)) + '%'}\n`;
        if (fd.targetHighPrice && fd.targetLowPrice) {
          const low = getValue(fd.targetLowPrice);
          const high = getValue(fd.targetHighPrice);
          context += `Analyst Price Target: $${safeFixed(low)} - $${safeFixed(high)}\n`;
        }
        if (fd.targetMeanPrice) {
          const mean = getValue(fd.targetMeanPrice);
          context += `Mean Price Target: $${safeFixed(mean)}\n`;
        }
        if (fd.recommendationKey) context += `Analyst Consensus: ${fd.recommendationKey.toUpperCase()}\n`;
        if (fd.numberOfAnalystOpinions) {
          const num = getValue(fd.numberOfAnalystOpinions);
          context += `Number of Analyst Opinions: ${num}\n`;
        }
        context += `\n`;
      }
    }

    // Statistics Module (if available) - Share statistics
    // API returns: { sharesOutstanding: {fmt, raw}, floatShares: {fmt, raw}, ... }
    if (data.statistics) {
      const stats = data.statistics;
      const hasStats = stats.sharesOutstanding || stats.floatShares || stats.sharesShort ||
                       stats.shortRatio || stats.enterpriseValue || stats.forwardPE;
      if (hasStats) {
        context += `**Share Statistics**\n`;
        // Helper to extract value (supports both {raw, fmt} and plain values)
        const getValue = (val: any) => val?.raw ?? val;
        const getFmt = (val: any) => val?.fmt || null;
        
        if (stats.sharesOutstanding) {
          const v = getValue(stats.sharesOutstanding);
          context += `Shares Outstanding: ${getFmt(stats.sharesOutstanding) || safeBillion(v) + 'B'}\n`;
        }
        if (stats.floatShares) {
          const v = getValue(stats.floatShares);
          context += `Float Shares: ${getFmt(stats.floatShares) || safeBillion(v) + 'B'}\n`;
        }
        if (stats.sharesShort) {
          const v = getValue(stats.sharesShort);
          context += `Shares Short: ${getFmt(stats.sharesShort) || safeMillion(v) + 'M'}\n`;
        }
        if (stats.shortRatio) {
          const v = getValue(stats.shortRatio);
          context += `Short Ratio: ${getFmt(stats.shortRatio) || safeFixed(v)}\n`;
        }
        if (stats.shortPercentOfFloat) {
          const v = getValue(stats.shortPercentOfFloat);
          context += `Short % of Float: ${getFmt(stats.shortPercentOfFloat) || safePercent(v) + '%'}\n`;
        }
        if (stats.enterpriseValue) {
          const v = getValue(stats.enterpriseValue);
          context += `Enterprise Value: ${getFmt(stats.enterpriseValue) || '$' + safeBillion(v) + 'B'}\n`;
        }
        if (stats.forwardPE) {
          const v = getValue(stats.forwardPE);
          context += `Forward P/E: ${getFmt(stats.forwardPE) || safeFixed(v)}\n`;
        }
        if (stats.pegRatio) {
          const v = getValue(stats.pegRatio);
          context += `PEG Ratio: ${getFmt(stats.pegRatio) || safeFixed(v)}\n`;
        }
        if (stats.priceToBook) {
          const v = getValue(stats.priceToBook);
          context += `Price to Book: ${getFmt(stats.priceToBook) || safeFixed(v)}\n`;
        }
        if (stats.enterpriseToRevenue) {
          const v = getValue(stats.enterpriseToRevenue);
          context += `EV/Revenue: ${getFmt(stats.enterpriseToRevenue) || safeFixed(v)}\n`;
        }
        if (stats.enterpriseToEbitda) {
          const v = getValue(stats.enterpriseToEbitda);
          context += `EV/EBITDA: ${getFmt(stats.enterpriseToEbitda) || safeFixed(v)}\n`;
        }
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
        if (latest.totalRevenue) context += `  Revenue: $${safeBillion(latest.totalRevenue)}B\n`;
        if (latest.grossProfit) context += `  Gross Profit: $${safeBillion(latest.grossProfit)}B\n`;
        if (latest.operatingIncome) context += `  Operating Income: $${safeBillion(latest.operatingIncome)}B\n`;
        if (latest.netIncome) context += `  Net Income: $${safeBillion(latest.netIncome)}B\n`;
      }
      
      // Balance Sheet highlights
      if (data.balanceSheet && Array.isArray(data.balanceSheet) && data.balanceSheet.length > 0) {
        const latest = data.balanceSheet[0];
        context += `Balance Sheet (${latest.asOfDate || latest.endDate || 'Latest'}):\n`;
        if (latest.totalAssets) context += `  Total Assets: $${safeBillion(latest.totalAssets)}B\n`;
        if (latest.totalLiabilities) context += `  Total Liabilities: $${safeBillion(latest.totalLiabilities)}B\n`;
        if (latest.totalEquity || latest.stockholdersEquity) context += `  Stockholders Equity: $${safeBillion(latest.totalEquity || latest.stockholdersEquity)}B\n`;
        if (latest.cash || latest.cashAndCashEquivalents) context += `  Cash: $${safeBillion(latest.cash || latest.cashAndCashEquivalents)}B\n`;
        if (latest.totalDebt || latest.longTermDebt) context += `  Total Debt: $${safeBillion(latest.totalDebt || latest.longTermDebt)}B\n`;
      }
      
      // Cashflow highlights
      if (data.cashflowStatement && Array.isArray(data.cashflowStatement) && data.cashflowStatement.length > 0) {
        const latest = data.cashflowStatement[0];
        context += `Cash Flow (${latest.asOfDate || latest.endDate || 'Latest'}):\n`;
        if (latest.operatingCashFlow) context += `  Operating CF: $${safeBillion(latest.operatingCashFlow)}B\n`;
        if (latest.capitalExpenditure) context += `  CapEx: $${safeBillion(latest.capitalExpenditure)}B\n`;
        if (latest.freeCashFlow) context += `  Free CF: $${safeBillion(latest.freeCashFlow)}B\n`;
      }
      context += `\n`;
    }

    // Upgrade/Downgrade History (if available)
    // API returns: { history: [...] } - need to access the nested array
    const upgradeList = data.upgradeDowngrade?.history || (Array.isArray(data.upgradeDowngrade) ? data.upgradeDowngrade : null);
    if (upgradeList && upgradeList.length > 0) {
      context += `**Recent Analyst Rating Changes (Last 5)**\n`;
      upgradeList.slice(0, 5).forEach((action: any) => {
        const firm = action.firm || action.company || 'Unknown';
        const toGrade = action.toGrade || action.newGrade || action.grade;
        const fromGrade = action.fromGrade || action.oldGrade;
        const actionType = action.action || (fromGrade ? 'Change' : 'Initiate');
        const date = action.date || action.epochGradeDate || '';
        
        context += `- **${firm}**: ${actionType}`;
        if (fromGrade && toGrade) {
          context += ` from ${fromGrade} to ${toGrade}`;
        } else if (toGrade) {
          context += ` → ${toGrade}`;
        }
        if (date) context += ` (${date})`;
        context += `\n`;
      });
      context += `\n`;
    }

    // SEC Filings (if available)
    // API returns: { filings: [...] } - need to access the nested array
    const filingsList = data.secFilings?.filings || (Array.isArray(data.secFilings) ? data.secFilings : null);
    if (filingsList && filingsList.length > 0) {
      context += `**Recent SEC Filings (Last 5)**\n`;
      filingsList.slice(0, 5).forEach((filing: any) => {
        const type = filing.type || filing.formType || 'N/A';
        const date = filing.date || filing.filedAt || filing.epochDate || '';
        const title = filing.title || filing.description || '';
        
        context += `- **${type}**`;
        if (date) context += ` (${date})`;
        if (title) context += `: ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}`;
        context += `\n`;
      });
      context += `\n`;
    }

    // Upcoming Calendar Events (if available)
    // API returns: { earnings: { earningsDate: [...], earningsAverage: {...}, ... }, dividendDate: {...}, exDividendDate: {...} }
    if (data.calendarEvents && typeof data.calendarEvents === 'object') {
      const cal = data.calendarEvents;
      const hasData = cal.earnings || cal.dividendDate || cal.exDividendDate;
      
      if (hasData) {
        context += `**Upcoming Events & Estimates**\n`;
        
        // Earnings date
        if (cal.earnings?.earningsDate?.[0]) {
          const earningsDate = cal.earnings.earningsDate[0];
          const dateStr = earningsDate.fmt || (earningsDate.raw ? new Date(earningsDate.raw * 1000).toLocaleDateString() : null);
          if (dateStr) context += `- **Next Earnings Date**: ${dateStr}\n`;
        }
        
        // Earnings estimates
        if (cal.earnings?.earningsAverage?.fmt || cal.earnings?.earningsAverage?.raw) {
          const avg = cal.earnings.earningsAverage.fmt || `$${safeFixed(cal.earnings.earningsAverage.raw)}`;
          context += `- **Earnings Estimate (Average)**: ${avg}\n`;
        }
        if (cal.earnings?.earningsLow?.fmt && cal.earnings?.earningsHigh?.fmt) {
          context += `- **Earnings Range**: ${cal.earnings.earningsLow.fmt} - ${cal.earnings.earningsHigh.fmt}\n`;
        }
        
        // Revenue estimates
        if (cal.earnings?.revenueAverage?.fmt || cal.earnings?.revenueAverage?.raw) {
          const rev = cal.earnings.revenueAverage.fmt || `$${safeBillion(cal.earnings.revenueAverage.raw)}B`;
          context += `- **Revenue Estimate (Average)**: ${rev}\n`;
        }
        if (cal.earnings?.revenueLow?.fmt && cal.earnings?.revenueHigh?.fmt) {
          context += `- **Revenue Range**: ${cal.earnings.revenueLow.fmt} - ${cal.earnings.revenueHigh.fmt}\n`;
        }
        
        // Dividend dates
        if (cal.dividendDate?.fmt || cal.dividendDate?.raw) {
          const divDate = cal.dividendDate.fmt || (cal.dividendDate.raw ? new Date(cal.dividendDate.raw * 1000).toLocaleDateString() : null);
          if (divDate) context += `- **Dividend Date**: ${divDate}\n`;
        }
        if (cal.exDividendDate?.fmt || cal.exDividendDate?.raw) {
          const exDate = cal.exDividendDate.fmt || (cal.exDividendDate.raw ? new Date(cal.exDividendDate.raw * 1000).toLocaleDateString() : null);
          if (exDate) context += `- **Ex-Dividend Date**: ${exDate}\n`;
        }
        
        context += `\n`;
      }
    }

    // Net Share Purchase Activity (if available)
    // API returns: { buyInfoCount: {fmt, raw}, buyInfoShares: {fmt, raw}, sellInfoCount: {fmt, raw}, sellInfoShares: {fmt, raw}, ... }
    if (data.netSharePurchase) {
      const activity = data.netSharePurchase;
      const hasBuyData = activity.buyInfoCount || activity.buyInfoShares;
      const hasSellData = activity.sellInfoCount || activity.sellInfoShares;
      
      if (hasBuyData || hasSellData) {
        context += `**Insider Net Share Purchase Activity (Last 6 Months)**\n`;
        
        if (hasBuyData) {
          context += `- **Buys**: `;
          if (activity.buyInfoCount?.fmt) context += `${activity.buyInfoCount.fmt} transactions`;
          if (activity.buyInfoShares?.fmt) context += `, ${activity.buyInfoShares.fmt} shares`;
          if (activity.buyPercentInsiderShares?.fmt) context += ` (${activity.buyPercentInsiderShares.fmt} of insider shares)`;
          context += `\n`;
        }
        
        if (hasSellData) {
          context += `- **Sells**: `;
          if (activity.sellInfoCount?.fmt) context += `${activity.sellInfoCount.fmt} transactions`;
          if (activity.sellInfoShares?.fmt) context += `, ${activity.sellInfoShares.fmt} shares`;
          if (activity.sellPercentInsiderShares?.fmt) context += ` (${activity.sellPercentInsiderShares.fmt} of insider shares)`;
          context += `\n`;
        }
        
        // Net totals if available
        if (activity.netInfoCount?.fmt || activity.netInfoShares?.fmt) {
          context += `- **Net Activity**: `;
          if (activity.netInfoCount?.fmt) context += `${activity.netInfoCount.fmt} net transactions`;
          if (activity.netInfoShares?.fmt) context += `, ${activity.netInfoShares.fmt} net shares`;
          if (activity.netPercentInsiderShares?.fmt) context += ` (${activity.netPercentInsiderShares.fmt})`;
          context += `\n`;
        }
        
        context += `\n`;
      }
    }

    // Index Trend - Growth Estimates (if available)
    // API returns: { symbol: 'NVDA', estimates: [{ period: '0q', growth: {fmt, raw}}, ...] }
    if (data.indexTrend && data.indexTrend.estimates && data.indexTrend.estimates.length > 0) {
      context += `**Growth Estimates & Index Trend**\n`;
      if (data.indexTrend.symbol) {
        context += `Symbol: ${data.indexTrend.symbol}\n`;
      }
      
      data.indexTrend.estimates.forEach((est: any) => {
        if (est.period && (est.growth?.fmt || est.growth?.raw !== undefined)) {
          const periodName = est.period === '0q' ? 'Current Quarter' 
                           : est.period === '+1q' ? 'Next Quarter'
                           : est.period === '0y' ? 'Current Year'
                           : est.period === '+1y' ? 'Next Year'
                           : est.period === '+5y' ? '5 Year'
                           : est.period === '-5y' ? 'Past 5 Years'
                           : est.period;
          const growthValue = est.growth?.fmt || `${safePercent(est.growth?.raw || est.growth)}%`;
          context += `- **${periodName}**: ${growthValue} growth estimate\n`;
        }
      });
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
  async extractRelevantContext(query: string, chatHistory: string = ''): Promise<string> {
    const cleanQuery = query.trim();
    const queryLower = cleanQuery.toLowerCase();
    const allSymbols = await databaseService.getAllCachedSymbols();

    console.log(`[RAG] Processing query: "${cleanQuery}"`);
    console.log(`[RAG] Database has ${allSymbols.length} cached symbols:`, allSymbols.slice(0, 10).join(', '));
    if (chatHistory) {
      console.log(`[RAG] Chat history available (${chatHistory.length} chars)`);
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
    
    if (chatHistory && chatHistory.trim()) {
      const historyLower = chatHistory.toLowerCase();
      
      // If query is about company-specific topics, prioritize finding company from history
      if (isCompanySpecificQuery) {
        console.log(`[RAG] Query contains company-specific keywords - checking chat history for context`);
      }
      
      // PRIORITY: Check for company names FIRST (more reliable than short symbols)
      // This prevents "AR" matching inside "market" before "Tesla" is found
      const historyCompanyMap: { [key: string]: string } = {
        'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
        'amazon': 'AMZN', 'tesla': 'TSLA', 'meta': 'META', 'facebook': 'META',
        'nvidia': 'NVDA', 'netflix': 'NFLX', 'amd': 'AMD', 'intel': 'INTC',
        'broadcom': 'AVGO', 'qualcomm': 'QCOM', 'salesforce': 'CRM', 'oracle': 'ORCL',
        'adobe': 'ADBE', 'cisco': 'CSCO', 'ibm': 'IBM', 'walmart': 'WMT',
        'costco': 'COST', 'home depot': 'HD', 'target': 'TGT', 'nike': 'NKE',
        'disney': 'DIS', 'starbucks': 'SBUX', 'mcdonalds': 'MCD', 'chevron': 'CVX',
        'exxon': 'XOM', 'jpmorgan': 'JPM', 'goldman': 'GS', 'berkshire': 'BRK-B',
        'visa': 'V', 'mastercard': 'MA', 'palantir': 'PLTR', 'uber': 'UBER', 'lyft': 'LYFT',
        'paypal': 'PYPL', 'square': 'SQ', 'block': 'SQ', 'shopify': 'SHOP',
        'spotify': 'SPOT', 'zoom': 'ZM', 'snowflake': 'SNOW', 'crowdstrike': 'CRWD',
        'datadog': 'DDOG', 'mongodb': 'MDB', 'twilio': 'TWLO', 'okta': 'OKTA',
        'coinbase': 'COIN', 'robinhood': 'HOOD', 'airbnb': 'ABNB', 'doordash': 'DASH',
        'rivian': 'RIVN', 'lucid': 'LCID', 'nio': 'NIO', 'xpeng': 'XPEV', 'li auto': 'LI',
        'boeing': 'BA', 'lockheed': 'LMT', 'raytheon': 'RTX', 'northrop': 'NOC',
        'pfizer': 'PFE', 'moderna': 'MRNA', 'johnson': 'JNJ', 'merck': 'MRK', 'abbvie': 'ABBV',
        'unitedhealth': 'UNH', 'cigna': 'CI', 'humana': 'HUM', 'cvs': 'CVS',
        'coca-cola': 'KO', 'coca cola': 'KO', 'pepsi': 'PEP', 'pepsico': 'PEP',
        'procter': 'PG', 'p&g': 'PG', 'colgate': 'CL', 'unilever': 'UL',
        'at&t': 'T', 'verizon': 'VZ', 't-mobile': 'TMUS', 'comcast': 'CMCSA',
        'bank of america': 'BAC', 'wells fargo': 'WFC', 'citigroup': 'C', 'citi': 'C',
        'morgan stanley': 'MS', 'charles schwab': 'SCHW', 'blackrock': 'BLK',
        'caterpillar': 'CAT', 'deere': 'DE', 'john deere': 'DE', '3m': 'MMM',
        'honeywell': 'HON', 'general electric': 'GE', 'ge': 'GE', 'siemens': 'SIEGY'
      };
      
      // Check company names first (more reliable than short symbols)
      for (const [companyName, symbol] of Object.entries(historyCompanyMap)) {
        if (isStandaloneWord(historyLower, companyName) && allSymbols.includes(symbol)) {
          console.log(`[RAG] Found company "${companyName}" (${symbol}) in chat history - using for context`);
          return await this.buildCompanyContext(symbol);
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
          return await this.buildCompanyContext(sym);
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
              return await this.buildCompanyContext(sym);
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
      
      // Build combined context for comparison (limit to 3 companies max for context size)
      const contexts: string[] = [];
      for (const sym of symbolsArray.slice(0, 3)) {
        console.log(`[RAG] Building context for comparison: ${sym}`);
        const context = await this.buildCompanyContext(sym);
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
      return await this.buildCompanyContext(symbol);
    }
    
    // No companies found from common names - continue with fallback methods
    
    // 3. Check company overview (includes full name) for other companies
    for (const sym of allSymbols) {
      const overview = await databaseService.getCompanyOverview(sym);
      if (overview && overview.name) {
        const companyWords = overview.name.toLowerCase().split(/[\s,]+/);
        for (const companyWord of companyWords) {
          // Match significant words (4+ chars to avoid false positives)
          if (companyWord.length >= 4 && queryLower.includes(companyWord)) {
            console.log(`[RAG] Found company name match: ${overview.name} (${sym})`);
            return await this.buildCompanyContext(sym);
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
      return await this.buildComparisonContext(foundSymbols);
    }

    // 9. Watchlist queries - special handling
    const watchlistKeywords = ['watchlist', 'portfolio', 'my stocks', 'my companies'];
    if (watchlistKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected watchlist query`);
      return await this.buildMarketContext();
    }

    // 10. Browse Stocks / Company List queries - show cached company names
    const browseKeywords = ['browse', 'list', 'companies', 'stocks screen', 'what companies', 'which companies', 'company names', 'stock names', 'all stocks', 'available stocks', 'see the names', 'their names'];
    if (browseKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Detected browse stocks / company list query`);
      return await this.buildCachedCompaniesContext();
    }

    // 11. Market Overview Keywords
    const marketKeywords = ['market', 'overview', 'sector', 'industry', 'trends', 'summary'];
    if (marketKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] Building comprehensive market overview context`);
      return await this.buildMarketContext();
    }

    // 12. General questions with available data
    if (allSymbols.length > 0) {
      console.log(`[RAG] No specific match, showing available companies`);
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
   */
  async formatPromptForLLM(userQuery: string, chatHistory: string = ''): Promise<string> {
    // Pass chat history to context extraction for follow-up questions
    const context = await this.extractRelevantContext(userQuery, chatHistory);
    
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
You are FinAI, a helpful financial analyst. Date: ${date}.

RESPONSE RULES:
- Be BRIEF and conversational. 2-4 sentences for simple questions, max 6-8 for complex analysis.
- Do NOT list or repeat all the financial data back to the user - they can see it on screen.
- Do NOT start with titles or headers.
- Answer the specific question asked, nothing more.
- Use **bold** only for 2-3 key numbers that directly answer the question.
- For "is it a good investment?" questions: Give a brief opinion with 2-3 supporting reasons, not a full analysis.
- For CEO/leadership questions: Just state the name and maybe one fact.
- If asked to compare: Focus on 2-3 key differences, not exhaustive lists.<|im_end|>
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