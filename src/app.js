const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR"
});

const assetVersion = "20260526-silent-cart-save";
const logoLightUrl = `/public/pondy-logo-light-app.png?v=${assetVersion}`;
const logoDarkUrl = `/public/pondy-logo-dark-app.png?v=${assetVersion}`;
const markLightUrl = `/public/pondy-mark-light-app.png?v=${assetVersion}`;
const markDarkUrl = `/public/pondy-mark-dark-app.png?v=${assetVersion}`;
const googleRedirectSessionKey = "pondypos-google-redirect-pending";
const dataStoragePrefix = "pondypos-data";
const pendingSyncPrefix = "pondypos-pending-sync";

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneData(value) {
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const demoProducts = [
  { id: newId(), name: "Masala Dosa", sku: "KIT-001", category: "South Indian", price: 90, cost: 38, stock: 80, imageUrl: "" },
  { id: newId(), name: "Paneer Butter Masala", sku: "CUR-102", category: "Curries", price: 220, cost: 96, stock: 45, imageUrl: "" },
  { id: newId(), name: "Veg Biryani", sku: "RIC-210", category: "Rice Bowls", price: 180, cost: 82, stock: 55, imageUrl: "" },
  { id: newId(), name: "Tandoori Roti", sku: "BRD-011", category: "Breads", price: 35, cost: 12, stock: 120, imageUrl: "" },
  { id: newId(), name: "Fresh Lime Soda", sku: "BEV-044", category: "Beverages", price: 70, cost: 24, stock: 60, imageUrl: "" }
];

const seed = {
  settings: {
    shopName: "PondyPOS Restaurant",
    gstin: "",
    phone: "",
    address: "Your restaurant address",
    taxRate: 18,
    invoicePrefix: "CC",
    saveBillAfterPrint: false
  },
  tables: [
    { id: "T1", name: "Table 1", seats: 2 },
    { id: "T2", name: "Table 2", seats: 4 },
    { id: "T3", name: "Table 3", seats: 4 },
    { id: "T4", name: "Table 4", seats: 6 },
    { id: "T5", name: "Table 5", seats: 2 },
    { id: "T6", name: "Table 6", seats: 4 },
    { id: "T7", name: "Table 7", seats: 6 },
    { id: "T8", name: "Takeaway", seats: 0 }
  ],
  openBills: {},
  kots: [],
  subscription: {
    plan: "Annual POS",
    status: "active",
    amount: 4999,
    startedAt: new Date().toISOString(),
    expiresAt: addYears(new Date(), 1).toISOString(),
    paymentRef: "DEMO-ANNUAL"
  },
  products: demoProducts,
  customers: [
    { id: newId(), name: "Walk-in Customer", phone: "", email: "", totalSpent: 0 }
  ],
  sales: [],
  closings: []
};

const initialSession = readLocalSession();
const initialTenantId = initialSession?.firebaseUid || "demo";

const state = {
  view: "pos",
  sidebarExpanded: readStorage("pondypos-sidebar-expanded", "countercloud-sidebar-expanded") === "true",
  reportKey: "category",
  reportSearch: "",
  firebaseConfigured: hasFirebaseConfig(),
  authReady: !hasFirebaseConfig(),
  authBusy: false,
  authAction: "",
  authRequestId: 0,
  checkoutBusy: false,
  syncStatus: "idle",
  pendingCloudSync: readPendingSync(initialTenantId),
  toast: null,
  cloudReady: false,
  user: null,
  db: null,
  storage: null,
  auth: null,
  recaptchaVerifier: null,
  otpSent: false,
  otpConfirmation: null,
  localSession: initialSession,
  tenantId: initialTenantId,
  data: readLocal(initialTenantId),
  selectedTableId: "",
  billDrafts: {},
  search: "",
  selectedCategory: "All",
  categoryScrollLeft: 0,
  categoryDragSuppressUntil: 0,
  mobileCartOpen: false,
  restoreMainScroll: null,
  restoreProductAnchor: null,
  modal: null,
  authError: "",
  lastReceipt: null,
  printContent: "",
  pendingBill: null
};

const app = document.querySelector("#app");

function dataStorageKey(tenantId = state?.tenantId || "demo") {
  return tenantId && tenantId !== "demo" ? `${dataStoragePrefix}-${tenantId}` : `${dataStoragePrefix}-demo`;
}

function pendingSyncKey(tenantId = state?.tenantId || "demo") {
  return tenantId && tenantId !== "demo" ? `${pendingSyncPrefix}-${tenantId}` : `${pendingSyncPrefix}-demo`;
}

function readPendingSync(tenantId = state?.tenantId || "demo") {
  return localStorage.getItem(pendingSyncKey(tenantId)) === "true";
}

function markPendingSync() {
  state.pendingCloudSync = true;
  localStorage.setItem(pendingSyncKey(), "true");
}

function clearPendingSync() {
  state.pendingCloudSync = false;
  localStorage.removeItem(pendingSyncKey());
}

function readLocal(tenantId = state?.tenantId || "demo") {
  if (tenantId === "demo") migrateStorageKey("countercloud-pos", dataStorageKey("demo"));
  const saved = localStorage.getItem(dataStorageKey(tenantId));
  if (!saved) return normalizeData(cloneData(seed));
  try {
    return normalizeData({ ...cloneData(seed), ...JSON.parse(saved) });
  } catch {
    return normalizeData(cloneData(seed));
  }
}

function writeLocal() {
  localStorage.setItem(dataStorageKey(), JSON.stringify(state.data));
}

function normalizeData(data) {
  const freshSeed = cloneData(seed);
  const settings = { ...freshSeed.settings, ...(data.settings || {}) };
  if (settings.shopName === "CounterCloud Store" || settings.shopName === "CounterCloud Restaurant") settings.shopName = freshSeed.settings.shopName;
  if (settings.address === "Your store address") settings.address = freshSeed.settings.address;
  return {
    ...freshSeed,
    ...data,
    settings,
    modules: data.modules || {},
    subscription: { ...freshSeed.subscription, ...(data.subscription || {}) },
    tables: data.tables?.length ? data.tables : freshSeed.tables,
    openBills: data.openBills || {},
    kots: data.kots || [],
    products: shouldUseRestaurantSeed(data.products) ? freshSeed.products : data.products,
    customers: data.customers?.length ? data.customers : freshSeed.customers,
    sales: data.sales || [],
    closings: data.closings || []
  };
}

function shouldUseRestaurantSeed(products = []) {
  if (!products.length) return true;
  const oldDemoNames = ["Notebook", "USB Cable", "Veg Sandwich", "Cold Coffee"];
  return products.some((product) => oldDemoNames.includes(product.name));
}

function addYears(date, years) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function readLocalSession() {
  migrateStorageKey("countercloud-session", "pondypos-session");
  try {
    const savedSession = JSON.parse(localStorage.getItem("pondypos-session")) || null;
    if (savedSession?.firebase) return savedSession;
    if (savedSession) localStorage.removeItem("pondypos-session");
    const pendingGoogle = JSON.parse(localStorage.getItem(googleRedirectSessionKey)) || null;
    if (pendingGoogle?.expiresAt > Date.now()) {
      return {
        email: pendingGoogle.email || "Google account",
        firebase: true,
        googlePending: true
      };
    }
    localStorage.removeItem(googleRedirectSessionKey);
    return null;
  } catch {
    localStorage.removeItem(googleRedirectSessionKey);
    return null;
  }
}

function readStorage(primaryKey, legacyKey) {
  migrateStorageKey(legacyKey, primaryKey);
  return localStorage.getItem(primaryKey);
}

function migrateStorageKey(legacyKey, primaryKey) {
  if (!localStorage.getItem(primaryKey) && localStorage.getItem(legacyKey)) {
    localStorage.setItem(primaryKey, localStorage.getItem(legacyKey));
  }
}

function hasFirebaseConfig() {
  const config = window.FIREBASE_CONFIG || {};
  return Boolean(config.apiKey && config.projectId);
}

async function initFirebase() {
  if (state.firebaseInitializing || state.cloudReady) return;
  const config = window.FIREBASE_CONFIG || {};
  if (!config.apiKey || !config.projectId) {
    state.authReady = true;
    return;
  }
  state.firebaseInitializing = true;
  try {
    const firebase = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js")
    ]);
    const [{ initializeApp }, authMod, fireMod, storageMod] = firebase;
    const firebaseApp = initializeApp(config);
    state.auth = authMod.getAuth(firebaseApp);
    await authMod.setPersistence(state.auth, authMod.browserLocalPersistence);
    state.db = fireMod.getFirestore(firebaseApp);
    state.storage = storageMod.getStorage(firebaseApp);
    state.firebase = { authMod, fireMod, storageMod };
    state.cloudReady = true;
    try {
      const redirectResult = await authMod.getRedirectResult(state.auth);
      if (redirectResult?.user) await finishSignedInUser(redirectResult.user);
    } catch (error) {
      state.authError = friendlyAuthError(error);
    }
    authMod.onAuthStateChanged(state.auth, async (user) => {
      state.user = user;
      state.tenantId = user?.uid || "demo";
      state.data = readLocal(state.tenantId);
      state.pendingCloudSync = readPendingSync(state.tenantId);
      state.selectedTableId = "";
      state.authReady = true;
      state.authBusy = false;
      if (user) rememberSignedInUser(user);
      render();
      if (user) {
        try {
          await pullCloudData();
          await syncPendingIfOnline({ silent: true });
          render();
        } catch (error) {
          console.warn("Cloud sync failed", error);
          state.authError = "";
        }
      }
    });
  } finally {
    state.firebaseInitializing = false;
  }
}

async function pullCloudData() {
  if (!state.user || !state.db) return;
  if (navigator.onLine === false) {
    state.syncStatus = "offline";
    return;
  }
  const { doc, getDoc, setDoc } = state.firebase.fireMod;
  const ref = doc(state.db, "tenants", state.tenantId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    if (!state.pendingCloudSync) {
      state.data = normalizeData({ ...cloneData(seed), ...snap.data() });
      writeLocal();
    }
  } else {
    state.data = readLocal(state.tenantId);
    await setDoc(ref, state.data);
    clearPendingSync();
  }
}

async function persist() {
  writeLocal();
  if (!state.user || !state.db) {
    state.syncStatus = "local";
    return;
  }
  if (navigator.onLine === false) {
    markPendingSync();
    state.syncStatus = "offline";
    return;
  }
  const { doc, setDoc, serverTimestamp } = state.firebase.fireMod;
  state.syncStatus = "syncing";
  try {
    await setDoc(doc(state.db, "tenants", state.tenantId), {
      ...state.data,
      updatedAt: serverTimestamp()
    });
    clearPendingSync();
    state.syncStatus = "synced";
    state.lastSyncedAt = new Date().toISOString();
  } catch (error) {
    markPendingSync();
    state.syncStatus = navigator.onLine === false ? "offline" : "error";
    throw error;
  }
}

async function persistSafely(successMessage, errorMessage = "Saved locally. Cloud sync failed.") {
  try {
    await persist();
    setToast(successMessage);
    return true;
  } catch (error) {
    console.warn(errorMessage, error);
    setToast(errorMessage, "error");
    return false;
  }
}

function persistInBackground(errorMessage = "Saved locally. Cloud sync pending.", options = {}) {
  const { showToast = true, renderOnError = true } = options;
  persist().catch((error) => {
    console.warn(errorMessage, error);
    if (showToast && !state.toast) setToast(errorMessage, "error");
    if (renderOnError) render();
  });
}

async function syncPendingIfOnline({ silent = false } = {}) {
  if (!state.user || !state.db || navigator.onLine === false) return false;
  if (!state.pendingCloudSync && !readPendingSync(state.tenantId)) return false;
  try {
    await persist();
    if (!silent) setToast("Offline changes synced");
    return true;
  } catch (error) {
    console.warn("Pending sync failed", error);
    if (!silent) setToast("Still offline. Changes remain saved locally.", "error");
    return false;
  } finally {
    if (!silent) render();
  }
}

function money(value) {
  return currency.format(Number(value || 0));
}

function isAuthenticated() {
  return Boolean(state.user || state.localSession);
}

function currentEmail() {
  return state.user?.email || state.user?.phoneNumber || state.localSession?.email || state.localSession?.phone || "Phone account";
}

function getSubscription() {
  return state.data.subscription || seed.subscription;
}

function isSubscriptionActive() {
  const subscription = getSubscription();
  return subscription.status === "active" && new Date(subscription.expiresAt) >= new Date();
}

function subscriptionDaysLeft() {
  const expiresAt = new Date(getSubscription().expiresAt);
  return Math.max(0, Math.ceil((expiresAt - new Date()) / 86400000));
}

function currentCart() {
  if (!state.selectedTableId) return [];
  state.data.openBills[state.selectedTableId] ||= [];
  return state.data.openBills[state.selectedTableId];
}

function setCurrentCart(cart) {
  if (!state.selectedTableId) return;
  if (cart.length) state.data.openBills[state.selectedTableId] = cart;
  else delete state.data.openBills[state.selectedTableId];
}

function selectedTable() {
  return state.data.tables.find((table) => table.id === state.selectedTableId);
}

function currentBillDraft() {
  if (!state.selectedTableId) return { customerName: "Walk-in Customer", discount: 0, paid: "" };
  state.billDrafts ||= {};
  state.billDrafts[state.selectedTableId] ||= {
    customerName: "Walk-in Customer",
    discount: 0,
    paid: ""
  };
  return state.billDrafts[state.selectedTableId];
}

function tableTotal(tableId) {
  return (state.data.openBills[tableId] || []).reduce((sum, item) => sum + item.price * item.qty, 0);
}

function totals(cart = currentCart()) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const draft = currentBillDraft();
  const discount = Number(document.querySelector("#discount")?.value ?? draft.discount ?? 0);
  const taxRate = Number(state.data.settings.taxRate || 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (taxRate / 100);
  return { subtotal, discount, tax, total: taxable + tax };
}

function setView(view) {
  state.view = view;
  if (view === "pos") {
    state.selectedTableId = "";
    state.mobileCartOpen = false;
  }
  state.modal = null;
  render();
}

function icon(name, size = 18) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
}

