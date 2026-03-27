export interface UserProfile {
  uid: string;
  fullName: string;
  motherName: string;
  cpf: string;
  birthDate: string;
  email: string;
  phone: string;
  address: {
    cep: string;
    street: string;
    number: string;
    reference?: string;
  };
  document: {
    type: 'RG' | 'CNH' | 'Passaporte';
    frontUrl: string;
    backUrl: string;
  };
  balance: number;
  monthlyRevenue?: number;
  role: 'user' | 'admin';
  password?: string;
  pin?: string;
  facialVerificationUrl?: string;
  revenueAnalysisStartedAt?: string;
  creditCardRequest?: {
    status: 'pending' | 'approved' | 'rejected';
    amount: number;
    timestamp: string;
  };
  createdAt: string;
}

export interface LoanProposal {
  id?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  type?: 'personal' | 'vehicle' | 'deposit';
  monthlyRevenue?: number;
  requestedAmount?: number;
  approvedAmount: number;
  installments: number;
  interestRate?: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'completed' | 'refused';
  refusalReason?: string;
  paidInstallments?: number;
  vehicleDetails?: {
    brand: string;
    model: string;
    year: string;
    estimatedValue: number;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface FacialVerification {
  id?: string;
  userId: string;
  videoUrl: string;
  status: string;
  timestamp: string;
}

export interface RevenueRequest {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  revenue: number;
  status: 'pending' | 'approved' | 'rejected' | 'waiting_proof';
  timestamp: string;
  approvalReason?: string;
  approvedBy?: string;
  proofMessage?: string;
  proofRequired?: boolean;
  proofUrl?: string;
  proofUrls?: string[];
  autoApprovalTimeOverride?: number;
}

export interface AppConfig {
  facialVerificationEnabled: boolean;
  banners: string[];
  creditBannerUrl: string;
  revenueAnalysisTime?: number;
  autoReleaseTime?: number;
  scoreIconUrl?: string;
  storyImages?: string[];
  storyLogo?: string;
  platformFee?: number;
  whatsappNumber?: string;
}
