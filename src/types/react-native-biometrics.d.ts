declare module 'react-native-biometrics' {
  export interface IsSensorAvailableResult {
    available: boolean;
    biometryType?: 'TouchID' | 'FaceID' | 'Biometrics';
    error?: string;
  }

  export interface SimplePromptResult {
    success: boolean;
    error?: string;
  }

  export interface CreateSignatureResult {
    success: boolean;
    signature?: string;
    error?: string;
  }

  export interface BiometricOptions {
    allowDeviceCredentials?: boolean;
  }

  export default class ReactNativeBiometrics {
    constructor(options?: BiometricOptions);
    
    isSensorAvailable(): Promise<IsSensorAvailableResult>;
    
    simplePrompt(options: {
      promptMessage: string;
      cancelButtonText?: string;
    }): Promise<SimplePromptResult>;
    
    createKeys(): Promise<{ publicKey: string }>;
    
    biometricKeysExist(): Promise<{ keysExist: boolean }>;
    
    deleteKeys(): Promise<{ keysDeleted: boolean }>;
    
    createSignature(options: {
      promptMessage: string;
      payload: string;
      cancelButtonText?: string;
    }): Promise<CreateSignatureResult>;
  }
}
