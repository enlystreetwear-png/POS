package com.pondypos.printertest;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

public class MainActivity extends Activity {
    private static final int PERMISSION_REQUEST = 42;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String DEFAULT_URL = "http://10.208.84.248:4173/?v=android-print-bridge";

    private Spinner printerSpinner;
    private EditText urlInput;
    private TextView status;
    private WebView webView;
    private SharedPreferences prefs;
    private final List<BluetoothDevice> devices = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("pondypos", MODE_PRIVATE);
        buildUi();
        requestBluetoothPermission();
        loadPairedPrinters();
        loadWebsite();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(12, 12, 12, 12);

        TextView title = new TextView(this);
        title.setText("PondyPOS Android");
        title.setTextSize(20);
        title.setTypeface(null, 1);
        root.addView(title, new LinearLayout.LayoutParams(-1, -2));

        urlInput = new EditText(this);
        urlInput.setSingleLine(true);
        urlInput.setText(prefs.getString("url", DEFAULT_URL));
        root.addView(urlInput, new LinearLayout.LayoutParams(-1, -2));

        Button load = new Button(this);
        load.setText("Open / update website");
        load.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                prefs.edit().putString("url", urlInput.getText().toString().trim()).apply();
                loadWebsite();
            }
        });
        root.addView(load, new LinearLayout.LayoutParams(-1, -2));

        printerSpinner = new Spinner(this);
        root.addView(printerSpinner, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout printerActions = new LinearLayout(this);
        printerActions.setOrientation(LinearLayout.HORIZONTAL);
        Button refresh = new Button(this);
        refresh.setText("Refresh printers");
        refresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                loadPairedPrinters();
            }
        });
        Button test = new Button(this);
        test.setText("Test print");
        test.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                printText(testReceiptText());
            }
        });
        printerActions.addView(refresh, new LinearLayout.LayoutParams(0, -2, 1));
        printerActions.addView(test, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(printerActions, new LinearLayout.LayoutParams(-1, -2));

        status = new TextView(this);
        status.setText("Ready");
        status.setTextSize(13);
        status.setPadding(0, 8, 0, 8);
        root.addView(status, new LinearLayout.LayoutParams(-1, -2));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 21) settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new PrintBridge(), "PondyPrinter");
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));

        setContentView(root);
    }

    private void loadWebsite() {
        String url = urlInput.getText().toString().trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;
        status.setText("Opening " + url);
        webView.loadUrl(url);
    }

    private void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, PERMISSION_REQUEST);
        }
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void loadPairedPrinters() {
        if (!hasBluetoothPermission()) {
            status.setText("Allow Bluetooth permission, then tap refresh printers.");
            requestBluetoothPermission();
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            status.setText("This phone does not support Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            status.setText("Turn on Bluetooth first.");
            return;
        }

        devices.clear();
        List<String> labels = new ArrayList<>();
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        for (BluetoothDevice device : bonded) {
            devices.add(device);
            labels.add(device.getName() + "  " + device.getAddress());
        }
        if (labels.isEmpty()) labels.add("No paired Bluetooth printers found");
        printerSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
        status.setText(devices.isEmpty() ? "Pair printer in Android Bluetooth settings first." : "Printer ready. Select it before billing.");
    }

    private BluetoothDevice selectedDevice() {
        int index = printerSpinner.getSelectedItemPosition();
        if (devices.isEmpty() || index < 0 || index >= devices.size()) return null;
        return devices.get(index);
    }

    private void printText(final String text) {
        if (!hasBluetoothPermission()) {
            requestBluetoothPermission();
            return;
        }
        final BluetoothDevice device = selectedDevice();
        if (device == null) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    status.setText("No paired printer selected.");
                }
            });
            return;
        }
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                status.setText("Printing to " + device.getName() + "...");
            }
        });
        new Thread(new Runnable() {
            @Override
            public void run() {
                BluetoothSocket socket = null;
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                    OutputStream output = socket.getOutputStream();
                    output.write(escposBytes(text));
                    output.flush();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            status.setText("Printed from PondyPOS.");
                        }
                    });
                } catch (Exception error) {
                    final String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            status.setText("Print failed: " + message);
                        }
                    });
                } finally {
                    if (socket != null) {
                        try {
                            socket.close();
                        } catch (Exception ignored) {
                        }
                    }
                }
            }
        }).start();
    }

    private byte[] escposBytes(String text) {
        String normalized = "\n" + text + "\n\n\n";
        byte[] body = normalized.getBytes(StandardCharsets.UTF_8);
        byte[] init = new byte[]{0x1B, 0x40};
        byte[] cut = new byte[]{0x1D, 0x56, 0x42, 0x00};
        byte[] all = new byte[init.length + body.length + cut.length];
        System.arraycopy(init, 0, all, 0, init.length);
        System.arraycopy(body, 0, all, init.length, body.length);
        System.arraycopy(cut, 0, all, init.length + body.length, cut.length);
        return all;
    }

    private String testReceiptText() {
        String time = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()).format(new Date());
        return "PONDYPOS\n" +
                "Android print bridge\n" +
                "------------------------------\n" +
                "Date: " + time + "\n" +
                "Printer: Bluetooth ESC/POS\n" +
                "------------------------------\n" +
                "If this prints, website billing\n" +
                "can print through this app.";
    }

    public class PrintBridge {
        @JavascriptInterface
        public void printReceipt(String text) {
            printText(text);
        }
    }
}
