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
      
      const data = await response.json();
      console.log('SigiloPay Client Response:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate Pix');
      }
      
      return data;
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
      
      const data = await response.json();
      console.log('SigiloPay Boleto Client Response:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate Boleto');
      }
      
      return data;
    } catch (error: any) {
      console.error('SigiloPay Service Error:', error);
      return { success: false, error: error.message };
    }
  }
};
