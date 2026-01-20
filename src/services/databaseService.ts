import { open } from 'react-native-quick-sqlite';
import type { Company, StockQuote, ChartDataPoint, CompanyOverview, FinancialMetrics } from '@/types';
import { 
  getQuoteCacheTTL, 
  getModuleCacheTTL, 
  getOverviewCacheTTL, 
  getMetricsCacheTTL,
  getMarketDataCacheTTL,
  getNewsCacheTTL,
  getCalendarCacheTTL,
  getIndicatorCacheTTL,
  getTickersCacheTTL
} from '@/utils/marketHours';

interface SearchCacheEntry {
  query: string;
  results: Company[];
  timestamp: number;
}

class DatabaseService {
  private db: any = null;
  private readonly DB_NAME = 'finance_ai';
  private readonly DB_VERSION = 2; // Increment when schema changes

  /**
   * Initialize database and create tables
   */
  async initialize(): Promise<void> {
    try {
      //console.log('Initializing SQLite database...');
      
      this.db = open({ name: this.DB_NAME });

      await this.createTables();
      await this.migrateDatabase(); // Run migrations after table creation
      //console.log('Database initialized successfully');
    } catch (error) {
      //console.error('Error initializing database:', error);
      throw error;
    }
  }

  /**
   * Run database migrations for schema updates
   */
  private async migrateDatabase(): Promise<void> {
    if (!this.db) return;

    try {
      // Check current schema version
      await this.db.execute(`CREATE TABLE IF NOT EXISTS db_meta (key TEXT PRIMARY KEY, value TEXT)`);
      
      const versionResult = await this.db.execute(`SELECT value FROM db_meta WHERE key = 'schema_version'`);
      const currentVersion = versionResult?.rows?._array?.[0]?.value ? parseInt(versionResult.rows._array[0].value) : 1;

      if (currentVersion < 2) {
        console.log('🔄 Migrating database to v2 (nullable volume)...');
        
        // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
        // But first, let's try to just drop the constraint by recreating
        try {
          // Create new table with nullable volume
          await this.db.execute(`
            CREATE TABLE IF NOT EXISTS stock_quotes_new (
              symbol TEXT PRIMARY KEY,
              price REAL NOT NULL,
              change_value REAL NOT NULL,
              change_percent REAL NOT NULL,
              volume INTEGER,
              high REAL NOT NULL,
              low REAL NOT NULL,
              open REAL NOT NULL,
              previous_close REAL NOT NULL,
              timestamp TEXT NOT NULL,
              cached_at INTEGER NOT NULL
            );
          `);
          
          // Copy data from old table
          await this.db.execute(`
            INSERT OR IGNORE INTO stock_quotes_new 
            SELECT symbol, price, change_value, change_percent, volume, high, low, open, previous_close, timestamp, cached_at 
            FROM stock_quotes
          `);
          
          // Drop old table and rename new one
          await this.db.execute(`DROP TABLE IF EXISTS stock_quotes`);
          await this.db.execute(`ALTER TABLE stock_quotes_new RENAME TO stock_quotes`);
          
          console.log('✅ Database migrated to v2');
        } catch (migrationErr) {
          console.warn('Migration warning (may be first run):', migrationErr);
        }
        
        // Update version
        await this.db.execute(`INSERT OR REPLACE INTO db_meta (key, value) VALUES ('schema_version', '2')`);
      }
    } catch (err) {
      console.warn('Database migration check failed (non-critical):', err);
    }
  }

