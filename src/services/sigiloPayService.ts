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
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock successful response
    return {
      success: true,
      pixCode: `00020126580014BR.GOV.BCB.PIX0136${Math.random().toString(36).substring(2, 15)}520400005303986540${amount.toFixed(2)}5802BR5913EMPIRECRED6009SAOPAULO62070503***6304${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`,
      pixQrCode: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=sigilopay_mock_pix',
      paymentLink: 'https://sigilopay.com.br/pay/mock_id'
    };
  },

  generateBoleto: async (amount: number, description: string): Promise<SigiloPayResponse> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock successful response
    return {
      success: true,
      barcode: `34191.79001 01043.510047 91020.150008 1 ${Math.floor(Math.random() * 9999999999).toString().padStart(10, '0')}`,
      paymentLink: 'https://sigilopay.com.br/boleto/mock_id'
    };
  }
};
