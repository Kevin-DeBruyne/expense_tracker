import React, { useState } from 'react';
import { View, TextInput, Text, Button, StyleSheet } from 'react-native';

export default function ExpenseDetailScreen({ route, navigation }) {
  const { expense, updateExpense } = route.params;
  const [title, setTitle] = useState(expense.title);
  const [amount, setAmount] = useState(String(expense.amount));
  const [source, setSource] = useState(expense.source);
  const [sharedWith, setSharedWith] = useState(String(expense.sharedWith));

  const handleSave = () => {
    const updated = {
      ...expense,
      title,
      amount: parseFloat(amount),
      source,
      sharedWith: parseInt(sharedWith),
    };
    updateExpense(updated);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Title:</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Amount:</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Source:</Text>
      <TextInput style={styles.input} value={source} onChangeText={setSource} />

      <Text style={styles.label}>Shared With (number of people):</Text>
      <TextInput
        style={styles.input}
        value={sharedWith}
        onChangeText={setSharedWith}
        keyboardType="numeric"
      />

      <Button title="Save" onPress={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontWeight: 'bold', marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginTop: 5,
    borderRadius: 4,
  },
});

