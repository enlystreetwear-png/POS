package com.pondypos.printertest;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
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
    private static final int FILE_CHOOSER_REQUEST = 77;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String DEFAULT_URL = "https://pos-ebon-five.vercel.app/";

    private Spinner printerSpinner;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
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

        printerSpinner = new Spinner(this);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 21) settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    MainActivity.this.filePathCallback = null;
                    showStatus("Could not open image picker.");
                    return false;
                }
                return true;
            }
        });
        webView.addJavascriptInterface(new PrintBridge(), "PondyPrinter");
        root.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));

        setContentView(root);
    }

    private void loadWebsite() {
        webView.loadUrl(DEFAULT_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int index = 0; index < count; index++) {
                    results[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
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
        refresh.setOnClickListener(new android.view.View.OnClickListener() {
            @Override
            public void onClick(android.view.View view) {
                loadPairedPrinters();
            }
        });
        actions.addView(refresh, new LinearLayout.LayoutParams(0, -2, 1));

        Button test = new Button(this);
        test.setText("Test print");
        test.setAllCaps(false);
        test.setOnClickListener(new android.view.View.OnClickListener() {
            @Override
            public void onClick(android.view.View view) {
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
            showStatus("Allow Bluetooth permission, then tap refresh printers.");
            requestBluetoothPermission();
            return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            showStatus("This phone does not support Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            showStatus("Turn on Bluetooth first.");
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
        showStatus(devices.isEmpty() ? "Pair printer in Android Bluetooth settings first." : "Printer ready. Select it before billing.");
    }

    private BluetoothDevice selectedDevice() {
        int index = printerSpinner.getSelectedItemPosition();
        if (devices.isEmpty() || index < 0 || index >= devices.size()) return null;
        return devices.get(index);
    }

    private void printText(final String text) {
        printReceiptPayload(text, "");
    }

    private void printReceiptPayload(final String text, final String logoDataUrl) {
        if (!hasBluetoothPermission()) {
            requestBluetoothPermission();
            return;
        }
        final BluetoothDevice device = selectedDevice();
        if (device == null) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showStatus("No paired printer selected.");
                }
            });
            return;
        }
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                showStatus("Printing to " + device.getName() + "...");
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
                    byte[] payload = escposBytes(text, logoDataUrl);
                    writeInChunks(output, payload);
                    output.flush();
                    Thread.sleep(2200);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            showStatus("Printed from PondyPOS.");
                        }
                    });
                } catch (Exception error) {
                    final String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            showStatus("Print failed: " + message);
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

    private byte[] escposBytes(String text, String logoDataUrl) {
        String normalized = "\n" + sanitizePrinterText(text) + "\n\n\n";
        byte[] body = normalized.getBytes(StandardCharsets.US_ASCII);
        byte[] init = new byte[]{0x1B, 0x40};
        byte[] normalFont = new byte[]{0x1B, 0x21, 0x00};
        byte[] codePage = new byte[]{0x1B, 0x74, 0x00};
        byte[] alignCenter = new byte[]{0x1B, 0x61, 0x01};
        byte[] alignLeft = new byte[]{0x1B, 0x61, 0x00};
        byte[] logo = logoEscposBytes(logoDataUrl);
        ByteArrayOutputStream all = new ByteArrayOutputStream();
        try {
            all.write(init);
            all.write(normalFont);
            all.write(codePage);
            if (logo.length > 0) {
                all.write(alignCenter);
                all.write(logo);
                all.write(new byte[]{0x0A});
                all.write(alignLeft);
            }
            all.write(body);
        } catch (Exception ignored) {
        }
        return all.toByteArray();
    }

    private void writeInChunks(OutputStream output, byte[] payload) throws Exception {
        int offset = 0;
        int chunk = 32;
        while (offset < payload.length) {
            int count = Math.min(chunk, payload.length - offset);
            output.write(payload, offset, count);
            output.flush();
            offset += count;
            Thread.sleep(35);
        }
    }

    private byte[] logoEscposBytes(String logoDataUrl) {
        if (logoDataUrl == null || !logoDataUrl.startsWith("data:image/") || !logoDataUrl.contains(",")) {
            return new byte[0];
        }
        try {
            String base64 = logoDataUrl.substring(logoDataUrl.indexOf(",") + 1);
            byte[] imageBytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap original = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
            if (original == null) return new byte[0];

            int maxWidth = 160;
            float ratio = Math.min(1f, (float) maxWidth / (float) original.getWidth());
            int width = Math.max(1, Math.round(original.getWidth() * ratio));
            int height = Math.max(1, Math.round(original.getHeight() * ratio));
            Bitmap bitmap = Bitmap.createScaledBitmap(original, width, height, true);
            ByteArrayOutputStream command = new ByteArrayOutputStream();

            for (int y = 0; y < height; y += 8) {
                int sliceHeight = Math.min(8, height - y);
                command.write(new byte[]{0x1B, 0x2A, 0x00, (byte) (width & 0xff), (byte) ((width >> 8) & 0xff)});
                for (int x = 0; x < width; x++) {
                    int column = 0;
                    for (int bit = 0; bit < sliceHeight; bit++) {
                        int pixel = bitmap.getPixel(x, y + bit);
                        int red = (pixel >> 16) & 0xff;
                        int green = (pixel >> 8) & 0xff;
                        int blue = pixel & 0xff;
                        int alpha = (pixel >> 24) & 0xff;
                        int luminance = (red * 299 + green * 587 + blue * 114) / 1000;
                        if (alpha > 40 && luminance < 190) {
                            column |= (0x80 >> bit);
                        }
                    }
                    command.write(column);
                }
                command.write(0x0A);
            }
            return command.toByteArray();
        } catch (Exception error) {
            return new byte[0];
        }
    }

    private String sanitizePrinterText(String text) {
        if (text == null) return "";
        return text
                .replace("₹", "Rs ")
                .replace("•", "-")
                .replace("–", "-")
                .replace("—", "-")
                .replaceAll("[^\\x09\\x0A\\x0D\\x20-\\x7E]", "");
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

        @JavascriptInterface
        public void printReceiptWithLogo(String text, String logoDataUrl) {
            printReceiptPayload(text, logoDataUrl);
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showPrinterSettings();
                }
            });
        }
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void showStatus(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
