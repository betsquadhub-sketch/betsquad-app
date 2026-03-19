import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Alert, Platform, Linking } from 'react-native';
import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BETSQUAD_CONTRACT,
  CREDIT_VALUE_EUR,
  maticToCredits,
  creditsToMatic as creditsToMaticFn,
  formatAddress,
} from '../services/blockchain';
import { getCachedBalance, getCachedMaticPrice, invalidateBalanceCache } from '../services/blockchainCache';

// WalletConnect imports - only for native
import '@walletconnect/react-native-compat';
import { WalletConnectModal, useWalletConnectModal } from '@walletconnect/modal-react-native';

// Constants
const POLYGON_CHAIN_ID = 137;
// Multiple RPC endpoints for reliability
const POLYGON_RPCS = [
  'https://polygon-mainnet.g.alchemy.com/v2/demo',
  'https://rpc.ankr.com/polygon',
  'https://polygon.llamarpc.com',
  'https://polygon-rpc.com',
];
const POLYGON_RPC = POLYGON_RPCS[0];
const WALLET_STORAGE_KEY = '@betsquad_wallet_v4';

// Your WalletConnect Project ID
export const WALLETCONNECT_PROJECT_ID = '813c4fcc55b79750c16e73da3af14505';

// Provider metadata
const providerMetadata = {
  name: 'BetSquad',
  description: 'Social betting app on Polygon',
  url: 'https://betsquad.app',
  icons: ['https://betsquad.app/icon.png'],
  redirect: {
    native: 'betsquad://',
    universal: 'https://betsquad.app/wc',
  },
};

// Session params for Polygon
const sessionParams = {
  namespaces: {
    eip155: {
      methods: [
        'eth_sendTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
      ],
      chains: [`eip155:${POLYGON_CHAIN_ID}`],
      events: ['chainChanged', 'accountsChanged'],
      rpcMap: {
        [POLYGON_CHAIN_ID]: POLYGON_RPC,
      },
    },
  },
};

interface WalletConnectContextType {
  isConnected: boolean;
  isConnecting: boolean;
  walletAddress: string | null;
  maticBalance: string;
  credits: number;
  creditsEur: number;
  maticPrice: number;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  sendTransaction: (to: string, data: string, value?: string) => Promise<string>;
  signAndSendContractTx: (method: string, args: any[], value?: string) => Promise<ethers.ContractTransaction | null>;
  creditsToMatic: (credits: number) => number;
  maticToCreditsUtil: (matic: number) => number;
  formatAddressUtil: (address: string) => string;
}

const WalletConnectContext = createContext<WalletConnectContextType | undefined>(undefined);

