import { ragService } from './ragService';
import { databaseService } from './databaseService';
import { LlamaContext, initLlama } from 'llama.rn';
import RNFS from 'react-native-fs';

// 1. Setup Model Path
const MODEL_FILENAME = 'llama-3.2-1b-instruct-q4_k_m.gguf';
const MODEL_PATH = `${RNFS.ExternalDirectoryPath}/${MODEL_FILENAME}`;

export const AiService = {
  context: null as LlamaContext | null,
  isInitialized: false,

  /**
   * Initialize the Llama Engine
   * Optimization for Galaxy S10+:
   * - Uses CPU (n_gpu_layers: 0) for maximum stability.
   * - Uses 4 threads to balance speed and battery.
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
      // 1. Ensure DB and AI are ready
      await databaseService.initialize();
      
      if (!this.isInitialized) {
        const success = await this.init();
        if (!success) return "Brain Missing: Please ask the developer to push the .gguf file via ADB.";
      }

      if (!this.context) throw new Error("AI Context lost");

      // 2. Get RAG Context (Stock Data from SQLite/API)
      const fullPrompt = await ragService.formatPromptForLLM(userPrompt);
      
      // 3. Generate Answer using Llama-3.2
      // CONFIGURATION FOR "SMART & PRECISE" OUTPUT
      const result = await this.context.completion({
        prompt: fullPrompt,
        
        // Output Length: Increased to allow full analysis
        n_predict: 800, 
        
        // Strictness: Low temp = Analytical, High temp = Creative/Hallucinating
        temperature: 0.2, 
        
        // Sampling: Focus on high-probability logic
        top_k: 40,
        top_p: 0.95,
        
        // Stop Tokens: Ensure it stops exactly when finished
        stop: ['<|eot_id|>', '<|end_of_text|>'], 
      });

      return result.text.trim();

    } catch (error) {
      console.error('Error generating response:', error);
      return `I encountered an error accessing the financial database or the AI model.\n\nError: ${error}`;
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