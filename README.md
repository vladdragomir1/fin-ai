<img width="652" height="581" alt="FINAI" src="https://github.com/user-attachments/assets/35994ff1-3cf3-4581-9cd4-84fec3324806" />

# FinanceAI

Your private, offline-capable AI Financial Analyst. Secure, fast, and on-device. It allows you to analyze stocks and financial instruments, view complex financial indicators, and chat with an intelligent assistant—anytime, anywhere, with zero data leaving your phone.

## Features

- **On-Device AI Chat**: Local LLM-powered financial assistant using LFM2-1.2B model
- **Real-Time Market Data**: Live stock quotes, market movers, and financial metrics
- **Advanced Charts**: Interactive stock charts powered by TradingView (via WebView) and custom React Native charts
- **Market News**: Latest financial news, videos, and headlines
- **Financial Calendars**: Track earnings, dividends, IPOs, stock splits, and economic events
- **Technical Analysis**: SMA, RSI, MACD, ADX indicators and more
- **Portfolio Watchlist**: Track your favorite stocks and investments
- **Secure Authentication**: PIN and biometric protection
- **Offline Capable**: Graceful fallback to cached and baseline data when offline
- **Beautiful UI**: Custom dark design system with React Native Paper and Lucide icons

## AI & RAG Technology

FinanceAI leverages cutting-edge **RAG (Retrieval-Augmented Generation)** technology to provide accurate, context-aware financial insights:

### LFM2-1.2B Model
- **Model**: LFM2-1.2B (Quantized Q8_0 format, ~1.3GB)
- **Specialization**: General-purpose small language model, specialized for financial Q&A via custom RAG pipeline
- **Runtime**: [llama.rn](https://github.com/a-ghorbani/llama.rn) - React Native LLaMA implementation
- **Device**: Runs entirely on-device (CPU-optimized for Android)
- **Context Window**: 8192 tokens for extended conversations
- **Privacy**: Zero data sent to external servers

### RAG Implementation
The app implements a sophisticated RAG pipeline that:

1. **Data Retrieval**: Fetches relevant financial data from multiple sources:
   - Company fundamentals (14+ data modules)
   - Real-time quotes and historical prices
   - Market movers and trends
   - News articles and analysis
   - Technical indicators
   - Financial statements (Income, Balance Sheet, Cash Flow)
   - Calendar events (earnings, dividends, IPOs, splits)

2. **Context Preparation**: Formats and optimizes data for the LLM
   - Smart data truncation to fit context window
   - Numerical formatting and normalization
   - Chronological sorting for time-series data
   - Relevance-based prioritization

3. **Generation**: LFM2 generates natural language responses based on retrieved data
   - Reduces hallucinations through grounded context
   - Provides accurate, data-backed answers
   - Maintains conversation history (20 messages, ~3000 tokens)

## Technology Stack

### Frontend
- **React Native 0.82.1**: Cross-platform mobile framework
- **TypeScript**: Type-safe development
- **React Navigation**: Native stack and bottom tabs navigation
- **React Native Paper 5.14.5**: Material Design UI components
- **lucide-react-native**: Icon library used across all screens
- **react-native-markdown-display**: Markdown rendering for AI responses
- **react-native-webview**: Embeds TradingView charts

### AI & ML
- **llama.rn 0.9.0-rc.3**: On-device LLM inference
- **LFM2-1.2B-Q8_0**: Quantized language model for financial Q&A
- **Custom RAG Service**: Retrieval-Augmented Generation pipeline

### Data & Storage
- **react-native-quick-sqlite 8.2.7**: High-performance SQLite database
- **@react-native-async-storage/async-storage**: Key-value storage and chat session persistence
- **react-native-fs**: File system access for model storage
- **date-fns**: Date formatting and manipulation

### Security
- **react-native-biometrics**: Fingerprint/Face ID authentication
- **react-native-keychain**: Secure credential storage
- **react-native-quick-crypto 0.7.17**: Cryptographic operations (PBKDF2 PIN hashing)

### Network & APIs
- **@react-native-community/netinfo**: Network connectivity monitoring
- **Mboum Finance API**: Real-time market data (via RapidAPI)
- **TradingView**: Advanced charting integration

### Development
- **Hermes**: JavaScript engine for React Native
- **Jest**: Testing framework
- **ESLint**: Code linting
- **Babel**: JavaScript compilation
- **Metro**: React Native bundler
- **react-native-dotenv**: Environment variable management

## Architecture

### Service Layer
- **aiService.ts**: LLM initialization, chat management, and inference
- **ragService.ts**: Context retrieval and preparation for AI
- **financeApiService.ts**: Market data API integration with smart caching
- **databaseService.ts**: SQLite database operations and migrations
- **offlineDataService.ts**: Offline data management and sync
- **tradingViewPriceService.ts**: Real-time price updates from TradingView

### Smart Caching System
- **Market Hours Aware**: Different cache TTLs for market open/closed
- **Adaptive Refresh**: Real-time data during market hours, extended cache after hours
- **Offline Support**: Graceful degradation with cached data
- **Rate Limit Protection**: Throttling and retry logic

### Database Schema (SQLite)
- **companies**: Company symbols, names, and exchange info
- **stock_quotes**: Real-time quote cache
- **historical_data**: Historical price data by time range
- **company_overview**: Company fundamentals and descriptions
- **financial_metrics**: Key financial ratios (P/E, EPS, market cap, etc.)
- **search_cache**: Cached search results
- **stock_modules**: Module-level data cache (earnings, statements, ownership, etc.)
- **market_data_cache**: Market movers, news, and calendar event cache

### Additional Storage (AsyncStorage)
- **Chat sessions**: AI conversation history and multi-session management
- **Watchlist**: User's tracked stocks (via React Context)
- **Offline quote cache**: Fallback price data with hardcoded baselines

## Supported Platforms

- **Android**: Primary platform (tested on Galaxy S10+)
- **iOS**: Experimental support

