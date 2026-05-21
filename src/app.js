const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR"
});

const assetVersion = "20260521-pondy-assets-4";
const logoLightUrl = `/public/pondy-logo-light-app.png?v=${assetVersion}`;
const logoDarkUrl = `/public/pondy-logo-dark-app.png?v=${assetVersion}`;
const markLightUrl = `/public/pondy-mark-light-app.png?v=${assetVersion}`;
const markDarkUrl = `/public/pondy-mark-dark-app.png?v=${assetVersion}`;
const googleRedirectSessionKey = "pondypos-google-redirect-pending";
const dataStoragePrefix = "pondypos-data";

const demoProducts = [
  { id: crypto.randomUUID(), name: "Masala Dosa", sku: "KIT-001", category: "South Indian", price: 90, cost: 38, stock: 80, imageUrl: "" },
  { id: crypto.randomUUID(), name: "Paneer Butter Masala", sku: "CUR-102", category: "Curries", price: 220, cost: 96, stock: 45, imageUrl: "" },
  { id: crypto.randomUUID(), name: "Veg Biryani", sku: "RIC-210", category: "Rice Bowls", price: 180, cost: 82, stock: 55, imageUrl: "" },
  { id: crypto.randomUUID(), name: "Tandoori Roti", sku: "BRD-011", category: "Breads", price: 35, cost: 12, stock: 120, imageUrl: "" },
  { id: crypto.randomUUID(), name: "Fresh Lime Soda", sku: "BEV-044", category: "Beverages", price: 70, cost: 24, stock: 60, imageUrl: "" }
];

const seed = {
  settings: {
    shopName: "PondyPOS Restaurant",
    gstin: "",
    phone: "",
    address: "Your restaurant address",
    taxRate: 18,
    invoicePrefix: "CC"
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
    { id: crypto.randomUUID(), name: "Walk-in Customer", phone: "", email: "", totalSpent: 0 }
  ],
  sales: []
};

const initialSession = readLocalSession();
const initialTenantId = initialSession?.firebaseUid || "demo";

const state = {
  view: "pos",
  sidebarExpanded: readStorage("pondypos-sidebar-expanded", "countercloud-sidebar-expanded") === "true",
  reportKey: "category",
  firebaseConfigured: hasFirebaseConfig(),
  authReady: !hasFirebaseConfig(),
  authBusy: false,
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
  search: "",
  modal: null,
  authError: "",
  lastReceipt: null
};

const app = document.querySelector("#app");

function dataStorageKey(tenantId = state?.tenantId || "demo") {
  return tenantId && tenantId !== "demo" ? `${dataStoragePrefix}-${tenantId}` : `${dataStoragePrefix}-demo`;
}

function readLocal(tenantId = state?.tenantId || "demo") {
  if (tenantId === "demo") migrateStorageKey("countercloud-pos", dataStorageKey("demo"));
  const saved = localStorage.getItem(dataStorageKey(tenantId));
  if (!saved) return normalizeData(structuredClone(seed));
  try {
    return normalizeData({ ...structuredClone(seed), ...JSON.parse(saved) });
  } catch {
    return normalizeData(structuredClone(seed));
  }
}

function writeLocal() {
  localStorage.setItem(dataStorageKey(), JSON.stringify(state.data));
}

function normalizeData(data) {
  const freshSeed = structuredClone(seed);
  const settings = { ...freshSeed.settings, ...(data.settings || {}) };
  if (settings.shopName === "CounterCloud Store" || settings.shopName === "CounterCloud Restaurant") settings.shopName = freshSeed.settings.shopName;
  if (settings.address === "Your store address") settings.address = freshSeed.settings.address;
  return {
    ...freshSeed,
    ...data,
    settings,
    subscription: { ...freshSeed.subscription, ...(data.subscription || {}) },
    tables: data.tables?.length ? data.tables : freshSeed.tables,
    openBills: data.openBills || {},
    products: shouldUseRestaurantSeed(data.products) ? freshSeed.products : data.products,
    customers: data.customers?.length ? data.customers : freshSeed.customers,
    sales: data.sales || []
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
  const config = window.FIREBASE_CONFIG || {};
  if (!config.apiKey || !config.projectId) {
    state.authReady = true;
    return;
  }
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
    state.selectedTableId = "";
    state.authReady = true;
    state.authBusy = false;
    if (user) rememberSignedInUser(user);
    render();
    if (user) {
      try {
        await pullCloudData();
        render();
      } catch (error) {
        console.warn("Cloud sync failed", error);
        state.authError = "";
      }
    }
  });
}

