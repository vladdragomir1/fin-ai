import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const palette = {
  background: '#09090B', 
  surface: '#18181B',    
  surfaceHighlight: '#27272A', 
  surfaceLight: '#3F3F46',
  
  primary: '#FFFFFF',    
  secondary: '#A1A1AA',  
  accent: '#8B5CF6',   
  accentBg: 'rgba(139, 92, 246, 0.1)',
  
  success: '#10B981',    
  successBg: 'rgba(16, 185, 129, 0.1)',
  warning: '#F59E0B',    
  danger: '#EF4444',     
  dangerBg: 'rgba(239, 68, 68, 0.1)',
  error: '#EF4444',      

  text: '#FAFAFA',      
  mutedText: '#71717A',  
  
  border: '#27272A',  
  overlay: 'rgba(0,0,0,0.8)', 
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32, 
  xxl: 48, 
};

export const layout = {
  window: { width, height },
  width,
  height,
  borderRadius: 16,    
  activeOpacity: 0.7,  
  iconStroke: 1.5,      
};

export const typography = {
  heading: { 
    fontSize: 28, 
    fontWeight: '600', 
    color: palette.text,
    letterSpacing: -0.5 
  },
  body: { 
    fontSize: 16, 
    color: palette.text 
  },
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  pill: 999,
};