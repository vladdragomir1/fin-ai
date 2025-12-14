import { ragService } from './ragService';
import { databaseService } from './databaseService';
import { LlamaContext, initLlama } from 'llama.rn';
import RNFS from 'react-native-fs';

// 1. Setup Model Path
const MODEL_FILENAME = 'lfm2-1.2b-q8_0.gguf';
const MODEL_PATH = `${RNFS.ExternalDirectoryPath}/${MODEL_FILENAME}`;

export const AiService = {
  context: null as LlamaContext | null,
  isInitialized: false,
  isProcessing: false, // Lock to prevent concurrent requests (Context busy error)

  /**
   * Initialize the LFM2-1.2B-RAG Engine
   * Optimization for Galaxy S10+:
   * - Uses CPU (n_gpu_layers: 0) for maximum stability.
   * - Uses 4 threads to balance speed and battery.
   * - LFM2 is specialized for RAG (Retrieval-Augmented Generation)
   */
  async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      console.log(`Checking for model at: ${MODEL_PATH}`);
      const exists = await RNFS.exists(MODEL_PATH);
      if (!exists) {
        console.log(`Model missing at: ${MODEL_PATH}`);
        return false;
      }

      console.log('Loading Local LLM...');
      this.context = await initLlama({
        model: MODEL_PATH,
        n_ctx: 2048,   
        n_threads: 4,     
        n_gpu_layers: 0,  
      });

      this.isInitialized = true;
      console.log('AI Initialized');
      return true;
    } catch (error) {
      console.error('AI Init Failed:', error);
      return false;
    }
  },

  /**
   * Main function: Generate response using RAG + Local LLM
   */
  async generateResponse(userPrompt: string, _unusedContext?: any): Promise<string> {
    try {
      console.log(`[AI] Received query: "${userPrompt}"`);
      
      // Check if already processing (prevents "Context is busy" error)
      if (this.isProcessing) {
        console.log('[AI] Context busy - waiting for previous request to complete...');
        return "Please wait, I'm still processing the previous request...";
      }
      
      this.isProcessing = true; // Lock
      
      // 1. Ensure DB and AI are ready
      await databaseService.initialize();
      
      if (!this.isInitialized) {
        const success = await this.init();
        if (!success) return "Brain Missing: Please ask the developer to push the .gguf file via ADB.";
      }

      if (!this.context) throw new Error("AI Context lost");

      // 2. Get RAG Context (Stock Data from SQLite/API)
      const fullPrompt = await ragService.formatPromptForLLM(userPrompt);
      
      console.log(`[AI] Starting LFM2 inference...`);
      const startTime = Date.now();
      
      // 3. Generate Answer using LFM2-1.2B-RAG
      // CONFIGURATION FOR LFM2: Greedy Decoding (temperature=0) as recommended
      const result = await this.context.completion({
        prompt: fullPrompt,
        
        // Output Length: Increased to 1500 for complete financial analysis
        n_predict: 1500, 
        
        // Temperature: 0 for greedy decoding (LFM2 recommendation)
        temperature: 0, 
        
        // Sampling: Focus on deterministic, high-confidence responses
        top_k: 40,
        top_p: 0.95,
        
        // Stop Tokens: ChatML format stop tokens for LFM2
        stop: ['<|im_end|>', '<|endoftext|>'], 
      });

      const duration = Date.now() - startTime;
      console.log(`[AI] Response generated in ${duration}ms`);
      console.log(`[AI] Response preview: ${result.text.substring(0, 100)}...`);

      this.isProcessing = false; // Unlock
      return result.text.trim();

    } catch (error) {
      this.isProcessing = false; // Unlock on error
      console.error('[AI] Error generating response:', error);
      return `I encountered an error accessing the financial database or the AI model.\n\nError: ${error}`;
    }
  },

  /**
   * Generate a concise chat title (3-5 words) based on conversation context
   * Used for chat history similar to ChatGPT/Claude/Gemini
   */
  async generateChatTitle(userMessage: string, aiResponse: string): Promise<string> {
    try {
      if (!this.isInitialized || !this.context) {
        // Fallback to truncated user message if AI not ready
        return userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      }

      // Check if context is busy (prevents "Context is busy" error)
      if (this.isProcessing) {
        console.log('[AI] Context busy - skipping title generation');
        return userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      }

      this.isProcessing = true; // Lock

      // Create a prompt for title generation
      const titlePrompt = `<|startoftext|><|im_start|>system
You are a helpful assistant that creates concise chat titles. Generate a 3-5 word title that summarizes the main topic of this conversation. Return ONLY the title, nothing else.
<|im_end|>
<|im_start|>user
User asked: "${userMessage}"
AI responded about: "${aiResponse.slice(0, 200)}"

Generate a 3-5 word title for this chat:
<|im_end|>
<|im_start|>assistant
`;

      console.log('[AI] Generating chat title...');
      
      const result = await this.context.completion({
        prompt: titlePrompt,
        n_predict: 50, // Short output
        temperature: 0.3, // Slightly creative but focused
        top_k: 40,
        top_p: 0.9,
        stop: ['<|im_end|>', '<|endoftext|>', '\n\n'],
      });

      // Clean up the result
      let title = result.text.trim()
        .replace(/^["']|["']$/g, '') // Remove quotes
        .replace(/\n.*/g, '') // Remove everything after first newline
        .trim();

      // Fallback if title is too long or empty
      if (!title || title.length > 50) {
        title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
      }

      console.log(`[AI] Generated title: "${title}"`);
      this.isProcessing = false; // Unlock
      return title;

    } catch (error) {
      this.isProcessing = false; // Unlock on error
      console.error('[AI] Error generating title:', error);
      return userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
    }
  },

  /**
   * Release memory when leaving the screen
   */
  async release() {
    if (this.context) {
      await this.context.release();
      this.isInitialized = false;
      console.log('AI Released');
    }
  }
};