async function pullCloudData() {
  if (!state.user) return;
  const { doc, getDoc, setDoc } = state.firebase.fireMod;
  const ref = doc(state.db, "tenants", state.tenantId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    state.data = normalizeData({ ...structuredClone(seed), ...snap.data() });
    writeLocal();
  } else {
    state.data = readLocal(state.tenantId);
    await setDoc(ref, state.data);
  }
}

async function persist() {
  writeLocal();
  if (!state.user || !state.db) return;
  const { doc, setDoc, serverTimestamp } = state.firebase.fireMod;
  await setDoc(doc(state.db, "tenants", state.tenantId), {
    ...state.data,
    updatedAt: serverTimestamp()
  });
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
  state.data.openBills[state.selectedTableId] = cart;
}

function selectedTable() {
  return state.data.tables.find((table) => table.id === state.selectedTableId);
}

function tableTotal(tableId) {
  return (state.data.openBills[tableId] || []).reduce((sum, item) => sum + item.price * item.qty, 0);
}

function totals(cart = currentCart()) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = Number(document.querySelector("#discount")?.value || 0);
  const taxRate = Number(state.data.settings.taxRate || 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (taxRate / 100);
  return { subtotal, discount, tax, total: taxable + tax };
}

function setView(view) {
  state.view = view;
  if (view === "pos") state.selectedTableId = "";
  state.modal = null;
  render();
}

function icon(name, size = 18) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
}

