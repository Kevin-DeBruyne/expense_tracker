import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_KEY = 'pending_expenses_data';
const PROCESSED_KEY = 'processed_expenses_data';

export const StorageService = {
    savePending: async (expenses: any[]) => {
        try {
            await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(expenses));
        } catch (e) {
            console.error('Failed to save pending expenses', e);
        }
    },

    loadPending: async (): Promise<any[]> => {
        try {
            const json = await AsyncStorage.getItem(PENDING_KEY);
            return json ? JSON.parse(json) : [];
        } catch (e) {
            console.error('Failed to load pending expenses', e);
            return [];
        }
    },

    saveProcessed: async (expenses: any[]) => {
        try {
            await AsyncStorage.setItem(PROCESSED_KEY, JSON.stringify(expenses));
        } catch (e) {
            console.error('Failed to save processed expenses', e);
        }
    },

    loadProcessed: async (): Promise<any[]> => {
        try {
            const json = await AsyncStorage.getItem(PROCESSED_KEY);
            return json ? JSON.parse(json) : [];
        } catch (e) {
            console.error('Failed to load processed expenses', e);
            return [];
        }
    },
};
