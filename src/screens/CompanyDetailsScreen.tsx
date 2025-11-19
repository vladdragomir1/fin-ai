import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MetricCard, ScreenShell, SectionHeader, StockChart, SurfaceCard, TradingViewChart } from '@/components';
import { financeApiService } from '@/services/financeApiService';
import { palette, spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import type { ChartDataPoint, ChartTimeRange, CompanyOverview, FinancialMetrics, StockQuote } from '@/types';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CompanyDetails'>;

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
  }, [symbol, selectedRange]);

  const handleRangeChange = async (range: ChartTimeRange) => {
    setSelectedRange(range);
    const historicalData = await financeApiService.getHistoricalData(symbol, range);
    setChartData(historicalData);
  };

  const loadCompanyData = async () => {
    setLoading(true);
    try {
      // Încearcă să încarci date reale din API
      const [quoteData, overviewData, metricsData, historicalData] = await Promise.all([
        financeApiService.getStockQuote(symbol),
        financeApiService.getCompanyOverview(symbol),
        financeApiService.getFinancialMetrics(symbol),
        financeApiService.getHistoricalData(symbol, selectedRange),
      ]);

      // Dacă API-ul nu returnează date (demo key sau limită), folosește mock
      setQuote(quoteData || financeApiService.getMockStockQuote(symbol));
      setOverview(overviewData);
      setMetrics(metricsData);
      setChartData(historicalData);
    } catch (error) {
      console.error('Error loading company data:', error);
      // Fallback la mock data
      setQuote(financeApiService.getMockStockQuote(symbol));
      setChartData(financeApiService.getMockChartData(symbol, selectedRange));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Loading data...</Text>
        </View>
      </ScreenShell>
    );
  }

  const isPositive = (quote?.change ?? 0) >= 0;

  return (
    <ScreenShell scrollable>
      <SectionHeader title={symbol} />

      {/* Cotație curentă */}
      {quote ? (
        <SurfaceCard style={styles.quoteCard}>
          <Text style={styles.companyName}>{name}</Text>
          <Text style={styles.price}>${quote.price.toFixed(2)}</Text>
          <View style={styles.changeContainer}>
            <Text style={[styles.change, isPositive ? styles.positive : styles.negative]}>
              {isPositive ? '+' : ''}
              {quote.change.toFixed(2)} ({isPositive ? '+' : ''}
              {quote.changePercent.toFixed(2)}%)
            </Text>
          </View>
          <Text style={styles.timestamp}>Updated: {new Date(quote.timestamp).toLocaleDateString('en-US')}</Text>
        </SurfaceCard>
      ) : null}

      {/* Stock Chart - Real TradingView Chart */}
      <SectionHeader title="Price History" />
      <SurfaceCard>
        <TradingViewChart symbol={symbol} height={400} />
      </SurfaceCard>

      {/* Daily Statistics */}
      {quote ? (
        <>
          <SectionHeader title="Daily Statistics" />
          <View style={styles.metricsRow}>
            <MetricCard label="Open" value={`$${quote.open.toFixed(2)}`} />
            <MetricCard label="High" value={`$${quote.high.toFixed(2)}`} />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard label="Low" value={`$${quote.low.toFixed(2)}`} />
            <MetricCard label="Prev. Close" value={`$${quote.previousClose.toFixed(2)}`} />
          </View>
          <MetricCard label="Volume" value={quote.volume.toLocaleString()} />
        </>
      ) : null}

      {/* Financial Metrics */}
      {metrics ? (
        <>
          <SectionHeader title="Financial Indicators" />
          <View style={styles.metricsRow}>
            {metrics.peRatio ? <MetricCard label="P/E Ratio" value={metrics.peRatio.toFixed(2)} /> : null}
            {metrics.eps ? <MetricCard label="EPS" value={`$${metrics.eps.toFixed(2)}`} /> : null}
          </View>
          {metrics.marketCap ? (
            <MetricCard
              label="Market Cap"
              value={formatCurrency(metrics.marketCap, 'USD')}
            />
          ) : null}
          {metrics.dividendYield ? (
            <MetricCard label="Dividend Yield" value={`${metrics.dividendYield.toFixed(2)}%`} />
          ) : null}
          {metrics.weekHigh52 && metrics.weekLow52 ? (
            <View style={styles.metricsRow}>
              <MetricCard label="52W High" value={`$${metrics.weekHigh52.toFixed(2)}`} />
              <MetricCard label="52W Low" value={`$${metrics.weekLow52.toFixed(2)}`} />
            </View>
          ) : null}
          {metrics.beta ? <MetricCard label="Beta" value={metrics.beta.toFixed(2)} /> : null}
        </>
      ) : null}

      {/* About Company */}
      {overview ? (
        <>
          <SectionHeader title="About Company" />
          <SurfaceCard>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Sector:</Text>
              <Text style={styles.infoValue}>{overview.sector}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Industry:</Text>
              <Text style={styles.infoValue}>{overview.industry}</Text>
            </View>
            {overview.employees ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Employees:</Text>
                <Text style={styles.infoValue}>{overview.employees.toLocaleString()}</Text>
              </View>
            ) : null}
            {overview.description ? (
              <Text style={styles.description}>{overview.description}</Text>
            ) : null}
          </SurfaceCard>
        </>
      ) : null}


    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: palette.mutedText,
    marginTop: spacing.md,
    fontSize: 16,
  },
  quoteCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  companyName: {
    color: palette.mutedText,
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  price: {
    color: palette.text,
    fontSize: 48,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  change: {
    fontSize: 18,
    fontWeight: '600',
  },
  positive: {
    color: palette.success,
  },
  negative: {
    color: palette.danger,
  },
  timestamp: {
    color: palette.mutedText,
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  infoLabel: {
    color: palette.mutedText,
    fontSize: 14,
  },
  infoValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  noDataText: {
    color: palette.text,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  hintText: {
    color: palette.mutedText,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
