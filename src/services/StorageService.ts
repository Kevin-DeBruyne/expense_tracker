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

    saveCategories: async (categories: string[]) => {
        try {
            await AsyncStorage.setItem('categories_data', JSON.stringify(categories));
        } catch (e) {
            console.error('Failed to save categories', e);
        }
    },

    loadCategories: async (): Promise<string[]> => {
        try {
            const json = await AsyncStorage.getItem('categories_data');
            return json ? JSON.parse(json) : []; // Return empty if none, caller handles defaults
        } catch (e) {
            console.error('Failed to load categories', e);
            return [];
        }
    },

    getCategoryForMerchant: async (merchant: string): Promise<string | null> => {
        if (!merchant) return null;
        try {
            // Check processed expenses first (most historical data)
            const json = await AsyncStorage.getItem(PROCESSED_KEY);
            const processed = json ? JSON.parse(json) : [];

            // Find finding the most recent transaction from this merchant
            // We assume the list is appended to, so we search from the end or sort. 
            // Actually our list might be chronological. Let's reverse find.
            const match = processed.reverse().find((e: any) =>
                e.title && e.title.toLowerCase().trim() === merchant.toLowerCase().trim() && e.category
            );

            if (match) return match.category;

            // Check pending as well?
            const pendingJson = await AsyncStorage.getItem(PENDING_KEY);
            const pending = pendingJson ? JSON.parse(pendingJson) : [];
            const pendingMatch = pending.reverse().find((e: any) =>
                e.title && e.title.toLowerCase().trim() === merchant.toLowerCase().trim() && e.category
            );

            if (pendingMatch) return pendingMatch.category;

        } catch (e) {
            console.error('Failed to lookup category history', e);
        }
        return null;
    },
};
