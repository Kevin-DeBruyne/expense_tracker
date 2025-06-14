import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Button } from 'react-native';

export default function HomeScreen({ navigation }) {
  const [expenses, setExpenses] = useState([
    { id: '1', title: 'Zomato Order', amount: 500, source: 'Zomato', sharedWith: 0 },
    { id: '2', title: 'Electricity Bill', amount: 1200, source: 'MSEB', sharedWith: 0 },
  ]);

  const handleSplit = (id, people) => {
    setExpenses(prev =>
      prev.map(exp => (exp.id === id ? { ...exp, sharedWith: people } : exp))
    );
  };

  const renderItem = ({ item }) => {
    const sharedAmount = item.sharedWith > 0 ? item.amount / (item.sharedWith + 1) : item.amount;
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('ExpenseDetails', { expense: item, updateExpense })}
        style={styles.item}
      >
        <Text style={styles.title}>{item.title}</Text>
        <Text>Source: {item.source}</Text>
        <Text>Amount: ₹{sharedAmount.toFixed(2)}</Text>
        <View style={styles.buttons}>
          <Button title="Fully Mine" onPress={() => handleSplit(item.id, 0)} />
          <Button title="Split 50%" onPress={() => handleSplit(item.id, 1)} />
        </View>
      </TouchableOpacity>
    );
  };

  const updateExpense = (updatedItem) => {
    setExpenses(prev =>
      prev.map(exp => (exp.id === updatedItem.id ? updatedItem : exp))
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Welcome Mukul</Text>
      <Text>Please check your expenses today</Text>
      <FlatList data={expenses} keyExtractor={item => item.id} renderItem={renderItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  item: {
    backgroundColor: '#eee',
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
  },
  title: { fontSize: 18, fontWeight: 'bold' },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
});

