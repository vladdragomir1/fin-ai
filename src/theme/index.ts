import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const palette = {
  background: '#09090B', 
  surface: '#18181B',    
  surfaceHighlight: '#27272A', 
  
  primary: '#FFFFFF',    
  secondary: '#A1A1AA',  
  accent: '#2563EB',   
  
  success: '#10B981',    
  warning: '#F59E0B',    
  danger: '#EF4444',     
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