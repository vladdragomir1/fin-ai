import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  ActivityIndicator, 
  TouchableOpacity,
  Linking,
  Image,
  FlatList
} from 'react-native';
import { 
  Newspaper, 
  Calendar, 
  ExternalLink,
  TrendingUp,
  AlertCircle,
  Clock,
  DollarSign,
  Building2,
  TrendingDown,
  Split,
  ChevronRight
} from 'lucide-react-native';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';
import { financeApiService } from '@/services/financeApiService';

type ViewMode = 'NEWS' | 'CALENDAR';
type CalendarCategory = 'EARNINGS' | 'DIVIDENDS' | 'ECONOMIC' | 'IPOS' | 'OFFERINGS' | 'SPLITS';

export const StatisticsScreen = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('NEWS');
  const [calendarCategory, setCalendarCategory] = useState<CalendarCategory>('EARNINGS');
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  
  // News data
  const [news, setNews] = useState<any[]>([]);
  const [newsFilter, setNewsFilter] = useState<'ALL' | 'Article' | 'Video'>('ALL');
  
  // Calendar data
  const [earnings, setEarnings] = useState<any[]>([]);
  const [dividends, setDividends] = useState<any[]>([]);
  const [economicEvents, setEconomicEvents] = useState<any[]>([]);
  const [ipos, setIPOs] = useState<any>({ priced: [], upcoming: [] });
  const [publicOfferings, setPublicOfferings] = useState<any>({ priced: [], upcoming: [], filed: [] });
  const [stockSplits, setStockSplits] = useState<any[]>([]);
  
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (viewMode === 'NEWS' && news.length === 0) {
      loadNewsData();
    } else if (viewMode === 'CALENDAR' && earnings.length === 0) {
      loadCalendarData();
    }
  }, [viewMode]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    await loadNewsData();
    setLoading(false);
  };

  const loadNewsData = async () => {
    setNewsLoading(true);
    setError(null);
    try {
      const newsData = await financeApiService.getMarketNews(undefined, 'ALL');
      setNews(newsData);
    } catch (err) {
      console.error('Error loading news:', err);
      setError('Failed to load news');
    } finally {
      setNewsLoading(false);
    }
  };

  const loadCalendarData = async () => {
    setCalendarLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().slice(0, 7);
      
      const [
        earningsData,
        dividendsData,
        economicData,
        ipoData,
        offeringsData,
        splitsData
      ] = await Promise.all([
        financeApiService.getEarningsCalendar(),
        financeApiService.getDividendsCalendar(today),
        financeApiService.getEconomicEventsCalendar(today),
        financeApiService.getIPOCalendar(currentMonth),
        financeApiService.getPublicOfferingsCalendar(currentMonth),
        financeApiService.getStockSplitsCalendar(),
      ]);
      
      setEarnings(earningsData.slice(0, 20));
      setDividends(dividendsData.slice(0, 15));
      setEconomicEvents(economicData.slice(0, 15));
      setIPOs(ipoData);
      setPublicOfferings(offeringsData);
      setStockSplits(splitsData.slice(0, 15));
    } catch (err) {
      console.error('Error loading calendar data:', err);
      setError('Failed to load calendar data');
    } finally {
      setCalendarLoading(false);
    }
  };

  const openNewsUrl = (url: string) => {
    if (url) {
      Linking.openURL(url).catch(err => console.warn('Failed to open URL:', err));
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatPrice = (price: number | string) => {
    if (typeof price === 'string') {
      price = parseFloat(price.replace(/[$,]/g, ''));
    }
    return `$${price.toFixed(2)}`;
  };

  const getFilteredNews = () => {
    if (newsFilter === 'ALL') return news;
    return news.filter(article => article.type === newsFilter);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Loading market hub...</Text>
      </View>
    );
  }

  const renderNewsHub = () => {
    const filteredNews = getFilteredNews();
    
    return (
      <>
        {/* News Filter */}
        <View style={styles.filterContainer}>
          {(['ALL', 'Article', 'Video'] as const).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterButton, newsFilter === filter && styles.filterButtonActive]}
              onPress={() => setNewsFilter(filter)}
            >
              <Text style={[styles.filterText, newsFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* News Articles */}
        {newsLoading ? (
          <ActivityIndicator size="large" color={palette.accent} style={styles.loader} />
        ) : filteredNews.length > 0 ? (
          filteredNews.map((article, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.newsCard}
              onPress={() => openNewsUrl(article.url)}
              activeOpacity={0.7}
            >
              {article.img && (
                <Image 
                  source={{ uri: article.img }} 
                  style={styles.newsImage}
                  resizeMode="cover"
                />
              )}
              
              <View style={styles.newsContent}>
                <View style={styles.newsHeader}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{article.type || 'Article'}</Text>
                  </View>
                  <ExternalLink size={14} color={palette.mutedText} />
                </View>
                
                <Text style={styles.newsTitle} numberOfLines={2}>
                  {article.title}
                </Text>
                
                {article.text && (
                  <Text style={styles.newsSummary} numberOfLines={3}>
                    {article.text}
                  </Text>
                )}
                
                <View style={styles.newsFooter}>
                  {article.source && (
                    <Text style={styles.newsSource}>{article.source}</Text>
                  )}
                  {article.ago && (
                    <Text style={styles.newsDate}>{article.ago}</Text>
                  )}
                </View>
                
                {article.tickers && article.tickers.length > 0 && (
                  <View style={styles.tickerContainer}>
                    {article.tickers.map((ticker: string, i: number) => (
                      <View key={i} style={styles.tickerBadge}>
                        <Text style={styles.tickerText}>{ticker.replace('$', '')}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Newspaper size={48} color={palette.mutedText} />
            <Text style={styles.emptyText}>No news available</Text>
          </View>
        )}
      </>
    );
  };

  const renderCalendarHub = () => {
    const calendarCategories = [
      { key: 'EARNINGS' as CalendarCategory, label: 'Earnings', icon: Calendar, color: palette.accent, count: earnings.length },
      { key: 'DIVIDENDS' as CalendarCategory, label: 'Dividends', icon: DollarSign, color: palette.success, count: dividends.length },
      { key: 'ECONOMIC' as CalendarCategory, label: 'Economic', icon: TrendingUp, color: palette.primary, count: economicEvents.length },
      { key: 'IPOS' as CalendarCategory, label: 'IPOs', icon: Building2, color: palette.accent, count: (ipos.priced?.length || 0) + (ipos.upcoming?.length || 0) },
      { key: 'OFFERINGS' as CalendarCategory, label: 'Offerings', icon: TrendingDown, color: palette.warning, count: publicOfferings.priced?.length || 0 },
      { key: 'SPLITS' as CalendarCategory, label: 'Splits', icon: Split, color: palette.accent, count: stockSplits.length },
    ];

    const renderCategoryContent = () => {
      if (calendarLoading) {
        return <ActivityIndicator size="large" color={palette.accent} style={styles.loader} />;
      }

      switch (calendarCategory) {
        case 'EARNINGS':
          return earnings.length > 0 ? (
            earnings.map((event, index) => (
              <View key={index} style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <View style={styles.symbolBadge}>
                    <Text style={styles.symbolText}>{event.symbol}</Text>
                  </View>
                  {event.time && (
                    <Text style={styles.dateText}>{event.time}</Text>
                  )}
                </View>
                {event.name && (
                  <Text style={styles.companyName} numberOfLines={1}>{event.name}</Text>
                )}
                <View style={styles.dividendDetails}>
                  {event.epsForecast && (
                    <Text style={styles.detailText}>EPS Est: {event.epsForecast}</Text>
                  )}
                  {event.fiscalQuarterEnding && (
                    <Text style={styles.detailText}>Q: {event.fiscalQuarterEnding}</Text>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Calendar size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No earnings announcements</Text>
            </View>
          );

        case 'DIVIDENDS':
          return dividends.length > 0 ? (
            dividends.map((div, index) => (
              <View key={index} style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <View style={styles.symbolBadge}>
                    <Text style={styles.symbolText}>{div.symbol}</Text>
                  </View>
                  <Text style={styles.priceText}>{formatPrice(div.dividend_Rate)}</Text>
                </View>
                {div.companyName && (
                  <Text style={styles.companyName} numberOfLines={1}>{div.companyName}</Text>
                )}
                <View style={styles.dividendDetails}>
                  <Text style={styles.detailText}>Ex: {div.dividend_Ex_Date}</Text>
                  <Text style={styles.detailText}>Pay: {div.payment_Date}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <DollarSign size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No dividends today</Text>
            </View>
          );

        case 'ECONOMIC':
          return economicEvents.length > 0 ? (
            economicEvents.map((event, index) => (
              <View key={index} style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <Text style={styles.eventName}>{event.eventName}</Text>
                  <Text style={styles.countryBadge}>{event.country}</Text>
                </View>
                <View style={styles.economicMetrics}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Actual</Text>
                    <Text style={styles.metricValue}>{event.actual || 'N/A'}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Consensus</Text>
                    <Text style={styles.metricValue}>{event.consensus || 'N/A'}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Previous</Text>
                    <Text style={styles.metricValue}>{event.previous || 'N/A'}</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <TrendingUp size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No economic events</Text>
            </View>
          );

        case 'IPOS':
          const hasIPOs = (ipos.priced?.length > 0 || ipos.upcoming?.length > 0);
          return hasIPOs ? (
            <>
              {ipos.upcoming?.length > 0 && (
                <View style={styles.ipoSubSection}>
                  <Text style={styles.ipoSubTitle}>Upcoming IPOs</Text>
                  {ipos.upcoming.slice(0, 15).map((ipo: any, index: number) => (
                    <View key={`upcoming-${index}`} style={styles.calendarCard}>
                      <View style={styles.calendarHeader}>
                        <View style={styles.symbolBadge}>
                          <Text style={styles.symbolText}>{ipo.proposedTickerSymbol || 'N/A'}</Text>
                        </View>
                        <Text style={[styles.statusBadge, { color: palette.warning }]}>UPCOMING</Text>
                      </View>
                      {ipo.companyName && (
                        <Text style={styles.companyName} numberOfLines={1}>{ipo.companyName}</Text>
                      )}
                      {ipo.proposedSharePrice && (
                        <Text style={styles.priceText}>${ipo.proposedSharePrice}</Text>
                      )}
                      <View style={styles.ipoDetails}>
                        {ipo.proposedExchange && (
                          <Text style={styles.detailText}>{ipo.proposedExchange}</Text>
                        )}
                        {ipo.expectedPriceDate && (
                          <Text style={styles.detailText}>Expected: {ipo.expectedPriceDate}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {ipos.priced?.length > 0 && (
                <View style={styles.ipoSubSection}>
                  <Text style={styles.ipoSubTitle}>Recently Priced</Text>
                  {ipos.priced.slice(0, 15).map((ipo: any, index: number) => (
                    <View key={`priced-${index}`} style={styles.calendarCard}>
                      <View style={styles.calendarHeader}>
                        <View style={styles.symbolBadge}>
                          <Text style={styles.symbolText}>{ipo.proposedTickerSymbol || 'N/A'}</Text>
                        </View>
                        <Text style={styles.statusBadge}>PRICED</Text>
                      </View>
                      {ipo.companyName && (
                        <Text style={styles.companyName} numberOfLines={1}>{ipo.companyName}</Text>
                      )}
                      {ipo.proposedSharePrice && (
                        <Text style={styles.priceText}>${ipo.proposedSharePrice}</Text>
                      )}
                      <View style={styles.ipoDetails}>
                        {ipo.proposedExchange && (
                          <Text style={styles.detailText}>{ipo.proposedExchange}</Text>
                        )}
                        {ipo.sharesOffered && (
                          <Text style={styles.detailText}>Shares: {ipo.sharesOffered}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Building2 size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No IPO events</Text>
            </View>
          );

        case 'OFFERINGS':
          return publicOfferings.priced?.length > 0 ? (
            publicOfferings.priced.slice(0, 15).map((offering: any, index: number) => (
              <View key={index} style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <View style={styles.symbolBadge}>
                    <Text style={styles.symbolText}>{offering.proposedTickerSymbol}</Text>
                  </View>
                  <Text style={styles.statusBadge}>PRICED</Text>
                </View>
                <Text style={styles.companyName} numberOfLines={1}>{offering.companyName}</Text>
                <Text style={styles.detailText}>Value: {offering.dollarValueOfSharesOffered}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <TrendingDown size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No secondary offerings</Text>
            </View>
          );

        case 'SPLITS':
          return stockSplits.length > 0 ? (
            stockSplits.map((split, index) => (
              <View key={index} style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <View style={styles.symbolBadge}>
                    <Text style={styles.symbolText}>{split.ticker}</Text>
                  </View>
                  <Text style={styles.splitRatio}>
                    {split.old_share_worth}:{split.share_worth}
                  </Text>
                </View>
                <Text style={styles.companyName}>{split.companyshortname}</Text>
                {split.startdatetime && (
                  <Text style={styles.detailText}>Date: {formatDate(split.startdatetime)}</Text>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Split size={48} color={palette.mutedText} />
              <Text style={styles.emptyText}>No stock splits</Text>
            </View>
          );

        default:
          return null;
      }
    };

    return (
      <>
        {/* Category Tabs */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryTabsContainer}
          style={styles.categoryTabsScroll}
        >
          {calendarCategories.map((cat) => {
            const Icon = cat.icon;
            const isActive = calendarCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryTab, isActive && styles.categoryTabActive]}
                onPress={() => setCalendarCategory(cat.key)}
                activeOpacity={0.7}
              >
                <Icon size={16} color={isActive ? palette.background : cat.color} />
                <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>
                  {cat.label}
                </Text>
                {cat.count > 0 && (
                  <View style={[styles.categoryBadge, isActive && styles.categoryBadgeActive]}>
                    <Text style={[styles.categoryBadgeText, isActive && styles.categoryBadgeTextActive]}>
                      {cat.count > 99 ? '99+' : cat.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category Content */}
        <View style={styles.categoryContent}>
          {renderCategoryContent()}
        </View>
      </>
    );
  };

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Market Hub</Text>
          <Text style={styles.subtitle}>News & Calendar Insights</Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <AlertCircle size={16} color={palette.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* View Mode Selector */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentButton, viewMode === 'NEWS' && styles.segmentButtonActive]}
            onPress={() => setViewMode('NEWS')}
          >
            <Newspaper size={16} color={viewMode === 'NEWS' ? palette.background : palette.mutedText} />
            <Text style={[styles.segmentText, viewMode === 'NEWS' && styles.segmentTextActive]}>
              News
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, viewMode === 'CALENDAR' && styles.segmentButtonActive]}
            onPress={() => setViewMode('CALENDAR')}
          >
            <Calendar size={16} color={viewMode === 'CALENDAR' ? palette.background : palette.mutedText} />
            <Text style={[styles.segmentText, viewMode === 'CALENDAR' && styles.segmentTextActive]}>
              Calendar
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {viewMode === 'NEWS' ? renderNewsHub() : renderCalendarHub()}
      </ScrollView>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: palette.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: palette.mutedText,
    marginTop: spacing.md,
    fontSize: 14,
  },
  loader: {
    marginVertical: spacing.xxl,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  // Header
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: palette.mutedText,
    fontSize: 14,
  },

  // Segmented Control
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    padding: 4,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: layout.borderRadius - 2,
    gap: spacing.xs,
  },
  segmentButtonActive: {
    backgroundColor: palette.accent,
  },
  segmentText: {
    color: palette.mutedText,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: palette.background,
  },

  // Filter
  filterContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: layout.borderRadius,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterButtonActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  filterText: {
    color: palette.mutedText,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: palette.background,
  },

  // Error State
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: spacing.md,
    borderRadius: layout.borderRadius,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  errorText: {
    color: palette.danger,
    fontSize: 14,
    flex: 1,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyText: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
  },

  // News Cards
  newsCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  newsImage: {
    width: '100%',
    height: 200,
    backgroundColor: palette.surfaceHighlight,
  },
  newsContent: {
    padding: spacing.md,
  },
  newsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  typeBadge: {
    backgroundColor: palette.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeText: {
    color: palette.background,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  newsTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  newsSummary: {
    color: palette.mutedText,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  newsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  newsSource: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  newsDate: {
    color: palette.mutedText,
    fontSize: 11,
  },
  tickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  tickerBadge: {
    backgroundColor: palette.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  tickerText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '700',
  },

  // Calendar Sections
  calendarSection: {
    marginBottom: spacing.xxl,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },

  // Calendar Cards
  calendarCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  symbolBadge: {
    backgroundColor: palette.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  symbolText: {
    color: palette.background,
    fontWeight: '700',
    fontSize: 12,
  },
  dateText: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '500',
  },
  priceText: {
    color: palette.success,
    fontSize: 14,
    fontWeight: '700',
  },
  companyName: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  dividendDetails: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  detailText: {
    color: palette.mutedText,
    fontSize: 11,
  },
  eventName: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  countryBadge: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  economicMetrics: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    color: palette.mutedText,
    fontSize: 10,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  ipoDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  statusBadge: {
    color: palette.success,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  splitRatio: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '700',
  },

  // Category Tabs
  categoryTabsScroll: {
    marginBottom: spacing.lg,
    marginHorizontal: -spacing.lg,
  },
  categoryTabsContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: layout.borderRadius,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    gap: spacing.xs,
  },
  categoryTabActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  categoryTabText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTabTextActive: {
    color: palette.background,
  },
  categoryBadge: {
    backgroundColor: palette.surfaceHighlight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 2,
  },
  categoryBadgeActive: {
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  categoryBadgeText: {
    color: palette.mutedText,
    fontSize: 10,
    fontWeight: '700',
  },
  categoryBadgeTextActive: {
    color: palette.background,
  },
  categoryContent: {
    flex: 1,
  },
  ipoSubSection: {
    marginBottom: spacing.lg,
  },
  ipoSubTitle: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
});