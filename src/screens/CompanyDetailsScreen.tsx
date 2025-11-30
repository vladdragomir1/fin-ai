import React, { useEffect, useState } from 'react';
import { 
  ActivityIndicator, 
  ScrollView, 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity 
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Activity, 
  DollarSign, 
  BarChart2, 
  Briefcase,
  Users,
  Globe
} from 'lucide-react-native';

import { ScreenShell, TradingViewChart } from '@/components';
import { financeApiService } from '@/services/financeApiService';
import { palette, spacing, layout } from '@/theme';
import { formatCurrency } from '@/utils';
import type { ChartDataPoint, ChartTimeRange, CompanyOverview, FinancialMetrics, StockQuote } from '@/types';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyDetails'>;

// --- LOCAL UI COMPONENTS ---
const DetailCard = ({ label, value, icon: Icon, color = palette.text }: any) => (
  <View style={styles.detailCard}>
    <View style={styles.detailHeader}>
      <Text style={styles.detailLabel}>{label}</Text>
      {Icon && <Icon size={14} color={palette.mutedText} />}
    </View>
    <Text style={[styles.detailValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  </View>
);

const RangeSelector = ({ selected, onSelect }: { selected: string, onSelect: (r: ChartTimeRange) => void }) => {
  const ranges: ChartTimeRange[] = ['1D', '1W', '1M', '3M', '1Y', '5Y'];
  return (
    <View style={styles.rangeContainer}>
      {ranges.map((r) => (
        <TouchableOpacity
          key={r}
          onPress={() => onSelect(r)}
          style={[styles.rangeButton, selected === r && styles.rangeButtonActive]}
        >
          <Text style={[styles.rangeText, selected === r && styles.rangeTextActive]}>{r}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export const CompanyDetailsScreen = ({ route }: Props) => {
  const { symbol, name } = route.params;
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]); 
  const [selectedRange, setSelectedRange] = useState<ChartTimeRange>('1Y');

  useEffect(() => {
    loadCompanyData();
  }, [symbol]);

  const handleRangeChange = async (range: ChartTimeRange) => {
    setSelectedRange(range);
    const historicalData = await financeApiService.getHistoricalData(symbol, range);
    setChartData(historicalData);
  };

  const loadCompanyData = async () => {
    setLoading(true);
    try {
      // Parallel Fetch for Speed
      const [quoteData, overviewData, metricsData] = await Promise.all([
        financeApiService.getStockQuote(symbol),
        financeApiService.getCompanyOverview(symbol),
        financeApiService.getFinancialMetrics(symbol),
      ]);

      // Load Chart separately to not block UI if slow
      const historicalData = await financeApiService.getHistoricalData(symbol, selectedRange);

      // financeApiService now handles all fallbacks (API -> SQLite -> Mock)
      setQuote(quoteData);
      setOverview(overviewData);
      setMetrics(metricsData);
      setChartData(historicalData);
      
    } catch (error) {
      console.error('Error loading company data:', error);
      // Only fallback here if EVERYTHING failed (rare)
      if (!quote) setQuote(financeApiService.getMockStockQuote(symbol));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
        <Text style={styles.loadingText}>Syncing market data...</Text>
      </View>
    );
  }

  const isPositive = (quote?.change ?? 0) >= 0;
  const ChangeIcon = isPositive ? TrendingUp : TrendingDown;
  const changeColor = isPositive ? palette.success : palette.danger;

  return (
    <ScreenShell scrollable={false}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* 1. Header & Hero Price */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.symbolBadge}>
              <Text style={styles.symbolText}>{symbol}</Text>
            </View>
            <Text style={styles.companyName} numberOfLines={1}>{name}</Text>
          </View>

          {quote && (
            <View style={styles.heroSection}>
              <Text style={styles.price}>${quote.price.toFixed(2)}</Text>
              <View style={[styles.changeBadge, { backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                <ChangeIcon size={16} color={changeColor} />
                <Text style={[styles.changeText, { color: changeColor }]}>
                  {isPositive ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                </Text>
              </View>
            </View>
          )}
          
          <Text style={styles.timestamp}>
            <Clock size={10} color={palette.mutedText} /> Market Open • Data delayed 15m
          </Text>
        </View>

        {/* 2. Chart Section */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.sectionTitle}>Price History</Text>
            <RangeSelector selected={selectedRange} onSelect={handleRangeChange} />
          </View>
          <View style={styles.chartWrapper}>
            <TradingViewChart symbol={symbol} height={280} />
          </View>
        </View>

        {/* 3. Key Statistics Grid */}
        {quote && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>SESSION STATISTICS</Text>
            <View style={styles.grid}>
              <DetailCard label="Open" value={`$${quote.open.toFixed(2)}`} icon={Activity} />
              <DetailCard label="High" value={`$${quote.high.toFixed(2)}`} icon={TrendingUp} />
              <DetailCard label="Low" value={`$${quote.low.toFixed(2)}`} icon={TrendingDown} />
              <DetailCard label="Prev Close" value={`$${quote.previousClose.toFixed(2)}`} icon={Clock} />
              <View style={styles.fullWidthCard}>
                <DetailCard label="Volume" value={quote.volume.toLocaleString()} icon={BarChart2} />
              </View>
            </View>
          </View>
        )}

        {/* 4. Financial Fundamentals */}
        {metrics && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>FUNDAMENTALS</Text>
            <View style={styles.grid}>
              <DetailCard 
                label="Market Cap" 
                value={metrics.marketCap ? formatCurrency(metrics.marketCap, 'USD') : '-'} 
                icon={DollarSign} 
              />
              <DetailCard 
                label="P/E Ratio" 
                value={metrics.peRatio?.toFixed(2) ?? '-'} 
                color={palette.accent}
              />
              <DetailCard 
                label="EPS" 
                value={metrics.eps ? `$${metrics.eps.toFixed(2)}` : '-'} 
              />
              <DetailCard 
                label="Div Yield" 
                value={metrics.dividendYield ? `${metrics.dividendYield.toFixed(2)}%` : '-'} 
                color={palette.success}
              />
              {metrics.weekHigh52 && (
                 <DetailCard label="52W High" value={`$${metrics.weekHigh52.toFixed(2)}`} />
              )}
               {metrics.weekLow52 && (
                 <DetailCard label="52W Low" value={`$${metrics.weekLow52.toFixed(2)}`} />
              )}
            </View>
          </View>
        )}

        {/* 5. Company Profile */}
        {overview && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>PROFILE</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <View style={styles.profileItem}>
                  <Briefcase size={14} color={palette.mutedText} style={{marginBottom: 4}} />
                  <Text style={styles.profileLabel}>Sector</Text>
                  <Text style={styles.profileValue}>{overview.sector}</Text>
                </View>
                <View style={styles.dividerVertical} />
                <View style={styles.profileItem}>
                  <Globe size={14} color={palette.mutedText} style={{marginBottom: 4}} />
                  <Text style={styles.profileLabel}>Industry</Text>
                  <Text style={styles.profileValue}>{overview.industry}</Text>
                </View>
                {overview.employees && (
                  <>
                    <View style={styles.dividerVertical} />
                    <View style={styles.profileItem}>
                      <Users size={14} color={palette.mutedText} style={{marginBottom: 4}} />
                      <Text style={styles.profileLabel}>Employees</Text>
                      <Text style={styles.profileValue}>{overview.employees.toLocaleString()}</Text>
                    </View>
                  </>
                )}
              </View>
              {overview.description && (
                <View style={styles.descContainer}>
                   <Text style={styles.description}>{overview.description}</Text>
                </View>
              )}
            </View>
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Header
  header: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
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
    fontSize: 14,
  },
  companyName: {
    color: palette.mutedText,
    fontSize: 14,
    flex: 1,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  price: {
    color: palette.text,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 48,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    gap: 4,
    marginBottom: 8,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timestamp: {
    color: palette.mutedText,
    fontSize: 12,
    marginTop: 4,
  },

  // Chart
  chartCard: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: palette.text,
    fontWeight: '600',
    fontSize: 16,
  },
  rangeContainer: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceHighlight,
    borderRadius: 8,
    padding: 2,
  },
  rangeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rangeButtonActive: {
    backgroundColor: palette.surface, 
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  rangeText: {
    color: palette.mutedText,
    fontSize: 10,
    fontWeight: '600',
  },
  rangeTextActive: {
    color: palette.text,
  },
  chartWrapper: {
    height: 280,
    overflow: 'hidden',
    borderRadius: 8,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  
  // Detail Cards
  detailCard: {
    width: '47%', 
    backgroundColor: palette.surface,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  fullWidthCard: {
    width: '100%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailLabel: {
    color: palette.mutedText,
    fontSize: 12,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.text,
  },

  // Profile
  profileCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  profileItem: {
    flex: 1,
    alignItems: 'center',
  },
  profileLabel: {
    color: palette.mutedText,
    fontSize: 12,
    marginBottom: 2,
  },
  profileValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  dividerVertical: {
    width: 1,
    backgroundColor: palette.surfaceHighlight,
    height: '100%',
  },
  descContainer: {
    borderTopWidth: 1,
    borderTopColor: palette.surfaceHighlight,
    paddingTop: spacing.md,
  },
  description: {
    color: palette.mutedText,
    fontSize: 14,
    lineHeight: 22,
  },
});