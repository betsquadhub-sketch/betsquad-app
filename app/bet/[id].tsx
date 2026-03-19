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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getBet,
  getBetParticipations,
  participateInBet,
  declareResult,
  voteOnResult,
  getBetCancelCosts,
  withdrawBet,
  deleteBetByCreator,
  getBetOdds,
  calculatePayout,
  Bet,
  Participation,
  BetCancelCosts,
  BetOdds,
  PayoutCalculation,
} from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { format } from 'date-fns';
import { it, enUS } from 'date-fns/locale';

export default function BetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuthStore();
  const { language, t } = useLanguage();
  const dateLocale = language === 'it' ? it : enUS;

  const [bet, setBet] = useState<Bet | null>(null);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [cancelCosts, setCancelCosts] = useState<BetCancelCosts | null>(null);
  const [odds, setOdds] = useState<BetOdds | null>(null);
  const [payoutCalc, setPayoutCalc] = useState<PayoutCalculation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawConfirmStep, setWithdrawConfirmStep] = useState(0);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [betData, participationsData, oddsData] = await Promise.all([
        getBet(id),
        getBetParticipations(id),
        getBetOdds(id),
      ]);
      setBet(betData);
      setParticipations(participationsData);
      setOdds(oddsData);
      
      // Load cancel costs if user is creator and bet is open
      if (betData.creator_id === user?.id && betData.status === 'open') {
        try {
          const costs = await getBetCancelCosts(id);
          setCancelCosts(costs);
        } catch (e) {
          console.log('Could not load cancel costs');
        }
      }
    } catch (error) {
      console.error('Error loading bet:', error);
      Alert.alert(t('error'), t('errorLoadingBet'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id, user?.id, t]);

  // Calculate payout when amount or option changes
  useEffect(() => {
    const calcPayout = async () => {
      if (!id || !selectedOption || !betAmount || parseFloat(betAmount) <= 0) {
        setPayoutCalc(null);
        return;
      }
      try {
        const calc = await calculatePayout(id, selectedOption, parseFloat(betAmount));
        setPayoutCalc(calc);
      } catch (e) {
        console.log('Could not calculate payout');
      }
    };
    
    const debounce = setTimeout(calcPayout, 300);
    return () => clearTimeout(debounce);
  }, [id, selectedOption, betAmount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadData();
    refreshUser();
  };

  const handleParticipate = async () => {
    if (!selectedOption || !betAmount || !bet) {
      Alert.alert('Errore', 'Seleziona un\'opzione e inserisci un importo');
      return;
    }

    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Errore', 'Inserisci un importo valido');
      return;
    }

    if (amount > (user?.credits || 0)) {
      Alert.alert('Errore', 'Crediti insufficienti');
      return;
    }

    setIsSubmitting(true);
    try {
      await participateInBet(bet.id, selectedOption, amount);
      Alert.alert('Successo', 'Scommessa piazzata!');
      setBetAmount('');
      setSelectedOption(null);
      loadData();
      refreshUser();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante la partecipazione';
      Alert.alert('Errore', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeclareResult = async (optionId: string) => {
    if (!bet) return;

    const option = bet.options.find((o) => o.id === optionId);
    Alert.alert(
      'Dichiara Risultato',
      `Confermi che "${option?.text}" e il risultato vincente?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await declareResult(bet.id, optionId);
              Alert.alert('Successo', 'Risultato dichiarato! In attesa di conferma dei vincitori.');
              loadData();
            } catch (error: any) {
              const message = error.response?.data?.detail || 'Errore';
              Alert.alert('Errore', message);
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleVote = async (approve: boolean) => {
    if (!bet) return;

    setIsSubmitting(true);
    try {
      const result = await voteOnResult(bet.id, approve);
      Alert.alert('Successo', result.message);
      loadData();
      refreshUser();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Errore durante il voto';
      Alert.alert('Errore', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Withdraw bet (costs 2x the pool)
  const handleWithdraw = async () => {
    if (!bet) return;
    
    if (withdrawConfirmStep === 0) {
      // First confirmation
      setWithdrawConfirmStep(1);
      return;
    }
    
    if (withdrawConfirmStep === 1) {
      // Second confirmation - execute
      setIsSubmitting(true);
      try {
        const result = await withdrawBet(bet.id, true);
        if (result.success) {
          Alert.alert('Successo', result.message || 'Scommessa ritirata');
          router.back();
        }
      } catch (error: any) {
        const message = error.response?.data?.detail || 'Errore durante il ritiro';
        Alert.alert('Errore', message);
      } finally {
        setIsSubmitting(false);
        setWithdrawConfirmStep(0);
      }
    }
  };

  // Delete bet (costs 20 credits fixed)
  const handleDelete = async () => {
    if (!bet) return;
    
    if (deleteConfirmStep === 0) {
      // First confirmation
      setDeleteConfirmStep(1);
      return;
    }
    
    if (deleteConfirmStep === 1) {
      // Second confirmation - execute
      setIsSubmitting(true);
      try {
        const result = await deleteBetByCreator(bet.id, true);
        if (result.success) {
          Alert.alert('Successo', result.message || 'Scommessa eliminata');
          router.back();
        }
      } catch (error: any) {
        const message = error.response?.data?.detail || 'Errore durante l\'eliminazione';
        Alert.alert('Errore', message);
      } finally {
        setIsSubmitting(false);
        setDeleteConfirmStep(0);
      }
    }
  };

  // Cancel confirm steps
  const cancelWithdrawConfirm = () => setWithdrawConfirmStep(0);
  const cancelDeleteConfirm = () => setDeleteConfirmStep(0);

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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Aperta';
      case 'voting':
        return 'Votazione';
      case 'completed':
        return 'Completata';
      case 'cancelled':
        return 'Annullata';
      default:
        return status;
    }
  };

  const getOptionStats = (optionId: string) => {
    const optionParticipations = participations.filter((p) => p.option_id === optionId);
    return {
      count: optionParticipations.length,
      total: optionParticipations.reduce((sum, p) => sum + p.amount, 0),
    };
  };

  const isCreator = bet?.creator_id === user?.id;
  const hasParticipated = participations.some((p) => p.user_id === user?.id);
  const userParticipation = participations.find((p) => p.user_id === user?.id);
  const isWinner = bet?.winning_option_id && userParticipation?.option_id === bet.winning_option_id;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!bet) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.errorText}>Scommessa non trovata</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dettagli</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        <View style={styles.betCard}>
          <View style={styles.betHeader}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(bet.status) + '20' },
              ]}
            >
              <Text style={[styles.statusText, { color: getStatusColor(bet.status) }]}>
                {getStatusText(bet.status)}
              </Text>
            </View>
            <Text style={styles.creatorText}>@{bet.creator_username}</Text>
          </View>

          <Text style={styles.betTitle}>{bet.title}</Text>
          <Text style={styles.betDescription}>{bet.description}</Text>

          <View style={styles.betStats}>
            <View style={styles.betStat}>
              <Ionicons name="people" size={18} color="#9ca3af" />
              <Text style={styles.betStatText}>{bet.participant_count} partecipanti</Text>
            </View>
            <View style={styles.betStat}>
              <Ionicons name="wallet" size={18} color="#10b981" />
              <Text style={[styles.betStatText, { color: '#10b981' }]}>
                {bet.total_pool.toLocaleString()} pool
              </Text>
            </View>
          </View>

          <View style={styles.deadlineContainer}>
            <Ionicons name="time-outline" size={16} color="#9ca3af" />
            <Text style={styles.deadlineText}>
              Scadenza: {format(new Date(bet.deadline), 'dd MMM yyyy, HH:mm', { locale: it })}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('options')}</Text>
        <View style={styles.optionsContainer}>
          {bet.options.map((option) => {
            const stats = getOptionStats(option.id);
            const optionOdds = odds?.options.find(o => o.option_id === option.id);
            const isWinningOption = bet.winning_option_id === option.id;
            const isSelected = selectedOption === option.id;

            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.optionCard,
                  isSelected && styles.optionCardSelected,
                  isWinningOption && styles.optionCardWinning,
                ]}
                onPress={() => {
                  if (bet.status === 'open' && !isCreator && !hasParticipated) {
                    setSelectedOption(option.id);
                  } else if (bet.status === 'open' && isCreator) {
                    handleDeclareResult(option.id);
                  }
                }}
                disabled={bet.status !== 'open' && !isCreator}
              >
                <View style={styles.optionHeader}>
                  <View style={styles.optionTitleRow}>
                    <Text style={styles.optionText}>{option.text}</Text>
                    {isWinningOption && (
                      <Ionicons name="trophy" size={20} color="#f59e0b" />
                    )}
                  </View>
                  {/* Odds Display */}
                  {optionOdds && (
                    <View style={styles.oddsContainer}>
                      <View style={[
                        styles.probabilityBadge,
                        optionOdds.is_favorite && styles.favoriteBadge,
                        optionOdds.is_underdog && styles.underdogBadge,
                      ]}>
                        <Text style={styles.probabilityText}>
                          {optionOdds.implied_probability.toFixed(0)}%
                        </Text>
                      </View>
                      <View style={styles.multiplierBadge}>
                        <Text style={styles.multiplierText}>
                          {optionOdds.multiplier.toFixed(2)}x
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
                <View style={styles.optionStats}>
                  <Text style={styles.optionStatText}>
                    {stats.count} {t('bets')} - {stats.total.toLocaleString()} {t('credits')}
                  </Text>
                  {optionOdds?.is_favorite && (
                    <Text style={styles.favoriteLabel}>⭐ Favorita</Text>
                  )}
                  {optionOdds?.is_underdog && (
                    <Text style={styles.underdogLabel}>🚀 Underdog</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {bet.status === 'open' && !isCreator && !hasParticipated && (
          <View style={styles.participateSection}>
            <Text style={styles.sectionTitle}>{t('placeBet')}</Text>
            <View style={styles.amountInputContainer}>
              <Ionicons name="wallet-outline" size={20} color="#9ca3af" />
              <TextInput
                style={styles.amountInput}
                placeholder={t('amount')}
                placeholderTextColor="#6b7280"
                value={betAmount}
                onChangeText={setBetAmount}
                keyboardType="numeric"
              />
              <Text style={styles.creditLabel}>{t('credits')}</Text>
            </View>

            {/* Payout Calculator */}
            {payoutCalc && selectedOption && (
              <View style={styles.payoutCard}>
                <Text style={styles.payoutTitle}>📊 {language === 'it' ? 'Stima Payout' : 'Payout Estimate'}</Text>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutLabel}>{language === 'it' ? 'Vincita potenziale' : 'Potential win'}</Text>
                  <Text style={styles.payoutValue}>+{payoutCalc.potential_profit.toLocaleString()} {t('credits')}</Text>
                </View>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutLabel}>{language === 'it' ? 'Payout totale' : 'Total payout'}</Text>
                  <Text style={[styles.payoutValue, { color: '#10b981' }]}>{payoutCalc.potential_payout.toLocaleString()}</Text>
                </View>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutLabel}>Multiplier</Text>
                  <Text style={styles.payoutMultiplier}>{payoutCalc.multiplier.toFixed(2)}x</Text>
                </View>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutLabel}>{language === 'it' ? 'Tua quota' : 'Your share'}</Text>
                  <Text style={styles.payoutValue}>{payoutCalc.your_share_percent.toFixed(1)}%</Text>
                </View>
              </View>
            )}

            <Text style={styles.balanceText}>
              {t('available')}: {user?.credits.toLocaleString()} {t('credits')}
            </Text>
            <TouchableOpacity
              style={[
                styles.participateButton,
                (!selectedOption || !betAmount) && styles.participateButtonDisabled,
              ]}
              onPress={handleParticipate}
              disabled={!selectedOption || !betAmount || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.participateButtonText}>Scommetti</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {hasParticipated && (
          <View style={styles.participatedBadge}>
            <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            <Text style={styles.participatedText}>
              Hai scommesso {userParticipation?.amount.toLocaleString()} su "{userParticipation?.option_text}"
            </Text>
          </View>
        )}

        {bet.status === 'voting' && isWinner && (
          <View style={styles.votingSection}>
            <Text style={styles.sectionTitle}>Conferma il risultato</Text>
            <Text style={styles.votingDescription}>
              Il creatore ha dichiarato un vincitore. Confermi il risultato?
            </Text>
            <View style={styles.votingButtons}>
              <TouchableOpacity
                style={[styles.voteButton, styles.voteButtonApprove]}
                onPress={() => handleVote(true)}
                disabled={isSubmitting}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.voteButtonText}>Approva</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.voteButton, styles.voteButtonReject]}
                onPress={() => handleVote(false)}
                disabled={isSubmitting}
              >
                <Ionicons name="close" size={20} color="#fff" />
                <Text style={styles.voteButtonText}>Rifiuta</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Creator actions - Withdraw/Delete */}
        {isCreator && bet.status === 'open' && cancelCosts && (
          <View style={styles.creatorActionsSection}>
            <Text style={styles.sectionTitle}>Gestione Scommessa</Text>
            <Text style={styles.creatorActionsDescription}>
              Come creatore puoi ritirare o eliminare questa scommessa. Tutti i partecipanti verranno rimborsati.
            </Text>
            
            {/* Withdraw Button */}
            <View style={styles.actionButtonContainer}>
              {withdrawConfirmStep === 0 ? (
                <TouchableOpacity
                  style={[styles.withdrawButton, !cancelCosts.can_withdraw && styles.buttonDisabled]}
                  onPress={handleWithdraw}
                  disabled={!cancelCosts.can_withdraw || isSubmitting}
                >
                  <Ionicons name="arrow-undo" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Ritira Scommessa</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.confirmContainer}>
                  <Text style={styles.confirmWarning}>Sei sicuro di voler ritirare?</Text>
                  <View style={styles.confirmButtons}>
                    <TouchableOpacity
                      style={styles.confirmButtonYes}
                      onPress={handleWithdraw}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.confirmButtonText}>Sì, Ritira</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmButtonNo}
                      onPress={cancelWithdrawConfirm}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.confirmButtonText}>Annulla</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <Text style={styles.actionCost}>
                Costo: {cancelCosts.withdraw_cost.toLocaleString()} crediti (2x il pool)
              </Text>
              {!cancelCosts.can_withdraw && (
                <Text style={styles.insufficientCredits}>Crediti insufficienti</Text>
              )}
            </View>

            {/* Delete Button */}
            <View style={styles.actionButtonContainer}>
              {deleteConfirmStep === 0 ? (
                <TouchableOpacity
                  style={[styles.deleteButton, !cancelCosts.can_delete && styles.buttonDisabled]}
                  onPress={handleDelete}
                  disabled={!cancelCosts.can_delete || isSubmitting}
                >
                  <Ionicons name="trash" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Elimina Scommessa</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.confirmContainer}>
                  <Text style={styles.confirmWarning}>Sei sicuro di voler eliminare?</Text>
                  <View style={styles.confirmButtons}>
                    <TouchableOpacity
                      style={styles.confirmButtonYes}
                      onPress={handleDelete}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.confirmButtonText}>Sì, Elimina</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmButtonNo}
                      onPress={cancelDeleteConfirm}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.confirmButtonText}>Annulla</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <Text style={styles.actionCost}>
                Costo fisso: 20 crediti
              </Text>
              {!cancelCosts.can_delete && (
                <Text style={styles.insufficientCredits}>Crediti insufficienti</Text>
              )}
            </View>

            <Text style={styles.creditsAvailable}>
              I tuoi crediti: {cancelCosts.user_credits.toLocaleString()}
            </Text>
          </View>
        )}

        {participations.length > 0 && (
          <View style={styles.participationsSection}>
            <Text style={styles.sectionTitle}>Partecipanti</Text>
            {participations.map((p) => (
              <View key={p.id} style={styles.participantItem}>
                <View style={styles.participantInfo}>
                  <Text style={styles.participantName}>@{p.username}</Text>
                  <Text style={styles.participantOption}>{p.option_text}</Text>
                </View>
                <Text style={styles.participantAmount}>
                  {p.amount.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d5a',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  betCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  betHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  creatorText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  betTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  betDescription: {
    fontSize: 15,
    color: '#9ca3af',
    lineHeight: 22,
    marginBottom: 16,
  },
  betStats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  betStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  betStatText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  deadlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5a',
  },
  deadlineText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  optionCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#2d2d5a',
  },
  optionCardSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f120',
  },
  optionCardWinning: {
    borderColor: '#f59e0b',
    backgroundColor: '#f59e0b10',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  optionStats: {
    flexDirection: 'row',
  },
  optionStatText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  participateSection: {
    marginBottom: 24,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#2d2d5a',
    marginBottom: 8,
  },
  amountInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
  },
  creditLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  balanceText: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 16,
  },
  participateButton: {
    backgroundColor: '#6366f1',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participateButtonDisabled: {
    opacity: 0.5,
  },
  participateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  participatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b98120',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  participatedText: {
    color: '#10b981',
    fontSize: 14,
    flex: 1,
  },
  votingSection: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  votingDescription: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 16,
  },
  votingButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  voteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
  },
  voteButtonApprove: {
    backgroundColor: '#10b981',
  },
  voteButtonReject: {
    backgroundColor: '#ef4444',
  },
  voteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  participationsSection: {
    marginBottom: 24,
  },
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  participantOption: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  participantAmount: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '600',
  },
  // Creator actions styles
  creatorActionsSection: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  creatorActionsDescription: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  actionButtonContainer: {
    marginBottom: 16,
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f59e0b',
    height: 52,
    borderRadius: 12,
    gap: 10,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    height: 52,
    borderRadius: 12,
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionCost: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  insufficientCredits: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  creditsAvailable: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5a',
  },
  confirmContainer: {
    backgroundColor: '#2d2d5a',
    borderRadius: 12,
    padding: 16,
  },
  confirmWarning: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmButtonYes: {
    flex: 1,
    backgroundColor: '#ef4444',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonNo: {
    flex: 1,
    backgroundColor: '#6b7280',
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Odds & Payout styles
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  oddsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  probabilityBadge: {
    backgroundColor: '#2d2d5a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  favoriteBadge: {
    backgroundColor: '#10b98130',
  },
  underdogBadge: {
    backgroundColor: '#f59e0b30',
  },
  probabilityText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  multiplierBadge: {
    backgroundColor: '#6366f130',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  multiplierText: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '700',
  },
  favoriteLabel: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  underdogLabel: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 8,
  },
  payoutCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#6366f150',
  },
  payoutTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  payoutLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  payoutValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  payoutMultiplier: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '700',
  },
});
