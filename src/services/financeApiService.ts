import {
  Company,
  CompanyOverview,
  StockQuote,
  FinancialMetrics,
} from '@/types';

import { databaseService } from './databaseService';
import { offlineDataService } from './offlineDataService';
import { FINANCIAL_API_KEY, FINANCIAL_API_HOST } from '@env';

class FinanceApiService {
  private initialized = false;
  // Ensure we use https
  private baseURL = `https://${FINANCIAL_API_HOST}`;
  
  // Rate limiting
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 250; // 250ms between requests (max 4 requests/second) - increased to prevent 429 errors

  private get headers() {
    return {
      'X-RapidAPI-Key': FINANCIAL_API_KEY,
      'X-RapidAPI-Host': FINANCIAL_API_HOST,
    };
  }

  // Helper: Add delay between requests to prevent rate limiting
  private async throttleRequest(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }
    
    this.lastRequestTime = Date.now();
  }

  // --- HELPER: Clean strings like "$157.30" -> 157.30 ---
  private parsePrice(value: string | number): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    // Remove '$' and ',' 
    return parseFloat(value.replace(/[$,]/g, ''));
  }

  // --- HELPER: Clean percents like "+1.24%" or "1.24%" -> 1.24 ---
  private parsePercent(value: string | number): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    // Remove '%', '+', and ',' 
    return parseFloat(value.toString().replace(/[%+,]/g, ''));
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await databaseService.initialize();
      this.initialized = true;
    }
  }

  // =========================================================================
  // 1. SEARCH COMPANIES
  // Endpoint: /v1/markets/search (Mboum Finance API)
  // Note: Uses API search endpoint directly for each query
  // =========================================================================

  async searchCompanies(query: string): Promise<Company[]> {
    await this.ensureInitialized();

    try {
      // 1. Check SQLite cache for this specific search query
      let cached: Company[] | null = null;
      try {
        cached = await databaseService.getSearchCache(query);
      } catch (dbErr) {
        console.warn('SQLite search cache read failed', dbErr);
      }

      if (cached && cached.length > 0) {
        console.log('✅ Using cached search results from SQLite');
        return cached;
      }

      // 2. Use v1/markets/search endpoint (note: "markets" plural)
      await this.throttleRequest();
      console.log(`🔍 Searching API for "${query}"...`);
      
      const url = `${this.baseURL}/v1/markets/search?search=${encodeURIComponent(query)}`;
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      
      if (!response.ok) {
        console.warn(`⚠️ Search API returned ${response.status}, trying fallback...`);
        
        // Fallback: Try AsyncStorage
        try {
          const asCached = await offlineDataService.getCachedSearchResults(query);
          if (asCached && asCached.length > 0) {
            console.log('✅ Using AsyncStorage fallback');
            return asCached as Company[];
          }
        } catch (e) {
          console.warn('AsyncStorage fallback failed', e);
        }
        
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      let results = data.body || data.quotes || data;

      if (!Array.isArray(results)) {
        results = [];
      }

      console.log(`📦 Found ${results.length} results from API`);

      const companies: Company[] = results.slice(0, 50).map((item: any) => ({
        symbol: item.symbol || item.ticker,
        name: item.name || item.longName || item.shortName || item.symbol,
        exchange: item.exchange || item.exchDisp || 'N/A',
        currency: 'USD',
        country: 'USA',
      }));

      // 3. Save to cache
      if (companies.length > 0) {
        try {
          await databaseService.saveSearchCache(query, companies);
        } catch (saveErr) {
          console.warn('Saving search cache failed', saveErr);
        }
      }

      return companies;

    } catch (error) {
      console.warn('❌ Error searching companies:', error);
      // Fallback: Try reading cache
      try {
        const cached = await databaseService.getSearchCache(query);
        if (cached) return cached;
      } catch (e) {}

      // Last resort: Return mock data for common companies (when rate limited)
      console.log('💡 Using mock search results for common companies');
      const mockCompanies: { [key: string]: Company } = {
        'AAPL': { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'APPLE': { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'MSFT': { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'MICROSOFT': { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'GOOGL': { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'GOOGLE': { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'AMZN': { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'AMAZON': { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'TSLA': { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'TESLA': { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'META': { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'FACEBOOK': { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'NVDA': { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'NVIDIA': { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'NFLX': { symbol: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
        'NETFLIX': { symbol: 'NFLX', name: 'Netflix Inc.', exchange: 'NASDAQ', currency: 'USD', country: 'USA' },
      };

      const queryUpper = query.toUpperCase();
      if (mockCompanies[queryUpper]) {
        const result = [mockCompanies[queryUpper]];
        // Save to cache for future use
        try {
          await databaseService.saveSearchCache(query, result);
        } catch (e) {}
        return result;
      }

      return [];
    }
  }

  // =========================================================================
  // 2. GET STOCK QUOTE
  // Endpoint: /v1/markets/quote (Mboum Finance API)
  // Note: Also fetches from v1/markets/stock/modules?module=statistics for additional session data
  // =========================================================================
  async getStockQuote(symbol: string): Promise<StockQuote | null> {
    await this.ensureInitialized();

    try {
      // 1. Check Fresh Cache (< 24h)
      const cached = await databaseService.getStockQuote(symbol);
      if (cached) {
        console.log('✅ Using fresh cached quote from SQLite');
        return cached;
      }

      // 2. Fetch API - Get quote and today's history for session stats
      await this.throttleRequest();
      console.log('📊 Fetching Quote and Today Session Data...');
      
      const quoteResponse = await fetch(`${this.baseURL}/v1/markets/quote?symbol=${symbol}&type=STOCKS`, { 
        method: 'GET', 
        headers: this.headers 
      });
      
      const data = await quoteResponse.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit - using cache');
        throw new Error('Rate limit exceeded');
      }

      // Data structure can be:
      // 1. Regular quote: { body: { symbol, primaryData: {...}, keyData: {...} } }
      // 2. Real-time quotes: { body: [{ symbol, regularMarketPrice, ... }] }
      let result = data.body;
      
      // Handle array response from real-time quotes
      if (Array.isArray(result) && result.length > 0) {
        result = result[0]; // Get first result
      }

      if (!result || (!result.symbol && !result.ticker)) throw new Error('No quote data returned from API');

      // Parse different response formats
      const primaryData = result.primaryData || {};
      const secondaryData = result.secondaryData || {};
      const keyStats = result.keyStats || {};
      
      // Real-time quotes format uses direct fields
      const directFields = result;

      // Parsing strings "$298.45" and "+1.83" to numbers
      const price = this.parsePrice(
        primaryData.lastSalePrice || 
        secondaryData.lastSalePrice ||
        directFields.regularMarketPrice ||
        directFields.price ||
        '0'
      );
      const change = this.parsePrice(
        primaryData.netChange || 
        secondaryData.netChange ||
        directFields.regularMarketChange ||
        directFields.change ||
        '0'
      );
      const changePercent = this.parsePercent(
        primaryData.percentageChange || 
        secondaryData.percentageChange ||
        directFields.regularMarketChangePercent ||
        directFields.changePercent ||
        '0'
      );
      
      // Parse 52-week range from keyStats (format: "169.21 - 283.42")
      let weekHigh52 = price;
      let weekLow52 = price;
      if (keyStats.fiftyTwoWeekHighLow?.value) {
        const range = keyStats.fiftyTwoWeekHighLow.value.split(' - ');
        if (range.length === 2) {
          weekLow52 = parseFloat(range[0]);
          weekHigh52 = parseFloat(range[1]);
        }
      }
      
      // Calculate previous close if not provided
      const prevClose = price - change;

      // Try to get today's session data (open, high, low) from history
      let todayOpen = prevClose;
      let todayHigh = price;
      let todayLow = price;
      
      try {
        await this.throttleRequest();
        const historyUrl = `${this.baseURL}/v1/markets/stock/history?symbol=${symbol}&interval=1d&diffandsplits=false`;
        const historyResponse = await fetch(historyUrl, { method: 'GET', headers: this.headers });
        const historyData = await historyResponse.json();
        
        if (historyData.body && typeof historyData.body === 'object') {
          // Get the last entry (today or latest available)
          const entries = Object.entries(historyData.body);
          if (entries.length >= 1) {
            const latestEntry: any = entries[entries.length - 1][1];
            todayOpen = this.parsePrice(latestEntry.open || todayOpen);
            todayHigh = this.parsePrice(latestEntry.high || todayHigh);
            todayLow = this.parsePrice(latestEntry.low || todayLow);
          }
        }
      } catch (err) {
        console.log('⚠️ Could not fetch today session data, using estimates');
      }

      // Build stock quote with comprehensive fallbacks
      const stockQuote: StockQuote = {
        symbol: result.symbol || result.ticker || symbol,
        price: price,
        change: change,
        changePercent: changePercent,
        // Volume is in primaryData (with commas: "295,468")
        volume: parseInt((
          primaryData.volume || 
          secondaryData.volume ||
          directFields.regularMarketVolume ||
          directFields.volume ||
          '0'
        ).toString().replace(/,/g, '')),
        // Session data from history endpoint
        high: todayHigh,
        low: todayLow,
        open: todayOpen,
        previousClose: this.parsePrice(
          secondaryData.lastSalePrice || 
          directFields.regularMarketPreviousClose ||
          directFields.previousClose ||
          prevClose
        ),
        timestamp: new Date().toISOString(),
      };

      console.log('📊 Quote data:', {
        price: stockQuote.price,
        volume: stockQuote.volume,
        open: stockQuote.open,
        high: stockQuote.high,
        low: stockQuote.low,
        previousClose: stockQuote.previousClose,
      });

      // 3. Save to SQLite
      await databaseService.saveStockQuote(stockQuote);
      return stockQuote;

    } catch (error) {
      console.warn('Network Error (Quote):', error);
      
      // 4. Fallback to OLD cache (ignore expiration)
      const oldCached = await databaseService.getStockQuote(symbol, Infinity);
      if (oldCached) {
        console.log('⚠️ Using OLD cached data instead of Mock');
        return oldCached;
      }

      // 5. Last Resort: Mock Data
      console.warn('⚠️ No cache found. Using Mock Data.');
      return this.getMockStockQuote(symbol);
    }
  }

  // =========================================================================
  // 3. GET COMPANY OVERVIEW
  // Endpoint: /v1/markets/stock/modules (Mboum Finance API)
  // =========================================================================
  async getCompanyOverview(symbol: string): Promise<CompanyOverview | null> {
    await this.ensureInitialized();

    try {
      // 1. Check SQLite
      const cached = await databaseService.getCompanyOverview(symbol);
      if (cached) {
        console.log('✅ Using cached overview from SQLite');
        return cached;
      }

      // 2. API Call
      console.log('📋 Fetching Overview...');
      const url = `${this.baseURL}/v1/markets/stock/modules?symbol=${symbol}&module=asset-profile`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();
      
      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit - using cache');
        throw new Error('Rate limit exceeded');
      }
      
      // Data structure: { body: { address1, city, description, ... } } - direct fields, not nested in assetProfile
      const profile = data.body || data;

      if (!profile || typeof profile !== 'object') throw new Error('No overview data');

      const overview: CompanyOverview = {
        symbol: symbol,
        name: profile.companyName || profile.longName || symbol,
        exchange: profile.exchange || profile.exchangeName || 'N/A',
        currency: profile.currency || 'USD',
        country: profile.country || profile.state || 'USA',
        description: profile.description || profile.longBusinessSummary || 'No description available.',
        sector: profile.sector || 'N/A',
        industry: profile.industry || 'N/A',
        employees: profile.fullTimeEmployees ? parseInt(profile.fullTimeEmployees) : undefined,
        website: profile.website || profile.websiteUrl,
      };

      // 3. Save
      await databaseService.saveCompanyOverview(overview);
      console.log('✅ Overview saved to SQLite');

      return overview;

    } catch (error) {
      console.warn('Error fetching overview:', error);
      // Fallback
      return await databaseService.getCompanyOverview(symbol, Infinity);
    }
  }

  // =========================================================================
  // 4. GET FINANCIAL METRICS
  // Endpoint: /v1/markets/stock/modules (Mboum Finance API) - uses statistics and financial-data modules
  // =========================================================================
  async getFinancialMetrics(symbol: string): Promise<FinancialMetrics | null> {
    await this.ensureInitialized();

    try {
      const cached = await databaseService.getFinancialMetrics(symbol);
      if (cached) {
        console.log('✅ Using cached metrics from SQLite');
        return cached;
      }

      console.log('📈 Fetching Metrics from stock/modules...');
      
      // Fetch both statistics and financial-data modules in parallel
      const [statisticsData, financialData] = await Promise.all([
        this.getStockModule(symbol, 'statistics'),
        this.getStockModule(symbol, 'financial-data')
      ]);
      
      // Log what we received for debugging
      console.log('📊 Statistics module keys:', statisticsData ? Object.keys(statisticsData).slice(0, 10) : 'null');
      console.log('📊 Financial-data module keys:', financialData ? Object.keys(financialData).slice(0, 10) : 'null');
      
      // Check for rate limit
      if (!statisticsData && !financialData) {
        console.warn('⚠️ Both modules returned null - possibly rate limit or no data');
        throw new Error('No metrics data available');
      }

      // Merge data from both modules - using ACTUAL field names from API
      const metrics: FinancialMetrics = {
        symbol: symbol,
        // Market Cap: Calculate from enterprise value or use sharesOutstanding * price
        marketCap: statisticsData?.enterpriseValue?.raw ||
                   (statisticsData?.sharesOutstanding?.raw && financialData?.currentPrice?.raw ? 
                     statisticsData.sharesOutstanding.raw * financialData.currentPrice.raw : undefined),
        // P/E Ratio: from statistics module (forwardPE is available, trailingPE not directly available)
        peRatio: statisticsData?.forwardPE?.raw || undefined,
        // Dividend Yield: Calculate from lastDividendValue and currentPrice
        dividendYield: (statisticsData?.lastDividendValue?.raw && financialData?.currentPrice?.raw) ?
          (statisticsData.lastDividendValue.raw / financialData.currentPrice.raw) * 100 * 4 : // Annualize (quarterly * 4)
          undefined,
        // EPS: from statistics module
        eps: statisticsData?.trailingEps?.raw || 
             statisticsData?.forwardEps?.raw || 
             undefined,
        // Beta: from statistics module
        beta: statisticsData?.beta?.raw || undefined,
        // 52-Week High/Low: NOT directly available, will need to get from quote endpoint
        weekHigh52: undefined, // Will be filled from quote data
        weekLow52: undefined,  // Will be filled from quote data
        // Average Volume: NOT available in these modules
        averageVolume: undefined,
      };

      // Get 52-week high/low from quote endpoint (it has keyStats.fiftyTwoWeekHighLow)
      try {
        const quoteUrl = `${this.baseURL}/v1/markets/quote?symbol=${symbol}&type=STOCKS`;
        const quoteResponse = await fetch(quoteUrl, { method: 'GET', headers: this.headers });
        const quoteData = await quoteResponse.json();
        
        if (quoteData.body?.keyStats?.fiftyTwoWeekHighLow?.value) {
          const range = quoteData.body.keyStats.fiftyTwoWeekHighLow.value.split(' - ');
          if (range.length === 2) {
            metrics.weekLow52 = parseFloat(range[0]);
            metrics.weekHigh52 = parseFloat(range[1]);
          }
        }
      } catch (err) {
        console.log('⚠️ Could not fetch 52-week range from quote');
      }

      // Log the parsed metrics
      console.log('📊 Parsed metrics:', {
        marketCap: metrics.marketCap,
        peRatio: metrics.peRatio,
        eps: metrics.eps,
        dividendYield: metrics.dividendYield,
        beta: metrics.beta,
        weekHigh52: metrics.weekHigh52,
        weekLow52: metrics.weekLow52,
      });

      // If we have at least some data, save and return
      if (metrics.marketCap || metrics.peRatio || metrics.eps) {
        await databaseService.saveFinancialMetrics(metrics);
        console.log('✅ Metrics saved to SQLite with data from stock/modules');
        return metrics;
      }
      
      throw new Error('No valid metrics data found');
    } catch (error) {
      console.warn('Error fetching metrics:', error);
      // Fallback to old cached data
      const fallback = await databaseService.getFinancialMetrics(symbol, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached metrics as fallback');
        return fallback;
      }
      return null;
    }
  }

  // =========================================================================
  // 5. GET HISTORICAL DATA (CHARTS)
  // Endpoint: /v1/markets/stock/history (Mboum Finance API)
  // Supports intraday intervals: 1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo
  // =========================================================================
  async getHistoricalData(symbol: string, range: string = '1Y'): Promise<any[]> {
    await this.ensureInitialized();

    try {
      // 1. Try SQLite Cache (skip for intraday - too volatile)
      const isIntraday = range === '1D';
      
      if (!isIntraday) {
        let cached: any[] | null = null;
        try {
          cached = await databaseService.getHistoricalData(symbol, range);
        } catch (dbErr) {
          console.warn('SQLite historical read failed', dbErr);
        }

        if (cached) {
          console.log('✅ Using cached historical data from SQLite');
          return cached;
        }

        // 2. Try AsyncStorage Cache
        try {
          const asCached = await offlineDataService.getCachedChartData(symbol, range);
          if (asCached) {
            console.log('✅ Using cached historical data from AsyncStorage');
            return asCached;
          }
        } catch (asErr) {
          console.warn('AsyncStorage historical read failed', asErr);
        }
      }

      // 3. API Call
      console.log(`📈 Fetching Chart (${range})...`);
      
      let interval = '1d';
      if (range === '1D') interval = '5m'; // Intraday: 5-minute intervals for current day
      else if (range === '1M') interval = '1d';
      else if (range === '6M') interval = '1d';
      else if (range === '1Y') interval = '1d';
      else if (range === '5Y') interval = '1wk';
      else if (range === 'ALL') interval = '1mo';

      const url = `${this.baseURL}/v1/markets/stock/history?symbol=${symbol}&interval=${interval}&diffandsplits=false`;
      
      // Log for debugging
      console.log('🔗 URL:', url);
      
      await this.throttleRequest();
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();
      console.log('📡 History response keys:', Object.keys(data));
      console.log('📡 History body type:', Array.isArray(data.body) ? 'array' : typeof data.body);
      
      // Log first few keys of body if it's an object
      if (data.body && typeof data.body === 'object' && !Array.isArray(data.body)) {
        const bodyKeys = Object.keys(data.body);
        console.log('📡 Body keys (first 5):', bodyKeys.slice(0, 5));
        if (bodyKeys.length > 0) {
          console.log('📡 Sample body entry:', bodyKeys[0], '=', data.body[bodyKeys[0]]);
        }
      }
      
      // Check if it's a rate limit error
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit for history');
        throw new Error('Rate limit exceeded');
      }

      // Data structure: { body: { items: [...] } } or { body: [...] }
      let historyBody = data.body?.items || data.body || data.items || [];
      
      // If body is an object (not array), it might be a map of timestamps or dates
      if (typeof data.body === 'object' && !Array.isArray(data.body) && data.body !== null && !data.body.items) {
        const keys = Object.keys(data.body);
        if (keys.length > 0) {
          // Check if it's a timestamp (numeric) or date string key
          const firstKey = keys[0];
          const isTimestampKey = /^\d+$/.test(firstKey); // Pure numbers (Unix timestamps)
          const isDateKey = /\d{4}-\d{2}-\d{2}/.test(firstKey); // Date strings
          
          if (isTimestampKey || isDateKey) {
            historyBody = data.body; // It's a timestamp/date map
          }
        }
      }
      
      let chartData: any[] = [];
      
      // Handle different formats (Array vs Object map)
      if (Array.isArray(historyBody)) {
        console.log('📊 Processing array history, length:', historyBody.length);
        chartData = historyBody.map((item: any) => ({
          date: item.date,
          price: this.parsePrice(item.close || item.adjclose || item.adjClose),
          timestamp: new Date(item.date).getTime(),
        }));
      } else if (typeof historyBody === 'object' && !Array.isArray(historyBody)) {
        // Handle object with timestamp or date keys
        const entries = Object.entries(historyBody);
        console.log('📊 Processing object history, entries:', entries.length);
        if (entries.length > 0) {
          console.log('📊 First entry structure:', entries[0]);
        }
        
        chartData = entries.map(([key, val]: [string, any]) => {
          // Key could be Unix timestamp (seconds) or date string
          const timestamp = /^\d+$/.test(key) 
            ? parseInt(key) * 1000  // Unix timestamp in seconds -> milliseconds
            : new Date(key).getTime(); // Date string -> timestamp
          
          const date = new Date(timestamp).toISOString().split('T')[0]; // Format as YYYY-MM-DD
          
          return {
            date: date,
            price: this.parsePrice(val.close || val.adjclose || val.adjClose || val['4. close'] || val),
            timestamp: timestamp,
          };
        }).filter(item => item.price > 0 && !isNaN(item.timestamp)); // Filter invalid entries
      }
      
      console.log('📊 Chart data before filtering:', chartData.length, 'points');

      // 4. Filtering by Range
      chartData = chartData.sort((a, b) => a.timestamp - b.timestamp);
      
      const now = Date.now();
      let days = 365;
      if (range === '1M') days = 30;
      else if (range === '6M') days = 180;
      else if (range === '5Y') days = 1825;
      
      if (range !== 'ALL') {
         const cutoff = now - days * 24 * 60 * 60 * 1000;
         chartData = chartData.filter(d => d.timestamp >= cutoff);
      }

      if (chartData.length > 0) {
        // 5. Save to SQLite (Primary) & AsyncStorage (Fallback)
        try {
          await databaseService.saveHistoricalData(symbol, range, chartData);
          console.log('✅ Historical data saved to SQLite');
        } catch (saveErr) {
          console.warn('Saving history to SQLite failed', saveErr);
          try {
             await offlineDataService.cacheChartData(symbol, range, chartData);
          } catch (asErr) { console.warn('Saving history to AsyncStorage failed', asErr); }
        }

        return chartData;
      }
      
      throw new Error('Empty history');
      
    } catch (error) {
      console.warn('❌ Error fetching historical data:', error);
      
      // 6. Final Fallback: Old Data or Mock
      const oldCached = await databaseService.getHistoricalData(symbol, range, Infinity);
      if (oldCached) return oldCached;
      
      return this.getMockChartData(symbol, range);
    }
  }

  // =========================================================================
  // MOCK DATA GENERATORS (Fallback)
  // =========================================================================
  getMockChartData(symbol: string, range: string): any[] {
    const basePrice = this.getMockStockQuote(symbol).price;
    const dataPoints: any[] = [];
    const now = Date.now();
    let days = 365;
    if (range === '1M') days = 30;
    else if (range === '6M') days = 180;
    else if (range === '5Y') days = 1825;
    else if (range === 'ALL') days = 3650;

    for (let i = days; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const variation = (Math.random() - 0.5) * 0.1;
      const trend = ((days - i) / days) * 0.2; 
      const price = basePrice * (0.9 + trend + variation);

      dataPoints.push({
        date: date.toISOString().split('T')[0],
        price: parseFloat(price.toFixed(2)),
        timestamp: date.getTime(),
      });
    }
    return dataPoints;
  }

  getMockStockQuote(symbol: string): StockQuote {
    const mockPrices: Record<string, number> = {
      AAPL: 178.5, GOOGL: 142.3, MSFT: 415.2, AMZN: 175.8,
      TSLA: 242.15, NVDA: 186.6, GE: 300.13, META: 485.2,
      NFLX: 625.5, AMD: 145.8, INTC: 48.5, CSCO: 56.3,
      ORCL: 125.4, IBM: 195.2, DIS: 95.8,
    };

    const price = mockPrices[symbol] || 100;
    const seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1);
    const variation = ((seed % 100) / 100 - 0.5) * 0.02;
    const change = price * variation;
    
    return {
      symbol,
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat((variation * 100).toFixed(2)),
      volume: Math.floor((seed % 50) * 1_000_000 + 50_000_000),
      high: parseFloat((price * 1.015).toFixed(2)),
      low: parseFloat((price * 0.985).toFixed(2)),
      open: parseFloat((price + change * 0.5).toFixed(2)),
      previousClose: parseFloat((price - change).toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }

  // =========================================================================
  // 7. GET STOCK MODULES (Statistics, Financial Data, etc.)
  // Endpoint: /v1/markets/stock/modules (Mboum Finance API)
  // Available modules: calendar-events, earnings-history, income-statement, 
  //                    balance-sheet, cashflow-statement, institution-ownership,
  //                    insider-holders, recommendation-trend, upgrade-downgrade-history,
  //                    sec-filings, index-trend, net-share-purchase-activity
  // Cache: 24 hours (refresh daily for accurate financial data)
  // =========================================================================
  async getStockModule(symbol: string, module: string): Promise<any> {
    await this.ensureInitialized();

    try {
      // 1. Check SQLite cache (24 hour expiration for fresh data)
      const cached = await databaseService.getStockModule(symbol, module);
      if (cached) {
        console.log(`✅ Using cached ${module} from SQLite`);
        return cached;
      }

      // 2. Fetch from API with rate limiting
      await this.throttleRequest();
      console.log(`📊 Fetching ${module} for ${symbol}...`);
      const url = `${this.baseURL}/v1/markets/stock/modules?symbol=${symbol}&module=${module}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn(`⚠️ Rate limit hit for ${module} - using fallback`);
        // 3. Fallback to old cache (ignore expiration)
        const oldCached = await databaseService.getStockModule(symbol, module, Infinity);
        if (oldCached) {
          console.log(`⚠️ Using old cached ${module} as fallback`);
          return oldCached;
        }
        // Don't cache null on rate limit - throw error to retry later
        throw new Error('Rate limit - no cache available');
      }

      const moduleData = data.body || null;
      
      // 4. Save to cache ONLY if data exists (don't cache null/empty responses)
      if (moduleData && Object.keys(moduleData).length > 0) {
        await databaseService.saveStockModule(symbol, module, moduleData);
        console.log(`✅ Fetched and cached ${module} data`);
      } else {
        console.log(`⚠️ Module ${module} returned empty - not caching`);
      }

      return moduleData;
    } catch (error) {
      console.warn(`Error fetching ${module}:`, error);
      // 5. Final fallback to old cache
      const fallback = await databaseService.getStockModule(symbol, module, Infinity);
      if (fallback) {
        console.log(`⚠️ Using old cached ${module} due to error`);
        return fallback;
      }
      return null;
    }
  }

  // =========================================================================
  // 8. GET MARKET SCREENER (Day Gainers, Losers, Most Active, etc.)
  // Endpoint: /v1/markets/screener (Mboum Finance API)
  // Available lists: day_gainers, day_losers, most_actives, undervalued_large_caps
  // Cache: 15 minutes (market data updates frequently during trading hours)
  // =========================================================================
  async getMarketScreener(list: string = 'day_gainers'): Promise<any[]> {
    await this.ensureInitialized();

    try {
      // 1. Check cache (15 minute expiration for market data)
      const cacheKey = `screener_${list}`;
      const cached = await databaseService.getMarketData(cacheKey, 15 * 60 * 1000);
      if (cached) {
        console.log(`✅ Using cached ${list} from SQLite`);
        return cached;
      }

      // 2. Fetch from API
      console.log(`📊 Fetching ${list}...`);
      const url = `${this.baseURL}/v1/markets/screener?list=${list}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log(`⚠️ Using old cached ${list} as fallback`);
          return oldCached;
        }
        return [];
      }

      // Data structure: { body: [...] }
      const results = data.body || [];
      
      // 4. Save to cache
      if (results.length > 0) {
        await databaseService.saveMarketData(cacheKey, results);
      }
      
      console.log(`✅ Fetched and cached ${results.length} results for ${list}`);
      return results;
    } catch (error) {
      console.warn(`Error fetching ${list}:`, error);
      // 5. Final fallback to old cache
      const cacheKey = `screener_${list}`;
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log(`⚠️ Using old cached ${list} due to error`);
        return fallback;
      }
      return [];
    }
  }

  // Helper: Get day gainers specifically
  async getMarketGainers(): Promise<any[]> {
    return await this.getMarketScreener('day_gainers');
  }

  // Helper: Get day losers specifically
  async getMarketLosers(): Promise<any[]> {
    return await this.getMarketScreener('day_losers');
  }

  // Helper: Get most active stocks
  async getMostActive(): Promise<any[]> {
    return await this.getMarketScreener('most_actives');
  }

  // =========================================================================
  // 9. GET MARKET TICKERS (Paginated list of stocks)
  // Endpoint: /v2/markets/tickers (Mboum Finance API)
  // Returns paginated list of stocks sorted by market cap
  // Cache: 1 hour for ticker list data
  // =========================================================================
  async getMarketTickers(page: number = 1, type: string = 'STOCKS'): Promise<any> {
    await this.ensureInitialized();

    try {
      const cacheKey = `tickers_${type}_page_${page}`;
      
      // 1. Check SQLite cache (1 hour expiration)
      const cached = await databaseService.getMarketData(cacheKey, 60 * 60 * 1000);
      if (cached) {
        console.log(`✅ Using cached tickers (page ${page}) from SQLite`);
        return cached;
      }

      // 2. Fetch from API
      console.log(`📊 Fetching market tickers page ${page}...`);
      const url = `${this.baseURL}/v2/markets/tickers?type=${type}&page=${page}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log(`⚠️ Using old cached tickers (page ${page}) as fallback`);
          return oldCached;
        }
        return { meta: {}, body: [] };
      }

      // Data structure: { meta: { totalrecords, ... }, body: [...] }
      // 4. Save to cache
      if (data.body && data.body.length > 0) {
        await databaseService.saveMarketData(cacheKey, data);
      }
      
      console.log(`✅ Fetched and cached ${data.body?.length || 0} tickers (page ${page})`);
      return data;
    } catch (error) {
      console.warn(`Error fetching market tickers:`, error);
      // 5. Final fallback to old cache
      const cacheKey = `tickers_${type}_page_${page}`;
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log(`⚠️ Using old cached tickers (page ${page}) due to error`);
        return fallback;
      }
      return { meta: {}, body: [] };
    }
  }

  // Helper: Get comprehensive stock statistics
  async getStockStatistics(symbol: string): Promise<any> {
    return await this.getStockModule(symbol, 'statistics');
  }

  // Helper: Get financial data (revenue, profit margins, etc.)
  async getFinancialData(symbol: string): Promise<any> {
    return await this.getStockModule(symbol, 'financial-data');
  }

  // Helper: Get income statement
  async getIncomeStatement(symbol: string): Promise<any> {
    return await this.getStockModule(symbol, 'income-statement');
  }

  // Helper: Get balance sheet
  async getBalanceSheet(symbol: string): Promise<any> {
    return await this.getStockModule(symbol, 'balance-sheet');
  }

  // Helper: Get cashflow statement
  async getCashflowStatement(symbol: string): Promise<any> {
    return await this.getStockModule(symbol, 'cashflow-statement');
  }

  // =========================================================================
  // 10. GET MARKET NEWS (v2 with type filter)
  // Endpoint: /v2/markets/news (Mboum Finance API)
  // Returns comprehensive news articles with images, videos, and filtering
  // Cache: 15 minutes for fresh news updates
  // =========================================================================
  async getMarketNews(ticker?: string, type: string = 'ALL'): Promise<any[]> {
    await this.ensureInitialized();

    try {
      const cacheKey = ticker ? `news_v2_${ticker}_${type}` : `news_v2_ALL_${type}`;
      
      // 1. Check SQLite cache (15 minute expiration for fresh news)
      const cached = await databaseService.getMarketData(cacheKey);
      if (cached) {
        console.log('✅ Using cached news from SQLite');
        return cached;
      }

      // 2. Fetch from API
      console.log(`📰 Fetching news (type: ${type})...`);
      let url = `${this.baseURL}/v2/markets/news?type=${type}`;
      if (ticker) {
        url += `&ticker=${encodeURIComponent(ticker)}`;
      }
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log('⚠️ Using old cached news as fallback');
          return oldCached;
        }
        return [];
      }

      // Data structure: { meta: { total, ... }, body: [...] }
      const news = data.body || [];
      
      // 4. Save to cache
      if (news.length > 0) {
        await databaseService.saveMarketData(cacheKey, news);
      }
      
      console.log(`✅ Fetched and cached ${news.length} news articles`);
      return news;
    } catch (error) {
      console.warn('Error fetching news:', error);
      // 5. Final fallback to old cache
      const cacheKey = ticker ? `news_v2_${ticker}_${type}` : `news_v2_ALL_${type}`;
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached news due to error');
        return fallback;
      }
      return [];
    }
  }

  // =========================================================================
  // 11. GET EARNINGS CALENDAR
  // Endpoint: /v1/markets/calendar/earnings (Mboum Finance API)
  // Returns upcoming earnings announcements
  // Cache: 1 hour for calendar data
  // =========================================================================
  async getEarningsCalendar(): Promise<any[]> {
    await this.ensureInitialized();

    try {
      const cacheKey = 'calendar_earnings';
      
      // 1. Check SQLite cache (1 hour expiration)
      const cached = await databaseService.getMarketData(cacheKey, 60 * 60 * 1000);
      if (cached) {
        console.log('✅ Using cached earnings calendar from SQLite');
        return cached;
      }

      // 2. Fetch from API
      console.log('📅 Fetching earnings calendar...');
      const url = `${this.baseURL}/v1/markets/calendar/earnings`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log('⚠️ Using old cached earnings calendar as fallback');
          return oldCached;
        }
        return [];
      }

      // Data structure: { meta: {...}, body: [...] }
      const earnings = data.body || [];
      
      // 4. Save to cache
      if (earnings.length > 0) {
        await databaseService.saveMarketData(cacheKey, earnings);
      }
      
      console.log(`✅ Fetched and cached ${earnings.length} earnings events`);
      return earnings;
    } catch (error) {
      console.warn('Error fetching earnings calendar:', error);
      // 5. Final fallback to old cache
      const cacheKey = 'calendar_earnings';
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached earnings calendar due to error');
        return fallback;
      }
      return [];
    }
  }

  // =========================================================================
  // 12. GET DIVIDENDS CALENDAR
  // Endpoint: /v1/markets/calendar/dividends (Mboum Finance API)
  // Returns upcoming dividend payments for a specific date
  // Cache: 1 hour for calendar data
  // =========================================================================
  async getDividendsCalendar(date?: string): Promise<any[]> {
    await this.ensureInitialized();

    try {
      // Default to today if no date provided
      const targetDate = date || new Date().toISOString().split('T')[0];
      const cacheKey = `calendar_dividends_${targetDate}`;
      
      // 1. Check SQLite cache (1 hour expiration)
      const cached = await databaseService.getMarketData(cacheKey, 60 * 60 * 1000);
      if (cached) {
        console.log('✅ Using cached dividends calendar from SQLite');
        return cached;
      }

      // 2. Fetch from API
      console.log(`📅 Fetching dividends calendar for ${targetDate}...`);
      const url = `${this.baseURL}/v1/markets/calendar/dividends?date=${targetDate}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log('⚠️ Using old cached dividends calendar as fallback');
          return oldCached;
        }
        return [];
      }

      // Data structure: { meta: {...}, body: [...] }
      const dividends = data.body || [];
      
      // 4. Save to cache
      if (dividends.length > 0) {
        await databaseService.saveMarketData(cacheKey, dividends);
      }
      
      console.log(`✅ Fetched and cached ${dividends.length} dividend events`);
      return dividends;
    } catch (error) {
      console.warn('Error fetching dividends calendar:', error);
      // 5. Final fallback to old cache
      const targetDate = date || new Date().toISOString().split('T')[0];
      const cacheKey = `calendar_dividends_${targetDate}`;
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached dividends calendar due to error');
        return fallback;
      }
      return [];
    }
  }

  // =========================================================================
  // 13. GET ECONOMIC EVENTS CALENDAR
  // Endpoint: /v1/markets/calendar/economic_events (Mboum Finance API)
  // Returns economic indicators and events for a specific date
  // Cache: 1 hour for calendar data
  // =========================================================================
  async getEconomicEventsCalendar(date?: string): Promise<any[]> {
    await this.ensureInitialized();

    try {
      // Default to today if no date provided
      const targetDate = date || new Date().toISOString().split('T')[0];
      const cacheKey = `calendar_economic_${targetDate}`;
      
      // 1. Check SQLite cache (1 hour expiration)
      const cached = await databaseService.getMarketData(cacheKey, 60 * 60 * 1000);
      if (cached) {
        console.log('✅ Using cached economic events from SQLite');
        return cached;
      }

      // 2. Fetch from API
      console.log(`📅 Fetching economic events for ${targetDate}...`);
      const url = `${this.baseURL}/v1/markets/calendar/economic_events?date=${targetDate}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log('⚠️ Using old cached economic events as fallback');
          return oldCached;
        }
        return [];
      }

      // Data structure: { meta: {...}, body: [...] }
      const events = data.body || [];
      
      // 4. Save to cache
      if (events.length > 0) {
        await databaseService.saveMarketData(cacheKey, events);
      }
      
      console.log(`✅ Fetched and cached ${events.length} economic events`);
      return events;
    } catch (error) {
      console.warn('Error fetching economic events:', error);
      // 5. Final fallback to old cache
      const targetDate = date || new Date().toISOString().split('T')[0];
      const cacheKey = `calendar_economic_${targetDate}`;
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached economic events due to error');
        return fallback;
      }
      return [];
    }
  }

  // =========================================================================
  // 14. GET IPO CALENDAR
  // Endpoint: /v1/markets/calendar/ipo (Mboum Finance API)
  // Returns upcoming and recent IPOs for a specific month
  // Cache: 1 hour for calendar data
  // =========================================================================
  async getIPOCalendar(date?: string): Promise<any> {
    await this.ensureInitialized();

    try {
      // Default to current year-month if no date provided (format: YYYY-MM)
      const targetDate = date || new Date().toISOString().slice(0, 7);
      const cacheKey = `calendar_ipo_${targetDate}`;
      
      // 1. Check SQLite cache (1 hour expiration)
      const cached = await databaseService.getMarketData(cacheKey, 60 * 60 * 1000);
      if (cached) {
        console.log('✅ Using cached IPO calendar from SQLite');
        return cached;
      }

      // 2. Fetch from API
      console.log(`📅 Fetching IPO calendar for ${targetDate}...`);
      const url = `${this.baseURL}/v1/markets/calendar/ipo?date=${targetDate}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log('⚠️ Using old cached IPO calendar as fallback');
          return oldCached;
        }
        return { priced: [], upcoming: [] };
      }

      // Data structure: { meta: {...}, body: { priced: [...], upcoming: [...] } }
      const ipos = data.body || { priced: [], upcoming: [] };
      
      // 4. Save to cache
      await databaseService.saveMarketData(cacheKey, ipos);
      
      const totalIPOs = (ipos.priced?.length || 0) + (ipos.upcoming?.length || 0);
      console.log(`✅ Fetched and cached ${totalIPOs} IPOs`);
      return ipos;
    } catch (error) {
      console.warn('Error fetching IPO calendar:', error);
      // 5. Final fallback to old cache
      const targetDate = date || new Date().toISOString().slice(0, 7);
      const cacheKey = `calendar_ipo_${targetDate}`;
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached IPO calendar due to error');
        return fallback;
      }
      return { priced: [], upcoming: [] };
    }
  }

  // =========================================================================
  // 15. GET PUBLIC OFFERINGS CALENDAR
  // Endpoint: /v1/markets/calendar/public_offerings (Mboum Finance API)
  // Returns secondary offerings, follow-ons, and other public offerings
  // Cache: 1 hour for calendar data
  // =========================================================================
  async getPublicOfferingsCalendar(date?: string): Promise<any> {
    await this.ensureInitialized();

    try {
      // Default to current year-month if no date provided (format: YYYY-MM)
      const targetDate = date || new Date().toISOString().slice(0, 7);
      const cacheKey = `calendar_offerings_${targetDate}`;
      
      // 1. Check SQLite cache (1 hour expiration)
      const cached = await databaseService.getMarketData(cacheKey, 60 * 60 * 1000);
      if (cached) {
        console.log('✅ Using cached public offerings from SQLite');
        return cached;
      }

      // 2. Fetch from API
      console.log(`📅 Fetching public offerings for ${targetDate}...`);
      const url = `${this.baseURL}/v1/markets/calendar/public_offerings?date=${targetDate}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log('⚠️ Using old cached public offerings as fallback');
          return oldCached;
        }
        return { priced: [], upcoming: [], filed: [], withdrawn: [] };
      }

      // Data structure: { meta: {...}, body: { priced: [...], upcoming: [...], filed: [...], withdrawn: [...] } }
      const offerings = data.body || { priced: [], upcoming: [], filed: [], withdrawn: [] };
      
      // 4. Save to cache
      await databaseService.saveMarketData(cacheKey, offerings);
      
      const totalOfferings = (offerings.priced?.length || 0) + (offerings.upcoming?.length || 0) + 
                             (offerings.filed?.length || 0);
      console.log(`✅ Fetched and cached ${totalOfferings} public offerings`);
      return offerings;
    } catch (error) {
      console.warn('Error fetching public offerings:', error);
      // 5. Final fallback to old cache
      const targetDate = date || new Date().toISOString().slice(0, 7);
      const cacheKey = `calendar_offerings_${targetDate}`;
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached public offerings due to error');
        return fallback;
      }
      return { priced: [], upcoming: [], filed: [], withdrawn: [] };
    }
  }

  // =========================================================================
  // 16. GET STOCK SPLITS CALENDAR
  // Endpoint: /v1/markets/calendar/stock-splits (Mboum Finance API)
  // Returns recent and upcoming stock splits
  // Cache: 1 hour for calendar data
  // =========================================================================
  async getStockSplitsCalendar(): Promise<any[]> {
    await this.ensureInitialized();

    try {
      const cacheKey = 'calendar_splits';
      
      // 1. Check SQLite cache (1 hour expiration)
      const cached = await databaseService.getMarketData(cacheKey, 60 * 60 * 1000);
      if (cached) {
        console.log('✅ Using cached stock splits from SQLite');
        return cached;
      }

      // 2. Fetch from API
      console.log('📅 Fetching stock splits calendar...');
      const url = `${this.baseURL}/v1/markets/calendar/stock-splits`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        // 3. Fallback to old cache
        const oldCached = await databaseService.getMarketData(cacheKey, Infinity);
        if (oldCached) {
          console.log('⚠️ Using old cached stock splits as fallback');
          return oldCached;
        }
        return [];
      }

      // Data structure: { meta: { total, page, ... }, body: [...] }
      const splits = data.body || [];
      
      // 4. Save to cache
      if (splits.length > 0) {
        await databaseService.saveMarketData(cacheKey, splits);
      }
      
      console.log(`✅ Fetched and cached ${splits.length} stock splits`);
      return splits;
    } catch (error) {
      console.warn('Error fetching stock splits:', error);
      // 5. Final fallback to old cache
      const cacheKey = 'calendar_splits';
      const fallback = await databaseService.getMarketData(cacheKey, Infinity);
      if (fallback) {
        console.log('⚠️ Using old cached stock splits due to error');
        return fallback;
      }
      return [];
    }
  }
}

export const financeApiService = new FinanceApiService();