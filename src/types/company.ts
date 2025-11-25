export interface Company {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  country: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

export interface FinancialMetrics {
  symbol: string;
  peRatio?: number;
  eps?: number;
  marketCap?: number;
  dividendYield?: number;
  weekHigh52?: number;
  weekLow52?: number;
  beta?: number;
  averageVolume?: number;
}

export interface CompanyOverview extends Company {
  description: string;
  sector: string;
  industry: string;
  employees?: number;
  website?: string;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: string;
}

export interface ChartDataPoint {
  date: string;
  price: number;
  timestamp: number;
}

export type ChartTimeRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'ALL';