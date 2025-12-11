export interface Company {
  symbol: string;
  name: string;
  exchange?: string;
  currency?: string;
  country?: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

export interface CompanyOverview {
  symbol: string;
  name: string;
  description: string;
  exchange: string;
  currency: string;
  country: string;
  sector: string;
  industry: string;
  employees?: number;
  website?: string;
}

export interface FinancialMetrics {
  symbol: string;
  peRatio?: number;
  eps?: number;
  marketCap?: number;
  dividendYield?: number;
  beta?: number;
  weekHigh52?: number;
  weekLow52?: number;
  averageVolume?: number;
}

export interface ChartDataPoint {
  date: string;
  price: number;
  timestamp: number;
}

export type ChartTimeRange = '1M' | '6M' | '1Y' | '5Y' | 'ALL';

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt?: string;
}

export interface NewsArticle {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
  image?: string;
  tickers?: string[];
}

export interface EarningsEvent {
  symbol: string;
  companyName?: string;
  date: string;
  time?: string;
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimate?: number;
  revenueActual?: number;
}

// Technical Indicators
export interface IndicatorDataPoint {
  date: string;
  value: number;
}

export interface SMAIndicator {
  symbol: string;
  interval: string;
  series_type: string;
  time_period: number;
  data: IndicatorDataPoint[];
}

export interface RSIIndicator {
  symbol: string;
  interval: string;
  series_type: string;
  time_period: number;
  data: IndicatorDataPoint[];
}

export interface MACDIndicator {
  symbol: string;
  interval: string;
  series_type: string;
  fast_period: number;
  slow_period: number;
  signal_period: number;
  data: {
    date: string;
    MACD: number;
    signal: number;
    histogram: number;
  }[];
}

export interface ADXIndicator {
  symbol: string;
  interval: string;
  series_type: string;
  time_period: number;
  data: IndicatorDataPoint[];
}

export interface TechnicalIndicators {
  sma?: SMAIndicator;
  rsi?: RSIIndicator;
  macd?: MACDIndicator;
  adx?: ADXIndicator;
}