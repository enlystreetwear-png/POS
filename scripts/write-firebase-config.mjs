import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.join(process.cwd(), "public", "firebase-config.js");

const config = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

if (missing.length) {
  if (await fileExists(target)) {
    console.log("Using existing public/firebase-config.js");
    process.exit(0);
  }

  throw new Error(
    `Missing Firebase environment variables: ${missing.map((key) => `FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`).join(", ")}`
  );
}

await mkdir(path.dirname(target), { recursive: true });
await writeFile(
  target,
  `window.FIREBASE_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
  "utf8"
);
console.log("Generated public/firebase-config.js");
