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
import { useWalletConnect } from '../../src/contexts/WalletConnectContext';
import { 
  BetData, 
  CREDIT_VALUE_EUR,
  maticToCredits,
} from '../../src/services/blockchain';
import { getCachedBets } from '../../src/services/blockchainCache';
import { format } from 'date-fns';
import { it, enUS } from 'date-fns/locale';

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, t } = useLanguage();
  const { 
    isConnected, 
    walletAddress, 
    credits, 
    creditsEur, 
    maticPrice,
    connectWallet 
  } = useWalletConnect();
  
  const [bets, setBets] = useState<BetData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('open');

  const dateLocale = language === 'it' ? it : enUS;

  const loadBets = useCallback(async (forceRefresh = false) => {
    try {
      // Use cached bets for faster loading
      const allBets = await getCachedBets(forceRefresh);
      
      // Sort by ID descending (newest first)
      allBets.sort((a, b) => b.id - a.id);
      
      // Apply filter
      let filteredBets = allBets;
      if (filter === 'open') {
        filteredBets = allBets.filter(b => !b.resolved && b.deadline > new Date());
      } else if (filter === 'voting') {
        // In on-chain, no voting phase, we show resolved but winner not declared
        filteredBets = allBets.filter(b => !b.resolved && b.deadline <= new Date());
      } else if (filter === 'completed') {
        filteredBets = allBets.filter(b => b.resolved);
      }
      
      setBets(filteredBets);
    } catch (error) {
      console.error('Error loading bets:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    loadBets(false); // Use cache on initial load
  }, [filter, loadBets]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadBets(true); // Force refresh from blockchain
  };

  const getStatus = (bet: BetData): string => {
    if (bet.resolved) {
      if (bet.winner === 3) return 'cancelled';
      return 'completed';
    }
    if (bet.deadline <= new Date()) return 'voting';
    return 'open';
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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return language === 'it' ? 'Aperta' : 'Open';
      case 'voting':
        return language === 'it' ? 'Da Risolvere' : 'Pending';
      case 'completed':
        return language === 'it' ? 'Completata' : 'Completed';
      case 'cancelled':
        return language === 'it' ? 'Annullata' : 'Cancelled';
      default:
        return status;
    }
  };

  // Convert MATIC pool to credits (1 credito = €0.01)
  const poolToCredits = (poolMatic: string): number => {
    const matic = parseFloat(poolMatic);
    return maticToCredits(matic, maticPrice);
  };

  const renderBet = ({ item }: { item: BetData }) => {
    const status = getStatus(item);
    const totalPoolMatic = parseFloat(item.poolA) + parseFloat(item.poolB);
    const totalPoolCredits = maticToCredits(totalPoolMatic, maticPrice);
    
    return (
      <TouchableOpacity
        style={styles.betCard}
        onPress={() => router.push(`/onchain-bet/${item.id}`)}
      >
        <View style={styles.betHeader}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {getStatusText(status)}
            </Text>
          </View>
          <View style={styles.onchainBadge}>
            <Ionicons name="cube" size={12} color="#8247e5" />
            <Text style={styles.onchainText}>On-Chain</Text>
          </View>
        </View>

        <Text style={styles.betTitle}>{item.title}</Text>
        
        <View style={styles.optionsPreview}>
          <View style={styles.optionRow}>
            <View style={[styles.optionBadge, { backgroundColor: '#10b981' }]}>
              <Text style={styles.optionBadgeText}>A</Text>
            </View>
            <Text style={styles.optionText} numberOfLines={1}>{item.optionA}</Text>
            <Text style={styles.optionPool}>{poolToCredits(item.poolA).toLocaleString()}</Text>
          </View>
          <View style={styles.optionRow}>
            <View style={[styles.optionBadge, { backgroundColor: '#ef4444' }]}>
              <Text style={styles.optionBadgeText}>B</Text>
            </View>
            <Text style={styles.optionText} numberOfLines={1}>{item.optionB}</Text>
            <Text style={styles.optionPool}>{poolToCredits(item.poolB).toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.betFooter}>
          <View style={styles.betStat}>
            <Ionicons name="wallet-outline" size={16} color="#10b981" />
            <Text style={[styles.betStatText, { color: '#10b981' }]}>
              {totalPoolCredits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'}
            </Text>
          </View>
          <View style={styles.betStat}>
            <Ionicons name="time-outline" size={16} color="#9ca3af" />
            <Text style={styles.betStatText}>
              {format(item.deadline, 'dd MMM HH:mm', { locale: dateLocale })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const FilterButton = ({ value, label }: { value: string; label: string }) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === value && styles.filterButtonActive]}
      onPress={() => setFilter(value)}
    >
      <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>BetSquad</Text>
          {isConnected ? (
            <View style={styles.balanceRow}>
              <Ionicons name="wallet" size={18} color="#10b981" />
              <Text style={styles.balance}>
                {credits.toLocaleString()} {language === 'it' ? 'crediti' : 'credits'} (€{creditsEur.toFixed(2)})
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.connectPrompt} onPress={connectWallet}>
              <Ionicons name="link" size={16} color="#8247e5" />
              <Text style={styles.connectText}>
                {language === 'it' ? 'Connetti Wallet' : 'Connect Wallet'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.polygonBadge}>
          <Text style={styles.polygonText}>⬡ Polygon</Text>
        </View>
      </View>

      <View style={styles.filterContainer}>
        <FilterButton value="open" label={language === 'it' ? 'Aperte' : 'Open'} />
        <FilterButton value="voting" label={language === 'it' ? 'Da Risolvere' : 'Pending'} />
        <FilterButton value="completed" label={language === 'it' ? 'Completate' : 'Completed'} />
        <FilterButton value="all" label={language === 'it' ? 'Tutte' : 'All'} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8247e5" />
          <Text style={styles.loadingText}>
            {language === 'it' ? 'Caricamento dalla blockchain...' : 'Loading from blockchain...'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={bets}
          renderItem={renderBet}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#8247e5" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color="#6b7280" />
              <Text style={styles.emptyText}>
                {language === 'it' ? 'Nessuna scommessa trovata' : 'No bets found'}
              </Text>
              <Text style={styles.emptySubtext}>
                {language === 'it' 
                  ? 'Crea la prima scommessa on-chain!'
                  : 'Create the first on-chain bet!'}
              </Text>
            </View>
          }
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  balance: {
    fontSize: 15,
    color: '#10b981',
    fontWeight: '600',
  },
  connectPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  connectText: {
    fontSize: 14,
    color: '#8247e5',
    fontWeight: '500',
  },
  polygonBadge: {
    backgroundColor: '#8247e520',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  polygonText: {
    color: '#8247e5',
    fontSize: 14,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
    flexWrap: 'wrap',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 14,
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
    borderColor: '#8247e530',
  },
  betHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  onchainBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8247e520',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  onchainText: {
    color: '#8247e5',
    fontSize: 11,
    fontWeight: '600',
  },
  betTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  optionsPreview: {
    gap: 8,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  optionText: {
    color: '#9ca3af',
    fontSize: 14,
    flex: 1,
  },
  optionPool: {
    color: '#6b7280',
    fontSize: 13,
  },
  betFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5a',
  },
  betStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  betStatText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    gap: 8,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 16,
    marginTop: 8,
  },
  emptySubtext: {
    color: '#4b5563',
    fontSize: 14,
  },
});
