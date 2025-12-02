import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  ActivityIndicator, 
  TouchableOpacity,
  Linking 
} from 'react-native';
import { 
  Newspaper, 
  Calendar, 
  ExternalLink,
  TrendingUp,
  AlertCircle,
  Clock
} from 'lucide-react-native';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';
import { financeApiService } from '@/services/financeApiService';
import type { NewsArticle, EarningsEvent } from '@/types';

export const StatisticsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMarketData();
  }, []);

  const loadMarketData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [newsData, earningsData] = await Promise.all([
        financeApiService.getMarketNews('AAPL,TSLA,GOOGL,MSFT,AMZN'),
        financeApiService.getEarningsCalendar(),
      ]);
      
      setNews(newsData.slice(0, 10)); // Limit to 10 articles
      setEarnings(earningsData.slice(0, 15)); // Limit to 15 events
    } catch (err) {
      console.error('Error loading market data:', err);
      setError('Failed to load market data');
    } finally {
      setLoading(false);
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
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Loading market insights...</Text>
      </View>
    );
  }

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Market Insights</Text>
          <Text style={styles.subtitle}>Latest news and earnings calendar</Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <AlertCircle size={16} color={palette.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Earnings Calendar Section */}
        {earnings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Calendar size={18} color={palette.accent} />
              <Text style={styles.sectionTitle}>Earnings Calendar</Text>
            </View>
            
            {earnings.map((event, index) => (
              <View key={`${event.symbol}-${index}`} style={styles.earningsCard}>
                <View style={styles.earningsHeader}>
                  <View style={styles.symbolBadge}>
                    <Text style={styles.symbolText}>{event.symbol}</Text>
                  </View>
                  <View style={styles.dateContainer}>
                    <Clock size={12} color={palette.mutedText} />
                    <Text style={styles.dateText}>
                      {event.date ? formatDate(event.date) : 'TBA'}
                      {event.time && ` • ${event.time}`}
                    </Text>
                  </View>
                </View>
                
                {event.companyName && (
                  <Text style={styles.companyName} numberOfLines={1}>
                    {event.companyName}
                  </Text>
                )}
                
                {(event.epsEstimate || event.epsActual || event.revenueEstimate || event.revenueActual) && (
                  <View style={styles.earningsMetrics}>
                    {event.epsEstimate && (
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>EPS Est.</Text>
                        <Text style={styles.metricValue}>${event.epsEstimate.toFixed(2)}</Text>
                      </View>
                    )}
                    {event.epsActual && (
                      <View style={styles.metricItem}>
                        <Text style={styles.metricLabel}>EPS Act.</Text>
                        <Text style={[styles.metricValue, styles.actualValue]}>
                          ${event.epsActual.toFixed(2)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Market News Section */}
        {news.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Newspaper size={18} color={palette.primary} />
              <Text style={styles.sectionTitle}>Latest News</Text>
            </View>
            
            {news.map((article, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.newsCard}
                onPress={() => openNewsUrl(article.url)}
                activeOpacity={0.7}
              >
                <View style={styles.newsHeader}>
                  <Text style={styles.newsTitle} numberOfLines={2}>
                    {article.title}
                  </Text>
                  <ExternalLink size={16} color={palette.mutedText} />
                </View>
                
                {article.summary && (
                  <Text style={styles.newsSummary} numberOfLines={3}>
                    {article.summary}
                  </Text>
                )}
                
                <View style={styles.newsFooter}>
                  {article.source && (
                    <Text style={styles.newsSource}>{article.source}</Text>
                  )}
                  {article.publishedAt && (
                    <Text style={styles.newsDate}>{formatDateTime(article.publishedAt)}</Text>
                  )}
                </View>
                
                {article.tickers && article.tickers.length > 0 && (
                  <View style={styles.tickerContainer}>
                    {article.tickers.slice(0, 5).map((ticker, i) => (
                      <View key={i} style={styles.tickerBadge}>
                        <Text style={styles.tickerText}>{ticker}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!loading && news.length === 0 && earnings.length === 0 && (
          <View style={styles.emptyState}>
            <AlertCircle size={48} color={palette.mutedText} />
            <Text style={styles.emptyText}>No market data available</Text>
            <Text style={styles.emptySubtext}>Please try again later</Text>
          </View>
        )}

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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  // Header
  header: {
    marginBottom: spacing.xl,
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
  emptySubtext: {
    color: palette.mutedText,
    fontSize: 14,
    marginTop: spacing.xs,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
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
    fontWeight: '600',
  },

  // Earnings Cards
  earningsCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  earningsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  symbolBadge: {
    backgroundColor: palette.surfaceHighlight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  symbolText: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    color: palette.mutedText,
    fontSize: 12,
  },
  companyName: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  earningsMetrics: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    color: palette.mutedText,
    fontSize: 11,
    marginBottom: 2,
  },
  metricValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  actualValue: {
    color: palette.accent,
  },

  // News Cards
  newsCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  newsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  newsTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    flex: 1,
  },
  newsSummary: {
    color: palette.mutedText,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
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
    fontWeight: '600',
  },
  newsDate: {
    color: palette.mutedText,
    fontSize: 11,
  },
  tickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.xs,
  },
  tickerBadge: {
    backgroundColor: palette.surfaceHighlight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tickerText: {
    color: palette.mutedText,
    fontSize: 10,
    fontWeight: '600',
  },
});