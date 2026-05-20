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
  localSession: readLocalSession(),
  tenantId: "demo",
  data: readLocal(),
  selectedTableId: "",
  search: "",
  modal: null,
  authError: "",
  lastReceipt: null
};

const app = document.querySelector("#app");

function readLocal() {
  migrateStorageKey("countercloud-pos", "pondypos-data");
  const saved = localStorage.getItem("pondypos-data");
  if (!saved) return normalizeData(structuredClone(seed));
  try {
    return normalizeData({ ...structuredClone(seed), ...JSON.parse(saved) });
  } catch {
    return normalizeData(structuredClone(seed));
  }
}

function writeLocal() {
  localStorage.setItem("pondypos-data", JSON.stringify(state.data));
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
    if (savedSession) return savedSession;
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
  return state.user?.email || state.localSession?.email || "Local account";
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
  return allTables().find((table) => table.id === state.selectedTableId);
}

function allTables() {
  const saved = state.data.tables.map((table, index) => ({
    ...table,
    id: table.id || `T${index + 1}`,
    name: table.name || String(index + 1),
    zone: table.zone || "Ground Floor - AC"
  }));
  const savedIds = new Set(saved.map((table) => table.id));
  const floor = Array.from({ length: 19 }, (_, index) => {
    const number = index + 1;
    return { id: `T${number}`, name: String(number), seats: number % 4 === 0 ? 6 : 4, zone: "Ground Floor - AC" };
  }).filter((table) => !savedIds.has(table.id));
  const other = Array.from({ length: 41 }, (_, index) => {
    const number = index + 1;
    return { id: `P${number}`, name: `p${number}`, seats: 0, zone: "Other" };
  });
  return [...saved, ...floor, ...other];
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

function render() {
  app.innerHTML = !isAuthenticated() ? renderAuth() : renderShell();
  lucide.createIcons();
  bindEvents();
}

function renderAuth() {
  const waitingForFirebase = state.firebaseConfigured && !state.authReady;
  const authDisabled = state.authBusy || waitingForFirebase;
  const loginText = state.authBusy ? "Signing in..." : "Sign in";
  const createText = state.authBusy ? "Creating account..." : "Create account";
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
        <h2>Sign in to your store</h2>
        <p class="auth-note">New store owner? Use Create account first, then sign in later with the same email.</p>
        <div class="field"><label>Email</label><input class="input" id="email" type="email" placeholder="owner@example.com"></div>
        <div class="field"><label>Password</label><input class="input" id="password" type="password" placeholder="Minimum 6 characters"></div>
        <button class="button" id="signin" ${authDisabled ? "disabled" : ""}>${icon("log-in")} ${loginText}</button>
        <button class="button secondary" id="signup" ${authDisabled ? "disabled" : ""}>${icon("user-plus")} ${createText}</button>
        <button class="button google" id="google-signin" ${authDisabled ? "disabled" : ""}>${icon("chrome")} ${googleText}</button>
        <button class="ghost-button button secondary" id="demo-mode">${icon("monitor-smartphone")} Try POS demo</button>
      </section>
    </main>
  `;
}

function renderShell() {
  return `
    <div class="app-shell pc-shell">
      ${renderDesktopHeader()}
      <main class="main pc-main">
        ${views[state.view]()}
      </main>
      ${renderMobileNav()}
      ${state.modal ? renderModal() : ""}
    </div>
  `;
}

function renderDesktopHeader() {
  const supportPhone = state.data.settings.phone || "07969 223344";
  const quickItems = [
    ["operations", "sliders-horizontal", "Operations"],
    ["products", "toggle-left", "Item On/Off"],
    ["dashboard", "radio", "Live View"],
    ["sales", "monitor-up", "Orders"],
    ["reports", "receipt-text", "Recent"],
    ["subscription", "clock", "Hold"],
    ["settings", "bell", "Alerts"]
  ];
  return `
    <header class="pc-header">
      <div class="pc-titlebar">${state.data.settings.shopName || "PondyPOS Restaurant"} - Restaurant Management Platform</div>
      <div class="pc-commandbar">
        <button class="hamburger" id="brand-toggle" title="Menu">${icon("menu", 24)}</button>
        <button class="pc-logo" data-view="pos" title="PondyPOS"><img src="${markDarkUrl}" alt="PondyPOS"><span>PondyPOS</span></button>
        <button class="pc-new-order" data-view="pos">New Order</button>
        <label class="pc-search">${icon("search", 17)}<input id="bill-search" placeholder="Bill No"></label>
        <label class="pc-search">${icon("search", 17)}<input id="kot-search" placeholder="KOT No."></label>
        <div class="pc-header-spacer"></div>
        <div class="pc-actions">
          ${quickItems.map(([view, iconName, label]) => `<button data-view="${view}" class="${state.view === view ? "active" : ""}">${icon(iconName, 21)}<span>${label}</span></button>`).join("")}
          <button id="signout">${icon("log-out", 21)}<span>Logout</span></button>
        </div>
        <button class="pc-support">${supportPhone}<span>Request Support</span></button>
      </div>
    </header>
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
    ["operations", "sliders-horizontal", "Operations"],
    ["reports", "chart-line", "Reports"],
    ["settings", "settings", "Settings"],
    ["dashboard", "layout-dashboard", "Dashboard"],
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
  return renderBillingScreen();
}

function renderBillingScreen() {
  const filtered = state.data.products.filter((product) =>
    [product.name, product.sku, product.category].join(" ").toLowerCase().includes(state.search.toLowerCase())
  );
  const locked = !isSubscriptionActive();
  const table = selectedTable();
  const cart = currentCart();
  const categories = [...new Set(state.data.products.map((product) => product.category || "General"))];
  return `
    ${locked ? renderSubscriptionBanner() : ""}
    <section class="billing-screen">
      <div class="billing-menu">
        <div class="billing-search">${icon("search", 18)}<input class="input" id="search" placeholder="Search item" value="${state.search}"></div>
        <div class="billing-body">
          <aside class="category-rail">
            <button class="active">Favorite Items</button>
            ${categories.map((category) => `<button>${category}</button>`).join("")}
          </aside>
          <div class="menu-tile-grid">
            ${filtered.map((product) => `<button class="menu-tile" data-add="${product.id}"><span>${product.name}</span></button>`).join("") || `<div class="empty">No products found</div>`}
          </div>
        </div>
      </div>
      <aside class="billing-ticket">
        <div class="order-tabs"><button class="active">Dine In</button><button>Delivery</button><button>Pick Up</button></div>
        <div class="ticket-mode-row">
          <button class="active">${icon("table", 22)}<span>${table?.name || "Table"}</span></button>
          <button>${icon("user", 22)}</button>
          <button>${icon("users", 22)}</button>
          <button>${icon("notebook-pen", 22)}</button>
        </div>
        <div class="ticket-header"><span>ITEMS</span><span>QTY.</span><span>PRICE</span></div>
        <div class="ticket-items">${cart.map(renderTicketRow).join("") || renderNoItemSelected()}</div>
        <div class="form-grid compact-fields">
          <div class="field"><label>Customer</label><select id="customer">${state.data.customers.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select></div>
          <div class="field"><label>Payment</label><select id="payment"><option>Cash</option><option>UPI</option><option>Card</option><option>Credit</option></select></div>
          <div class="field"><label>Discount</label><input class="input" id="discount" type="number" value="0" min="0"></div>
          <div class="field"><label>Amount Paid</label><input class="input" id="paid" type="number" min="0" placeholder="0"></div>
        </div>
        ${renderSummary()}
        <div class="payment-strip"><button class="active">${icon("banknote", 17)} Cash</button><button>${icon("credit-card", 17)} Card</button><button>${icon("badge-indian-rupee", 17)} Due</button><button>${icon("wallet-cards", 17)} Other</button></div>
        <div class="ticket-actions">
          <button class="button" id="checkout" ${locked ? "disabled" : ""}>Save</button>
          <button class="button" data-save-print ${locked ? "disabled" : ""}>Save & Print</button>
          <button class="button secondary">KOT</button>
          <button class="button secondary" id="back-to-tables">${icon("arrow-left")} Tables</button>
        </div>
      </aside>
    </section>
  `;
}

function renderTicketRow(item) {
  return `
    <div class="ticket-row">
      <span>${item.name}</span>
      <span class="qty-controls"><button data-dec="${item.id}">-</button><strong>${item.qty}</strong><button data-inc="${item.id}">+</button></span>
      <strong>${money(item.price * item.qty)}</strong>
    </div>
  `;
}

function renderNoItemSelected() {
  return `<div class="no-item">${icon("utensils", 82)}<strong>No Item Selected</strong><span>Please select item from left menu item</span></div>`;
}

function renderTablePicker() {
  const tables = allTables();
  const occupied = tables.filter((table) => (state.data.openBills[table.id] || []).length).length;
  const floorTables = tables.filter((table) => table.zone === "Ground Floor - AC");
  const otherTables = tables.filter((table) => table.zone === "Other");
  return `
    <section class="pc-page-head">
      <h2>Table View</h2>
      <div class="pc-page-actions">
        <button class="icon-button" title="Refresh">${icon("refresh-cw", 22)}</button>
        <button class="button">Add Table</button>
        <button class="button">Delivery</button>
        <button class="button">Pick Up</button>
      </div>
    </section>
    <section class="table-toolbar">
      <button class="button">+ Table Reservation</button>
      <div class="table-legend">
        <span><i class="legend-dot blank"></i>Blank Table</span>
        <span><i class="legend-dot running"></i>Running Table</span>
        <span><i class="legend-dot printed"></i>Printed Table</span>
        <span><i class="legend-dot paid"></i>Paid Table</span>
        <span><i class="legend-dot kot"></i>Running KOT Table</span>
      </div>
    </section>
    <section class="pc-table-section">
      <h3>Ground Floor - AC</h3>
      <div class="pc-table-grid">${floorTables.map(renderTableCell).join("")}</div>
      <h3>Other</h3>
      <div class="pc-table-grid">${otherTables.map(renderTableCell).join("")}</div>
    </section>
  `;
}

function renderTableCell(table) {
  const cart = state.data.openBills[table.id] || [];
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const occupied = itemCount > 0;
  const statusClass = occupied ? "running" : "blank";
  return `
    <button class="pc-table-cell ${statusClass}" data-table="${table.id}">
      ${occupied ? `<span>0 Min</span><strong>${table.name}</strong><b>${money(tableTotal(table.id))}</b><em>${icon("printer", 17)} ${icon("eye", 17)}</em>` : `<strong>${table.name}</strong>`}
    </button>
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

function renderOperations() {
  const groups = [
    ["Orders & Billing", [
      ["sales", "receipt-text", "Orders"], ["dashboard", "monitor-up", "Online Orders"], ["reports", "scroll-text", "KOTs"], ["sales", "badge-indian-rupee", "Due Payment"], ["pos", "receipt", "Billing Screen"],
      ["dashboard", "radio", "Live View"], ["products", "printer", "Bill / KOT Print"], ["pos", "table", "Table"], ["settings", "workflow", "Custom Order Status"]
    ]],
    ["Payments & Finance", [
      ["reports", "hand-coins", "Cash Flow"], ["reports", "circle-dollar-sign", "Expense"], ["reports", "landmark", "Withdrawal"], ["reports", "wallet", "Cash Top-Up"], ["settings", "coins", "Currency Conversion"]
    ]],
    ["Menu & Inventory", [
      ["products", "book-open", "Menu"], ["products", "toggle-left", "Menu Item On Off"], ["settings", "badge-percent", "Tax"], ["settings", "badge", "Discount"], ["pos", "calendar-check", "Table Reservation"],
      ["customers", "users", "Customers"], ["settings", "message-square-quote", "Feedback"], ["settings", "monitor", "LED Display"], ["products", "boxes", "Inventory"], ["settings", "monitor-dot", "Dual Screen"]
    ]],
    ["System Settings", [
      ["settings", "id-card", "Billing User Profile"], ["settings", "refresh-cw", "Manual Sync"], ["settings", "bell", "Alerts"], ["subscription", "rotate-ccw", "Service Renewal"], ["settings", "circle-help", "Help"],
      ["settings", "settings", "Settings"], ["settings", "languages", "Language Profiles"]
    ]]
  ];
  return `
    <section class="operations-head"><h2>Operations <span>Version: 122.0.1</span></h2><div><button class="active">Main Server</button><button>Master Billing Station</button></div></section>
    ${groups.map(([title, items]) => `
      <section class="ops-section">
        <h3>${title}</h3>
        <div class="ops-grid">${items.map(([view, iconName, label]) => `
          <button class="ops-card" data-view="${view}">${icon(iconName, 24)}<span>${label}</span></button>
        `).join("")}</div>
      </section>
    `).join("")}
  `;
}

function renderReports() {
  const report = reportDefinitions().find((item) => item.key === state.reportKey) || reportDefinitions()[0];
  return `
    <section class="report-layout">
      <aside class="report-menu">
        <h3>Reports</h3>
        ${reportDefinitions().map((item) => `<button class="${item.key === state.reportKey ? "active" : ""}" data-report="${item.key}">${item.label}</button>`).join("")}
      </aside>
      <section class="report-content">
        <div class="pc-page-head">
          <h2>${report.title}</h2>
          <button class="button secondary">${icon("printer", 17)} Print Configuration</button>
        </div>
        <div class="report-tools">
          <button class="button secondary">${icon("search", 17)} Search</button>
          <button class="button secondary">${icon("columns-3", 17)} Configure Column</button>
          <span></span>
          <button class="button secondary">Time Wise</button>
          <button class="button secondary">${icon("printer", 17)} Print</button>
          <button class="button secondary">${icon("file-spreadsheet", 17)} Export Excel</button>
        </div>
        <div class="report-card">${report.render()}</div>
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
    { key: "executive", label: "Executive Sales Summary", title: "Executive Sales Summary", render: renderExecutiveReport },
    { key: "employee", label: "Employee Summary", title: "Employee Report", render: renderEmployeeReport },
    { key: "group", label: "Group Summary", title: "Group Report", render: renderItemReport },
    { key: "variation", label: "Variation Summary", title: "Variation Report", render: () => renderNoRecord() },
    { key: "cover", label: "Cover Size Summary", title: "Cover Size Report", render: renderCoverReport },
    { key: "tip", label: "Tip Summary", title: "Tip Summary", render: renderTipReport },
    { key: "counter", label: "Counter Summary", title: "Counter Summary", render: renderCounterReport },
    { key: "locality", label: "Locality Wise Summary", title: "Locality Wise Summary", render: renderLocalityReport },
    { key: "captain", label: "Captain Wise Summary", title: "Captain Wise Summary", render: () => renderNoRecord() },
    { key: "settlement", label: "Settlement Summary", title: "Settlement Summary", render: renderSettlementReport },
    { key: "nc", label: "NC Item Summary", title: "NC Item Summary", render: renderNoRecord },
    { key: "assignee", label: "Assignee Wise Summary", title: "Assignee Wise Summary", render: renderNoRecord }
  ];
}

