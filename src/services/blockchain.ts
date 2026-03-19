import { ethers } from 'ethers';
import { Alert } from 'react-native';

// Contract address on Polygon Mainnet
export const BETSQUAD_CONTRACT = '0x4a01c0964456488487f9dE593236958Fc7475bce';

// Polygon Mainnet RPC
const POLYGON_RPC = 'https://1rpc.io/matic';

// COSTANTE: 1 credito = €0.01
export const CREDIT_VALUE_EUR = 0.01;

// Full Contract ABI
const CONTRACT_ABI = [
  // View functions
  'function owner() view returns (address)',
  'function commissionRate() view returns (uint256)',
  'function totalCommissions() view returns (uint256)',
  'function betCount() view returns (uint256)',
  'function balances(address) view returns (uint256)',
  'function getBet(uint256 betId) view returns (address creator, string title, string optionA, string optionB, uint256 deadline, uint256 poolA, uint256 poolB, uint8 winner, bool resolved)',
  'function getUserBets(uint256 betId, address user) view returns (uint256 onA, uint256 onB)',
  'function calculatePotentialPayout(uint256 betId, uint8 option, uint256 amount) view returns (uint256)',
  'function getBalance(address user) view returns (uint256)',
  'function hasClaimed(uint256, address) view returns (bool)',
  
  // Write functions
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function createBet(string title, string optionA, string optionB, uint256 deadline) returns (uint256)',
  'function placeBet(uint256 betId, uint8 option, uint256 amount)',
  'function resolveBet(uint256 betId, uint8 winner)',
  'function claim(uint256 betId)',
  'function withdrawCommissions()',
  'function giftCredits(address user) payable',
  'function setCommissionRate(uint256 newRate)',
  
  // Events
  'event Deposited(address indexed user, uint256 amount)',
  'event Withdrawn(address indexed user, uint256 amount)',
  'event BetCreated(uint256 indexed betId, string title, uint256 deadline)',
  'event BetPlaced(uint256 indexed betId, address indexed user, uint8 option, uint256 amount)',
  'event BetResolved(uint256 indexed betId, uint8 winner)',
  'event WinningsClaimed(uint256 indexed betId, address indexed user, uint256 amount)',
  'event CommissionsWithdrawn(uint256 amount)',
];

// Provider (read-only)
const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);

// Contract instance (read-only)
const readContract = new ethers.Contract(BETSQUAD_CONTRACT, CONTRACT_ABI, provider);

// ============ TYPES ============

export interface BetData {
  id: number;
  creator: string;
  title: string;
  optionA: string;
  optionB: string;
  deadline: Date;
  poolA: string;
  poolB: string;
  winner: number;
  resolved: boolean;
}

export interface UserBets {
  onA: string;
  onB: string;
}

// ============ READ FUNCTIONS ============

/**
 * Get MATIC price in EUR from CoinGecko
 */
export async function getMaticPriceEur(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=eur'
    );
    const data = await response.json();
    return data['matic-network']?.eur || 0.45;
  } catch (error) {
    console.error('Error getting MATIC price:', error);
    return 0.45; // Fallback
  }
}

/**
 * Get user balance in contract (in MATIC)
 */
export async function getContractBalance(address: string): Promise<string> {
  try {
    const balance = await readContract.getBalance(address);
    return ethers.utils.formatEther(balance);
  } catch (error) {
    console.error('Error getting balance:', error);
    return '0';
  }
}

/**
 * Get contract TVL
 */
export async function getContractTVL(): Promise<string> {
  try {
    const balance = await provider.getBalance(BETSQUAD_CONTRACT);
    return ethers.utils.formatEther(balance);
  } catch (error) {
    console.error('Error getting TVL:', error);
    return '0';
  }
}

/**
 * Get total number of bets
 */
export async function getBetCount(): Promise<number> {
  try {
    const count = await readContract.betCount();
    return count.toNumber();
  } catch (error) {
    console.error('Error getting bet count:', error);
    return 0;
  }
}

/**
 * Get bet details by ID
 */
export async function getBetById(betId: number): Promise<BetData | null> {
  try {
    const bet = await readContract.getBet(betId);
    return {
      id: betId,
      creator: bet.creator,
      title: bet.title,
      optionA: bet.optionA,
      optionB: bet.optionB,
      deadline: new Date(bet.deadline.toNumber() * 1000),
      poolA: ethers.utils.formatEther(bet.poolA),
      poolB: ethers.utils.formatEther(bet.poolB),
      winner: bet.winner,
      resolved: bet.resolved,
    };
  } catch (error) {
    console.error('Error getting bet:', error);
    return null;
  }
}

/**
 * Get all bets (paginated)
 */
export async function getAllBets(fromId: number = 1, toId?: number): Promise<BetData[]> {
  try {
    const count = await getBetCount();
    const endId = toId || count;
    const bets: BetData[] = [];
    
    for (let i = fromId; i <= endId; i++) {
      const bet = await getBetById(i);
      if (bet && bet.creator !== ethers.constants.AddressZero) {
        bets.push(bet);
      }
    }
    
    return bets;
  } catch (error) {
    console.error('Error getting all bets:', error);
    return [];
  }
}

/**
 * Get open bets (not resolved)
 */
