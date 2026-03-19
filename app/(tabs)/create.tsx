import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyGroups, Group } from '../../src/services/api';
import { useLanguage } from '../../src/contexts/LanguageContext';
import { useWalletConnect } from '../../src/contexts/WalletConnectContext';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function Create() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { isConnected, walletAddress, signAndSendContractTx } = useWalletConnect();
  
  const [title, setTitle] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [deadline, setDeadline] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const data = await getMyGroups();
      setGroups(data);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const handleCreate = async () => {
    // Validazione
    if (!title.trim()) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', language === 'it' ? 'Inserisci un titolo' : 'Enter a title');
      return;
    }

    if (!optionA.trim() || !optionB.trim()) {
      Alert.alert(language === 'it' ? 'Errore' : 'Error', language === 'it' ? 'Inserisci entrambe le opzioni' : 'Enter both options');
      return;
    }

    if (!isConnected) {
      Alert.alert(
        language === 'it' ? 'Wallet Non Connesso' : 'Wallet Not Connected',
        language === 'it' ? 'Vai al Wallet e connetti il tuo wallet per creare scommesse on-chain' : 'Go to Wallet and connect your wallet to create on-chain bets',
        [
          { text: 'OK', onPress: () => router.push('/(tabs)/wallet') },
        ]
      );
      return;
    }

    setIsLoading(true);
    try {
      const deadlineTimestamp = Math.floor(deadline.getTime() / 1000);
      
      const tx = await signAndSendContractTx(
        'createBet',
        [title.trim(), optionA.trim(), optionB.trim(), deadlineTimestamp]
      );
      
      if (!tx) {
        setIsLoading(false);
        return;
      }
      
      Alert.alert(
        language === 'it' ? 'Transazione Inviata!' : 'Transaction Sent!',
        language === 'it' 
          ? `La tua scommessa sta venendo creata on-chain.\n\nTX: ${tx.hash.slice(0, 20)}...`
          : `Your bet is being created on-chain.\n\nTX: ${tx.hash.slice(0, 20)}...`,
        [
          {
            text: 'Polygonscan',
            onPress: () => Linking.openURL(`https://polygonscan.com/tx/${tx.hash}`),
          },
          { text: 'OK' },
        ]
      );

      // Aspetta conferma
      await tx.wait();
      
      Alert.alert(
        language === 'it' ? 'Scommessa Creata!' : 'Bet Created!',
        language === 'it' 
          ? 'La tua scommessa è ora live sulla blockchain!'
          : 'Your bet is now live on the blockchain!',
        [
          { text: 'OK', onPress: () => router.push('/(tabs)') },
        ]
      );

      // Reset form
      setTitle('');
      setOptionA('');
      setOptionB('');
      setDeadline(new Date(Date.now() + 24 * 60 * 60 * 1000));
    } catch (error: any) {
      console.error('Create bet error:', error);
      const message = error.reason || error.message || (language === 'it' ? 'Errore durante la creazione' : 'Error creating bet');
      Alert.alert(language === 'it' ? 'Errore' : 'Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {language === 'it' ? 'Crea Scommessa' : 'Create Bet'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {language === 'it' ? '100% On-Chain su Polygon' : '100% On-Chain on Polygon'}
          </Text>
        </View>

        {/* Wallet Status */}
        {!isConnected ? (
          <TouchableOpacity 
            style={styles.walletWarning}
            onPress={() => router.push('/(tabs)/wallet')}
          >
            <Ionicons name="warning" size={24} color="#f59e0b" />
            <View style={styles.walletWarningContent}>
              <Text style={styles.walletWarningTitle}>
                {language === 'it' ? 'Wallet Non Connesso' : 'Wallet Not Connected'}
              </Text>
              <Text style={styles.walletWarningText}>
                {language === 'it' ? 'Tocca qui per connettere il wallet' : 'Tap here to connect wallet'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
          </TouchableOpacity>
        ) : (
          <View style={styles.walletConnected}>
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
            <Text style={styles.walletConnectedText}>
              {language === 'it' ? 'Wallet connesso:' : 'Wallet connected:'} {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </Text>
          </View>
        )}

        <View style={styles.form}>
          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {language === 'it' ? 'Domanda / Titolo' : 'Question / Title'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={language === 'it' ? 'Es: Chi vincerà la partita?' : 'E.g.: Who will win the match?'}
              placeholderTextColor="#6b7280"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {/* Option A */}
          <View style={styles.inputGroup}>
            <View style={styles.optionLabelRow}>
              <View style={[styles.optionBadge, { backgroundColor: '#10b981' }]}>
                <Text style={styles.optionBadgeText}>A</Text>
              </View>
              <Text style={styles.label}>
                {language === 'it' ? 'Opzione A' : 'Option A'}
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder={language === 'it' ? 'Es: Squadra Casa' : 'E.g.: Home Team'}
              placeholderTextColor="#6b7280"
              value={optionA}
              onChangeText={setOptionA}
            />
          </View>

          {/* Option B */}
          <View style={styles.inputGroup}>
            <View style={styles.optionLabelRow}>
              <View style={[styles.optionBadge, { backgroundColor: '#ef4444' }]}>
                <Text style={styles.optionBadgeText}>B</Text>
              </View>
              <Text style={styles.label}>
                {language === 'it' ? 'Opzione B' : 'Option B'}
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder={language === 'it' ? 'Es: Squadra Ospite' : 'E.g.: Away Team'}
              placeholderTextColor="#6b7280"
              value={optionB}
              onChangeText={setOptionB}
            />
          </View>

          {/* Deadline */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {language === 'it' ? 'Scadenza' : 'Deadline'}
            </Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="#9ca3af" />
              <Text style={styles.dateText}>
                {deadline.toLocaleDateString(language === 'it' ? 'it-IT' : 'en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={deadline}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (event.type === 'set' && date) {
                  const newDeadline = new Date(date);
                  newDeadline.setHours(deadline.getHours());
                  newDeadline.setMinutes(deadline.getMinutes());
                  setDeadline(newDeadline);
                  if (Platform.OS === 'android') {
                    setTimeout(() => setShowTimePicker(true), 100);
                  }
                }
              }}
              minimumDate={new Date()}
            />
          )}

          {showTimePicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={deadline}
              mode="time"
              display="default"
              onChange={(event, date) => {
                setShowTimePicker(false);
                if (event.type === 'set' && date) {
                  const newDeadline = new Date(deadline);
                  newDeadline.setHours(date.getHours());
                  newDeadline.setMinutes(date.getMinutes());
                  setDeadline(newDeadline);
                }
              }}
            />
          )}

          {/* On-Chain Info */}
          <View style={styles.infoBox}>
            <Ionicons name="cube" size={20} color="#8247e5" />
            <Text style={styles.infoText}>
              {language === 'it' 
                ? 'Questa scommessa sarà creata on-chain su Polygon. Richiede una transazione dal tuo wallet (~0.001 MATIC di gas).'
                : 'This bet will be created on-chain on Polygon. Requires a transaction from your wallet (~0.001 MATIC gas).'}
            </Text>
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[
              styles.createButton, 
              (isLoading || !isConnected) && styles.createButtonDisabled
            ]}
            onPress={handleCreate}
            disabled={isLoading || !isConnected}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="rocket" size={20} color="#fff" />
                <Text style={styles.createButtonText}>
                  {language === 'it' ? 'Crea On-Chain' : 'Create On-Chain'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8247e5',
    marginTop: 4,
    fontWeight: '600',
  },
  walletWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f59e0b30',
    gap: 12,
  },
  walletWarningContent: {
    flex: 1,
  },
  walletWarningTitle: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '600',
  },
  walletWarningText: {
    color: '#f59e0b',
    fontSize: 12,
    opacity: 0.8,
  },
  walletConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b98115',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    gap: 8,
  },
  walletConnectedText: {
    color: '#10b981',
    fontSize: 14,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2d2d5a',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f3d',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2d2d5a',
    gap: 12,
  },
  dateText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#8247e515',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#8247e530',
  },
  infoText: {
    flex: 1,
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
  },
  createButton: {
    flexDirection: 'row',
    backgroundColor: '#8247e5',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