function escapeAttr(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function render() {
  app.innerHTML = !isAuthenticated() ? renderAuth() : renderShell();
  createIconsSafely();
  bindEvents();
  if (state.focusReportSearch) {
    const search = document.querySelector("#report-search");
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
    state.focusReportSearch = false;
  }
  if (typeof state.restoreMainScroll === "number") {
    const scrollTop = state.restoreMainScroll;
    const anchor = state.restoreProductAnchor;
    const applyScroll = () => {
      const main = document.querySelector(".main");
      if (!main) return;
      main.scrollTop = scrollTop;
      if (!anchor) return;
      const anchoredButton = [...document.querySelectorAll("[data-add]")].find((button) => button.dataset.add === anchor.id);
      const anchoredCard = anchoredButton?.closest(".product-card");
      if (anchoredCard) main.scrollTop += anchoredCard.getBoundingClientRect().top - anchor.top;
    };
    applyScroll();
    requestAnimationFrame(() => {
      applyScroll();
      requestAnimationFrame(applyScroll);
    });
    state.restoreMainScroll = null;
    state.restoreProductAnchor = null;
  }
}

function createIconsSafely() {
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function renderAuth() {
  const waitingForFirebase = state.firebaseConfigured && !state.authReady;
  const sendingOtp = state.authBusy && state.authAction === "otp";
  const verifyingOtp = state.authBusy && state.authAction === "otpVerify";
  const redirectingGoogle = state.authBusy && state.authAction === "google";
  const otpDisabled = state.authBusy || waitingForFirebase;
  const googleDisabled = waitingForFirebase || verifyingOtp || redirectingGoogle;
  const otpText = verifyingOtp ? "Verifying..." : sendingOtp ? "Sending OTP..." : (state.otpSent ? "Verify OTP" : "Send OTP");
  const googleText = waitingForFirebase ? "Connecting to Firebase..." : redirectingGoogle ? "Redirecting to Google..." : "Continue with Google";
  return `
    <main class="auth">
      <section class="auth-hero">
        <div class="brand" style="margin-bottom:42px">
          <img class="auth-hero-logo" src="${markDarkUrl}" alt="PondyPOS">
        </div>
        <span class="eyebrow">Cloud restaurant operations</span>
        <h1>PondyPOS</h1>
        <p>Table-first billing, menu control, guest records, order history, and annual SaaS licensing in one responsive restaurant workspace.</p>
        <div class="auth-proof">
          <div><strong>Table-first</strong><span>Open bills by table</span></div>
          <div><strong>Cloud-ready</strong><span>Firebase sync</span></div>
          <div><strong>Mobile + PC</strong><span>One interface</span></div>
        </div>
      </section>
      <section class="auth-card">
        <div class="mobile-auth-brand">
          <img src="${markLightUrl}" alt="">
          <strong>PondyPOS</strong>
        </div>
        ${state.authError ? `<div class="auth-error">${icon("circle-alert")}<span>${state.authError}</span></div>` : ""}
        ${waitingForFirebase ? `<div class="auth-loading">${icon("loader-circle")}<span>Connecting to Firebase. Login will be ready in a moment.</span></div>` : ""}
        <h2>Sign in with phone OTP</h2>
        <div class="field"><label>Phone number</label><input class="input" id="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 98765 43210" value="${escapeAttr(state.phoneNumber || "")}" ${state.otpSent ? "disabled" : ""}></div>
        ${state.otpSent ? `<div class="field"><label>OTP code</label><input class="input" id="otp" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 digit OTP" maxlength="8"></div>` : ""}
        <div id="recaptcha-container"></div>
        <button class="button" id="${state.otpSent ? "verify-otp" : "send-otp"}" ${otpDisabled ? "disabled" : ""}>${icon(state.otpSent ? "badge-check" : "smartphone")} ${otpText}</button>
        ${sendingOtp ? `<button class="button secondary" id="reset-auth">${icon("rotate-ccw")} Try again</button>` : ""}
        ${state.otpSent ? `<button class="button secondary" id="change-phone" ${state.authBusy ? "disabled" : ""}>${icon("rotate-ccw")} Change phone number</button>` : ""}
        <div class="auth-divider"><span></span><strong>OR</strong><span></span></div>
        <button class="button google" id="google-signin" ${googleDisabled ? "disabled" : ""}>${icon("chrome")} ${googleText}</button>
      </section>
    </main>
  `;
}

function renderShell() {
  const shellClasses = [
    "app-shell",
    state.sidebarExpanded ? "sidebar-expanded" : "sidebar-collapsed",
    `view-${state.view}`,
    state.selectedTableId ? "table-selected" : "",
    state.mobileCartOpen ? "cart-open-shell" : ""
  ].filter(Boolean).join(" ");
  return `
    <div class="${shellClasses}">
      <aside class="sidebar">
        ${renderBrand()}
        ${renderNav("nav")}
        <div class="sidebar-footer">
          <div class="sidebar-meta">${currentEmail()}</div>
          <div class="sidebar-meta">${isSubscriptionActive() ? `${subscriptionDaysLeft()} days left in annual plan` : "Subscription expired"}</div>
          <button class="button secondary" id="signout" title="Sign out">${icon("log-out")} <span>Sign out</span></button>
        </div>
      </aside>
      <main class="main">
        ${views[state.view]()}
      </main>
      ${renderMobileNav()}
      ${state.printContent ? `<div class="print-stage">${state.printContent}</div>` : ""}
      ${state.modal ? renderModal() : ""}
      ${renderToast()}
    </div>
  `;
}

function renderBrand() {
  return `
    <div class="brand">
      <button class="brand-toggle" id="brand-toggle" title="${state.sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}">
        <span class="brand-mark"><img src="${markDarkUrl}" alt="PondyPOS"></span>
        <span class="brand-text"><h1>PondyPOS</h1><span>Restaurant POS</span></span>
      </button>
    </div>
  `;
}

function renderNav(className) {
  const items = [
    ["pos", "utensils", "Tables"],
    ["dashboard", "layout-dashboard", "Dashboard"],
    ["operations", "sliders-horizontal", "Operations"],
    ["reports", "chart-line", "Reports"],
    ["settings", "settings", "Settings"],
    ["products", "book-open", "Menu"],
    ["customers", "users", "Guests"],
    ["sales", "receipt-text", "Orders"],
    ["subscription", "badge-indian-rupee", "Plan"]
  ];
  const mobileItems = [
    ["pos", "utensils", "Tables"],
    ["dashboard", "layout-dashboard", "Dashboard"],
    ["operations", "sliders-horizontal", "Operations"],
    ["reports", "chart-line", "Reports"],
    ["settings", "settings", "Settings"]
  ];
  const visibleItems = className === "mobile-nav" ? mobileItems : items;
  const activeView = className === "mobile-nav" ? mobileActiveView() : state.view;
  return `<nav class="${className}">${visibleItems.map(([view, iconName, label]) => `
    <button class="${activeView === view ? "active" : ""}" data-view="${view}" title="${label}">
      ${icon(iconName)} <span>${label}</span>
    </button>`).join("")}</nav>`;
}

function renderMobileNav() {
  return renderNav("mobile-nav");
}

function mobileActiveView() {
  if (["products", "customers", "sales"].includes(state.view)) return "operations";
  if (state.view === "subscription") return "settings";
  return state.view;
}

function renderTopbar() {
  if (state.view === "pos") return "";
  const titles = {
    pos: ["Restaurant Tables", "Select a table, add menu items, accept payment, and print receipts."],
    dashboard: ["Restaurant Dashboard", "Today’s revenue, open tables, orders, and stock health."],
    operations: ["Operations", "Restaurant billing, payments, menu, and system modules in one place."],
    reports: ["Reports", "Category, item, sales, order, employee, settlement, and counter summaries."],
    settings: ["Outlet Settings", "Configure billing screen, printing, taxes, customers, and restaurant profile."],
    products: ["Menu And Stock", "Manage menu items, kitchen categories, pricing, stock, and images."],
    customers: ["Guests", "Track guest details and visit totals."],
    sales: ["Order History", "Review table invoices and reprint receipts."],
    subscription: ["Subscription", "Manage the one-year POS subscription for this store."]
  };
  const [title, sub] = titles[state.view];
  return `
    <header class="topbar">
      <div><h2>${title}</h2><p>${sub}</p></div>
      <div class="toolbar">
        <div class="status-pill ${isSubscriptionActive() ? "ok" : "danger"}">${icon(isSubscriptionActive() ? "badge-check" : "badge-x", 16)} ${isSubscriptionActive() ? `${subscriptionDaysLeft()} days left` : "Plan expired"}</div>
        <div class="status-pill ${state.syncStatus === "error" ? "danger" : ""}">${icon(syncIcon(), 16)} ${syncLabel()}</div>
      </div>
    </header>
  `;
}

function syncIcon() {
  if (!state.user) return "hard-drive";
  if (state.syncStatus === "syncing") return "loader-circle";
  if (state.syncStatus === "offline") return "wifi-off";
  if (state.syncStatus === "error") return "cloud-off";
  if (state.pendingCloudSync) return "cloud-upload";
  return "cloud-check";
}

function syncLabel() {
  if (!state.user) return "Local mode";
  if (state.syncStatus === "syncing") return "Syncing";
  if (state.syncStatus === "offline") return "Offline saved";
  if (state.syncStatus === "error") return "Sync issue";
  if (state.pendingCloudSync) return "Cloud pending";
  if (state.lastSyncedAt) return `Synced ${new Date(state.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return "Firebase cloud";
}

function renderToast() {
  if (!state.toast) return "";
  return `
    <div class="toast ${state.toast.type || "info"}">
      ${icon(state.toast.type === "error" ? "circle-alert" : "circle-check", 18)}
      <span>${state.toast.message}</span>
      <button class="icon-button" id="close-toast" title="Close">${icon("x", 16)}</button>
    </div>
  `;
}

function setToast(message, type = "success") {
  state.toast = { message, type };
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 3200);
}

const views = {
  dashboard: renderDashboard,
  pos: renderPOS,
  operations: renderOperations,
  reports: renderReports,
  settings: renderOutletSettings,
  products: renderProducts,
  customers: renderCustomers,
  sales: renderSales,
  subscription: renderSubscription
};

function renderDashboard() {
  const today = new Date().toDateString();
  const todaysSales = state.data.sales.filter((sale) => new Date(sale.createdAt).toDateString() === today);
  const revenue = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
  const openTables = state.data.tables.filter((table) => (state.data.openBills[table.id] || []).length);
  const openTableValue = openTables.reduce((sum, table) => sum + tableTotal(table.id), 0);
  const activeKots = (state.data.kots || []).filter((kot) => kot.status !== "billed");
  const lowStockProducts = state.data.products.filter((product) => Number(product.stock) <= 5);
  const lowStock = lowStockProducts.length;
  const avgBill = todaysSales.length ? revenue / todaysSales.length : 0;
  const cashRevenue = todaysSales.filter((sale) => sale.payment === "Cash").reduce((sum, sale) => sum + sale.total, 0);
  const digitalRevenue = Math.max(0, revenue - cashRevenue);
  const tableLoad = percent(openTables.length, Math.max(1, state.data.tables.length));
  const stockHealth = percent(Math.max(0, state.data.products.length - lowStock), Math.max(1, state.data.products.length));
  const cashShare = percent(cashRevenue, Math.max(1, revenue));
  return `
    <section class="grid dashboard-grid">
      ${metric("Today sales", money(revenue), "indian-rupee")}
      ${metric("Open table value", money(openTableValue), "utensils")}
      ${metric("Invoices", todaysSales.length, "receipt")}
      ${metric("Average bill", money(avgBill), "chart-no-axes-column")}
    </section>
    <section class="dashboard-overview">
      <div class="panel dashboard-command">
        <div>
          <span class="eyebrow">Live restaurant status</span>
          <h3>${openTables.length ? `${openTables.length} table${openTables.length === 1 ? "" : "s"} running` : "Floor is clear"}</h3>
          <p>${activeKots.length} active KOT${activeKots.length === 1 ? "" : "s"} • ${lowStock} low stock item${lowStock === 1 ? "" : "s"} • Last close ${lastClosingLabel()}</p>
        </div>
        <div class="dashboard-actions">
          <button class="button" data-view="pos">${icon("utensils")} Open tables</button>
          <button class="button secondary" id="close-shift">${icon("badge-check")} Close shift</button>
          <button class="button secondary" id="export-backup">${icon("download")} Backup</button>
        </div>
      </div>
      <div class="dashboard-rings">
        ${ringChart("Table load", tableLoad, `${openTables.length}/${state.data.tables.length}`, "occupied")}
        ${ringChart("Cash sales", cashShare, money(cashRevenue), digitalRevenue ? `${money(digitalRevenue)} digital` : "No digital sales")}
        ${ringChart("Stock health", stockHealth, `${state.data.products.length - lowStock}/${state.data.products.length}`, lowStock ? `${lowStock} low` : "Healthy")}
      </div>
    </section>
    <section class="grid dashboard-split">
      <div class="panel">
        <div class="panel-header"><h3>Running tables</h3><button class="button secondary" data-view="pos">${icon("arrow-right")} Billing</button></div>
        ${openTables.length ? renderOpenTableList(openTables) : `<div class="empty">No running table bills right now</div>`}
      </div>
      <div class="panel">
        <div class="panel-header"><h3>Action queue</h3><button class="button secondary" data-view="products">${icon("boxes")} Stock</button></div>
        <div class="health-list">
          ${queueRow(activeKots.length ? "warn" : "ok", "Kitchen tickets", activeKots.length ? `${activeKots.length} KOTs waiting or cooking` : "No pending kitchen tickets", activeKots.length ? "scroll-text" : "circle-check")}
          ${queueRow(openTables.length ? "warn" : "ok", "Open bills", openTables.length ? `${openTables.length} bills need settlement` : "No open bills", openTables.length ? "receipt" : "circle-check")}
          ${queueRow(lowStock ? "warn" : "ok", "Low stock", lowStock ? lowStockProducts.slice(0, 3).map((item) => item.name).join(", ") : "All menu stock looks fine", lowStock ? "triangle-alert" : "circle-check")}
          ${queueRow(state.syncStatus === "error" ? "warn" : "ok", "Cloud sync", syncLabel(), syncIcon())}
        </div>
      </div>
    </section>
    <section class="panel dashboard-recent">
      <div class="panel-header"><h3>Recent invoices</h3><div class="toolbar"><button class="button secondary" data-view="reports">${icon("chart-line")} Reports</button><button class="button secondary" data-view="sales">${icon("arrow-right")} View sales</button></div></div>
      ${renderSaleList(state.data.sales.slice(0, 5))}
    </section>
  `;
}

function percent(value, total) {
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / Number(total || 1)) * 100)));
}

function ringChart(label, value, main, sub) {
  return `
    <div class="ring-card">
      <div class="ring" style="--value:${value}"><strong>${value}%</strong></div>
      <div><h4>${label}</h4><strong>${main}</strong><span>${sub}</span></div>
    </div>
  `;
}

function queueRow(status, title, text, iconName) {
  return `
    <div class="health-row ${status}">
      ${icon(iconName, 18)}
      <div><strong>${title}</strong><span>${text}</span></div>
    </div>
  `;
}

function metric(label, value, iconName) {
  return `<div class="metric">${icon(iconName)}<span>${label}</span><strong>${value}</strong></div>`;
}

function statusTile(label, value, iconName) {
  return `<div class="status-tile">${icon(iconName, 20)}<span>${label}</span><strong>${value}</strong></div>`;
}

function businessHealth() {
  const lowStock = state.data.products.filter((product) => Number(product.stock) <= 5).length;
  const hasFirebase = Boolean(state.user);
  const openBills = state.data.tables.filter((table) => (state.data.openBills[table.id] || []).length).length;
  const profileReady = Boolean(state.data.settings.shopName && state.data.settings.phone && state.data.settings.address);
  return [
    { status: hasFirebase ? "ok" : "warn", title: "Cloud account", text: hasFirebase ? "Data is separated by Firebase login." : "Login with phone or Google for cloud sync." },
    { status: profileReady ? "ok" : "warn", title: "Restaurant profile", text: profileReady ? "Receipt identity is ready." : "Add phone and address in Settings." },
    { status: lowStock ? "warn" : "ok", title: "Inventory", text: lowStock ? `${lowStock} items need stock review.` : "Stock levels look healthy." },
    { status: openBills ? "warn" : "ok", title: "Open tables", text: openBills ? `${openBills} running bills need settlement.` : "No open table bills." }
  ];
}

function lastClosingLabel() {
  const closing = state.data.closings?.[0];
  return closing ? new Date(closing.closedAt).toLocaleDateString() : "Not done";
}

