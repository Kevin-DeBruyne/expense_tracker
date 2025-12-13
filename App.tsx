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

import { PieChart } from 'react-native-gifted-charts';
import NetInfo from "@react-native-community/netinfo";

export default function App() {
  const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);

  const [processedExpenses, setProcessedExpenses] = useState<any[]>([]);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [splitCount, setSplitCount] = useState<{ [key: string]: string }>({});
  const [modalVisible, setModalVisible] = useState(false);
  // Replaced showProcessed with viewMode
  const [viewMode, setViewMode] = useState('pending'); // 'pending' | 'processed' | 'analysis'
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  // Debug Tool State
  const [debugModalVisible, setDebugModalVisible] = useState(false);
  const [debugText, setDebugText] = useState('');

  // Category State
  const [categories, setCategories] = useState<string[]>([]);
  const [editCategoryModalVisible, setEditCategoryModalVisible] = useState(false);
  const [selectedExpenseForEdit, setSelectedExpenseForEdit] = useState<any>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedMonthForAnalysis, setSelectedMonthForAnalysis] = useState<string | null>(null);

  const DEFAULT_CATEGORIES = ["Food", "Travel", "Bills", "Shopping", "Entertainment", "Health", "Education", "Investment", "Fuel"];

  const CATEGORY_COLORS: { [key: string]: string } = {
    Food: '#FF6384',
    Travel: '#36A2EB',
    Bills: '#FFCE56',
    Shopping: '#4BC0C0',
    Entertainment: '#9966FF',
    Health: '#FF9F40',
    Education: '#C9CBCF',
    Investment: '#7BC043',
    Fuel: '#E63946',
    Uncategorized: '#888888',
  };

  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  // 1. Load Data on Mount
  useEffect(() => {
    const loadData = async () => {
      const pending = await StorageService.loadPending();
      const processed = await StorageService.loadProcessed();
      const loadedCategories = await StorageService.loadCategories();

      setPendingExpenses(pending);
      setProcessedExpenses(processed);
      if (loadedCategories && loadedCategories.length > 0) {
        setCategories(loadedCategories);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
      setDataLoaded(true);
    };
    loadData();
  }, []);

  const enhancePendingExpenses = async () => {
    // Load fresh from storage to be sure
    const pending = await StorageService.loadPending();
    let updated = false;
    const enhancedList = await Promise.all(pending.map(async (expense: any) => {
      if (expense.requiresEnhancement && expense.originalBody) {
        try {
          console.log("🔄 Enhancing offline expense:", expense.id);
          const result = await analyzeSmsWithGemini(expense.originalBody);
          if (result && result.amount > 0) {
            updated = true;

            let category = result.category || 'Uncategorized';
            // Smart History Check
            try {
              const historicalCategory = await StorageService.getCategoryForMerchant(result.merchant);
              if (historicalCategory) category = historicalCategory;
            } catch (e) { }

            return {
              ...expense,
              title: result.merchant, // Improved Merchant Name
              category: category,     // Improved Category
              requiresEnhancement: false,
              // We keep original amount/date/id
            };
          }
        } catch (e) {
          console.log("Enhancement failed, will try next time", e);
        }
      }
      return expense;
    }));

    if (updated) {
      setPendingExpenses(enhancedList);
      Alert.alert("Sync Complete", "Offline transactions have been updated with AI details! ✨");
    }
  };

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
    if (dataLoaded && categories.length > 0) {
      StorageService.saveCategories(categories);
    }
  }, [categories, dataLoaded]);

  // Network Listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(!!state.isConnected);
    });
    return unsubscribe;
  }, []);

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

      // ✅ Enhancement Check (Offline Retry)
      // We check pendingExpenses state (but wait, state inside useEffect closure might be stale or not yet populated if syncMissedSms is async)
      // Better to check storage or rely on syncMissedSms adding them. 
      // Let's create a separate function to enhance. We can run it after a short delay or separately.
      enhancePendingExpenses();

      // ✅ SMS Listener
      subscription = SmsListener.addListener((message: any) => {
        // ... (existing listener code) ...

        console.log("📩 SMS Received:", message.body);
        const text = message.body;

        const isDebit = /debited/i.test(text);

        if (isDebit) {
          // Fire and Forget / Async handling
          (async () => {
            let title = '';
            let amount = 0;
            let type = 'debit';
            let category = 'Uncategorized';
            let geminiResult = null;

            // 1. Try Gemini First
            try {
              geminiResult = await analyzeSmsWithGemini(text);
              if (geminiResult && geminiResult.amount > 0) {
                console.log("✨ Gemini Analysis:", geminiResult);
                title = geminiResult.merchant;
                amount = geminiResult.amount;
                if (geminiResult.category) category = geminiResult.category;

                // 🧠 SMART CATEGORIZATION: Check history
                try {
                  const historicalCategory = await StorageService.getCategoryForMerchant(title);
                  if (historicalCategory) {
                    console.log(`🧠 Smart Cat: Overriding '${category}' with history '${historicalCategory}'`);
                    category = historicalCategory;
                  }
                } catch (err) {
                  console.log("Smart Cat Lookup Failed", err);
                }

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
              const now = new Date();
              const newExpense = {
                id: Date.now().toString(),
                title: title,
                amount: amount,
                source: message.originatingAddress || 'Bank',
                date: now.toLocaleDateString(),
                time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: type,
                category: category,
              };

              setPendingExpenses((prev: any[]) => [...prev, newExpense]);

              const alertTitle = geminiResult ? "✨ AI Transaction Detected" : "💸 Transaction Detected";
              Alert.alert(alertTitle, `Debit: ₹${amount} added\n(${title})\nCategory: ${category}`);

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

    const now = new Date();
    const newExpense = {
      id: Date.now().toString(),
      title,
      amount: parseFloat(amount),
      source,
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      category: 'Manual',
    };

    setPendingExpenses(prev => [...prev, newExpense]);
    setTitle('');
    setAmount('');
    setSource('');
    setModalVisible(false);
  };

  const deleteExpense = (id: any) => {
    setPendingExpenses(prev => prev.filter(exp => exp.id !== id));
  };

  const handleFullyMine = (expense: any) => {
    Alert.alert("Expense Processed", `✅ ₹${expense.amount.toFixed(2)} marked as Fully Yours`);
    setProcessedExpenses(prev => [...prev, { ...expense, processed: 'Fully Mine' }]);
    deleteExpense(expense.id);
  };
  const deleteProcessed = (id: any) => {
    const expense = processedExpenses.find(e => e.id === id);
    setProcessedExpenses(prev => prev.filter(e => e.id !== id));
    Alert.alert("Deleted", `"${expense?.title}" removed from processed expenses`);
  };

  const handleSplit = (expense: any) => {
    const count = parseInt(splitCount[expense.id]);
    if (!count || count <= 0) return Alert.alert('Error', 'Enter valid number of people');

    const splitAmount = expense.amount / count;
    Alert.alert("Expense Split", `✅ ₹${splitAmount.toFixed(2)} is yours (split between ${count})`);

    setProcessedExpenses(prev => [
      ...prev,
      { ...expense, processed: `Split with ${count}`, amount: splitAmount },
    ]);
    deleteExpense(expense.id);
  };

  const openCategoryModal = (expense: any) => {
    setSelectedExpenseForEdit(expense);
    setEditCategoryModalVisible(true);
  };

  const updateExpenseCategory = (category: string) => {
    if (!selectedExpenseForEdit) return;

    // Update in Pending
    setPendingExpenses(prev => prev.map(e =>
      e.id === selectedExpenseForEdit.id ? { ...e, category } : e
    ));

    // Update in Processed (if support editing processed later)
    setProcessedExpenses(prev => prev.map(e =>
      e.id === selectedExpenseForEdit.id ? { ...e, category } : e
    ));

    setEditCategoryModalVisible(false);
    setSelectedExpenseForEdit(null);
  };

  const addNewCategory = () => {
    if (!newCategoryName.trim()) return;
    if (categories.includes(newCategoryName.trim())) {
      Alert.alert("Error", "Category already exists");
      return;
    }
    const newCat = newCategoryName.trim();
    setCategories(prev => [...prev, newCat]);
    setNewCategoryName('');
    // Auto select it?
    updateExpenseCategory(newCat);
  };

  // Helper to get monthly totals
  const getMonthlyTotals = () => {
    const totals: { [key: string]: number } = {};
    processedExpenses.forEach((item: any) => {
      let d = new Date(item.date);

      // Handle invalid date (likely DD/MM/YYYY format from toLocaleDateString in India/UK)
      if (isNaN(d.getTime())) {
        const parts = item.date.split('/');
        if (parts.length === 3) {
          // parts[0] = DD, parts[1] = MM, parts[2] = YYYY
          // new Date(year, monthIndex, day)
          d = new Date(
            parseInt(parts[2], 10),
            parseInt(parts[1], 10) - 1, // Month is 0-indexed
            parseInt(parts[0], 10)
          );
        }
      }

      if (isNaN(d.getTime())) {
        return;
      }

      const monthYear = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!totals[monthYear]) totals[monthYear] = 0;
      totals[monthYear] += (parseFloat(item.amount) || 0);
    });

    return Object.keys(totals).map(key => ({
      month: key,
      amount: totals[key]
    })).sort((a, b) => {
      // Sort by date descending
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateB.getTime() - dateA.getTime();
    });
  };

  const getCategoryDataForMonth = (monthName: string) => {
    const totals: { [key: string]: number } = {};

    processedExpenses.forEach((item: any) => {
      let d = new Date(item.date);
      // Handle invalid date logic same as above
      if (isNaN(d.getTime())) {
        const parts = item.date.split('/');
        if (parts.length === 3) d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      if (isNaN(d.getTime())) return;

      const monthYear = d.toLocaleString('default', { month: 'long', year: 'numeric' });

      if (monthYear === monthName) {
        const cat = item.category || 'Uncategorized';
        if (!totals[cat]) totals[cat] = 0;
        totals[cat] += (parseFloat(item.amount) || 0);
      }
    });

    return Object.keys(totals).map(cat => ({
      value: totals[cat],
      color: CATEGORY_COLORS[cat] || getRandomColor(),
      text: `${cat}: ₹${totals[cat].toFixed(0)}`
    })).sort((a, b) => b.value - a.value);
  };

  const renderExpense = ({ item }) => (
    <View style={styles.expenseCard}>
      <Text style={styles.title}>{item.title}</Text>
      <Text>Source: {item.source}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
        <Text style={{ color: '#555', fontStyle: 'italic', marginRight: 8 }}>
          {item.category || 'Uncategorized'}
        </Text>
        <TouchableOpacity onPress={() => openCategoryModal(item)} style={{ backgroundColor: '#eee', padding: 4, borderRadius: 4 }}>
          <Text style={{ fontSize: 12 }}>✏️ Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text>Date: {item.date}</Text>
        <Text>Time: {item.time || '--:--'}</Text>
      </View>
      <Text style={{ marginTop: 4 }}>Amount: ₹{item.amount ? Number(item.amount).toFixed(2) : '0.00'}</Text>

      {viewMode === 'pending' && (
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

      {viewMode === 'processed' && (
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

  const renderAnalysis = ({ item }) => {
    const isSelected = selectedMonthForAnalysis === item.month;
    const categoryData = isSelected ? getCategoryDataForMonth(item.month) : [];

    return (
      <TouchableOpacity
        style={styles.expenseCard}
        onPress={() => setSelectedMonthForAnalysis(isSelected ? null : item.month)}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[styles.title, { fontSize: 20, color: '#2196F3' }]}>{item.month}</Text>
            <Text style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>₹{item.amount.toFixed(2)}</Text>
          </View>
          <Text style={{ fontSize: 24 }}>{isSelected ? '🔽' : '▶️'}</Text>
        </View>

        {isSelected && (
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            {categoryData.length > 0 ? (
              <>
                <PieChart
                  data={categoryData}
                  donut
                  showText
                  textColor="black"
                  radius={120}
                  innerRadius={60}
                  textSize={12}
                  labelsPosition='outward'
                />
                <View style={{ marginTop: 20, width: '100%' }}>
                  {categoryData.map((cat, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: cat.color, marginRight: 8 }} />
                      <Text style={{ fontWeight: 'bold', flex: 1 }}>{cat.text.split(':')[0]}</Text>
                      <Text>{cat.text.split(':')[1]}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={{ fontStyle: 'italic', color: '#777' }}>No category data found.</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    )
  };


  return (
    <SafeAreaView style={styles.container}>

      {/* Header Actions Row (Retry Button and Network Status) */}
      <View style={styles.headerActions}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginRight: 'auto' }}>
          <View style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: isConnected ? '#4CAF50' : '#F44336',
            marginRight: 6
          }} />
          <Text style={{ color: '#555', fontWeight: 'bold' }}>
            {isConnected ? 'Online' : 'Offline'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.toggleButtonCustom, { backgroundColor: '#FF8800', flex: 0, alignSelf: 'flex-end', marginBottom: 10 }]}
          onPress={async () => {
            const { rewindSyncTimestamp } = require('./src/services/SmsSyncService');
            // Rewind 60 minutes (1 hour)
            await rewindSyncTimestamp(60);
            Alert.alert("Retry Window Set", "App will re-scan messages from the last 1 hour on next sync.");
          }}
        >
          <Text style={styles.activeText}>🔄 Retry (1h)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[
            styles.toggleButtonCustom,
            viewMode === 'pending' && styles.activeButton,
          ]}
          onPress={() => setViewMode('pending')}
        >
          <Text style={[
            styles.toggleButtonText,
            viewMode === 'pending' && styles.activeText,
          ]}>
            📂 Pending
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleButtonCustom,
            viewMode === 'processed' && styles.activeButton,
          ]}
          onPress={() => setViewMode('processed')}
        >
          <Text style={[
            styles.toggleButtonText,
            viewMode === 'processed' && styles.activeText,
          ]}>
            ✅ Processed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleButtonCustom,
            viewMode === 'analysis' && styles.activeButton,
          ]}
          onPress={() => setViewMode('analysis')}
        >
          <Text style={[
            styles.toggleButtonText,
            viewMode === 'analysis' && styles.activeText,
          ]}>
            📊 Analysis
          </Text>
        </TouchableOpacity>
      </View>




      <Text style={styles.headerText}>
        {viewMode === 'pending' ? 'Pending Expenses' : viewMode === 'processed' ? 'Processed Expenses' : 'Monthly Spending'}
      </Text>

      {viewMode === 'analysis' ? (
        <FlatList
          data={getMonthlyTotals()}
          keyExtractor={item => item.month}
          renderItem={renderAnalysis}
          ListEmptyComponent={<Text style={styles.empty}>No analysis data available</Text>}
        />
      ) : (
        <FlatList
          data={viewMode === 'processed' ? processedExpenses : pendingExpenses}
          keyExtractor={item => item.id}
          renderItem={renderExpense}
          ListEmptyComponent={<Text style={styles.empty}>No expenses to show</Text>}
        />
      )}

      {/* Modal for Debug SMS */}
      <Modal visible={debugModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🛠️ Debug SMS Analyzer</Text>

            <TextInput
              placeholder="Paste SMS text here..."
              placeholderTextColor="#888"
              value={debugText}
              onChangeText={setDebugText}
              multiline
              numberOfLines={4}
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            />

            <View style={styles.modalButtons}>
              <Button title="Close" color="grey" onPress={() => setDebugModalVisible(false)} />
              <Button title="Analyze with AI" onPress={async () => {
                if (!debugText.trim()) return;
                try {
                  Alert.alert("Analyzing...", "Sending to Gemini...");
                  const result = await analyzeSmsWithGemini(debugText);
                  if (result) {

                    // 🧠 SMART CATEGORIZATION: Check history for Debug Tool too
                    try {
                      const historicalCategory = await StorageService.getCategoryForMerchant(result.merchant);
                      if (historicalCategory) {
                        console.log(`🧠 Smart Cat (Debug): Overriding '${result.category}' with '${historicalCategory}'`);
                        result.category = historicalCategory;
                      }
                    } catch (e) {
                      console.log("Debug Smart Cat failed", e);
                    }

                    // Optional: Ask to add
                    Alert.alert(
                      "Success!",
                      `Merchant: ${result.merchant}\nAmount: ${result.amount}\nType: ${result.type}\nCategory: ${result.category}`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Add Expense", onPress: () => {
                            const newExpense = {
                              id: Date.now().toString(),
                              title: result.merchant,
                              amount: result.amount,
                              source: 'Debug',
                              date: new Date().toLocaleDateString(),
                              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                              type: result.type,
                              category: result.category || 'Manual Debug',
                            };
                            setPendingExpenses(prev => [...prev, newExpense]);
                            setDebugModalVisible(false);
                            setDebugText('');
                          }
                        }
                      ]
                    );

                  } else {
                    Alert.alert("Failed", "Gemini returned null (not a transaction?)");
                  }
                } catch (e) {
                  Alert.alert("Error", String(e));
                }
              }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal for Categories */}
      <Modal visible={editCategoryModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={[styles.modalBox, { height: '70%' }]}>
            <Text style={styles.modalTitle}>Select Category</Text>

            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                placeholder="New Category"
                placeholderTextColor="#888"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
              />
              <Button title="Add" onPress={addNewCategory} />
            </View>

            <FlatList
              data={categories}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                  onPress={() => updateExpenseCategory(item)}
                >
                  <Text style={{ fontSize: 16 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <Button title="Cancel" color="red" onPress={() => setEditCategoryModalVisible(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add Manual Expense</Text>
            <TextInput style={styles.input} placeholder="Title" placeholderTextColor="#888" value={title} onChangeText={setTitle} />
            <TextInput style={styles.input} placeholder="Amount" placeholderTextColor="#888" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <TextInput style={styles.input} placeholder="Source (e.g. Bank)" placeholderTextColor="#888" value={source} onChangeText={setSource} />

            <View style={styles.modalButtons}>
              <Button title="Cancel" color="red" onPress={() => setModalVisible(false)} />
              <Button title="Add" onPress={addExpense} />
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.fabContainer}>
        {/* Toggle between Add and Debug with long press? Or just add another button */}
        <Button title="＋" onPress={() => setModalVisible(true)} color="#2196F3" />
      </View>
      <View style={[styles.fabContainer, { bottom: 100, backgroundColor: '#6200EE' }]}>
        <Button title="🛠️" onPress={() => setDebugModalVisible(true)} color="#6200EE" />
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
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 10,
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
    color: '#000',
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
  // The original input style was duplicated, keeping the more specific one for modal
  // input: {
  //   borderWidth: 1,
  //   borderColor: '#aaa',
  //   borderRadius: 6,
  //   padding: 10,
  //   marginBottom: 10,
  //   fontSize: 16,
  //   width: '100%',
  //   color: '#000', // ensure text input is visible
  // },
  // actions: {
  //   flexDirection: 'row',
  //   justifyContent: 'space-between',
  //   gap: 6,
  //   marginTop: 10,
  // },
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
    justifyContent: 'space-around',
    marginVertical: 10,
    paddingHorizontal: 10,
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