  /**
   * Create all necessary tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Companies table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        exchange TEXT,
        currency TEXT,
        country TEXT,
        cached_at INTEGER NOT NULL
      );
    `);

    // Stock quotes table - volume is nullable for stocks that don't report volume (some ETFs, mutual funds)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS stock_quotes (
        symbol TEXT PRIMARY KEY,
        price REAL NOT NULL,
        change_value REAL NOT NULL,
        change_percent REAL NOT NULL,
        volume INTEGER,
        high REAL NOT NULL,
        low REAL NOT NULL,
        open REAL NOT NULL,
        previous_close REAL NOT NULL,
        timestamp TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        FOREIGN KEY (symbol) REFERENCES companies(symbol)
      );
    `);

    // Historical data table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS historical_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        price REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        range TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        UNIQUE(symbol, date, range),
        FOREIGN KEY (symbol) REFERENCES companies(symbol)
      );
    `);

    // Company overview table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS company_overview (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        exchange TEXT,
        currency TEXT,
        country TEXT,
        description TEXT,
        sector TEXT,
        industry TEXT,
        employees INTEGER,
        website TEXT,
        cached_at INTEGER NOT NULL,
        FOREIGN KEY (symbol) REFERENCES companies(symbol)
      );
    `);

    // Financial metrics table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS financial_metrics (
        symbol TEXT PRIMARY KEY,
        pe_ratio REAL,
        eps REAL,
        market_cap REAL,
        dividend_yield REAL,
        week_high_52 REAL,
        week_low_52 REAL,
        beta REAL,
        average_volume INTEGER,
        cached_at INTEGER NOT NULL,
        FOREIGN KEY (symbol) REFERENCES companies(symbol)
      );
    `);

    // Search cache table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS search_cache (
        query TEXT PRIMARY KEY,
        results TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
    `);

    // Stock modules cache table (for all additional data modules)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS stock_modules (
        symbol TEXT NOT NULL,
        module TEXT NOT NULL,
        data TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        PRIMARY KEY (symbol, module),
        FOREIGN KEY (symbol) REFERENCES companies(symbol)
      );
    `);

    // Market data cache table (for screeners, news, etc.)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS market_data_cache (
        cache_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
    `);

    // Create indexes
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_historical_symbol ON historical_data(symbol);`);
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_historical_date ON historical_data(date);`);
    await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_modules_symbol ON stock_modules(symbol);`);

    //console.log('Database tables created');
  }

  /**
   * Save company to database
   */
  async saveCompany(company: Company): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execute(
      `INSERT OR REPLACE INTO companies (symbol, name, exchange, currency, country, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [company.symbol, company.name, company.exchange, company.currency, company.country, Date.now()]
    );
  }

  /**
   * Save stock quote to database
   */
  async saveStockQuote(quote: StockQuote): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Validate quote data before saving
    if (typeof quote.price !== 'number' || isNaN(quote.price) || quote.price <= 0) {
      console.warn(`[DB] ⚠️ Invalid quote price for ${quote.symbol}: ${quote.price} - skipping save`);
      return; // Don't save corrupted data
    }

    // Ensure company record exists so symbol appears in getAllCachedSymbols()
    await this.db.execute(
      `INSERT OR IGNORE INTO companies (symbol, name, exchange, currency, country, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [quote.symbol, quote.symbol, 'N/A', 'USD', 'USA', Date.now()]
    );

    // Handle null/undefined volume (some ETFs and mutual funds don't report volume)
    const safeVolume = (quote.volume && !isNaN(quote.volume)) ? quote.volume : null;

    await this.db.execute(
      `INSERT OR REPLACE INTO stock_quotes (symbol, price, change_value, change_percent, volume, high, low, open, previous_close, timestamp, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quote.symbol, quote.price, quote.change, quote.changePercent, safeVolume, quote.high, quote.low, quote.open, quote.previousClose, quote.timestamp, Date.now()]
    );
  }

  /**
   * Get cached stock quote
   * Uses market-aware TTL: 5min during market hours, 24h when closed
   */
  async getStockQuote(symbol: string, maxAge?: number): Promise<StockQuote | null> {
    if (!this.db) throw new Error('Database not initialized');

    // Use market-aware TTL if not explicitly provided
    const effectiveMaxAge = maxAge ?? getQuoteCacheTTL();

    const result = await this.db.execute(
      `SELECT * FROM stock_quotes WHERE symbol = ? AND cached_at > ?`,
      [symbol, Date.now() - effectiveMaxAge]
    );

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return null;

    const row = result.rows._array[0];
    return {
      symbol: row.symbol,
      price: row.price,
      change: row.change_value,
      changePercent: row.change_percent,
      volume: row.volume || 0, // Handle null volume
      high: row.high,
      low: row.low,
      open: row.open,
      previousClose: row.previous_close,
      timestamp: row.timestamp,
      cachedAt: row.cached_at, // Include cache timestamp for freshness indicator
    };
  }

  /**
   * Save historical data
   */
  async saveHistoricalData(symbol: string, range: string, data: ChartDataPoint[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    // Use a transaction for bulk delete+inserts for safety and performance
    try {
      await this.db.execute('BEGIN');
      await this.db.execute(`DELETE FROM historical_data WHERE symbol = ? AND range = ?`, [symbol, range]);

      // Deduplicate data by date to avoid UNIQUE constraint violations
      const uniqueData = new Map<string, ChartDataPoint>();
      for (const point of data) {
        // For intraday (1D), use timestamp as key; for others use date
        const key = range === '1D' ? `${point.date}_${point.timestamp}` : point.date;
        // Keep the latest entry for each key
        if (!uniqueData.has(key) || point.timestamp > (uniqueData.get(key)?.timestamp || 0)) {
          uniqueData.set(key, point);
        }
      }

      for (const point of uniqueData.values()) {
        await this.db.execute(
          `INSERT OR REPLACE INTO historical_data (symbol, date, price, timestamp, range, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [symbol, point.date, point.price, point.timestamp, range, now]
        );
      }

      await this.db.execute('COMMIT');
    } catch (err) {
      try {
        await this.db.execute('ROLLBACK');
      } catch (rbErr) {
        console.warn('Rollback failed', rbErr);
      }
      throw err;
    }
  }

  /**
   * Get cached historical data
   */
  async getHistoricalData(symbol: string, range: string, maxAge: number = 24 * 60 * 60 * 1000): Promise<ChartDataPoint[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.execute(
      `SELECT * FROM historical_data WHERE symbol = ? AND range = ? AND cached_at > ? ORDER BY timestamp ASC`,
      [symbol, range, Date.now() - maxAge]
    );

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return null;

    return result.rows._array.map((row: any) => ({
      date: row.date,
      price: row.price,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Save company overview
   */
  async saveCompanyOverview(overview: CompanyOverview): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Ensure company record exists
    await this.db.execute(
      `INSERT OR REPLACE INTO companies (symbol, name, exchange, currency, country, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [overview.symbol, overview.name, overview.exchange || 'N/A', overview.currency || 'USD', overview.country || 'USA', Date.now()]
    );

    await this.db.execute(
      `INSERT OR REPLACE INTO company_overview (symbol, name, exchange, currency, country, description, sector, industry, employees, website, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [overview.symbol, overview.name, overview.exchange, overview.currency, overview.country, overview.description || null, overview.sector, overview.industry, overview.employees || null, overview.website || null, Date.now()]
    );
  }

  /**
   * Get cached company overview
   * Uses 7-day TTL - company info rarely changes
   */
  async getCompanyOverview(symbol: string, maxAge?: number): Promise<CompanyOverview | null> {
    if (!this.db) throw new Error('Database not initialized');

    // Use 7-day TTL if not explicitly provided
    const effectiveMaxAge = maxAge ?? getOverviewCacheTTL();

    const result = await this.db.execute(
      `SELECT * FROM company_overview WHERE symbol = ? AND cached_at > ?`,
      [symbol, Date.now() - effectiveMaxAge]
    );

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return null;

    const row = result.rows._array[0];
    return {
      symbol: row.symbol,
      name: row.name,
      exchange: row.exchange,
      currency: row.currency,
      country: row.country,
      description: row.description,
      sector: row.sector,
      industry: row.industry,
      employees: row.employees,
      website: row.website,
    };
  }

  /**
   * Save financial metrics
   */
  async saveFinancialMetrics(metrics: FinancialMetrics): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Ensure company record exists
    await this.db.execute(
      `INSERT OR IGNORE INTO companies (symbol, name, exchange, currency, country, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [metrics.symbol, metrics.symbol, 'N/A', 'USD', 'USA', Date.now()]
    );

    await this.db.execute(
      `INSERT OR REPLACE INTO financial_metrics (symbol, pe_ratio, eps, market_cap, dividend_yield, week_high_52, week_low_52, beta, average_volume, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [metrics.symbol, metrics.peRatio || null, metrics.eps || null, metrics.marketCap || null, metrics.dividendYield || null, metrics.weekHigh52 || null, metrics.weekLow52 || null, metrics.beta || null, metrics.averageVolume || null, Date.now()]
    );
  }

  /**
   * Get cached financial metrics
   * Uses market-aware TTL: 4 hours during trading, 24 hours when closed
   */
  async getFinancialMetrics(symbol: string, maxAge?: number): Promise<FinancialMetrics | null> {
    if (!this.db) throw new Error('Database not initialized');

    // Use market-aware TTL if not explicitly provided
    const effectiveMaxAge = maxAge ?? getMetricsCacheTTL();

    const result = await this.db.execute(
      `SELECT * FROM financial_metrics WHERE symbol = ? AND cached_at > ?`,
      [symbol, Date.now() - effectiveMaxAge]
    );

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return null;

    const row = result.rows._array[0];
    return {
      symbol: row.symbol,
      peRatio: row.pe_ratio,
      eps: row.eps,
      marketCap: row.market_cap,
      dividendYield: row.dividend_yield,
      weekHigh52: row.week_high_52,
      weekLow52: row.week_low_52,
      beta: row.beta,
      averageVolume: row.average_volume,
    };
  }

  /**
   * Save search results to cache
   */
  async saveSearchCache(query: string, companies: Company[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    for (const company of companies) {
      await this.saveCompany(company);
    }

    await this.db.execute(
      `INSERT OR REPLACE INTO search_cache (query, results, cached_at) VALUES (?, ?, ?)`,
      [query.toLowerCase(), JSON.stringify(companies.map(c => c.symbol)), Date.now()]
    );
  }

  /**
   * Get cached search results
   */
  async getSearchCache(query: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<Company[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.execute(
      `SELECT * FROM search_cache WHERE query = ? AND cached_at > ?`,
      [query.toLowerCase(), Date.now() - maxAge]
    );

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return null;

    const row = result.rows._array[0];
    
    // Parse cached symbols with error handling
    let symbols: string[] = [];
    try {
      symbols = JSON.parse(row.results);
    } catch (parseError) {
      console.error('❌ Corrupted search cache data for query:', query, parseError);
      return null; // Return null to force fresh search
    }

    const companies: Company[] = [];
    for (const symbol of symbols) {
      const companyResult = await this.db.execute(`SELECT * FROM companies WHERE symbol = ?`, [symbol]);
      
      if (companyResult && companyResult.rows && companyResult.rows._array && companyResult.rows._array.length > 0) {
        const company = companyResult.rows._array[0];
        companies.push({
          symbol: company.symbol,
          name: company.name,
          exchange: company.exchange,
          currency: company.currency,
          country: company.country,
        });
      }
    }

    return companies.length > 0 ? companies : null;
  }

  /**
   * Get all data for a symbol (for RAG context)
   * ENHANCED: Now includes ALL available cached data from 20+ API endpoints
   */
  async getCompanyDataForRAG(symbol: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    // Core financial data (always fetch)
    const [quote, overview, metrics, historical] = await Promise.all([
      this.getStockQuote(symbol, Infinity),
      this.getCompanyOverview(symbol, Infinity),
      this.getFinancialMetrics(symbol, Infinity),
      this.getHistoricalData(symbol, '1Y', Infinity),
    ]);

    // Extended data from stock modules (if cached)
    const [earnings, recommendations, insiders, institutions, financialData, statistics] = await Promise.all([
      this.getStockModule(symbol, 'earnings-history', Infinity),
      this.getStockModule(symbol, 'recommendation-trend', Infinity),
      this.getStockModule(symbol, 'insider-holders', Infinity),
      this.getStockModule(symbol, 'institution-ownership', Infinity),
      this.getStockModule(symbol, 'financial-data', Infinity),
      this.getStockModule(symbol, 'statistics', Infinity),
    ]);

    // Financial statements (if cached)
    const [incomeStatement, balanceSheet, cashflowStatement] = await Promise.all([
      this.getStockModule(symbol, 'income-statement', Infinity),
      this.getStockModule(symbol, 'balance-sheet', Infinity),
      this.getStockModule(symbol, 'cashflow-statement', Infinity),
    ]);

    // Additional stock modules (if cached)
    const [secFilings, upgradeDowngrade, calendarEvents, netSharePurchase, indexTrend] = await Promise.all([
      this.getStockModule(symbol, 'sec-filings', Infinity),
      this.getStockModule(symbol, 'upgrade-downgrade-history', Infinity),
      this.getStockModule(symbol, 'calendar-events', Infinity),
      this.getStockModule(symbol, 'net-share-purchase-activity', Infinity),
      this.getStockModule(symbol, 'index-trend', Infinity),
    ]);

    // Technical indicators (if cached)
    const [sma, rsi, macd, adx] = await Promise.all([
      this.getMarketData(`indicator_sma_${symbol}_5m_50`, Infinity),
      this.getMarketData(`indicator_rsi_${symbol}_5m_14`, Infinity),
      this.getMarketData(`indicator_macd_${symbol}_5m_12_26_9`, Infinity),
      this.getMarketData(`indicator_adx_${symbol}_5m_14`, Infinity),
    ]);

    return {
      symbol,
      // Core data
      quote,
      overview,
      metrics,
      historical: historical?.slice(-30),
      // Extended modules
      earnings,
      recommendations,
      insiders,
      institutions,
      financialData,
      statistics,
      // Financial statements
      incomeStatement,
      balanceSheet,
      cashflowStatement,
      // Additional modules
      secFilings,
      upgradeDowngrade,
      calendarEvents,
      netSharePurchase,
      indexTrend,
      // Technical indicators
      technicalIndicators: {
        sma,
        rsi,
        macd,
        adx,
      },
    };
  }

  /**
   * Get market-wide calendar data for RAG context
   * Includes: dividends, IPOs, public offerings, stock splits, economic events
   */
  async getMarketCalendarsForRAG(): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    // Get all calendar data (use Infinity to get any cached data regardless of age)
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7);

    const [dividends, ipos, offerings, splits, economicEvents, earnings] = await Promise.all([
      this.getMarketData(`calendar_dividends_${today}`, Infinity),
      this.getMarketData(`calendar_ipo_${currentMonth}`, Infinity),
      this.getMarketData(`calendar_offerings_${currentMonth}`, Infinity),
      this.getMarketData('calendar_splits', Infinity),
      this.getMarketData('calendar_economic_events', Infinity),
      this.getMarketData('calendar_earnings', Infinity),
    ]);

    return {
      dividends,
      ipos,
      offerings,
      splits,
      economicEvents,
      earnings,
    };
  }

  /**
   * Get all cached symbols (for RAG knowledge base)
   */
  async getAllCachedSymbols(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.execute(`SELECT DISTINCT symbol FROM companies ORDER BY symbol`);

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return [];

    return result.rows._array.map((row: any) => row.symbol);
  }

  /**
   * Save stock module data
   */
  async saveStockModule(symbol: string, module: string, data: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execute(
      `INSERT OR REPLACE INTO stock_modules (symbol, module, data, cached_at) VALUES (?, ?, ?, ?)`,
      [symbol, module, JSON.stringify(data), Date.now()]
    );
  }

  /**
   * Get cached stock module data
   * Uses market-aware TTL: 1 hour during market hours, 24 hours when closed
   */
  async getStockModule(symbol: string, module: string, maxAge?: number): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');

    // Use market-aware TTL if not explicitly provided
    const effectiveMaxAge = maxAge ?? getModuleCacheTTL();

    const result = await this.db.execute(
      `SELECT * FROM stock_modules WHERE symbol = ? AND module = ? AND cached_at > ?`,
      [symbol, module, Date.now() - effectiveMaxAge]
    );

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return null;

    const row = result.rows._array[0];
    try {
      return JSON.parse(row.data);
    } catch (e) {
      console.warn('Failed to parse cached module data', e);
      return null;
    }
  }

  /**
   * Save market data (screeners, news, etc.)
   */
  async saveMarketData(cacheKey: string, data: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execute(
      `INSERT OR REPLACE INTO market_data_cache (cache_key, data, cached_at) VALUES (?, ?, ?)`,
      [cacheKey, JSON.stringify(data), Date.now()]
    );
  }

  /**
   * Get cached market data with smart TTL based on data type
   * - News: 15min open, 1hr closed
   * - Screeners/Movers: 15min open, 6hr closed
   * - Calendars: 4 hours always
   * - Indicators: 5min open, 4hr closed
   */
  async getMarketData(cacheKey: string, maxAge?: number): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');

    // Smart TTL based on cache key type
    let effectiveMaxAge = maxAge;
    if (effectiveMaxAge === undefined) {
      if (cacheKey.startsWith('news_')) {
        effectiveMaxAge = getNewsCacheTTL();
      } else if (cacheKey.startsWith('calendar_')) {
        effectiveMaxAge = getCalendarCacheTTL();
      } else if (cacheKey.startsWith('indicator_')) {
        effectiveMaxAge = getIndicatorCacheTTL();
      } else if (cacheKey.startsWith('tickers_')) {
        effectiveMaxAge = getTickersCacheTTL(); // 24hr for browse stocks
      } else {
        effectiveMaxAge = getMarketDataCacheTTL(); // Default for screeners
      }
    }

    const result = await this.db.execute(
      `SELECT * FROM market_data_cache WHERE cache_key = ? AND cached_at > ?`,
      [cacheKey, Date.now() - effectiveMaxAge]
    );

    if (!result || !result.rows || !result.rows._array || result.rows._array.length === 0) return null;

    const row = result.rows._array[0];
    try {
      return JSON.parse(row.data);
    } catch (e) {
      console.warn('Failed to parse cached market data', e);
      return null;
    }
  }

  /**
   * Clear cache for specific symbol (useful for forcing refresh)
   */
  async clearSymbolCache(symbol: string): Promise<void> {
    if (!this.db) return;

    try {
      await this.db.execute(`DELETE FROM stock_quotes WHERE symbol = ?`, [symbol]);
      await this.db.execute(`DELETE FROM stock_modules WHERE symbol = ?`, [symbol]);
      await this.db.execute(`DELETE FROM historical_data WHERE symbol = ?`, [symbol]);
      await this.db.execute(`DELETE FROM company_overview WHERE symbol = ?`, [symbol]);
      await this.db.execute(`DELETE FROM financial_metrics WHERE symbol = ?`, [symbol]);
      console.log(`✅ Cleared cache for ${symbol}`);
    } catch (error) {
      console.error('Error clearing symbol cache:', error);
    }
  }

  /**
   * Clear old cached data
   */
  async clearOldCache(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoff = Date.now() - maxAge;

    await this.db.execute(`DELETE FROM stock_quotes WHERE cached_at < ?`, [cutoff]);
    await this.db.execute(`DELETE FROM historical_data WHERE cached_at < ?`, [cutoff]);
    await this.db.execute(`DELETE FROM search_cache WHERE cached_at < ?`, [cutoff]);
    await this.db.execute(`DELETE FROM stock_modules WHERE cached_at < ?`, [cutoff]);
    await this.db.execute(`DELETE FROM market_data_cache WHERE cached_at < ?`, [cutoff]);

    //console.log('Old cache data cleared');
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      //console.log('Database closed');
    }
  }
}

export const databaseService = new DatabaseService();
