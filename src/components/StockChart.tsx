import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { palette, spacing, layout } from '@/theme';
import type { ChartDataPoint, ChartTimeRange } from '@/types';

interface Props {
  data: ChartDataPoint[];
  selectedRange: ChartTimeRange;
  onRangeChange: (range: ChartTimeRange) => void;
}

const CHART_HEIGHT = 200;
const CHART_WIDTH = Dimensions.get('window').width - 40;

export const StockChart = ({ data, selectedRange, onRangeChange }: Props) => {
  if (!data || data.length === 0) {
    return null;
  }

  // Calculate scaling
  const prices = data.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  // Create points for the line
  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * CHART_WIDTH;
    // Avoid division by zero if flat line
    const normalizedY = priceRange === 0 ? 0.5 : (point.price - minPrice) / priceRange;
    const y = CHART_HEIGHT - normalizedY * CHART_HEIGHT;
    return { x, y, price: point.price };
  });

  // Determine trend color
  const firstPrice = data[0].price;
  const lastPrice = data[data.length - 1].price;
  const isPositive = lastPrice >= firstPrice;
  const lineColor = isPositive ? palette.success : palette.danger;

  const ranges: ChartTimeRange[] = ['1M', '6M', '1Y', '5Y', 'ALL'];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Chart Container */}
      <View style={styles.chartContainer}>
        {/* Chart Drawing Area */}
        <View style={styles.chart} removeClippedSubviews={false}>
          {/* Main line segments */}
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

          {/* Fill Area (Bars) - Optional visual effect */}
          {points.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = points[index - 1];
            const avgHeight = (point.y + prevPoint.y) / 2;
            const barHeight = CHART_HEIGHT - avgHeight;
            
            // Only render some bars to save performance or use opacity
            return (
              <View
                key={`bar-${index}`}
                style={[
                  styles.chartBar,
                  {
                    left: prevPoint.x,
                    bottom: 0,
                    width: point.x - prevPoint.x + 1, // +1 to overlap gaps
                    height: barHeight,
                    backgroundColor: lineColor,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Grid lines (Horizontal) */}
        {[0.25, 0.5, 0.75].map((ratio, index) => (
          <View
            key={index}
            style={[
              styles.gridLine,
              { top: CHART_HEIGHT * ratio },
            ]}
          />
        ))}

        {/* Y-Axis Labels */}
        <View style={styles.priceLabels}>
          <Text style={styles.priceLabel}>${maxPrice.toFixed(0)}</Text>
          <Text style={styles.priceLabel}>${((minPrice + maxPrice) / 2).toFixed(0)}</Text>
          <Text style={styles.priceLabel}>${minPrice.toFixed(0)}</Text>
        </View>

        {/* Floating Price Change Badge */}
        <View style={[styles.priceChange, { backgroundColor: palette.surface }]}>
          <Text style={[styles.priceChangeText, { color: lineColor }]}>
            {isPositive ? '▲' : '▼'} {((lastPrice - firstPrice) / firstPrice * 100).toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* Range Selector */}
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
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 50,
    height: 1,
    backgroundColor: palette.border,
    opacity: 0.5,
  },
  chart: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CHART_WIDTH - 50, // Reserve space for labels
    height: CHART_HEIGHT,
  },
  chartBar: {
    position: 'absolute',
    opacity: 0.1, // Subtle fill effect
  },
  line: {
    position: 'absolute',
    height: 2, // Thinner, sharper line
    transformOrigin: 'left center',
  },
  priceLabels: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  priceLabel: {
    color: palette.mutedText,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
  },
  priceChange: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  priceChangeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rangeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: palette.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  rangeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  rangeButtonActive: {
    backgroundColor: palette.surfaceHighlight, 
  },
  rangeText: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600',
  },
  rangeTextActive: {
    color: palette.text, 
  },
});