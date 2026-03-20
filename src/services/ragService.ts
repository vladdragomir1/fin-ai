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
   * SMART REFRESH: Fetches modules based on what the user is asking about
   */
  private async refreshCompanyData(
    symbol: string, 
    onProgress?: (message: string, detail?: string) => void,
    modules?: ReturnType<typeof this.detectRelevantModules>
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
      
      const coreSuccessCount = coreResults.filter(r => r.status === 'fulfilled').length;
      if (coreSuccessCount > 0) {
        console.log(`RAG: ✅ Refreshed ${coreSuccessCount}/3 core endpoints for ${symbol}`);
      }
      
      // ⚡ SMART MODULE FETCHING: Only fetch what's needed based on query
      if (coreSuccessCount >= 2) {
        onProgress?.('Loading financial modules...', `Analysis data`);
        
        // Build list of modules to fetch based on user query
        const modulesToFetch: string[] = [
          'financial-data',        // Always - has margins, ROE, target price
          'earnings-history',      // Always - earnings data
          'recommendation-trend',  // Always - analyst ratings
          'calendar-events',       // Always - next earnings date
        ];
        
        // Add extra modules based on what user is asking about
        if (modules?.technicals) {
          // Technical indicators are fetched separately via getIndicator methods
          onProgress?.('Loading technical indicators...', 'RSI, MACD, SMA, ADX');
          await Promise.allSettled([
            financeApiService.getSMAIndicator(symbol),
            financeApiService.getRSIIndicator(symbol),
            financeApiService.getMACDIndicator(symbol),
            financeApiService.getADXIndicator(symbol),
          ]);
        }
        
        if (modules?.insiders) {
          modulesToFetch.push('insider-holders');
          modulesToFetch.push('net-share-purchase-activity');
        }
        
        if (modules?.institutions) {
          modulesToFetch.push('institution-ownership');
        }
        
        if (modules?.financials) {
          modulesToFetch.push('income-statement');
          modulesToFetch.push('balance-sheet');
          modulesToFetch.push('cashflow-statement');
        }
        
        if (modules?.analysts) {
          modulesToFetch.push('upgrade-downgrade-history');
        }
        
        if (modules?.filings) {
          modulesToFetch.push('sec-filings');
        }
        
        // Fetch all required modules in parallel
        const extendedResults = await Promise.allSettled(
          modulesToFetch.map(mod => financeApiService.getStockModule(symbol, mod))
        );
        
        const extendedSuccessCount = extendedResults.filter(r => r.status === 'fulfilled').length;
        console.log(`RAG: ✅ Refreshed ${extendedSuccessCount}/${modulesToFetch.length} modules for ${symbol}`);
      }
      
      // ⚡ Mark as refreshed to prevent redundant calls
      markRefreshed(cacheKey);
      onProgress?.('Data ready', symbol);
      
    } catch (error) {
      console.warn(`RAG: Could not refresh ${symbol} (using cached data)`, error);
    }
  }

  /**
   * Detect what data modules are relevant based on user query
   * Returns flags for which sections to include in context
   */
  private detectRelevantModules(query: string): {
    core: boolean;        // Always true - price, overview, metrics
    technicals: boolean;  // RSI, MACD, SMA, ADX
    insiders: boolean;    // Insider holders, transactions
    institutions: boolean;// Institutional ownership
    financials: boolean;  // Income statement, balance sheet, cash flow
    earnings: boolean;    // Earnings history, calendar
    analysts: boolean;    // Recommendations, upgrades/downgrades
    filings: boolean;     // SEC filings
    historical: boolean;  // Price history
    news: boolean;        // Market news mentioning the company
    ipoDate: boolean;     // First trading date (approx IPO date)
  } {
    const q = query.toLowerCase();
    
    // Detect "why" questions about price movement - needs historical + analysts + earnings + news
    const isWhyQuestion = /\b(why|reason|cause|what happened|drop|crash|fall|decline|surge|rally|spike|plunge|tank)\b/.test(q);
    
    // Detect "should I buy/invest" questions - needs comprehensive data for decision
    const isBuyQuestion = /\b(should i (buy|invest|get)|worth (buying|investing)|good (buy|investment)|buy or (sell|hold)|invest in)\b/.test(q);
    
    // Detect dividend questions (handle plurals: dividend/dividends)
    const isDividendQuestion = /\b(dividends?|yield|payout|passive income|income stock)\b/.test(q);
    
    // Detect risk/safety questions
    const isRiskQuestion = /\b(risk|risky|safe|volatile|volatility|stable|stability|dangerous|gamble)\b/.test(q);
    
    // Detect growth questions
    const isGrowthQuestion = /\b(grow|growth|growing|expand|expansion|future|potential|upside)\b/.test(q);
    
    // Detect value/valuation questions
    const isValueQuestion = /\b(undervalued|overvalued|fair value|cheap|expensive|valuation|worth|value play)\b/.test(q);
    
    // Detect IPO/split questions
    const isIpoSplitQuestion = /\b(ipo|split|went public|public offering|when did .* (ipo|go public|start trading))\b/.test(q);
    
    return {
      core: true, // Always include
      // IPO date for IPO-related questions - uses ALL historical data to find first trading date
      ipoDate: isIpoSplitQuestion || /\b(when did|since when|how long|how old|first traded|trading since)\b/.test(q),
      // Technicals for: technical questions, buy decisions, risk assessment
      technicals: isBuyQuestion || isRiskQuestion || /\b(rsi|macd|sma|adx|technical|indicator|overbought|oversold|moving average|momentum|signal|crossover|trend)\b/.test(q),
      insiders: /\b(insider|ceo|cfo|executive|director|officer|bought|sold|purchase|transaction|management)\b/.test(q),
      institutions: /\b(institution|hedge fund|mutual fund|ownership|holder|13f|whale|big money)\b/.test(q),
      // Financials for: financial questions, buy decisions, growth, value, risk, dividends (payout ratio, FCF)
      financials: isBuyQuestion || isGrowthQuestion || isValueQuestion || isRiskQuestion || isDividendQuestion || /\b(revenue|income|balance sheet|cash flow|debt|assets|liabilities|profit|loss|margin|ebitda|operating|gross|net income|financial statement)\b/.test(q),
      // Earnings for: why questions, buy decisions, growth questions
      earnings: isWhyQuestion || isBuyQuestion || isGrowthQuestion || /\b(earnings|eps|quarter|q[1-4]|beat|miss|guidance|report|fiscal)\b/.test(q),
      // Analysts for: why questions, buy decisions, value questions
      analysts: isWhyQuestion || isBuyQuestion || isValueQuestion || /\b(analyst|rating|upgrade|downgrade|buy|sell|hold|target|price target|recommendation|wall street)\b/.test(q),
      filings: /\b(sec|filing|10-k|10-q|8-k|annual report|quarterly report)\b/.test(q),
      // Historical for: why questions, buy decisions, growth, risk, performance, dividends (history)
      historical: isWhyQuestion || isBuyQuestion || isGrowthQuestion || isRiskQuestion || isDividendQuestion || /\b(history|historical|past|year|month|week|performance|return|chart|trend|52.week|all.time)\b/.test(q),
      // News for: why questions, IPO/split questions, dividend questions (ex-dates), explicit news requests
      news: isWhyQuestion || isIpoSplitQuestion || isDividendQuestion || /\b(news|headline|article|announcement|press|report)\b/.test(q),
    };
  }

  /**
   * Build context for LLM about a specific company
   * SMART CONTEXT: Includes relevant data based on user query
   * @param symbol - Stock symbol
   * @param onProgress - Progress callback
   * @param userQuery - Optional user query to determine what data to include
   */
  async buildCompanyContext(
    symbol: string,
    onProgress?: (message: string, detail?: string) => void,
    userQuery?: string
  ): Promise<string> {
    console.log(`[RAG] Building context for ${symbol}`);
    
    // Detect what data modules are relevant based on user query
    const modules = userQuery ? this.detectRelevantModules(userQuery) : {
      core: true, technicals: false, insiders: false, institutions: false,
      financials: false, earnings: true, analysts: true, filings: false, historical: false, news: false, ipoDate: false
    };
    
    console.log(`[RAG] Smart context modules:`, modules);
    
    // 1. TRIGGER REFRESH (API -> SQLite)
    await this.refreshCompanyData(symbol, onProgress, modules);

    onProgress?.('Reading from database...', symbol);
    
    // 2. READ from SQLite (Now contains fresh data)
    const data = await databaseService.getCompanyDataForRAG(symbol);
    
    // Log comprehensive data availability
    console.log(`[RAG] Data retrieved for ${symbol}:`, {
      quote: !!data.quote,
      overview: !!data.overview,
      metrics: !!data.metrics,
      historical: data.historical?.length || 0,
      financialData: !!data.financialData,
      earnings: data.earnings?.history?.length || (Array.isArray(data.earnings) ? data.earnings.length : 0),
      recommendations: data.recommendations?.trend?.length || 0,
      insiders: data.insiders?.holders?.length || 0,
      institutions: data.institutions?.ownershipList?.length || 0,
      technicals: !!(data.technicalIndicators?.sma || data.technicalIndicators?.rsi),
    });
    
    if (!data.quote && !data.overview && !data.metrics) {
      console.warn(`[RAG] No data found for ${symbol} after refresh attempt`);
      return `### ${symbol}\n\nNo financial data available yet. Try searching for this company in the Browse Stocks screen first.`;
    }

    let context = `### ${symbol}\n`;

    // === CORE DATA (Always included) ===
    if (data.overview) {
      context += `**${data.overview.name}** | ${data.overview.sector} | ${data.overview.industry}\n`;
    }

    if (data.quote) {
      context += `**Stock Price:** $${safeFixed(data.quote.price)} (${data.quote.change >= 0 ? '+' : ''}${safeFixed(data.quote.changePercent)}%)\n`;
    }

    if (data.metrics) {
      // Market cap on its own line for clarity (especially in comparisons)
      if (data.metrics.marketCap) {
        const mcapB = parseFloat(safeBillion(data.metrics.marketCap));
        const mcapStr = mcapB >= 1000 ? `$${safeFixed(mcapB / 1000)}T` : `$${mcapB.toFixed(2)}B`;
        context += `**Market Cap:** ${mcapStr}\n`;
      }
      const parts = [];
      if (data.metrics.peRatio) parts.push(`P/E ${safeFixed(data.metrics.peRatio)}`);
      if (data.metrics.eps) parts.push(`EPS $${safeFixed(data.metrics.eps)}`);
      if (parts.length > 0) context += `**Valuation:** ${parts.join(' | ')}\n`;
      
      // Dividend info on its own line for clarity
      if (data.metrics.dividendYield !== undefined && data.metrics.dividendYield !== null) {
        if (data.metrics.dividendYield > 0) {
          context += `**Dividend:** Yes, ${safeFixed(data.metrics.dividendYield)}% yield\n`;
        } else {
          context += `**Dividend:** No dividend (0%)\n`;
        }
      }
    }

    // === EARNINGS (if relevant or default) ===
    if (modules.earnings) {
      const earningsList = data.earnings?.history || (Array.isArray(data.earnings) ? data.earnings : null);
      if (earningsList && earningsList.length > 0) {
        context += `**Earnings History:** `;
        const parts = earningsList.slice(-4).map((e: any) => {
          let dateStr = e.quarterDisplay?.fmt || e.quarter?.fmt || e.fiscalDateEnding || 'Q?';
          const eps = e.epsActual?.raw ?? e.epsActual ?? e.actual;
          const est = e.epsEstimate?.raw ?? e.epsEstimate;
          const surprise = eps && est ? (eps > est ? '✓beat' : '✗miss') : '';
          return `${dateStr}: $${safeFixed(eps)} ${surprise}`;
        });
        context += parts.join(', ') + '\n';
      }
      
      if (data.calendarEvents?.earnings?.earningsDate?.[0]) {
        const earningsDate = data.calendarEvents.earnings.earningsDate[0];
        const dateStr = earningsDate.fmt || (earningsDate.raw ? new Date(earningsDate.raw * 1000).toLocaleDateString() : null);
        if (dateStr) context += `**Next Earnings:** ${dateStr}\n`;
      }
    }

    // === ANALYSTS (if relevant or default) ===
    if (modules.analysts) {
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
      
      if (data.financialData?.targetMeanPrice) {
        const target = data.financialData.targetMeanPrice.raw ?? data.financialData.targetMeanPrice;
        context += `**Price Target:** $${safeFixed(target)}\n`;
      }
      
      // Upgrade/Downgrade history
      const upgrades = data.upgradeDowngrade?.history || (Array.isArray(data.upgradeDowngrade) ? data.upgradeDowngrade : null);
      if (upgrades && upgrades.length > 0) {
        context += `**Recent Ratings:** `;
        const recent = upgrades.slice(0, 3).map((u: any) => {
          const firm = u.firm || 'Analyst';
          const action = u.action || u.toGrade || '';
          return `${firm}: ${action}`;
        });
        context += recent.join(', ') + '\n';
      }
    }

    // === FINANCIALS (only if asked about revenue, income, etc.) ===
    if (modules.financials) {
      if (data.financialData) {
        const fd = data.financialData;
        const getValue = (val: any) => val?.raw ?? val;
        context += `**Financial Metrics:**\n`;
        if (fd.totalRevenue) context += `- Revenue: $${safeBillion(getValue(fd.totalRevenue))}B\n`;
        if (fd.grossProfits) context += `- Gross Profit: $${safeBillion(getValue(fd.grossProfits))}B\n`;
        if (fd.ebitda) context += `- EBITDA: $${safeBillion(getValue(fd.ebitda))}B\n`;
        if (fd.profitMargins) context += `- Profit Margin: ${safePercent(getValue(fd.profitMargins))}%\n`;
        if (fd.operatingMargins) context += `- Operating Margin: ${safePercent(getValue(fd.operatingMargins))}%\n`;
        if (fd.returnOnEquity) context += `- ROE: ${safePercent(getValue(fd.returnOnEquity))}%\n`;
        if (fd.returnOnAssets) context += `- ROA: ${safePercent(getValue(fd.returnOnAssets))}%\n`;
        if (fd.debtToEquity) context += `- Debt/Equity: ${safeFixed(getValue(fd.debtToEquity))}\n`;
        if (fd.currentRatio) context += `- Current Ratio: ${safeFixed(getValue(fd.currentRatio))}\n`;
        if (fd.freeCashflow) context += `- Free Cash Flow: $${safeBillion(getValue(fd.freeCashflow))}B\n`;
      }
      
      // Income Statement highlights
      if (data.incomeStatement && data.incomeStatement.length > 0) {
        const latest = data.incomeStatement[0];
        context += `**Latest Income Statement:**\n`;
        if (latest.totalRevenue) context += `- Total Revenue: $${safeBillion(latest.totalRevenue.raw || latest.totalRevenue)}B\n`;
        if (latest.netIncome) context += `- Net Income: $${safeBillion(latest.netIncome.raw || latest.netIncome)}B\n`;
      }
      
      // Balance Sheet highlights
      if (data.balanceSheet && data.balanceSheet.length > 0) {
        const latest = data.balanceSheet[0];
        context += `**Balance Sheet:**\n`;
        if (latest.totalAssets) context += `- Total Assets: $${safeBillion(latest.totalAssets.raw || latest.totalAssets)}B\n`;
        if (latest.totalDebt) context += `- Total Debt: $${safeBillion(latest.totalDebt.raw || latest.totalDebt)}B\n`;
        if (latest.totalCash) context += `- Cash: $${safeBillion(latest.totalCash.raw || latest.totalCash)}B\n`;
      }
    }

    // === TECHNICAL INDICATORS (only if asked about RSI, MACD, etc.) ===
    if (modules.technicals && data.technicalIndicators) {
      context += `**Technical Indicators:**\n`;
      
      if (data.technicalIndicators.rsi) {
        const rsi = data.technicalIndicators.rsi;
        const latestRSI = Array.isArray(rsi) ? rsi[rsi.length - 1]?.value : rsi.value;
        if (latestRSI) {
          const signal = latestRSI > 70 ? '(Overbought)' : latestRSI < 30 ? '(Oversold)' : '(Neutral)';
          context += `- RSI(14): ${safeFixed(latestRSI)} ${signal}\n`;
        }
      }
      
      if (data.technicalIndicators.macd) {
        const macd = data.technicalIndicators.macd;
        const latest = Array.isArray(macd) ? macd[macd.length - 1] : macd;
        if (latest) {
          const macdLine = latest.macd || latest.MACD;
          const signalLine = latest.signal || latest.MACDSignal;
          const histogram = latest.histogram || latest.MACDHist;
          if (macdLine !== undefined) {
            const trend = histogram > 0 ? '(Bullish)' : '(Bearish)';
            context += `- MACD: ${safeFixed(macdLine)}, Signal: ${safeFixed(signalLine)} ${trend}\n`;
          }
        }
      }
      
      if (data.technicalIndicators.sma) {
        const sma = data.technicalIndicators.sma;
        const latest = Array.isArray(sma) ? sma[sma.length - 1] : sma;
        if (latest?.value || latest?.SMA) {
          const smaValue = latest.value || latest.SMA;
          const aboveBelow = data.quote?.price > smaValue ? 'above' : 'below';
          context += `- SMA(50): $${safeFixed(smaValue)} (price ${aboveBelow})\n`;
        }
      }
      
      if (data.technicalIndicators.adx) {
        const adx = data.technicalIndicators.adx;
        const latest = Array.isArray(adx) ? adx[adx.length - 1] : adx;
        if (latest?.ADX || latest?.value) {
          const adxValue = latest.ADX || latest.value;
          const strength = adxValue > 25 ? '(Strong Trend)' : '(Weak Trend)';
          context += `- ADX: ${safeFixed(adxValue)} ${strength}\n`;
        }
      }
    }

    // === INSIDER TRADING (only if asked about insiders, CEO, etc.) ===
    if (modules.insiders) {
      const holders = data.insiders?.holders || (Array.isArray(data.insiders) ? data.insiders : null);
      if (holders && holders.length > 0) {
        context += `**Insider Holdings:**\n`;
        holders.slice(0, 5).forEach((h: any) => {
          const name = h.name || 'Unknown';
          const relation = h.relation || h.position || '';
          const shares = h.positionDirect?.raw || h.shares || 0;
          if (shares > 0) {
            context += `- ${name} (${relation}): ${(shares / 1e6).toFixed(2)}M shares\n`;
          }
        });
      }
      
      // Net share purchases
      if (data.netSharePurchase) {
        const nsp = data.netSharePurchase;
        if (nsp.netPercentInsiderShares?.raw) {
          context += `**Insider Activity:** Net ${nsp.netPercentInsiderShares.raw > 0 ? 'buying' : 'selling'} (${safePercent(Math.abs(nsp.netPercentInsiderShares.raw))}%)\n`;
        }
      }
    }

    // === INSTITUTIONAL OWNERSHIP (only if asked) ===
    if (modules.institutions) {
      const instList = data.institutions?.ownershipList || (Array.isArray(data.institutions) ? data.institutions : null);
      if (instList && instList.length > 0) {
        context += `**Top Institutional Holders:**\n`;
        instList.slice(0, 5).forEach((inst: any) => {
          const name = inst.organization || inst.holder || 'Unknown';
          const pctHeld = inst.pctHeld?.raw || inst.percentHeld || 0;
          const shares = inst.position?.raw || inst.shares || 0;
          context += `- ${name}: ${safePercent(pctHeld)}% (${(shares / 1e6).toFixed(1)}M shares)\n`;
        });
      }
    }

    // === SEC FILINGS (only if asked) ===
    if (modules.filings) {
      const filings = data.secFilings?.filings || (Array.isArray(data.secFilings) ? data.secFilings : null);
      if (filings && filings.length > 0) {
        context += `**Recent SEC Filings:**\n`;
        filings.slice(0, 5).forEach((f: any) => {
          const type = f.type || f.form || 'Filing';
          const date = f.date || f.filedAt || '';
          const title = f.title || '';
          context += `- ${type} (${date}): ${title.substring(0, 50)}...\n`;
        });
      }
    }

    // === HISTORICAL PERFORMANCE (only if asked about past performance) ===
    if (modules.historical && data.historical && data.historical.length > 0) {
      const hist = data.historical;
      const latest = hist[hist.length - 1];
      const oldest = hist[0];
      if (latest && oldest && oldest.price > 0) {
        const change = ((latest.price - oldest.price) / oldest.price) * 100;
        context += `**Historical:** ${change >= 0 ? '+' : ''}${safeFixed(change)}% over period\n`;
      }
      
      // 52-week high/low from metrics
      if (data.metrics?.weekHigh52 && data.metrics?.weekLow52) {
        context += `**52-Week Range:** $${safeFixed(data.metrics.weekLow52)} - $${safeFixed(data.metrics.weekHigh52)}\n`;
      }
    }

    // === IPO DATE / TRADING HISTORY ===
    // Note: TradingView chart (displayed to user) has FULL history back to IPO
    // Our API data may be limited to ~10 years, but the chart shows everything
    if (modules.ipoDate) {
      try {
        // Fetch ALL historical data to get what we have
        console.log(`[RAG] 📅 Fetching trading history for ${symbol}...`);
        const allHistory = await financeApiService.getHistoricalData(symbol, 'ALL', true);
        
        if (allHistory && allHistory.length > 0) {
          // Sort by timestamp to ensure oldest first
          const sorted = [...allHistory].sort((a, b) => a.timestamp - b.timestamp);
          const firstTrade = sorted[0];
          const latestTrade = sorted[sorted.length - 1];
          
          console.log(`[RAG] 📅 Found ${sorted.length} months of data`);
          console.log(`[RAG] 📅 Oldest: ${firstTrade?.date}, Latest: ${latestTrade?.date}`);
          
          if (firstTrade && firstTrade.date) {
            const firstDate = new Date(firstTrade.date);
            const yearsAgo = Math.floor((Date.now() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            const monthsAgo = Math.floor((Date.now() - firstDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
            const monthYear = firstDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            
            // Determine if this is likely the actual IPO or just data limit
            // Companies that IPO'd recently (< 8 years) will have full data
            const isLikelyActualIPO = yearsAgo < 8;
            
            if (isLikelyActualIPO) {
              // Newer company - this is likely the actual IPO
              const tradingDuration = yearsAgo > 0 ? `~${yearsAgo} years` : `~${monthsAgo} months`;
              context += `**First Trading Date (IPO):** ${monthYear} (${tradingDuration} ago)\n`;
              
              // Add IPO price and total return
              if (firstTrade.price && firstTrade.price > 0) {
                const currentPrice = data.quote?.price || latestTrade?.price || 0;
                if (currentPrice > 0) {
                  const totalReturn = ((currentPrice - firstTrade.price) / firstTrade.price) * 100;
                  context += `**Since IPO:** $${firstTrade.price.toFixed(2)} → $${currentPrice.toFixed(2)} (${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(0)}%)\n`;
                }
              }
            } else {
              // Older company - we have partial data, user can check chart for full history
              // IMPORTANT: Be very explicit so LLM doesn't hallucinate a fake IPO date
              context += `**IPO Date:** UNKNOWN - data only available from ${monthYear}\n`;
              context += `**IMPORTANT:** Do NOT guess the IPO date. Tell the user to check the TradingView chart "ALL" view for the actual IPO date.\n`;
            }
          }
        } else {
          console.log(`[RAG] 📅 No historical data available for ${symbol}`);
        }
      } catch (err) {
        console.warn(`[RAG] Could not fetch trading history for ${symbol}:`, err);
      }
    }

    // === NEWS & CALENDAR (for "why" questions - search for company mentions) ===
    if (modules.news) {
      const companyName = data.overview?.name || symbol;
      
      // Search market news for mentions of this company
      const newsContext = await this.getCompanyNewsContext(symbol, companyName);
      if (newsContext) context += newsContext;
      
      // Search earnings calendar for this company
      const calendarContext = await this.getCompanyCalendarContext(symbol, companyName);
      if (calendarContext) context += calendarContext;
    }

    return context;
  }

  /**
   * Get news articles mentioning a specific company
   */
  private async getCompanyNewsContext(symbol: string, companyName: string): Promise<string> {
    try {
      const news = await databaseService.getMarketData('news_v2_ALL_ALL', 60 * 60 * 1000);
      if (!news || news.length === 0) return '';

      // Search for news mentioning this company (symbol or name)
      const symbolUpper = symbol.toUpperCase();
      const nameLower = companyName.toLowerCase();
      const nameWords = nameLower.split(/\s+/).filter(w => w.length > 3); // Skip short words like "Inc"
      
      const relevantNews = news.filter((article: any) => {
        const title = (article.title || '').toLowerCase();
        const summary = (article.summary || '').toLowerCase();
        const text = title + ' ' + summary;
        
        // Check if symbol or company name is mentioned
        return text.includes(symbolUpper.toLowerCase()) || 
               nameWords.some(word => text.includes(word));
      }).slice(0, 3); // Max 3 relevant articles

      if (relevantNews.length === 0) return '';

      let context = `**Recent News about ${companyName}:**\n`;
      relevantNews.forEach((article: any, index: number) => {
        context += `${index + 1}. ${article.title}\n`;
        if (article.pubDate) context += `   Date: ${article.pubDate}\n`;
        if (article.summary) {
          const summary = article.summary.length > 200 
            ? article.summary.substring(0, 200) + '...' 
            : article.summary;
          context += `   ${summary}\n`;
        }
      });
      return context + '\n';
    } catch (error) {
      console.warn('[RAG] Failed to search company news:', error);
      return '';
    }
  }

  /**
   * Get calendar events for a specific company (earnings, dividends, etc.)
   */
  private async getCompanyCalendarContext(symbol: string, companyName: string): Promise<string> {
    try {
      let context = '';
      const symbolUpper = symbol.toUpperCase();
      
      // Check earnings calendar
      const earnings = await databaseService.getMarketData('calendar_earnings', 60 * 60 * 1000);
      if (earnings && earnings.length > 0) {
        const companyEarnings = earnings.filter((e: any) => {
          const ticker = (e.ticker || e.symbol || '').toUpperCase();
          return ticker === symbolUpper;
        });
        
        if (companyEarnings.length > 0) {
          context += `**Upcoming Earnings for ${symbol}:**\n`;
          companyEarnings.slice(0, 2).forEach((e: any) => {
            const date = e.date || e.earningsDate || e.reportDate;
            const epsEst = e.eps_estimate || e.epsEstimate;
            const epsAct = e.eps_actual || e.epsActual;
            context += `- Date: ${date}`;
            if (epsEst) context += `, Est: $${epsEst}`;
            if (epsAct) context += `, Actual: $${epsAct}`;
            context += '\n';
          });
        }
      }
      
      // Check dividends calendar
      const today = new Date().toISOString().split('T')[0];
      const dividends = await databaseService.getMarketData(`calendar_dividends_${today}`, 60 * 60 * 1000);
      if (dividends && Array.isArray(dividends) && dividends.length > 0) {
        const companyDividends = dividends.filter((d: any) => {
          const ticker = (d.ticker || d.symbol || '').toUpperCase();
          return ticker === symbolUpper;
        });
        
        if (companyDividends.length > 0) {
          context += `**Dividend Info for ${symbol}:**\n`;
          companyDividends.slice(0, 1).forEach((d: any) => {
            if (d.exDate) context += `- Ex-Date: ${d.exDate}\n`;
            if (d.payDate) context += `- Pay Date: ${d.payDate}\n`;
            if (d.amount) context += `- Amount: $${d.amount}\n`;
          });
        }
      }
      
      // Check stock splits calendar
      const splits = await databaseService.getMarketData('calendar_splits', 60 * 60 * 1000);
      if (splits && Array.isArray(splits) && splits.length > 0) {
        const companySplits = splits.filter((s: any) => {
          const ticker = (s.ticker || s.symbol || '').toUpperCase();
          return ticker === symbolUpper;
        });
        
        if (companySplits.length > 0) {
          context += `**Stock Split for ${symbol}:**\n`;
          companySplits.slice(0, 1).forEach((s: any) => {
            const date = s.date || s.splitDate || s.exDate;
            const ratio = s.ratio || s.splitRatio || `${s.toFactor || '?'}:${s.fromFactor || '?'}`;
            context += `- Date: ${date}, Ratio: ${ratio}\n`;
          });
        }
      }
      
      // Check IPO calendar (if company recently IPO'd)
      const currentMonth = new Date().toISOString().slice(0, 7);
      const ipos = await databaseService.getMarketData(`calendar_ipo_${currentMonth}`, 60 * 60 * 1000);
      if (ipos) {
        const allIpos = [...(ipos.upcoming || []), ...(ipos.priced || [])];
        const companyIpo = allIpos.filter((i: any) => {
          const ticker = (i.ticker || i.symbol || '').toUpperCase();
          return ticker === symbolUpper;
        });
        
        if (companyIpo.length > 0) {
          context += `**IPO Info for ${symbol}:**\n`;
          companyIpo.slice(0, 1).forEach((i: any) => {
            const date = i.date || i.ipoDate || i.pricedDate;
            const price = i.price || i.ipoPrice || i.offerPrice;
            context += `- IPO Date: ${date}`;
            if (price) context += `, Price: $${price}`;
            context += '\n';
          });
        }
      }
      
      // Check public offerings calendar
      const offerings = await databaseService.getMarketData(`calendar_offerings_${currentMonth}`, 60 * 60 * 1000);
      if (offerings) {
        const allOfferings = [...(offerings.upcoming || []), ...(offerings.priced || [])];
        const companyOffering = allOfferings.filter((o: any) => {
          const ticker = (o.ticker || o.symbol || '').toUpperCase();
          return ticker === symbolUpper;
        });
        
        if (companyOffering.length > 0) {
          context += `**Public Offering for ${symbol}:**\n`;
          companyOffering.slice(0, 1).forEach((o: any) => {
            const date = o.date || o.pricedDate;
            const shares = o.shares || o.numberOfShares;
            const price = o.price || o.offerPrice;
            context += `- Date: ${date}`;
            if (shares) context += `, Shares: ${(shares / 1e6).toFixed(1)}M`;
            if (price) context += `, Price: $${price}`;
            context += '\n';
          });
        }
      }
      
      // Add recent economic events (macro context that affects all stocks)
      const economicEvents = await databaseService.getMarketData('calendar_economic_events', 60 * 60 * 1000);
      if (economicEvents && economicEvents.length > 0) {
        // Get only high-impact recent events (Fed, CPI, GDP, Jobs)
        const importantEvents = economicEvents.filter((e: any) => {
          const eventName = (e.event || e.eventName || e.name || '').toLowerCase();
          const impact = (e.impact || e.importance || '').toLowerCase();
          return impact === 'high' || 
                 eventName.includes('fed') || 
                 eventName.includes('fomc') ||
                 eventName.includes('interest rate') ||
                 eventName.includes('cpi') ||
                 eventName.includes('inflation') ||
                 eventName.includes('gdp') ||
                 eventName.includes('employment') ||
                 eventName.includes('jobs');
        }).slice(0, 3);
        
        if (importantEvents.length > 0) {
          context += `**Recent Economic Events (may affect stock):**\n`;
          importantEvents.forEach((e: any) => {
            const eventName = e.event || e.eventName || e.name;
            const date = e.date || e.eventDate;
            context += `- ${date}: ${eventName}\n`;
          });
        }
      }
      
      return context;
    } catch (error) {
      console.warn('[RAG] Failed to search company calendar:', error);
      return '';
    }
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
    // NOTE: 'undervalued' excluded - it often appears in company-specific questions like "Is AAPL undervalued?"
    const marketMoversKeywords = [
      'gainer', 'gainers', 'loser', 'losers', 'active', 'actives', 
      'mover', 'movers', 'winner', 'winners', 'performer', 'performers', 
      'top stocks', 'hot stocks', 'trending stocks', 'best stocks today',
      'worst stocks today', 'biggest gain', 'biggest loss', 'biggest drop',
      'market today', "today's market", "what's hot", "what's up", "what's down",
      'most traded', 'high volume', 'cheap stocks', 'value stocks',
      'undervalued stocks', 'undervalued large caps' // Only trigger for explicit "undervalued stocks" queries
    ];
    // Only trigger market movers if NO specific company is mentioned
    const hasCompanyMention = allSymbols.some(s => queryLower.includes(s.toLowerCase())) ||
      Object.keys(this.getCommonCompaniesMap()).some(c => queryLower.includes(c));
    if (!hasCompanyMention && marketMoversKeywords.some(k => queryLower.includes(k))) {
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

    // --- PRIORITY 0E: IPO Calendar (ONLY for general queries, not company-specific) ---
    // "When did NIO IPO?" should go to company context, not IPO calendar
    const ipoKeywords = [
      'ipos', 'initial public offering', 'going public', 'new listing',
      'upcoming ipo', 'ipo calendar', 'ipo this week', 'ipo schedule',
      'recent ipo', 'new stocks', 'newly listed', 'ipo market', 'hot ipo'
    ];
    // Only trigger for general IPO queries (no specific company mentioned)
    if (!hasCompanyMention && ipoKeywords.some(k => queryLower.includes(k))) {
      console.log(`[RAG] 🎯 PRIORITY: IPO Calendar query detected (general)`);
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
      'asml': 'ASML', 'tsmc': 'TSM', 'taiwan semi': 'TSM', 'taiwan semiconductor': 'TSM',
      'taiwansemiconductor': 'TSM', 'tsm': 'TSM'
    };

    // =========================================================================
    // COLLECT ALL mentioned symbols FIRST (for comparison detection)
    // =========================================================================
    const mentionedInQuery: Set<string> = new Set();
    const matchedCompanyNames: Set<string> = new Set(); // Track matched company names to avoid double-matching
    
    // Check company names from map
    for (const [companyName, symbol] of Object.entries(queryCompanyMap)) {
      if (isStandaloneWord(queryLower, companyName) && allSymbols.includes(symbol)) {
        mentionedInQuery.add(symbol);
        matchedCompanyNames.add(companyName.toUpperCase());
        // Also add individual words to prevent "coca cola" from also matching "COLA"
        companyName.split(/\s+/).forEach(word => matchedCompanyNames.add(word.toUpperCase()));
        console.log(`[RAG] 🎯 Found "${companyName}" (${symbol}) in query`);
      }
    }
    
    // Also check for direct symbol mentions (e.g., "NVDA", "TSLA")
    // But skip if the symbol was already part of a matched company name
    for (const sym of allSymbols) {
      if (sym.length >= 2 && 
          isStandaloneWord(cleanQuery.toUpperCase(), sym) && 
          !commonEnglishWords.has(sym) &&
          !matchedCompanyNames.has(sym)) { // Skip if part of company name already matched
        mentionedInQuery.add(sym);
        console.log(`[RAG] 🎯 Found symbol ${sym} in query`);
      }
    }
    
    // If MULTIPLE symbols found → build comparison context
    if (mentionedInQuery.size >= 2) {
      const symbolsArray = Array.from(mentionedInQuery).slice(0, 3); // Max 3 for context size
      console.log(`[RAG] 📊 COMPARISON: ${symbolsArray.join(' vs ')}`);
      reportProgress('Comparing ' + symbolsArray.join(' vs ') + '...');
      
      const contexts: string[] = [];
      for (const sym of symbolsArray) {
        const context = await this.buildCompanyContext(sym, buildContextProgress, cleanQuery);
        contexts.push(context);
      }
      
      return `${contexts.join('\n\n---\n\n')}\n\n**Compare these companies based on the user's question.**`;
    }
    
    // If SINGLE symbol found → return its context
    if (mentionedInQuery.size === 1) {
      const symbol = Array.from(mentionedInQuery)[0];
      console.log(`[RAG] 🎯 PRIORITY: Single company ${symbol} in CURRENT QUERY`);
      reportProgress('Looking up ' + symbol + '...');
      return await this.buildCompanyContext(symbol, buildContextProgress, cleanQuery);
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
          return await this.buildCompanyContext(symbol, buildContextProgress, cleanQuery);
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
          return await this.buildCompanyContext(sym, buildContextProgress, cleanQuery);
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
              return await this.buildCompanyContext(sym, buildContextProgress, cleanQuery);
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
        const context = await this.buildCompanyContext(sym, buildContextProgress, cleanQuery);
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
      return await this.buildCompanyContext(symbol, buildContextProgress, cleanQuery);
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
          return await this.buildCompanyContext(sym, buildContextProgress, cleanQuery);
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
          return await this.buildCompanyContext(sym, buildContextProgress, cleanQuery);
        }
        
        // Third: Check individual significant words (original logic)
        const companyWords = overview.name.toLowerCase().split(/[\s,]+/);
        for (const companyWord of companyWords) {
          // Match significant words (4+ chars to avoid false positives)
          if (companyWord.length >= 4 && queryLower.includes(companyWord)) {
            console.log(`[RAG] Found company word match: ${overview.name} (${sym})`);
            reportProgress('Found ' + overview.name, sym);
            return await this.buildCompanyContext(sym, buildContextProgress, cleanQuery);
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
- Don't repeat data the user can already see
- ONLY use data from the context above - NEVER make up facts, dates, or numbers
- If data says "UNKNOWN" or tells you NOT to guess, follow that instruction exactly
- If you don't have enough data, be honest and say so<|im_end|>
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