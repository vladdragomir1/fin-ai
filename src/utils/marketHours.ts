/**
 * Market Hours Utility
 * Handles US Stock Market (NYSE/NASDAQ) trading hours detection
 * Market Hours: 9:30 AM - 4:00 PM Eastern Time, Monday-Friday
 * Excludes major US holidays
 */

// US Market Holidays 2024-2025 (NYSE/NASDAQ)
const US_MARKET_HOLIDAYS: string[] = [
  // 2024
  '2024-01-01', // New Year's Day
  '2024-01-15', // MLK Day
  '2024-02-19', // Presidents Day
  '2024-03-29', // Good Friday
  '2024-05-27', // Memorial Day
  '2024-06-19', // Juneteenth
  '2024-07-04', // Independence Day
  '2024-09-02', // Labor Day
  '2024-11-28', // Thanksgiving
  '2024-12-25', // Christmas
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

/**
 * Get Eastern Time offset in minutes (handles DST automatically)
 * EST = UTC-5, EDT = UTC-4
 */
const getEasternOffsetMinutes = (): number => {
  const now = new Date();
  const year = now.getUTCFullYear();
  
  // DST in US: Second Sunday of March to First Sunday of November
  // Find second Sunday of March
  const marchFirst = new Date(Date.UTC(year, 2, 1)); // March 1
  const marchFirstDay = marchFirst.getUTCDay();
  const secondSundayMarch = 8 + (7 - marchFirstDay) % 7; // Day of month
  const dstStart = Date.UTC(year, 2, secondSundayMarch, 7, 0, 0); // 2 AM EST = 7 AM UTC
  
  // Find first Sunday of November  
  const novFirst = new Date(Date.UTC(year, 10, 1)); // November 1
  const novFirstDay = novFirst.getUTCDay();
  const firstSundayNov = 1 + (7 - novFirstDay) % 7; // Day of month
  const dstEnd = Date.UTC(year, 10, firstSundayNov, 6, 0, 0); // 2 AM EDT = 6 AM UTC
  
  const nowUtc = now.getTime();
  
  // During DST (EDT): UTC-4 = -240 minutes
  // Outside DST (EST): UTC-5 = -300 minutes
  if (nowUtc >= dstStart && nowUtc < dstEnd) {
    return -240; // EDT
  }
  return -300; // EST
};

/**
 * Get current Eastern Time components (safe for React Native)
 */
const getEasternTimeComponents = (): { 
  year: number; 
  month: number; 
  day: number; 
  hours: number; 
  minutes: number; 
  dayOfWeek: number;
} => {
  const now = new Date();
  const offsetMinutes = getEasternOffsetMinutes();
  
  // Convert UTC to Eastern Time
  const etMs = now.getTime() + (offsetMinutes * 60 * 1000);
  const etDate = new Date(etMs);
  
  return {
    year: etDate.getUTCFullYear(),
    month: etDate.getUTCMonth() + 1, // 1-12
    day: etDate.getUTCDate(),
    hours: etDate.getUTCHours(),
    minutes: etDate.getUTCMinutes(),
    dayOfWeek: etDate.getUTCDay(), // 0 = Sunday
  };
};

/**
 * Get date string in YYYY-MM-DD format for Eastern Time
 */
const getEasternDateString = (): string => {
  const { year, month, day } = getEasternTimeComponents();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Check if today (Eastern Time) is a US market holiday
 */
export const isMarketHoliday = (): boolean => {
  try {
    const dateStr = getEasternDateString();
    return US_MARKET_HOLIDAYS.includes(dateStr);
  } catch (e) {
    console.warn('Error checking market holiday:', e);
    return false; // Assume not a holiday on error
  }
};

/**
 * Check if current time is within US market trading hours
 * Market Hours: 9:30 AM - 4:00 PM ET, Monday-Friday (excluding holidays)
 */
export const isMarketOpen = (): boolean => {
  try {
    const { hours, minutes, dayOfWeek } = getEasternTimeComponents();
    
    // Check if weekend (0 = Sunday, 6 = Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    // Check if holiday
    if (isMarketHoliday()) {
      return false;
    }
    
    // Check time (9:30 AM - 4:00 PM ET)
    const timeInMinutes = hours * 60 + minutes;
    const marketOpen = 9 * 60 + 30;  // 9:30 AM = 570 minutes
    const marketClose = 16 * 60;     // 4:00 PM = 960 minutes
    
    return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
  } catch (e) {
    console.warn('Error checking market open:', e);
    return false; // Assume closed on error
  }
};

/**
 * Check if within extended hours (pre-market or after-hours)
 * Pre-market: 4:00 AM - 9:30 AM ET
 * After-hours: 4:00 PM - 8:00 PM ET
 */
export const isExtendedHours = (): boolean => {
  try {
    const { hours, minutes, dayOfWeek } = getEasternTimeComponents();
    
    // Check if weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    // Check if holiday
    if (isMarketHoliday()) {
      return false;
    }
    
    const timeInMinutes = hours * 60 + minutes;
    
    const preMarketOpen = 4 * 60;    // 4:00 AM
    const marketOpen = 9 * 60 + 30;  // 9:30 AM
    const marketClose = 16 * 60;     // 4:00 PM
    const afterHoursClose = 20 * 60; // 8:00 PM
    
    const isPreMarket = timeInMinutes >= preMarketOpen && timeInMinutes < marketOpen;
    const isAfterHours = timeInMinutes >= marketClose && timeInMinutes < afterHoursClose;
    
    return isPreMarket || isAfterHours;
  } catch (e) {
    console.warn('Error checking extended hours:', e);
    return false;
  }
};

/**
 * Get appropriate cache TTL based on market status
 * - Market Open: 5 minutes (prices change frequently)
 * - Extended Hours: 15 minutes (less activity)
 * - Market Closed: 24 hours (prices won't change)
 */
export const getQuoteCacheTTL = (): number => {
  try {
    if (isMarketOpen()) {
      return 5 * 60 * 1000; // 5 minutes
    }
    if (isExtendedHours()) {
      return 15 * 60 * 1000; // 15 minutes
    }
  } catch (e) {
    console.warn('Error getting cache TTL:', e);
  }
  return 24 * 60 * 60 * 1000; // 24 hours (default)
};

/**
 * Get cache TTL for market data (screeners, movers)
 * - Market Open: 15 minutes
 * - Extended Hours: 30 minutes
 * - Market Closed: 6 hours (refreshes at pre-market or API calls)
 */
export const getMarketDataCacheTTL = (): number => {
  try {
    if (isMarketOpen()) {
      return 15 * 60 * 1000; // 15 minutes
    }
    if (isExtendedHours()) {
      return 30 * 60 * 1000; // 30 minutes
    }
  } catch (e) {
    console.warn('Error getting market data cache TTL:', e);
  }
  return 6 * 60 * 60 * 1000; // 6 hours when closed
};

/**
 * Get cache TTL for news
 * - Market Open: 15 minutes (news impacts prices)
 * - Extended/Closed: 1 hour
 */
export const getNewsCacheTTL = (): number => {
  try {
    if (isMarketOpen()) {
      return 15 * 60 * 1000; // 15 minutes
    }
  } catch (e) {
    console.warn('Error getting news cache TTL:', e);
  }
  return 60 * 60 * 1000; // 1 hour
};

/**
 * Get cache TTL for stock modules (financials, insider data, etc.)
 * These don't change as frequently as quotes
 * - Market Open: 1 hour
 * - Market Closed: 24 hours
 */
export const getModuleCacheTTL = (): number => {
  try {
    if (isMarketOpen()) {
      return 60 * 60 * 1000; // 1 hour during trading
    }
  } catch (e) {
    console.warn('Error getting module cache TTL:', e);
  }
  return 24 * 60 * 60 * 1000; // 24 hours when closed
};

/**
 * Get cache TTL for company overview (very static data)
 * - Always: 7 days (company info rarely changes)
 */
export const getOverviewCacheTTL = (): number => {
  return 7 * 24 * 60 * 60 * 1000; // 7 days
};

/**
 * Get cache TTL for financial metrics (P/E, EPS, etc.)
 * - Market Open: 4 hours (updates after earnings)
 * - Market Closed: 24 hours
 */
export const getMetricsCacheTTL = (): number => {
  try {
    if (isMarketOpen()) {
      return 4 * 60 * 60 * 1000; // 4 hours
    }
  } catch (e) {
    console.warn('Error getting metrics cache TTL:', e);
  }
  return 24 * 60 * 60 * 1000; // 24 hours
};

/**
 * Get cache TTL for calendar data (earnings, dividends, IPOs)
 * - Always: 4 hours (calendars update infrequently)
 */
export const getCalendarCacheTTL = (): number => {
  return 4 * 60 * 60 * 1000; // 4 hours
};

/**
 * Get cache TTL for technical indicators (SMA, RSI, MACD)
 * - Market Open: 5 minutes
 * - Extended Hours: 15 minutes  
 * - Market Closed: 4 hours
 */
export const getIndicatorCacheTTL = (): number => {
  try {
    if (isMarketOpen()) {
      return 5 * 60 * 1000; // 5 minutes
    }
    if (isExtendedHours()) {
      return 15 * 60 * 1000; // 15 minutes
    }
  } catch (e) {
    console.warn('Error getting indicator cache TTL:', e);
  }
  return 4 * 60 * 60 * 1000; // 4 hours when closed
};

/**
 * Get market status string for UI display
 */
export const getMarketStatus = (): 'open' | 'pre-market' | 'after-hours' | 'closed' => {
  try {
    if (isMarketOpen()) return 'open';
    if (isExtendedHours()) {
      const { hours, minutes } = getEasternTimeComponents();
      return hours < 9 || (hours === 9 && minutes < 30) ? 'pre-market' : 'after-hours';
    }
  } catch (e) {
    console.warn('Error getting market status:', e);
  }
  return 'closed';
};

/**
 * Format time ago string (e.g., "2 min ago", "1 hr ago")
 */
export const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  
  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
};
