import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Alert } from 'react-native';
import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BETSQUAD_CONTRACT,
  CREDIT_VALUE_EUR,
  getContractBalance,
  getMaticPriceEur,
  maticToCredits,
  creditsToMatic,
  formatAddress,
} from '../services/blockchain';

interface BlockchainContextType {
  // Wallet state
  walletAddress: string | null;
  privateKey: string | null;
  isConnected: boolean;
  isLoading: boolean;
  
  // Balance state
  maticBalance: string;
  credits: number;
  creditsEur: number;
  maticPrice: number;
  
  // Actions
  connectWallet: (privateKey: string) => Promise<boolean>;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  
  // Utility
  formatAddress: (address: string) => string;
  maticToCredits: (matic: number) => number;
  creditsToMatic: (credits: number) => number;
  
  // Signer for transactions
  getSigner: () => ethers.Wallet | null;
}

const BlockchainContext = createContext<BlockchainContextType | undefined>(undefined);

const WALLET_STORAGE_KEY = '@betsquad_wallet';

export function BlockchainProvider({ children }: { children: ReactNode }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [maticBalance, setMaticBalance] = useState('0');
  const [maticPrice, setMaticPrice] = useState(0.45);
  
  const isConnected = !!walletAddress;
  const credits = maticToCredits(parseFloat(maticBalance), maticPrice);
  const creditsEur = credits * CREDIT_VALUE_EUR;

  // Load saved wallet on mount
  useEffect(() => {
    loadSavedWallet();
  }, []);

  // Refresh balance periodically when connected
  useEffect(() => {
    if (isConnected) {
      refreshBalance();
      const interval = setInterval(refreshBalance, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isConnected, walletAddress]);

  const loadSavedWallet = async () => {
    try {
      const saved = await AsyncStorage.getItem(WALLET_STORAGE_KEY);
      if (saved) {
        const { address, key } = JSON.parse(saved);
        setWalletAddress(address);
        setPrivateKey(key);
      }
    } catch (error) {
      console.error('Error loading wallet:', error);
    } finally {
      setIsLoading(false);
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

  const connectWallet = async (key: string): Promise<boolean> => {
    try {
      // Validate private key
      const wallet = new ethers.Wallet(key);
      const address = wallet.address;
      
      // Save to storage
      await AsyncStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({
        address,
        key,
      }));
      
      setWalletAddress(address);
      setPrivateKey(key);
      
      // Refresh balance
      await refreshBalance();
      
      return true;
    } catch (error) {
      console.error('Error connecting wallet:', error);
      Alert.alert('Errore', 'Chiave privata non valida');
      return false;
    }
  };

  const disconnectWallet = async () => {
    try {
      await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
      setWalletAddress(null);
      setPrivateKey(null);
      setMaticBalance('0');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  };

  const getSigner = (): ethers.Wallet | null => {
    if (!privateKey) return null;
    const provider = new ethers.providers.JsonRpcProvider('https://1rpc.io/matic');
    return new ethers.Wallet(privateKey, provider);
  };

  const value: BlockchainContextType = {
    walletAddress,
    privateKey,
    isConnected,
    isLoading,
    maticBalance,
    credits,
    creditsEur,
    maticPrice,
    connectWallet,
    disconnectWallet,
    refreshBalance,
    formatAddress,
    maticToCredits: (matic: number) => maticToCredits(matic, maticPrice),
    creditsToMatic: (creds: number) => creditsToMatic(creds, maticPrice),
    getSigner,
  };

  return (
    <BlockchainContext.Provider value={value}>
      {children}
    </BlockchainContext.Provider>
  );
}

export function useBlockchain() {
  const context = useContext(BlockchainContext);
  if (context === undefined) {
    throw new Error('useBlockchain must be used within a BlockchainProvider');
  }
  return context;
}
