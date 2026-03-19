import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 10000, // 10 second timeout to prevent hangs
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface User {
  id: string;
  email: string;
  username: string;
  credits: number;
  created_at: string;
  wallet_address?: string | null;
}

export interface BetOption {
  id: string;
  text: string;
}

export interface Bet {
  id: string;
  title: string;
  description: string;
  options: BetOption[];
  creator_id: string;
  creator_username: string;
  deadline: string;
  status: 'open' | 'pending_result' | 'voting' | 'completed' | 'cancelled';
  winning_option_id: string | null;
  total_pool: number;
  participant_count: number;
  created_at: string;
  house_fee: number;
  group_id?: string | null;
  group_name?: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  creator_id: string;
  creator_username: string;
  members: GroupMember[];
  member_count: number;
  created_at: string;
}

export interface GroupMember {
  user_id: string;
  username: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface Participation {
  id: string;
  bet_id: string;
  user_id: string;
  username: string;
  option_id: string;
  option_text: string;
  amount: number;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Auth APIs
export const register = async (email: string, password: string, username: string): Promise<AuthResponse> => {
  const response = await api.post('/auth/register', { email, password, username });
  return response.data;
};

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const getMe = async (): Promise<User> => {
  const response = await api.get('/auth/me');
  return response.data;
};

// Bet APIs
export const createBet = async (title: string, description: string, options: string[], deadline: string, groupId?: string): Promise<Bet> => {
  const response = await api.post('/bets', { title, description, options, deadline, group_id: groupId || null });
  return response.data;
};

export const getBets = async (status?: string, groupId?: string): Promise<Bet[]> => {
  const params: any = {};
  if (status) params.status = status;
  if (groupId) params.group_id = groupId;
  const response = await api.get('/bets', { params });
  return response.data;
};

export const getMyBets = async (): Promise<Bet[]> => {
  const response = await api.get('/bets/my');
  return response.data;
};

export const getBet = async (betId: string): Promise<Bet> => {
  const response = await api.get(`/bets/${betId}`);
  return response.data;
};

export const participateInBet = async (betId: string, optionId: string, amount: number): Promise<Participation> => {
  const response = await api.post(`/bets/${betId}/participate`, { bet_id: betId, option_id: optionId, amount });
  return response.data;
};

export const getBetParticipations = async (betId: string): Promise<Participation[]> => {
  const response = await api.get(`/bets/${betId}/participations`);
  return response.data;
};

export const declareResult = async (betId: string, winningOptionId: string): Promise<any> => {
  const response = await api.post(`/bets/${betId}/declare-result`, { winning_option_id: winningOptionId });
  return response.data;
};

export const voteOnResult = async (betId: string, approve: boolean): Promise<any> => {
  const response = await api.post(`/bets/${betId}/vote`, { approve });
  return response.data;
};

export const getMyParticipations = async (): Promise<Participation[]> => {
  const response = await api.get('/my/participations');
  return response.data;
};

// Wallet APIs
export const connectWallet = async (walletAddress: string): Promise<any> => {
  const response = await api.post('/wallet/connect', { wallet_address: walletAddress });
  return response.data;
};

export const disconnectWallet = async (): Promise<any> => {
  const response = await api.post('/wallet/disconnect');
  return response.data;
};

export const depositCrypto = async (amount: number, txHash: string): Promise<any> => {
  const response = await api.post('/wallet/deposit', { amount, tx_hash: txHash });
  return response.data;
};

export const withdrawCrypto = async (amount: number, walletAddress: string): Promise<any> => {
  const response = await api.post('/wallet/withdraw', { amount, wallet_address: walletAddress });
  return response.data;
};

export const getTransactions = async (): Promise<any[]> => {
  const response = await api.get('/wallet/transactions');
  return response.data;
};

// Payment APIs (Stripe)
export interface CreditPackage {
  id: string;
  amount: number;
  credits: number;
  label: string;
}

export const getCreditPackages = async (): Promise<CreditPackage[]> => {
  const response = await api.get('/payments/packages');
  return response.data;
};

export const createCheckoutSession = async (packageId: string, originUrl: string): Promise<{ checkout_url: string; session_id: string }> => {
  const response = await api.post('/payments/checkout', { package_id: packageId, origin_url: originUrl });
  return response.data;
};

export const getPaymentStatus = async (sessionId: string): Promise<{ status: string; payment_status: string; credits_added: number }> => {
  const response = await api.get(`/payments/status/${sessionId}`);
  return response.data;
};

// Group APIs
export const createGroup = async (name: string, description: string = ''): Promise<Group> => {
  const response = await api.post('/groups', { name, description });
  return response.data;
};

export const getMyGroups = async (): Promise<Group[]> => {
  const response = await api.get('/groups');
  return response.data;
};

export const getGroup = async (groupId: string): Promise<Group> => {
  const response = await api.get(`/groups/${groupId}`);
  return response.data;
};

export const inviteToGroup = async (groupId: string, username: string): Promise<any> => {
  const response = await api.post(`/groups/${groupId}/invite`, { username });
  return response.data;
};

export const removeFromGroup = async (groupId: string, userId: string): Promise<any> => {
  const response = await api.post(`/groups/${groupId}/remove/${userId}`);
  return response.data;
};

export const leaveGroup = async (groupId: string): Promise<any> => {
  const response = await api.post(`/groups/${groupId}/leave`);
  return response.data;
};

export const deleteGroup = async (groupId: string): Promise<any> => {
  const response = await api.delete(`/groups/${groupId}`);
  return response.data;
};

// Bet Cancel/Withdraw APIs
export interface BetCancelCosts {
  total_pool: number;
  participant_count: number;
  withdraw_cost: number;
  delete_cost: number;
  can_withdraw: boolean;
  can_delete: boolean;
  user_credits: number;
}

export interface BetCancelResponse {
  action?: string;
  requires_confirmation?: boolean;
  cost?: number;
  message?: string;
  success?: boolean;
  cost_paid?: number;
  participants_refunded?: number;
}

export const getBetCancelCosts = async (betId: string): Promise<BetCancelCosts> => {
  const response = await api.get(`/bets/${betId}/cancel-costs`);
  return response.data;
};

export const withdrawBet = async (betId: string, confirm: boolean = false): Promise<BetCancelResponse> => {
  const response = await api.post(`/bets/${betId}/withdraw?confirm=${confirm}`);
  return response.data;
};

export const deleteBetByCreator = async (betId: string, confirm: boolean = false): Promise<BetCancelResponse> => {
  const response = await api.post(`/bets/${betId}/delete-by-creator?confirm=${confirm}`);
  return response.data;
};

// Admin APIs
export const checkAdmin = async (): Promise<{ is_admin: boolean; username: string }> => {
  const response = await api.get('/admin/check');
  return response.data;
};

export const giftCredits = async (username: string, amount: number): Promise<any> => {
  const response = await api.post('/admin/gift-credits', { username, amount });
  return response.data;
};

export const getAllBetsAdmin = async (): Promise<Bet[]> => {
  const response = await api.get('/admin/bets');
  return response.data;
};

export const getAllUsersAdmin = async (): Promise<User[]> => {
  const response = await api.get('/admin/users');
  return response.data;
};

// User Stats & Profile APIs
export interface UserStats {
  bets_created: number;
  bets_participated: number;
  wins: number;
  losses: number;
  pending: number;
  total_won: number;
  win_rate: number;
}

export const getUserStats = async (): Promise<UserStats> => {
  const response = await api.get('/users/stats');
  return response.data;
};

export const updateAvatar = async (avatarBase64: string): Promise<any> => {
  const response = await api.post('/users/avatar', { avatar_base64: avatarBase64 });
  return response.data;
};

export const getAvatar = async (): Promise<{ avatar: string | null }> => {
  const response = await api.get('/users/avatar');
  return response.data;
};

// Odds and Payout APIs
export interface OptionOdds {
  option_id: string;
  option_text: string;
  total_amount: number;
  participant_count: number;
  implied_probability: number;
  multiplier: number;
  is_favorite: boolean;
  is_underdog: boolean;
}

export interface BetOdds {
  bet_id: string;
  total_pool: number;
  house_fee_percent: number;
  pool_after_fee: number;
  options: OptionOdds[];
}

export interface PayoutCalculation {
  bet_id: string;
  option_id: string;
  your_bet: number;
  current_pool: number;
  new_pool_after_your_bet: number;
  current_option_total: number;
  new_option_total: number;
  pool_after_fee: number;
  your_share_percent: number;
  potential_payout: number;
  potential_profit: number;
  multiplier: number;
  new_implied_probability: number;
}

export const getBetOdds = async (betId: string): Promise<BetOdds> => {
  const response = await api.get(`/bets/${betId}/odds`);
  return response.data;
};

export const calculatePayout = async (betId: string, optionId: string, amount: number): Promise<PayoutCalculation> => {
  const response = await api.get(`/bets/${betId}/calculate-payout`, {
    params: { option_id: optionId, amount }
  });
  return response.data;
};

// Delete a bet (only if expired/completed and user is creator)
export const deleteBet = async (betId: string): Promise<void> => {
  await api.delete(`/bets/${betId}`);
};

// Delete a participation record (only if bet is expired/completed)
export const deleteParticipation = async (participationId: string): Promise<void> => {
  await api.delete(`/participations/${participationId}`);
};

export default api;
