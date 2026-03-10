/**
 * Simulated SigiloPay Service
 * In a real application, this would make API calls to SigiloPay.
 */

export interface SigiloPayResponse {
  success: boolean;
  pixCode?: string;
  pixQrCode?: string;
  barcode?: string;
  paymentLink?: string;
  error?: string;
}

export const sigiloPayService = {
  generatePix: async (amount: number, description: string): Promise<SigiloPayResponse> => {
    try {
      const response = await fetch('/api/sigilopay/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: 'pix', description })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate Pix');
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('SigiloPay Service Error:', error);
      return { success: false, error: error.message };
    }
  },

  generateBoleto: async (amount: number, description: string): Promise<SigiloPayResponse> => {
    try {
      const response = await fetch('/api/sigilopay/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method: 'boleto', description })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate Boleto');
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('SigiloPay Service Error:', error);
      return { success: false, error: error.message };
    }
  }
};
