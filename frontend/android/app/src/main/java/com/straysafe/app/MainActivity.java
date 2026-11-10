package com.straysafe.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor 8 does not handle the Back button by itself (that is the optional @capacitor/app plugin), so without this Back would
        // close the app from any screen. Back now goes one screen back in the web app's history (the Resident app's own screens are
        // history entries) and, from its first screen, leaves the app as usual. Uses the AndroidX callback, which also works with
        // Android's predictive back gesture.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    MainActivity.this.getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }
}
