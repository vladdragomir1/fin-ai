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

  private get headers() {
    return {
      'X-RapidAPI-Key': FINANCIAL_API_KEY,
      'X-RapidAPI-Host': FINANCIAL_API_HOST,
    };
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

      return [];
    }
  }

  // =========================================================================
  // 2. GET STOCK QUOTE
  // Endpoint: /v1/markets/quote (Mboum Finance API)
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

      // 2. Fetch API
      console.log('📊 Fetching Quote...');
      const url = `${this.baseURL}/v1/markets/quote?symbol=${symbol}&type=STOCKS`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit - using cache');
        throw new Error('Rate limit exceeded');
      }

      // Data structure: { body: { symbol, companyName, primaryData: { lastSalePrice, netChange, percentageChange } } }
      const result = data.body;

      if (!result || !result.symbol) throw new Error('No quote data returned from API');

      const primaryData = result.primaryData || {};
      const keyData = result.keyData || {};

      // Parsing strings "$298.45" and "+1.83" to numbers
      const price = this.parsePrice(primaryData.lastSalePrice || keyData.lastSalePrice || '0');
      const change = this.parsePrice(primaryData.netChange || keyData.netChange || '0');
      const changePercent = this.parsePercent(primaryData.percentageChange || keyData.percentageChange || '0');
      
      // Calculate previous close if not provided
      const prevClose = price - change;

      const stockQuote: StockQuote = {
        symbol: result.symbol,
        price: price,
        change: change,
        changePercent: changePercent,
        volume: parseInt((keyData.volume || keyData.lastTradeVolume || '0').toString().replace(/,/g, '')),
        high: this.parsePrice(keyData.high || keyData.dayHigh || price),
        low: this.parsePrice(keyData.low || keyData.dayLow || price),
        open: this.parsePrice(keyData.open || price),
        previousClose: this.parsePrice(keyData.previousClose || prevClose),
        timestamp: new Date().toISOString(),
      };

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
  // Endpoint: /v1/markets/quote (Mboum Finance API) - extracts financial metrics
  // =========================================================================
  async getFinancialMetrics(symbol: string): Promise<FinancialMetrics | null> {
    await this.ensureInitialized();

    try {
      const cached = await databaseService.getFinancialMetrics(symbol);
      if (cached) {
        console.log('✅ Using cached metrics from SQLite');
        return cached;
      }

      console.log('📈 Fetching Metrics...');
      const url = `${this.baseURL}/v1/markets/quote?symbol=${symbol}&type=STOCKS`;
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();
      
      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit - using cache');
        throw new Error('Rate limit exceeded');
      }

      const result = data.body;
      const keyData = result?.keyData || {};

      if (!result || !result.symbol) throw new Error('No metrics data');

      const metrics: FinancialMetrics = {
        symbol: symbol,
        marketCap: this.parsePrice(keyData.marketCap || keyData.marketCapitalization || '0'),
        peRatio: keyData.peRatio ? parseFloat(keyData.peRatio) : undefined,
        dividendYield: keyData.dividendYield ? parseFloat(keyData.dividendYield) : undefined,
        eps: keyData.eps || keyData.earningsPerShare ? parseFloat(keyData.eps || keyData.earningsPerShare) : undefined,
        weekHigh52: keyData.fiftyTwoWeekHigh ? this.parsePrice(keyData.fiftyTwoWeekHigh) : undefined,
        weekLow52: keyData.fiftyTwoWeekLow ? this.parsePrice(keyData.fiftyTwoWeekLow) : undefined,
      };

      await databaseService.saveFinancialMetrics(metrics);
      console.log('✅ Metrics saved to SQLite');

      return metrics;
    } catch (error) {
      console.warn('Error fetching metrics:', error);
      return await databaseService.getFinancialMetrics(symbol, Infinity);
    }
  }

  // =========================================================================
  // 5. GET HISTORICAL DATA (CHARTS)
  // Endpoint: /v1/markets/stock/history (Mboum Finance API)
  // =========================================================================
  async getHistoricalData(symbol: string, range: string = '1Y'): Promise<any[]> {
    await this.ensureInitialized();

    try {
      // 1. Try SQLite Cache
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

      // 3. API Call
      console.log(`📈 Fetching Chart (${range})...`);
      
      let interval = '1d';
      if (range === '1M') interval = '1d';
      else if (range === '6M') interval = '1d';
      else if (range === '1Y') interval = '1d';
      else if (range === '5Y') interval = '1wk';
      else if (range === 'ALL') interval = '1mo';

      const url = `${this.baseURL}/v1/markets/stock/history?symbol=${symbol}&interval=${interval}&diffandsplits=false`;
      
      // Log for debugging
      console.log('🔗 URL:', url);
      
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
  // 6. GET MARKET NEWS
  // Endpoint: /v1/markets/news (Mboum Finance API)
  // =========================================================================
  async getMarketNews(ticker: string = 'AAPL,TSLA'): Promise<any[]> {
    try {
      console.log('📰 Fetching Market News...');
      const url = `${this.baseURL}/v1/markets/news?ticker=${encodeURIComponent(ticker)}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Data structure: { body: [...] }
      const news = data.body || [];

      if (!Array.isArray(news)) {
        return [];
      }

      console.log(`✅ Fetched ${news.length} news articles`);
      return news;
    } catch (error) {
      console.warn('❌ Error fetching market news:', error);
      return [];
    }
  }

  // =========================================================================
  // 6B. GET EARNINGS CALENDAR
  // Endpoint: /v1/markets/calendar/earnings (Mboum Finance API)
  // =========================================================================
  async getEarningsCalendar(): Promise<any[]> {
    try {
      console.log('📅 Fetching Earnings Calendar...');
      const url = `${this.baseURL}/v1/markets/calendar/earnings`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Data structure: { body: [...] }
      const earnings = data.body || [];

      if (!Array.isArray(earnings)) {
        return [];
      }

      console.log(`✅ Fetched ${earnings.length} earnings events`);
      return earnings;
    } catch (error) {
      console.warn('❌ Error fetching earnings calendar:', error);
      return [];
    }
  }

  // =========================================================================
  // 7. GET STOCK MODULES (Statistics, Financial Data, etc.)
  // Endpoint: /v1/markets/stock/modules (Mboum Finance API)
  // Available modules: asset-profile, statistics, financial-data, 
  //                    income-statement, balance-sheet, cashflow-statement
  // =========================================================================
  async getStockModule(symbol: string, module: string): Promise<any> {
    try {
      console.log(`📊 Fetching ${module} for ${symbol}...`);
      const url = `${this.baseURL}/v1/markets/stock/modules?symbol=${symbol}&module=${module}`;
      
      const response = await fetch(url, { method: 'GET', headers: this.headers });
      const data = await response.json();

      // Check for rate limit
      if (data.message && data.message.includes('rate limit')) {
        console.warn('⚠️ Rate limit hit');
        return null;
      }

      console.log(`✅ Fetched ${module} data`);
      return data.body || null;
    } catch (error) {
      console.warn(`Error fetching ${module}:`, error);
      return null;
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
}

export const financeApiService = new FinanceApiService();