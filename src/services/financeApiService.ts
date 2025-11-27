import type { Company, CompanyOverview, StockQuote, FinancialMetrics } from '@/types';
import { databaseService } from './databaseService';
import { offlineDataService } from './offlineDataService';

import { ALPHA_VANTAGE_KEY, ALPHA_VANTAGE_URL } from '@env';

class FinanceApiService {
  private initialized = false;

  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await databaseService.initialize();
      this.initialized = true;
    }
  }
  // Căutare companii după simbol sau nume
  async searchCompanies(query: string): Promise<Company[]> {
    await this.ensureInitialized();

    try {
      // Check SQLite cache first (with AsyncStorage fallback)
      let cached: Company[] | null = null;
      try {
        cached = await databaseService.getSearchCache(query);
      } catch (dbErr) {
        console.warn('SQLite search cache read failed, falling back to AsyncStorage', dbErr);
      }

      if (cached) {
        console.log('✅ Using cached search results from SQLite');
        return cached;
      }

      // Try AsyncStorage cached search results before calling API
      try {
        const asCached = await offlineDataService.getCachedSearchResults(query);
        if (asCached && asCached.length > 0) {
          console.log('✅ Using cached search results from AsyncStorage');
          return asCached;
        }
      } catch (asErr) {
        console.warn('AsyncStorage search read failed', asErr);
      }

      const url = `${ALPHA_VANTAGE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${ALPHA_VANTAGE_KEY}`;
      console.log('🔍 Searching Alpha Vantage API');

      // Helper to detect fetch aborts
      const isAbortError = (err: any) => {
        return err && (err.name === 'AbortError' || (typeof err.message === 'string' && err.message.includes('Aborted')));
      };

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

      // Attempt fetch with a small retry/backoff for transient network failures
      const maxRetries = 2;
      let attempt = 0;
      let data: any = null;
      let lastError: any = null;

      while (attempt <= maxRetries) {
        attempt += 1;
        const controller = new AbortController();
        const timeoutMs = 7000; // slightly larger timeout
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);

          // If non-OK, treat as error (avoid repeated retries when rate limited)
          if (!response.ok) {
            const txt = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} ${txt}`);
          }

          data = await response.json();

          // If API returns rate-limit note or error message, do not retry
          if (data['Note'] || data['Error Message']) {
            console.warn('❌ Alpha Vantage Error:', data['Error Message'] || data['Note']);
            // ensure we don't attempt further retries
            lastError = data['Note'] || data['Error Message'];
            break;
          }

          // Successful response
          break;
        } catch (err) {
          clearTimeout(timeoutId);
          lastError = err;

          // If abort (timeout) — bail out and use cache if available
          if (isAbortError(err)) {
            console.warn('⏱️ Search aborted (timeout). Will use cached results if available.', err);
            break;
          }

          // If we've exhausted retries, break and fall through to fallback logic
          if (attempt > maxRetries) {
            console.warn('Fetch failed after retries:', err);
            break;
          }

          // Backoff then retry
          const backoff = 500 * Math.pow(2, attempt - 1);
          console.warn(`Fetch attempt ${attempt} failed, retrying in ${backoff}ms...`, err);
          // small sleep before retry
          // eslint-disable-next-line no-await-in-loop
          await sleep(backoff);
          continue;
        }
      }

      // If we didn't get valid data from API, try to use cached results
      if (!data) {
        if (lastError && (typeof lastError === 'object') && (lastError['Note'] || lastError['Error Message'])) {
          // Rate limit response which we already logged — prefer cached
        }

        // if we have cached (SQLite) return it
        if (cached) return cached;
        // try AsyncStorage cached search results
        try {
          const asCached = await offlineDataService.getCachedSearchResults(query);
          if (asCached && asCached.length > 0) return asCached;
        } catch (asErr) {
          console.warn('AsyncStorage search read failed during API fallback', asErr);
        }

        // nothing left — return empty
        return [];
      }

      // Parse results
      if (data.bestMatches && Array.isArray(data.bestMatches) && data.bestMatches.length > 0) {
        const companies = data.bestMatches.map((item: any) => ({
          symbol: item['1. symbol'],
          name: item['2. name'],
          exchange: item['4. region'] || 'N/A',
          currency: item['8. currency'] || 'USD',
          country: item['4. region'] || 'USA',
        }));
        
        console.log('✅ Found companies from API:', companies.length);
        
        // Save to SQLite (best-effort) and AsyncStorage as fallback
        try {
          await databaseService.saveSearchCache(query, companies);
        } catch (saveErr) {
          console.warn('Saving search cache to SQLite failed, caching to AsyncStorage instead', saveErr);
          try {
            await offlineDataService.cacheSearchResults(query, companies as any[]);
          } catch (asErr) {
            console.warn('Caching search results to AsyncStorage failed', asErr);
          }
        }
        
        return companies;
      }

      return cached || [];
    } catch (error) {
    console.warn('❌ Error searching companies:', error);
      // Try SQLite first, then AsyncStorage
      try {
        const cached = await databaseService.getSearchCache(query);
        if (cached) return cached;
      } catch (dbErr) {
        console.warn('SQLite search cache read failed in error handler', dbErr);
      }

      try {
        const asCached = await offlineDataService.getCachedSearchResults(query);
        if (asCached) return asCached;
      } catch (asErr) {
        console.warn('AsyncStorage search read failed in error handler', asErr);
      }

      return [];
    }
  }

  // Obține cotația curentă pentru un simbol
  async getStockQuote(symbol: string): Promise<StockQuote | null> {
    await this.ensureInitialized();

    try {
      // Check SQLite cache first (fresh if < 24h)
      let cached: StockQuote | null = null;
      try {
        cached = await databaseService.getStockQuote(symbol);
      } catch (dbErr) {
        console.warn('SQLite quote read failed, falling back to AsyncStorage', dbErr);
      }

      if (cached) {
        console.log('✅ Using cached quote from SQLite');
        return cached;
      }

      // Try AsyncStorage cached quote before calling API
      try {
        const asCached = await offlineDataService.getCachedQuote(symbol);
        if (asCached) {
          console.log('✅ Using cached quote from AsyncStorage');
          return asCached;
        }
      } catch (asErr) {
        console.warn('AsyncStorage quote read failed', asErr);
      }

      const url = `${ALPHA_VANTAGE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      console.log('📊 Fetching quote from API');
      
      const response = await fetch(url);
      const data = await response.json();

      if (data['Note']) {
        console.warn('⚠️ Rate limit - checking old cache');
        try {
          const oldCached = await databaseService.getStockQuote(symbol, Infinity);
          if (oldCached) return oldCached;
        } catch (dbErr) {
          console.warn('SQLite old-quote read failed during rate limit handling', dbErr);
        }

        try {
          const asOld = await offlineDataService.getCachedQuote(symbol);
          if (asOld) return asOld;
        } catch (asErr) {
          console.warn('AsyncStorage old-quote read failed during rate limit handling', asErr);
        }

        return this.getMockStockQuote(symbol);
      }

      const quote = data['Global Quote'];
      if (quote && quote['05. price']) {
        const stockQuote: StockQuote = {
          symbol: quote['01. symbol'],
          price: parseFloat(quote['05. price']),
          change: parseFloat(quote['09. change']),
          changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
          volume: parseInt(quote['06. volume']),
          high: parseFloat(quote['03. high']),
          low: parseFloat(quote['04. low']),
          open: parseFloat(quote['02. open']),
          previousClose: parseFloat(quote['08. previous close']),
          timestamp: quote['07. latest trading day'],
        };

        // Save to SQLite and also cache in AsyncStorage as fallback
        try {
          await databaseService.saveStockQuote(stockQuote);
          console.log('✅ Quote saved to SQLite');
        } catch (saveErr) {
          console.warn('Saving quote to SQLite failed, caching to AsyncStorage', saveErr);
          try {
            await offlineDataService.cacheQuote(symbol, stockQuote as any);
          } catch (asErr) {
            console.warn('Caching quote to AsyncStorage failed', asErr);
          }
        }

        return stockQuote;
      }

      return null;
    } catch (error) {
      console.warn('Error fetching stock quote:', error);
      try {
        const oldCached = await databaseService.getStockQuote(symbol, Infinity);
        if (oldCached) return oldCached;
      } catch (dbErr) {
        console.warn('SQLite old-quote read failed in catch handler', dbErr);
      }

      try {
        const asOld = await offlineDataService.getCachedQuote(symbol);
        if (asOld) return asOld;
      } catch (asErr) {
        console.warn('AsyncStorage old-quote read failed in catch handler', asErr);
      }

      return this.getMockStockQuote(symbol);
    }
  }

  // Obține detalii complete despre companie
  async getCompanyOverview(symbol: string): Promise<CompanyOverview | null> {
    await this.ensureInitialized();

    try {
      // Check SQLite cache first (7 days)
      const cached = await databaseService.getCompanyOverview(symbol);
      if (cached) {
        console.log('✅ Using cached overview from SQLite');
        return cached;
      }

      const url = `${ALPHA_VANTAGE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      console.log('📋 Fetching overview from API');
      
      const response = await fetch(url);
      const data = await response.json();

      if (data['Note'] || !data.Symbol) {
        console.log('⚠️ No overview data available - checking old cache');
        return await databaseService.getCompanyOverview(symbol, Infinity);
      }

      const overview: CompanyOverview = {
        symbol: data.Symbol,
        name: data.Name,
        exchange: data.Exchange,
        currency: data.Currency,
        country: data.Country,
        description: data.Description,
        sector: data.Sector,
        industry: data.Industry,
        employees: data.FullTimeEmployees ? parseInt(data.FullTimeEmployees) : undefined,
        website: data.OfficialSite,
      };

      // Save to SQLite
      await databaseService.saveCompanyOverview(overview);
      console.log('✅ Overview saved to SQLite');

      return overview;
    } catch (error) {
      console.warn('Error fetching company overview:', error);
      return await databaseService.getCompanyOverview(symbol, Infinity);
    }
  }

  // Obține metrici financiare
  async getFinancialMetrics(symbol: string): Promise<FinancialMetrics | null> {
    await this.ensureInitialized();

    try {
      // Check SQLite cache first (7 days)
      const cached = await databaseService.getFinancialMetrics(symbol);
      if (cached) {
        console.log('✅ Using cached metrics from SQLite');
        return cached;
      }

      const url = `${ALPHA_VANTAGE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      console.log('📈 Fetching metrics from API');
      
      const response = await fetch(url);
      const data = await response.json();

      if (data['Note'] || !data.Symbol) {
        console.log('⚠️ No metrics data available - checking old cache');
        return await databaseService.getFinancialMetrics(symbol, Infinity);
      }

      const metrics: FinancialMetrics = {
        symbol: data.Symbol,
        peRatio: data.PERatio ? parseFloat(data.PERatio) : undefined,
        eps: data.EPS ? parseFloat(data.EPS) : undefined,
        marketCap: data.MarketCapitalization ? parseFloat(data.MarketCapitalization) : undefined,
        dividendYield: data.DividendYield ? parseFloat(data.DividendYield) * 100 : undefined,
        weekHigh52: data['52WeekHigh'] ? parseFloat(data['52WeekHigh']) : undefined,
        weekLow52: data['52WeekLow'] ? parseFloat(data['52WeekLow']) : undefined,
        beta: data.Beta ? parseFloat(data.Beta) : undefined,
        averageVolume: data['50DayMovingAverage'] ? undefined : undefined,
      };

      // Save to SQLite
      await databaseService.saveFinancialMetrics(metrics);
      console.log('✅ Metrics saved to SQLite');

      return metrics;
    } catch (error) {
      console.warn('Error fetching financial metrics:', error);
      return await databaseService.getFinancialMetrics(symbol, Infinity);
    }
  }



  // Obține date istorice pentru chart
  async getHistoricalData(symbol: string, range: string = '1Y'): Promise<any[]> {
    await this.ensureInitialized();

    try {
      // Check SQLite cache first (with AsyncStorage fallback)
      let cached: any[] | null = null;
      try {
        cached = await databaseService.getHistoricalData(symbol, range);
      } catch (dbErr) {
        console.warn('SQLite historical read failed, falling back to AsyncStorage', dbErr);
      }

      if (cached) {
        console.log('✅ Using cached historical data from SQLite');
        return cached;
      }

      try {
        const asCached = await offlineDataService.getCachedChartData(symbol, range);
        if (asCached) {
          console.log('✅ Using cached historical data from AsyncStorage');
          return asCached;
        }
      } catch (asErr) {
        console.warn('AsyncStorage historical read failed', asErr);
      }

      const url = `${ALPHA_VANTAGE_URL}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
      console.log('📈 Fetching historical data from API');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (data['Note'] || data['Error Message']) {
        console.log('⚠️ Rate limit - checking old cache');
        try {
          const oldCached = await databaseService.getHistoricalData(symbol, range, Infinity);
          if (oldCached) return oldCached;
        } catch (dbErr) {
          console.warn('SQLite historical old-cache read failed during rate limit handling', dbErr);
        }

        try {
          const asOld = await offlineDataService.getCachedChartData(symbol, range);
          if (asOld) return asOld;
        } catch (asErr) {
          console.warn('AsyncStorage historical old-cache read failed during rate limit handling', asErr);
        }

        return this.getMockChartData(symbol, range);
      }
      
      const timeSeries = data['Time Series (Daily)'];
      if (timeSeries) {
        let chartData = Object.entries(timeSeries).map(([date, values]: [string, any]) => ({
          date,
          price: parseFloat(values['4. close']),
          timestamp: new Date(date).getTime(),
        }));
        
        chartData = chartData.sort((a, b) => a.timestamp - b.timestamp);
        
        // Filter by range
        const now = Date.now();
        let cutoffDate = now;
        if (range === '1M') cutoffDate = now - 30 * 24 * 60 * 60 * 1000;
        else if (range === '6M') cutoffDate = now - 180 * 24 * 60 * 60 * 1000;
        else if (range === '1Y') cutoffDate = now - 365 * 24 * 60 * 60 * 1000;
        else if (range === '5Y') cutoffDate = now - 5 * 365 * 24 * 60 * 60 * 1000;
        
        if (range !== 'ALL') {
          chartData = chartData.filter(d => d.timestamp >= cutoffDate);
        }
        
        // Save to SQLite and also cache to AsyncStorage as fallback
        try {
          await databaseService.saveHistoricalData(symbol, range, chartData);
          console.log('✅ Historical data saved to SQLite:', chartData.length, 'points');
        } catch (saveErr) {
          console.warn('Saving historical data to SQLite failed, caching to AsyncStorage', saveErr);
          try {
            await offlineDataService.cacheChartData(symbol, range, chartData);
          } catch (asErr) {
            console.warn('Caching historical data to AsyncStorage failed', asErr);
          }
        }
        
        return chartData;
      }
      
      return await databaseService.getHistoricalData(symbol, range, Infinity) || this.getMockChartData(symbol, range);
    } catch (error) {
      console.warn('❌ Error fetching historical data:', error);
      return await databaseService.getHistoricalData(symbol, range, Infinity) || this.getMockChartData(symbol, range);
    }
  }

  // Generează date mock pentru chart
  getMockChartData(symbol: string, range: string): any[] {
    const basePrice = this.getMockStockQuote(symbol).price;
    const dataPoints: any[] = [];
    const now = Date.now();
    
    // Determină numărul de zile bazat pe range
    let days = 365;
    if (range === '1M') days = 30;
    else if (range === '6M') days = 180;
    else if (range === '5Y') days = 1825;
    else if (range === 'ALL') days = 3650;
    
    // Generează date mock cu variație realistă
    for (let i = days; i >= 0; i--) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const variation = (Math.random() - 0.5) * 0.1; // ±5% variație
      const trend = (days - i) / days * 0.2; // Trend ascendent de 20%
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
    // Real market prices matching TradingView charts (as of November 2025)
    const mockPrices: Record<string, number> = {
      AAPL: 178.50,   // Apple Inc.
      GOOGL: 142.30,  // Alphabet Inc.
      MSFT: 415.20,   // Microsoft
      AMZN: 175.80,   // Amazon
      TSLA: 242.15,   // Tesla
      NVDA: 186.60,   // NVIDIA
      GE: 300.13,     // General Electric
      META: 485.20,   // Meta Platforms
      NFLX: 625.50,   // Netflix
      AMD: 145.80,    // Advanced Micro Devices
      INTC: 48.50,    // Intel
      CSCO: 56.30,    // Cisco
      ORCL: 125.40,   // Oracle
      IBM: 195.20,    // IBM
      DIS: 95.80,     // Disney
    };

    const price = mockPrices[symbol] || 100;
    
    // Use deterministic variation based on symbol for consistency
    const seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1);
    const variation = ((seed % 100) / 100 - 0.5) * 0.02; // Deterministic ±1%
    const change = price * variation;
    const changePercent = variation * 100;

    return {
      symbol,
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: Math.floor((seed % 50) * 1000000 + 50000000),
      high: parseFloat((price + price * 0.015).toFixed(2)),
      low: parseFloat((price - price * 0.015).toFixed(2)),
      open: parseFloat((price + change * 0.5).toFixed(2)),
      previousClose: parseFloat((price - change).toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }
}

export const financeApiService = new FinanceApiService();