function renderPOS() {
  if (!state.selectedTableId) return renderTablePicker();
  const categories = ["All", ...new Set(state.data.products.map((product) => product.category || "General"))].sort((a, b) =>
    a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)
  );
  if (!categories.includes(state.selectedCategory)) state.selectedCategory = "All";
  const search = state.search.toLowerCase();
  const filtered = state.data.products.filter((product) => {
    const category = product.category || "General";
    const matchesCategory = state.selectedCategory === "All" || category === state.selectedCategory;
    const matchesSearch = [product.name, product.sku, category].join(" ").toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
  const locked = !isSubscriptionActive();
  const table = selectedTable();
  const cart = currentCart();
  const draft = currentBillDraft();
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const current = totals(cart);
  return `
    ${locked ? renderSubscriptionBanner() : ""}
    <section class="grid pos-grid ${state.mobileCartOpen ? "cart-open" : ""}">
      <div class="panel menu-panel">
        <div class="panel-header menu-panel-header">
          <div class="toolbar menu-titlebar">
            <button class="button secondary compact" id="back-to-tables">${icon("arrow-left")} Tables</button>
            <div class="menu-context">
              <h3>Menu</h3>
              <span>${table?.name || "Table"}</span>
            </div>
          </div>
          <input class="input search" id="search" placeholder="Search menu item or scan SKU" value="${escapeAttr(state.search)}">
          <div class="mobile-table-context">Billing for <strong>${escapeAttr(table?.name || "Table")}</strong></div>
        </div>
        <div class="category-scroll-shell">
          <div class="category-strip">
            ${categories.map((category) => `
              <button class="category-chip ${category === state.selectedCategory ? "active" : ""}" data-category="${escapeAttr(category)}">
                ${escapeAttr(category)}
              </button>
            `).join("")}
          </div>
        </div>
        <div class="grid product-grid">
          ${filtered.map(renderProductCard).join("") || `<div class="empty">No products found</div>`}
        </div>
      </div>
      <aside class="panel bill-panel ${state.mobileCartOpen ? "mobile-cart-open" : ""}">
        <div class="panel-header bill-heading">
          <div class="bill-title-stack">
            <h3 class="cart-table-title">${table?.name || "Current bill"}</h3>
            <label class="bill-customer-field">
              <input class="input" id="bill-customer-name" list="customer-suggestions" value="${escapeAttr(draft.customerName)}" placeholder="Walk-in Customer">
            </label>
          </div>
          <datalist id="customer-suggestions">
            ${state.data.customers.map((c) => `<option value="${escapeAttr(c.name)}"></option>`).join("")}
          </datalist>
          <button class="button secondary compact mobile-menu-back" id="mobile-close-cart">← Back</button>
          <button class="icon-button" id="clear-cart" title="Clear cart">${icon("trash-2")}</button>
        </div>
        <div class="bill-scroll">
          <div class="cart-list">${cart.map(renderCartRow).join("") || `<div class="empty">Tap products to add them to this table bill</div>`}</div>
        </div>
        <div class="bill-footer">
          <div class="form-grid bill-form">
            <div class="field"><label>Payment</label><select id="payment"><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option></select></div>
            <div class="field"><label>Amount Paid</label><input class="input" id="paid" type="number" min="0" placeholder="0" value="${escapeAttr(draft.paid)}"></div>
          </div>
          ${renderSummary()}
          <div class="bill-actions">
            <button class="button secondary" id="save-kot" ${locked || !cart.length ? "disabled" : ""}>${icon("scroll-text")} KOT</button>
            ${state.pendingBill?.tableId === state.selectedTableId
              ? `<button class="button" id="save-printed-bill" ${state.checkoutBusy ? "disabled" : ""}>${icon("save")} ${state.checkoutBusy ? "Saving..." : "Save bill"}</button>`
              : `<button class="button" id="checkout" ${locked || state.checkoutBusy ? "disabled" : ""}>${icon("receipt-text")} ${state.checkoutBusy ? "Billing..." : state.data.settings.saveBillAfterPrint ? "Print bill" : "BILL"}</button>`}
          </div>
        </div>
      </aside>
      <button class="mobile-cart-button" id="mobile-cart-toggle">
        <span>${icon(state.mobileCartOpen ? "utensils" : "shopping-cart")} ${state.mobileCartOpen ? "Back to menu" : "Cart"}</span>
        <strong>${itemCount} item${itemCount === 1 ? "" : "s"} • ${money(current.total)}</strong>
      </button>
    </section>
  `;
}

function renderTablePicker() {
  const occupied = state.data.tables.filter((table) => (state.data.openBills[table.id] || []).length).length;
  const totalOpenAmount = state.data.tables.reduce((sum, table) => sum + tableTotal(table.id), 0);
  const kotCount = state.data.kots?.filter((kot) => kot.status !== "billed").length || 0;
  return `
    <section class="table-hero">
      <div>
        <span class="eyebrow">Billing starts here</span>
        <h3>Select a table</h3>
        <p>Choose a table, send KOT to kitchen, then complete billing when the guest pays.</p>
      </div>
      <div class="table-summary-grid">
        <div class="table-summary"><strong>${occupied}</strong><span>open bills</span></div>
        <div class="table-summary"><strong>${kotCount}</strong><span>active KOTs</span></div>
      </div>
    </section>
    <section class="table-tools">
      <button class="button" id="quick-takeaway">${icon("shopping-bag")} New takeaway</button>
      <button class="button secondary" id="view-kots">${icon("scroll-text")} View KOTs</button>
      <div><strong>${money(totalOpenAmount)}</strong><span>running table value</span></div>
    </section>
    <section class="grid table-grid">
      ${state.data.tables.map(renderTableCard).join("")}
    </section>
  `;
}

function renderTableCard(table) {
  const cart = state.data.openBills[table.id] || [];
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const occupied = itemCount > 0;
  return `
    <button class="table-card ${occupied ? "occupied" : ""}" data-table="${table.id}">
      <div class="table-card-top">
        <span>${icon(occupied ? "utensils" : "circle", 18)}</span>
        <strong>${occupied ? "Open" : "Free"}</strong>
      </div>
      <h4>${table.name}</h4>
      <p>${table.seats ? `${table.seats} seats` : "Counter order"}</p>
      <div class="table-card-footer">
        <span>${itemCount} items</span>
        <strong>${money(tableTotal(table.id))}</strong>
      </div>
      ${occupied ? `<div class="table-card-kot">${icon("scroll-text", 14)} KOT active</div>` : ""}
    </button>
  `;
}

function renderSubscriptionBanner() {
  return `
    <section class="subscription-alert">
      <div>${icon("lock-keyhole")}<strong>Annual subscription expired</strong><span>Renew the 1 year POS plan to continue billing.</span></div>
      <button class="button" data-view="subscription">${icon("badge-indian-rupee")} Renew</button>
    </section>
  `;
}

function renderProductCard(product) {
  const imageSrc = productImageSrc(product);
  const art = imageSrc ? `<img src="${imageSrc}" alt="${escapeAttr(product.name)}">` : product.name.slice(0, 2).toUpperCase();
  const cartItem = currentCart().find((item) => item.id === product.id);
  const quantity = Number(cartItem?.qty || 0);
  return `
    <article class="product-card ${quantity ? "in-cart" : ""}">
      ${quantity ? `
        <button class="product-remove" data-dec="${product.id}" title="Remove one ${escapeAttr(product.name)}">${icon(quantity === 1 ? "trash-2" : "minus", 15)}</button>
        <span class="product-qty-badge">${quantity}</span>
      ` : ""}
      <button class="product-add-area" data-add="${product.id}" title="Add ${escapeAttr(product.name)}">
        <div class="product-art">${art}</div>
        <div class="product-body">
          <h4>${product.name}</h4>
          <div class="product-meta"><span>${product.category || "General"}</span><span>Stock ${product.stock}</span></div>
          <div class="product-meta"><span>${product.sku || "No SKU"}</span><span class="price">${money(product.price)}</span></div>
        </div>
      </button>
    </article>
  `;
}

function productImageSrc(product = {}) {
  if (!product.imageUrl) return "";
  if (product.imageUrl.startsWith("data:")) return product.imageUrl;
  const separator = product.imageUrl.includes("?") ? "&" : "?";
  return `${product.imageUrl}${separator}v=${encodeURIComponent(product.imageUpdatedAt || product.id || assetVersion)}`;
}

function renderCartRow(item) {
  return `
    <div class="cart-row">
      <div><h4>${item.name}</h4><p>${money(item.price)} x ${item.qty}</p></div>
      <div class="qty-controls">
        <button data-dec="${item.id}" title="Decrease">-</button>
        <strong>${item.qty}</strong>
        <button data-inc="${item.id}" title="Increase">+</button>
      </div>
    </div>
  `;
}

function renderSummary() {
  const current = totals();
  const draft = currentBillDraft();
  const paid = Number(document.querySelector("#paid")?.value || draft.paid || 0);
  return `
    <div class="summary">
      <div class="summary-row"><span>Subtotal</span><strong>${money(current.subtotal)}</strong></div>
      <label class="summary-row summary-edit"><span>Discount</span><input class="input summary-input" id="discount" type="number" value="${escapeAttr(current.discount)}" min="0"></label>
      <div class="summary-row"><span>Tax (${state.data.settings.taxRate}%)</span><strong>${money(current.tax)}</strong></div>
      <div class="summary-row total"><span>Total</span><strong>${money(current.total)}</strong></div>
      <div class="summary-row"><span>Change due</span><strong>${money(Math.max(0, paid - current.total))}</strong></div>
    </div>
  `;
}

function renderProducts() {
  return `
    <section class="panel">
      <div class="panel-header">
        <h3>Menu items</h3>
        <button class="button" id="new-product">${icon("plus")} Menu item</button>
      </div>
      <table class="table">
        <thead><tr><th>Image</th><th>Name</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          ${state.data.products.map((product) => `
            <tr>
              <td>${productThumb(product)}</td>
              <td><strong>${product.name}</strong></td>
              <td>${product.sku || "-"}</td>
              <td>${product.category || "General"}</td>
              <td>${money(product.price)}</td>
              <td>${product.stock}</td>
              <td><button class="icon-button" data-edit-product="${product.id}" title="Edit product">${icon("pencil")}</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-header"><h3>Restaurant settings</h3></div>
      <div class="form-grid">
        ${settingField("shopName", "Restaurant name")}
        ${settingField("phone", "Phone")}
        ${settingField("gstin", "GSTIN")}
        ${settingField("taxRate", "Tax rate %", "number")}
        <div class="field" style="grid-column:1/-1"><label>Address</label><textarea id="setting-address">${state.data.settings.address || ""}</textarea></div>
      </div>
      <button class="button" id="save-settings" style="margin-top:12px">${icon("save")} Save settings</button>
    </section>
  `;
}

function settingField(key, label, type = "text") {
  return `<div class="field"><label>${label}</label><input class="input" id="setting-${key}" type="${type}" value="${state.data.settings[key] || ""}"></div>`;
}

function renderCustomers() {
  return `
    <section class="panel">
      <div class="panel-header"><h3>Guest directory</h3><button class="button" id="new-customer">${icon("user-plus")} Guest</button></div>
      <div class="customer-list">
        ${state.data.customers.map((customer) => `
          <div class="customer-row">
            <div><h4>${customer.name}</h4><p>${customer.phone || "No phone"} ${customer.email ? `• ${customer.email}` : ""}</p></div>
            <strong>${money(customer.totalSpent || 0)}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSales() {
  return `
    <section class="panel">
      <div class="panel-header"><h3>Table invoices</h3></div>
      ${renderSaleList(state.data.sales)}
    </section>
  `;
}

function renderSubscription() {
  const subscription = getSubscription();
  const active = isSubscriptionActive();
  const startedAt = subscription.startedAt ? new Date(subscription.startedAt).toLocaleDateString() : "-";
  const expiresAt = subscription.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString() : "-";
  return `
    <section class="subscription-hero">
      <div>
        <span class="eyebrow">PondyPOS Annual</span>
        <h3>1 year POS subscription</h3>
        <p>Keep billing, inventory, sales history, customers, Firebase sync, and product image storage available for one store account.</p>
      </div>
      <div class="plan-price">
        <strong>${money(subscription.amount || 4999)}</strong>
        <span>per year</span>
      </div>
    </section>
    <section class="grid subscription-grid">
      <div class="panel">
        <div class="panel-header"><h3>Plan status</h3><span class="badge ${active ? "ok" : "danger"}">${active ? "Active" : "Expired"}</span></div>
        <div class="plan-facts">
          <div><span>Account</span><strong>${currentEmail()}</strong></div>
          <div><span>Started</span><strong>${startedAt}</strong></div>
          <div><span>Expires</span><strong>${expiresAt}</strong></div>
          <div><span>Days left</span><strong>${subscriptionDaysLeft()}</strong></div>
          <div><span>Payment ref</span><strong>${subscription.paymentRef || "-"}</strong></div>
        </div>
      </div>
      <div class="panel plan-card">
        <div class="panel-header"><h3>Annual license</h3>${icon("shield-check", 28)}</div>
        <ul class="feature-list">
          <li>${icon("check", 16)} Unlimited billing from mobile and PC</li>
          <li>${icon("check", 16)} Firebase cloud data and image storage</li>
          <li>${icon("check", 16)} Inventory, customers, and sales reports</li>
          <li>${icon("check", 16)} Receipt printing and invoice history</li>
        </ul>
        <button class="button" id="renew-subscription">${icon("badge-indian-rupee")} ${active ? "Extend 1 more year" : "Activate annual plan"}</button>
        <p class="fine-print">This app stores the subscription record in Firebase/local data. Connect this button to Razorpay, Stripe, or your preferred payment provider before accepting real payments.</p>
      </div>
    </section>
  `;
}

function renderOperations() {
  const groups = [
    ["Service Counter", [
      ["Billing Screen", "receipt", "Open table billing."],
      ["KOTs", "scroll-text", "Kitchen tickets."],
      ["Live View", "radio", "Running tables."],
      ["Due Payment", "badge-indian-rupee", "Customer dues."],
      ["Close Shift", "badge-check", "End day summary."]
    ]],
    ["Menu & Floor", [
      ["Menu", "book-open", "Items, prices and images."],
      ["Table", "table", "Table layout."],
      ["Customers", "users", "Guest records."],
      ["Menu Item On Off", "toggle-left", "Item availability."],
      ["Table Reservation", "calendar-check", "Guest bookings."]
    ]],
    ["Money & Reports", [
      ["Cash Flow", "hand-coins", "Drawer status."],
      ["Expense", "circle-dollar-sign", "Restaurant expenses."],
      ["Discount", "badge", "Discount rules and permissions."],
      ["Tax", "badge-percent", "GST setup."],
      ["Reports", "chart-line", "Sales reports."]
    ]],
    ["System Settings", [
      ["Bill / KOT Print", "printer", "Print rules."],
      ["Manual Sync", "refresh-cw", "Cloud sync."],
      ["Backup & Restore", "database-backup", "Data backup."],
      ["Billing User Profile", "id-card", "Staff profile."],
      ["Alerts", "bell", "Alerts."],
      ["Service Renewal", "rotate-ccw", "Annual plan."]
    ]]
  ];
  return groups.map(([title, items]) => `
    <section class="panel ops-panel">
      <div class="panel-header"><h3>${title}</h3></div>
      <div class="ops-grid">${items.map(([label, iconName, text]) => `
        <button class="ops-card" data-action="${actionKey(label)}" data-action-label="${escapeAttr(label)}">
          ${icon(iconName)}
          <span><strong>${label}</strong><small>${text}</small></span>
        </button>
      `).join("")}</div>
    </section>
  `).join("");
}

function renderReports() {
  const report = reportDefinitions().find((item) => item.key === state.reportKey) || reportDefinitions()[0];
  return `
    <section class="grid report-shell">
      <aside class="panel report-menu">
        <div class="panel-header"><h3>Reports</h3></div>
        ${reportDefinitions().map((item) => `<button class="${item.key === state.reportKey ? "active" : ""}" data-report="${item.key}">${item.label}</button>`).join("")}
      </aside>
      <section class="panel report-content">
        <div class="panel-header">
          <h3>${report.title}</h3>
          <div class="toolbar">
            <input class="input report-search" id="report-search" placeholder="Search report" value="${escapeAttr(state.reportSearch)}">
            <button class="button secondary" id="print-report">${icon("printer", 16)} Print</button>
            <button class="button secondary" id="export-report">${icon("file-spreadsheet", 16)} Export CSV</button>
          </div>
        </div>
        ${report.render()}
      </section>
    </section>
  `;
}

function reportDefinitions() {
  return [
    { key: "category", label: "Category Summary", title: "Category Report", render: renderCategoryReport },
    { key: "item", label: "Item Summary", title: "Item Report", render: renderItemReport },
    { key: "sales", label: "Sales Summary", title: "Sales Report", render: renderSalesReport },
    { key: "order", label: "Order Summary", title: "Order Report", render: renderOrderReport },
    { key: "employee", label: "Employee Summary", title: "Employee Report", render: renderEmployeeReport },
    { key: "settlement", label: "Settlement Summary", title: "Settlement Summary", render: renderSettlementReport },
    { key: "counter", label: "Counter Summary", title: "Counter Summary", render: renderCounterReport },
    { key: "tip", label: "Tip Summary", title: "Tip Summary", render: renderTipReport },
    { key: "empty", label: "Variation Summary", title: "Variation Report", render: renderNoRecord }
  ];
}

function salesTotals() {
  const sales = state.data.sales;
  const subtotal = sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
  const tax = sales.reduce((sum, sale) => sum + Number(sale.tax || 0), 0);
  const discount = sales.reduce((sum, sale) => sum + Number(sale.discount || 0), 0);
  const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const items = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.qty || 0), 0), 0);
  return { sales, subtotal, tax, discount, total, items };
}

function reportRangeLabel(name) {
  const today = new Date().toLocaleDateString();
  return `<div class="report-range">${name}: From ${today} to ${today}</div>`;
}

function renderCategoryReport() {
  const totals = salesTotals();
  const rows = new Map();
  totals.sales.forEach((sale) => sale.items.forEach((item) => {
    const product = state.data.products.find((entry) => entry.id === item.id);
    const category = product?.category || "General";
    const row = rows.get(category) || { orders: 0, items: 0, subtotal: 0, tax: 0, total: 0 };
    row.orders += 1;
    row.items += item.qty;
    row.subtotal += item.qty * item.price;
    row.tax += item.qty * item.price * (state.data.settings.taxRate / 100);
    row.total = row.subtotal + row.tax;
    rows.set(category, row);
  }));
  return `${reportRangeLabel("Category Report")}${reportTable(["Category", "Orders", "Items", "Net Amount (₹)", "Tax (₹)", "Total Sales (₹)"], [
    ["Total", totals.sales.length, totals.items.toFixed(2), totals.subtotal.toFixed(2), totals.tax.toFixed(2), totals.total.toFixed(2)],
    ...[...rows.entries()].map(([category, row]) => [category, row.orders, row.items.toFixed(2), row.subtotal.toFixed(2), row.tax.toFixed(2), row.total.toFixed(2)])
  ])}`;
}

function renderItemReport() {
  const totals = salesTotals();
  const rows = state.data.products.map((product) => {
    const sold = totals.sales.flatMap((sale) => sale.items).filter((item) => item.id === product.id);
    const qty = sold.reduce((sum, item) => sum + item.qty, 0);
    const total = sold.reduce((sum, item) => sum + item.qty * item.price, 0);
    return qty ? [product.category || "General", product.name, product.sku || "-", qty.toFixed(2), total.toFixed(2)] : null;
  }).filter(Boolean);
  return `${reportRangeLabel("Item Report")}${reportTable(["Category", "Item", "Code", "Qty.", "Total (₹)"], [["Total", "-", "-", totals.items.toFixed(2), totals.subtotal.toFixed(2)], ...rows])}`;
}

function renderSalesReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Sales Report")}${reportTable(["Order No.", "Date", "My Amount (₹)", "Discount (₹)", "Tax (₹)", "Total (₹)", "Biller"], [
    ["Total", "-", totals.subtotal.toFixed(2), totals.discount.toFixed(2), totals.tax.toFixed(2), totals.total.toFixed(2), "-"],
    ...totals.sales.map((sale) => [sale.invoiceNo, new Date(sale.createdAt).toLocaleString(), sale.subtotal.toFixed(2), sale.discount.toFixed(2), sale.tax.toFixed(2), sale.total.toFixed(2), "cashier"])
  ])}`;
}

function renderOrderReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Order Summary Report")}${reportTable(["Order Status", "My Amount (₹)", "Total (₹)", "Orders"], [
    ["Saved", "0.00", "0.00", 0],
    ["Printed", totals.subtotal.toFixed(2), totals.total.toFixed(2), totals.sales.length],
    ["Cancelled", "0.00", "0.00", 0],
    ["Total", totals.subtotal.toFixed(2), totals.total.toFixed(2), totals.sales.length]
  ])}`;
}

function renderEmployeeReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Employee Report")}${reportTable(["Billing User", "Payment Type", "Total (₹)"], [["cashier", "Cash", totals.total.toFixed(2)]])}`;
}

function renderSettlementReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Settlement Summary")}${reportTable(["Counter Name", "Billing User", "No of orders", "Net Sales (₹)", "Total Sales (₹)", "Cash (₹)", "Card (₹)", "Due (₹)"], [["Total", "-", totals.sales.length, totals.subtotal.toFixed(2), totals.total.toFixed(2), totals.total.toFixed(2), "0.00", "0.00"], ["c1", "cashier", totals.sales.length, totals.subtotal.toFixed(2), totals.total.toFixed(2), totals.total.toFixed(2), "0.00", "0.00"]])}`;
}

function renderCounterReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Counter Summary")}${reportTable(["Counter Name", "Success Orders", "Net Amount (₹)", "Total Tax (₹)", "Total Sales (₹)", "Cash (₹)", "UPI (₹)"], [["Billing Station", totals.sales.length, totals.subtotal.toFixed(2), totals.tax.toFixed(2), totals.total.toFixed(2), totals.total.toFixed(2), "0.00"]])}`;
}

function renderTipReport() {
  return `${reportRangeLabel("Tip Summary")}${reportTable(["Employee/Table", "Amount (₹)"], [["Other", "0.00"], ...state.data.tables.map((table) => [table.name, "0.00"])])}`;
}

function renderNoRecord() {
  return `<div class="empty report-empty">${icon("file-x", 64)}<strong>There is no record available.</strong></div>`;
}

function reportTable(headers, rows) {
  const query = state.reportSearch.trim().toLowerCase();
  const filteredRows = query ? rows.filter((row, index) => index === 0 || row.join(" ").toLowerCase().includes(query)) : rows;
  return `<div class="table-scroll"><table class="table report-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${filteredRows.map((row, index) => `<tr class="${index === 0 ? "total" : ""}">${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderOutletSettings() {
  const groups = [
    ["Restaurant Setup", [
      ["Table Management", "table-2", "Add or remove tables."],
      ["Print", "printer", "Bill and KOT printing."],
      ["Tax", "badge-percent", "GST and tax rules."],
      ["Customer", "user-round", "Guest and credit rules."],
      ["Billing System", "scroll-text", "Invoice and counter setup."]
    ]],
    ["Billing Rules", [
      ["Display", "monitor", "Billing screen layout."],
      ["Calculations", "calculator", "Service charge and rounding."],
      ["Discount", "badge", "Discount permissions."],
      ["Menu Item On Off", "toggle-left", "Availability control."],
      ["Table Reservation", "calendar-check", "Reservation rules."]
    ]],
    ["Data & Account", [
      ["Manual Sync", "refresh-cw", "Push and pull Firebase data."],
      ["Backup & Restore", "database-backup", "Export or restore data."],
      ["Billing User Profile", "id-card", "Cashier and owner profile."],
      ["Alerts", "bell", "Stock and open bill alerts."],
      ["Language Profiles", "languages", "Receipt language."]
    ]]
  ];
  return `
    <section class="panel settings-panel mobile-more-panel">
      <div class="panel-header"><h3>Mobile Shortcuts</h3></div>
      <div class="settings-grid">
        <button class="setting-card" data-view="products">${icon("book-open")}<span><strong>Menu setup</strong><small>Items, prices, stock and images.</small></span></button>
        <button class="setting-card" data-view="customers">${icon("users")}<span><strong>Guests</strong><small>Customer names and visit records.</small></span></button>
        <button class="setting-card" data-view="sales">${icon("receipt-text")}<span><strong>Orders</strong><small>Invoice history and receipt reprints.</small></span></button>
        <button class="setting-card" data-view="subscription">${icon("badge-indian-rupee")}<span><strong>Plan</strong><small>Annual license and renewal status.</small></span></button>
      </div>
      <button class="button warn mobile-signout-button" id="mobile-signout">${icon("log-out")} Sign out</button>
    </section>
    <section class="panel settings-panel">
      <div class="panel-header"><h3>Billing Workflow</h3></div>
      <label class="toggle-setting"><span>Show save button after bill print</span><input id="setting-saveBillAfterPrint" type="checkbox" ${state.data.settings.saveBillAfterPrint ? "checked" : ""}><i></i></label>
      <button class="button" id="save-billing-workflow" style="margin-top:12px">${icon("save")} Save billing workflow</button>
    </section>
    ${groups.map(([title, items]) => `
      <section class="panel settings-panel">
        <div class="panel-header"><h3>${title}</h3></div>
        <div class="settings-grid">${items.map(([label, iconName, text]) => `
          <button class="setting-card" data-action="${actionKey(label)}" data-action-label="${escapeAttr(label)}">${icon(iconName)}<span><strong>${label}</strong><small>${text}</small></span></button>
        `).join("")}</div>
      </section>
    `).join("")}
    <section class="panel settings-panel">
      <div class="panel-header"><h3>Restaurant Profile</h3></div>
      <div class="form-grid">
        ${settingField("shopName", "Restaurant name")}
        ${settingField("phone", "Phone")}
        ${settingField("gstin", "GSTIN")}
        ${settingField("taxRate", "Tax rate %", "number")}
        <div class="field" style="grid-column:1/-1"><label>Address</label><textarea id="setting-address">${state.data.settings.address || ""}</textarea></div>
      </div>
      <button class="button" id="save-settings" style="margin-top:12px">${icon("save")} Save settings</button>
    </section>
    <section class="panel settings-panel">
      <div class="panel-header"><h3>Account Data</h3></div>
      <p class="muted">Current login ID: ${currentEmail()}</p>
      <button class="button warn" id="reset-account-data">${icon("trash-2")} Reset this login data</button>
    </section>
  `;
}

function renderSaleList(sales) {
  if (!sales.length) return `<div class="empty">No invoices yet</div>`;
  return `<div class="sale-list">${sales.map((sale) => `
    <div class="sale-row">
      <div><h4>${sale.invoiceNo} • ${sale.tableName || "No table"} • ${sale.customerName}</h4><p>${new Date(sale.createdAt).toLocaleString()} • ${sale.paymentMethod} • ${sale.items.length} items</p></div>
      <div style="display:flex;align-items:center;gap:10px"><strong>${money(sale.total)}</strong><button class="icon-button" data-receipt="${sale.id}" title="Receipt">${icon("printer")}</button></div>
    </div>
  `).join("")}</div>`;
}

function productThumb(product = {}) {
  const imageSrc = productImageSrc(product);
  return imageSrc
    ? `<img class="product-thumb" src="${imageSrc}" alt="${escapeAttr(product.name)}">`
    : `<span class="product-thumb placeholder">${product.name?.slice(0, 2).toUpperCase() || "PP"}</span>`;
}

function renderModal() {
  if (state.modal.type === "product") return renderProductModal(state.modal.product);
  if (state.modal.type === "customer") return renderCustomerModal();
  if (state.modal.type === "receipt") return renderReceiptModal(state.modal.sale);
  if (state.modal.type === "kot") return renderKotModal(state.modal.kot);
  if (state.modal.type === "action") return renderActionModal(state.modal);
  return "";
}

function autoPrint(markup) {
  state.printContent = markup;
  render();
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      state.printContent = "";
      render();
    }, 500);
  }, 120);
}

