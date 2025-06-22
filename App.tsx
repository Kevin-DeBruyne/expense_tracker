import React, { useState } from 'react';
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

export default function App() {
  const [pendingExpenses, setPendingExpenses] = useState([
    {
      id: '1',
      title: 'Zomato Order',
      amount: 450,
      source: 'Zomato',
      date: '2025-06-21',
    },
    {
      id: '2',
      title: 'Petrol Pump',
      amount: 1000,
      source: 'HDFC Bank',
      date: '2025-06-20',
    },
  ]);

  const [processedExpenses, setProcessedExpenses] = useState([]);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [splitCount, setSplitCount] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [showProcessed, setShowProcessed] = useState(false);

  const addExpense = () => {
    if (!title || !amount || !source) return alert('Please fill all fields');

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
          <View style={styles.splitSection}>
            <TextInput
              placeholder="Split with (e.g. 2)"
              style={styles.input}
              keyboardType="number-pad"
              value={splitCount[item.id] || ''}
              onChangeText={(text) =>
                setSplitCount(prev => ({ ...prev, [item.id]: text }))
              }
            />
            <Button title="Split" onPress={() => handleSplit(item)} />
          </View>

          <View style={styles.actions}>
            <Button title="Fully Mine" onPress={() => handleFullyMine(item)} />
            <Button
              title="Delete"
              color="red"
              onPress={() => deleteExpense(item.id)}
            />
          </View>
        </>
      )}

      {showProcessed && (
        <Text style={{ marginTop: 10, fontStyle: 'italic', color: '#333' }}>
          ✔️ Processed: {item.processed}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Button title="➕ Add Expense" onPress={() => setModalVisible(true)} />
        <Button
          title={showProcessed ? '⬅️ Show Pending' : '✅ View Processed'}
          onPress={() => setShowProcessed(!showProcessed)}
        />
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
              placeholder="Title"
              value={title}
              onChangeText={setTitle}
              style={styles.input}
            />
            <TextInput
              placeholder="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              placeholder="Source"
              value={source}
              onChangeText={setSource}
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Button title="Cancel" color="grey" onPress={() => setModalVisible(false)} />
              <Button title="Save" onPress={addExpense} />
            </View>
          </View>
        </View>
      </Modal>
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
});
