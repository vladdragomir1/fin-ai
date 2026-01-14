<img width="652" height="581" alt="FINAI" src="https://github.com/user-attachments/assets/35994ff1-3cf3-4581-9cd4-84fec3324806" />

# FinanceAI

Your private, offline AI Financial Analyst. Secure, fast, and on-device. It allows you to analyze stocks, ETFs and diverse financial instruments, view complex financial indicators, and chat with an intelligent assistant—anytime, anywhere, with zero data leaving your phone.

## Features

- **On-Device AI Chat**: Local LLM-powered financial assistant using LFM2-1.2B model
- **Real-Time Market Data**: Live stock quotes, market movers, and financial metrics
- **Advanced Charts**: Interactive stock charts powered by TradingView and Victory Native
- **Market News**: Latest financial news, videos, and headlines
- **Financial Calendars**: Track earnings, dividends, IPOs, stock splits, and economic events
- **Technical Analysis**: SMA, RSI, MACD, ADX indicators and more
- **Portfolio Watchlist**: Track your favorite stocks and investments
- **Secure Authentication**: PIN and biometric protection
- **Offline First**: Works without internet, syncs when connected
- **Beautiful UI**: Modern design with React Native Paper

## AI & RAG Technology

FinanceAI leverages cutting-edge **RAG (Retrieval-Augmented Generation)** technology to provide accurate, context-aware financial insights:

### LFM2-1.2B Model
- **Model**: LFM2-1.2B (Quantized Q8_0 format, ~1.3GB)
- **Specialization**: Document-based Q&A, optimized for financial data
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
- **Victory Native 41.20.2**: Data visualization and charts
- **@shopify/react-native-skia**: High-performance graphics

### AI & ML
- **llama.rn 0.9.0-rc.3**: On-device LLM inference
- **LFM2-1.2B-Q8_0**: Quantized language model for financial Q&A
- **Custom RAG Service**: Retrieval-Augmented Generation pipeline

### Data & Storage
- **react-native-quick-sqlite 8.2.7**: High-performance SQLite database
- **@react-native-async-storage/async-storage**: Key-value storage
- **react-native-fs**: File system access for model storage

### Security
- **react-native-biometrics**: Fingerprint/Face ID authentication
- **react-native-keychain**: Secure credential storage
- **react-native-quick-crypto 0.7.17**: Cryptographic operations

### Network & APIs
- **@react-native-community/netinfo**: Network connectivity monitoring
- **Mboum Finance API**: Real-time market data (via RapidAPI)
- **TradingView**: Advanced charting integration

### Development
- **Jest**: Testing framework
- **ESLint**: Code linting
- **Babel**: JavaScript compilation
- **Metro**: React Native bundler

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

### Database Schema
- **stock_quotes**: Real-time quote cache
- **company_overview**: Company fundamentals
- **financial_metrics**: Key financial ratios
- **watchlist**: User's tracked stocks
- **market_data**: Market movers cache
- **news_cache**: Financial news articles
- **calendar_cache**: Event calendars
- **chat_history**: AI conversation storage

## Supported Platforms

- **Android**: Primary platform (tested on Galaxy S10+)
- **iOS**: Experimental support