export async function getOpenBets(): Promise<BetData[]> {
  const allBets = await getAllBets();
  return allBets.filter(bet => !bet.resolved && bet.deadline > new Date());
}

/**
 * Get user's bets on a specific bet
 */
export async function getUserBetsOnBet(betId: number, userAddress: string): Promise<UserBets> {
  try {
    const [onA, onB] = await readContract.getUserBets(betId, userAddress);
    return {
      onA: ethers.utils.formatEther(onA),
      onB: ethers.utils.formatEther(onB),
    };
  } catch (error) {
    console.error('Error getting user bets:', error);
    return { onA: '0', onB: '0' };
  }
}

/**
 * Calculate potential payout
 */
export async function calculatePayout(betId: number, option: number, amountMatic: string): Promise<string> {
  try {
    const amountWei = ethers.utils.parseEther(amountMatic);
    const payout = await readContract.calculatePotentialPayout(betId, option, amountWei);
    return ethers.utils.formatEther(payout);
  } catch (error) {
    console.error('Error calculating payout:', error);
    return '0';
  }
}

/**
 * Check if user has claimed winnings
 */
export async function hasUserClaimed(betId: number, userAddress: string): Promise<boolean> {
  try {
    return await readContract.hasClaimed(betId, userAddress);
  } catch (error) {
    console.error('Error checking claim status:', error);
    return false;
  }
}

/**
 * Get contract owner
 */
export async function getContractOwner(): Promise<string> {
  try {
    return await readContract.owner();
  } catch (error) {
    console.error('Error getting owner:', error);
    return '';
  }
}

/**
 * Get total commissions accumulated
 */
export async function getTotalCommissions(): Promise<string> {
  try {
    const commissions = await readContract.totalCommissions();
    return ethers.utils.formatEther(commissions);
  } catch (error) {
    console.error('Error getting commissions:', error);
    return '0';
  }
}

// ============ WRITE FUNCTIONS (require signer) ============

/**
 * Create a signer from private key (for backend/admin operations)
 */
export function createSigner(privateKey: string): ethers.Wallet {
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Get contract with signer for write operations
 */
export function getWriteContract(signer: ethers.Signer): ethers.Contract {
  return new ethers.Contract(BETSQUAD_CONTRACT, CONTRACT_ABI, signer);
}

/**
 * Deposit MATIC to contract
 */
export async function deposit(signer: ethers.Signer, amountMatic: string): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  const amountWei = ethers.utils.parseEther(amountMatic);
  return await contract.deposit({ value: amountWei });
}

/**
 * Withdraw MATIC from contract
 */
export async function withdraw(signer: ethers.Signer, amountMatic: string): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  const amountWei = ethers.utils.parseEther(amountMatic);
  return await contract.withdraw(amountWei);
}

/**
 * Create a new bet
 */
export async function createBet(
  signer: ethers.Signer,
  title: string,
  optionA: string,
  optionB: string,
  deadlineTimestamp: number
): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  return await contract.createBet(title, optionA, optionB, deadlineTimestamp);
}

/**
 * Place a bet
 */
export async function placeBet(
  signer: ethers.Signer,
  betId: number,
  option: number, // 1 or 2
  amountMatic: string
): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  const amountWei = ethers.utils.parseEther(amountMatic);
  return await contract.placeBet(betId, option, amountWei);
}

/**
 * Resolve a bet (creator or owner only)
 */
export async function resolveBet(
  signer: ethers.Signer,
  betId: number,
  winner: number // 1=A wins, 2=B wins, 3=cancelled
): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  return await contract.resolveBet(betId, winner);
}

/**
 * Claim winnings
 */
export async function claimWinnings(signer: ethers.Signer, betId: number): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  return await contract.claim(betId);
}

/**
 * Withdraw commissions (owner only)
 */
export async function withdrawCommissions(signer: ethers.Signer): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  return await contract.withdrawCommissions();
}

/**
 * Gift credits to user (owner only)
 */
export async function giftCredits(
  signer: ethers.Signer,
  userAddress: string,
  amountMatic: string
): Promise<ethers.ContractTransaction> {
  const contract = getWriteContract(signer);
  const amountWei = ethers.utils.parseEther(amountMatic);
  return await contract.giftCredits(userAddress, { value: amountWei });
}

// ============ UTILITY FUNCTIONS ============

/**
 * Convert MATIC to credits (based on current price)
 */
export function maticToCredits(maticAmount: number, maticPriceEur: number): number {
  const eurValue = maticAmount * maticPriceEur;
  return Math.floor(eurValue / CREDIT_VALUE_EUR);
}

/**
 * Convert credits to MATIC (based on current price)
 */
export function creditsToMatic(credits: number, maticPriceEur: number): number {
  const eurValue = credits * CREDIT_VALUE_EUR;
  return eurValue / maticPriceEur;
}

/**
 * Format address for display
 */
export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format MATIC amount
 */
export function formatMatic(amount: string, decimals: number = 4): string {
  return parseFloat(amount).toFixed(decimals);
}

/**
 * Check if address is valid
 */
export function isValidAddress(address: string): boolean {
  try {
    ethers.utils.getAddress(address);
    return true;
  } catch {
    return false;
  }
}
