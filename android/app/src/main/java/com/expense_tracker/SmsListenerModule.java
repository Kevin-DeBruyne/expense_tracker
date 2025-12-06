package com.expense_tracker;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.os.Build;
import android.provider.Telephony;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;

public class SmsListenerModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    private BroadcastReceiver mReceiver;
    private boolean isReceiverRegistered = false;

    public SmsListenerModule(ReactApplicationContext context) {
        super(context);
        mReceiver = new SmsReceiver(context);
        getReactApplicationContext().addLifecycleEventListener(this);
    }

    private void registerReceiverIfNecessary(BroadcastReceiver receiver) {
        if (isReceiverRegistered)
            return;

        try {
            int flags = 0;
            if (Build.VERSION.SDK_INT >= 34) { // Android 14
                flags = Context.RECEIVER_EXPORTED;
            }

            getReactApplicationContext().registerReceiver(
                    receiver,
                    new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION),
                    flags);
            isReceiverRegistered = true;
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void unregisterReceiver(BroadcastReceiver receiver) {
        if (isReceiverRegistered) {
            try {
                getReactApplicationContext().unregisterReceiver(receiver);
                isReceiverRegistered = false;
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    @Override
    public void onHostResume() {
        registerReceiverIfNecessary(mReceiver);
    }

    @Override
    public void onHostPause() {
        // Do not unregister on pause to keep listening in background
        // unregisterReceiver(mReceiver);
    }

    @Override
    public void onHostDestroy() {
        unregisterReceiver(mReceiver);
    }

    @com.facebook.react.bridge.ReactMethod
    public void listSms(double minDate, com.facebook.react.bridge.Promise promise) {
        try {
            com.facebook.react.bridge.WritableArray result = com.facebook.react.bridge.Arguments.createArray();
            android.content.ContentResolver cr = getReactApplicationContext().getContentResolver();

            // Query inbox
            android.database.Cursor cursor = cr.query(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    new String[] { Telephony.Sms.BODY, Telephony.Sms.ADDRESS, Telephony.Sms.DATE },
                    Telephony.Sms.DATE + " > ?",
                    new String[] { String.valueOf((long) minDate) },
                    Telephony.Sms.DATE + " ASC");

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    com.facebook.react.bridge.WritableMap map = com.facebook.react.bridge.Arguments.createMap();
                    map.putString("body", cursor.getString(0));
                    map.putString("address", cursor.getString(1));
                    map.putDouble("timestamp", cursor.getLong(2));
                    result.pushMap(map);
                }
                cursor.close();
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SMS_READ_ERROR", e);
        }
    }

    @Override
    public String getName() {
        return "SmsListenerPackage";
    }
}
