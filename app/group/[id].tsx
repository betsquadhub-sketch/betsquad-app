import React, { useState, useEffect, useCallback } from 'react';
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
  FlatList,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getGroup,
  inviteToGroup,
  removeFromGroup,
  leaveGroup,
  deleteGroup,
  getBets,
  Group,
  Bet,
} from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { format } from 'date-fns';
import { it, enUS } from 'date-fns/locale';
import api from '../../src/services/api';

interface MemberWithAvatar {
  user_id: string;
  username: string;
  joined_at: string;
  avatar?: string | null;
}

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { language, t } = useLanguage();
  const dateLocale = language === 'it' ? it : enUS;

  const [group, setGroup] = useState<Group | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [membersWithAvatars, setMembersWithAvatars] = useState<MemberWithAvatar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [activeTab, setActiveTab] = useState<'open' | 'members' | 'completed'>('open');

  // Separate bets into open and completed
  const openBets = bets.filter(b => b.status === 'open' || b.status === 'voting');
  const completedBets = bets.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'withdrawn');

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [groupData, betsData] = await Promise.all([
        getGroup(id),
        getBets(undefined, id),
      ]);
      setGroup(groupData);
      setBets(betsData);
      
      // Load member avatars
      if (groupData.members) {
        loadMemberAvatars(groupData.members);
      }
    } catch (error) {
      console.error('Error loading group:', error);
      Alert.alert(t('error'), language === 'it' ? 'Impossibile caricare il gruppo' : 'Failed to load group');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id, t, language]);

  const loadMemberAvatars = async (members: any[]) => {
    const AVATAR_CACHE_KEY = `avatars_cache_${id}`;
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
    
    try {
      // Check cache
      const cachedData = await AsyncStorage.getItem(AVATAR_CACHE_KEY);
      if (cachedData) {
        const { avatars, timestamp } = JSON.parse(cachedData);
        const now = Date.now();
        
        // Use cache if less than 1 hour old
        if (now - timestamp < CACHE_DURATION) {
          setMembersWithAvatars(members.map(m => ({
            ...m,
            avatar: avatars[m.user_id] || null
          })));
          return;
        }
      }
      
      // Fetch fresh avatars
      const avatarsMap: Record<string, string | null> = {};
      
      for (const member of members) {
        try {
          const response = await api.get(`/users/${member.user_id}/avatar`);
          avatarsMap[member.user_id] = response.data?.avatar || null;
        } catch (e) {
          avatarsMap[member.user_id] = null;
        }
      }
      
      // Save to cache
      await AsyncStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify({
        avatars: avatarsMap,
        timestamp: Date.now()
      }));
      
      setMembersWithAvatars(members.map(m => ({
        ...m,
        avatar: avatarsMap[m.user_id] || null
      })));
    } catch (error) {
      // Fallback: show members without avatars
      setMembersWithAvatars(members.map(m => ({ ...m, avatar: null })));
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    // Clear avatar cache to force refresh
    AsyncStorage.removeItem(`avatars_cache_${id}`);
    loadData();
  };

  const handleInvite = async () => {
    if (!inviteUsername.trim() || !id) {
      Alert.alert(t('error'), t('enterUsername'));
      return;
    }

    setIsInviting(true);
    try {
      await inviteToGroup(id, inviteUsername);
      Alert.alert(t('success'), t('memberInvited'));
      setInviteUsername('');
      setShowInviteInput(false);
      loadData();
    } catch (error: any) {
      Alert.alert(t('error'), error.response?.data?.detail || t('error'));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string, username: string) => {
    if (!id) return;
    
    Alert.alert(
      language === 'it' ? 'Rimuovi membro' : 'Remove member',
      language === 'it' ? `Vuoi rimuovere @${username} dal gruppo?` : `Remove @${username} from the group?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: language === 'it' ? 'Rimuovi' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFromGroup(id, userId);
              loadData();
            } catch (error: any) {
              Alert.alert(t('error'), error.response?.data?.detail || t('error'));
            }
          },
        },
      ]
    );
  };

  const handleLeaveGroup = () => {
    if (!id) return;
    
    Alert.alert(
      t('leaveGroup'),
      language === 'it' ? 'Sei sicuro di voler lasciare questo gruppo?' : 'Are you sure you want to leave this group?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('leaveGroup'),
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup(id);
              Alert.alert(t('success'), t('leftGroup'));
              router.back();
            } catch (error: any) {
              Alert.alert(t('error'), error.response?.data?.detail || t('error'));
            }
          },
        },
      ]
    );
  };

  const handleDeleteGroup = () => {
    if (!id) return;
    
    Alert.alert(
      t('deleteGroup'),
      language === 'it' ? 'Questa azione è irreversibile. Vuoi procedere?' : 'This action cannot be undone. Proceed?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGroup(id);
              Alert.alert(t('success'), t('groupDeleted'));
              router.back();
            } catch (error: any) {
              Alert.alert(t('error'), error.response?.data?.detail || t('error'));
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return '#10b981';
      case 'voting': return '#f59e0b';
      case 'completed': return '#6366f1';
      case 'cancelled': return '#ef4444';
      case 'withdrawn': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open': return t('statusOpen');
      case 'voting': return t('statusVoting');
      case 'completed': return t('statusCompleted');
      case 'cancelled': return t('statusCancelled');
      case 'withdrawn': return t('statusWithdrawn');
      default: return status;
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{language === 'it' ? 'Gruppo non trovato' : 'Group not found'}</Text>
      </View>
    );
  }

  const isCreator = group.creator_id === user?.id;

  const renderBetItem = ({ item }: { item: Bet }) => (
    <TouchableOpacity
      style={styles.betCard}
      onPress={() => router.push(`/bet/${item.id}`)}
    >
      <View style={styles.betHeader}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.betTitle}>{item.title}</Text>
      <View style={styles.betFooter}>
        <View style={styles.betStat}>
          <Ionicons name="people-outline" size={14} color="#9ca3af" />
          <Text style={styles.betStatText}>{item.participant_count}</Text>
        </View>
        <View style={styles.betStat}>
          <Ionicons name="wallet-outline" size={14} color="#9ca3af" />
          <Text style={styles.betStatText}>{item.total_pool.toLocaleString()}</Text>
        </View>
      </View>
      {/* Show winner for completed bets */}
      {item.status === 'completed' && item.winning_option_id && (
        <View style={styles.winnerBadge}>
          <Ionicons name="trophy" size={14} color="#f59e0b" />
          <Text style={styles.winnerText}>
            {item.options.find(o => o.id === item.winning_option_id)?.text || 'Winner'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderMemberItem = ({ item }: { item: MemberWithAvatar }) => {
    const isSelf = item.user_id === user?.id;
    const isMemberCreator = item.user_id === group.creator_id;
    
    return (
      <View style={styles.memberCard}>
        <View style={styles.memberInfo}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.memberAvatar} />
          ) : (
            <View style={styles.memberAvatarPlaceholder}>
              <Ionicons name="person" size={24} color="#6366f1" />
            </View>
          )}
          <View style={styles.memberDetails}>
            <Text style={styles.memberName}>
              @{item.username} {isSelf && `(${t('you')})`}
            </Text>
            <Text style={styles.memberJoined}>
              {t('joinedAt')} {format(new Date(item.joined_at), 'dd MMM yyyy', { locale: dateLocale })}
            </Text>
          </View>
        </View>
        <View style={styles.memberActions}>
          {isMemberCreator && (
            <View style={styles.creatorBadge}>
              <Text style={styles.creatorText}>{t('admin')}</Text>
            </View>
          )}
          {isCreator && !isSelf && !isMemberCreator && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveMember(item.user_id, item.username)}
            >
              <Ionicons name="close-circle" size={24} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.groupName}>{group.name}</Text>
          {group.description && (
            <Text style={styles.groupDescription} numberOfLines={1}>{group.description}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => {
            Alert.alert(
              language === 'it' ? 'Azioni' : 'Actions',
              '',
              isCreator ? [
                { text: t('inviteMember'), onPress: () => setShowInviteInput(true) },
                { text: t('deleteGroup'), style: 'destructive', onPress: handleDeleteGroup },
                { text: t('cancel'), style: 'cancel' },
              ] : [
                { text: t('leaveGroup'), style: 'destructive', onPress: handleLeaveGroup },
                { text: t('cancel'), style: 'cancel' },
              ]
            );
          }}
        >
          <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{group.member_count}</Text>
          <Text style={styles.statLabel}>{t('members')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{openBets.length}</Text>
          <Text style={styles.statLabel}>{t('statusOpen')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{completedBets.length}</Text>
          <Text style={styles.statLabel}>{t('statusCompleted')}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'open' && styles.tabActive]}
          onPress={() => setActiveTab('open')}
        >
          <Text style={[styles.tabText, activeTab === 'open' && styles.tabTextActive]}>
            {t('statusOpen')} ({openBets.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'members' && styles.tabActive]}
          onPress={() => setActiveTab('members')}
        >
          <Text style={[styles.tabText, activeTab === 'members' && styles.tabTextActive]}>
            {t('members')} ({group.member_count})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
            {language === 'it' ? 'Terminate' : 'Completed'} ({completedBets.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'open' && (
        <FlatList
          data={openBets}
          renderItem={renderBetItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#6366f1" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="trophy-outline" size={48} color="#6b7280" />
              <Text style={styles.emptyText}>
                {language === 'it' ? 'Nessuna scommessa aperta' : 'No open bets'}
              </Text>
            </View>
          }
        />
      )}

      {activeTab === 'members' && (
        <FlatList
          data={membersWithAvatars}
          renderItem={renderMemberItem}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#6366f1" />
          }
          ListHeaderComponent={
            showInviteInput ? (
              <View style={styles.inviteContainer}>
                <TextInput
                  style={styles.inviteInput}
                  placeholder={t('enterUsername')}
                  placeholderTextColor="#6b7280"
                  value={inviteUsername}
                  onChangeText={setInviteUsername}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={handleInvite}
                  disabled={isInviting}
                >
                  {isInviting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelInviteButton}
                  onPress={() => {
                    setShowInviteInput(false);
                    setInviteUsername('');
                  }}
                >
                  <Ionicons name="close" size={20} color="#9ca3af" />
                </TouchableOpacity>
              </View>
            ) : isCreator ? (
              <TouchableOpacity
                style={styles.addMemberButton}
                onPress={() => setShowInviteInput(true)}
              >
                <Ionicons name="person-add" size={20} color="#6366f1" />
                <Text style={styles.addMemberText}>{t('inviteMember')}</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {activeTab === 'completed' && (
        <FlatList
          data={completedBets}
          renderItem={renderBetItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#6366f1" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#6b7280" />
              <Text style={styles.emptyText}>
                {language === 'it' ? 'Nessuna scommessa terminata' : 'No completed bets'}
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f3d',
  },
  backButton: {
    padding: 8,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  groupName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  groupDescription: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1f1f3d',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
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
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#6366f1',
  },
  tabText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  betCard: {
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  betHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  betTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  betFooter: {
    flexDirection: 'row',
    gap: 16,
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
  winnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5a',
  },
  winnerText: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  memberAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2d2d5a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  memberDetails: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  memberJoined: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creatorBadge: {
    backgroundColor: '#6366f130',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  creatorText: {
    color: '#6366f1',
    fontSize: 12,
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
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
  inviteContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: '#2d2d5a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  inviteButton: {
    backgroundColor: '#6366f1',
    width: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelInviteButton: {
    backgroundColor: '#2d2d5a',
    width: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6366f130',
    borderStyle: 'dashed',
  },
  addMemberText: {
    color: '#6366f1',
    fontSize: 15,
    fontWeight: '500',
  },
});