function actionKey(label = "") {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderProductModal(product = {}) {
  const imageSrc = productImageSrc(product);
  return `
    <div class="modal-backdrop">
      <section class="modal">
        <div class="panel-header"><h3>${product.id ? "Edit menu item" : "New menu item"}</h3><button class="icon-button" data-close title="Close">${icon("x")}</button></div>
        <div class="form-grid">
          <div class="field product-image-field" style="grid-column:1/-1">
            <label>Current image</label>
            ${imageSrc ? `<img class="product-image-preview" src="${imageSrc}" alt="${escapeAttr(product.name || "Menu item")}">` : `<div class="product-image-preview empty-preview">No image added</div>`}
          </div>
          ${productInput("name", "Name", product.name)}
          ${productInput("sku", "SKU", product.sku)}
          ${productInput("category", "Category", product.category)}
          ${productInput("price", "Menu price", product.price, "number")}
          ${productInput("cost", "Cost", product.cost, "number")}
          ${productInput("stock", "Stock", product.stock, "number")}
          <div class="field" style="grid-column:1/-1"><label>Menu item image</label><input class="input" id="product-image" type="file" accept="image/*"></div>
        </div>
        <button class="button" id="save-product" data-id="${product.id || ""}" style="margin-top:14px">${icon("save")} Save menu item</button>
      </section>
    </div>
  `;
}

function productInput(key, label, value = "", type = "text") {
  return `<div class="field"><label>${label}</label><input class="input" id="product-${key}" type="${type}" value="${value ?? ""}"></div>`;
}

function renderCustomerModal() {
  return `
    <div class="modal-backdrop">
      <section class="modal">
        <div class="panel-header"><h3>New guest</h3><button class="icon-button" data-close title="Close">${icon("x")}</button></div>
        <div class="form-grid">
          <div class="field"><label>Name</label><input class="input" id="customer-name"></div>
          <div class="field"><label>Phone</label><input class="input" id="customer-phone"></div>
          <div class="field" style="grid-column:1/-1"><label>Email</label><input class="input" id="customer-email" type="email"></div>
        </div>
        <button class="button" id="save-customer" style="margin-top:14px">${icon("save")} Save customer</button>
      </section>
    </div>
  `;
}

function renderReceiptModal(sale) {
  return `
    <div class="modal-backdrop">
      <section class="modal">
        <div class="panel-header"><h3>Receipt</h3><div class="toolbar"><button class="button secondary" id="print-receipt">${icon("printer")} Print</button><button class="icon-button" data-close title="Close">${icon("x")}</button></div></div>
        ${receiptMarkup(sale)}
      </section>
    </div>
  `;
}

function renderKotModal(kot) {
  return `
    <div class="modal-backdrop">
      <section class="modal">
        <div class="panel-header"><h3>Kitchen Order Ticket</h3><div class="toolbar"><button class="button secondary" id="print-kot">${icon("printer")} Print KOT</button><button class="icon-button" data-close title="Close">${icon("x")}</button></div></div>
        ${kotMarkup(kot)}
      </section>
    </div>
  `;
}

function renderActionModal({ action, label }) {
  const details = actionDetails(action, label);
  return `
    <div class="modal-backdrop">
      <section class="modal action-modal">
        <div class="panel-header"><h3>${details.title}</h3><button class="icon-button" data-close title="Close">${icon("x")}</button></div>
        ${details.body}
        ${details.footer || ""}
      </section>
    </div>
  `;
}

function actionDetails(action, label) {
  const totals = salesTotals();
  const openTables = state.data.tables.filter((table) => (state.data.openBills[table.id] || []).length);
  const settings = state.data.modules?.[action] || {};
  const configForm = (fields) => `
    <div class="form-grid">
      ${fields.map((field) => moduleField(action, field, settings[field.key] ?? field.value ?? "", field.type || "text")).join("")}
    </div>
    <button class="button" id="save-module-settings" data-action="${action}" style="margin-top:14px">${icon("save")} Save</button>
  `;
  const configPanel = (title, text, fields, steps = []) => `
    ${moduleIntro(title, text, steps)}
    ${configForm(fields)}
  `;
  const moduleActions = (buttons) => `
    <div class="toolbar module-actions">
      ${buttons.map((button) => `<button class="button ${button.secondary ? "secondary" : ""}" data-view="${button.view}">${icon(button.icon || "arrow-right", 16)} ${button.label}</button>`).join("")}
    </div>
  `;
  const simple = (title, body) => ({ title, body });
  const actionMap = {
    "online-orders": simple("Online Orders", `${metricStrip([["Today orders", totals.sales.length], ["Open online orders", 0], ["Ready to accept", "Yes"]])}${moduleIntro("Channel readiness", "Keep third-party and direct ordering rules documented here until live API integrations are connected.", ["Assign one staff owner for incoming orders.", "Confirm payment mode before accepting.", "Use Dispatch status for delivery handoff."])}${configForm([{ key: "onlineAutoAccept", label: "Auto accept online orders", type: "checkbox", value: false }, { key: "onlinePrepMinutes", label: "Default prep minutes", type: "number", value: 25 }, { key: "onlineChannelNote", label: "Channel note", value: "Website, WhatsApp, Swiggy, Zomato" }])}`),
    "kots": simple("Kitchen Order Tickets", renderKotCards(openTables)),
    "due-payment": simple("Due Payments", `${moduleIntro("Credit control", "Use this view to review bills that are paid later or partially paid.", ["Collect customer phone for every credit bill.", "Settle dues before monthly closing.", "Use order number when calling customers."])}${reportTable(["Invoice", "Customer", "Amount", "Status"], duePaymentRows())}${moduleActions([{ label: "Open sales history", view: "sales", icon: "receipt-text" }, { label: "Open reports", view: "reports", icon: "chart-line", secondary: true }])}`),
    "live-view": simple("Live View", `${metricStrip([["Running tables", openTables.length], ["Open items", openTables.reduce((sum, table) => sum + (state.data.openBills[table.id] || []).length, 0)], ["Today revenue", money(totals.total)]])}${moduleIntro("Floor visibility", "This shows the running table queue for captains, cashiers, and managers.", ["Watch open tables before rush hour.", "Use it before shift close to avoid missed bills.", "Pair with KOT settings for kitchen visibility."])}${renderOpenTableList(openTables)}${moduleActions([{ label: "Open table billing", view: "pos", icon: "utensils" }])}`),
    "bill-kot-print": simple("Bill / KOT Print", configPanel("Printing workflow", "Keep bill and kitchen print rules consistent across counters.", [{ key: "billCopies", label: "Bill copies", type: "number", value: 1 }, { key: "kotCopies", label: "KOT copies", type: "number", value: 1 }, { key: "printerName", label: "Printer name", value: "Default printer" }, { key: "printLogo", label: "Print PondyPOS logo", type: "checkbox", value: true }], ["Bill prints after payment.", "KOT prints when food is sent to kitchen.", "Use 80mm paper for counter receipts."])),
    "custom-order-status": simple("Custom Order Status", configPanel("Order stages", "Name the statuses your team uses from cooking to handover.", [{ key: "statusOne", label: "Status 1", value: "Food ready" }, { key: "statusTwo", label: "Status 2", value: "Dispatch" }, { key: "statusThree", label: "Status 3", value: "Delivered" }, { key: "statusAlert", label: "Alert staff on status change", type: "checkbox", value: true }], ["Use short labels for display screens.", "Keep dine-in and delivery statuses separate.", "Review failed or delayed orders daily."])),
    "cash-flow": simple("Cash Flow", `${moduleIntro("Drawer control", "Track opening cash, sales, and expected drawer value for daily handover.", ["Set opening cash before first bill.", "Compare expected drawer at shift close.", "Use Close Shift to save final count."])}${reportTable(["Type", "Amount"], [["Cash sales", money(totals.total)], ["Opening cash", money(Number(settings.openingCash || 0))], ["Expected drawer", money(totals.total + Number(settings.openingCash || 0))]])}${configForm([{ key: "openingCash", label: "Opening cash", type: "number", value: 0 }])}`),
    "expense": simple("Expense", configPanel("Expense capture", "Record common restaurant spend so reports are ready for owner review.", [{ key: "lastExpenseTitle", label: "Expense name", value: "" }, { key: "lastExpenseAmount", label: "Amount", type: "number", value: 0 }, { key: "expenseCategory", label: "Category", value: "Kitchen purchase" }, { key: "expenseNote", label: "Note", value: "" }], ["Add supplier or staff name in notes.", "Separate kitchen purchase, maintenance, and wages.", "Review expenses before closing the month."])),
    "withdrawal": simple("Withdrawal", configPanel("Cash withdrawal", "Capture owner withdrawals and counter cash removals clearly.", [{ key: "withdrawalAmount", label: "Withdrawal amount", type: "number", value: 0 }, { key: "withdrawalReason", label: "Reason", value: "Owner withdrawal" }, { key: "withdrawalBy", label: "Taken by", value: currentEmail() }], ["Count drawer before withdrawal.", "Write a reason for audit clarity.", "Close shift after large withdrawals."])),
    "cash-top-up": simple("Cash Top-Up", configPanel("Counter top-up", "Add starting cash or emergency cash injections to the drawer record.", [{ key: "topUpAmount", label: "Top-up amount", type: "number", value: 0 }, { key: "topUpSource", label: "Source", value: "Owner cash" }, { key: "topUpReason", label: "Reason", value: "Opening balance" }], ["Use before billing starts.", "Keep source clear for owner reporting.", "Verify expected drawer after saving."])),
    "currency-conversion": simple("Currency Conversion", configPanel("Currency setup", "Keep INR as default and record conversion rules for tourist or hotel counters.", [{ key: "currencyCode", label: "Currency code", value: "INR" }, { key: "exchangeRate", label: "Exchange rate", type: "number", value: 1 }, { key: "showCurrencyOnReceipt", label: "Show currency on receipt", type: "checkbox", value: true }], ["Use INR for GST receipts.", "Record manual exchange rate when needed.", "Confirm payment method before billing."])),
    "tax": simple("Tax", configPanel("Tax rules", "Configure GST behavior used in billing totals and receipt display.", [{ key: "taxRate", label: "Tax rate %", type: "number", value: state.data.settings.taxRate }, { key: "gstMode", label: "GST mode", value: "CGST + SGST" }, { key: "taxIncluded", label: "Tax included in menu price", type: "checkbox", value: false }], ["Update Restaurant Profile with GSTIN.", "Use one tax rate for faster counter billing.", "Print a sample receipt after changing tax."])),
    "discount": simple("Discount", configPanel("Discount control", "Set discount permissions so staff can bill quickly without losing margin.", [{ key: "maxDiscount", label: "Maximum discount", type: "number", value: 0 }, { key: "managerApproval", label: "Manager approval required", type: "checkbox", value: true }, { key: "discountReasonRequired", label: "Reason required", type: "checkbox", value: true }], ["Keep max discount low for cashiers.", "Use manager approval for special guests.", "Review discounts in Sales reports."])),
    "table-reservation": simple("Table Reservation", configPanel("Reservation policy", "Set simple rules for guest reservations and table hold timing.", [{ key: "reservationWindow", label: "Reservation window minutes", type: "number", value: 60 }, { key: "reservationPhoneRequired", label: "Phone required", type: "checkbox", value: true }, { key: "reservationDeposit", label: "Deposit amount", type: "number", value: 0 }], ["Take phone number for every booking.", "Release late reservations after the hold window.", "Use notes for party size and occasion."])),
    "menu-item-on-off": simple("Menu Item On Off", `${moduleIntro("Availability control", "Quickly mark items unavailable during service without deleting them from the menu.", ["Use this before busy hours.", "Low-stock items are highlighted by the dashboard.", "Set restock notes so staff know when an item returns."])}${configForm([{ key: "hideOutOfStock", label: "Hide out-of-stock items", type: "checkbox", value: true }, { key: "showUnavailableBadge", label: "Show unavailable badge", type: "checkbox", value: true }, { key: "restockNote", label: "Restock note", value: "Ask kitchen before billing" }])}${reportTable(["Menu item", "Stock", "Status"], state.data.products.slice(0, 8).map((product) => [product.name, product.stock, Number(product.stock) > 0 ? "Available" : "Unavailable"]))}`),
    "feedback": simple("Feedback", configPanel("Guest feedback", "Collect review links and print them on receipts when useful.", [{ key: "feedbackLink", label: "Feedback link", value: "" }, { key: "showFeedbackOnReceipt", label: "Show on receipt", type: "checkbox", value: true }, { key: "feedbackMessage", label: "Receipt message", value: "Tell us about your visit" }], ["Use a Google review link.", "Keep the message short.", "Check feedback weekly."])),
    "led-display": simple("LED Display", configPanel("Display board", "Prepare order display settings for kitchen or pickup counters.", [{ key: "displayName", label: "Display name", value: "Kitchen display" }, { key: "showToken", label: "Show token numbers", type: "checkbox", value: true }, { key: "displayTheme", label: "Display theme", value: "High contrast" }], ["Show only order numbers and statuses.", "Use high contrast for kitchen visibility.", "Pair with KOT status labels."])),
    "dual-screen": simple("Dual Screen", configPanel("Customer display", "Set the customer-facing billing display used at the counter.", [{ key: "customerDisplay", label: "Customer display enabled", type: "checkbox", value: false }, { key: "displayMessage", label: "Display message", value: "Thank you" }, { key: "showRunningTotal", label: "Show running total", type: "checkbox", value: true }], ["Show items as they are added.", "Hide manager-only controls.", "Use the PondyPOS logo screen when idle."])),
    "billing-user-profile": simple("Billing User Profile", configPanel("Staff profile", "Configure the active counter user for receipts and reports.", [{ key: "cashierName", label: "Cashier name", value: "cashier" }, { key: "role", label: "Role", value: "Owner" }, { key: "pinRequired", label: "Require PIN for manager actions", type: "checkbox", value: true }], ["Use separate Firebase login for each owner/store.", "Keep cashier names consistent.", "Protect reset and shift close actions."])),
    "alerts": simple("Alerts", configPanel("Alert rules", "Set operational alerts that protect billing and stock health.", [{ key: "lowStockAlert", label: "Low stock alert qty", type: "number", value: 5 }, { key: "dailySummary", label: "Daily summary alert", type: "checkbox", value: true }, { key: "openBillAlertMinutes", label: "Open bill alert minutes", type: "number", value: 45 }], ["Review low stock before dinner service.", "Check long-running bills.", "Use daily summary before closing."])),
    "help": simple("Help", `${moduleIntro("Production checklist", "Use this as the owner checklist before charging customers or deploying updates.", ["Phone OTP and Google login tested.", "Each user has separate Firebase data.", "Billing, reports, backup, and shift close verified."])}${reportTable(["Topic", "What to check"], [["Login", "Firebase Phone and Google providers enabled"], ["Billing", "Select table, add item, complete billing"], ["Sync", "Firestore rules allow only tenants/{uid}"], ["Backup", "Export JSON before big menu edits"], ["Deploy", "Push GitHub and redeploy Vercel"], ["Support", "Keep WhatsApp or phone support visible to staff"]])}${moduleActions([{ label: "Open settings", view: "settings", icon: "settings" }, { label: "Open subscription", view: "subscription", icon: "badge-indian-rupee", secondary: true }])}`),
    "display": simple("Display Settings", configPanel("Billing display", "Choose the information cashiers see while billing on PC and mobile.", [{ key: "compactTables", label: "Compact table view", type: "checkbox", value: false }, { key: "showStockOnCards", label: "Show stock on menu cards", type: "checkbox", value: true }, { key: "showDashboardHealth", label: "Show dashboard health", type: "checkbox", value: true }], ["Keep table-first billing as the default.", "Show stock during busy hours.", "Use compact mode on smaller monitors."])),
    "calculations": simple("Calculation Settings", configPanel("Billing calculation", "Control service charge and rounding behavior used at checkout.", [{ key: "serviceCharge", label: "Service charge %", type: "number", value: 0 }, { key: "roundOff", label: "Round off bills", type: "checkbox", value: true }, { key: "roundOffMode", label: "Round off mode", value: "Nearest rupee" }], ["Print a sample bill after changes.", "Keep service charge visible to staff.", "Review totals in Sales report."])),
    "linked-services": simple("Linked Services", configPanel("Service links", "Store service connection details for WhatsApp, delivery, and online orders.", [{ key: "whatsappNumber", label: "WhatsApp number", value: "" }, { key: "deliveryPartner", label: "Delivery partner", value: "" }, { key: "onlineOrderUrl", label: "Online order URL", value: "" }], ["Use one official WhatsApp number.", "Keep partner name current.", "Test links before printing QR codes."])),
    "table-management": simple("Table Management", renderTableManagementPanel()),
    "print": simple("Print Settings", configPanel("Receipt print", "Set receipt format, GST details, and print behavior.", [{ key: "paperSize", label: "Paper size", value: "80mm" }, { key: "showGstin", label: "Show GSTIN on receipt", type: "checkbox", value: true }, { key: "saveBillAfterPrint", label: "Show save button after bill print", type: "checkbox", value: state.data.settings.saveBillAfterPrint }], ["Use browser print for receipts.", "Check margins on 80mm paper.", "Print one receipt after changing logo or GSTIN."])),
    "customer": simple("Customer Settings", configPanel("Guest rules", "Configure how guest phone numbers and credit sales are handled.", [{ key: "phoneRequired", label: "Phone required for guests", type: "checkbox", value: false }, { key: "allowCredit", label: "Allow credit bills", type: "checkbox", value: true }, { key: "creditLimit", label: "Default credit limit", type: "number", value: 0 }], ["Capture phone for credit bills.", "Review dues from Operations.", "Avoid duplicate guest names."])),
    "online-advance-order-configuration": simple("Online / Advance Order Configuration", configPanel("Advance order rules", "Control how future orders are accepted and prepared.", [{ key: "autoAccept", label: "Auto accept orders", type: "checkbox", value: false }, { key: "advanceOrderHours", label: "Advance order hours", type: "number", value: 24 }, { key: "cancelBeforeMinutes", label: "Cancel before minutes", type: "number", value: 30 }], ["Confirm pickup or delivery time.", "Record customer phone.", "Review advance orders before rush hour."])),
    "billing-system": simple("Billing System", configPanel("Invoice system", "Set invoice identity and counter naming for reports.", [{ key: "invoicePrefix", label: "Invoice prefix", value: state.data.settings.invoicePrefix }, { key: "counterName", label: "Counter name", value: "Billing Station" }, { key: "serverMode", label: "Server mode", value: "Main Server" }], ["Keep invoice prefix short.", "Use counter names in shift reports.", "Sync after changing billing identity."])),
    "language-profiles": simple("Language Profiles", configPanel("Language profile", "Prepare labels for staff and receipt language preferences.", [{ key: "language", label: "Primary language", value: "English" }, { key: "receiptLanguage", label: "Receipt language", value: "English" }, { key: "localGreeting", label: "Receipt greeting", value: "Thank you" }], ["Keep menu item names readable.", "Use local greeting on receipt.", "Test receipt print after language changes."])),
    "manual-sync": simple("Manual Sync", `${metricStrip([["Cloud status", state.user ? "Synced" : "Local"], ["Data owner", currentEmail()], ["Last action", "Sync complete"]])}<p class="muted">Your latest local data was pushed to Firebase, then the latest cloud copy was pulled back for this login.</p>`),
    "close-shift": simple("Close Shift", renderCloseShiftPanel()),
    "backup-restore": simple("Backup & Restore", renderBackupPanel())
  };
  return actionMap[action] || simple(label, configPanel(label, "This module is connected and ready to configure for your restaurant workflow.", [{ key: "enabled", label: "Enabled", type: "checkbox", value: true }, { key: "note", label: "Operating note", value: "" }], ["Save this module to mark it configured.", "Use notes for staff instructions.", "Review settings after deployment."]));
}

function renderCloseShiftPanel() {
  const today = new Date().toDateString();
  const todaysSales = state.data.sales.filter((sale) => new Date(sale.createdAt).toDateString() === today);
  const total = todaysSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cash = todaysSales.filter((sale) => sale.paymentMethod === "Cash").reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const openTables = state.data.tables.filter((table) => (state.data.openBills[table.id] || []).length);
  return `
    ${metricStrip([["Orders", todaysSales.length], ["Sales", money(total)], ["Cash", money(cash)], ["Open bills", openTables.length]])}
    ${openTables.length ? `<div class="auth-error">${icon("circle-alert")}<span>Close or clear open table bills before final counter settlement.</span></div>` : ""}
    <div class="form-grid">
      <div class="field"><label>Cash counted</label><input class="input" id="close-cash" type="number" value="${cash.toFixed(2)}"></div>
      <div class="field"><label>Closer name</label><input class="input" id="close-user" value="${escapeAttr(currentEmail())}"></div>
      <div class="field" style="grid-column:1/-1"><label>Notes</label><input class="input" id="close-note" placeholder="Any mismatch, waste, or handover note"></div>
    </div>
    <button class="button" id="save-close-shift" style="margin-top:14px" ${openTables.length ? "disabled" : ""}>${icon("badge-check")} Save shift close</button>
    ${state.data.closings?.length ? `<div class="sale-list" style="margin-top:14px">${state.data.closings.slice(0, 3).map((closing) => `<div class="sale-row"><div><h4>${new Date(closing.closedAt).toLocaleString()}</h4><p>${closing.orders} orders • ${closing.closedBy}</p></div><strong>${money(closing.total)}</strong></div>`).join("")}</div>` : ""}
  `;
}

function renderBackupPanel() {
  return `
    <p class="muted">Use this before major menu edits, Firebase cleanup, or yearly renewal work.</p>
    ${metricStrip([["Menu items", state.data.products.length], ["Guests", state.data.customers.length], ["Invoices", state.data.sales.length], ["Closings", state.data.closings?.length || 0]])}
    <div class="toolbar" style="margin-bottom:14px">
      <button class="button" id="export-backup-modal">${icon("download")} Export backup</button>
      <label class="button secondary file-button">${icon("upload")} Restore backup<input id="import-backup" type="file" accept="application/json"></label>
    </div>
    <div class="auth-error">${icon("shield-alert")}<span>Restore replaces this login’s data only. Other Firebase users stay separate.</span></div>
  `;
}

function renderTableManagementPanel() {
  const tableRows = state.data.tables.map((table) => {
    const itemCount = (state.data.openBills[table.id] || []).reduce((sum, item) => sum + item.qty, 0);
    const activeKots = (state.data.kots || []).filter((kot) => kot.tableId === table.id && kot.status !== "billed").length;
    return [table.name, table.seats || "Takeaway", itemCount, activeKots];
  });
  return `
    <section class="table-manager">
      <div class="field"><label>Table name</label><input class="input" id="new-table-name" placeholder="Table ${state.data.tables.length + 1}"></div>
      <div class="field"><label>Seats</label><input class="input" id="new-table-seats" type="number" min="0" value="4"></div>
      <button class="button" id="add-table">${icon("plus")} Add table</button>
      <div class="field"><label>Remove table</label><select id="remove-table-id">${state.data.tables.map((table) => `<option value="${table.id}">${escapeAttr(table.name)}</option>`).join("")}</select></div>
      <button class="button secondary" id="remove-table">${icon("trash-2")} Remove</button>
    </section>
    ${reportTable(["Table", "Seats", "Open items", "Active KOTs"], tableRows)}
  `;
}

function moduleIntro() {
  return "";
}

function moduleField(action, field, value, type = "text") {
  if (type === "checkbox") {
    const checked = value === true || value === "true" ? "checked" : "";
    return `<label class="check-row"><input type="checkbox" data-module-field="${field.key}" ${checked}> <span>${field.label}</span></label>`;
  }
  return `<div class="field"><label>${field.label}</label><input class="input" data-module-field="${field.key}" type="${type}" value="${escapeAttr(value)}"></div>`;
}

function metricStrip(items) {
  return `<div class="grid dashboard-grid action-metrics">${items.map(([label, value]) => metric(label, value, "circle-dot")).join("")}</div>`;
}

function renderOpenTableList(openTables) {
  if (!openTables.length) return `<div class="empty">No running tables right now</div>`;
  return `<div class="sale-list">${openTables.map((table) => `<div class="sale-row"><div><h4>${table.name}</h4><p>${(state.data.openBills[table.id] || []).length} items</p></div><strong>${money(tableTotal(table.id))}</strong></div>`).join("")}</div>`;
}

function renderKotCards(openTables) {
  const activeKots = (state.data.kots || []).filter((kot) => kot.status !== "billed");
  if (!activeKots.length && !openTables.length) return `<div class="empty">No KOTs waiting</div>`;
  const rows = activeKots.length
    ? activeKots.map((kot) => `<div class="sale-row"><div><h4>${kot.kotNo} • ${kot.tableName}</h4><p>${kot.items.map((item) => `${item.qty} x ${item.name}`).join(", ")}</p></div><div class="row-actions"><strong>${kot.status}</strong><button class="icon-button" data-kot="${kot.id}" title="Print KOT">${icon("printer")}</button></div></div>`)
    : openTables.map((table) => `<div class="sale-row"><div><h4>KOT • ${table.name}</h4><p>${(state.data.openBills[table.id] || []).map((item) => `${item.qty} x ${item.name}`).join(", ")}</p></div><strong>${money(tableTotal(table.id))}</strong></div>`);
  return `<div class="sale-list">${rows.join("")}</div>`;
}

function duePaymentRows() {
  const dues = state.data.sales.filter((sale) => sale.paymentMethod === "Credit" || Number(sale.paid || 0) < Number(sale.total || 0));
  if (!dues.length) return [["-", "No pending dues", money(0), "Clear"]];
  return dues.map((sale) => [sale.invoiceNo, sale.customerName, money(Math.max(0, sale.total - sale.paid)), "Pending"]);
}

function receiptMarkup(sale) {
  const settings = state.data.settings;
  return `
    <div class="receipt">
      <h3>${settings.shopName}</h3>
      <small>${settings.address || ""}<br>${settings.phone || ""} ${settings.gstin ? `GSTIN: ${settings.gstin}` : ""}</small>
      <p>Invoice: ${sale.invoiceNo}<br>Date: ${new Date(sale.createdAt).toLocaleString()}<br>Table: ${sale.tableName || "No table"}<br>Customer: ${sale.customerName}</p>
      <hr>
      ${sale.items.map((item) => `<p>${item.name}<br>${item.qty} x ${money(item.price)} = ${money(item.qty * item.price)}</p>`).join("")}
      <hr>
      <p>Subtotal: ${money(sale.subtotal)}<br>Discount: ${money(sale.discount)}<br>Tax: ${money(sale.tax)}<br><strong>Total: ${money(sale.total)}</strong><br>Paid: ${money(sale.paid)}<br>Change: ${money(Math.max(0, sale.paid - sale.total))}<br>Payment: ${sale.paymentMethod}</p>
      <small>Thank you for your purchase</small>
    </div>
  `;
}

function kotMarkup(kot) {
  const settings = state.data.settings;
  return `
    <div class="receipt kot-print">
      <h3>${settings.shopName}</h3>
      <small>${settings.address || ""}<br>${settings.phone || ""}</small>
      <p>KOT: ${kot.kotNo}<br>Date: ${new Date(kot.createdAt).toLocaleString()}<br>Table: ${kot.tableName}<br>Status: ${kot.status}</p>
      <hr>
      ${kot.items.map((item) => `<p><strong>${item.qty} x ${item.name}</strong>${item.notes ? `<br><small>${item.notes}</small>` : ""}</p>`).join("")}
      <hr>
      <small>Kitchen copy</small>
    </div>
  `;
}

function bindEvents() {
  document.querySelector("#brand-toggle")?.addEventListener("click", () => {
    state.sidebarExpanded = !state.sidebarExpanded;
    localStorage.setItem("pondypos-sidebar-expanded", String(state.sidebarExpanded));
    render();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-report]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reportKey = button.dataset.report;
      state.reportSearch = "";
      render();
    });
  });
  document.querySelector("#report-search")?.addEventListener("input", (event) => {
    state.reportSearch = event.target.value;
    state.focusReportSearch = true;
    render();
  });
  document.querySelector("#print-report")?.addEventListener("click", printReport);
  document.querySelector("#export-report")?.addEventListener("click", exportReportCsv);
  document.querySelector("#export-backup")?.addEventListener("click", exportBackup);
  document.querySelector("#export-backup-modal")?.addEventListener("click", exportBackup);
  document.querySelector("#import-backup")?.addEventListener("change", importBackup);
  document.querySelector("#close-shift")?.addEventListener("click", () => handleAction("close-shift", "Close Shift"));
  document.querySelector("#save-close-shift")?.addEventListener("click", closeShift);
  document.querySelectorAll("[data-action][data-action-label]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.actionLabel));
  });
  document.querySelectorAll("[data-table]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTableId = button.dataset.table;
      state.mobileCartOpen = false;
      render();
    });
  });
  document.querySelector("#quick-takeaway")?.addEventListener("click", () => {
    state.selectedTableId = state.data.tables.find((table) => table.name.toLowerCase() === "takeaway")?.id || state.data.tables[0]?.id || "";
    state.mobileCartOpen = false;
    render();
  });
  document.querySelector("#view-kots")?.addEventListener("click", () => handleAction("kots", "KOTs"));
  document.querySelector("#add-table")?.addEventListener("click", addTable);
  document.querySelector("#remove-table")?.addEventListener("click", removeTable);
  document.querySelector("#back-to-tables")?.addEventListener("click", backToTables);
  document.querySelector("#mobile-cart-toggle")?.addEventListener("click", () => {
    state.mobileCartOpen = !state.mobileCartOpen;
    render();
  });
  document.querySelector("#mobile-close-cart")?.addEventListener("click", () => {
    state.mobileCartOpen = false;
    render();
  });
  document.querySelector("#search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  bindCategoryScroller();
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (Date.now() < state.categoryDragSuppressUntil) {
        event.preventDefault();
        return;
      }
      state.selectedCategory = button.dataset.category;
      state.categoryScrollLeft = document.querySelector(".category-strip")?.scrollLeft || state.categoryScrollLeft;
      render();
    });
  });
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.add, button));
  });
  document.querySelectorAll("[data-inc]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.inc, 1, button)));
  document.querySelectorAll("[data-dec]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.dec, -1, button)));
  document.querySelector("#clear-cart")?.addEventListener("click", async () => {
    const tableId = state.selectedTableId;
    const hadItems = Boolean(tableId && (state.data.openBills[tableId] || []).length);
    if (tableId) delete state.data.openBills[tableId];
    if (tableId) delete state.billDrafts?.[tableId];
    if (tableId) syncActiveKotsWithTable(tableId, []);
    if (state.pendingBill?.tableId === tableId) state.pendingBill = null;
    state.selectedTableId = "";
    state.mobileCartOpen = false;
    setToast(hadItems ? "Table bill cleared" : "Returned to tables");
    render();
    try {
      await persist();
    } catch (error) {
      console.warn("Table cleared locally. Cloud sync failed.", error);
      setToast("Table cleared locally. Cloud sync failed.", "error");
      render();
    }
  });
  document.querySelector("#bill-customer-name")?.addEventListener("input", (event) => {
    currentBillDraft().customerName = event.target.value;
  });
  document.querySelector("#discount")?.addEventListener("input", (event) => {
    currentBillDraft().discount = event.target.value;
    updateSummaryOnly();
  });
  document.querySelector("#paid")?.addEventListener("input", (event) => {
    currentBillDraft().paid = event.target.value;
    updateSummaryOnly();
  });
  document.querySelector("#save-kot")?.addEventListener("click", saveKot);
  document.querySelector("#checkout")?.addEventListener("click", checkout);
  document.querySelector("#save-printed-bill")?.addEventListener("click", savePrintedBill);
  document.querySelector("#renew-subscription")?.addEventListener("click", renewSubscription);
  document.querySelector("#new-product")?.addEventListener("click", () => { state.modal = { type: "product", product: {} }; render(); });
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", () => {
    state.modal = { type: "product", product: state.data.products.find((product) => product.id === button.dataset.editProduct) };
    render();
  }));
  document.querySelector("#save-product")?.addEventListener("click", saveProduct);
  document.querySelector("#save-settings")?.addEventListener("click", saveSettings);
  document.querySelector("#setting-saveBillAfterPrint")?.addEventListener("change", saveBillingWorkflow);
  document.querySelector("#save-billing-workflow")?.addEventListener("click", saveBillingWorkflow);
  document.querySelector("#save-module-settings")?.addEventListener("click", saveModuleSettings);
  document.querySelector("#reset-account-data")?.addEventListener("click", resetCurrentAccountData);
  document.querySelector("#new-customer")?.addEventListener("click", () => { state.modal = { type: "customer" }; render(); });
  document.querySelector("#save-customer")?.addEventListener("click", saveCustomer);
  document.querySelectorAll("[data-receipt]").forEach((button) => button.addEventListener("click", () => {
    const sale = state.data.sales.find((item) => item.id === button.dataset.receipt);
    if (sale) autoPrint(receiptMarkup(sale));
  }));
  document.querySelectorAll("[data-kot]").forEach((button) => button.addEventListener("click", () => {
    const kot = (state.data.kots || []).find((item) => item.id === button.dataset.kot);
    if (!kot) return;
    autoPrint(kotMarkup(kot));
  }));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { state.modal = null; render(); }));
  document.querySelector("#print-receipt")?.addEventListener("click", () => window.print());
  document.querySelector("#print-kot")?.addEventListener("click", () => window.print());
  document.querySelector("#close-toast")?.addEventListener("click", () => {
    state.toast = null;
    render();
  });
  document.querySelector("#send-otp")?.addEventListener("click", sendPhoneOtp);
  document.querySelector("#verify-otp")?.addEventListener("click", verifyPhoneOtp);
  document.querySelector("#reset-auth")?.addEventListener("click", resetAuthAttempt);
  document.querySelector("#change-phone")?.addEventListener("click", resetPhoneOtp);
  document.querySelector("#google-signin")?.addEventListener("click", googleSignIn);
  document.querySelector("#signout")?.addEventListener("click", signOutCurrentUser);
  document.querySelector("#mobile-signout")?.addEventListener("click", signOutCurrentUser);
}

