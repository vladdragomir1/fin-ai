import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { palette, spacing } from '@/theme';
import type { ChartDataPoint, ChartTimeRange } from '@/types';

interface Props {
  data: ChartDataPoint[];
  selectedRange: ChartTimeRange;
  onRangeChange: (range: ChartTimeRange) => void;
}

const CHART_HEIGHT = 200;
const CHART_WIDTH = Dimensions.get('window').width - 40;

export const StockChart = ({ data, selectedRange, onRangeChange }: Props) => {
  if (data.length === 0) {
    return null;
  }

  // Calculează min și max pentru scalare
  const prices = data.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  // Creează puncte pentru linie
  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * CHART_WIDTH;
    const y = CHART_HEIGHT - ((point.price - minPrice) / priceRange) * CHART_HEIGHT;
    return { x, y, price: point.price };
  });

  // Determină culoarea bazată pe trend
  const firstPrice = data[0].price;
  const lastPrice = data[data.length - 1].price;
  const isPositive = lastPrice >= firstPrice;
  const lineColor = isPositive ? palette.success : palette.danger;

  const ranges: ChartTimeRange[] = ['1M', '6M', '1Y', '5Y', 'ALL'];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Chart Container */}
      <View style={styles.chartContainer}>
        {/* Background gradient area under chart */}
        <View style={styles.chart} removeClippedSubviews={false}>
          {/* Fill area under the line */}
          {points.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = points[index - 1];
            const avgHeight = (point.y + prevPoint.y) / 2;
            const barHeight = CHART_HEIGHT - avgHeight;
            
            return (
              <View
                key={`bar-${index}`}
                style={[
                  styles.chartBar,
                  {
                    left: prevPoint.x,
                    bottom: 0,
                    width: point.x - prevPoint.x,
                    height: barHeight,
                    backgroundColor: lineColor,
                  },
                ]}
              />
            );
          })}
          
          {/* Main line */}
          {points.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = points[index - 1];
            
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            return (
              <View
                key={`line-${index}`}
                style={[
                  styles.line,
                  {
                    left: prevPoint.x,
                    top: prevPoint.y,
                    width: length,
                    backgroundColor: lineColor,
                    transform: [{ rotate: `${angle}deg` }],
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Grid lines (horizontal) */}
        {[0.25, 0.5, 0.75].map((ratio, index) => (
          <View
            key={index}
            style={[
              styles.gridLine,
              { top: CHART_HEIGHT * ratio },
            ]}
          />
        ))}

        {/* Price labels */}
        <View style={styles.priceLabels}>
          <Text style={styles.priceLabel}>${maxPrice.toFixed(0)}</Text>
          <Text style={styles.priceLabel}>${((minPrice + maxPrice) / 2).toFixed(0)}</Text>
          <Text style={styles.priceLabel}>${minPrice.toFixed(0)}</Text>
        </View>

        {/* Price change indicator */}
        <View style={styles.priceChange}>
          <Text style={[styles.priceChangeText, { color: lineColor }]}>
            {isPositive ? '▲' : '▼'} {((lastPrice - firstPrice) / firstPrice * 100).toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* Time Range Selector */}
      <View style={styles.rangeSelector}>
        {ranges.map(range => (
          <TouchableOpacity
            key={range}
            onPress={() => onRangeChange(range)}
            style={[
              styles.rangeButton,
              selectedRange === range && styles.rangeButtonActive,
            ]}>
            <Text
              style={[
                styles.rangeText,
                selectedRange === range && styles.rangeTextActive,
              ]}>
              {range}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  chartContainer: {
    height: CHART_HEIGHT,
    width: CHART_WIDTH,
    position: 'relative',
    marginBottom: spacing.md,
    backgroundColor: palette.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 50,
    height: 1,
    backgroundColor: palette.border,
    opacity: 0.2,
  },
  chart: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CHART_WIDTH - 50,
    height: CHART_HEIGHT,
  },
  chartBar: {
    position: 'absolute',
    opacity: 0.15,
  },
  line: {
    position: 'absolute',
    height: 3,
    transformOrigin: 'left center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  priceLabels: {
    position: 'absolute',
    right: 5,
    top: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  priceLabel: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '500',
  },
  priceChange: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: palette.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priceChangeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rangeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 4,
  },
  rangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  rangeButtonActive: {
    backgroundColor: palette.primary,
  },
  rangeText: {
    color: palette.mutedText,
    fontSize: 13,
    fontWeight: '600',
  },
  rangeTextActive: {
    color: palette.text,
  },
});