function reportRangeLabel(name) {
  return `<div class="report-range">${name} : From ${new Date().toLocaleDateString()} to ${new Date().toLocaleDateString()}</div>`;
}

function salesTotals() {
  const sales = state.data.sales;
  const myAmount = sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0);
  const tax = sales.reduce((sum, sale) => sum + Number(sale.tax || 0), 0);
  const discount = sales.reduce((sum, sale) => sum + Number(sale.discount || 0), 0);
  const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const items = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.qty || 0), 0), 0);
  return { sales, myAmount, tax, discount, total, items };
}

function renderCategoryReport() {
  const totals = salesTotals();
  const categories = new Map();
  state.data.products.forEach((product) => categories.set(product.category || "General", { orders: 0, items: 0, net: 0, tax: 0, total: 0 }));
  totals.sales.forEach((sale) => sale.items.forEach((item) => {
    const product = state.data.products.find((entry) => entry.id === item.id);
    const key = product?.category || "General";
    const row = categories.get(key) || { orders: 0, items: 0, net: 0, tax: 0, total: 0 };
    row.orders += 1;
    row.items += item.qty;
    row.net += item.qty * item.price;
    row.tax += (item.qty * item.price) * (state.data.settings.taxRate / 100);
    row.total = row.net + row.tax;
    categories.set(key, row);
  }));
  const rows = [...categories.entries()].filter(([, row]) => row.items > 0);
  return `${reportRangeLabel("Category Report")}<table class="report-table"><thead><tr><th>Category</th><th>Orders</th><th>Items</th><th>Net Amount (₹)</th><th>Total Discount (₹)</th><th>Total Tax (₹)</th><th>Total Sales (₹)</th><th>Percentage (%)</th></tr></thead><tbody>
    <tr class="total"><td>Total</td><td>${totals.sales.length}</td><td>${totals.items.toFixed(2)}</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.discount.toFixed(2)}</td><td>${totals.tax.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>-</td></tr>
    ${rows.map(([category, row]) => `<tr><td>${category}</td><td>${row.orders}</td><td>${row.items.toFixed(2)}</td><td>${row.net.toFixed(2)}</td><td>0.00</td><td>${row.tax.toFixed(2)}</td><td>${row.total.toFixed(2)}</td><td>${totals.total ? ((row.total / totals.total) * 100).toFixed(2) : "0.00"}</td></tr>`).join("")}
  </tbody></table>`;
}

