# PondyPOS

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
- Login screen for Firebase accounts or local demo accounts
- 1 year annual POS subscription record with expiry and renewal flow
- Demo/local mode when Firebase keys are not configured
- Vercel deployment config

## Run Locally

```bash
npm run dev
```

Open `http://localhost:4173`.

## Firebase Setup

1. Create a Firebase project on the free Spark plan.
2. Open Project settings, create a Web app, and copy the Firebase config into `public/firebase-config.js`.
3. Enable Authentication with Email/Password.
4. Enable Authentication with Google.
5. Create a Firestore database.
6. Enable Firebase Storage.

The app runs in local demo mode until `apiKey` and `projectId` are filled.

## Login And Subscription

- Without Firebase keys, the app uses local browser accounts for testing.
- With Firebase keys, sign up and sign in use Firebase Authentication.
- Each store has an annual subscription record in the app data.
- Billing is locked when the annual plan expires, while dashboard, inventory, customers, and sales history remain viewable.
- The included renewal button records a 1 year extension. Before taking real payments, connect that button to Razorpay, Stripe, or another payment gateway.

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
