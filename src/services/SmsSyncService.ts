import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeSmsWithGemini } from './GeminiService';
import { parseSmsBody } from '../utils/smsParser';

const { SmsListenerPackage } = NativeModules;
const LAST_SYNC_KEY = 'last_sms_sync_timestamp';

interface SmsMessage {
    body: string;
    address: string;
    timestamp: number;
}

export const syncMissedSms = async (
    onExpenseFound: (expense: any) => void
) => {
    if (Platform.OS !== 'android') return;

    // 1. Check Permissions
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (!granted) {
        console.log("READ_SMS permission not granted, skipping sync.");
        return;
    }

    // 2. Get Last Sync Time
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
    // Default to 24 hours ago if never synced, or 0? 
    // Let's default to now minus 1 day to avoid scanning entire history on first run
    const lastSync = lastSyncStr ? parseFloat(lastSyncStr) : Date.now() - (24 * 60 * 60 * 1000);

    console.log(`Checking for SMS since: ${new Date(lastSync).toLocaleString()}`);

    try {
        // 3. Fetch Missed SMS from Native
        const messages: SmsMessage[] = await SmsListenerPackage.listSms(lastSync);
        console.log(`Found ${messages.length} missed messages.`);

        if (messages.length === 0) {
            await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
            return;
        }

        // 4. Process Each Message
        for (const msg of messages) {
            const text = msg.body;

            // Ignore Credit messages early if we only want debits
            if (!/debited/i.test(text)) continue;

            let title = '';
            let amount = 0;
            let type = 'debit';
            let isGemini = false;

            // Try Gemini
            try {
                const geminiResult = await analyzeSmsWithGemini(text);
                if (geminiResult && geminiResult.amount > 0) {
                    title = geminiResult.merchant;
                    amount = geminiResult.amount;
                    isGemini = true;
                }
            } catch (e) {
                console.log("Gemini Sync Error", e);
            }

            // Fallback
            if (!amount) {
                const localResult = parseSmsBody(text, msg.address);
                if (localResult.amount && localResult.amount > 0) {
                    title = localResult.title;
                    amount = localResult.amount;
                }
            }

            // Add Expense
            if (amount > 0) {
                const newExpense = {
                    id: `sms-${msg.timestamp}-${amount}`, // Unique ID based on timestamp
                    title: isGemini ? `[AI] ${title}` : title, // Optional marker
                    amount: amount,
                    source: msg.address || 'Bank',
                    date: new Date(msg.timestamp).toLocaleDateString(),
                    type: type,
                };
                onExpenseFound(newExpense);
            }
        }

        // 5. Update Last Sync Time
        await AsyncStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

    } catch (error) {
        console.error("Failed to sync SMS:", error);
    }
};

export const updateLastSyncTimestamp = async (timestamp: number) => {
    try {
        const currentStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
        const current = currentStr ? parseFloat(currentStr) : 0;

        // Only update if newer
        if (timestamp > current) {
            await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp.toString());
        }
    } catch (e) {
        console.error("Failed to update sync timestamp", e);
    }
};