function escapeAttr(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function render() {
  app.innerHTML = !isAuthenticated() ? renderAuth() : renderShell();
  lucide.createIcons();
  bindEvents();
}

function renderAuth() {
  const waitingForFirebase = state.firebaseConfigured && !state.authReady;
  const authDisabled = state.authBusy || waitingForFirebase;
  const otpText = state.authBusy ? (state.otpSent ? "Verifying..." : "Sending OTP...") : (state.otpSent ? "Verify OTP" : "Send OTP");
  const googleText = waitingForFirebase ? "Connecting to Firebase..." : state.authBusy ? "Redirecting to Google..." : "Continue with Google";
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
        <div class="auth-plan">
          ${icon("badge-check")}
          <div><strong>Annual POS subscription</strong><span>1 year access • ${money(seed.subscription.amount)} / store</span></div>
        </div>
        ${state.authError ? `<div class="auth-error">${icon("circle-alert")}<span>${state.authError}</span></div>` : ""}
        ${waitingForFirebase ? `<div class="auth-loading">${icon("loader-circle")}<span>Connecting to Firebase. Login will be ready in a moment.</span></div>` : ""}
        <h2>Sign in with phone OTP</h2>
        <p class="auth-note">Use your owner mobile number. Enter country code, or type a 10 digit India number and PondyPOS will add +91.</p>
        <div class="field"><label>Phone number</label><input class="input" id="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 98765 43210" value="${escapeAttr(state.phoneNumber || "")}" ${state.otpSent ? "disabled" : ""}></div>
        ${state.otpSent ? `<div class="field"><label>OTP code</label><input class="input" id="otp" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 digit OTP" maxlength="8"></div>` : ""}
        <div id="recaptcha-container"></div>
        <button class="button" id="${state.otpSent ? "verify-otp" : "send-otp"}" ${authDisabled ? "disabled" : ""}>${icon(state.otpSent ? "badge-check" : "smartphone")} ${otpText}</button>
        ${state.otpSent ? `<button class="button secondary" id="change-phone" ${state.authBusy ? "disabled" : ""}>${icon("rotate-ccw")} Change phone number</button>` : ""}
        <button class="button google" id="google-signin" ${authDisabled ? "disabled" : ""}>${icon("chrome")} ${googleText}</button>
      </section>
    </main>
  `;
}

function renderShell() {
  return `
    <div class="app-shell ${state.sidebarExpanded ? "sidebar-expanded" : "sidebar-collapsed"}">
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
        ${renderTopbar()}
        ${views[state.view]()}
      </main>
      ${renderMobileNav()}
      ${state.modal ? renderModal() : ""}
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
  return `<nav class="${className}">${items.map(([view, iconName, label]) => `
    <button class="${state.view === view ? "active" : ""}" data-view="${view}" title="${label}">
      ${icon(iconName)} <span>${label}</span>
    </button>`).join("")}</nav>`;
}

function renderMobileNav() {
  return renderNav("mobile-nav");
}

function renderTopbar() {
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
        <div class="status-pill">${icon(state.user ? "cloud" : "hard-drive", 16)} ${state.user ? "Firebase cloud sync" : "Local account"}</div>
      </div>
    </header>
  `;
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
  const lowStock = state.data.products.filter((product) => Number(product.stock) <= 5).length;
  return `
    <section class="grid dashboard-grid">
      ${metric("Today Revenue", money(revenue), "indian-rupee")}
      ${metric("Invoices Today", todaysSales.length, "receipt")}
      ${metric("Products", state.data.products.length, "boxes")}
      ${metric("Low Stock", lowStock, "triangle-alert")}
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-header"><h3>Recent invoices</h3><button class="button secondary" data-view="sales">${icon("arrow-right")} View sales</button></div>
      ${renderSaleList(state.data.sales.slice(0, 6))}
    </section>
  `;
}

function metric(label, value, iconName) {
  return `<div class="metric">${icon(iconName)}<span>${label}</span><strong>${value}</strong></div>`;
}

function renderPOS() {
  if (!state.selectedTableId) return renderTablePicker();
  const filtered = state.data.products.filter((product) =>
    [product.name, product.sku, product.category].join(" ").toLowerCase().includes(state.search.toLowerCase())
  );
  const locked = !isSubscriptionActive();
  const table = selectedTable();
  const cart = currentCart();
  return `
    ${locked ? renderSubscriptionBanner() : ""}
    <section class="table-context">
      <button class="button secondary" id="back-to-tables">${icon("arrow-left")} Tables</button>
      <div><strong>${table?.name || "Selected table"}</strong><span>${cart.length} items in current bill</span></div>
    </section>
    <section class="grid pos-grid">
      <div class="panel">
        <div class="panel-header">
          <h3>Menu</h3>
          <input class="input search" id="search" placeholder="Search menu item or scan SKU" value="${state.search}">
        </div>
        <div class="grid product-grid">
          ${filtered.map(renderProductCard).join("") || `<div class="empty">No products found</div>`}
        </div>
      </div>
      <aside class="panel">
        <div class="panel-header"><h3>${table?.name || "Current bill"}</h3><button class="icon-button" id="clear-cart" title="Clear cart">${icon("trash-2")}</button></div>
        <div class="cart-list">${cart.map(renderCartRow).join("") || `<div class="empty">Tap products to add them to this table bill</div>`}</div>
        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label>Customer</label><select id="customer">${state.data.customers.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select></div>
          <div class="field"><label>Payment</label><select id="payment"><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option></select></div>
          <div class="field"><label>Discount</label><input class="input" id="discount" type="number" value="0" min="0"></div>
          <div class="field"><label>Amount Paid</label><input class="input" id="paid" type="number" min="0" placeholder="0"></div>
        </div>
        ${renderSummary()}
        <button class="button" id="checkout" style="width:100%;margin-top:14px" ${locked ? "disabled" : ""}>${icon("receipt-text")} Complete billing</button>
      </aside>
    </section>
  `;
}

function renderTablePicker() {
  const occupied = state.data.tables.filter((table) => (state.data.openBills[table.id] || []).length).length;
  return `
    <section class="table-hero">
      <div>
        <span class="eyebrow">Billing starts here</span>
        <h3>Select a table</h3>
        <p>Choose a table first, then add products and complete the bill for that table.</p>
      </div>
      <div class="table-summary"><strong>${occupied}</strong><span>open bills</span></div>
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
  const art = product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}">` : product.name.slice(0, 2).toUpperCase();
  return `
    <button class="product-card" data-add="${product.id}">
      <div class="product-art">${art}</div>
      <div class="product-body">
        <h4>${product.name}</h4>
        <div class="product-meta"><span>${product.category || "General"}</span><span>Stock ${product.stock}</span></div>
        <div class="product-meta"><span>${product.sku || "No SKU"}</span><span class="price">${money(product.price)}</span></div>
      </div>
    </button>
  `;
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
  const paid = Number(document.querySelector("#paid")?.value || 0);
  return `
    <div class="summary">
      <div class="summary-row"><span>Subtotal</span><strong>${money(current.subtotal)}</strong></div>
      <div class="summary-row"><span>Discount</span><strong>${money(current.discount)}</strong></div>
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
        <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          ${state.data.products.map((product) => `
            <tr>
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
    ["Orders & Billing", [
      ["Orders", "receipt-text", "View all current and past restaurant orders."],
      ["Online Orders", "monitor-up", "Track online order channels."],
      ["KOTs", "scroll-text", "Kitchen order tickets and preparation flow."],
      ["Due Payment", "badge-indian-rupee", "Pending customer dues."],
      ["Billing Screen", "receipt", "Open the active table billing screen."],
      ["Live View", "radio", "Monitor running tables and live orders."],
      ["Bill / KOT Print", "printer", "Printing setup for receipts and KOT."],
      ["Table", "table", "Dining table layout and table controls."],
      ["Custom Order Status", "workflow", "Food ready, dispatch, delivery, and custom statuses."]
    ]],
    ["Payments & Finance", [
      ["Cash Flow", "hand-coins", "Daily cash movement."],
      ["Expense", "circle-dollar-sign", "Restaurant expenses."],
      ["Withdrawal", "landmark", "Cash withdrawal records."],
      ["Cash Top-Up", "wallet", "Counter cash top-up."],
      ["Currency Conversion", "coins", "Currency conversion setup."]
    ]],
    ["Menu & Inventory", [
      ["Menu", "book-open", "Food and beverage item list."],
      ["Menu Item On Off", "toggle-left", "Temporarily hide unavailable items."],
      ["Tax", "badge-percent", "GST and tax configuration."],
      ["Discount", "badge", "Discount rules and permissions."],
      ["Table Reservation", "calendar-check", "Guest reservation controls."],
      ["Customers", "users", "Guest profiles and dues."],
      ["Feedback", "message-square-quote", "Customer feedback records."],
      ["LED Display", "monitor", "Kitchen and order display settings."],
      ["Inventory", "boxes", "Stock and ingredient controls."],
      ["Dual Screen", "monitor-dot", "Customer-facing display setup."]
    ]],
    ["System Settings", [
      ["Billing User Profile", "id-card", "Cashier and staff access."],
      ["Manual Sync", "refresh-cw", "Push and pull cloud data."],
      ["Alerts", "bell", "System and stock alerts."],
      ["Service Renewal", "rotate-ccw", "Subscription and service renewal."],
      ["Help", "circle-help", "Support and help center."],
      ["Language Profiles", "languages", "Regional labels and print language."]
    ]]
  ];
  return groups.map(([title, items]) => `
    <section class="panel ops-panel">
      <div class="panel-header"><h3>${title}</h3></div>
      <div class="ops-grid">${items.map(([label, iconName, text]) => `
        <button class="ops-card">
          ${icon(iconName, 22)}
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
            <button class="button secondary">${icon("search", 16)} Search</button>
            <button class="button secondary">${icon("printer", 16)} Print</button>
            <button class="button secondary">${icon("file-spreadsheet", 16)} Export Excel</button>
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
  return `<div class="table-scroll"><table class="table report-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row, index) => `<tr class="${index === 0 ? "total" : ""}">${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderOutletSettings() {
  const groups = [
    ["Billing Screen", [
      ["Display", "monitor", "Customise what appears on the billing screen."],
      ["Calculations", "calculator", "Configure service charges and rounding rules."],
      ["Linked Services", "life-buoy", "Set how add-on services work with your POS system."],
      ["Print", "printer", "Manage printing rules for Bill and KOT."],
      ["Customer", "user-round", "Configure phone validation and dues."]
    ]],
    ["Online / Advance Order", [
      ["Online/Advance Order Configuration", "bell-ring", "Control auto-accept, timings, and cancellations."]
    ]],
    ["System Setting", [
      ["Billing System", "scroll-text", "Set how your POS updates with the central system."],
      ["Tax", "badge-percent", "GST, CGST, SGST and inclusive tax setup."],
      ["Language Profiles", "languages", "Manage regional labels and print language."],
      ["Billing User Profile", "id-card", "Cashier, captain and manager access."]
    ]]
  ];
  return `
    ${groups.map(([title, items]) => `
      <section class="panel settings-panel">
        <div class="panel-header"><h3>${title}</h3></div>
        <div class="settings-grid">${items.map(([label, iconName, text]) => `
          <button class="setting-card">${icon(iconName, 22)}<span><strong>${label}</strong><small>${text}</small></span>${icon("arrow-right", 18)}</button>
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

function renderModal() {
  if (state.modal.type === "product") return renderProductModal(state.modal.product);
  if (state.modal.type === "customer") return renderCustomerModal();
  if (state.modal.type === "receipt") return renderReceiptModal(state.modal.sale);
  return "";
}

function renderProductModal(product = {}) {
  return `
    <div class="modal-backdrop">
      <section class="modal">
        <div class="panel-header"><h3>${product.id ? "Edit menu item" : "New menu item"}</h3><button class="icon-button" data-close title="Close">${icon("x")}</button></div>
        <div class="form-grid">
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
      render();
    });
  });
  document.querySelectorAll("[data-table]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTableId = button.dataset.table;
      render();
    });
  });
  document.querySelector("#back-to-tables")?.addEventListener("click", () => {
    state.selectedTableId = "";
    render();
  });
  document.querySelector("#search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.add));
  });
  document.querySelectorAll("[data-inc]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.inc, 1)));
  document.querySelectorAll("[data-dec]").forEach((button) => button.addEventListener("click", () => changeQty(button.dataset.dec, -1)));
  document.querySelector("#clear-cart")?.addEventListener("click", async () => {
    setCurrentCart([]);
    await persist();
    render();
  });
  document.querySelector("#discount")?.addEventListener("input", updateSummaryOnly);
  document.querySelector("#paid")?.addEventListener("input", updateSummaryOnly);
  document.querySelector("#checkout")?.addEventListener("click", checkout);
  document.querySelector("#renew-subscription")?.addEventListener("click", renewSubscription);
  document.querySelector("#new-product")?.addEventListener("click", () => { state.modal = { type: "product", product: {} }; render(); });
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", () => {
    state.modal = { type: "product", product: state.data.products.find((product) => product.id === button.dataset.editProduct) };
    render();
  }));
  document.querySelector("#save-product")?.addEventListener("click", saveProduct);
  document.querySelector("#save-settings")?.addEventListener("click", saveSettings);
  document.querySelector("#reset-account-data")?.addEventListener("click", resetCurrentAccountData);
  document.querySelector("#new-customer")?.addEventListener("click", () => { state.modal = { type: "customer" }; render(); });
  document.querySelector("#save-customer")?.addEventListener("click", saveCustomer);
  document.querySelectorAll("[data-receipt]").forEach((button) => button.addEventListener("click", () => {
    state.modal = { type: "receipt", sale: state.data.sales.find((sale) => sale.id === button.dataset.receipt) };
    render();
  }));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { state.modal = null; render(); }));
  document.querySelector("#print-receipt")?.addEventListener("click", () => window.print());
  document.querySelector("#send-otp")?.addEventListener("click", sendPhoneOtp);
  document.querySelector("#verify-otp")?.addEventListener("click", verifyPhoneOtp);
  document.querySelector("#change-phone")?.addEventListener("click", resetPhoneOtp);
  document.querySelector("#google-signin")?.addEventListener("click", googleSignIn);
  document.querySelector("#signout")?.addEventListener("click", async () => {
    if (state.user) await state.auth.signOut();
    state.localSession = null;
    state.otpSent = false;
    state.otpConfirmation = null;
    state.tenantId = "demo";
    state.data = readLocal("demo");
    state.selectedTableId = "";
    localStorage.removeItem("pondypos-session");
    localStorage.removeItem(googleRedirectSessionKey);
    resetRecaptcha();
    render();
  });
}

