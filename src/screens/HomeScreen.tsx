import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { 
  Settings, 
  Search, 
  BarChart3, 
  BrainCircuit, 
  ChevronRight, 
  LayoutDashboard 
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenShell } from '@/components';
import { palette, spacing, layout } from '@/theme';
import type { RootStackParamList } from '@/navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen = () => {
  const navigation = useNavigation<NavigationProp>();

  // Reusable Feature Card Component for consistency
  const FeatureCard = ({ 
    title, 
    description, 
    icon: IconComponent, 
    iconColor, 
    bgTint,
    onPress 
  }: { 
    title: string; 
    description: string; 
    icon: any; 
    iconColor: string;
    bgTint: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity 
      onPress={onPress} 
      style={styles.card}
      activeOpacity={layout.activeOpacity}
    >
      <View style={styles.cardContent}>
        {/* Icon Container with subtle tinted background */}
        <View style={[styles.iconBox, { backgroundColor: bgTint }]}>
          <IconComponent size={24} color={iconColor} strokeWidth={1.5} />
        </View>

        {/* Text Content */}
        <View style={styles.textContainer}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{description}</Text>
        </View>

        {/* Action Indicator */}
        <ChevronRight size={20} color={palette.surfaceHighlight} />
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <View>
            <View style={styles.eyebrowContainer}>
              <LayoutDashboard size={12} color={palette.accent} />
              <Text style={styles.eyebrow}>FINAI TERMINAL</Text>
            </View>
            <Text style={styles.title}>Market Overview</Text>
          </View>
          
          <TouchableOpacity 
            onPress={() => navigation.navigate('Settings')} 
            style={styles.settingsButton}
            activeOpacity={0.8}
          >
            <Settings size={20} color={palette.text} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        {/* Decorative Divider */}
        <View style={styles.divider} />

        {/* Features List */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ANALYTICS SUITE</Text>
          
          <FeatureCard
            title="Market Intelligence"
            description="Global ticker search & real-time quotes."
            icon={Search}
            iconColor={palette.primary} // White
            bgTint="rgba(255, 255, 255, 0.1)"
            onPress={() => navigation.navigate('Root', { screen: 'Search' })}
          />

          <FeatureCard
            title="Market News"
            description="Stay updated with the latest market headlines."
            icon={BarChart3}
            iconColor={palette.success} // Emerald
            bgTint="rgba(16, 185, 129, 0.1)"
            onPress={() => navigation.navigate('Root', { screen: 'Statistics' })}
          />

          <FeatureCard
            title="AI Analyst"
            description="Predictive insights powered by FinAI."
            icon={BrainCircuit}
            iconColor={palette.accent} // Royal Blue
            bgTint="rgba(37, 99, 235, 0.1)"
            onPress={() => navigation.navigate('Root', { screen: 'AI' })}
          />
        </View>

      </ScrollView>
    </ScreenShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  
  // Header Styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  eyebrowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsText: {
    display: 'none',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: palette.surfaceHighlight,
    marginBottom: spacing.xl,
  },

  // Section Styles
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
    marginLeft: 4,
  },

  // Card Styles
  card: {
    backgroundColor: palette.surface,
    borderRadius: layout.borderRadius,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDesc: {
    color: palette.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },
});