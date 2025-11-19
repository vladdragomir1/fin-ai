import { format } from 'date-fns';
import { Budget, PredictionInsight, Transaction } from '@/types';
import { ragService } from './ragService';
import { databaseService } from './databaseService';

export interface AiContext {
  transactions: Transaction[];
  budgets: Budget[];
  insights: PredictionInsight[];
}

const clamp = (value: number) => Math.round(value * 100) / 100;

const summarizeTransactions = (transactions: Transaction[]) => {
  const totals = transactions.reduce(
    (acc, trx) => {
      if (trx.type === 'income') {
        acc.income += trx.amount;
      } else {
        acc.expense += trx.amount;
      }
      return acc;
    },
    { income: 0, expense: 0 },
  );

  const balance = totals.income - totals.expense;
  const biggest = [...transactions]
    .filter(trx => trx.type === 'expense')
    .sort((a, b) => b.amount - a.amount)[0];

  return {
    ...totals,
    balance,
    biggestSpender: biggest?.category,
    biggestAmount: biggest?.amount ?? 0,
  };
};

const buildBudgetNarrative = (budgets: Budget[]) => {
  if (!budgets.length) {
    return 'Nu există bugete definite pentru această lună.';
  }
  const risks = budgets.filter(b => b.spent / b.limit >= 0.75);
  if (!risks.length) {
    return 'Toate bugetele sunt bine calibrate și sub control.';
  }
  return `Atenție la ${risks
    .map(b => b.category)
    .join(', ')} — ești peste 75% din plafon.`;
};

const pickInsight = (insights: PredictionInsight[]) => {
  if (!insights.length) {
    return undefined;
  }
  return insights.sort((a, b) => b.impact - a.impact)[0];
};

export const AiService = {
  /**
   * Detect if query is about financial analysis (companies, stocks)
   */
  isFinancialQuery(prompt: string): boolean {
    const financialKeywords = [
      'stock', 'company', 'market', 'price', 'share', 'investment',
      'pe ratio', 'eps', 'dividend', 'sector', 'industry', 'analyse',
      'analyze', 'compare', 'ticker', 'nasdaq', 'nyse', 'worth',
      'should i buy', 'should i invest', 'valuation'
    ];
    
    const lowerPrompt = prompt.toLowerCase();
    return financialKeywords.some(keyword => lowerPrompt.includes(keyword)) ||
           /\b[A-Z]{1,5}\b/.test(prompt); // Contains stock ticker
  },

  /**
   * Generate financial analysis response using RAG
   */
  async generateFinancialResponse(prompt: string): Promise<string> {
    try {
      // Initialize database if not already done
      await databaseService.initialize();

      // Extract relevant financial context from SQLite
      const context = await ragService.extractRelevantContext(prompt);
      
      // For now, return structured analysis (in future, this will go to Phi-3-mini)
      const now = format(new Date(), 'dd MMMM yyyy, HH:mm');
      
      return `📊 **Financial Analyst AI**\n📅 ${now}\n\n${context}\n\n---\n💡 *This analysis is based on cached market data from Alpha Vantage API. For real-time data, search for companies when online.*`;
    } catch (error) {
      console.error('Error generating financial response:', error);
      return `I encountered an error accessing the financial database. Please make sure you've searched for companies first to build the knowledge base.\n\nError: ${error}`;
    }
  },

  /**
   * Generate personal finance response (budgets, transactions)
   */
  async generatePersonalFinanceResponse(prompt: string, context: AiContext): Promise<string> {
    const summary = summarizeTransactions(context.transactions);
    const narrative = buildBudgetNarrative(context.budgets);
    const insight = pickInsight(context.insights);
    const now = format(new Date(), 'dd MMMM yyyy, HH:mm');

    const suggestion =
      summary.balance > 0
        ? 'Poți direcționa surplusul către contul de economii sau investiții automate.'
        : 'Îți recomand să identifici cheltuielile discreționare ce pot fi amânate.';

    const syntheticAnswer = [
      `📅 ${now}`,
      `Am analizat întrebarea ta: "${prompt.trim()}"`,
      '',
      `• **Venituri**: ${clamp(summary.income)} RON`,
      `• **Cheltuieli**: ${clamp(summary.expense)} RON`,
      `• **Sold net**: ${clamp(summary.balance)} RON`,
      summary.biggestSpender
        ? `Cea mai mare cheltuială a fost la categoria ${summary.biggestSpender} (${summary.biggestAmount} RON).`
        : 'Nu există cheltuieli înregistrate.',
      narrative,
      insight ? `Insight relevant: ${insight.title} — ${insight.description}` : '',
      suggestion,
    ]
      .filter(Boolean)
      .join('\n');

    return syntheticAnswer;
  },

  /**
   * Main entry point - routes to appropriate handler
   */
  async generateResponse(prompt: string, context: AiContext): Promise<string> {
    // Check if this is a financial analysis query
    if (this.isFinancialQuery(prompt)) {
      return await this.generateFinancialResponse(prompt);
    }

    // Otherwise, handle as personal finance query
    return await this.generatePersonalFinanceResponse(prompt, context);
  },
};