async function signOutCurrentUser() {
  if (state.user) await state.auth.signOut();
  state.localSession = null;
  state.otpSent = false;
  state.otpConfirmation = null;
  state.authAction = "";
  state.tenantId = "demo";
  state.data = readLocal("demo");
  state.selectedTableId = "";
  localStorage.removeItem("pondypos-session");
  localStorage.removeItem(googleRedirectSessionKey);
  resetRecaptcha();
  render();
}

function bindCategoryScroller() {
  const strip = document.querySelector(".category-strip");
  if (!strip) return;

  requestAnimationFrame(() => {
    strip.scrollLeft = state.categoryScrollLeft || 0;
  });

  let startX = 0;
  let startY = 0;
  let startScroll = 0;
  let dragging = false;
  let moved = false;

  const moveTo = (clientX, clientY, event) => {
    if (!dragging) return;
    const delta = clientX - startX;
    const verticalDelta = Math.abs(clientY - startY);
    const horizontalDelta = Math.abs(delta);
    if (horizontalDelta <= 6 || horizontalDelta <= verticalDelta) return;
    if (!moved) strip.classList.add("dragging");
    if (horizontalDelta > 7) {
      moved = true;
      event?.preventDefault?.();
    }
    strip.scrollLeft = startScroll - delta;
    state.categoryScrollLeft = strip.scrollLeft;
  };

  const stop = () => {
    if (moved) state.categoryDragSuppressUntil = Date.now() + 180;
    dragging = false;
    moved = false;
    strip.classList.remove("dragging");
  };

  const startDrag = (clientX, clientY) => {
    dragging = true;
    moved = false;
    startX = clientX;
    startY = clientY;
    startScroll = strip.scrollLeft;
  };

  strip.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    startDrag(event.clientX, event.clientY);
  });
  strip.addEventListener("pointermove", (event) => moveTo(event.clientX, event.clientY, event));
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => strip.addEventListener(eventName, stop));

  strip.addEventListener("touchstart", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    startDrag(touch.clientX, touch.clientY);
  }, { passive: true });
  strip.addEventListener("touchmove", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    moveTo(touch.clientX, touch.clientY, event);
  }, { passive: false });
  ["touchend", "touchcancel"].forEach((eventName) => strip.addEventListener(eventName, stop));

  strip.addEventListener("scroll", () => {
    state.categoryScrollLeft = strip.scrollLeft;
  }, { passive: true });
  strip.addEventListener("wheel", (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    strip.scrollLeft += delta;
    state.categoryScrollLeft = strip.scrollLeft;
    event.preventDefault();
  }, { passive: false });
}