function renderItemReport() {
  const totals = salesTotals();
  const rows = state.data.products.map((product) => {
    const sold = totals.sales.flatMap((sale) => sale.items).filter((item) => item.id === product.id);
    const qty = sold.reduce((sum, item) => sum + item.qty, 0);
    const total = sold.reduce((sum, item) => sum + item.qty * item.price, 0);
    return { product, qty, total };
  }).filter((row) => row.qty > 0);
  return `${reportRangeLabel("Item Report")}<table class="report-table"><thead><tr><th>Category</th><th>Item</th><th>Code</th><th>Qty.</th><th>Total (₹)</th></tr></thead><tbody>
    <tr class="total"><td>Total</td><td>-</td><td>-</td><td>${totals.items.toFixed(2)}</td><td>${totals.myAmount.toFixed(2)}</td></tr>
    ${rows.map(({ product, qty, total }) => `<tr><td>${product.category}</td><td>${product.name}</td><td>${product.sku || "-"}</td><td>${qty.toFixed(2)}</td><td>${total.toFixed(2)}</td></tr>`).join("")}
  </tbody></table>`;
}

function renderSalesReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Sales Report")}<table class="report-table"><thead><tr><th>Order No.</th><th>Date</th><th>My Amount (₹)</th><th>Discount (₹)</th><th>CGST (₹)</th><th>SGST (₹)</th><th>Total (₹)</th><th>Biller Name</th></tr></thead><tbody>
    <tr class="total"><td>Total</td><td>-</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.discount.toFixed(2)}</td><td>${(totals.tax / 2).toFixed(2)}</td><td>${(totals.tax / 2).toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>-</td></tr>
    ${totals.sales.map((sale) => `<tr><td>${sale.invoiceNo}</td><td>${new Date(sale.createdAt).toLocaleString()}</td><td>${sale.subtotal.toFixed(2)}</td><td>${sale.discount.toFixed(2)}</td><td>${(sale.tax / 2).toFixed(2)}</td><td>${(sale.tax / 2).toFixed(2)}</td><td>${sale.total.toFixed(2)}</td><td>cashier</td></tr>`).join("")}
  </tbody></table>`;
}

function renderOrderReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Order Summary Report")}<table class="report-table"><thead><tr><th>Order Status</th><th>My Amount (₹)</th><th>Total (₹)</th><th>Orders</th></tr></thead><tbody>
    <tr><td>Saved:</td><td>0.00</td><td>0.00</td><td>0</td></tr>
    <tr><td>Printed:</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>${totals.sales.length}</td></tr>
    <tr><td>Cancelled:</td><td>0.00</td><td>0.00</td><td>0</td></tr>
    <tr class="total"><td>Total:</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>${totals.sales.length}</td></tr>
  </tbody></table>`;
}

function renderExecutiveReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Executive Sales Report")}<table class="report-table two-col"><tbody>
    ${["Count", "Sub Total", "Discount", "CGST", "SGST", "Grand Total", "Net Sales"].map((label) => `<tr><td>${label} :</td><td>${label === "Count" ? totals.sales.length : label === "Sub Total" || label === "Net Sales" ? totals.myAmount.toFixed(2) : label === "CGST" || label === "SGST" ? (totals.tax / 2).toFixed(2) : label === "Grand Total" ? totals.total.toFixed(2) : "0.00"}</td></tr>`).join("")}
  </tbody></table>`;
}

function renderEmployeeReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Employee Report")}<table class="report-table"><thead><tr><th>Billing User</th><th>Payment Type</th><th>Total (₹)</th></tr></thead><tbody><tr class="total"><td>cashier</td><td>Cash</td><td>${totals.total.toFixed(2)}</td></tr></tbody></table>`;
}

function renderCoverReport() {
  return `${reportRangeLabel("Cover Size Report")}<table class="report-table"><thead><tr><th>Date</th><th>No. of Persons (Success Orders)</th></tr></thead><tbody><tr class="total"><td>Total</td><td>0</td></tr>${[0, 1, 2, 3, 4].map((offset) => `<tr><td>${new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)}</td><td>0</td></tr>`).join("")}</tbody></table>`;
}

