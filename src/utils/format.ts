import { format, parseISO } from 'date-fns';
import { ro } from 'date-fns/locale';

export const formatCurrency = (value: number, currency = 'RON') =>
  new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

export const formatDate = (isoDate: string, pattern = 'dd MMM') =>
  format(parseISO(isoDate), pattern, { locale: ro });
