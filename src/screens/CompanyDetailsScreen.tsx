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
  Globe,
  AlertCircle // Added for empty state
} from 'lucide-react-native';

import { ScreenShell, TradingViewChart } from '@/components';
import { financeApiService } from '@/services/financeApiService';
import { palette, spacing, layout } from '@/theme';
import { formatCurrency } from '@/utils';
import type { ChartDataPoint, CompanyOverview, FinancialMetrics, StockQuote } from '@/types';
import type { RootStackParamList } from '@/navigation/types';

// Define the ranges strictly matching your Service logic
type AllowedRange = '1D' | '1M' | '6M' | '1Y' | '5Y' | 'ALL';

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

const RangeSelector = ({ selected, onSelect }: { selected: string, onSelect: (r: AllowedRange) => void }) => {
  // Updated ranges to include intraday
  const ranges: AllowedRange[] = ['1D', '1M', '6M', '1Y', '5Y', 'ALL'];
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
  
  // Data States
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  
  // Additional Data Modules
  const [calendarEvents, setCalendarEvents] = useState<any>(null);
  const [earningsHistory, setEarningsHistory] = useState<any>(null);
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [cashflowStatement, setCashflowStatement] = useState<any>(null);
  const [institutionOwnership, setInstitutionOwnership] = useState<any>(null);
  const [insiderHolders, setInsiderHolders] = useState<any>(null);
  const [recommendationTrend, setRecommendationTrend] = useState<any>(null);
  const [upgradeDowngradeHistory, setUpgradeDowngradeHistory] = useState<any>(null);
  const [secFilings, setSecFilings] = useState<any>(null);
  const [indexTrend, setIndexTrend] = useState<any>(null);
  const [netSharePurchase, setNetSharePurchase] = useState<any>(null);
  
  // Chart Specific States
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]); 
  const [selectedRange, setSelectedRange] = useState<AllowedRange>('1Y');
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    loadCompanyData();
  }, [symbol]);

  const handleRangeChange = async (range: AllowedRange) => {
    if (range === selectedRange) return;
    
    setSelectedRange(range);
    setChartLoading(true); // Only show spinner on chart, not whole screen
    
    try {
      const historicalData = await financeApiService.getHistoricalData(symbol, range);
      setChartData(historicalData);
    } catch (e) {
      console.warn('Failed to switch range', e);
    } finally {
      setChartLoading(false);
    }
  };

  const loadCompanyData = async () => {
    setLoading(true);
    try {
      // Phase 1: Load essential data first (faster initial render)
      const [
        quoteData, 
        overviewData, 
        metricsData, 
        historicalData,
      ] = await Promise.all([
        financeApiService.getStockQuote(symbol),
        financeApiService.getCompanyOverview(symbol),
        financeApiService.getFinancialMetrics(symbol),
        financeApiService.getHistoricalData(symbol, selectedRange),
      ]);

      setQuote(quoteData);
      setOverview(overviewData);
      setMetrics(metricsData);
      setChartData(historicalData);
      setLoading(false); // Show UI with basic data
      
      // Phase 2: Load additional modules in background (non-blocking)
      Promise.all([
        financeApiService.getStockModule(symbol, 'calendar-events'),
        financeApiService.getStockModule(symbol, 'earnings-history'),
        financeApiService.getStockModule(symbol, 'income-statement'),
        financeApiService.getStockModule(symbol, 'balance-sheet'),
        financeApiService.getStockModule(symbol, 'cashflow-statement'),
        financeApiService.getStockModule(symbol, 'institution-ownership'),
        financeApiService.getStockModule(symbol, 'insider-holders'),
        financeApiService.getStockModule(symbol, 'recommendation-trend'),
        financeApiService.getStockModule(symbol, 'upgrade-downgrade-history'),
        financeApiService.getStockModule(symbol, 'sec-filings'),
        financeApiService.getStockModule(symbol, 'index-trend'),
        financeApiService.getStockModule(symbol, 'net-share-purchase-activity'),
      ]).then(([
        calendarData,
        earningsHistoryData,
        incomeData,
        balanceData,
        cashflowData,
        institutionData,
        insiderHoldersData,
        recommendationData,
        upgradeDowngradeData,
        secFilingsData,
        indexTrendData,
        netSharePurchaseData,
      ]) => {
        setCalendarEvents(calendarData);
        setEarningsHistory(earningsHistoryData);
        setIncomeStatement(incomeData);
        setBalanceSheet(balanceData);
        setCashflowStatement(cashflowData);
        setInstitutionOwnership(institutionData);
        setInsiderHolders(insiderHoldersData);
        setRecommendationTrend(recommendationData);
        setUpgradeDowngradeHistory(upgradeDowngradeData);
        setSecFilings(secFilingsData);
        setIndexTrend(indexTrendData);
        setNetSharePurchase(netSharePurchaseData);
        
        // Detailed logging for troubleshooting
        console.log('📊 MODULE LOAD RESULTS FOR', symbol);
        console.log('  ✓ Calendar Events:', calendarData ? 'LOADED' : '❌ NULL');
        console.log('  ✓ Earnings History:', earningsHistoryData?.history?.length || 0, 'entries');
        console.log('  ✓ Income Statement:', incomeData ? 'LOADED' : '❌ NULL');
        console.log('  ✓ Balance Sheet:', balanceData ? 'LOADED' : '❌ NULL');
        console.log('  ✓ Cashflow Statement:', cashflowData ? 'LOADED' : '❌ NULL');
        console.log('  ✓ Institution Ownership:', institutionData?.ownershipList?.length || 0, 'entries');
        console.log('  ✓ Insider Holders:', insiderHoldersData?.holders?.length || 0, 'entries');
        console.log('  ✓ Recommendation Trend:', recommendationData?.trend?.length || 0, 'entries');
        console.log('  ✓ Upgrade/Downgrade:', upgradeDowngradeData?.history?.length || 0, 'entries');
        console.log('  ✓ SEC Filings:', secFilingsData?.filings?.length || 0, 'entries');
        console.log('  ✓ Index Trend:', indexTrendData ? 'LOADED' : '❌ NULL');
        console.log('  ✓ Net Share Purchase:', netSharePurchaseData ? 'LOADED' : '❌ NULL');
      }).catch(err => {
        console.error('❌ Additional modules failed to load:', err);
      });
      
    } catch (error) {
      console.error('Error loading company data:', error);
      // Fallback: If everything fails, try to get at least a mock quote to show the screen
      if (!quote) setQuote(financeApiService.getMockStockQuote(symbol));
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
            <Clock size={10} color={palette.mutedText} /> Market Open • Delayed 15m
          </Text>
        </View>

        {/* 2. Chart Section */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.sectionTitle}>Price History</Text>
            <RangeSelector selected={selectedRange} onSelect={handleRangeChange} />
          </View>
          
          <View style={styles.chartWrapper}>
             {chartLoading ? (
                <View style={styles.chartCenterInfo}>
                   <ActivityIndicator color={palette.mutedText} />
                </View>
             ) : chartData.length > 0 ? (
                <TradingViewChart 
                  symbol={symbol} 
                  height={280} 
                />
             ) : (
                <View style={styles.chartCenterInfo}>
                   <AlertCircle color={palette.mutedText} size={24} />
                   <Text style={{color: palette.mutedText, marginTop: 8}}>No chart data available</Text>
                </View>
             )}
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

        {/* 5. Earnings & Events */}
        {calendarEvents && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>EARNINGS & EVENTS</Text>
            <View style={styles.grid}>
              {calendarEvents?.earnings?.earningsDate?.[0]?.fmt && (
                <DetailCard 
                  label="Next Earnings" 
                  value={new Date(calendarEvents.earnings.earningsDate[0].raw * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  icon={Clock}
                />
              )}
              {calendarEvents?.earnings?.earningsAverage?.fmt && (
                <DetailCard 
                  label="EPS Estimate" 
                  value={`$${calendarEvents.earnings.earningsAverage.fmt}`}
                  color={palette.accent}
                />
              )}
              {calendarEvents?.earnings?.revenueAverage?.fmt && (
                <DetailCard 
                  label="Revenue Est." 
                  value={calendarEvents.earnings.revenueAverage.fmt}
                />
              )}
              {calendarEvents?.dividendDate?.fmt && (
                <DetailCard 
                  label="Div Date" 
                  value={new Date(calendarEvents.dividendDate.raw * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  color={palette.success}
                />
              )}
            </View>
          </View>
        )}

        {/* 6. Financial Highlights */}
        {(incomeStatement || balanceSheet || cashflowStatement) && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>FINANCIAL HIGHLIGHTS</Text>
            <View style={styles.grid}>
              {incomeStatement?.incomeStatementHistory?.incomeStatementHistory?.[0] && (() => {
                const latest = incomeStatement.incomeStatementHistory.incomeStatementHistory[0];
                return (
                  <>
                    {latest.totalRevenue?.fmt && (
                      <DetailCard 
                        label="Revenue (TTM)" 
                        value={latest.totalRevenue.fmt}
                        icon={DollarSign}
                      />
                    )}
                    {latest.netIncome?.fmt && (
                      <DetailCard 
                        label="Net Income" 
                        value={latest.netIncome.fmt}
                        color={palette.success}
                      />
                    )}
                    {latest.grossProfit?.fmt && (
                      <DetailCard 
                        label="Gross Profit" 
                        value={latest.grossProfit.fmt}
                      />
                    )}
                    {latest.ebit?.fmt && (
                      <DetailCard 
                        label="EBIT" 
                        value={latest.ebit.fmt}
                      />
                    )}
                  </>
                );
              })()}
              {balanceSheet?.balanceSheetStatements?.[0] && (() => {
                const latest = balanceSheet.balanceSheetStatements[0];
                return (
                  <>
                    {latest.totalAssets?.fmt && (
                      <DetailCard 
                        label="Total Assets" 
                        value={latest.totalAssets.fmt}
                      />
                    )}
                    {latest.totalLiab?.fmt && (
                      <DetailCard 
                        label="Total Liabilities" 
                        value={latest.totalLiab.fmt}
                        color={palette.danger}
                      />
                    )}
                  </>
                );
              })()}
              {cashflowStatement?.cashflowStatements?.[0] && (() => {
                const latest = cashflowStatement.cashflowStatements[0];
                return (
                  <>
                    {latest.totalCashFromOperatingActivities?.fmt && (
                      <DetailCard 
                        label="Operating CF" 
                        value={latest.totalCashFromOperatingActivities.fmt}
                        color={palette.accent}
                      />
                    )}
                    {latest.freeCashflow?.fmt && (
                      <DetailCard 
                        label="Free Cash Flow" 
                        value={latest.freeCashflow.fmt}
                        color={palette.success}
                      />
                    )}
                  </>
                );
              })()}
            </View>
          </View>
        )}

        {/* 7. Earnings History */}
        {earningsHistory?.history && earningsHistory.history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>EARNINGS HISTORY</Text>
            {earningsHistory.history.slice(0, 4).map((earning: any, idx: number) => {
              const beat = earning.surprisePercent?.raw && earning.surprisePercent.raw > 0;
              const miss = earning.surprisePercent?.raw && earning.surprisePercent.raw < 0;
              return (
                <View key={idx} style={styles.earningCard}>
                  <View style={styles.earningRow}>
                    <Text style={styles.earningQuarter}>{earning.quarter?.fmt || 'N/A'}</Text>
                    <View style={[styles.earningBadge, { backgroundColor: beat ? palette.successBg : miss ? palette.dangerBg : palette.surfaceLight }]}>
                      <Text style={[styles.earningBadgeText, { color: beat ? palette.success : miss ? palette.danger : palette.mutedText }]}>
                        {beat ? 'Beat' : miss ? 'Miss' : 'Met'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.earningDetails}>
                    <View style={styles.earningCol}>
                      <Text style={styles.earningLabel}>Actual EPS</Text>
                      <Text style={styles.earningValue}>${earning.epsActual?.fmt || 'N/A'}</Text>
                    </View>
                    <View style={styles.earningCol}>
                      <Text style={styles.earningLabel}>Estimate</Text>
                      <Text style={styles.earningValue}>${earning.epsEstimate?.fmt || 'N/A'}</Text>
                    </View>
                    <View style={styles.earningCol}>
                      <Text style={styles.earningLabel}>Difference</Text>
                      <Text style={[styles.earningValue, { color: beat ? palette.success : miss ? palette.danger : palette.text }]}>
                        ${earning.epsDifference?.fmt || 'N/A'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 8. Analyst Recommendations */}
        {recommendationTrend?.trend && recommendationTrend.trend.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>ANALYST RATINGS</Text>
            {recommendationTrend.trend.slice(0, 1).map((rec: any, idx: number) => {
              const total = (rec.strongBuy || 0) + (rec.buy || 0) + (rec.hold || 0) + (rec.sell || 0) + (rec.strongSell || 0);
              const strongBuyPct = total > 0 ? ((rec.strongBuy || 0) / total) * 100 : 0;
              const buyPct = total > 0 ? ((rec.buy || 0) / total) * 100 : 0;
              const holdPct = total > 0 ? ((rec.hold || 0) / total) * 100 : 0;
              const sellPct = total > 0 ? ((rec.sell || 0) / total) * 100 : 0;
              const strongSellPct = total > 0 ? ((rec.strongSell || 0) / total) * 100 : 0;
              
              return (
                <View key={idx} style={styles.ratingCard}>
                  <Text style={styles.ratingPeriod}>{rec.period || 'Current Month'}</Text>
                  <View style={styles.ratingBar}>
                    {strongBuyPct > 0 && <View style={[styles.ratingSegment, { width: `${strongBuyPct}%`, backgroundColor: '#059669' }]} />}
                    {buyPct > 0 && <View style={[styles.ratingSegment, { width: `${buyPct}%`, backgroundColor: '#10b981' }]} />}
                    {holdPct > 0 && <View style={[styles.ratingSegment, { width: `${holdPct}%`, backgroundColor: '#6b7280' }]} />}
                    {sellPct > 0 && <View style={[styles.ratingSegment, { width: `${sellPct}%`, backgroundColor: '#ef4444' }]} />}
                    {strongSellPct > 0 && <View style={[styles.ratingSegment, { width: `${strongSellPct}%`, backgroundColor: '#dc2626' }]} />}
                  </View>
                  <View style={styles.ratingLegend}>
                    <View style={styles.ratingItem}>
                      <View style={[styles.ratingDot, { backgroundColor: '#059669' }]} />
                      <Text style={styles.ratingText}>Strong Buy: {rec.strongBuy || 0}</Text>
                    </View>
                    <View style={styles.ratingItem}>
                      <View style={[styles.ratingDot, { backgroundColor: '#10b981' }]} />
                      <Text style={styles.ratingText}>Buy: {rec.buy || 0}</Text>
                    </View>
                    <View style={styles.ratingItem}>
                      <View style={[styles.ratingDot, { backgroundColor: '#6b7280' }]} />
                      <Text style={styles.ratingText}>Hold: {rec.hold || 0}</Text>
                    </View>
                    <View style={styles.ratingItem}>
                      <View style={[styles.ratingDot, { backgroundColor: '#ef4444' }]} />
                      <Text style={styles.ratingText}>Sell: {rec.sell || 0}</Text>
                    </View>
                    <View style={styles.ratingItem}>
                      <View style={[styles.ratingDot, { backgroundColor: '#dc2626' }]} />
                      <Text style={styles.ratingText}>Strong Sell: {rec.strongSell || 0}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 9. Upgrade/Downgrade History */}
        {upgradeDowngradeHistory?.history && upgradeDowngradeHistory.history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>RECENT ANALYST ACTIONS</Text>
            {upgradeDowngradeHistory.history.slice(0, 5).map((action: any, idx: number) => {
              const isUpgrade = action.action?.toLowerCase().includes('up') || action.toGrade?.toLowerCase().includes('buy');
              const isDowngrade = action.action?.toLowerCase().includes('down') || action.toGrade?.toLowerCase().includes('sell');
              
              return (
                <View key={idx} style={styles.actionCard}>
                  <View style={styles.actionHeader}>
                    <Text style={styles.actionFirm}>{action.firm || 'Analyst'}</Text>
                    <View style={[styles.actionBadge, { backgroundColor: isUpgrade ? palette.successBg : isDowngrade ? palette.dangerBg : palette.surfaceLight }]}>
                      <Text style={[styles.actionBadgeText, { color: isUpgrade ? palette.success : isDowngrade ? palette.danger : palette.mutedText }]}>
                        {action.action || 'Maintained'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actionDetails}>
                    <Text style={styles.actionGrade}>
                      {action.fromGrade ? `${action.fromGrade} → ` : ''}{action.toGrade || 'N/A'}
                    </Text>
                    {action.currentPriceTarget && (
                      <Text style={styles.actionTarget}>
                        Price Target: ${action.currentPriceTarget.fmt || action.currentPriceTarget.raw || 'N/A'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.actionDate}>
                    {action.epochGradeDate ? new Date(action.epochGradeDate * 1000).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 10. Ownership & Insiders */}
        {(institutionOwnership || insiderHolders) && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>OWNERSHIP & INSIDER ACTIVITY</Text>
            {institutionOwnership?.ownershipList?.slice(0, 3).map((owner: any, idx: number) => (
              <View key={idx} style={styles.ownerCard}>
                <View style={styles.ownerRow}>
                  <Text style={styles.ownerName}>{owner.organization}</Text>
                  <Text style={styles.ownerValue}>{owner.pctHeld?.fmt || 'N/A'}</Text>
                </View>
                <Text style={styles.ownerShares}>
                  {owner.position?.fmt} shares • {owner.reportDate?.fmt}
                </Text>
              </View>
            ))}
            {insiderHolders?.holders?.slice(0, 5).map((holder: any, idx: number) => (
              <View key={idx} style={styles.insiderCard}>
                <View style={styles.insiderRow}>
                  <Text style={styles.insiderName}>{holder.name || 'N/A'}</Text>
                  <Text style={styles.insiderRelation}>{holder.relation || 'N/A'}</Text>
                </View>
                <Text style={styles.insiderDetails}>
                  {holder.transactionDescription || 'No recent transactions'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 11. SEC Filings */}
        {secFilings?.filings && secFilings.filings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>SEC FILINGS</Text>
            {secFilings.filings.slice(0, 8).map((filing: any, idx: number) => (
              <View key={idx} style={styles.filingCard}>
                <View style={styles.filingHeader}>
                  <View style={styles.filingType}>
                    <Text style={styles.filingTypeText}>{filing.type || 'N/A'}</Text>
                  </View>
                  <Text style={styles.filingDate}>{filing.date || 'N/A'}</Text>
                </View>
                <Text style={styles.filingTitle} numberOfLines={2}>
                  {filing.title || 'No title'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 12. Market Index Trend */}
        {indexTrend?.estimates && indexTrend.estimates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>INDEX GROWTH ESTIMATES</Text>
            <View style={styles.indexCard}>
              <Text style={styles.indexSymbol}>{indexTrend.symbol || 'Market Index'}</Text>
              <View style={styles.indexGrid}>
                {indexTrend.estimates.map((est: any, idx: number) => (
                  <View key={idx} style={styles.indexItem}>
                    <Text style={styles.indexPeriod}>{est.period}</Text>
                    <Text style={styles.indexGrowth}>
                      {est.growth?.fmt ? `${(parseFloat(est.growth.fmt) * 100).toFixed(1)}%` : 'N/A'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* 13. Net Share Purchase Activity */}
        {netSharePurchase && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>INSIDER TRADING ACTIVITY (6M)</Text>
            <View style={styles.netShareCard}>
              <View style={styles.netShareRow}>
                <View style={styles.netShareCol}>
                  <Text style={styles.netShareLabel}>Buys</Text>
                  <Text style={[styles.netShareValue, { color: palette.success }]}>
                    {netSharePurchase.buyInfoCount?.fmt || '0'}
                  </Text>
                  <Text style={styles.netShareShares}>{netSharePurchase.buyInfoShares?.fmt || 'N/A'} shares</Text>
                  <Text style={styles.netSharePercent}>{netSharePurchase.buyPercentInsiderShares?.fmt || '0%'}</Text>
                </View>
                <View style={styles.netShareDivider} />
                <View style={styles.netShareCol}>
                  <Text style={styles.netShareLabel}>Sells</Text>
                  <Text style={[styles.netShareValue, { color: palette.danger }]}>
                    {netSharePurchase.sellInfoCount?.fmt || '0'}
                  </Text>
                  <Text style={styles.netShareShares}>{netSharePurchase.sellInfoShares?.fmt || 'N/A'} shares</Text>
                  <Text style={styles.netSharePercent}>{netSharePurchase.sellPercentInsiderShares?.fmt || '0%'}</Text>
                </View>
                <View style={styles.netShareDivider} />
                <View style={styles.netShareCol}>
                  <Text style={styles.netShareLabel}>Net</Text>
                  <Text style={[styles.netShareValue, { color: (netSharePurchase.netInfoShares?.raw || 0) >= 0 ? palette.success : palette.danger }]}>
                    {netSharePurchase.netInfoCount?.fmt || '0'}
                  </Text>
                  <Text style={styles.netShareShares}>{netSharePurchase.netInfoShares?.fmt || 'N/A'} shares</Text>
                  <Text style={styles.netSharePercent}>{netSharePurchase.netPercentInsiderShares?.fmt || '0%'}</Text>
                </View>
              </View>
              <View style={styles.netShareFooter}>
                <Text style={styles.netShareFooterText}>
                  Total Insider Shares: {netSharePurchase.totalInsiderShares?.fmt || 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 14. Company Profile */}
        {overview && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>PROFILE</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <View style={styles.profileItem}>
                  <Briefcase size={14} color={palette.mutedText} style={{marginBottom: 4}} />
                  <Text style={styles.profileLabel}>Sector</Text>
                  <Text style={styles.profileValue}>{overview.sector || 'N/A'}</Text>
                </View>
                <View style={styles.dividerVertical} />
                <View style={styles.profileItem}>
                  <Globe size={14} color={palette.mutedText} style={{marginBottom: 4}} />
                  <Text style={styles.profileLabel}>Industry</Text>
                  <Text style={styles.profileValue}>{overview.industry || 'N/A'}</Text>
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
    minHeight: 330,
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
  chartCenterInfo: {
    height: '100%',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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

  // Ownership & Insider Cards
  ownerCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  ownerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ownerName: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  ownerValue: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  ownerShares: {
    color: palette.mutedText,
    fontSize: 12,
  },
  insiderCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  insiderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  insiderName: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  insiderType: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  insiderDetails: {
    color: palette.mutedText,
    fontSize: 12,
  },
  insiderRelation: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.accent,
    textTransform: 'uppercase',
  },

  // Earnings History Cards
  earningCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  earningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  earningQuarter: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  earningBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  earningBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  earningDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  earningCol: {
    flex: 1,
  },
  earningLabel: {
    color: palette.mutedText,
    fontSize: 11,
    marginBottom: 2,
  },
  earningValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },

  // Analyst Ratings
  ratingCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  ratingPeriod: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  ratingBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  ratingSegment: {
    height: '100%',
  },
  ratingLegend: {
    gap: spacing.sm,
  },
  ratingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  ratingText: {
    color: palette.text,
    fontSize: 13,
  },

  // Analyst Actions
  actionCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionFirm: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  actionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  actionDetails: {
    marginBottom: 6,
  },
  actionGrade: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  actionTarget: {
    color: palette.mutedText,
    fontSize: 12,
  },
  actionDate: {
    color: palette.mutedText,
    fontSize: 11,
  },

  // SEC Filings
  filingCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  filingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  filingType: {
    backgroundColor: palette.accentBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  filingTypeText: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  filingDate: {
    color: palette.mutedText,
    fontSize: 11,
  },
  filingTitle: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },

  // Index Trend
  indexCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  indexSymbol: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  indexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  indexItem: {
    width: '30%',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: palette.surfaceHighlight,
    borderRadius: 8,
  },
  indexPeriod: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  indexGrowth: {
    color: palette.success,
    fontSize: 16,
    fontWeight: '700',
  },

  // Net Share Purchase Activity
  netShareCard: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  netShareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  netShareCol: {
    flex: 1,
    alignItems: 'center',
  },
  netShareDivider: {
    width: 1,
    backgroundColor: palette.border,
    marginHorizontal: spacing.sm,
  },
  netShareLabel: {
    color: palette.mutedText,
    fontSize: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  netShareValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  netShareShares: {
    color: palette.text,
    fontSize: 13,
    marginBottom: 2,
  },
  netSharePercent: {
    color: palette.mutedText,
    fontSize: 11,
  },
  netShareFooter: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  netShareFooterText: {
    color: palette.mutedText,
    fontSize: 12,
  },
});