function renderTipReport() {
  return `${reportRangeLabel("Tip Summary")}<table class="report-table"><thead><tr><th>Employee</th><th>Amount (₹)</th></tr></thead><tbody><tr><td>Other</td><td>0.00</td></tr>${allTables().slice(0, 12).map((table) => `<tr><td>${table.name}</td><td>0.00</td></tr>`).join("")}</tbody></table>`;
}

function renderCounterReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Counter Summary")}<table class="report-table"><thead><tr><th>Counter Name</th><th>Success Orders</th><th>Net Amount (₹)</th><th>Total Tax (₹)</th><th>Total Sales (₹)</th><th>Cash (₹)</th><th>Card (₹)</th><th>UPI (₹)</th></tr></thead><tbody><tr class="total"><td>Total</td><td>${totals.sales.length}</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.tax.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>0.00</td><td>0.00</td></tr><tr><td>Billing Station</td><td>${totals.sales.length}</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.tax.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>0.00</td><td>0.00</td></tr></tbody></table>`;
}

function renderLocalityReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Locality Wise Summary")}<table class="report-table"><thead><tr><th>Locality</th><th>Orders</th><th>Total (₹)</th></tr></thead><tbody><tr><td>All Areas</td><td>${totals.sales.length}</td><td>${totals.total.toFixed(2)}</td></tr></tbody></table>`;
}

