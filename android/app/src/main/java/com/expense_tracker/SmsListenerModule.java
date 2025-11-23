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
        if (isReceiverRegistered) return;

        try {
            int flags = 0;
            if (Build.VERSION.SDK_INT >= 34) { // Android 14
                flags = Context.RECEIVER_EXPORTED;
            }
            
            getReactApplicationContext().registerReceiver(
                receiver,
                new IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION),
                flags
            );
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

    @Override
    public String getName() {
        return "SmsListenerPackage";
    }
}
