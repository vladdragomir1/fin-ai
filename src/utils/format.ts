import { format, parseISO } from 'date-fns';

export const formatCurrency = (value: number, currency = 'USD') => {
  if (value === undefined || value === null) return '-';

  const isLarge = Math.abs(value) >= 1_000_000;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: isLarge ? 'compact' : 'standard', 
    maximumFractionDigits: 2,
    compactDisplay: 'short',
  }).format(value);
};

export const formatDate = (isoDate: string, pattern = 'MMM dd, yyyy') => {
  if (!isoDate) return '';
  try {
    return format(parseISO(isoDate), pattern);
  } catch (e) {
    console.warn('Date format error', e);
    return isoDate;
  }
};