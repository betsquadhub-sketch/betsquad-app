import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { useWalletConnect } from '../../src/contexts/WalletConnectContext';
import {
  BETSQUAD_CONTRACT,
  CREDIT_VALUE_EUR,
  getContractTVL,
} from '../../src/services/blockchain';
import * as Clipboard from 'expo-clipboard';
import { ethers } from 'ethers';

export default function Wallet() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const {
    walletAddress,
    isConnected,
    isConnecting,
    maticBalance,
    credits,
    creditsEur,
    maticPrice,
    connectWallet,
    disconnectWallet,
    refreshBalance,
    formatAddressUtil,
    creditsToMatic,
    signAndSendContractTx,
  } = useWalletConnect();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tvl, setTvl] = useState('0');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositCredits, setDepositCredits] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawCredits, setWithdrawCredits] = useState('');

  useEffect(() => {
    loadTVL();
  }, []);

  const loadTVL = async () => {
    const totalLocked = await getContractTVL();
    setTvl(totalLocked);
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshBalance(), loadTVL()]);
    setIsRefreshing(false);
  };

  const handleConnect = async () => {
    await connectWallet();
  };

  const handleDisconnect = () => {
    Alert.alert(
      language === 'it' ? 'Disconnetti Wallet' : 'Disconnect Wallet',
      language === 'it' ? 'Sei sicuro?' : 'Are you sure?',
      [
        { text: language === 'it' ? 'Annulla' : 'Cancel', style: 'cancel' },
        {
          text: language === 'it' ? 'Disconnetti' : 'Disconnect',
          style: 'destructive',
          onPress: disconnectWallet,
        },
      ]
    );
  };

  const handleDeposit = async () => {
    const creditsNum = parseInt(depositCredits);
    if (isNaN(creditsNum) || creditsNum <= 0) {
      Alert.alert('Errore', language === 'it' ? 'Inserisci un importo valido' : 'Enter a valid amount');
      return;
    }

    const maticAmount = creditsToMatic(creditsNum);
    const maticWei = ethers.utils.parseEther(maticAmount.toFixed(18));

    setIsProcessing(true);
    try {
      const tx = await signAndSendContractTx('deposit', [], maticWei.toString());
      if (tx) {
        Alert.alert(
          language === 'it' ? 'Transazione Inviata!' : 'Transaction Sent!',
          `TX: ${tx.hash.slice(0, 20)}...`,
          [
            {
              text: 'Polygonscan',
              onPress: () => Linking.openURL(`https://polygonscan.com/tx/${tx.hash}`),
            },
            { text: 'OK' },
          ]
        );
        setShowDepositModal(false);
        setDepositCredits('');
        
        // Wait for confirmation
        await tx.wait();
        refreshBalance();
        Alert.alert(
          language === 'it' ? 'Deposito Confermato!' : 'Deposit Confirmed!',
          `+${creditsNum} ${language === 'it' ? 'crediti' : 'credits'}`
        );
      }
    } catch (error: any) {
      console.error('Deposit error:', error);
      Alert.alert('Errore', error.message || 'Deposito fallito');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    const creditsNum = parseInt(withdrawCredits);
    if (isNaN(creditsNum) || creditsNum <= 0) {
      Alert.alert('Errore', language === 'it' ? 'Inserisci un importo valido' : 'Enter a valid amount');
      return;
    }

    if (creditsNum > credits) {
      Alert.alert('Errore', language === 'it' ? 'Saldo insufficiente' : 'Insufficient balance');
      return;
    }

    const maticAmount = creditsToMatic(creditsNum);
    const maticWei = ethers.utils.parseEther(maticAmount.toFixed(18));

    setIsProcessing(true);
    try {
      const tx = await signAndSendContractTx('withdraw', [maticWei]);
      if (tx) {
        Alert.alert(
          language === 'it' ? 'Transazione Inviata!' : 'Transaction Sent!',
          `TX: ${tx.hash.slice(0, 20)}...`
        );
        setShowWithdrawModal(false);
        setWithdrawCredits('');
        
        await tx.wait();
        refreshBalance();
        Alert.alert(
          language === 'it' ? 'Prelievo Confermato!' : 'Withdrawal Confirmed!',
          `-${creditsNum} ${language === 'it' ? 'crediti' : 'credits'}`
        );
      }
    } catch (error: any) {
      console.error('Withdraw error:', error);
      Alert.alert('Errore', error.message || 'Prelievo fallito');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyAddress = async () => {
    if (walletAddress) {
      await Clipboard.setStringAsync(walletAddress);
      Alert.alert(language === 'it' ? 'Copiato!' : 'Copied!');
    }
  };

  const tvlCredits = Math.floor((parseFloat(tvl) * maticPrice) / CREDIT_VALUE_EUR);
  const maticPer100Credits = CREDIT_VALUE_EUR * 100 / maticPrice;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8247e5" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Wallet</Text>
          <Text style={styles.headerSubtitle}>
            {language === 'it' ? '100% On-Chain su Polygon' : '100% On-Chain on Polygon'}
          </Text>
        </View>

        {/* Not Connected State */}
        {!isConnected ? (
          <View style={styles.notConnectedCard}>
            <View style={styles.notConnectedIcon}>
              <Ionicons name="wallet-outline" size={64} color="#8247e5" />
            </View>
            <Text style={styles.notConnectedTitle}>
              {language === 'it' ? 'Connetti il tuo Wallet' : 'Connect your Wallet'}
            </Text>
            <Text style={styles.notConnectedDesc}>
              {language === 'it' 
                ? 'Connetti MetaMask, Trust Wallet o un altro wallet compatibile per iniziare a scommettere.'
                : 'Connect MetaMask, Trust Wallet or another compatible wallet to start betting.'}
            </Text>
            <TouchableOpacity
              style={styles.connectButton}
              onPress={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="link" size={20} color="#fff" />
                  <Text style={styles.connectButtonText}>
                    {language === 'it' ? 'Connetti Wallet' : 'Connect Wallet'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            
            <View style={styles.securityNote}>
              <Ionicons name="shield-checkmark" size={16} color="#10b981" />
              <Text style={styles.securityNoteText}>
                {language === 'it' 
                  ? 'Connessione sicura tramite WalletConnect'
                  : 'Secure connection via WalletConnect'}
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* Connected Wallet Card */}
            <View style={styles.walletCard}>
              <View style={styles.walletHeader}>
                <View style={styles.walletIcon}>
                  <Ionicons name="wallet" size={24} color="#10b981" />
                </View>
                <View style={styles.walletInfo}>
                  <Text style={styles.walletLabel}>
                    {language === 'it' ? 'Wallet Connesso' : 'Connected Wallet'}
                  </Text>
                  <TouchableOpacity onPress={copyAddress}>
                    <Text style={styles.walletAddressText}>
                      {formatAddressUtil(walletAddress || '')} 
                      <Ionicons name="copy-outline" size={14} color="#6b7280" />
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
                  <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Balance Card */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>
                {language === 'it' ? 'Il tuo Saldo' : 'Your Balance'}
              </Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceValue}>{credits.toLocaleString()}</Text>
                <Text style={styles.balanceCurrency}>
                  {language === 'it' ? 'crediti' : 'credits'}
                </Text>
              </View>
              <Text style={styles.balanceEur}>= €{creditsEur.toFixed(2)}</Text>
              
              <View style={styles.maticInfo}>
                <Text style={styles.maticText}>
                  ⬡ {parseFloat(maticBalance).toFixed(6)} MATIC
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.depositBtn]}
                  onPress={() => setShowDepositModal(true)}
                >
                  <Ionicons name="arrow-down-circle" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>
                    {language === 'it' ? 'Deposita' : 'Deposit'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.actionBtn, styles.withdrawBtn]}
                  onPress={() => setShowWithdrawModal(true)}
                  disabled={credits === 0}
                >
                  <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>
                    {language === 'it' ? 'Preleva' : 'Withdraw'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Conversion Rate */}
            <View style={styles.conversionCard}>
              <Text style={styles.conversionTitle}>
                {language === 'it' ? 'Tasso di Cambio' : 'Exchange Rate'}
              </Text>
              <View style={styles.conversionRow}>
                <Text style={styles.conversionText}>
                  {maticPer100Credits.toFixed(4)} MATIC = 100 {language === 'it' ? 'crediti' : 'credits'} = €1.00
                </Text>
              </View>
              <Text style={styles.priceText}>1 MATIC = €{maticPrice.toFixed(4)}</Text>
            </View>
          </>
        )}

        {/* Contract Info */}
        <TouchableOpacity
          style={styles.contractCard}
          onPress={() => Linking.openURL(`https://polygonscan.com/address/${BETSQUAD_CONTRACT}`)}
        >
          <Ionicons name="shield-checkmark" size={20} color="#10b981" />
          <View style={styles.contractContent}>
            <Text style={styles.contractLabel}>Smart Contract</Text>
            <Text style={styles.contractAddress}>{formatAddressUtil(BETSQUAD_CONTRACT)}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color="#6b7280" />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Deposit Modal */}
      <Modal visible={showDepositModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {language === 'it' ? 'Deposita Crediti' : 'Deposit Credits'}
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder={language === 'it' ? 'Numero di crediti' : 'Number of credits'}
              placeholderTextColor="#6b7280"
              value={depositCredits}
              onChangeText={setDepositCredits}
              keyboardType="numeric"
            />

            {depositCredits && parseInt(depositCredits) > 0 && (
              <Text style={styles.conversionPreview}>
                = {creditsToMatic(parseInt(depositCredits)).toFixed(6)} MATIC (€{(parseInt(depositCredits) * CREDIT_VALUE_EUR).toFixed(2)})
              </Text>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowDepositModal(false);
                  setDepositCredits('');
                }}
              >
                <Text style={styles.modalCancelText}>
                  {language === 'it' ? 'Annulla' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#10b981' }]}
                onPress={handleDeposit}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {language === 'it' ? 'Deposita' : 'Deposit'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {language === 'it' ? 'Preleva Crediti' : 'Withdraw Credits'}
            </Text>
            
            <Text style={styles.availableBalance}>
              {language === 'it' ? 'Disponibili:' : 'Available:'} {credits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder={language === 'it' ? 'Numero di crediti' : 'Number of credits'}
              placeholderTextColor="#6b7280"
              value={withdrawCredits}
              onChangeText={setWithdrawCredits}
              keyboardType="numeric"
            />

            {withdrawCredits && parseInt(withdrawCredits) > 0 && (
              <Text style={styles.conversionPreview}>
                = {creditsToMatic(parseInt(withdrawCredits)).toFixed(6)} MATIC (€{(parseInt(withdrawCredits) * CREDIT_VALUE_EUR).toFixed(2)})
              </Text>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowWithdrawModal(false);
                  setWithdrawCredits('');
                }}
              >
                <Text style={styles.modalCancelText}>
                  {language === 'it' ? 'Annulla' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#ef4444' }]}
                onPress={handleWithdraw}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {language === 'it' ? 'Preleva' : 'Withdraw'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8247e5',
    marginTop: 4,
    fontWeight: '600',
  },
  notConnectedCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#8247e530',
    borderStyle: 'dashed',
  },
  notConnectedIcon: {
    marginBottom: 20,
  },
  notConnectedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  notConnectedDesc: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8247e5',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  securityNoteText: {
    color: '#10b981',
    fontSize: 12,
  },
  walletCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10b98130',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10b98120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletInfo: {
    flex: 1,
    marginLeft: 12,
  },
  walletLabel: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  walletAddressText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 2,
  },
  disconnectBtn: {
    padding: 8,
  },
  balanceCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#fbbf2430',
  },
  balanceLabel: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  balanceValue: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  balanceCurrency: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  balanceEur: {
    color: '#10b981',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 4,
  },
  maticInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5a',
  },
  maticText: {
    color: '#8247e5',
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  depositBtn: {
    backgroundColor: '#10b981',
  },
  withdrawBtn: {
    backgroundColor: '#ef4444',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  conversionCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  conversionTitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 8,
  },
  conversionRow: {
    marginBottom: 4,
  },
  conversionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  priceText: {
    color: '#10b981',
    fontSize: 12,
  },
  tvlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  tvlContent: {
    flex: 1,
  },
  tvlLabel: {
    color: '#9ca3af',
    fontSize: 12,
  },
  tvlValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  contractCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  contractContent: {
    flex: 1,
  },
  contractLabel: {
    color: '#10b981',
    fontSize: 12,
  },
  contractAddress: {
    color: '#fff',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1f1f3d',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2d2d5a',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#8247e5',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  conversionPreview: {
    color: '#10b981',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  availableBalance: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 16,
  },
});
