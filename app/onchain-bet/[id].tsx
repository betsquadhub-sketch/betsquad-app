import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { useWalletConnect } from '../../src/contexts/WalletConnectContext';
import {
  getBetById,
  getUserBetsOnBet,
  calculatePayout,
  hasUserClaimed,
  BetData,
  BETSQUAD_CONTRACT,
  CREDIT_VALUE_EUR,
  maticToCredits,
} from '../../src/services/blockchain';
import { ethers } from 'ethers';

export default function OnChainBetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { 
    isConnected, 
    walletAddress, 
    credits, 
    maticPrice, 
    creditsToMatic, 
    refreshBalance,
    signAndSendContractTx,
  } = useWalletConnect();

  const [bet, setBet] = useState<BetData | null>(null);
  const [userBets, setUserBets] = useState({ onA: '0', onB: '0' });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [betCredits, setBetCredits] = useState('');
  const [potentialPayout, setPotentialPayout] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  const betId = parseInt(id || '0');

  const loadData = useCallback(async () => {
    if (!betId) return;
    try {
      const betData = await getBetById(betId);
      setBet(betData);

      if (walletAddress) {
        const userBetsData = await getUserBetsOnBet(betId, walletAddress);
        setUserBets(userBetsData);
        
        if (betData?.resolved) {
          const claimed = await hasUserClaimed(betId, walletAddress);
          setHasClaimed(claimed);
        }
      }
    } catch (error) {
      console.error('Error loading bet:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [betId, walletAddress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate potential payout when amount changes
  useEffect(() => {
    const calcPayout = async () => {
      if (!selectedOption || !betCredits || parseInt(betCredits) <= 0) {
        setPotentialPayout('0');
        return;
      }
      try {
        const maticAmount = creditsToMatic(parseInt(betCredits));
        const payout = await calculatePayout(betId, selectedOption, maticAmount.toString());
        setPotentialPayout(payout);
      } catch (e) {
        console.log('Could not calculate payout');
      }
    };
    calcPayout();
  }, [selectedOption, betCredits, betId]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handlePlaceBet = async () => {
    if (!selectedOption || !betCredits || parseInt(betCredits) <= 0) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', language === 'it' ? 'Seleziona un\'opzione e inserisci un importo' : 'Select an option and enter an amount');
      return;
    }

    const creditsNum = parseInt(betCredits);
    if (creditsNum > credits) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', language === 'it' ? 'Saldo insufficiente' : 'Insufficient balance');
      return;
    }

    if (!isConnected) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', 'Wallet non connesso');
      return;
    }

    setIsSubmitting(true);
    try {
      const maticAmount = creditsToMatic(creditsNum);
      const maticWei = ethers.utils.parseEther(maticAmount.toFixed(18));
      
      const tx = await signAndSendContractTx('placeBet', [betId, selectedOption, maticWei]);

      if (!tx) {
        setIsSubmitting(false);
        return;
      }

      Alert.alert(
        language === 'it' ? 'Scommessa Piazzata!' : 'Bet Placed!',
        `TX: ${tx.hash.slice(0, 20)}...`,
        [
          { text: 'Polygonscan', onPress: () => Linking.openURL(`https://polygonscan.com/tx/${tx.hash}`) },
          { text: 'OK' },
        ]
      );

      await tx.wait();
      refreshBalance();
      loadData();
      setBetCredits('');
      setSelectedOption(null);
    } catch (error: any) {
      console.error('Place bet error:', error);
      Alert.alert(language === 'it' ? 'Errore' : 'Error', error.reason || error.message || 'Errore');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolve = async (winner: number) => {
    if (!isConnected) return;

    Alert.alert(
      language === 'it' ? 'Conferma Risultato' : 'Confirm Result',
      language === 'it' 
        ? `Sei sicuro di voler dichiarare "${winner === 1 ? bet?.optionA : bet?.optionB}" come vincitore?`
        : `Are you sure you want to declare "${winner === 1 ? bet?.optionA : bet?.optionB}" as winner?`,
      [
        { text: language === 'it' ? 'Annulla' : 'Cancel', style: 'cancel' },
        {
          text: language === 'it' ? 'Conferma' : 'Confirm',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const tx = await signAndSendContractTx('resolveBet', [betId, winner]);
              if (tx) {
                Alert.alert(language === 'it' ? 'Transazione Inviata!' : 'Transaction Sent!');
                loadData();
              }
            } catch (error: any) {
              Alert.alert(language === 'it' ? 'Errore' : 'Error', error.reason || error.message);
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Cancel bet (free if no one bet)
  const handleCancelBet = async () => {
    if (!isConnected) return;

    Alert.alert(
      language === 'it' ? 'Cancella Scommessa' : 'Cancel Bet',
      language === 'it' 
        ? 'Sei sicuro di voler cancellare questa scommessa? Nessuno ha ancora scommesso.'
        : 'Are you sure you want to cancel this bet? No one has bet yet.',
      [
        { text: language === 'it' ? 'No' : 'No', style: 'cancel' },
        {
          text: language === 'it' ? 'Sì, Cancella' : 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // winner = 3 means cancelled, everyone gets refunded
              const tx = await signAndSendContractTx('resolveBet', [betId, 3]);
              if (tx) {
                Alert.alert(
                  language === 'it' ? 'Scommessa Cancellata!' : 'Bet Cancelled!',
                  language === 'it' ? 'La scommessa è stata annullata.' : 'The bet has been cancelled.'
                );
                router.back();
              }
            } catch (error: any) {
              Alert.alert(language === 'it' ? 'Errore' : 'Error', error.reason || error.message);
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Withdraw bet with penalty (refund all participants)
  const handleWithdrawBet = async () => {
    if (!isConnected) return;

    Alert.alert(
      language === 'it' ? 'Ritira Scommessa' : 'Withdraw Bet',
      language === 'it' 
        ? 'Sei sicuro? Pagherai una penale del 2% e tutti i partecipanti saranno rimborsati.'
        : 'Are you sure? You will pay a 2% penalty and all participants will be refunded.',
      [
        { text: language === 'it' ? 'No' : 'No', style: 'cancel' },
        {
          text: language === 'it' ? 'Sì, Ritira' : 'Yes, Withdraw',
          style: 'destructive',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // winner = 3 means cancelled, everyone gets refunded
              const tx = await signAndSendContractTx('resolveBet', [betId, 3]);
              if (tx) {
                Alert.alert(
                  language === 'it' ? 'Scommessa Ritirata!' : 'Bet Withdrawn!',
                  language === 'it' 
                    ? 'Tutti i partecipanti sono stati rimborsati.'
                    : 'All participants have been refunded.'
                );
                router.back();
              }
            } catch (error: any) {
              Alert.alert(language === 'it' ? 'Errore' : 'Error', error.reason || error.message);
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleClaim = async () => {
    if (!isConnected) return;

    setIsSubmitting(true);
    try {
      const tx = await signAndSendContractTx('claim', [betId]);
      if (tx) {
        Alert.alert(language === 'it' ? 'Vincite Reclamate!' : 'Winnings Claimed!');
        await tx.wait();
        refreshBalance();
        loadData();
      }
    } catch (error: any) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', error.reason || error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8247e5" />
      </View>
    );
  }

  if (!bet) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{language === 'it' ? 'Scommessa non trovata' : 'Bet not found'}</Text>
      </View>
    );
  }

  const totalPoolMatic = parseFloat(bet.poolA) + parseFloat(bet.poolB);
  const totalPoolCredits = Math.floor((totalPoolMatic * maticPrice) / CREDIT_VALUE_EUR);
  const poolACredits = Math.floor((parseFloat(bet.poolA) * maticPrice) / CREDIT_VALUE_EUR);
  const poolBCredits = Math.floor((parseFloat(bet.poolB) * maticPrice) / CREDIT_VALUE_EUR);
  const userBetACredits = Math.floor((parseFloat(userBets.onA) * maticPrice) / CREDIT_VALUE_EUR);
  const userBetBCredits = Math.floor((parseFloat(userBets.onB) * maticPrice) / CREDIT_VALUE_EUR);
  const potentialPayoutCredits = Math.floor((parseFloat(potentialPayout) * maticPrice) / CREDIT_VALUE_EUR);

  const isOpen = !bet.resolved && bet.deadline > new Date();
  const isCreator = walletAddress?.toLowerCase() === bet.creator.toLowerCase();
  const canResolve = isCreator && !bet.resolved && bet.deadline <= new Date();
  const hasUserBet = userBetACredits > 0 || userBetBCredits > 0;
  const isWinner = bet.resolved && (
    (bet.winner === 1 && userBetACredits > 0) ||
    (bet.winner === 2 && userBetBCredits > 0)
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{language === 'it' ? 'Scommessa' : 'Bet'} #{betId}</Text>
        <TouchableOpacity onPress={() => Linking.openURL(`https://polygonscan.com/address/${BETSQUAD_CONTRACT}`)}>
          <Ionicons name="open-outline" size={20} color="#8247e5" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8247e5" />}
      >
        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: bet.resolved ? (bet.winner === 3 ? '#ef4444' : '#6366f1') : '#10b981' }]}>
          <Ionicons name={bet.resolved ? 'checkmark-circle' : 'time'} size={16} color="#fff" />
          <Text style={styles.statusText}>
            {bet.resolved 
              ? (bet.winner === 3 ? (language === 'it' ? 'Annullata' : 'Cancelled') : (language === 'it' ? 'Risolta' : 'Resolved'))
              : (language === 'it' ? 'Aperta' : 'Open')}
          </Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{bet.title}</Text>

        {/* Deadline */}
        <View style={styles.deadlineRow}>
          <Ionicons name="calendar-outline" size={16} color="#9ca3af" />
          <Text style={styles.deadlineText}>
            {bet.deadline.toLocaleDateString(language === 'it' ? 'it-IT' : 'en-US', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {/* Total Pool */}
        <View style={styles.poolCard}>
          <Text style={styles.poolLabel}>{language === 'it' ? 'Montepremi Totale' : 'Total Prize Pool'}</Text>
          <Text style={styles.poolValue}>{totalPoolCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}</Text>
          <Text style={styles.poolEur}>€{(totalPoolCredits * CREDIT_VALUE_EUR).toFixed(2)}</Text>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {/* Option A */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedOption === 1 && styles.optionCardSelected,
              bet.resolved && bet.winner === 1 && styles.optionCardWinner,
            ]}
            onPress={() => isOpen && setSelectedOption(1)}
            disabled={!isOpen}
          >
            <View style={[styles.optionBadge, { backgroundColor: '#10b981' }]}>
              <Text style={styles.optionBadgeText}>A</Text>
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>{bet.optionA}</Text>
              <Text style={styles.optionPool}>{poolACredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}</Text>
            </View>
            {selectedOption === 1 && <Ionicons name="checkmark-circle" size={24} color="#10b981" />}
            {bet.resolved && bet.winner === 1 && <Ionicons name="trophy" size={24} color="#fbbf24" />}
          </TouchableOpacity>

          {/* Option B */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedOption === 2 && styles.optionCardSelected,
              bet.resolved && bet.winner === 2 && styles.optionCardWinner,
            ]}
            onPress={() => isOpen && setSelectedOption(2)}
            disabled={!isOpen}
          >
            <View style={[styles.optionBadge, { backgroundColor: '#ef4444' }]}>
              <Text style={styles.optionBadgeText}>B</Text>
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>{bet.optionB}</Text>
              <Text style={styles.optionPool}>{poolBCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}</Text>
            </View>
            {selectedOption === 2 && <Ionicons name="checkmark-circle" size={24} color="#ef4444" />}
            {bet.resolved && bet.winner === 2 && <Ionicons name="trophy" size={24} color="#fbbf24" />}
          </TouchableOpacity>
        </View>

        {/* User's Bets */}
        {hasUserBet && (
          <View style={styles.userBetsCard}>
            <Text style={styles.userBetsTitle}>{language === 'it' ? 'Le Tue Puntate' : 'Your Bets'}</Text>
            {userBetACredits > 0 && (
              <View style={styles.userBetRow}>
                <Text style={styles.userBetOption}>{bet.optionA}:</Text>
                <Text style={styles.userBetAmount}>{userBetACredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}</Text>
              </View>
            )}
            {userBetBCredits > 0 && (
              <View style={styles.userBetRow}>
                <Text style={styles.userBetOption}>{bet.optionB}:</Text>
                <Text style={styles.userBetAmount}>{userBetBCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}</Text>
              </View>
            )}
          </View>
        )}

        {/* Place Bet Section */}
        {isOpen && isConnected && (
          <View style={styles.placeBetSection}>
            <Text style={styles.sectionTitle}>{language === 'it' ? 'Piazza Scommessa' : 'Place Bet'}</Text>
            
            <TextInput
              style={styles.betInput}
              placeholder={language === 'it' ? 'Crediti da puntare' : 'Credits to bet'}
              placeholderTextColor="#6b7280"
              value={betCredits}
              onChangeText={setBetCredits}
              keyboardType="numeric"
            />

            {potentialPayoutCredits > 0 && (
              <View style={styles.payoutPreview}>
                <Text style={styles.payoutLabel}>{language === 'it' ? 'Vincita Potenziale:' : 'Potential Win:'}</Text>
                <Text style={styles.payoutValue}>{potentialPayoutCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.placeBetButton, (!selectedOption || !betCredits || isSubmitting) && styles.buttonDisabled]}
              onPress={handlePlaceBet}
              disabled={!selectedOption || !betCredits || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash" size={20} color="#fff" />
                  <Text style={styles.placeBetButtonText}>{language === 'it' ? 'Scommetti' : 'Place Bet'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Resolve Section (for creator) */}
        {canResolve && (
          <View style={styles.resolveSection}>
            <Text style={styles.sectionTitle}>{language === 'it' ? 'Dichiara Risultato' : 'Declare Result'}</Text>
            <View style={styles.resolveButtons}>
              <TouchableOpacity
                style={[styles.resolveButton, { backgroundColor: '#10b981' }]}
                onPress={() => handleResolve(1)}
                disabled={isSubmitting}
              >
                <Text style={styles.resolveButtonText}>{bet.optionA} {language === 'it' ? 'Vince' : 'Wins'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resolveButton, { backgroundColor: '#ef4444' }]}
                onPress={() => handleResolve(2)}
                disabled={isSubmitting}
              >
                <Text style={styles.resolveButtonText}>{bet.optionB} {language === 'it' ? 'Vince' : 'Wins'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Cancel/Withdraw Section (for creator before resolution) */}
        {isCreator && !bet.resolved && (
          <View style={styles.cancelSection}>
            <Text style={styles.cancelSectionTitle}>
              {language === 'it' ? 'Gestione Scommessa' : 'Manage Bet'}
            </Text>
            
            {totalPoolCredits === 0 ? (
              // No bets placed - can cancel for free
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelBet}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                    <Text style={styles.cancelButtonText}>
                      {language === 'it' ? 'Cancella Scommessa (Gratis)' : 'Cancel Bet (Free)'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              // Bets placed - can withdraw with penalty (2% fee)
              <View>
                <Text style={styles.withdrawWarning}>
                  {language === 'it' 
                    ? `⚠️ Ci sono ${totalPoolCredits.toLocaleString()} crediti in gioco. Ritirando pagherai una penale del 2% e tutti i partecipanti saranno rimborsati.`
                    : `⚠️ There are ${totalPoolCredits.toLocaleString()} credits at stake. Withdrawing will cost a 2% penalty and all participants will be refunded.`}
                </Text>
                <TouchableOpacity
                  style={styles.withdrawButton}
                  onPress={handleWithdrawBet}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="exit" size={20} color="#fff" />
                      <Text style={styles.cancelButtonText}>
                        {language === 'it' ? 'Ritira e Rimborsa Tutti' : 'Withdraw & Refund All'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Claim Winnings */}
        {isWinner && !hasClaimed && (
          <TouchableOpacity
            style={styles.claimButton}
            onPress={handleClaim}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="trophy" size={24} color="#fff" />
                <Text style={styles.claimButtonText}>{language === 'it' ? 'Reclama Vincite!' : 'Claim Winnings!'}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isWinner && hasClaimed && (
          <View style={styles.claimedBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
            <Text style={styles.claimedText}>{language === 'it' ? 'Vincite già reclamate' : 'Winnings already claimed'}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d5a',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  deadlineText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  poolCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#fbbf2430',
  },
  poolLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 8,
  },
  poolValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  poolEur: {
    color: '#10b981',
    fontSize: 16,
    marginTop: 4,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#2d2d5a',
  },
  optionCardSelected: {
    borderColor: '#8247e5',
  },
  optionCardWinner: {
    borderColor: '#fbbf24',
    backgroundColor: '#fbbf2415',
  },
  optionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBadgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  optionContent: {
    flex: 1,
    marginLeft: 12,
  },
  optionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  optionPool: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  userBetsCard: {
    backgroundColor: '#8247e515',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#8247e530',
  },
  userBetsTitle: {
    color: '#8247e5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  userBetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userBetOption: {
    color: '#9ca3af',
    fontSize: 14,
  },
  userBetAmount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  placeBetSection: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  betInput: {
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2d2d5a',
    marginBottom: 16,
  },
  payoutPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  payoutLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  payoutValue: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  placeBetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8247e5',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  placeBetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resolveSection: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  resolveButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  resolveButton: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  resolveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    padding: 20,
    gap: 12,
    marginBottom: 24,
  },
  claimButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  claimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b98115',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 24,
  },
  claimedText: {
    color: '#10b981',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  cancelSection: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#ef444430',
  },
  cancelSectionTitle: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6b7280',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginTop: 12,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  withdrawWarning: {
    color: '#fbbf24',
    fontSize: 13,
    lineHeight: 20,
  },
});