// Inner provider that uses WalletConnect hook
function WalletConnectInnerProvider({ children }: { children: ReactNode }) {
  const { open, isConnected: wcConnected, address: wcAddress, provider } = useWalletConnectModal();
  
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [maticBalance, setMaticBalance] = useState('0');
  const [maticPrice, setMaticPrice] = useState(0.45);

  const isConnected = !!walletAddress && wcConnected;
  const credits = maticToCredits(parseFloat(maticBalance), maticPrice);
  const creditsEur = credits * CREDIT_VALUE_EUR;

  // Sync WalletConnect state
  useEffect(() => {
    if (wcConnected && wcAddress) {
      console.log('WalletConnect connected:', wcAddress);
      setWalletAddress(wcAddress);
      AsyncStorage.setItem(WALLET_STORAGE_KEY, wcAddress);
    } else if (!wcConnected) {
      setWalletAddress(null);
    }
  }, [wcConnected, wcAddress]);

  // Refresh balance when connected
  useEffect(() => {
    if (isConnected && walletAddress) {
      refreshBalance(false); // Use cache initially
      const interval = setInterval(() => refreshBalance(false), 30000); // Refresh every 30s with cache
      return () => clearInterval(interval);
    }
  }, [isConnected, walletAddress]);

  const refreshBalance = useCallback(async (forceRefresh = true) => {
    if (!walletAddress) return;
    try {
      // Use cached values for faster loading
      const [balance, price] = await Promise.all([
        getCachedBalance(walletAddress, forceRefresh),
        getCachedMaticPrice(forceRefresh),
      ]);
      setMaticBalance(balance);
      setMaticPrice(price);
    } catch (error) {
      console.error('Error refreshing balance:', error);
    }
  }, [walletAddress]);

  const connectWallet = async () => {
    try {
      setIsConnecting(true);
      console.log('Opening WalletConnect modal...');
      await open();
    } catch (error) {
      console.error('Error connecting wallet:', error);
      Alert.alert('Errore', 'Impossibile connettersi al wallet. Assicurati di avere MetaMask o Trust Wallet installato.');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      if (provider) {
        await provider.disconnect();
      }
      await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
      setWalletAddress(null);
      setMaticBalance('0');
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  // Send raw transaction via WalletConnect
  const sendTransaction = async (to: string, data: string, value?: string): Promise<string> => {
    if (!provider || !walletAddress) {
      throw new Error('Wallet non connesso');
    }

    try {
      // First, ensure we're on Polygon network
      const chainIdHex = `0x${POLYGON_CHAIN_ID.toString(16)}`; // 0x89 for Polygon
      
      try {
        // Try to switch to Polygon
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError: any) {
        // If Polygon is not added, add it
        if (switchError.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainIdHex,
              chainName: 'Polygon Mainnet',
              nativeCurrency: {
                name: 'MATIC',
                symbol: 'MATIC',
                decimals: 18,
              },
              rpcUrls: [POLYGON_RPC],
              blockExplorerUrls: ['https://polygonscan.com/'],
            }],
          });
        }
      }

      const tx = {
        from: walletAddress,
        to,
        data,
        value: value ? `0x${BigInt(value).toString(16)}` : '0x0',
        chainId: chainIdHex,
      };

      console.log('Sending transaction on Polygon:', tx);
      
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [tx],
      });

      console.log('Transaction hash:', txHash);
      return txHash as string;
    } catch (error: any) {
      console.error('Transaction error:', error);
      throw error;
    }
  };

  // Sign and send contract transaction
  const signAndSendContractTx = async (
    method: string,
    args: any[],
    value?: string
  ): Promise<ethers.ContractTransaction | null> => {
    if (!provider || !walletAddress) {
      Alert.alert('Errore', 'Wallet non connesso. Vai al Wallet e connettiti.');
      return null;
    }

    try {
      // Create contract interface to encode function call
      const iface = new ethers.utils.Interface([
        'function deposit() payable',
        'function withdraw(uint256 amount)',
        'function createBet(string title, string optionA, string optionB, uint256 deadline) returns (uint256)',
        'function placeBet(uint256 betId, uint8 option, uint256 amount)',
        'function resolveBet(uint256 betId, uint8 winner)',
        'function claim(uint256 betId)',
      ]);

      const data = iface.encodeFunctionData(method, args);
      console.log(`Calling ${method} with args:`, args);
      
      const txHash = await sendTransaction(BETSQUAD_CONTRACT, data, value);

      // Return immediately after tx is sent - don't wait for confirmation
      // This prevents the loading spinner from hanging
      const result = {
        hash: txHash,
        wait: async () => {
          // Try to wait for confirmation in background, but don't block
          try {
            for (const rpc of POLYGON_RPCS) {
              try {
                const rpcProvider = new ethers.providers.JsonRpcProvider(rpc);
                const receipt = await rpcProvider.waitForTransaction(txHash, 1, 30000);
                if (receipt) return receipt;
              } catch {
                continue;
              }
            }
          } catch {
            // Ignore errors - tx was already sent
          }
          return null;
        },
      } as unknown as ethers.ContractTransaction;

      // Refresh balance in background after a delay
      setTimeout(() => {
        refreshBalance();
      }, 5000);

      return result;
    } catch (error: any) {
      console.error('Contract transaction error:', error);
      if (error.message?.includes('User rejected')) {
        Alert.alert('Annullato', 'Hai rifiutato la transazione nel wallet.');
      } else {
        throw error;
      }
      return null;
    }
  };

  const creditsToMaticUtil = (creds: number): number => {
    return creditsToMaticFn(creds, maticPrice);
  };

  const maticToCreditsUtil = (matic: number): number => {
    return maticToCredits(matic, maticPrice);
  };

  return (
    <WalletConnectContext.Provider
      value={{
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
        sendTransaction,
        signAndSendContractTx,
        creditsToMatic: creditsToMaticUtil,
        maticToCreditsUtil,
        formatAddressUtil: formatAddress,
      }}
    >
      {children}
    </WalletConnectContext.Provider>
  );
}

// Main provider with WalletConnect Modal
export function WalletConnectProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <WalletConnectInnerProvider>
        {children}
      </WalletConnectInnerProvider>
      <WalletConnectModal
        projectId={WALLETCONNECT_PROJECT_ID}
        providerMetadata={providerMetadata}
        sessionParams={sessionParams}
      />
    </>
  );
}

export function useWalletConnect() {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error('useWalletConnect must be used within a WalletConnectProvider');
  }
  return context;
}
