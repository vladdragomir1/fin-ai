import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StockQuote, ChartDataPoint } from '@/types';

// Real-time prices as of November 2025 (approximate market values)
const REAL_MARKET_PRICES: Record<string, number> = {
  AAPL: 178.50,  // Apple Inc.
  GOOGL: 142.30, // Alphabet Inc.
  MSFT: 415.20,  // Microsoft
  AMZN: 175.80,  // Amazon
  TSLA: 242.15,  // Tesla
  NVDA: 186.60,  // NVIDIA
  GE: 300.13,    // General Electric
  META: 485.20,  // Meta Platforms
  NFLX: 625.50,  // Netflix
  AMD: 145.80,   // Advanced Micro Devices
};

class OfflineDataService {
  private readonly STORAGE_KEY_PREFIX = '@finance_offline_';
  private readonly LAST_FETCH_KEY = '@finance_last_fetch_';
  private readonly CHAT_STORAGE_KEY = '@finai_chats'; // NEW: Chat History Key
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Save complete chat history (array of sessions)
   */
  async saveChatSessions(sessions: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.CHAT_STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving chat sessions:', error);
    }
  }

  /**
   * Load complete chat history
   */
  async getChatSessions(): Promise<any[]> {
    try {
      const json = await AsyncStorage.getItem(this.CHAT_STORAGE_KEY);
      return json ? JSON.parse(json) : [];
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      return [];
    }
  }

  /**
   * Fetch and cache real data from API, fallback to local prices
   */
  async getStockQuote(symbol: string, fetchFromAPI: () => Promise<StockQuote | null>): Promise<StockQuote> {
    try {
      // Try to get cached data first
      const cached = await this.getCachedQuote(symbol);
      const lastFetch = await this.getLastFetchTime(symbol);
      const now = Date.now();

      // If cache is fresh (< 24h), use it
      if (cached && lastFetch && (now - lastFetch) < this.CACHE_DURATION) {
        console.log('✅ Using cached quote for', symbol);
        return cached;
      }

      // Try to fetch fresh data from API
      const apiData = await fetchFromAPI();
      if (apiData) {
        console.log('✅ Got fresh API data for', symbol);
        await this.cacheQuote(symbol, apiData);
        await this.setLastFetchTime(symbol, now);
        return apiData;
      }

      // If we have cached data (even old), use it
      if (cached) {
        console.log('⚠️ Using old cached data for', symbol);
        return cached;
      }

      // Fallback to realistic local prices
      console.log('⚠️ Using local baseline price for', symbol);
      return this.getLocalQuote(symbol);
    } catch (error) {
      console.error('Error in getStockQuote:', error);
      // Try cached data
      const cached = await this.getCachedQuote(symbol);
      if (cached) return cached;
      
      // Last resort: local prices
      return this.getLocalQuote(symbol);
    }
  }

  private getLocalQuote(symbol: string): StockQuote {
    const price = REAL_MARKET_PRICES[symbol] || 100;
    
    const seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1);
    const variation = ((seed % 100) / 100 - 0.5) * 0.02; 
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

  public async cacheQuote(symbol: string, quote: StockQuote): Promise<void> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}quote_${symbol}`;
      await AsyncStorage.setItem(key, JSON.stringify(quote));
    } catch (error) {
      console.error('Error caching quote:', error);
    }
  }

  public async getCachedQuote(symbol: string): Promise<StockQuote | null> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}quote_${symbol}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached quote:', error);
      return null;
    }
  }

  private async setLastFetchTime(symbol: string, timestamp: number): Promise<void> {
    try {
      const key = `${this.LAST_FETCH_KEY}${symbol}`;
      await AsyncStorage.setItem(key, timestamp.toString());
    } catch (error) {
      console.error('Error setting last fetch time:', error);
    }
  }

  private async getLastFetchTime(symbol: string): Promise<number | null> {
    try {
      const key = `${this.LAST_FETCH_KEY}${symbol}`;
      const data = await AsyncStorage.getItem(key);
      return data ? parseInt(data, 10) : null;
    } catch (error) {
      console.error('Error getting last fetch time:', error);
      return null;
    }
  }

  async cacheChartData(symbol: string, range: string, data: ChartDataPoint[]): Promise<void> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}chart_${symbol}_${range}`;
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Error caching chart data:', error);
    }
  }

  async getCachedChartData(symbol: string, range: string): Promise<ChartDataPoint[] | null> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}chart_${symbol}_${range}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached chart data:', error);
      return null;
    }
  }

  async updateBaselinePrices(prices: Record<string, number>): Promise<void> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}baseline_prices`;
      await AsyncStorage.setItem(key, JSON.stringify(prices));
    } catch (error) {
      console.error('Error updating baseline prices:', error);
    }
  }

  async getBaselinePrices(): Promise<Record<string, number>> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}baseline_prices`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : REAL_MARKET_PRICES;
    } catch (error) {
      console.error('Error getting baseline prices:', error);
      return REAL_MARKET_PRICES;
    }
  }

  async cacheSearchResults(query: string, companies: any[]): Promise<void> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}search_${query.toLowerCase()}`;
      await AsyncStorage.setItem(key, JSON.stringify({
        results: companies,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Error caching search results:', error);
    }
  }

  async getCachedSearchResults(query: string): Promise<any[] | null> {
    try {
      const key = `${this.STORAGE_KEY_PREFIX}search_${query.toLowerCase()}`;
      const data = await AsyncStorage.getItem(key);
      if (!data) return null;
      
      const cached = JSON.parse(data);
      const age = Date.now() - cached.timestamp;
      
      if (age < 7 * 24 * 60 * 60 * 1000) {
        console.log('✅ Using cached search results for', query);
        return cached.results;
      }
      return null;
    } catch (error) {
      console.error('Error getting cached search:', error);
      return null;
    }
  }

  async clearCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const financeKeys = keys.filter(key => key.startsWith(this.STORAGE_KEY_PREFIX) || key.startsWith(this.LAST_FETCH_KEY));
      await AsyncStorage.multiRemove(financeKeys);
      console.log('✅ Cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Generate mock technical indicator data for offline/fallback use
   * Creates realistic-looking technical indicator values based on symbol
   */
  getMockTechnicalIndicators(symbol: string): any {
    // Use symbol characters to seed pseudo-random values for consistency
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rand = (min: number, max: number, offset: number = 0) => {
      const val = ((seed + offset) % 100) / 100;
      return min + val * (max - min);
    };

    const basePrice = REAL_MARKET_PRICES[symbol] || 100;
    
    // Generate SMA - typically close to current price
    const smaValue = basePrice * rand(0.95, 1.05, 1);
    
    // Generate RSI - typically between 30-70 for normal conditions
    const rsiValue = rand(35, 65, 2);
    
    // Generate MACD values
    const macdValue = rand(-2, 2, 3);
    const signalValue = rand(-1.5, 1.5, 4);
    const histogramValue = macdValue - signalValue;
    
    // Generate ADX - typically between 20-40 for strong trends
    const adxValue = rand(20, 45, 5);

    return {
      sma: {
        symbol,
        interval: '5m',
        series_type: 'close',
        time_period: 50,
        values: [{ value: smaValue, date: new Date().toISOString() }],
      },
      rsi: {
        symbol,
        interval: '5m',
        series_type: 'close',
        time_period: 14,
        values: [{ value: rsiValue, date: new Date().toISOString() }],
      },
      macd: {
        symbol,
        interval: '5m',
        series_type: 'close',
        fast_period: 12,
        slow_period: 26,
        signal_period: 9,
        values: [{
          MACD: macdValue,
          signal: signalValue,
          histogram: histogramValue,
          date: new Date().toISOString(),
        }],
      },
      adx: {
        symbol,
        interval: '5m',
        series_type: 'close',
        time_period: 14,
        values: [{ value: adxValue, date: new Date().toISOString() }],
      },
    };
  }
}

export const offlineDataService = new OfflineDataService();