function updateSummaryOnly() {
  const summary = document.querySelector(".summary");
  if (summary) summary.outerHTML = renderSummary();
}

function addToCart(id) {
  if (!state.selectedTableId) return;
  const product = state.data.products.find((item) => item.id === id);
  if (!product || Number(product.stock) <= 0) return alert("This product is out of stock.");
  const cart = currentCart();
  const existing = cart.find((item) => item.id === id);
  if (existing) existing.qty += 1;
  else cart.push({ id: product.id, name: product.name, price: Number(product.price), qty: 1 });
  persist();
  render();
}

function changeQty(id, amount) {
  const cart = currentCart();
  const item = cart.find((cartItem) => cartItem.id === id);
  if (!item) return;
  item.qty += amount;
  setCurrentCart(cart.filter((cartItem) => cartItem.qty > 0));
  persist();
  render();
}

async function checkout() {
  if (!isSubscriptionActive()) {
    state.view = "subscription";
    render();
    return;
  }
  const cart = currentCart();
  const table = selectedTable();
  if (!cart.length) return alert("Add products before billing.");
  const customer = state.data.customers.find((item) => item.id === document.querySelector("#customer").value) || state.data.customers[0];
  const current = totals();
  const sale = {
    id: crypto.randomUUID(),
    invoiceNo: `${state.data.settings.invoicePrefix}-${String(state.data.sales.length + 1).padStart(5, "0")}`,
    createdAt: new Date().toISOString(),
    customerId: customer.id,
    customerName: customer.name,
    tableId: table?.id || "",
    tableName: table?.name || "No table",
    paymentMethod: document.querySelector("#payment").value,
    paid: Number(document.querySelector("#paid").value || current.total),
    items: structuredClone(cart),
    ...current
  };
  state.data.sales.unshift(sale);
  state.data.products = state.data.products.map((product) => {
    const item = cart.find((cartItem) => cartItem.id === product.id);
    return item ? { ...product, stock: Math.max(0, Number(product.stock) - item.qty) } : product;
  });
  state.data.customers = state.data.customers.map((item) => item.id === customer.id ? { ...item, totalSpent: Number(item.totalSpent || 0) + sale.total } : item);
  state.data.openBills[state.selectedTableId] = [];
  state.selectedTableId = "";
  await persist();
  state.modal = { type: "receipt", sale };
  render();
}

