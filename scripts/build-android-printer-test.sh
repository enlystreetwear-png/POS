#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BUILD_TOOLS="$SDK/build-tools/37.0.0"
ANDROID_JAR="$SDK/platforms/android-34/android.jar"
APP="$ROOT/android-printer-test/app"
OUT="$ROOT/android-printer-test/build"
APK="$ROOT/android-printer-test/PondyPOSPrinterTest.apk"

rm -rf "$OUT"
mkdir -p "$OUT/compiled" "$OUT/gen" "$OUT/classes" "$OUT/dex"

"$BUILD_TOOLS/aapt2" compile --dir "$APP/src/main/res" -o "$OUT/compiled/resources.zip"
"$BUILD_TOOLS/aapt2" link \
  -I "$ANDROID_JAR" \
  --manifest "$APP/src/main/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --auto-add-overlay \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  -R "$OUT/compiled/resources.zip" \
  -o "$OUT/unsigned.apk"

javac -source 8 -target 8 -bootclasspath "$ANDROID_JAR" \
  -d "$OUT/classes" \
  $(find "$APP/src/main/java" "$OUT/gen" -name '*.java')

"$BUILD_TOOLS/d8" --classpath "$ANDROID_JAR" --min-api 23 --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && zip -q -u "$OUT/unsigned.apk" classes.dex)

"$BUILD_TOOLS/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KEYSTORE="$OUT/debug.keystore"
keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -storepass android \
  -alias androiddebugkey \
  -keypass android \
  -dname "CN=Android Debug,O=Android,C=US" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 >/dev/null 2>&1

"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$APK" \
  "$OUT/aligned.apk"

"$BUILD_TOOLS/apksigner" verify "$APK"
echo "Built $APK"
