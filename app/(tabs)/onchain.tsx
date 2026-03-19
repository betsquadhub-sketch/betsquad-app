import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { useBlockchain } from '../../src/contexts/BlockchainContext';
import {
  getAllBets,
  getBetCount,
  BetData,
  CREDIT_VALUE_EUR,
} from '../../src/services/blockchain';

export default function OnChainBets() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { isConnected, maticPrice, walletAddress } = useBlockchain();
  
  const [bets, setBets] = useState<BetData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');

  const loadBets = useCallback(async () => {
    try {
      const count = await getBetCount();
      if (count > 0) {
        const allBets = await getAllBets(1, count);
        setBets(allBets.reverse()); // Newest first
      } else {
        setBets([]);
      }
    } catch (error) {
      console.error('Error loading bets:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBets();
  }, [loadBets]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadBets();
  };

  const filteredBets = bets.filter(bet => {
    const isOpen = !bet.resolved && bet.deadline > new Date();
    if (filter === 'open') return isOpen;
    if (filter === 'resolved') return bet.resolved;
    return true;
  });

  const renderBet = ({ item }: { item: BetData }) => {
    const totalPoolMatic = parseFloat(item.poolA) + parseFloat(item.poolB);
    const totalPoolCredits = Math.floor((totalPoolMatic * maticPrice) / CREDIT_VALUE_EUR);
    const isOpen = !item.resolved && item.deadline > new Date();
    const isCreator = walletAddress?.toLowerCase() === item.creator.toLowerCase();

    return (
      <TouchableOpacity
        style={styles.betCard}
        onPress={() => router.push(`/onchain-bet/${item.id}`)}
      >
        <View style={styles.betHeader}>
          <View style={[
            styles.statusBadge,
            { backgroundColor: item.resolved ? (item.winner === 3 ? '#ef4444' : '#6366f1') : '#10b981' }
          ]}>
            <Text style={styles.statusText}>
              {item.resolved 
                ? (item.winner === 3 ? (language === 'it' ? 'Annullata' : 'Cancelled') : (language === 'it' ? 'Risolta' : 'Resolved'))
                : (language === 'it' ? 'Aperta' : 'Open')}
            </Text>
          </View>
          {isCreator && (
            <View style={styles.creatorBadge}>
              <Ionicons name="star" size={12} color="#fbbf24" />
              <Text style={styles.creatorText}>{language === 'it' ? 'Creata da te' : 'Created by you'}</Text>
            </View>
          )}
        </View>

        <Text style={styles.betTitle}>{item.title}</Text>

        <View style={styles.optionsPreview}>
          <View style={styles.optionPreview}>
            <View style={[styles.optionDot, { backgroundColor: '#10b981' }]} />
            <Text style={styles.optionText} numberOfLines={1}>{item.optionA}</Text>
          </View>
          <Text style={styles.vsText}>vs</Text>
          <View style={styles.optionPreview}>
            <View style={[styles.optionDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.optionText} numberOfLines={1}>{item.optionB}</Text>
          </View>
        </View>

        <View style={styles.betFooter}>
          <View style={styles.poolInfo}>
            <Ionicons name="trophy" size={16} color="#fbbf24" />
            <Text style={styles.poolText}>
              {totalPoolCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}
            </Text>
          </View>
          <View style={styles.deadlineInfo}>
            <Ionicons name="time-outline" size={14} color="#9ca3af" />
            <Text style={styles.deadlineText}>
              {item.deadline.toLocaleDateString(language === 'it' ? 'it-IT' : 'en-US', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>On-Chain</Text>
          <Text style={styles.headerSubtitle}>
            {language === 'it' ? 'Scommesse su Polygon' : 'Bets on Polygon'}
          </Text>
        </View>
        <View style={styles.chainBadge}>
          <Text style={styles.chainBadgeText}>⬡ Polygon</Text>
        </View>
      </View>

      {/* Wallet Status */}
      {!isConnected && (
        <TouchableOpacity 
          style={styles.walletWarning}
          onPress={() => router.push('/(tabs)/wallet')}
        >
          <Ionicons name="wallet-outline" size={24} color="#f59e0b" />
          <Text style={styles.walletWarningText}>
            {language === 'it' ? 'Connetti wallet per scommettere' : 'Connect wallet to bet'}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
        </TouchableOpacity>
      )}

      {/* Filters */}
      <View style={styles.filters}>
        {(['open', 'resolved', 'all'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'open' ? (language === 'it' ? 'Aperte' : 'Open') :
               f === 'resolved' ? (language === 'it' ? 'Risolte' : 'Resolved') :
               (language === 'it' ? 'Tutte' : 'All')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bets List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#8247e5" />
          <Text style={styles.loadingText}>
            {language === 'it' ? 'Caricamento dalla blockchain...' : 'Loading from blockchain...'}
          </Text>
        </View>
      ) : filteredBets.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="cube-outline" size={64} color="#6b7280" />
          <Text style={styles.emptyTitle}>
            {language === 'it' ? 'Nessuna scommessa on-chain' : 'No on-chain bets'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {language === 'it' ? 'Crea la prima scommessa!' : 'Create the first bet!'}
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/(tabs)/create')}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createButtonText}>
              {language === 'it' ? 'Crea Scommessa' : 'Create Bet'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredBets}
          renderItem={renderBet}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8247e5" />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8247e5',
    marginTop: 2,
  },
  chainBadge: {
    backgroundColor: '#8247e520',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chainBadgeText: {
    color: '#8247e5',
    fontSize: 12,
    fontWeight: '600',
  },
  walletWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b15',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  walletWarningText: {
    flex: 1,
    color: '#f59e0b',
    fontSize: 14,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1f1f3d',
  },
  filterButtonActive: {
    backgroundColor: '#8247e5',
  },
  filterText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  betCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  betHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  creatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fbbf2420',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  creatorText: {
    color: '#fbbf24',
    fontSize: 10,
  },
  betTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  optionsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionPreview: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  optionText: {
    color: '#9ca3af',
    fontSize: 13,
    flex: 1,
  },
  vsText: {
    color: '#6b7280',
    fontSize: 12,
    marginHorizontal: 8,
  },
  betFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5a',
  },
  poolInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  poolText: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '600',
  },
  deadlineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8247e5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
