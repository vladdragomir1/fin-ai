<img width="652" height="581" alt="FINAI" src="https://github.com/user-attachments/assets/35994ff1-3cf3-4581-9cd4-84fec3324806" />

# FinAI: Beyond the Ticker

Analistul tău financiar privat, capabil să funcționeze offline. Sigur, rapid și rulat integral pe dispozitiv. Aplicația îți permite să analizezi acțiuni și instrumente financiare, să vizualizezi indicatori financiari complecși și să discuți cu un asistent inteligent, oricând și oriunde, fără ca datele tale să părăsească telefonul.

---

## Funcționalități

- **Chat AI on-device**: asistent financiar local, bazat pe modelul LFM2-1.2B
- **Date de piață în timp real**: cotații, market movers și indicatori financiari
- **Grafice avansate**: grafice interactive de la TradingView (prin WebView) și grafice native React Native
- **Știri de piață**: cele mai noi știri financiare, articole și clipuri video
- **Calendare financiare**: rapoarte trimestriale, dividende, IPO-uri, split-uri de acțiuni și evenimente economice
- **Analiză tehnică**: indicatori SMA, RSI, MACD, ADX și alții
- **Watchlist**: urmărirea acțiunilor și instrumentelor preferate
- **Autentificare securizată**: protecție prin cod PIN și biometrie
- **Funcționare offline**: revenire elegantă la datele din cache atunci când nu există conexiune
- **Interfață proprie**: sistem de teme întunecat, construit fără bibliotecă externă de componente, cu iconografie Lucide

---

## Tehnologia AI și RAG

FinAI folosește tehnica **RAG (Retrieval-Augmented Generation)** pentru a oferi răspunsuri financiare precise și ancorate în date reale.

