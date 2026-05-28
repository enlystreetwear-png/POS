package com.pondypos.printertest;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ImageView;
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
    private static final String DEFAULT_URL = "https://pos-ebon-five.vercel.app/";

    private Spinner printerSpinner;
    private TextView status;
    private WebView webView;
    private final List<BluetoothDevice> devices = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        requestBluetoothPermission();
        loadPairedPrinters();
        loadWebsite();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(0, 0, 0, 0);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(14), dp(8), dp(12), dp(8));
        header.setBackgroundColor(0xFFFFFFFF);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.pondy_logo_black);
        logo.setAdjustViewBounds(true);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        header.addView(logo, new LinearLayout.LayoutParams(dp(72), dp(48)));

        status = new TextView(this);
        status.setText("Ready");
        status.setTextSize(12);
        status.setGravity(Gravity.CENTER_VERTICAL);
        status.setPadding(dp(8), 0, dp(8), 0);
        header.addView(status, new LinearLayout.LayoutParams(0, -1, 1));

        Button settingsButton = new Button(this);
        settingsButton.setText("Settings");
        settingsButton.setAllCaps(false);
        settingsButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                showPrinterSettings();
            }
        });
        header.addView(settingsButton, new LinearLayout.LayoutParams(dp(104), dp(44)));
        root.addView(header, new LinearLayout.LayoutParams(-1, dp(64)));

        printerSpinner = new Spinner(this);

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
        status.setText("Opening PondyPOS");
        webView.loadUrl(DEFAULT_URL);
    }

    private void showPrinterSettings() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(18);
        panel.setPadding(pad, dp(12), pad, 0);

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.pondy_icon_black);
        icon.setAdjustViewBounds(true);
        icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        panel.addView(icon, new LinearLayout.LayoutParams(-1, dp(76)));

        TextView helper = new TextView(this);
        helper.setText("Select your paired Bluetooth receipt printer.");
        helper.setTextSize(14);
        helper.setPadding(0, dp(8), 0, dp(8));
        panel.addView(helper, new LinearLayout.LayoutParams(-1, -2));

        if (printerSpinner.getParent() instanceof ViewGroup) {
            ((ViewGroup) printerSpinner.getParent()).removeView(printerSpinner);
        }
        panel.addView(printerSpinner, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(12), 0, 0);

        Button refresh = new Button(this);
        refresh.setText("Refresh");
        refresh.setAllCaps(false);
        refresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                loadPairedPrinters();
            }
        });
        actions.addView(refresh, new LinearLayout.LayoutParams(0, -2, 1));

        Button test = new Button(this);
        test.setText("Test print");
        test.setAllCaps(false);
        test.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                printText(testReceiptText());
            }
        });
        actions.addView(test, new LinearLayout.LayoutParams(0, -2, 1));
        panel.addView(actions, new LinearLayout.LayoutParams(-1, -2));

        new AlertDialog.Builder(this)
                .setTitle("PondyPOS settings")
                .setView(panel)
                .setPositiveButton("Done", null)
                .setNeutralButton("Reload website", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialogInterface, int i) {
                        loadWebsite();
                    }
                })
                .show();
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

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