async function handleAction(action, label) {
  const viewActions = {
    orders: "sales",
    "billing-screen": "pos",
    table: "pos",
    menu: "products",
    inventory: "products",
    customers: "customers",
    reports: "reports",
    "service-renewal": "subscription"
  };
  const reportActions = {
    "cash-flow": "sales",
    "due-payment": "order"
  };
  if (viewActions[action]) {
    setToast(`Opened ${label}`);
    setView(viewActions[action]);
    return;
  }
  if (reportActions[action]) state.reportKey = reportActions[action];
  if (action === "manual-sync") {
    await manualSync();
    return;
  }
  state.modal = { type: "action", action, label };
  render();
}

async function manualSync() {
  state.authError = "";
  try {
    await persist();
    if (state.user) await pullCloudData();
    state.modal = {
      type: "action",
      action: "manual-sync",
      label: "Manual Sync"
    };
    setToast("Manual sync completed");
    render();
  } catch (error) {
    console.warn("Manual sync failed", error);
    state.authError = "Manual sync failed. Check Firebase rules and internet connection.";
    setToast("Manual sync failed", "error");
    render();
  }
}

function printReport() {
  document.body.classList.add("report-printing");
  window.print();
  window.setTimeout(() => document.body.classList.remove("report-printing"), 500);
}

function exportReportCsv() {
  const table = document.querySelector(".report-table");
  if (!table) return;
  const rows = [...table.querySelectorAll("tr")].map((row) =>
    [...row.children].map((cell) => `"${cell.textContent.replace(/"/g, '""')}"`).join(",")
  ).join("\n");
  const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.reportKey}-report.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setToast("Report exported");
  render();
}

