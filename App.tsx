import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  TextInput,
  Button,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import SmsListener from './src/utils/SmsListener';
import { parseSmsBody } from './src/utils/smsParser';
import { analyzeSmsWithGemini } from './src/services/GeminiService';
import { syncMissedSms, updateLastSyncTimestamp } from './src/services/SmsSyncService';
import { StorageService } from './src/services/StorageService';
import { PermissionsAndroid, Platform } from 'react-native';
import { useEffect } from 'react';

export default function App() {
  const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);

  const [processedExpenses, setProcessedExpenses] = useState([]);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [splitCount, setSplitCount] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [showProcessed, setShowProcessed] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // 1. Load Data on Mount
  useEffect(() => {
    const loadData = async () => {
      const pending = await StorageService.loadPending();
      const processed = await StorageService.loadProcessed();
      setPendingExpenses(pending);
      setProcessedExpenses(processed);
      setDataLoaded(true);
    };
    loadData();
  }, []);

  // 2. Save Data on Change
  useEffect(() => {
    if (dataLoaded) {
      StorageService.savePending(pendingExpenses);
    }
  }, [pendingExpenses, dataLoaded]);

  useEffect(() => {
    if (dataLoaded) {
      StorageService.saveProcessed(processedExpenses);
    }
  }, [processedExpenses, dataLoaded]);

  useEffect(() => {
    let subscription;

    const initSMS = async () => {
      if (Platform.OS !== 'android') return;

      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS // Added READ permission
      ]);

      if (
        granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] !== PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.READ_SMS] !== PermissionsAndroid.RESULTS.GRANTED
      ) {
        Alert.alert('Permission Denied', 'SMS access is required.');
        return;
      }

      // ✅ Sync Missed SMS
      await syncMissedSms((newExpense) => {
        setPendingExpenses(prev => {
          // Avoid duplicates
          if (prev.some(e => e.id === newExpense.id)) return prev;
          return [...prev, newExpense];
        });
      });

      // ✅ SMS Listener
      subscription = SmsListener.addListener((message: any) => {
        console.log("📩 SMS Received:", message.body);
        const text = message.body;

        const isDebit = /debited/i.test(text);

        if (isDebit) {
          // Fire and Forget / Async handling
          (async () => {
            let title = '';
            let amount = 0;
            let type = 'debit';
            let geminiResult = null;

            // 1. Try Gemini First
            try {
              geminiResult = await analyzeSmsWithGemini(text);
              if (geminiResult && geminiResult.amount > 0) {
                console.log("✨ Gemini Analysis:", geminiResult);
                title = geminiResult.merchant;
                amount = geminiResult.amount;
                // Use Gemini's type if available, ensuring it's debit for now based on outer check
                // or trust Gemini entirely if we remove the outer check later.
              }
            } catch (e) {
              console.log("Gemini failed, falling back", e);
            }

            // 2. Fallback to Local Regex if Gemini failed
            if (!amount) {
              const localResult = parseSmsBody(text, message.originatingAddress);
              if (localResult.amount && localResult.amount > 0) {
                title = localResult.title;
                amount = localResult.amount;
              }
            }

            if (amount > 0) {
              const newExpense = {
                id: Date.now().toString(),
                title: title,
                amount: amount,
                source: message.originatingAddress || 'Bank',
                date: new Date().toLocaleDateString(),
                type: type,
              };

              setPendingExpenses((prev: any[]) => [...prev, newExpense]);

              const alertTitle = geminiResult ? "✨ AI Transaction Detected" : "💸 Transaction Detected";
              Alert.alert(alertTitle, `Debit: ₹${amount} added\n(${title})`);

              // ✅ Mark as processed so SyncService doesn't fetch it again
              updateLastSyncTimestamp(Date.now());
            }
          })();
        }
      });
    };

    initSMS();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  const addExpense = () => {
    if (!title || !amount || !source) return Alert.alert('Error', 'Please fill all fields');

    const newExpense = {
      id: Date.now().toString(),
      title,
      amount: parseFloat(amount),
      source,
      date: new Date().toLocaleDateString(),
    };

    setPendingExpenses(prev => [...prev, newExpense]);
    setTitle('');
    setAmount('');
    setSource('');
    setModalVisible(false);
  };

  const deleteExpense = (id) => {
    setPendingExpenses(prev => prev.filter(exp => exp.id !== id));
  };

  const handleFullyMine = (expense) => {
    Alert.alert("Expense Processed", `✅ ₹${expense.amount.toFixed(2)} marked as Fully Yours`);
    setProcessedExpenses(prev => [...prev, { ...expense, processed: 'Fully Mine' }]);
    deleteExpense(expense.id);
  };
  const deleteProcessed = (id) => {
    const expense = processedExpenses.find(e => e.id === id);
    setProcessedExpenses(prev => prev.filter(e => e.id !== id));
    Alert.alert("Deleted", `"${expense?.title}" removed from processed expenses`);
  };

  const handleSplit = (expense) => {
    const count = parseInt(splitCount[expense.id]);
    if (!count || count <= 0) return alert('Enter valid number of people');

    const splitAmount = expense.amount / count;
    Alert.alert("Expense Split", `✅ ₹${splitAmount.toFixed(2)} is yours (split between ${count})`);

    setProcessedExpenses(prev => [
      ...prev,
      { ...expense, processed: `Split with ${count}`, amount: splitAmount },
    ]);
    deleteExpense(expense.id);
  };

  const renderExpense = ({ item }) => (
    <View style={styles.expenseCard}>
      <Text style={styles.title}>{item.title}</Text>
      <Text>Source: {item.source}</Text>
      <Text>Date: {item.date}</Text>
      <Text>Amount: ₹{item.amount.toFixed(2)}</Text>

      {!showProcessed && (
        <>
          {/* Split input only */}
          <TextInput
            placeholder="Split with (e.g. 2)"
            placeholderTextColor="#888"
            style={styles.input}
            keyboardType="number-pad"
            value={splitCount[item.id] || ''}
            onChangeText={(text) =>
              setSplitCount(prev => ({ ...prev, [item.id]: text }))
            }
          />


          {/* All buttons in one row */}
          <View style={styles.actions}>
            <Button title="Split" onPress={() => handleSplit(item)} />
            <Button title="Fully Mine" onPress={() => handleFullyMine(item)} />
            <Button title="Delete" color="red" onPress={() => deleteExpense(item.id)} />
          </View>
        </>
      )}

      {showProcessed && (
        <>
          <Text style={{ marginTop: 10, color: '#333' }}>
            ✅ Processed: {item.processed}
          </Text>

          <View style={styles.actions}>
            <Button
              title="🗑️ Delete"
              color="red"
              onPress={() => deleteProcessed(item.id)}
            />
          </View>
        </>
      )}
    </View>
  );


  return (
    <SafeAreaView style={styles.container}>
      {/* <View style={styles.headerRow}> */}
      {/* <Button title="➕ Add Expense" onPress={() => setModalVisible(true)} /> */}
      {/* <Button
          title={showProcessed ? '⬅️ Show Pending' : '✅ View Processed'}
          onPress={() => setShowProcessed(!showProcessed)}
        />
      </View> */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[
            styles.toggleButtonCustom,
            !showProcessed && styles.activeButton,
          ]}
          onPress={() => setShowProcessed(false)}
        >
          <Text style={[
            styles.toggleButtonText,
            !showProcessed && styles.activeText,
          ]}>
            📂 Pending
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleButtonCustom,
            showProcessed && styles.activeButton,
          ]}
          onPress={() => setShowProcessed(true)}
        >
          <Text style={[
            styles.toggleButtonText,
            showProcessed && styles.activeText,
          ]}>
            ✅ Processed
          </Text>
        </TouchableOpacity>
      </View>




      <Text style={styles.headerText}>
        {showProcessed ? 'Processed Expenses' : 'Pending Expenses'}
      </Text>

      <FlatList
        data={showProcessed ? processedExpenses : pendingExpenses}
        keyExtractor={item => item.id}
        renderItem={renderExpense}
        ListEmptyComponent={<Text style={styles.empty}>No expenses to show</Text>}
      />

      {/* Modal for Adding Expense */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add New Expense</Text>

            <TextInput
              placeholder="🍔 Expense Name (e.g. Zomato Order)"
              placeholderTextColor="#888"
              value={title}
              onChangeText={setTitle}
              style={styles.input}
            />

            <TextInput
              placeholder="💰 Amount (e.g. 450)"
              placeholderTextColor="#888"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              style={styles.input}
            />

            <TextInput
              placeholder="🏦 Source (optional, e.g. HDFC, UPI)"
              placeholderTextColor="#888"
              value={source}
              onChangeText={setSource}
              style={styles.input}
            />


            <Text style={styles.autoDate}>📅 Date: {new Date().toLocaleDateString()}</Text>

            <View style={styles.modalButtons}>
              <Button title="Cancel" color="grey" onPress={() => setModalVisible(false)} />
              <Button title="Save" onPress={addExpense} />
            </View>
          </View>
        </View>
      </Modal>
      <View style={styles.fabContainer}>
        <Button title="＋" onPress={() => setModalVisible(true)} color="#2196F3" />
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1, backgroundColor: '#f9f9f9' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  expenseCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 1,
  },
  title: { fontSize: 18, fontWeight: 'bold' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  splitSection: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  empty: { textAlign: 'center', color: '#777', marginTop: 20 },
  modalContainer: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '85%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  autoDate: {
    textAlign: 'center',
    color: '#555',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
    width: '100%',
    color: '#000', // ensure text input is visible
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 10,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    borderRadius: 50,
    overflow: 'hidden',
    width: 70,
    height: 70,
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    elevation: 5,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 10,
    paddingHorizontal: 10,
  },

  toggleButton: {
    flex: 1,
    marginHorizontal: 5,
  },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },

  toggleButtonCustom: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#ccc',
    borderRadius: 6,
  },

  activeButton: {
    backgroundColor: '#2196F3',
  },

  toggleButtonText: {
    color: '#444',
    fontWeight: 'bold',
  },

  activeText: {
    color: '#fff',
  },





});
