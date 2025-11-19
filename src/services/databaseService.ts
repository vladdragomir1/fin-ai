import { open } from 'react-native-quick-sqlite';
import type { Company, StockQuote, ChartDataPoint, CompanyOverview, FinancialMetrics } from '@/types';

interface SearchCacheEntry {
  query: string;
  results: Company[];
  timestamp: number;
}

class DatabaseService {
  private db: any = null;
  private readonly DB_NAME = 'finance_ai';

  /**
   * Initialize database and create tables
   */
  async initialize(): Promise<void> {
    try {
      console.log('🗄️ Initializing SQLite database...');
      
      this.db = open({ name: this.DB_NAME });

      await this.createTables();
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing database:', error);
      throw error;
    }
  }

  /**
   * Create all necessary tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Companies table
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        exchange TEXT,
        currency TEXT,
        country TEXT,
        cached_at INTEGER NOT NULL
      );
    `);

    // Stock quotes table
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS stock_quotes (
        symbol TEXT PRIMARY KEY,
        price REAL NOT NULL,
        change_value REAL NOT NULL,
        change_percent REAL NOT NULL,
        volume INTEGER NOT NULL,
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
    this.db.execute(`
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
    this.db.execute(`
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
    this.db.execute(`
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
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS search_cache (
        query TEXT PRIMARY KEY,
        results TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
    `);

    // Create indexes
    this.db.execute(`CREATE INDEX IF NOT EXISTS idx_historical_symbol ON historical_data(symbol);`);
    this.db.execute(`CREATE INDEX IF NOT EXISTS idx_historical_date ON historical_data(date);`);

    console.log('✅ Database tables created');
  }

  /**
   * Save company to database
   */
  async saveCompany(company: Company): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.execute(
      `INSERT OR REPLACE INTO companies (symbol, name, exchange, currency, country, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [company.symbol, company.name, company.exchange, company.currency, company.country, Date.now()]
    );
  }

  /**
   * Save stock quote to database
   */
  async saveStockQuote(quote: StockQuote): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.execute(
      `INSERT OR REPLACE INTO stock_quotes (symbol, price, change_value, change_percent, volume, high, low, open, previous_close, timestamp, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quote.symbol, quote.price, quote.change, quote.changePercent, quote.volume, quote.high, quote.low, quote.open, quote.previousClose, quote.timestamp, Date.now()]
    );
  }

  /**
   * Get cached stock quote
   */
  async getStockQuote(symbol: string, maxAge: number = 24 * 60 * 60 * 1000): Promise<StockQuote | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.execute(
      `SELECT * FROM stock_quotes WHERE symbol = ? AND cached_at > ?`,
      [symbol, Date.now() - maxAge]
    );

    if (!result.rows || result.rows.length === 0) return null;

    const row = result.rows._array[0];
    return {
      symbol: row.symbol,
      price: row.price,
      change: row.change_value,
      changePercent: row.change_percent,
      volume: row.volume,
      high: row.high,
      low: row.low,
      open: row.open,
      previousClose: row.previous_close,
      timestamp: row.timestamp,
    };
  }

  /**
   * Save historical data
   */
  async saveHistoricalData(symbol: string, range: string, data: ChartDataPoint[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    
    this.db.execute(`DELETE FROM historical_data WHERE symbol = ? AND range = ?`, [symbol, range]);

    for (const point of data) {
      this.db.execute(
        `INSERT INTO historical_data (symbol, date, price, timestamp, range, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [symbol, point.date, point.price, point.timestamp, range, now]
      );
    }
  }

  /**
   * Get cached historical data
   */
  async getHistoricalData(symbol: string, range: string, maxAge: number = 24 * 60 * 60 * 1000): Promise<ChartDataPoint[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.execute(
      `SELECT * FROM historical_data WHERE symbol = ? AND range = ? AND cached_at > ? ORDER BY timestamp ASC`,
      [symbol, range, Date.now() - maxAge]
    );

    if (!result.rows || result.rows.length === 0) return null;

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

    this.db.execute(
      `INSERT OR REPLACE INTO company_overview (symbol, name, exchange, currency, country, description, sector, industry, employees, website, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [overview.symbol, overview.name, overview.exchange, overview.currency, overview.country, overview.description || null, overview.sector, overview.industry, overview.employees || null, overview.website || null, Date.now()]
    );
  }

  /**
   * Get cached company overview
   */
  async getCompanyOverview(symbol: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<CompanyOverview | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.execute(
      `SELECT * FROM company_overview WHERE symbol = ? AND cached_at > ?`,
      [symbol, Date.now() - maxAge]
    );

    if (!result.rows || result.rows.length === 0) return null;

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

    this.db.execute(
      `INSERT OR REPLACE INTO financial_metrics (symbol, pe_ratio, eps, market_cap, dividend_yield, week_high_52, week_low_52, beta, average_volume, cached_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [metrics.symbol, metrics.peRatio || null, metrics.eps || null, metrics.marketCap || null, metrics.dividendYield || null, metrics.weekHigh52 || null, metrics.weekLow52 || null, metrics.beta || null, metrics.averageVolume || null, Date.now()]
    );
  }

  /**
   * Get cached financial metrics
   */
  async getFinancialMetrics(symbol: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<FinancialMetrics | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.execute(
      `SELECT * FROM financial_metrics WHERE symbol = ? AND cached_at > ?`,
      [symbol, Date.now() - maxAge]
    );

    if (!result.rows || result.rows.length === 0) return null;

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

    this.db.execute(
      `INSERT OR REPLACE INTO search_cache (query, results, cached_at) VALUES (?, ?, ?)`,
      [query.toLowerCase(), JSON.stringify(companies.map(c => c.symbol)), Date.now()]
    );
  }

  /**
   * Get cached search results
   */
  async getSearchCache(query: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<Company[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.execute(
      `SELECT * FROM search_cache WHERE query = ? AND cached_at > ?`,
      [query.toLowerCase(), Date.now() - maxAge]
    );

    if (!result.rows || result.rows.length === 0) return null;

    const row = result.rows._array[0];
    const symbols: string[] = JSON.parse(row.results);

    const companies: Company[] = [];
    for (const symbol of symbols) {
      const companyResult = this.db.execute(`SELECT * FROM companies WHERE symbol = ?`, [symbol]);
      
      if (companyResult.rows && companyResult.rows.length > 0) {
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
   */
  async getCompanyDataForRAG(symbol: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized');

    const [quote, overview, metrics, historical] = await Promise.all([
      this.getStockQuote(symbol, Infinity),
      this.getCompanyOverview(symbol, Infinity),
      this.getFinancialMetrics(symbol, Infinity),
      this.getHistoricalData(symbol, '1Y', Infinity),
    ]);

    return {
      symbol,
      quote,
      overview,
      metrics,
      historical: historical?.slice(-30),
    };
  }

  /**
   * Get all cached symbols (for RAG knowledge base)
   */
  async getAllCachedSymbols(): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db.execute(`SELECT DISTINCT symbol FROM companies ORDER BY symbol`);

    if (!result.rows || result.rows.length === 0) return [];

    return result.rows._array.map((row: any) => row.symbol);
  }

  /**
   * Clear old cached data
   */
  async clearOldCache(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoff = Date.now() - maxAge;

    this.db.execute(`DELETE FROM stock_quotes WHERE cached_at < ?`, [cutoff]);
    this.db.execute(`DELETE FROM historical_data WHERE cached_at < ?`, [cutoff]);
    this.db.execute(`DELETE FROM search_cache WHERE cached_at < ?`, [cutoff]);

    console.log('✅ Old cache data cleared');
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('✅ Database closed');
    }
  }
}

export const databaseService = new DatabaseService();