function renderSettlementReport() {
  const totals = salesTotals();
  return `${reportRangeLabel("Settlement Summary")}<table class="report-table"><thead><tr><th>Counter Name</th><th>Billing User</th><th>No of orders</th><th>Net Sales (₹)</th><th>Total Sales (₹)</th><th>Cash (₹)</th><th>Card (₹)</th><th>Due Payment (₹)</th></tr></thead><tbody><tr class="total"><td>Total</td><td>-</td><td>${totals.sales.length}</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>0.00</td><td>0.00</td></tr><tr><td>c1</td><td>cashier</td><td>${totals.sales.length}</td><td>${totals.myAmount.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>${totals.total.toFixed(2)}</td><td>0.00</td><td>0.00</td></tr></tbody></table>`;
}

function renderNoRecord() {
  return `<div class="no-record">${icon("file-x", 92)}<span>There is no record available.</span></div>`;
}

function renderOutletSettings() {
  const groups = [
    ["Billing Screen", [
      ["monitor", "Display", "Customise what appears on the billing screen."],
      ["calculator", "Calculations", "Configure service charges and rounding rules."],
      ["life-buoy", "Linked Services", "Set how add-ons services work with your POS system."],
      ["printer", "Print", "Manage printing rules for Bill and KOT."],
      ["user-round", "Customer", "Configure phone validation and dues."]
    ]],
    ["Online/Advance Order", [["bell-ring", "Online/Advance Order Configuration", "Control auto-accept, timings, and cancellations."]]],
    ["System Setting", [
      ["scroll-text", "Billing System", "Set how your POS updates with the central system."],
      ["badge-percent", "Tax", "GST, CGST, SGST and inclusive tax setup."],
      ["languages", "Language Profiles", "Manage regional labels and print language."],
      ["id-card", "Billing User Profile", "Cashier, captain and manager access."]
    ]],
    ["Store Details", [["store", "Restaurant Profile", "Name, phone, GSTIN and address used on receipts."]]]
  ];
  return `
    <section class="pc-page-head"><h2>Outlet Settings</h2><button class="button secondary">${icon("search", 17)} Search</button></section>
    ${groups.map(([title, items]) => `
      <section class="settings-box">
        <h3>${title}</h3>
        <div class="settings-grid">${items.map(([iconName, title, text]) => `<button class="setting-card">${icon(iconName, 25)}<span><strong>${title}</strong><em>${text}</em></span>${icon("arrow-right", 21)}</button>`).join("")}</div>
      </section>
    `).join("")}
    <section class="panel outlet-form">
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
  document.querySelector("[data-save-print]")?.addEventListener("click", checkout);
  document.querySelector("#renew-subscription")?.addEventListener("click", renewSubscription);
  document.querySelector("#new-product")?.addEventListener("click", () => { state.modal = { type: "product", product: {} }; render(); });
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", () => {
    state.modal = { type: "product", product: state.data.products.find((product) => product.id === button.dataset.editProduct) };
    render();
  }));
  document.querySelector("#save-product")?.addEventListener("click", saveProduct);
  document.querySelector("#save-settings")?.addEventListener("click", saveSettings);
  document.querySelector("#new-customer")?.addEventListener("click", () => { state.modal = { type: "customer" }; render(); });
  document.querySelector("#save-customer")?.addEventListener("click", saveCustomer);
  document.querySelectorAll("[data-receipt]").forEach((button) => button.addEventListener("click", () => {
    state.modal = { type: "receipt", sale: state.data.sales.find((sale) => sale.id === button.dataset.receipt) };
    render();
  }));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => { state.modal = null; render(); }));
  document.querySelector("#print-receipt")?.addEventListener("click", () => window.print());
  document.querySelector("#signin")?.addEventListener("click", () => authAction("signin"));
  document.querySelector("#signup")?.addEventListener("click", () => authAction("signup"));
  document.querySelector("#google-signin")?.addEventListener("click", googleSignIn);
  document.querySelector("#demo-mode")?.addEventListener("click", () => {
    state.localSession = { email: "demo@pondypos.local", demo: true };
    localStorage.setItem("pondypos-session", JSON.stringify(state.localSession));
    render();
  });
  document.querySelector("#signout")?.addEventListener("click", async () => {
    if (state.user) await state.auth.signOut();
    state.localSession = null;
    localStorage.removeItem("pondypos-session");
    localStorage.removeItem(googleRedirectSessionKey);
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

async function authAction(action) {
  if (state.authBusy) return;
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  state.authError = "";
  if (!email || password.length < 6) {
    state.authError = "Enter an email and a password of at least 6 characters.";
    render();
    return;
  }
  if (state.firebaseConfigured && !state.cloudReady) {
    state.authError = "Firebase is still connecting. Please try again in a moment.";
    render();
    return;
  }
  state.authBusy = true;
  render();
  if (!state.firebaseConfigured) {
    localAuthAction(action, email, password);
    return;
  }
  const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = state.firebase.authMod;
  try {
    if (action === "signin") {
      const credential = await signInWithEmailAndPassword(state.auth, email, password);
      await finishSignedInUser(credential.user);
    } else {
      const credential = await createUserWithEmailAndPassword(state.auth, email, password);
      await finishSignedInUser(credential.user);
      await renewSubscription();
    }
  } catch (error) {
    state.authBusy = false;
    state.authError = friendlyAuthError(error);
    render();
  }
}

async function googleSignIn() {
  if (state.authBusy) return;
  state.authError = "";
  if (state.firebaseConfigured && !state.cloudReady) {
    state.authError = "Firebase is still connecting. Please try Google again in a moment.";
    render();
    return;
  }
  if (!state.firebaseConfigured) {
    state.authError = "Add Firebase config first, then enable Google sign-in in Firebase Authentication.";
    render();
    return;
  }
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
    email: user?.email || "firebase-user@pondypos.local",
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

function localAuthAction(action, email, password) {
  migrateStorageKey("countercloud-users", "pondypos-users");
  const users = JSON.parse(localStorage.getItem("pondypos-users") || "{}");
  if (action === "signup") {
    users[email] = { password, createdAt: new Date().toISOString() };
    localStorage.setItem("pondypos-users", JSON.stringify(users));
    state.data.subscription = annualSubscription();
    writeLocal();
  } else if (!users[email] || users[email].password !== password) {
    state.authError = "Account not found. Create an account first, or check the password.";
    render();
    return;
  }
  state.localSession = { email };
  localStorage.setItem("pondypos-session", JSON.stringify(state.localSession));
  state.authBusy = false;
  render();
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/admin-restricted-operation": "Email/password sign-up is disabled. In Firebase Authentication, enable Email/Password provider.",
    "auth/configuration-not-found": "Firebase Authentication is not set up yet. Open Firebase Authentication and enable your sign-in providers.",
    "auth/email-already-in-use": "This email already has an account. Use Sign in instead of Create account.",
    "auth/invalid-credential": "Wrong email or password. If this is a new account, click Create account first.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/internal-error": "Google login failed inside Firebase. I switched the app to redirect login; if this continues, enable Google provider and add localhost in Firebase authorized domains.",
    "auth/operation-not-allowed": "This login provider is disabled in Firebase Authentication. Enable Email/Password or Google provider.",
    "auth/popup-blocked": "The browser blocked the Google popup. Allow popups or try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase. Add localhost and your Vercel domain in Authentication settings.",
    "auth/user-not-found": "Account not found. Click Create account first.",
    "auth/wrong-password": "Wrong password. Please try again."
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
