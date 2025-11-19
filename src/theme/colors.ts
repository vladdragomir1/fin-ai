export const palette = {
  background: '#050c1f',
  surface: '#0f172a',
  card: '#111b34',
  cardAlt: '#16213d',
  primary: '#6366f1',
  secondary: '#0ea5e9',
  accent: '#f97316',
  success: '#22c55e',
  warning: '#facc15',
  danger: '#f43f5e',
  error: '#f43f5e',
  text: '#f8fafc',
  mutedText: '#94a3b8',
  border: '#1e293b',
  chart1: '#38bdf8',
  chart2: '#a855f7',
  chart3: '#f472b6',
  positive: '#4ade80',
  negative: '#fb7185',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 28,
  pill: 999,
};

export const typography = {
  heading: {
    fontSize: 28,
    fontWeight: '600' as const,
    color: palette.text,
  },
  body: {
    fontSize: 16,
    color: palette.text,
  },
};