function exportBackup() {
  const backup = {
    app: "PondyPOS",
    version: assetVersion,
    exportedAt: new Date().toISOString(),
    tenantId: state.tenantId,
    data: state.data
  };
  downloadText(`pondypos-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), "application/json");
  setToast("Backup exported");
  render();
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm("Restore this backup to the current login? This will replace current menu, tables, guests, orders, and settings.")) return;
  try {
    const payload = JSON.parse(await file.text());
    const restored = payload.data || payload;
    state.data = normalizeData({ ...cloneData(seed), ...restored });
    state.selectedTableId = "";
    await persist();
    state.modal = null;
    setToast("Backup restored");
    render();
  } catch (error) {
    console.warn("Backup restore failed", error);
    setToast("Backup restore failed", "error");
    render();
  }
}

async function closeShift() {
  const openTables = state.data.tables.filter((table) => (state.data.openBills[table.id] || []).length);
  if (openTables.length) {
    setToast("Close open table bills before closing shift", "error");
    return;
  }
  const today = new Date().toDateString();
  const todaysSales = state.data.sales.filter((sale) => new Date(sale.createdAt).toDateString() === today);
  const total = todaysSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cashExpected = todaysSales.filter((sale) => sale.paymentMethod === "Cash").reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const cashCounted = Number(document.querySelector("#close-cash")?.value || 0);
  const closing = {
    id: newId(),
    closedAt: new Date().toISOString(),
    closedBy: document.querySelector("#close-user")?.value.trim() || currentEmail(),
    orders: todaysSales.length,
    total,
    cashExpected,
    cashCounted,
    cashDifference: cashCounted - cashExpected,
    note: document.querySelector("#close-note")?.value.trim() || ""
  };
  state.data.closings = [closing, ...(state.data.closings || [])];
  state.modal = { type: "action", action: "close-shift", label: "Close Shift" };
  await persistSafely("Shift closed", "Shift close saved locally. Cloud sync failed.");
  render();
}

function updateSummaryOnly() {
  const active = document.activeElement;
  const activeId = active?.id;
  const selectionStart = typeof active?.selectionStart === "number" ? active.selectionStart : null;
  const selectionEnd = typeof active?.selectionEnd === "number" ? active.selectionEnd : null;
  const summary = document.querySelector(".summary");
  if (summary) summary.outerHTML = renderSummary();
  if (activeId) {
    const nextActive = document.getElementById(activeId);
    if (nextActive) {
      nextActive.focus();
      if (selectionStart !== null && typeof nextActive.setSelectionRange === "function") {
        nextActive.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
      }
    }
  }
  const discountInput = document.querySelector("#discount");
  if (discountInput) {
    discountInput.addEventListener("input", (event) => {
      currentBillDraft().discount = event.target.value;
      updateSummaryOnly();
    });
  }
}

function captureMenuScrollAnchor(productId, sourceElement) {
  const main = document.querySelector(".main");
  state.restoreMainScroll = main?.scrollTop ?? 0;
  const card = sourceElement?.closest?.(".product-card")
    || [...document.querySelectorAll("[data-add]")].find((button) => button.dataset.add === productId)?.closest(".product-card");
  state.restoreProductAnchor = card ? { id: productId, top: card.getBoundingClientRect().top } : null;
}

function addToCart(id, sourceElement = null) {
  if (!state.selectedTableId) return;
  state.pendingBill = null;
  captureMenuScrollAnchor(id, sourceElement);
  const product = state.data.products.find((item) => item.id === id);
  if (!product || Number(product.stock) <= 0) return alert("This product is out of stock.");
  const cart = currentCart();
  const existing = cart.find((item) => item.id === id);
  if (existing) existing.qty += 1;
  else cart.push({ id: product.id, name: product.name, price: Number(product.price), qty: 1 });
  persistInBackground("Item saved locally. Cloud sync pending.", { showToast: false, renderOnError: false });
  render();
}

function changeQty(id, amount, sourceElement = null) {
  state.pendingBill = null;
  captureMenuScrollAnchor(id, sourceElement);
  const cart = currentCart();
  const item = cart.find((cartItem) => cartItem.id === id);
  if (!item) return;
  item.qty += amount;
  const nextCart = cart.filter((cartItem) => cartItem.qty > 0);
  const tableId = state.selectedTableId;
  setCurrentCart(nextCart);
  syncActiveKotsWithTable(tableId, nextCart);
  persistInBackground("Quantity saved locally. Cloud sync pending.", { showToast: false, renderOnError: false });
  render();
}

function syncActiveKotsWithTable(tableId, cart) {
  if (!tableId) return;
  const nextItems = cloneData(cart);
  state.data.kots = (state.data.kots || [])
    .map((kot) => {
      if (kot.tableId !== tableId || kot.status === "billed") return kot;
      return {
        ...kot,
        items: nextItems,
        total: nextItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0),
        updatedAt: new Date().toISOString()
      };
    })
    .filter((kot) => kot.status === "billed" || kot.tableId !== tableId || kot.items.length);
}

async function backToTables() {
  const tableId = state.selectedTableId;
  if (!tableId) {
    render();
    return;
  }
  const hasItems = (state.data.openBills[tableId] || []).length > 0;
  const hasPrintedKot = (state.data.kots || []).some((kot) => kot.tableId === tableId && kot.status !== "billed");
  const hasPrintedPendingBill = state.pendingBill?.tableId === tableId;
  if (hasItems && !hasPrintedKot && !hasPrintedPendingBill) {
    delete state.data.openBills[tableId];
    delete state.billDrafts?.[tableId];
    state.selectedTableId = "";
    state.mobileCartOpen = false;
    await persistSafely("Unsaved table items cleared", "Items cleared locally. Cloud sync failed.");
    render();
    return;
  }
  state.selectedTableId = "";
  state.mobileCartOpen = false;
  render();
}

async function saveKot() {
  const cart = currentCart();
  const table = selectedTable();
  if (!cart.length || !table) {
    setToast("Add menu items before saving KOT", "error");
    return;
  }
  const kot = {
    id: newId(),
    kotNo: `KOT-${String((state.data.kots?.length || 0) + 1).padStart(4, "0")}`,
    tableId: table.id,
    tableName: table.name,
    items: cloneData(cart),
    total: tableTotal(table.id),
    status: "sent",
    createdAt: new Date().toISOString()
  };
  state.data.kots = [kot, ...(state.data.kots || [])].slice(0, 100);
  writeLocal();
  autoPrint(kotMarkup(kot));
  try {
    await persist();
    setToast(`${kot.kotNo} sent to kitchen`);
  } catch (error) {
    console.warn("KOT cloud sync failed", error);
    setToast("KOT saved locally. Cloud sync failed.", "error");
  }
}

async function addTable() {
  const nameInput = document.querySelector("#new-table-name");
  const seatsInput = document.querySelector("#new-table-seats");
  const name = nameInput?.value.trim() || `Table ${state.data.tables.length + 1}`;
  const seats = Math.max(0, Number(seatsInput?.value || 0));
  if (state.data.tables.some((table) => table.name.toLowerCase() === name.toLowerCase())) {
    setToast("Table name already exists", "error");
    return;
  }
  state.data.tables.push({ id: `T-${newId()}`, name, seats });
  await persistSafely("Table added", "Table added locally. Cloud sync failed.");
  render();
}

async function removeTable() {
  const tableId = document.querySelector("#remove-table-id")?.value;
  const table = state.data.tables.find((item) => item.id === tableId);
  if (!table) return;
  const hasOpenBill = (state.data.openBills[table.id] || []).length > 0;
  const hasActiveKot = (state.data.kots || []).some((kot) => kot.tableId === table.id && kot.status !== "billed");
  if (hasOpenBill || hasActiveKot) {
    setToast("Close the bill and KOT before removing this table", "error");
    return;
  }
  if (state.data.tables.length <= 1) {
    setToast("At least one table is required", "error");
    return;
  }
  if (!confirm(`Remove ${table.name}?`)) return;
  state.data.tables = state.data.tables.filter((item) => item.id !== table.id);
  delete state.data.openBills[table.id];
  if (state.selectedTableId === table.id) {
    state.selectedTableId = "";
    state.mobileCartOpen = false;
  }
  await persistSafely("Table removed", "Table removed locally. Cloud sync failed.");
  render();
}

async function checkout() {
  if (state.checkoutBusy) return;
  if (!isSubscriptionActive()) {
    state.view = "subscription";
    render();
    return;
  }
  const cart = currentCart();
  const table = selectedTable();
  if (!cart.length) return alert("Add products before billing.");
  const draft = currentBillDraft();
  const typedCustomerName = (document.querySelector("#bill-customer-name")?.value || draft.customerName || "Walk-in Customer").trim() || "Walk-in Customer";
  let customer = state.data.customers.find((item) => item.name.toLowerCase() === typedCustomerName.toLowerCase());
  if (!customer) {
    customer = {
      id: newId(),
      name: typedCustomerName,
      phone: "",
      visits: 0,
      totalSpent: 0
    };
    state.data.customers.unshift(customer);
  }
  const current = totals();
  const tableId = state.selectedTableId;
  const sale = {
    id: newId(),
    invoiceNo: `${state.data.settings.invoicePrefix}-${String(state.data.sales.length + 1).padStart(5, "0")}`,
    createdAt: new Date().toISOString(),
    customerId: customer.id,
    customerName: customer.name,
    tableId: table?.id || "",
    tableName: table?.name || "No table",
    paymentMethod: document.querySelector("#payment").value,
    paid: Number(document.querySelector("#paid").value || current.total),
    items: cloneData(cart),
    ...current
  };
  if (state.data.settings.saveBillAfterPrint) {
    state.pendingBill = { sale, tableId, customer };
    autoPrint(receiptMarkup(sale));
    setToast("Bill printed. Click Save bill to finish.");
    render();
    return;
  }
  await completeSale(sale, tableId, customer);
}

async function savePrintedBill() {
  if (state.checkoutBusy || !state.pendingBill) return;
  const { sale, tableId, customer } = state.pendingBill;
  await completeSale(sale, tableId, customer);
}

async function completeSale(sale, tableId, customer) {
  if (state.checkoutBusy) return;
  state.checkoutBusy = true;
  try {
    const saleItems = sale.items || [];
    state.data.kots = (state.data.kots || []).map((kot) => kot.tableId === tableId ? { ...kot, status: "billed", billedAt: new Date().toISOString() } : kot);
    state.data.sales.unshift(sale);
    state.data.products = state.data.products.map((product) => {
      const item = saleItems.find((cartItem) => cartItem.id === product.id);
      return item ? { ...product, stock: Math.max(0, Number(product.stock) - item.qty) } : product;
    });
    state.data.customers = state.data.customers.map((item) => item.id === customer.id ? { ...item, visits: Number(item.visits || 0) + 1, totalSpent: Number(item.totalSpent || 0) + sale.total } : item);
    state.data.openBills[tableId] = [];
    delete state.billDrafts?.[tableId];
    state.pendingBill = null;
    state.selectedTableId = "";
    state.mobileCartOpen = false;
    writeLocal();
    if (!state.data.settings.saveBillAfterPrint) autoPrint(receiptMarkup(sale));
    await persist();
    setToast("Billing completed");
  } catch (error) {
    console.warn("Checkout cloud sync failed", error);
    state.authError = "Billing completed locally, but cloud sync failed. Check Firebase rules and internet, then continue.";
    setToast("Billing completed locally. Cloud sync failed.", "error");
  } finally {
    state.checkoutBusy = false;
    render();
  }
}

async function saveProduct() {
  const saveButton = document.querySelector("#save-product");
  if (saveButton?.disabled) return;
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.innerHTML = `${icon("loader-circle")} Saving...`;
    createIconsSafely();
  }
  const id = document.querySelector("#save-product").dataset.id || newId();
  const previous = state.data.products.find((product) => product.id === id) || {};
  const file = document.querySelector("#product-image").files[0];
  const product = {
    id,
    name: document.querySelector("#product-name").value.trim() || "Untitled product",
    sku: document.querySelector("#product-sku").value.trim(),
    category: document.querySelector("#product-category").value.trim() || "General",
    price: Number(document.querySelector("#product-price").value || 0),
    cost: Number(document.querySelector("#product-cost").value || 0),
    stock: Number(document.querySelector("#product-stock").value || 0),
    imageUrl: previous.imageUrl || "",
    imageUpdatedAt: previous.imageUpdatedAt || ""
  };
  if (product.price < 0) {
    setToast("Menu price cannot be negative", "error");
    if (saveButton) saveButton.disabled = false;
    return;
  }
  if (product.stock < 0) {
    setToast("Stock cannot be negative", "error");
    if (saveButton) saveButton.disabled = false;
    return;
  }
  if (file) {
    try {
      product.imageUrl = await imageFileToDataUrl(file);
    } catch (error) {
      console.warn("Product image could not be processed", error);
      product.imageUrl = await fileToDataUrl(file);
    }
    product.imageUpdatedAt = new Date().toISOString();
  }
  const exists = state.data.products.some((item) => item.id === id);
  state.data.products = exists ? state.data.products.map((item) => item.id === id ? product : item) : [product, ...state.data.products];
  state.modal = null;
  try {
    writeLocal();
    setToast(file ? "Menu item and image saved" : "Menu item saved");
  } catch (error) {
    console.warn("Menu item local save failed", error);
    setToast("Menu item added on screen, but browser storage is full. Use smaller images or remove old image items.", "error");
  }
  render();
  syncProductAfterSave(product, file);
}

async function syncProductAfterSave(product, file) {
  try {
    if (file && state.user && state.storage) {
      const cloudUrl = await uploadProductImage(product.id, file);
      state.data.products = state.data.products.map((item) => item.id === product.id ? { ...item, imageUrl: cloudUrl, imageUpdatedAt: new Date().toISOString() } : item);
      writeLocal();
    }
    await persist();
  } catch (error) {
    console.warn("Menu item cloud sync failed", error);
    setToast("Menu item saved locally. Cloud sync failed.", "error");
    render();
  }
}

async function uploadProductImage(id, file) {
  const { ref, uploadBytes, getDownloadURL } = state.firebase.storageMod;
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
  const imageRef = ref(state.storage, `tenants/${state.tenantId}/products/${id}-${Date.now()}-${safeName}`);
  await uploadBytes(imageRef, file);
  return getDownloadURL(imageRef);
}

async function imageFileToDataUrl(file) {
  if (!file?.type?.startsWith("image/")) return fileToDataUrl(file);
  try {
    const image = await loadImage(file);
    const maxSize = 900;
    const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch (error) {
    console.warn("Image resize failed", error);
    return fileToDataUrl(file);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be loaded"));
    };
    image.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function saveSettings() {
  state.data.settings = {
    ...state.data.settings,
    shopName: document.querySelector("#setting-shopName").value.trim(),
    phone: document.querySelector("#setting-phone").value.trim(),
    gstin: document.querySelector("#setting-gstin").value.trim(),
    taxRate: Number(document.querySelector("#setting-taxRate").value || 0),
    address: document.querySelector("#setting-address").value.trim()
  };
  await persistSafely("Restaurant settings saved", "Restaurant settings saved locally. Cloud sync failed.");
  render();
}

async function saveBillingWorkflow() {
  state.data.settings = {
    ...state.data.settings,
    saveBillAfterPrint: Boolean(document.querySelector("#setting-saveBillAfterPrint")?.checked)
  };
  await persistSafely("Billing workflow saved", "Billing workflow saved locally. Cloud sync failed.");
  render();
}

async function saveModuleSettings() {
  const button = document.querySelector("#save-module-settings");
  const action = button?.dataset.action;
  if (!action) return;
  const values = {};
  document.querySelectorAll("[data-module-field]").forEach((field) => {
    values[field.dataset.moduleField] = field.type === "checkbox" ? field.checked : field.value;
  });
  state.data.modules ||= {};
  state.data.modules[action] = {
    ...(state.data.modules[action] || {}),
    ...values,
    updatedAt: new Date().toISOString()
  };
  if (action === "billing-system" && values.invoicePrefix) {
    state.data.settings.invoicePrefix = String(values.invoicePrefix).trim() || state.data.settings.invoicePrefix;
  }
  if (action === "tax" && values.taxRate) {
    state.data.settings.taxRate = Number(values.taxRate || state.data.settings.taxRate);
  }
  if (action === "print" && Object.prototype.hasOwnProperty.call(values, "saveBillAfterPrint")) {
    state.data.settings.saveBillAfterPrint = Boolean(values.saveBillAfterPrint);
  }
  state.modal = null;
  await persistSafely("Module settings saved", "Module settings saved locally. Cloud sync failed.");
  render();
}

async function resetCurrentAccountData() {
  if (!confirm("Delete all billing, menu, guest, and order data for this login and start fresh?")) return;
  const tenantId = state.tenantId;
  state.data = normalizeData(cloneData(seed));
  state.selectedTableId = "";
  localStorage.removeItem(dataStorageKey(tenantId));
  writeLocal();
  if (state.user && state.db) {
    const { doc, deleteDoc, setDoc, serverTimestamp } = state.firebase.fireMod;
    const ref = doc(state.db, "tenants", tenantId);
    await deleteDoc(ref);
    await setDoc(ref, {
      ...state.data,
      updatedAt: serverTimestamp()
    });
  }
  setToast("This login data was reset");
  render();
}

async function saveCustomer() {
  const customer = {
    id: newId(),
    name: document.querySelector("#customer-name").value.trim() || "Unnamed customer",
    phone: document.querySelector("#customer-phone").value.trim(),
    email: document.querySelector("#customer-email").value.trim(),
    totalSpent: 0
  };
  state.data.customers = [customer, ...state.data.customers];
  state.modal = null;
  await persistSafely("Guest saved", "Guest saved locally. Cloud sync failed.");
  render();
}

function normalizePhoneNumber(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  return compact;
}

function ensureFirebaseAuthReady(message) {
  if (state.firebaseConfigured && !state.cloudReady) {
    state.authError = "Firebase is still connecting. Please try again in a moment.";
    render();
    return false;
  }
  if (!state.firebaseConfigured) {
    state.authError = message;
    render();
    return false;
  }
  return true;
}

function ensureRecaptcha() {
  if (state.recaptchaVerifier) return state.recaptchaVerifier;
  const container = document.querySelector("#recaptcha-container");
  if (!container) throw new Error("OTP security check could not load. Refresh the page and try again.");
  container.innerHTML = "";
  container.dataset.mode = "invisible";
  const { RecaptchaVerifier } = state.firebase.authMod;
  state.recaptchaVerifier = new RecaptchaVerifier(state.auth, "recaptcha-container", {
    size: "invisible",
    callback: () => {
      state.authError = "";
    },
    "expired-callback": () => {
      resetRecaptcha();
    },
    "error-callback": () => {
      resetRecaptcha();
    }
  });
  return state.recaptchaVerifier;
}

function resetRecaptcha() {
  try {
    state.recaptchaVerifier?.clear?.();
  } catch (error) {
    console.warn("Could not clear reCAPTCHA", error);
  }
  state.recaptchaVerifier = null;
  const container = document.querySelector("#recaptcha-container");
  if (container) {
    container.innerHTML = "";
    delete container.dataset.mode;
  }
}

function resetAuthAttempt(message = "") {
  state.authRequestId += 1;
  state.authBusy = false;
  state.authAction = "";
  state.otpSent = false;
  state.otpConfirmation = null;
  state.authError = message;
  resetRecaptcha();
  render();
}

async function sendPhoneOtp() {
  if (state.authBusy) return;
  const phone = normalizePhoneNumber(document.querySelector("#phone")?.value);
  state.authError = "";
  if (!/^\+\d{10,15}$/.test(phone)) {
    state.authError = "Enter a valid mobile number with country code, like +91 98765 43210.";
    render();
    return;
  }
  if (!ensureFirebaseAuthReady("Add Firebase config first, then enable Phone sign-in in Firebase Authentication.")) return;
  state.phoneNumber = phone;
  resetRecaptcha();
  state.authBusy = true;
  state.authAction = "otp";
  const requestId = state.authRequestId + 1;
  state.authRequestId = requestId;
  render();
  window.setTimeout(() => {
    if (state.authBusy && state.authAction === "otp" && state.authRequestId === requestId) {
      resetAuthAttempt("OTP login is taking too long on this mobile view. Try again or continue with Google.");
    }
  }, 25000);
  const { signInWithPhoneNumber } = state.firebase.authMod;
  try {
    const verifier = ensureRecaptcha();
    state.otpConfirmation = await signInWithPhoneNumber(state.auth, phone, verifier);
    if (state.authRequestId !== requestId) return;
    state.otpSent = true;
    state.authBusy = false;
    state.authAction = "";
    setToast("OTP sent");
    render();
  } catch (error) {
    if (state.authRequestId !== requestId) return;
    resetRecaptcha();
    state.authBusy = false;
    state.authAction = "";
    state.authError = friendlyAuthError(error);
    render();
  }
}

async function verifyPhoneOtp() {
  if (state.authBusy) return;
  const code = document.querySelector("#otp")?.value.trim();
  state.authError = "";
  if (!state.otpConfirmation || !state.otpSent) {
    state.authError = "Send the OTP first, then enter the code.";
    render();
    return;
  }
  if (!/^\d{4,8}$/.test(code || "")) {
    state.authError = "Enter the OTP code you received on your phone.";
    render();
    return;
  }
  state.authBusy = true;
  state.authAction = "otpVerify";
  render();
  try {
    const credential = await state.otpConfirmation.confirm(code);
    state.otpSent = false;
    state.otpConfirmation = null;
    await finishSignedInUser(credential.user);
  } catch (error) {
    state.authBusy = false;
    state.authAction = "";
    state.authError = friendlyAuthError(error);
    render();
  }
}

function resetPhoneOtp() {
  resetAuthAttempt();
}

async function googleSignIn() {
  if (state.authBusy && state.authAction === "otp") resetAuthAttempt();
  if (state.authBusy) return;
  state.authError = "";
  if (!ensureFirebaseAuthReady("Add Firebase config first, then enable Google sign-in in Firebase Authentication.")) return;
  state.authBusy = true;
  state.authAction = "google";
  render();
  const { GoogleAuthProvider, signInWithRedirect } = state.firebase.authMod;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    rememberGoogleRedirectStart();
    await signInWithRedirect(state.auth, provider);
  } catch (error) {
    localStorage.removeItem(googleRedirectSessionKey);
    state.authBusy = false;
    state.authAction = "";
    state.authError = friendlyAuthError(error);
    render();
  }
}

async function finishSignedInUser(user) {
  state.user = user;
  state.tenantId = user?.uid || "demo";
  rememberSignedInUser(user);
  state.authReady = true;
  state.authBusy = false;
  state.authAction = "";
  render();
  try {
    await pullCloudData();
    render();
  } catch (error) {
    console.warn("Cloud sync failed", error);
  }
}

function rememberSignedInUser(user) {
  state.localSession = {
    email: user?.email || "",
    phone: user?.phoneNumber || "",
    firebaseUid: user?.uid || "",
    firebase: true
  };
  localStorage.setItem("pondypos-session", JSON.stringify(state.localSession));
  localStorage.removeItem(googleRedirectSessionKey);
}

function rememberGoogleRedirectStart() {
  localStorage.setItem(googleRedirectSessionKey, JSON.stringify({
    email: "Google account",
    expiresAt: Date.now() + 10 * 60 * 1000
  }));
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  const message = String(error?.message || "");
  if (message.toLowerCase().includes("recaptcha")) {
    return "OTP security check could not connect. Reload the page and try again, or use Google login.";
  }
  const messages = {
    "auth/configuration-not-found": "Firebase Authentication is not set up yet. Open Firebase Authentication and enable your sign-in providers.",
    "auth/captcha-check-failed": "OTP security check failed. Refresh the page and try again.",
    "auth/code-expired": "This OTP expired. Send a new OTP and try again.",
    "auth/internal-error": "Firebase login failed internally. Enable Phone and Google providers, then add localhost and your Vercel domain in Firebase authorized domains.",
    "auth/invalid-app-credential": "Firebase could not verify this app for phone login. Add localhost and your Vercel domain in Firebase authorized domains.",
    "auth/invalid-phone-number": "Enter a valid phone number with country code.",
    "auth/invalid-verification-code": "That OTP code is not correct. Check the SMS and try again.",
    "auth/missing-phone-number": "Enter your mobile number first.",
    "auth/network-request-failed": "Network failed while starting login. Check internet and try again.",
    "auth/operation-not-allowed": "This login provider is disabled in Firebase Authentication. Enable Phone and Google providers.",
    "auth/popup-blocked": "The browser blocked the Google popup. Allow popups or try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
    "auth/quota-exceeded": "Firebase OTP limit is reached for now. Try again later or add test phone numbers in Firebase.",
    "auth/too-many-requests": "Too many OTP attempts. Please wait a few minutes and try again.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase. Add localhost and your Vercel domain in Authentication settings.",
  };
  return messages[code] || error?.message || "Login failed. Check Firebase Authentication settings.";
}

function annualSubscription(fromDate = new Date()) {
  return {
    plan: "Annual POS",
    status: "active",
    amount: 4999,
    startedAt: fromDate.toISOString(),
    expiresAt: addYears(fromDate, 1).toISOString(),
    paymentRef: `ANNUAL-${Date.now()}`
  };
}

async function renewSubscription() {
  const current = getSubscription();
  const renewalStart = new Date(current.expiresAt) > new Date() ? new Date(current.expiresAt) : new Date();
  state.data.subscription = annualSubscription(renewalStart);
  await persistSafely("Annual plan updated", "Annual plan saved locally. Cloud sync failed.");
  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("Offline cache registration failed", error);
    });
  });
}

window.addEventListener("online", () => {
  if (state.firebaseConfigured && !state.cloudReady) {
    initFirebase()
      .then(() => syncPendingIfOnline())
      .catch((error) => {
        console.warn("Firebase reconnect failed", error);
        state.syncStatus = "error";
      })
      .finally(render);
    return;
  }
  syncPendingIfOnline().then((synced) => {
    if (!synced) render();
  });
});

window.addEventListener("offline", () => {
  if (state.user) state.syncStatus = "offline";
  render();
});

registerServiceWorker();

initFirebase()
  .catch((error) => {
    console.warn("Firebase unavailable. PondyPOS will continue in offline/local mode.", error);
    state.authReady = true;
    state.authBusy = false;
    state.cloudReady = false;
    state.syncStatus = navigator.onLine === false ? "offline" : "error";
  })
  .finally(render);
