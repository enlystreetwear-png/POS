# CounterCloud POS

A responsive SaaS-style POS app for mobile and desktop. It includes billing, printable receipts, product inventory, customers, sales history, dashboard metrics, demo storage, and Firebase-ready cloud persistence.

## Features

- Mobile and PC responsive POS checkout
- Product catalog with stock tracking
- Cart, tax, discount, payment method, and change due
- Printable receipt/invoice
- Sales history and dashboard totals
- Customer directory
- Product image upload hook for Firebase Storage
- Firebase Auth, Firestore, and Storage ready
- Demo/local mode when Firebase keys are not configured
- Vercel deployment config

## Run Locally

```bash
npm run dev
```

Open `http://localhost:4173`.

## Firebase Setup

1. Create a Firebase project on the free Spark plan.
2. Enable Authentication with Email/Password.
3. Create a Firestore database.
4. Enable Firebase Storage.
5. Copy your Firebase web app config into `public/firebase-config.js`.

The app runs in local demo mode until `apiKey` and `projectId` are filled.

## Suggested Firestore Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tenants/{tenantId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == tenantId;
    }
  }
}
```

## Suggested Storage Rules

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /tenants/{tenantId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == tenantId;
    }
  }
}
```

## Deploy To GitHub And Vercel

```bash
git init
git add .
git commit -m "Initial SaaS POS app"
```

Create a GitHub repository, add it as `origin`, then push:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git branch -M main
git push -u origin main
```

In Vercel, import that GitHub repo. The included `vercel.json` deploys the static frontend directly.
