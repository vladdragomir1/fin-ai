import { useMemo } from 'react';
import { differenceInDays, isThisMonth, parseISO } from 'date-fns';
import { useAppContext } from '@/context/AppContext';

export const useFinanceStats = () => {
  const { transactions, budgets } = useAppContext();

  return useMemo(() => {
    const monthTransactions = transactions.filter(trx => isThisMonth(parseISO(trx.date)));

    const totals = monthTransactions.reduce(
      (acc, trx) => {
        if (trx.type === 'income') {
          acc.income += trx.amount;
        } else {
          acc.expense += trx.amount;
          acc.byCategory[trx.category] = (acc.byCategory[trx.category] ?? 0) + trx.amount;
        }
        return acc;
      },
      { income: 0, expense: 0, byCategory: {} as Record<string, number> },
    );

    const balance = totals.income - totals.expense;
    const categoryEntries = Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]);
    const biggestCategory = categoryEntries[0];

    const budgetAlerts = budgets
      .map(budget => {
        const remaining = budget.limit - budget.spent;
        return {
          ...budget,
          remaining,
          ratio: budget.spent / budget.limit,
        };
      })
      .filter(item => item.ratio >= 0.6)
      .sort((a, b) => b.ratio - a.ratio);

    const recency = transactions
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
      .slice(0, 1)
      .map(item => differenceInDays(new Date(), parseISO(item.date)))[0];

    return {
      totals,
      balance,
      biggestCategory,
      budgetAlerts,
      daysSinceLastTransaction: recency ?? 0,
    };
  }, [transactions, budgets]);
};