### Modelul LFM2-1.2B
- **Model**: LFM2-1.2B (cuantizat în format Q8_0, ~1,3 GB)
- **Specializare**: model de limbaj de mici dimensiuni, specializat pentru întrebări financiare prin pipeline-ul RAG propriu
- **Runtime**: [llama.rn](https://github.com/mybigday/llama.rn), legătura React Native pentru llama.cpp
- **Dispozitiv**: rulează integral pe dispozitiv (optimizat pentru CPU pe Android)
- **Fereastră de context**: 8192 de tokeni pentru conversații extinse
- **Confidențialitate**: niciun fel de date nu sunt trimise către servere externe

### Implementarea RAG
Aplicația implementează un pipeline RAG care:

1. **Preia datele**: extrage datele financiare relevante din mai multe surse:
   - date fundamentale despre companii (peste 14 module de date)
   - cotații în timp real și date istorice de preț
   - market movers și tendințe de piață
   - articole de știri și analize
   - indicatori tehnici
   - situații financiare (cont de profit și pierdere, bilanț, flux de numerar)
   - evenimente de calendar (rapoarte trimestriale, dividende, IPO-uri, split-uri)

2. **Structurează contextul**: formatează și optimizează datele pentru model
   - trunchiere inteligentă pentru a încadra datele în fereastra de context
   - formatarea și normalizarea valorilor numerice
   - sortarea cronologică a seriilor de timp
   - prioritizarea în funcție de relevanță

3. **Generează răspunsul**: LFM2 produce răspunsuri în limbaj natural pe baza datelor preluate
   - reduce halucinațiile prin ancorarea în context real
   - oferă răspunsuri precise, susținute de date
   - păstrează istoricul conversației (20 de mesaje, ~3000 de tokeni)

---

## Tehnologii utilizate

### Frontend
- **React Native 0.82.1**: framework mobil cross-platform
- **React 19.1.1**: biblioteca de bază pentru interfață
- **TypeScript 5.8.3**: dezvoltare cu tipizare statică
- **React Navigation 7**: navigare cu native stack și bottom tabs
- **lucide-react-native 0.554.0**: bibliotecă de iconografie folosită pe toate ecranele
- **react-native-markdown-display 7.0.2**: randarea răspunsurilor AI în format Markdown
- **react-native-webview 13.16.0**: încorporarea graficelor TradingView
- **react-native-safe-area-context 5.5.2**: gestionarea zonelor sigure ale ecranului

### AI și ML
- **llama.rn 0.9.0-rc.3**: inferență LLM on-device (legătura React Native pentru llama.cpp)
- **LFM2-1.2B-Q8_0**: model de limbaj cuantizat pentru întrebări financiare
- **Serviciu RAG propriu**: pipeline Retrieval-Augmented Generation

### Date și stocare
- **react-native-quick-sqlite 8.2.7**: bază de date SQLite de mare performanță
- **@react-native-async-storage/async-storage 2.2.0**: stocare cheie-valoare și persistența sesiunilor de chat
- **react-native-fs 2.20.0**: acces la sistemul de fișiere pentru stocarea modelului
- **date-fns 4.1.0**: formatarea și manipularea datelor calendaristice

### Securitate
- **react-native-biometrics 3.0.1**: autentificare prin amprentă sau recunoaștere facială
- **react-native-keychain 10.0.0**: stocarea securizată a credențialelor
- **react-native-quick-crypto 0.7.17**: operații criptografice (hashing PIN cu PBKDF2)

### Rețea și API-uri
- **@react-native-community/netinfo 11.4.1**: monitorizarea conectivității la rețea
- **Mboum Finance API**: date de piață în timp real (prin RapidAPI)
- **TradingView**: integrare pentru grafice avansate

### Dezvoltare
- **Hermes**: motorul JavaScript pentru React Native
- **ESLint 8**: verificarea codului
- **Babel**: compilarea JavaScript
- **Metro**: bundler-ul React Native
- **react-native-dotenv 3.4.11**: gestionarea variabilelor de mediu
- **Jest**: framework de testare

---

## Arhitectură

### Stratul de servicii
- **aiService.ts**: inițializarea modelului, gestionarea conversației și inferența
- **ragService.ts**: preluarea și structurarea contextului pentru model
- **financeApiService.ts**: integrarea cu API-ul de date de piață și caching inteligent
- **databaseService.ts**: operațiile pe baza de date SQLite și migrările
- **offlineDataService.ts**: gestionarea datelor offline
- **tradingViewPriceService.ts**: prețuri extrase din graficul TradingView

### Sistemul de caching inteligent
- **Adaptat la orele de piață**: TTL-uri diferite în funcție de piața deschisă sau închisă
- **Refresh adaptiv**: date în timp real în timpul sesiunii, cache extins în afara orelor de piață
- **Suport offline**: revenire elegantă la datele din cache
- **Protecție împotriva rate limit**: throttling și logică de retry

### Schema bazei de date (SQLite)
- **companies**: simboluri, denumiri și bursa companiilor
- **stock_quotes**: cache-ul cotațiilor în timp real
- **historical_data**: date istorice de preț pe intervale de timp
- **company_overview**: date fundamentale și descrieri de companii
- **financial_metrics**: indicatori financiari cheie (P/E, EPS, capitalizare etc.)
- **search_cache**: rezultate de căutare stocate în cache
- **stock_modules**: cache la nivel de modul (rezultate, situații financiare, acționariat etc.)
- **market_data_cache**: cache pentru market movers, știri și evenimente de calendar

### Stocare suplimentară (AsyncStorage)
- **Sesiuni de chat**: istoricul conversațiilor cu asistentul și gestionarea mai multor sesiuni
- **Watchlist**: acțiunile urmărite de utilizator (prin React Context)
- **Cache de rezervă pentru cotații**: prețuri de rezervă cu valori de bază

---

## Platforme suportate

- **Android**: platforma principală (testată pe Galaxy S10+)
- **iOS**: suport experimental

---

## Repository

**Adresa repository-ului (cod sursă complet, fără fișiere binare compilate):**

`https://github.com/vladdragomir1/fin-ai`

Repository-ul conține întregul cod sursă al aplicației, cu vizibilitate publică. Din repository sunt excluse prin `.gitignore` următoarele, din motive de dimensiune și de securitate:

- fișierul modelului `lfm2-1.2b-q8_0.gguf` (~1,3 GB), care se descarcă separat (vezi secțiunea Instalare și lansare);
- fișierul `.env` cu cheile de acces la API-ul Mboum Finance, care se creează manual (vezi secțiunea Compilare);
- directoarele de build și dependințele (`node_modules/`, `android/app/build/`, artefactele de compilare).

---

## Pași de compilare

### Cerințe preliminare

Pentru compilarea aplicației este nevoie de mediul standard de dezvoltare React Native (varianta React Native CLI, nu Expo):

- **Node.js** versiunea 20 sau mai nouă și **npm**
- **JDK 17** (Java Development Kit)
- **Android Studio** cu Android SDK instalat și variabila de mediu `ANDROID_HOME` configurată
- **Android SDK Platform** și **Android SDK Build-Tools** corespunzătoare
- un dispozitiv fizic Android cu depanare USB activată sau un emulator Android

Aplicația a fost dezvoltată și testată pe un dispozitiv fizic Samsung Galaxy S10+ (Android), nu pe emulator, deoarece inferența modelului de limbaj rulează mult mai lent pe emulator.

### Clonarea proiectului și configurarea

```bash
# 1. Clonarea repository-ului
git clone https://github.com/vladdragomir1/fin-ai
cd fin-ai

# 2. Instalarea dependințelor
npm install
```

Deoarece fișierul `.env` este exclus din repository, acesta trebuie creat manual în rădăcina proiectului. El conține cheile de acces la API-ul Mboum Finance (accesat prin platforma RapidAPI):

```
FINANCIAL_API_KEY=<cheia_RapidAPI>
FINANCIAL_API_HOST=<host_Mboum_Finance>
```

Aceste două variabile sunt citite de serviciul `financeApiService.ts` prin `react-native-dotenv` și sunt trimise în antetele HTTP `X-RapidAPI-Key` și `X-RapidAPI-Host` la fiecare cerere către API.

### Compilarea aplicației pentru Android

```bash
# Compilare în varianta debug
npx react-native run-android

# sau, pentru un APK de release semnat
cd android
./gradlew assembleRelease
```

Rezultatul compilării de release este un fișier APK generat în `android/app/build/outputs/apk/release/`.

---

## Pași de instalare și lansare

### Descărcarea și instalarea modelului LFM2

Modelul de limbaj nu este inclus în repository din cauza dimensiunii (~1,3 GB). Acesta se descarcă din colecția oficială Liquid AI de pe Hugging Face:

- Sursa: `https://huggingface.co/LiquidAI/LFM2-1.2B-GGUF`
- Fișierul necesar: varianta cuantizată pe 8 biți, `LFM2-1.2B-Q8_0.gguf` (~1,25 GB)

După descărcare, fișierul se redenumește în `lfm2-1.2b-q8_0.gguf` și se copiază pe dispozitiv, în directorul privat al aplicației, prin comanda `adb`:

```bash
adb push lfm2-1.2b-q8_0.gguf /sdcard/Android/data/com.financeai.app/files/lfm2-1.2b-q8_0.gguf
```

Aplicația caută modelul exact în acest director la pornire (`RNFS.ExternalDirectoryPath`), în serviciul `aiService.ts`. Dacă fișierul lipsește, ecranele cu date financiare rămân funcționale, dar asistentul inteligent nu poate porni inferența.

### Lansarea aplicației

```bash
# 1. Pornirea serverului Metro (bundler)
npm start

# 2. Instalarea și lansarea pe dispozitiv (într-un terminal separat)
npx react-native run-android
```

La prima pornire, aplicația afișează ecranul de autentificare (Access Terminal), unde utilizatorul își creează un cont prin opțiunea Create ID (nume de utilizator și cod PIN) sau se autentifică. Codul PIN este protejat prin hashing PBKDF2-SHA256 și stocat securizat prin React Native Keychain (Android Keystore). Ca alternativă la PIN, este disponibilă autentificarea biometrică, atunci când dispozitivul dispune de un senzor compatibil.

După autentificare, utilizatorul ajunge pe ecranul principal Market Overview și are acces la toate funcționalitățile aplicației: căutarea de instrumente, ecranele Market Movers și Browse Stocks, ecranul de detalii al unei companii cu grafic TradingView și indicatori, Watchlist, secțiunea de știri și calendar, precum și asistentul conversațional FinAI.