async function saveProduct() {
  const id = document.querySelector("#save-product").dataset.id || crypto.randomUUID();
  const previous = state.data.products.find((product) => product.id === id) || {};
  const file = document.querySelector("#product-image").files[0];
  let imageUrl = previous.imageUrl || "";
  if (file && state.user && state.storage) {
    const { ref, uploadBytes, getDownloadURL } = state.firebase.storageMod;
    const imageRef = ref(state.storage, `tenants/${state.tenantId}/products/${id}-${file.name}`);
    await uploadBytes(imageRef, file);
    imageUrl = await getDownloadURL(imageRef);
  } else if (file) {
    imageUrl = await fileToDataUrl(file);
  }
  const product = {
    id,
    name: document.querySelector("#product-name").value.trim() || "Untitled product",
    sku: document.querySelector("#product-sku").value.trim(),
    category: document.querySelector("#product-category").value.trim() || "General",
    price: Number(document.querySelector("#product-price").value || 0),
    cost: Number(document.querySelector("#product-cost").value || 0),
    stock: Number(document.querySelector("#product-stock").value || 0),
    imageUrl
  };
  const exists = state.data.products.some((item) => item.id === id);
  state.data.products = exists ? state.data.products.map((item) => item.id === id ? product : item) : [product, ...state.data.products];
  state.modal = null;
  await persist();
  render();
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
  await persist();
  render();
}

