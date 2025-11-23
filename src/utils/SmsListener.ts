import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { SmsListenerPackage } = NativeModules;

const eventEmitter = new NativeEventEmitter(SmsListenerPackage);

interface SmsMessage {
    originatingAddress: string;
    body: string;
    timestamp: number;
}

export default {
    addListener: (callback: (message: SmsMessage) => void) => {
        if (Platform.OS === 'android') {
            return eventEmitter.addListener('com.expense_tracker:smsReceived', callback);
        }
        return { remove: () => { } };
    },
};
