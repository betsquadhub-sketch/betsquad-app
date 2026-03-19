import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BETSQUAD_CONTRACT,
  CREDIT_VALUE_EUR,
  getContractBalance,
  getMaticPriceEur,
} from '../services/blockchain';

// Contract ABI for write operations
const CONTRACT_ABI = [
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function getBalance(address user) view returns (uint256)',
];

interface WalletContextType {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress: string | null;
  maticBalance: string;
  credits: number;
  creditsEur: number;
  maticPrice: number;
  
  // Actions
  connectWallet: (address?: string) => Promise<boolean>;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  openMetaMaskDeposit: (maticAmount: string) => Promise<void>;
  openMetaMaskWithdraw: (maticAmount: string) => Promise<void>;
  
  // Utilities
  creditsToMatic: (credits: number) => number;
  maticToCredits: (matic: number) => number;
  formatAddress: (address: string) => string;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const WALLET_STORAGE_KEY = '@betsquad_wallet_v2';
const POLYGON_CHAIN_ID = 137;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [maticBalance, setMaticBalance] = useState('0');
  const [maticPrice, setMaticPrice] = useState(0.45);

  const credits = Math.floor((parseFloat(maticBalance) * maticPrice) / CREDIT_VALUE_EUR);
  const creditsEur = credits * CREDIT_VALUE_EUR;

  // Load saved address on mount
  useEffect(() => {
    loadSavedWallet();
  }, []);

  // Refresh balance when connected
  useEffect(() => {
    if (isConnected && walletAddress) {
      refreshBalance();
      const interval = setInterval(refreshBalance, 20000);
      return () => clearInterval(interval);
    }
  }, [isConnected, walletAddress]);

  const loadSavedWallet = async () => {
    try {
      const savedAddress = await AsyncStorage.getItem(WALLET_STORAGE_KEY);
      if (savedAddress && savedAddress.startsWith('0x')) {
        setWalletAddress(savedAddress);
        setIsConnected(true);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
    }
  };

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const [balance, price] = await Promise.all([
        getContractBalance(walletAddress),
        getMaticPriceEur(),
      ]);
      setMaticBalance(balance);
      setMaticPrice(price);
    } catch (error) {
      console.error('Error refreshing balance:', error);
    }
  }, [walletAddress]);

  const connectWallet = async (address?: string): Promise<boolean> => {
    if (address) {
      // Direct connection with provided address
      if (address.startsWith('0x') && address.length === 42) {
        await AsyncStorage.setItem(WALLET_STORAGE_KEY, address);
        setWalletAddress(address);
        setIsConnected(true);
        refreshBalance();
        return true;
      }
      return false;
    }
    return false;
  };

  const disconnectWallet = async () => {
    try {
      await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
      setWalletAddress(null);
      setIsConnected(false);
      setMaticBalance('0');
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  const openMetaMaskDeposit = async (maticAmount: string): Promise<void> => {
    // Create MetaMask deep link for deposit
    const weiAmount = ethers.utils.parseEther(maticAmount);
    const weiHex = weiAmount.toHexString();
    
    // MetaMask deep link format for sending to contract
    const metamaskLink = `https://metamask.app.link/send/${BETSQUAD_CONTRACT}@${POLYGON_CHAIN_ID}?value=${weiHex}`;
    
    try {
      await Linking.openURL(metamaskLink);
    } catch (error) {
      // Fallback: show contract address
      Alert.alert(
        'Deposita MATIC',
        `Invia ${maticAmount} MATIC a:\n\n${BETSQUAD_CONTRACT}\n\nRete: Polygon`,
        [{ text: 'OK' }]
      );
    }
  };

  const openMetaMaskWithdraw = async (maticAmount: string): Promise<void> => {
    // Encode withdraw function call
    const iface = new ethers.utils.Interface(CONTRACT_ABI);
    const weiAmount = ethers.utils.parseEther(maticAmount);
    const data = iface.encodeFunctionData('withdraw', [weiAmount]);
    
    // MetaMask deep link for contract interaction
    const metamaskLink = `https://metamask.app.link/send/${BETSQUAD_CONTRACT}@${POLYGON_CHAIN_ID}?data=${data}`;
    
    try {
      await Linking.openURL(metamaskLink);
    } catch (error) {
      Alert.alert('Errore', 'Installa MetaMask per prelevare');
    }
  };

  const creditsToMatic = (creds: number): number => {
    return (creds * CREDIT_VALUE_EUR) / maticPrice;
  };

  const maticToCredits = (matic: number): number => {
    return Math.floor((matic * maticPrice) / CREDIT_VALUE_EUR);
  };

  const formatAddress = (address: string): string => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <WalletContext.Provider value={{
      isConnected,
      isConnecting,
      walletAddress,
      maticBalance,
      credits,
      creditsEur,
      maticPrice,
      connectWallet,
      disconnectWallet,
      refreshBalance,
      openMetaMaskDeposit,
      openMetaMaskWithdraw,
      creditsToMatic,
      maticToCredits,
      formatAddress,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
