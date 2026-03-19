import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Image,
  Modal,
  Platform,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { useWalletConnect } from '../../src/contexts/WalletConnectContext';
import { 
  getMyBets, 
  getMyParticipations, 
  getUserStats,
  getAvatar,
  updateAvatar,
  deleteBet,
  deleteParticipation,
  Bet, 
  Participation,
  UserStats 
} from '../../src/services/api';
import { CREDIT_VALUE_EUR } from '../../src/services/blockchain';
import { ethers } from 'ethers';
import { format } from 'date-fns';
import { it, enUS } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuthStore();
  const { language, setLanguage, t } = useLanguage();
  const { 
    isConnected: walletConnected, 
    walletAddress, 
    credits: blockchainCredits,
    creditsEur: blockchainCreditsEur,
    maticBalance,
    refreshBalance,
    creditsToMatic,
    disconnectWallet,
    signAndSendContractTx,
  } = useWalletConnect();
  
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [myParticipations, setMyParticipations] = useState<Participation[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'created' | 'participated'>('created');
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const dateLocale = language === 'it' ? it : enUS;

  const loadData = useCallback(async () => {
    try {
      const [bets, participations, userStats, avatarData] = await Promise.all([
        getMyBets(),
        getMyParticipations(),
        getUserStats(),
        getAvatar(),
      ]);
      setMyBets(bets);
      setMyParticipations(participations);
      setStats(userStats);
      setAvatar(avatarData.avatar);
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    refreshUser();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
    refreshUser();
  };

  // Check if a bet is deletable (expired or completed)
  const isBetDeletable = (bet: Bet): boolean => {
    const deadline = new Date(bet.deadline);
    const isExpired = deadline < new Date();
    const isCompleted = bet.status === 'completed' || bet.status === 'cancelled';
    return isExpired || isCompleted;
  };

  // Check if a participation is deletable
  const isParticipationDeletable = (participation: Participation): boolean => {
    // Find the bet for this participation
    const bet = myBets.find(b => b.id === participation.bet_id);
    if (!bet) return true; // If bet doesn't exist, allow deletion
    return isBetDeletable(bet);
  };

  const handleDeleteBet = async (bet: Bet) => {
    if (!isBetDeletable(bet)) {
      Alert.alert(
        language === 'it' ? 'Non Eliminabile' : 'Cannot Delete',
        language === 'it' 
          ? 'Puoi eliminare solo scommesse terminate o scadute.'
          : 'You can only delete completed or expired bets.'
      );
      return;
    }

    Alert.alert(
      language === 'it' ? 'Elimina Scommessa' : 'Delete Bet',
      language === 'it' 
        ? `Vuoi eliminare "${bet.title}" dalla cronologia?`
        : `Do you want to delete "${bet.title}" from your history?`,
      [
        { text: language === 'it' ? 'Annulla' : 'Cancel', style: 'cancel' },
        {
          text: language === 'it' ? 'Elimina' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBet(bet.id);
              setMyBets(prev => prev.filter(b => b.id !== bet.id));
              Alert.alert(
                language === 'it' ? 'Eliminata' : 'Deleted',
                language === 'it' ? 'Scommessa eliminata.' : 'Bet deleted.'
              );
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Eliminazione fallita');
            }
          },
        },
      ]
    );
  };

  const handleDeleteParticipation = async (participation: Participation) => {
    Alert.alert(
      language === 'it' ? 'Elimina Partecipazione' : 'Delete Participation',
      language === 'it' 
        ? 'Vuoi eliminare questa partecipazione dalla cronologia?'
        : 'Do you want to delete this participation from your history?',
      [
        { text: language === 'it' ? 'Annulla' : 'Cancel', style: 'cancel' },
        {
          text: language === 'it' ? 'Elimina' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteParticipation(participation.id);
              setMyParticipations(prev => prev.filter(p => p.id !== participation.id));
              Alert.alert(
                language === 'it' ? 'Eliminata' : 'Deleted',
                language === 'it' ? 'Partecipazione eliminata.' : 'Participation deleted.'
              );
            } catch (error: any) {
              Alert.alert('Errore', error.response?.data?.detail || 'Eliminazione fallita');
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const handlePickImage = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('error'), 'Permission to access gallery is required');
        return;
      }

      // Launch image picker with editing enabled
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploadingAvatar(true);
        
        // Resize and compress the image
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 300, height: 300 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (manipResult.base64) {
          const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
          await updateAvatar(base64Image);
          setAvatar(base64Image);
          Alert.alert(t('success'), 'Avatar updated!');
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('error'), 'Failed to update avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleWithdraw = async () => {
    const creditsNum = parseInt(withdrawAmount);
    if (isNaN(creditsNum) || creditsNum <= 0) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', language === 'it' ? 'Inserisci un importo valido' : 'Enter a valid amount');
      return;
    }

    if (creditsNum > blockchainCredits) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', language === 'it' ? 'Saldo insufficiente' : 'Insufficient balance');
      return;
    }

    if (!walletConnected) {
      Alert.alert('Errore', 'Wallet non connesso');
      return;
    }

    setIsWithdrawing(true);
    try {
      const maticAmount = creditsToMatic(creditsNum);
      const maticWei = ethers.utils.parseEther(maticAmount.toFixed(18));
      const tx = await signAndSendContractTx('withdraw', [maticWei]);
      
      if (tx) {
        Alert.alert(
          language === 'it' ? 'Transazione Inviata!' : 'Transaction Sent!',
          `TX: ${tx.hash.slice(0, 20)}...`,
          [
            { text: 'Polygonscan', onPress: () => Linking.openURL(`https://polygonscan.com/tx/${tx.hash}`) },
            { text: 'OK' },
          ]
        );
        
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        
        await tx.wait();
        refreshBalance();
        Alert.alert(
          language === 'it' ? 'Prelievo Completato!' : 'Withdrawal Complete!',
          language === 'it' 
            ? `Hai prelevato ${creditsNum} crediti sul tuo wallet`
            : `You withdrew ${creditsNum} credits to your wallet`
        );
      }
    } catch (error: any) {
      console.error('Withdraw error:', error);
      Alert.alert(language === 'it' ? 'Errore' : 'Error', error.reason || error.message || 'Prelievo fallito');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return '#10b981';
      case 'voting':
        return '#f59e0b';
      case 'completed':
        return '#6366f1';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handlePickImage} style={styles.avatarContainer}>
            {isUploadingAvatar ? (
              <ActivityIndicator size="large" color="#6366f1" />
            ) : avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={40} color="#6366f1" />
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.username}>@{user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Wins Card */}
        <View style={styles.winsCard}>
          <View style={styles.winsHeader}>
            <Ionicons name="trophy" size={28} color="#f59e0b" />
            <Text style={styles.winsTitle}>{t('won')}</Text>
          </View>
          <View style={styles.winsStats}>
            <View style={styles.winStatItem}>
              <Text style={styles.winStatValue}>{stats?.wins || 0}</Text>
              <Text style={styles.winStatLabel}>{t('won')}</Text>
            </View>
            <View style={styles.winStatDivider} />
            <View style={styles.winStatItem}>
              <Text style={[styles.winStatValue, { color: '#10b981' }]}>
                +{stats?.total_won.toLocaleString() || 0}
              </Text>
              <Text style={styles.winStatLabel}>{t('credits')}</Text>
            </View>
            <View style={styles.winStatDivider} />
            <View style={styles.winStatItem}>
              <Text style={styles.winStatValue}>{stats?.win_rate.toFixed(0) || 0}%</Text>
              <Text style={styles.winStatLabel}>Win Rate</Text>
            </View>
          </View>
        </View>

        {/* Blockchain Wallet Section */}
        {walletConnected && (
          <View style={styles.walletSection}>
            <View style={styles.walletHeader}>
              <Ionicons name="cube" size={24} color="#8247e5" />
              <Text style={styles.walletTitle}>On-Chain Wallet</Text>
              <View style={styles.polygonBadge}>
                <Text style={styles.polygonBadgeText}>Polygon</Text>
              </View>
            </View>
            
            <View style={styles.walletBalance}>
              <Text style={styles.walletBalanceLabel}>
                {language === 'it' ? 'Saldo On-Chain' : 'On-Chain Balance'}
              </Text>
              <Text style={styles.walletBalanceValue}>
                {blockchainCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}
              </Text>
              <Text style={styles.walletBalanceEur}>
                €{blockchainCreditsEur.toFixed(2)} ({parseFloat(maticBalance).toFixed(6)} MATIC)
              </Text>
            </View>

            <View style={styles.walletActions}>
              <TouchableOpacity
                style={[styles.walletActionBtn, { backgroundColor: '#ef4444' }]}
                onPress={() => setShowWithdrawModal(true)}
                disabled={blockchainCredits === 0}
              >
                <Ionicons name="arrow-up-circle" size={18} color="#fff" />
                <Text style={styles.walletActionText}>
                  {language === 'it' ? 'Preleva' : 'Withdraw'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.walletActionBtn, { backgroundColor: '#6b7280' }]}
                onPress={disconnectWallet}
              >
                <Ionicons name="log-out" size={18} color="#fff" />
                <Text style={styles.walletActionText}>
                  {language === 'it' ? 'Disconnetti' : 'Disconnect'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.walletAddressRow}
              onPress={() => Linking.openURL(`https://polygonscan.com/address/${walletAddress}`)}
            >
              <Text style={styles.walletAddressLabel}>Wallet:</Text>
              <Text style={styles.walletAddressValue}>
                {walletAddress?.slice(0, 8)}...{walletAddress?.slice(-6)}
              </Text>
              <Ionicons name="open-outline" size={14} color="#8247e5" />
            </TouchableOpacity>
          </View>
        )}

        {/* Settings Section */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>{t('settings')}</Text>
          
          {/* Language Selector */}
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => setShowLanguageModal(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="language" size={22} color="#6366f1" />
              <Text style={styles.settingText}>{t('language')}</Text>
            </View>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>
                {language === 'it' ? '🇮🇹 Italiano' : '🇬🇧 English'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#6b7280" />
            </View>
          </TouchableOpacity>
        </View>

        {/* My Bets Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'created' && styles.tabActive]}
            onPress={() => setActiveTab('created')}
          >
            <Text style={[styles.tabText, activeTab === 'created' && styles.tabTextActive]}>
              {t('myBets')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'participated' && styles.tabActive]}
            onPress={() => setActiveTab('participated')}
          >
            <Text style={[styles.tabText, activeTab === 'participated' && styles.tabTextActive]}>
              {t('participating')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'created' ? (
          <View style={styles.listContainer}>
            {myBets.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="trophy-outline" size={48} color="#6b7280" />
                <Text style={styles.emptyText}>{t('noBetsYet')}</Text>
              </View>
            ) : (
              myBets.map((bet) => (
                <View key={bet.id} style={styles.betItemContainer}>
                  <TouchableOpacity
                    style={styles.betItem}
                    onPress={() => router.push(`/bet/${bet.id}`)}
                  >
                    <View style={styles.betItemHeader}>
                      <Text style={styles.betItemTitle} numberOfLines={1}>
                        {bet.title}
                      </Text>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: getStatusColor(bet.status) },
                        ]}
                      />
                    </View>
                    <View style={styles.betItemFooter}>
                      <Text style={styles.betItemStat}>
                        {bet.participant_count} {t('participants')}
                      </Text>
                      <Text style={styles.betItemStat}>
                        {bet.total_pool.toLocaleString()} {t('pool')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {isBetDeletable(bet) && (
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteBet(bet)}
                    >
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.listContainer}>
            {myParticipations.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="game-controller-outline" size={48} color="#6b7280" />
                <Text style={styles.emptyText}>{t('noBetsYet')}</Text>
              </View>
            ) : (
              myParticipations.map((participation) => (
                <View key={participation.id} style={styles.betItemContainer}>
                  <TouchableOpacity
                    style={styles.participationItem}
                    onPress={() => router.push(`/bet/${participation.bet_id}`)}
                  >
                    <View style={styles.participationHeader}>
                      <Text style={styles.participationOption}>
                        {participation.option_text}
                      </Text>
                      <Text style={styles.participationAmount}>
                        {participation.amount.toLocaleString()}
                      </Text>
                    </View>
                    <Text style={styles.participationDate}>
                      {format(new Date(participation.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteParticipation(participation)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Language Modal */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('language')}</Text>
            
            <TouchableOpacity
              style={[styles.languageOption, language === 'it' && styles.languageOptionActive]}
              onPress={() => {
                setLanguage('it');
                setShowLanguageModal(false);
              }}
            >
              <Text style={styles.languageFlag}>🇮🇹</Text>
              <Text style={styles.languageText}>Italiano</Text>
              {language === 'it' && <Ionicons name="checkmark" size={24} color="#6366f1" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.languageOption, language === 'en' && styles.languageOptionActive]}
              onPress={() => {
                setLanguage('en');
                setShowLanguageModal(false);
              }}
            >
              <Text style={styles.languageFlag}>🇬🇧</Text>
              <Text style={styles.languageText}>English</Text>
              {language === 'en' && <Ionicons name="checkmark" size={24} color="#6366f1" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowLanguageModal(false)}
            >
              <Text style={styles.modalCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.withdrawModalContent}>
            <Text style={styles.withdrawModalTitle}>
              {language === 'it' ? 'Preleva Crediti' : 'Withdraw Credits'}
            </Text>
            
            <Text style={styles.availableText}>
              {language === 'it' ? 'Disponibili:' : 'Available:'} {blockchainCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}
            </Text>
            
            <TextInput
              style={styles.withdrawInput}
              placeholder={language === 'it' ? 'Crediti da prelevare' : 'Credits to withdraw'}
              placeholderTextColor="#6b7280"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
            />

            {withdrawAmount && parseInt(withdrawAmount) > 0 && (
              <Text style={styles.withdrawPreview}>
                = {creditsToMatic(parseInt(withdrawAmount)).toFixed(6)} MATIC (€{(parseInt(withdrawAmount) * CREDIT_VALUE_EUR).toFixed(2)})
              </Text>
            )}

            <View style={styles.withdrawModalButtons}>
              <TouchableOpacity
                style={styles.withdrawCancelBtn}
                onPress={() => {
                  setShowWithdrawModal(false);
                  setWithdrawAmount('');
                }}
              >
                <Text style={styles.withdrawCancelText}>{language === 'it' ? 'Annulla' : 'Cancel'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.withdrawConfirmBtn}
                onPress={handleWithdraw}
                disabled={isWithdrawing}
              >
                {isWithdrawing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.withdrawConfirmText}>{language === 'it' ? 'Preleva' : 'Withdraw'}</Text>
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
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1f1f3d',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#6366f1',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#6366f1',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0f0f23',
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  email: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2d2d5a',
  },
  winsCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f59e0b30',
  },
  winsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  winsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f59e0b',
  },
  winsStats: {
    flexDirection: 'row',
  },
  winStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  winStatValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  winStatLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  winStatDivider: {
    width: 1,
    backgroundColor: '#2d2d5a',
  },
  settingsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingText: {
    fontSize: 16,
    color: '#fff',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    fontSize: 14,
    color: '#9ca3af',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#6366f1',
  },
  tabText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
  },
  listContainer: {
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 12,
  },
  betItem: {
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  betItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  betItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
    marginRight: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  betItemFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  betItemStat: {
    color: '#9ca3af',
    fontSize: 13,
  },
  participationItem: {
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  participationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  participationOption: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  participationAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  participationDate: {
    color: '#9ca3af',
    fontSize: 13,
  },
  betItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButton: {
    padding: 12,
    marginLeft: 8,
    backgroundColor: '#ef444420',
    borderRadius: 10,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
    paddingVertical: 16,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1f1f3d',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0f0f23',
    marginBottom: 12,
    gap: 12,
  },
  languageOptionActive: {
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  languageFlag: {
    fontSize: 28,
  },
  languageText: {
    fontSize: 18,
    color: '#fff',
    flex: 1,
  },
  modalCloseButton: {
    marginTop: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#9ca3af',
    fontSize: 16,
  },
  // Wallet Section Styles
  walletSection: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#8247e530',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  walletTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  polygonBadge: {
    backgroundColor: '#8247e5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  polygonBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  walletBalance: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 16,
    backgroundColor: '#0f0f23',
    borderRadius: 12,
  },
  walletBalanceLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 4,
  },
  walletBalanceValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  walletBalanceEur: {
    color: '#10b981',
    fontSize: 14,
    marginTop: 4,
  },
  walletActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  walletActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  walletActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  walletAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5a',
  },
  walletAddressLabel: {
    color: '#6b7280',
    fontSize: 12,
  },
  walletAddressValue: {
    color: '#8247e5',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  // Withdraw Modal Styles
  withdrawModalContent: {
    backgroundColor: '#1f1f3d',
    borderRadius: 20,
    padding: 24,
  },
  withdrawModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  availableText: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 16,
  },
  withdrawInput: {
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  withdrawPreview: {
    color: '#10b981',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  withdrawModalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  withdrawCancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2d2d5a',
    alignItems: 'center',
  },
  withdrawCancelText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
  },
  withdrawConfirmBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  withdrawConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
