/**
 * TradingView Price Service
 * Manages price data extracted from TradingView charts
 * Used as fallback when API quota is exceeded
 */

interface TradingViewPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

class TradingViewPriceService {
  private priceCache: Map<string, TradingViewPrice> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute

  /**
   * Store price data from TradingView chart
   */
  setPrice(symbol: string, price: number, change: number, changePercent: number): void {
    this.priceCache.set(symbol, {
      symbol,
      price,
      change,
      changePercent,
      timestamp: Date.now(),
    });
  }

  /**
   * Get cached price for a symbol
   */
  getPrice(symbol: string): TradingViewPrice | null {
    const cached = this.priceCache.get(symbol);
    if (!cached) return null;

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.priceCache.delete(symbol);
      return null;
    }

    return cached;
  }

  /**
   * Check if we have fresh data for a symbol
   */
  hasPrice(symbol: string): boolean {
    return this.getPrice(symbol) !== null;
  }

  /**
   * Clear all cached prices
   */
  clearCache(): void {
    this.priceCache.clear();
  }
}

export const tradingViewPriceService = new TradingViewPriceService();