async function resetCurrentAccountData() {
  if (!confirm("Delete all billing, menu, guest, and order data for this login and start fresh?")) return;
  const tenantId = state.tenantId;
  state.data = normalizeData(structuredClone(seed));
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
  render();
}

async function saveCustomer() {
  const customer = {
    id: crypto.randomUUID(),
    name: document.querySelector("#customer-name").value.trim() || "Unnamed customer",
    phone: document.querySelector("#customer-phone").value.trim(),
    email: document.querySelector("#customer-email").value.trim(),
    totalSpent: 0
  };
  state.data.customers = [customer, ...state.data.customers];
  state.modal = null;
  await persist();
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
  const { RecaptchaVerifier } = state.firebase.authMod;
  state.recaptchaVerifier = new RecaptchaVerifier(state.auth, "recaptcha-container", {
    size: "invisible",
    callback: () => {
      state.authError = "";
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
  state.authBusy = true;
  render();
  const { signInWithPhoneNumber } = state.firebase.authMod;
  try {
    const verifier = ensureRecaptcha();
    state.otpConfirmation = await signInWithPhoneNumber(state.auth, phone, verifier);
    state.otpSent = true;
    state.authBusy = false;
    render();
  } catch (error) {
    resetRecaptcha();
    state.authBusy = false;
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
  render();
  try {
    const credential = await state.otpConfirmation.confirm(code);
    state.otpSent = false;
    state.otpConfirmation = null;
    await finishSignedInUser(credential.user);
  } catch (error) {
    state.authBusy = false;
    state.authError = friendlyAuthError(error);
    render();
  }
}

function resetPhoneOtp() {
  state.otpSent = false;
  state.otpConfirmation = null;
  state.authError = "";
  resetRecaptcha();
  render();
}

async function googleSignIn() {
  if (state.authBusy) return;
  state.authError = "";
  if (!ensureFirebaseAuthReady("Add Firebase config first, then enable Google sign-in in Firebase Authentication.")) return;
  state.authBusy = true;
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
  const messages = {
    "auth/configuration-not-found": "Firebase Authentication is not set up yet. Open Firebase Authentication and enable your sign-in providers.",
    "auth/captcha-check-failed": "OTP security check failed. Refresh the page and try again.",
    "auth/code-expired": "This OTP expired. Send a new OTP and try again.",
    "auth/internal-error": "Firebase login failed internally. Enable Phone and Google providers, then add localhost and your Vercel domain in Firebase authorized domains.",
    "auth/invalid-app-credential": "Firebase could not verify this app for phone login. Add localhost and your Vercel domain in Firebase authorized domains.",
    "auth/invalid-phone-number": "Enter a valid phone number with country code.",
    "auth/invalid-verification-code": "That OTP code is not correct. Check the SMS and try again.",
    "auth/missing-phone-number": "Enter your mobile number first.",
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
  await persist();
  render();
}

initFirebase().finally(render);
