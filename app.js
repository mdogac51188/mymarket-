console.log("✅ APP.JS IST GELADEN");

/* =========================
   MyMarket (localStorage) — FULL INTEGRATED (POS 15.1)
   - Admin Panel + Kategorien
   - Sell + Kategorien Auswahl
   - Listing + Cart (mehrere Artikel)
   - Checkout + Orders Flow
   - Offers, Favorites, Messages (Chat)
   - Edit Listing
   - Sellerprofil + Reviews
   ========================= */

const APP_VERSION = "2026-01-06-full-integrated-pos15_2_reservation_order + POS16.2_NOTIFYFIX";

const K = {
  VERSION: "mm_app_version",
  USERS: "mm_users",
  SESSION: "mm_session",
  LISTINGS: "mm_listings",
  CATEGORIES: "mm_categories",
  THEME: "mm_theme",
  ORDERS: "mm_orders",
  FAVS: "mm_favs",
  OFFERS: "mm_offers",
  CHATS: "mm_chats",
  CHAT_UNREAD: "mm_chat_unread",
  RESERVE_DECISIONS: "mm_reserve_decisions",
  REVIEWS: "mm_reviews",
  CART: "mm_cart", // [listingId,...]
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const qs = (name) => new URLSearchParams(location.search).get(name);

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}
function nowTs() { return Date.now(); }

function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return (v === null || v === undefined) ? fallback : v;
  } catch {
    return fallback;
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}



function linkifyEscapedHtml(escapedStr) {
  // escapedStr must already be HTML-escaped (e.g. via escapeHtml)
  let s = String(escapedStr ?? "");
  // preserve newlines for chat messages
  s = s.replace(/\n/g, "<br>");
  // linkify checkout links (relative)
  s = s.replace(/\b(checkout\.html\?order=[^\s<]+)\b/g, '<a href="$1" class="link">$1</a>');
  return s;
}


function moneyEUR(n) {
  const x = Number(n || 0);
  return x.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtTime(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("de-DE"); } catch { return "—"; }
}

function badgeHtml(status) {
  const s = String(status || "").toUpperCase();
  const cls =
    s === "ACTIVE" ? "badge ok" :
    s === "SOLD" ? "badge bad" :
    s === "RESERVED" ? "badge warn" :
    s === "PENDING_PAYMENT" ? "badge warn" :
    s === "PAID" ? "badge ok" :
    s === "SHIPPED" ? "badge warn" :
    s === "COMPLETED" ? "badge ok" :
    s === "CANCELED" ? "badge bad" : "badge";
  return `<span class="${cls}">${escapeHtml(s)}</span>`;
}

function svgPlaceholder(text) {
  const t = escapeHtml(text || "MyMarket");
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22345f"/>
      <stop offset="1" stop-color="#0f1a2f"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="50%" font-size="42" fill="#e7efff" font-family="Arial" text-anchor="middle" dominant-baseline="middle">${t}</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* =========================
   RESET (manuell)
   ========================= */
function hardResetAllData() {
  Object.values(K).forEach((key) => localStorage.removeItem(key));
  // legacy keys (falls vorhanden)
  localStorage.removeItem("mm_cart");
  localStorage.removeItem("mm_reviews");
}

window.mmResetAll = function () {
  hardResetAllData();
  save(K.VERSION, APP_VERSION);
  location.href = "index.html";
};

function maybeSetVersion() {
  // KEIN Auto-Reset mehr (damit deine Daten nicht ständig weg sind)
  const v = load(K.VERSION, null);
  if (v !== APP_VERSION) save(K.VERSION, APP_VERSION);
}

/* =========================
   THEME
   ========================= */
function themeInit() {
  const t = load(K.THEME, "dark");
  document.body.classList.toggle("light", t === "light");
  const btn = $("#themeToggle");
  if (btn) {
    btn.textContent = t === "light" ? "☀️ Light" : "🌙 Dark";
    btn.addEventListener("click", () => {
      const cur = document.body.classList.contains("light") ? "light" : "dark";
      const next = cur === "light" ? "dark" : "light";
      document.body.classList.toggle("light", next === "light");
      save(K.THEME, next);
      btn.textContent = next === "light" ? "☀️ Light" : "🌙 Dark";
    });
  }
}

/* =========================
   USERS / SESSION
   ========================= */
function users() { return load(K.USERS, []); }
function setUsers(list) { save(K.USERS, Array.isArray(list) ? list : []); }

function currentSession() { return load(K.SESSION, null); }
function setSession(s) { save(K.SESSION, s); }

function currentUser() {
  const s = currentSession();
  if (!s?.id) return null;
  return users().find(u => u.id === s.id) || null;
}
function getUserById(id) { return users().find(u => u.id === id) || null; }

function isAdmin(u) { return u?.role === "admin"; }
function canSell(u) { return u?.role === "seller" || u?.role === "admin"; }

/* =========================
   LISTINGS / ORDERS
   ========================= */
function listings() { return load(K.LISTINGS, []); }
function setListings(list) { save(K.LISTINGS, Array.isArray(list) ? list : []); }
function allListings() { return listings(); }
function getListing(id) { return listings().find(l => l.id === id) || null; }

function cleanupExpiredReservations() {
  const now = nowTs();
  const list = listings();
  let changed = false;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (String(l.status || "").toUpperCase() === "RESERVED" && l.reservedUntil && Number(l.reservedUntil) <= now) {
      list[i] = { ...l, status: "ACTIVE", reservedBy: null, reservedUntil: null };
      changed = true;
    }
  }
  if (changed) setListings(list);
}


function orders() { return load(K.ORDERS, []); }
function setOrders(list) { save(K.ORDERS, Array.isArray(list) ? list : []); }
function getOrder(id) { return orders().find(o => o.id === id) || null; }

/* =========================
   FAVORITES / OFFERS / CHATS
   ========================= */
function favs() { return load(K.FAVS, {}); }
function setFavs(map) { save(K.FAVS, (map && typeof map === "object") ? map : {}); }

function offers() { return load(K.OFFERS, []); }
function setOffers(list) { save(K.OFFERS, Array.isArray(list) ? list : []); }

function chats() { return load(K.CHATS, []); }
function setChats(list) { save(K.CHATS, Array.isArray(list) ? list : []); }

/* =========================
   CHAT UNREAD (Badges)
   ========================= */
function unreadMap() { return load(K.CHAT_UNREAD, {}); }
function setUnreadMap(map) { save(K.CHAT_UNREAD, (map && typeof map === "object") ? map : {}); }

function unreadCount(userId, chatId) {
  const m = unreadMap();
  const u = m?.[userId] || {};
  return Number(u?.[chatId] || 0);
}

function bumpUnread(userId, chatId, inc = 1) {
  if (!userId || !chatId) return;
  const m = unreadMap();
  const u = (m[userId] && typeof m[userId] === "object") ? m[userId] : {};
  const next = Math.max(0, Number(u[chatId] || 0) + Number(inc || 0));
  u[chatId] = next;
  m[userId] = u;
  setUnreadMap(m);
  updateChatUnreadUI();
}

function clearUnread(userId, chatId) {
  if (!userId || !chatId) return;
  const m = unreadMap();
  if (!m[userId] || typeof m[userId] !== "object") return;
  delete m[userId][chatId];
  setUnreadMap(m);
  updateChatUnreadUI();
}

function totalUnread(userId) {
  const m = unreadMap();
  const u = (m?.[userId] && typeof m[userId] === "object") ? m[userId] : {};
  return Object.values(u).reduce((s, n) => s + Number(n || 0), 0);
}

function findChat(userA, userB, listingId = null) {
  const a = String(userA), b = String(userB);
  const key = [a, b].sort().join("|") + (listingId ? `|${listingId}` : "");
  return chats().find(x => x.key === key) || null;
}

function addChatMessage(chatId, msg) {
  const list = chats();
  const idx = list.findIndex(x => x.id === chatId);
  if (idx < 0) return null;

  const cur = list[idx];
  const msgs = Array.isArray(cur.messages) ? cur.messages : [];
  const next = { ...cur, createdAt: nowTs(), messages: msgs.concat([msg]) };

  // move to top
  list.splice(idx, 1);
  list.unshift(next);
  setChats(list);
  return next;
}

function setButtonBadge(el, count) {
  if (!el) return;
  const c = Number(count || 0);
  let b = el.querySelector(".mini-badge");
  if (c <= 0) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement("span");
    b.className = "mini-badge";
    b.style.marginLeft = "6px";
    b.style.background = "#ff3b30";
    b.style.color = "#fff";
    b.style.borderRadius = "999px";
    b.style.padding = "1px 6px";
    b.style.fontSize = "12px";
    b.style.fontWeight = "900";
    b.style.display = "inline-block";
    b.style.lineHeight = "1.4";
    el.appendChild(b);
  }
  b.textContent = String(c);
}

function updateChatUnreadUI() {
  const u = currentUser();
  if (!u) return;

  const total = totalUnread(u.id);

  // 1) explicit counter elements (optional)
  const navCount = document.getElementById("navChatCount") || document.getElementById("navMessagesCount");
  if (navCount) navCount.textContent = String(total);

  // 2) add badge to any nav link to messages.html
  document.querySelectorAll('a[href="messages.html"], a[href^="messages.html?"], a[href*="/messages.html"]').forEach(a => {
    setButtonBadge(a, total);
  });

  // 3) listing page buttons
  const btnChat = document.getElementById("btnChat");
  if (btnChat) {
    const sellerId = new URLSearchParams(location.search).get("with") || null; // not perfect, but safe
    // We'll set specific badges in initListing/initMessages where we know chatId
    if (!sellerId) setButtonBadge(btnChat, 0);
  }
}


function ensureChat(userA, userB, listingId = null) {
  const a = String(userA), b = String(userB);
  const key = [a, b].sort().join("|") + (listingId ? `|${listingId}` : "");
  const list = chats();
  let c = list.find(x => x.key === key);
  if (c) return c;
  c = { id: uid("chat"), key, users: [a, b].sort(), listingId, createdAt: nowTs(), messages: [] };
  list.unshift(c);
  setChats(list);
  return c;
}


/* =========================
   POS16: Order Status -> Chat Notifications + Unread Badges
   - When buyer pays / cancels: notify seller in chat + unread badge
   - When seller ships: notify buyer + unread
   - When buyer confirms: notify seller + unread
   ========================= */

function postOrderChatEvent({ listingId, buyerId, sellerId, fromId, toId, text, type, orderId }) {
  try {
    if (!buyerId || !sellerId || !fromId || !toId) return null;
    const chat = ensureChat(String(buyerId), String(sellerId), listingId ? String(listingId) : null);
    const cur = chats().find(x => x.id === chat.id) || chat;
    const msgs = Array.isArray(cur.messages) ? cur.messages : [];
    const oid = orderId != null ? String(orderId) : null;

    // avoid duplicates
    const exists = msgs.some(m => m &&
      String(m.type || "") === String(type || "") &&
      String(m.orderId || "") === String(oid || "") &&
      String(m.text || "") === String(text || "")
    );

    if (!exists) {
      addChatMessage(chat.id, {
        id: uid("msg"),
        from: String(fromId),
        text: String(text || ""),
        at: nowTs(),
        type: String(type || "order_event"),
        orderId: oid
      });
    }

    bumpUnread(String(toId), chat.id, 1);
    return chat.id;
  } catch (e) {
    return null;
  }
}


/* =========================
   REVIEWS + SELLER PROFILE
   ========================= */
function reviews() { return load(K.REVIEWS, []); }
function setReviews(list) { save(K.REVIEWS, Array.isArray(list) ? list : []); }

function getReviewByOrder(orderId) { return reviews().find(r => r.orderId === orderId) || null; }

function addReview({ sellerId, buyerId, orderId, rating, text }) {
  const list = reviews();
  if (list.some(x => x.orderId === orderId)) return null;

  const cleanRating = Math.max(1, Math.min(5, Number(rating || 0)));
  const cleanText = String(text || "").trim().slice(0, 400);

  const r = {
    id: uid("rev"),
    sellerId, buyerId, orderId,
    rating: cleanRating,
    text: cleanText,
    createdAt: nowTs()
  };

  list.push(r);
  setReviews(list);

  // POS16.2: notify seller in chat about new review
  try {
    const ord = getOrder(orderId);
    const lId = ord?.listingId != null ? String(ord.listingId) : null;
    const bId = String(ord?.buyerId || buyerId || "");
    const sId = String(ord?.sellerId || sellerId || "");
    if (bId && sId) {
      const msgTxt =
        "⭐ Neue Bewertung erhalten: " + cleanRating + "/5" +
        (cleanText ? ("\n💬 " + cleanText) : "");
      postOrderChatEvent({
        listingId: lId,
        buyerId: bId,
        sellerId: sId,
        fromId: bId,
        toId: sId,
        text: msgTxt,
        type: "review_submitted",
        orderId: String(orderId)
      });
    }
  } catch {}

  return r;
}

function sellerReviewStats(sellerId) {
  const list = reviews().filter(r => r.sellerId === sellerId);
  const count = list.length;
  const avg = count ? (list.reduce((s, r) => s + Number(r.rating || 0), 0) / count) : 0;
  return { count, avg, list };
}
function stars(n) {
  const x = Math.max(0, Math.min(5, Math.round(n)));
  return "★★★★★☆☆☆☆☆".slice(5 - x, 10 - x);
}
function fmtStars(avg) {
  if (!avg) return "—";
  const r = Math.round(avg * 10) / 10;
  return `${r} / 5`;
}

/* =========================
   CATEGORIES (Admin)
   ========================= */
const DEFAULT_CATEGORIES = ["Sneaker","Jacken","Gaming","Deko","Elektronik","Sonstiges"];

function normalizeCat(s) { return String(s || "").trim().replace(/\s+/g, " "); }
function uniqCats(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach(x => {
    const n = normalizeCat(x);
    if (!n) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(n);
  });
  return out;
}
function getCategories() {
  let cats = load(K.CATEGORIES, []);
  if (!Array.isArray(cats)) cats = [];
  cats = uniqCats(cats);
  if (cats.length === 0) {
    cats = DEFAULT_CATEGORIES.slice();
    save(K.CATEGORIES, cats);
  }
  return cats;
}
function setCategories(list) {
  const cats = uniqCats(list);
  save(K.CATEGORIES, cats.length ? cats : DEFAULT_CATEGORIES.slice());
  return getCategories();
}
function addCategory(name) {
  const n = normalizeCat(name);
  if (!n) return getCategories();
  const cats = getCategories();
  cats.push(n);
  return setCategories(cats);
}
function removeCategory(name) {
  const n = normalizeCat(name).toLowerCase();
  return setCategories(getCategories().filter(c => c.toLowerCase() !== n));
}

/* =========================
   CART (POS 15)
   ========================= */
function cart() {
  const c = load(K.CART, []);
  return Array.isArray(c) ? c : [];
}
function setCart(list) { save(K.CART, Array.isArray(list) ? list : []); }
function cartCount() { return cart().length; }

function updateCartCountUI() {
  const el = $("#navCartCount");
  if (el) el.textContent = String(cartCount());
}

function addToCart(listingId) {
  const id = String(listingId || "");
  if (!id) return false;
  const l = getListing(id);
  if (!l) return false;

  const u = currentUser();
  if (!u) { location.href = `login.html?next=listing.html?id=${encodeURIComponent(id)}`; return false; }
  if (u.id === l.sellerId) { alert("Du bist der Verkäufer."); return false; }
  if (l.status !== "ACTIVE") { alert("Artikel ist nicht verfügbar."); return false; }

  const c = cart();
  if (c.includes(id)) { alert("Ist schon im Warenkorb ✅"); return true; }
  c.push(id);
  setCart(c);
  updateCartCountUI();
  alert("In den Warenkorb gelegt ✅");
  return true;
}
function removeFromCart(listingId) {
  const id = String(listingId || "");
  setCart(cart().filter(x => x !== id));
  updateCartCountUI();
  updateChatUnreadUI();
}
function clearCart() {
  setCart([]);
  updateCartCountUI();
  updateChatUnreadUI();
}

/* =========================
   NAV
   ========================= */
function navInit() {
  const u = currentUser();
  const navAdmin = $("#navAdmin");
  const navSell = $("#navSell");
  const navLogin = $("#navLogin");
  const navLogout = $("#navLogout");
  const navUser = $("#navUser");

  if (navAdmin) navAdmin.style.display = (u && isAdmin(u)) ? "" : "none";
  if (navSell) navSell.style.display = (u && canSell(u)) ? "" : "none";
  if (navLogout) navLogout.style.display = u ? "" : "none";
  if (navLogin) navLogin.style.display = u ? "none" : "";
  if (navUser) navUser.textContent = u ? u.name : "Gast";

  navLogout?.addEventListener("click", () => {
    setSession(null);
    location.href = "index.html";
  });

  updateCartCountUI();
  updateChatUnreadUI();
}

/* =========================
   SEED
   ========================= */
function ensureSeed() {
  const demoUsers = [
    { id:"u_admin",  name:"Admin",      email:"admin@test.de",  pass:"12345678", city:"Berlin",     role:"admin" },
    { id:"u_mehmet", name:"Mehmet",     email:"mehmet@test.de", pass:"12345678", city:"Hildesheim", role:"seller" },
    { id:"u_sena",   name:"Sena",       email:"sena@test.de",   pass:"12345678", city:"Hannover",   role:"seller" },
    { id:"u_buyer",  name:"Buyer Demo", email:"buyer@test.de",  pass:"12345678", city:"Hamburg",    role:"buyer" },
  ];

  let u = users();
  const byEmail = (e) => u.find(x => (x.email || "").toLowerCase() === String(e || "").toLowerCase());

  for (const du of demoUsers) {
    if (!byEmail(du.email)) {
      const idExists = u.some(x => x.id === du.id);
      u.push({ ...du, id: idExists ? uid("u") : du.id });
    }
  }
  setUsers(u);

  if (!Array.isArray(load(K.CATEGORIES, null)) || load(K.CATEGORIES, []).length === 0) {
    save(K.CATEGORIES, DEFAULT_CATEGORIES.slice());
  }

  if (!Array.isArray(load(K.LISTINGS, null))) save(K.LISTINGS, []);
  if (!Array.isArray(load(K.ORDERS, null))) save(K.ORDERS, []);
  if (typeof load(K.FAVS, null) !== "object") save(K.FAVS, {});
  if (!Array.isArray(load(K.OFFERS, null))) save(K.OFFERS, []);
  if (!Array.isArray(load(K.CHATS, null))) save(K.CHATS, []);
  if (!Array.isArray(load(K.REVIEWS, null))) save(K.REVIEWS, []);
  if (!Array.isArray(load(K.CART, null))) save(K.CART, []);

  let l = listings();
  if (!Array.isArray(l) || l.length === 0) {
    const mehmetId = byEmail("mehmet@test.de")?.id || "u_mehmet";
    const senaId   = byEmail("sena@test.de")?.id || "u_sena";
    l = [
      {
        id:"l1", title:"Nike Sneaker Air", category:"Sneaker", price:45, city:"Hildesheim",
        sellerId: mehmetId, description:"Sehr guter Zustand.", status:"ACTIVE",
        reservedBy:null, soldTo:null, images:[svgPlaceholder("Nike Sneaker Air")], createdAt: nowTs()-86400000
      },
      {
        id:"l2", title:"Winterjacke Schwarz", category:"Jacken", price:25, city:"Hannover",
        sellerId: senaId, description:"Warm und bequem.", status:"ACTIVE",
        reservedBy:null, soldTo:null, images:[svgPlaceholder("Winterjacke")], createdAt: nowTs()-54000000
      },
      {
        id:"l3", title:"PS5 Controller", category:"Gaming", price:39, city:"Braunschweig",
        sellerId: mehmetId, description:"Funktioniert einwandfrei.", status:"ACTIVE",
        reservedBy:null, soldTo:null, images:[svgPlaceholder("PS5 Controller")], createdAt: nowTs()-33000000
      },
    ];
    save(K.LISTINGS, l);
  }
}

/* =========================
   LISTING CREATE/EDIT HELPERS
   ========================= */
function createListing({ sellerId, title, price, category, description, city, images }) {
  const l = {
    id: uid("l"),
    sellerId,
    title: String(title || "").trim(),
    price: Number(price || 0),
    category: String(category || "").trim(),
    description: String(description || "").trim(),
    city: String(city || "").trim(),
    status: "ACTIVE",
    reservedBy: null,
    soldTo: null,
    images: Array.isArray(images) && images.length ? images : [svgPlaceholder(title || "Artikel")],
    createdAt: nowTs()
  };
  const list = listings();
  list.unshift(l);
  setListings(list);
  return l;
}

/* =========================
   ORDERS HELPERS
   ========================= */
function updateOrderById(orderId, patch) {
  const list = orders();
  const idx = list.findIndex(x => x.id === orderId);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  setOrders(list);
  return list[idx];
}

function createOrderForListing(listingId, buyerId) {
  const fresh = getListing(listingId);
  if (!fresh || fresh.status !== "ACTIVE") return null;

  const ord = {
    id: uid("ord"),
    listingId: fresh.id,
    buyerId,
    sellerId: fresh.sellerId,
    total: Number(fresh.price || 0),
    status: "PENDING_PAYMENT",
    createdAt: nowTs(),
    paidAt: null,
    shippedAt: null,
    completedAt: null,
    canceledAt: null
  };

  const olist = orders();
  olist.unshift(ord);
  setOrders(olist);

  const llist = listings();
  const idx = llist.findIndex(x => x.id === fresh.id);
  if (idx >= 0) {
    llist[idx] = { ...llist[idx], status: "RESERVED", reservedBy: buyerId };
    setListings(llist);
  }

  return ord;
}

function markListingSold(listingId, buyerId) {
  const lcur = getListing(listingId);
  if (!lcur) return false;
  const llist = listings();
  const li = llist.findIndex(x => x.id === lcur.id);
  if (li < 0) return false;
  llist[li] = { ...llist[li], status: "SOLD", soldTo: buyerId };
  setListings(llist);
  return true;
}

function restoreListingToActiveIfReservedBy(listingId, buyerId) {
  const lcur = getListing(listingId);
  if (!lcur) return false;
  if (lcur.status !== "RESERVED") return false;
  if (lcur.reservedBy !== buyerId) return false;

  const llist = listings();
  const li = llist.findIndex(x => x.id === lcur.id);
  if (li < 0) return false;
  llist[li] = { ...llist[li], status: "ACTIVE", reservedBy: null };
  setListings(llist);
  return true;
}

/* =========================
   PAGES: INDEX
   ========================= */
async function initIndex() {
  const wrap = $("#grid");
  const q = $("#q");
  const cat = $("#cat");
  const sort = $("#sort");
  const empty = $("#emptyHint");

  const cats = getCategories();
  if (cat) {
    cat.innerHTML =
      `<option value="">Alle Kategorien</option>` +
      cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function render() {
    let list = allListings().filter(l => l.status === "ACTIVE");

    const text = String(q?.value || "").toLowerCase().trim();
    const cval = String(cat?.value || "").trim();
    const srt = String(sort?.value || "new");

    if (text) {
      list = list.filter(l =>
        (l.title || "").toLowerCase().includes(text) ||
        (l.description || "").toLowerCase().includes(text)
      );
    }
    if (cval) list = list.filter(l => String(l.category || "") === cval);

    if (srt === "price_asc") list.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (srt === "price_desc") list.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (srt === "new") list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (wrap) wrap.innerHTML = "";
    if (empty) empty.style.display = list.length ? "none" : "";

    list.forEach(l => {
      const imgHtml = l.images?.[0]
        ? `<img src="${l.images[0]}" alt="">`
        : `<div class="fallback">${escapeHtml(l.category)}</div>`;
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="img">${imgHtml}</div>
        <div class="item-body">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div style="font-weight:900;flex:1;line-height:1.2">${escapeHtml(l.title)}</div>
            <div>${badgeHtml(l.status)}</div>
          </div>
          <div class="price">${moneyEUR(l.price)}</div>
          <div class="meta">
            <span>${escapeHtml(l.city || "")}</span>
            <span>${escapeHtml(fmtTime(l.createdAt))}</span>
          </div>
          <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
            <a class="btn btn-primary" href="listing.html?id=${encodeURIComponent(l.id)}">Ansehen</a>
          </div>
        </div>
      `;
      wrap?.appendChild(el);
    });
  }

  q?.addEventListener("input", render);
  cat?.addEventListener("change", render);
  sort?.addEventListener("change", render);
  render();
}

/* =========================
   PAGES: LOGIN
   ========================= */
function initLogin() {
  const loginForm = $("#loginForm");
  const regForm = $("#registerForm");
  const msg = $("#loginMsg");
  const rmsg = $("#registerMsg");
  const next = qs("next") || "index.html";

  loginForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = ($("#lemail")?.value || "").trim();
    const pass = ($("#lpass")?.value || "");
    const u = users().find(x => (x.email || "").toLowerCase() === email.toLowerCase() && x.pass === pass);
    if (!u) {
      if (msg) msg.textContent = "Falsche Login-Daten.";
      return;
    }
    setSession({ id: u.id, at: nowTs() });
    location.href = next;
  });

  regForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = ($("#rname")?.value || "").trim();
    const city = ($("#rcity")?.value || "").trim();
    const email = ($("#remail")?.value || "").trim();
    const pass = ($("#rpass")?.value || "");
    const role = ($("#rrole")?.value || "buyer");

    if (!name || !email || !pass) {
      if (rmsg) rmsg.textContent = "Bitte Name, Email und Passwort ausfüllen.";
      return;
    }
    if (users().some(x => (x.email || "").toLowerCase() === email.toLowerCase())) {
      if (rmsg) rmsg.textContent = "Email existiert schon.";
      return;
    }
    if (role === "admin") {
      if (rmsg) rmsg.textContent = "Admin kann nicht registriert werden.";
      return;
    }

    const u = { id: uid("u"), name, city, email, pass, role };
    const list = users();
    list.push(u);
    setUsers(list);
    setSession({ id: u.id, at: nowTs() });
    location.href = next;
  });
}

/* =========================
   PAGES: SELL
   ========================= */
async function initSell() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=sell.html"; return; }
  if (!canSell(u)) { alert("Nur Seller/Admin."); location.href = "profile.html"; return; }

  $("#sellerInfo") && ($("#sellerInfo").textContent = `${u.name} · ${u.city || ""}`);

  const cats = getCategories();
  const sel = $("#category");
  if (sel) sel.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

  const imgInput = $("#images");
  const preview = $("#imgPreview");

  function renderPreview() {
    if (!preview || !imgInput) return;
    preview.innerHTML = "";
    const files = Array.from(imgInput.files || []);
    if (!files.length) {
      preview.innerHTML = `<div class="notice">Keine Bilder ausgewählt (Demo zeigt Placeholder).</div>`;
      return;
    }
    for (const f of files.slice(0, 4)) {
      const url = URL.createObjectURL(f);
      const div = document.createElement("div");
      div.className = "thumb";
      div.innerHTML = `<img src="${url}" alt="">`;
      preview.appendChild(div);
    }
  }

  imgInput?.addEventListener("change", renderPreview);
  renderPreview();

  $("#sellForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = ($("#title")?.value || "");
    const category = ($("#category")?.value || "");
    const price = ($("#price")?.value || "");
    const city = ($("#city")?.value || u.city || "");
    const description = ($("#desc")?.value || "");

    const files = Array.from(imgInput?.files || []);
    let images = [];
    if (files.length) images = files.slice(0, 4).map(f => URL.createObjectURL(f));

    const l = createListing({ sellerId: u.id, title, category, price, city, description, images });
    alert("Inserat erstellt ✅");
    location.href = `listing.html?id=${encodeURIComponent(l.id)}`;
  });
}

/* =========================
   PAGES: LISTING
   ========================= */
async function initListing() {
  const id = qs("id");
  const l = getListing(id);
  if (!l) { alert("Artikel nicht gefunden"); location.href = "index.html"; return; }

  const seller = getUserById(l.sellerId);

  $("#lTitle") && ($("#lTitle").textContent = l.title);
  $("#lMeta") && ($("#lMeta").textContent = `${l.category} · ${l.city || ""} · ${fmtTime(l.createdAt)}`);
  $("#lBadge") && ($("#lBadge").innerHTML = badgeHtml(l.status));
  $("#lPrice") && ($("#lPrice").textContent = moneyEUR(l.price));
  $("#lDesc") && ($("#lDesc").textContent = l.description || "");

  const img = $("#lImage");
  if (img) img.innerHTML = l.images?.[0] ? `<img src="${l.images[0]}" alt="">` : `<div class="fallback">${escapeHtml(l.category)}</div>`;

  const sName = seller?.name || "User";
  $("#lSeller") && ($("#lSeller").innerHTML = `<a href="sellerprofil.html?id=${encodeURIComponent(l.sellerId)}" style="text-decoration:underline;">${escapeHtml(sName)}</a>`);

  const actions = $("#lActions");
  if (actions) {
    actions.innerHTML = `
      <button class="btn" id="btnFav" type="button">⭐ Favorit</button>
      <button class="btn" id="btnCart" type="button">🛒 In den Warenkorb</button>
      <button class="btn" id="btnOffer" type="button">💸 Angebot</button>
      <button class="btn" id="btnChat" type="button">💬 Chat</button>
      <a class="btn" href="cart.html">Zum Warenkorb</a>
      <button class="btn" id="btnReserve" type="button">⏳ Reservierung anfragen</button>
  <div id="reserveInfo" style="font-size:12px;opacity:.9;margin-top:6px;"></div>
    `;

    $("#btnCart")?.addEventListener("click", () => addToCart(l.id));

    $("#btnFav")?.addEventListener("click", () => {
      const u = currentUser();
      if (!u) { location.href = `login.html?next=listing.html?id=${encodeURIComponent(l.id)}`; return; }
      const map = favs();
      const arr = Array.isArray(map[u.id]) ? map[u.id] : [];
      if (arr.includes(l.id)) {
        map[u.id] = arr.filter(x => x !== l.id);
        alert("Aus Favoriten entfernt.");
      } else {
        map[u.id] = arr.concat([l.id]);
        alert("Zu Favoriten hinzugefügt ✅");
      }
      setFavs(map);
    });

    $("#btnOffer")?.addEventListener("click", () => {
      const u = currentUser();
      if (!u) { location.href = `login.html?next=listing.html?id=${encodeURIComponent(l.id)}`; return; }
      if (u.id === l.sellerId) return alert("Du bist der Verkäufer.");
      const amount = prompt("Dein Angebot in €:", String(l.price || "0"));
      if (amount === null) return;
      const val = Number(String(amount).replace(",", "."));
      if (!val || val <= 0) return alert("Ungültiger Betrag.");

      const off = { id: uid("off"), listingId: l.id, sellerId: l.sellerId, buyerId: u.id, amount: val, status: "OPEN", createdAt: nowTs(), createdBy: u.id, parentOfferId: null };
      const list = offers();
      list.unshift(off);
      setOffers(list);

      // ✅ Angebot auch als Chat-Nachricht speichern (damit es im Chat erscheint)
      const c = ensureChat(u.id, l.sellerId, l.id);
      const msg = { from: u.id, text: `💸 Angebot: ${moneyEUR(val)}\nArtikel: ${l.title}`, at: nowTs(), type: "offer", offerId: off.id, amount: val };
      const saved = addChatMessage(c.id, msg);

      // ✅ Unread Badge beim Empfänger erhöhen (Seller)
      bumpUnread(l.sellerId, saved?.id || c.id, 1);

      alert("Angebot gesendet ✅");
      // Du kannst hier optional direkt in den Chat springen:
      // location.href = `messages.html?with=${encodeURIComponent(l.sellerId)}&listing=${encodeURIComponent(l.id)}`;
      location.href = "offers.html";
    });

    $("#btnChat")?.addEventListener("click", () => {
      const u = currentUser();
      if (!u) { location.href = `login.html?next=listing.html?id=${encodeURIComponent(l.id)}`; return; }
      if (u.id === l.sellerId) return alert("Du bist der Verkäufer.");
      location.href = `messages.html?with=${encodeURIComponent(l.sellerId)}&listing=${encodeURIComponent(l.id)}`;
    });

    // ✅ Badge am Chat-Button, wenn in diesem Chat neue Nachrichten sind
    try {
      const u2 = currentUser();
      if (u2 && u2.id !== l.sellerId) {
        const existing = findChat(u2.id, l.sellerId, l.id);
        const cnt = existing ? unreadCount(u2.id, existing.id) : 0;
        setButtonBadge(document.getElementById("btnChat"), cnt);
      }
    } catch {}
    $("#btnReserve")?.addEventListener("click", () => {
      const u = currentUser();
      if (!u) { location.href = `login.html?next=listing.html?id=${encodeURIComponent(l.id)}`; return; }
      if (u.id === l.sellerId) return alert("Du bist der Verkäufer.");
      if (l.status !== "ACTIVE") return alert("Artikel ist nicht verfügbar.");

      const now = nowTs();

      // Schreibt eine Reservierungsanfrage als Chat-Nachricht (wie normales Chat-Format)
      function writeReserveChat(toUserId) {
        const c = ensureChat(u.id, toUserId, l.id);
        const list = chats();
        const idx = list.findIndex(x => x.id === c.id);
        if (idx < 0) return;

        const msgs = Array.isArray(list[idx].messages) ? list[idx].messages : [];
        const last = msgs[msgs.length - 1];

        // Spam-Schutz: nicht doppelt in 60s
        if (last && last.from === u.id && String(last.text || "").startsWith("📌 Reservierungsanfrage") && (now - (last.at || 0) < 60000)) {
          return;
        }

        const msg = {
          from: u.id,
          text: `📌 Reservierungsanfrage\nBitte reservieren (z.B. 24h) – Artikel: ${l.title}`,
          at: now
        };

        list[idx] = { ...list[idx], createdAt: now, messages: msgs.concat([msg]) };
        setChats(list);
      }

      // 1) an Seller schicken
      writeReserveChat(l.sellerId);

      // 2) auch an Admin(s) kopieren, damit Admin es in messages.html sieht
      try {
        const adminIds = users().filter(x => x?.role === "admin").map(x => x.id).filter(id => id && id !== l.sellerId);
        adminIds.forEach(aid => writeReserveChat(aid));
      } catch {}

      $("#reserveInfo") && ($("#reserveInfo").textContent = "Reservierung als Chat-Nachricht gesendet ✅");

      const btn = $("#btnReserve");
      if (btn) {
        btn.textContent = "Angefragt ✅";
        btn.disabled = true;
        btn.style.opacity = "0.7";
        btn.style.pointerEvents = "none";
      }

      // Direkt Chat (Seller) öffnen
      location.href = `messages.html?with=${encodeURIComponent(l.sellerId)}&listing=${encodeURIComponent(l.id)}`;
    });
  }

  const btnBuy = $("#btnBuy");
  if (btnBuy) {
    btnBuy.disabled = (l.status !== "ACTIVE");
    btnBuy.textContent = (l.status !== "ACTIVE") ? "Nicht verfügbar" : "Kaufen";

    btnBuy.addEventListener("click", () => {
      const u = currentUser();
      if (!u) { location.href = `login.html?next=listing.html?id=${encodeURIComponent(l.id)}`; return; }
      if (u.id === l.sellerId) return alert("Du bist der Verkäufer.");

      const ord = createOrderForListing(l.id, u.id);
      if (!ord) return alert("Artikel nicht verfügbar.");

      location.href = `checkout.html?order=${encodeURIComponent(ord.id)}`;
    });
  }
}

/* =========================
   PAGES: CART
   ========================= */
async function initCart() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=cart.html"; return; }

  const listEl = $("#cartList");
  const emptyEl = $("#cartEmpty");
  const totalEl = $("#cartTotal");

  function render() {
    const ids = cart();
    const items = ids.map(id => getListing(id)).filter(Boolean);

    if (emptyEl) emptyEl.style.display = items.length ? "none" : "";
    if (!listEl) return;

    if (!items.length) {
      listEl.innerHTML = "";
      if (totalEl) totalEl.textContent = moneyEUR(0);
      return;
    }

    const total = items.reduce((s, l) => s + Number(l.price || 0), 0);
    if (totalEl) totalEl.textContent = moneyEUR(total);

    listEl.innerHTML = items.map(l => {
      const imgHtml = l.images?.[0] ? `<img src="${l.images[0]}" alt="">` : `<div class="fallback">${escapeHtml(l.category)}</div>`;
      const statusHint = l.status !== "ACTIVE" ? `<div class="notice">⚠️ Nicht aktiv: ${escapeHtml(l.status)}</div>` : "";
      return `
        <div class="item" style="margin:10px 0;">
          <div class="img">${imgHtml}</div>
          <div class="item-body">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
              <div style="font-weight:900;flex:1;line-height:1.2">
                <a href="listing.html?id=${encodeURIComponent(l.id)}" style="text-decoration:underline;">${escapeHtml(l.title)}</a>
              </div>
              <div>${badgeHtml(l.status)}</div>
            </div>
            <div class="price">${moneyEUR(l.price)}</div>
            <div class="meta"><span>${escapeHtml(l.city||"")}</span><span>${escapeHtml(fmtTime(l.createdAt))}</span></div>
            ${statusHint}
            <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
              <button class="btn btn-danger" data-remove="${escapeHtml(l.id)}" type="button">Entfernen</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    $$("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-remove");
        removeFromCart(id);
        render();
      });
    });
  }

  $("#btnClearCart")?.addEventListener("click", () => {
    if (!confirm("Warenkorb wirklich leeren?")) return;
    clearCart();
    render();
  });

  $("#btnCheckoutCart")?.addEventListener("click", () => {
    const ids = cart();
    if (!ids.length) return alert("Warenkorb ist leer.");

    const created = [];
    const remaining = [];

    for (const id of ids) {
      const l = getListing(id);
      if (!l || l.status !== "ACTIVE") { remaining.push(id); continue; }
      if (l.sellerId === u.id) { remaining.push(id); continue; }

      const ord = createOrderForListing(id, u.id);
      if (ord) created.push(ord);
      else remaining.push(id);
    }

    setCart(remaining);
    updateCartCountUI();

    if (!created.length) {
      alert("Keine Orders erstellt (Artikel nicht aktiv / nicht verfügbar).");
      render();
      return;
    }

    alert(`Checkout ✅\nOrders erstellt: ${created.length}\nDu wirst zur ersten Checkout-Seite geleitet.`);
    location.href = `checkout.html?order=${encodeURIComponent(created[0].id)}`;
  });

  render();
}

/* =========================
   PAGES: CHECKOUT
   ========================= */
async function initCheckout() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=checkout.html"; return; }

  const orderId = qs("order");
  const o = getOrder(orderId);
  if (!o) { alert("Order nicht gefunden"); location.href = "profile.html"; return; }
  if (o.buyerId !== u.id && !isAdmin(u)) { alert("Kein Zugriff"); location.href = "profile.html"; return; }

  const l = getListing(o.listingId);

  $("#coInfo") && ($("#coInfo").textContent = `Order: ${o.id} · ${fmtTime(o.createdAt)}`);
  $("#coTitle") && ($("#coTitle").textContent = l ? l.title : "Listing gelöscht");
  $("#coTotal") && ($("#coTotal").textContent = moneyEUR(o.total));
  $("#coStatus") && ($("#coStatus").textContent = o.status);

  const img = $("#coImg");
  if (img) img.innerHTML = l?.images?.[0] ? `<img src="${l.images[0]}" alt="">` : `<div class="fallback">${escapeHtml(l?.category || "")}</div>`;

  $("#btnPay")?.addEventListener("click", () => {
    const fresh = getOrder(o.id);
    if (!fresh || fresh.status !== "PENDING_PAYMENT") return alert("Schon bezahlt/storniert.");

    updateOrderById(fresh.id, { status: "PAID", paidAt: nowTs() });
    markListingSold(fresh.listingId, fresh.buyerId);

    // POS16: notify seller in chat
    postOrderChatEvent({
      listingId: fresh.listingId,
      buyerId: fresh.buyerId,
      sellerId: fresh.sellerId,
      fromId: fresh.buyerId,
      toId: fresh.sellerId,
      text: "✅ Zahlung erhalten. Bestellung ist bezahlt.",
      type: "order_paid",
      orderId: fresh.id
    });

    alert("Bezahlt ✅");
    location.href = `order.html?id=${encodeURIComponent(fresh.id)}`;
  });

  $("#btnCancelOrder")?.addEventListener("click", () => {
    const fresh = getOrder(o.id);
    if (!fresh) return;
    if (!confirm("Order stornieren?")) return;

    updateOrderById(fresh.id, { status: "CANCELED", canceledAt: nowTs() });
    restoreListingToActiveIfReservedBy(fresh.listingId, fresh.buyerId);

    // POS16: notify seller in chat
    postOrderChatEvent({
      listingId: fresh.listingId,
      buyerId: fresh.buyerId,
      sellerId: fresh.sellerId,
      fromId: fresh.buyerId,
      toId: fresh.sellerId,
      text: "❌ Bestellung wurde storniert.",
      type: "order_canceled",
      orderId: fresh.id
    });

    alert("Storniert ✅");
    location.href = "profile.html";
  });
}

/* =========================
   PAGES: ORDER
   ========================= */
async function initOrder() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=order.html"; return; }

  const id = qs("id");
  const o = getOrder(id);
  if (!o) { alert("Order nicht gefunden"); location.href = "profile.html"; return; }

  const isBuyer = o.buyerId === u.id;
  const isSeller = o.sellerId === u.id;
  if (!isBuyer && !isSeller && !isAdmin(u)) { alert("Kein Zugriff"); location.href = "profile.html"; return; }

  const l = getListing(o.listingId);
  const seller = getUserById(o.sellerId);
  const buyer = getUserById(o.buyerId);

  $("#oInfo") && ($("#oInfo").textContent = `Order: ${o.id} · ${fmtTime(o.createdAt)}`);
  $("#oTitle") && ($("#oTitle").textContent = l ? l.title : "Listing gelöscht");
  $("#oTotal") && ($("#oTotal").textContent = moneyEUR(o.total));
  $("#oStatus") && ($("#oStatus").textContent = o.status);
  $("#oSeller") && ($("#oSeller").textContent = seller ? `${seller.name}${seller.city ? ` (${seller.city})` : ""}` : "?");
  $("#oBuyer") && ($("#oBuyer").textContent = buyer ? `${buyer.name}${buyer.city ? ` (${buyer.city})` : ""}` : "?");

  const img = $("#oImg");
  if (img) img.innerHTML = l?.images?.[0] ? `<img src="${l.images[0]}" alt="">` : `<div class="fallback">${escapeHtml(l?.category || "")}</div>`;

  const link = $("#oListingLink");
  if (link) link.href = l ? `listing.html?id=${encodeURIComponent(l.id)}` : "index.html";

  const timeline = $("#orderTimeline");
  if (timeline) {
    const steps = [
      ["CREATED", o.createdAt],
      ["PAID", o.paidAt],
      ["SHIPPED", o.shippedAt],
      ["COMPLETED", o.completedAt],
      ["CANCELED", o.canceledAt]
    ].filter(x => x[1]);
    timeline.textContent = steps.length
      ? ("Timeline: " + steps.map(([s, t]) => `${s} (${fmtTime(t)})`).join(" · "))
      : "Timeline: —";
  }

  const actions = $("#orderActions");
  if (actions) actions.innerHTML = "";

  function addBtn(label, cls, onClick) {
    if (!actions) return;
    const b = document.createElement("button");
    b.className = cls || "btn";
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    actions.appendChild(b);
  }

  if (isBuyer && o.status === "PENDING_PAYMENT") {
    addBtn("Checkout öffnen", "btn btn-primary", () => location.href = `checkout.html?order=${encodeURIComponent(o.id)}`);
  }
  if (isSeller && o.status === "PAID") {
    addBtn("Als versendet markieren", "btn btn-primary", () => {
      const fresh = getOrder(o.id);
      if (!fresh || fresh.status !== "PAID") return alert("Status geändert.");
      updateOrderById(fresh.id, { status: "SHIPPED", shippedAt: nowTs() });

      // POS16: notify buyer in chat
      postOrderChatEvent({
        listingId: fresh.listingId,
        buyerId: fresh.buyerId,
        sellerId: fresh.sellerId,
        fromId: fresh.sellerId,
        toId: fresh.buyerId,
        text: "📦 Versandt! Der Verkäufer hat die Bestellung als versendet markiert.",
        type: "order_shipped",
        orderId: fresh.id
      });

      alert("Als versendet markiert ✅");
      location.reload();
    });
  }
  if (isBuyer && o.status === "SHIPPED") {
    addBtn("Erhalten bestätigen", "btn btn-primary", () => {
      const fresh = getOrder(o.id);
      if (!fresh || fresh.status !== "SHIPPED") return alert("Status geändert.");
      updateOrderById(fresh.id, { status: "COMPLETED", completedAt: nowTs() });

      // POS16: notify seller in chat
      postOrderChatEvent({
        listingId: fresh.listingId,
        buyerId: fresh.buyerId,
        sellerId: fresh.sellerId,
        fromId: fresh.buyerId,
        toId: fresh.sellerId,
        text: "✅ Erhalten bestätigt. Die Bestellung ist abgeschlossen.",
        type: "order_completed",
        orderId: fresh.id
      });

      alert("Order abgeschlossen ✅");
      location.reload();
    });
  }

  addBtn("💬 Chat öffnen", "btn", () => {
    const otherId = isBuyer ? o.sellerId : o.buyerId;
    location.href = `messages.html?with=${encodeURIComponent(otherId)}&listing=${encodeURIComponent(o.listingId)}`;
  });

  addBtn("👤 Verkäuferprofil", "btn", () => {
    location.href = `sellerprofil.html?id=${encodeURIComponent(o.sellerId)}`;
  });

  if (isBuyer && o.status === "COMPLETED") {
    const existing = getReviewByOrder(o.id);
    if (existing) {
      addBtn(`Bewertung: ${existing.rating}/5`, "btn", () => alert("Du hast schon bewertet ✅"));
    } else {
      addBtn("⭐ Verkäufer bewerten", "btn btn-primary", () => {
        const rRaw = prompt("Bewertung 1-5:", "5");
        if (rRaw === null) return;
        const rating = Number(String(rRaw).trim());
        if (!rating || rating < 1 || rating > 5) return alert("Bitte 1 bis 5 eingeben.");
        const txt = prompt("Kommentar (optional):", "") ?? "";
        const saved = addReview({ sellerId: o.sellerId, buyerId: o.buyerId, orderId: o.id, rating, text: txt });
        if (!saved) return alert("Schon bewertet.");
        alert("Bewertung gespeichert ✅");
        location.reload();
      });
    }
  }
}

/* =========================
   PAGES: PROFILE
   ========================= */
async function initProfile() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=profile.html"; return; }

  $("#pName") && ($("#pName").textContent = u.name);
  $("#pEmail") && ($("#pEmail").textContent = u.email);
  $("#pCity") && ($("#pCity").textContent = u.city || "—");
  $("#pRole") && ($("#pRole").textContent = u.role);

  $("#btnReset")?.addEventListener("click", () => {
    if (!confirm("Alle Daten neu erstellen? (setzt alles zurück)")) return;
    window.mmResetAll();
  });

  const myL = allListings().filter(l => l.sellerId === u.id);
  const wrapL = $("#myListings");
  if (wrapL) {
    wrapL.innerHTML = myL.length ? "" : `<div class="notice">Keine Inserate.</div>`;
    myL.forEach(l => {
      const imgHtml = l.images?.[0] ? `<img src="${l.images[0]}" alt="">` : `<div class="fallback">${escapeHtml(l.category)}</div>`;
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="img">${imgHtml}</div>
        <div class="item-body">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div style="font-weight:900;flex:1;line-height:1.2">${escapeHtml(l.title)}</div>
            <div>${badgeHtml(l.status)}</div>
          </div>
          <div class="price">${moneyEUR(l.price)}</div>
          <div class="meta"><span>${escapeHtml(l.city || "")}</span><span>${escapeHtml(fmtTime(l.createdAt))}</span></div>
          <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
            <a class="btn btn-primary" href="listing.html?id=${encodeURIComponent(l.id)}">Ansehen</a>
            <a class="btn" href="Edit.html?id=${encodeURIComponent(l.id)}">Bearbeiten</a>
          </div>
        </div>
      `;
      wrapL.appendChild(el);
    });
  }

  const myO = orders().filter(o => o.buyerId === u.id || o.sellerId === u.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const wrapO = $("#myOrders");
  if (wrapO) {
    wrapO.innerHTML = myO.length ? "" : `<div class="notice">Keine Orders.</div>`;
    myO.forEach(o => {
      const l = getListing(o.listingId);
      const el = document.createElement("div");
      el.className = "card";
      el.style.padding = "12px";
      el.style.margin = "10px 0";
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <b>${escapeHtml(l?.title || "Listing gelöscht")}</b>
          ${badgeHtml(o.status)}
        </div>
        <div class="small-muted" style="margin-top:6px;">${escapeHtml(fmtTime(o.createdAt))}</div>
        <div class="price" style="margin-top:6px;">${moneyEUR(o.total)}</div>
        <div style="margin-top:10px;">
          <a class="btn btn-primary" href="order.html?id=${encodeURIComponent(o.id)}">Öffnen</a>
        </div>
      `;
      wrapO.appendChild(el);
    });
  }

  const myS = orders().filter(o => o.sellerId === u.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const wrapS = $("#mySales");
  if (wrapS) {
    wrapS.innerHTML = myS.length ? "" : `<div class="notice">Keine Verkäufe.</div>`;
    myS.forEach(o => {
      const l = getListing(o.listingId);
      const el = document.createElement("div");
      el.className = "card";
      el.style.padding = "12px";
      el.style.margin = "10px 0";
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <b>${escapeHtml(l?.title || "Listing gelöscht")}</b>
          ${badgeHtml(o.status)}
        </div>
        <div class="small-muted" style="margin-top:6px;">${escapeHtml(fmtTime(o.createdAt))}</div>
        <div style="margin-top:10px;">
          <a class="btn" href="order.html?id=${encodeURIComponent(o.id)}">Öffnen</a>
        </div>
      `;
      wrapS.appendChild(el);
    });
  }
}

/* =========================
   PAGES: ADMIN  (inkl. Kategorien FIX)
   ========================= */
async function initAdmin() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=admin.html"; return; }
  if (!isAdmin(u)) { alert("Admin only"); location.href = "index.html"; return; }

  const tabUsers = $("#tabUsers");
  const tabListings = $("#tabListings");
  const tabOrders = $("#tabOrders");
  const tabCats = $("#tabCats");
  const box = $("#adminBox");

  // FALLBACK: Wenn IDs fehlen, stoppen wir mit klarer Meldung
  if (!box || !tabUsers || !tabListings || !tabOrders || !tabCats) {
    alert("admin.html IDs fehlen: tabUsers/tabListings/tabOrders/tabCats/adminBox");
    return;
  }

  let mode = "users";
  const setActive = () => {
    tabUsers.classList.toggle("active", mode === "users");
    tabListings.classList.toggle("active", mode === "listings");
    tabOrders.classList.toggle("active", mode === "orders");
    tabCats.classList.toggle("active", mode === "cats");
  };

  const renderUsers = () => {
    const list = users();
    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Name</th><th>Email</th><th>City</th><th>Role</th></tr></thead>
          <tbody>
            ${list.map(x => `
              <tr>
                <td>${escapeHtml(x.name)}</td>
                <td>${escapeHtml(x.email)}</td>
                <td>${escapeHtml(x.city||"")}</td>
                <td>${escapeHtml(x.role)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="notice">Demo Admin: <b>admin@test.de</b> / <b>12345678</b></div>
    `;
  };

  const renderListings = () => {
    const list = allListings();
    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Title</th><th>Seller</th><th>Preis</th><th>Status</th><th>Open</th></tr></thead>
          <tbody>
            ${list.map(l => {
              const s = getUserById(l.sellerId);
              return `
                <tr>
                  <td>${escapeHtml(l.title)}</td>
                  <td>${escapeHtml(s?.name||"?")}</td>
                  <td>${moneyEUR(l.price)}</td>
                  <td>${badgeHtml(l.status)}</td>
                  <td><a class="btn" href="listing.html?id=${encodeURIComponent(l.id)}">Open</a></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderOrders = () => {
    const list = orders();
    box.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Order</th><th>Listing</th><th>Buyer</th><th>Seller</th><th>Status</th><th>Open</th></tr></thead>
          <tbody>
            ${list.map(o => {
              const l = getListing(o.listingId);
              const b = getUserById(o.buyerId);
              const s = getUserById(o.sellerId);
              return `
                <tr>
                  <td>${escapeHtml(o.id)}</td>
                  <td>${escapeHtml(l?.title||"deleted")}</td>
                  <td>${escapeHtml(b?.name||"?")}</td>
                  <td>${escapeHtml(s?.name||"?")}</td>
                  <td>${badgeHtml(o.status)}</td>
                  <td><a class="btn" href="order.html?id=${encodeURIComponent(o.id)}">Open</a></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderCats = () => {
    const cats = getCategories();
    box.innerHTML = `
      <div class="row" style="grid-template-columns: 1.2fr 1fr; gap: 14px; align-items:start;">
        <div class="card" style="padding:14px;">
          <div style="font-weight:900;">Neue Kategorie</div>
          <div class="small-muted" style="margin-top:6px;">Admin verwaltet Kategorien. Seller sieht sie bei „Verkaufen“.</div>
          <div class="hr"></div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <input class="input" id="newCatName" placeholder="z.B. Uhren" />
            <button class="btn btn-primary" id="btnAddCat" type="button">Hinzufügen</button>
            <button class="btn" id="btnResetCats" type="button">Reset Defaults</button>
          </div>
          <div class="small-muted" style="margin-top:8px;">Tipp: Nach dem Hinzufügen → sell.html öffnen und prüfen.</div>
        </div>
        <div class="card" style="padding:14px;">
          <div style="font-weight:900;">Aktuelle Kategorien (${cats.length})</div>
          <div class="hr"></div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${cats.map(c => `
              <span class="badge" style="display:flex; gap:10px; align-items:center;">
                <span>${escapeHtml(c)}</span>
                <button class="btn btn-danger" style="padding:6px 10px;" data-delcat="${escapeHtml(c)}" type="button">X</button>
              </span>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    $("#btnAddCat")?.addEventListener("click", () => {
      const name = $("#newCatName")?.value || "";
      addCategory(name);
      alert("Kategorie hinzugefügt ✅");
      renderCats();
    });

    $("#btnResetCats")?.addEventListener("click", () => {
      if (!confirm("Kategorien auf Defaults zurücksetzen?")) return;
      setCategories(DEFAULT_CATEGORIES.slice());
      alert("Zurückgesetzt ✅");
      renderCats();
    });

    $$("[data-delcat]").forEach(btn => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-delcat");
        if (!confirm(`Kategorie löschen: ${name}?`)) return;
        removeCategory(name);
        renderCats();
      });
    });
  };

  function render() {
    setActive();
    if (mode === "users") renderUsers();
    if (mode === "listings") renderListings();
    if (mode === "orders") renderOrders();
    if (mode === "cats") renderCats();
  }

  tabUsers.addEventListener("click", () => { mode = "users"; render(); });
  tabListings.addEventListener("click", () => { mode = "listings"; render(); });
  tabOrders.addEventListener("click", () => { mode = "orders"; render(); });
  tabCats.addEventListener("click", () => { mode = "cats"; render(); });

  render();
}

/* =========================
   PAGES: FAVORITES
   ========================= */
async function initFavorites() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=favorites.html"; return; }

  const ids = (favs()?.[u.id] || []);
  const list = allListings().filter(l => ids.includes(l.id));
  const grid = $("#favGrid");
  const notice = $("#favNotice");
  if (!grid) return;

  if (!list.length) {
    if (notice) notice.style.display = "";
    grid.innerHTML = "";
    return;
  }
  if (notice) notice.style.display = "none";

  grid.innerHTML = list.map(l => {
    const imgHtml = l.images?.[0] ? `<img src="${l.images[0]}" alt="">` : `<div class="fallback">${escapeHtml(l.category)}</div>`;
    return `
      <div class="item">
        <div class="img">${imgHtml}</div>
        <div class="item-body">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
            <div style="font-weight:900;flex:1;line-height:1.2">${escapeHtml(l.title)}</div>
            <div>${badgeHtml(l.status)}</div>
          </div>
          <div class="price">${moneyEUR(l.price)}</div>
          <div class="meta"><span>${escapeHtml(l.city||"")}</span><span>${escapeHtml(fmtTime(l.createdAt))}</span></div>
          <div style="margin-top:10px;">
            <a class="btn btn-primary" href="listing.html?id=${encodeURIComponent(l.id)}">Ansehen</a>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* =========================
   PAGES: OFFERS
   ========================= */
async function initOffers() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=offers.html"; return; }

  const tabIn = $("#tabIncoming");
  const tabOut = $("#tabOutgoing");
  const table = $("#offerTable");
  if (!table || !tabIn || !tabOut) return;

  let mode = "incoming";
  const setActive = () => {
    tabIn.classList.toggle("active", mode === "incoming");
    tabOut.classList.toggle("active", mode === "outgoing");
  };

  function render() {
    setActive();
    const list = offers().slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const filtered = mode === "incoming"
      ? list.filter(o => o.sellerId === u.id)
      : list.filter(o => o.buyerId === u.id);

    if (!filtered.length) {
      table.innerHTML = `<div class="notice">Keine Angebote.</div>`;
      return;
    }

    table.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Listing</th><th>Betrag</th><th>Status</th><th>Von</th><th>Aktion</th></tr>
          </thead>
          <tbody>
            ${filtered.map(o => {
              const l = getListing(o.listingId);
              const buyer = getUserById(o.buyerId);
              const seller = getUserById(o.sellerId);
              const who = mode === "incoming" ? (buyer?.name||"?") : (seller?.name||"?");
              const canDecide = (mode === "incoming" && o.status === "OPEN");
              return `
                <tr>
                  <td>${escapeHtml(l?.title||"deleted")}</td>
                  <td>${moneyEUR(o.amount)}</td>
                  <td>${escapeHtml(o.status)}</td>
                  <td>${escapeHtml(who)}</td>
                  <td>
                    <a class="btn" href="listing.html?id=${encodeURIComponent(o.listingId)}">Open</a>
                    ${canDecide ? `<button class="btn btn-primary" data-acc="${escapeHtml(o.id)}" type="button">Annehmen</button>` : ""}
                    ${canDecide ? `<button class="btn btn-danger" data-rej="${escapeHtml(o.id)}" type="button">Ablehnen</button>` : ""}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    $$("[data-acc]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-acc");
        const list = offers();
        const idx = list.findIndex(x => x.id === id);
        if (idx < 0) return;
        list[idx] = { ...list[idx], status: "ACCEPTED", decidedAt: nowTs() };
        setOffers(list);

        // ✅ auch im Chat anzeigen + Buyer Unread erhöhen
        try {
          const o = list[idx];
          const c = ensureChat(o.buyerId, o.sellerId, o.listingId);
          const lcur = getListing(o.listingId);
          const txt = `✅ Angebot angenommen: ${moneyEUR(o.amount)}${lcur ? `\nArtikel: ${lcur.title}` : ""}`;
          const saved = addChatMessage(c.id, { from: u.id, text: txt, at: nowTs(), type:"offer_decision", offerId:o.id, status:"ACCEPTED" });
          bumpUnread(o.buyerId, saved?.id || c.id, 1);
        } catch {}

        alert("Angebot angenommen ✅");
        render();
      });
    });

    $$("[data-rej]").forEach(b => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-rej");
        const list = offers();
        const idx = list.findIndex(x => x.id === id);
        if (idx < 0) return;
        list[idx] = { ...list[idx], status: "REJECTED", decidedAt: nowTs() };
        setOffers(list);

        // ✅ auch im Chat anzeigen + Buyer Unread erhöhen
        try {
          const o = list[idx];
          const c = ensureChat(o.buyerId, o.sellerId, o.listingId);
          const lcur = getListing(o.listingId);
          const txt = `❌ Angebot abgelehnt: ${moneyEUR(o.amount)}${lcur ? `\nArtikel: ${lcur.title}` : ""}`;
          const saved = addChatMessage(c.id, { from: u.id, text: txt, at: nowTs(), type:"offer_decision", offerId:o.id, status:"REJECTED" });
          bumpUnread(o.buyerId, saved?.id || c.id, 1);
        } catch {}

        alert("Angebot abgelehnt ✅");
        render();
      });
    });
  }

  tabIn.addEventListener("click", () => { mode = "incoming"; render(); });
  tabOut.addEventListener("click", () => { mode = "outgoing"; render(); });

  render();
}

/* =========================
   PAGES: MESSAGES
   ========================= */
async function initMessages() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=messages.html"; return; }

  const withId = qs("with");
  const listingId = qs("listing");

  const listBox = $("#chatList");
  const head = $("#chatHead");
  const msgsBox = $("#chatMsgs");
  const inp = $("#chatText");
  const sendBtn = $("#chatSend");

  const list = chats().filter(c => c.users.includes(u.id)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  if (listBox) {
    listBox.innerHTML = list.length ? "" : `<div class="notice">Keine Chats.</div>`;
    list.forEach(c => {
      const otherId = c.users.find(x => x !== u.id);
      const other = getUserById(otherId);
      const l = c.listingId ? getListing(c.listingId) : null;
      const last = c.messages?.[c.messages.length - 1];
      const el = document.createElement("div");
      el.className = "chat-item";
      const uc = unreadCount(u.id, c.id);
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <div style="font-weight:900;">${escapeHtml(other?.name || "?")}</div>
          ${uc ? `<span class="badge" style="background:#ff3b30;color:#fff;">${uc}</span>` : ""}
        </div>
        <div class="small-muted">${escapeHtml(l?.title || "")}</div>
        <div class="small-muted">${escapeHtml(last?.text || "")}</div>
      `;
      el.addEventListener("click", () => {
        location.href = `messages.html?with=${encodeURIComponent(otherId)}${c.listingId ? `&listing=${encodeURIComponent(c.listingId)}` : ""}`;
      });
      listBox.appendChild(el);
    });
  }

  if (!withId) {
    if (head) head.textContent = "Chat auswählen";
    if (msgsBox) msgsBox.innerHTML = `<div class="notice">Wähle links einen Chat aus oder starte über ein Listing.</div>`;
    return;
  }

  const c = ensureChat(u.id, withId, listingId || null);
  // ✅ Chat geöffnet => Unread für mich löschen
  clearUnread(u.id, c.id);
  const other = getUserById(withId);
  const l = c.listingId ? getListing(c.listingId) : null;

  if (head) head.textContent = `${other?.name || "Chat"}${l ? ` · ${l.title}` : ""}`;

  function renderChat() {
    const freshList = chats();
    let fresh = freshList.find(x => x.id === c.id) || c;

    // ✅ Retro-Fix: Wenn Offer ACCEPTED + orderId existiert, aber im Chat kein Checkout-Link steht → automatisch nachtragen
    try {
      const withId = (fresh.users || []).find(id => String(id) !== String(u.id));
      const rel = offers().find(o =>
        String(o.listingId) === String(fresh.listingId) &&
        String(o.buyerId) === String(u.id) &&
        String(o.sellerId) === String(withId) &&
        String(o.status) === "ACCEPTED" &&
        o.orderId
      );

      if (rel) {
        const msgs = fresh.messages || [];
        const has = msgs.some(mm => (mm.type === "order_created" && String(mm.orderId) === String(rel.orderId)) ||
                                   (String(mm.text || "").includes(`checkout.html?order=${rel.orderId}`)));
        if (!has) {
          const patched = addChatMessage(fresh.id, {
            id: uid("msg"),
            from: rel.sellerId,
            text: `🧾 Zahlung verfügbar. Klicke unten auf „Jetzt bezahlen“.`,
            at: nowTs(),
            type: "order_created",
            orderId: rel.orderId,
            offerId: rel.id
          });
          if (patched) fresh = patched;
        }
      }
    } catch {}

    if (msgsBox) {
      const dec = load(K.RESERVE_DECISIONS, {});
      const seenPayOrders = new Set();
      msgsBox.innerHTML = (fresh.messages || []).map((m, i) => {
        const mine = m.from === u.id;
        const txt = String(m.text || "");
        const isReserveReq = txt.startsWith("📌 Reservierungsanfrage");
        const key = `${fresh.id}|${m.at}`;
        const d = dec[key] || null;

        const canAct = isReserveReq && !mine && l && (u.role === "admin" || u.id === l.sellerId);

        const isReservedNow = !!(d && d.status === "accepted" && !d.liftedAt && l && String(l.status || "").toUpperCase() === "RESERVED" && String(l.reservedBy || "") === String(d.buyerId || msg?.from || ""));
        const isLifted = !!(d && d.status === "accepted" && d.liftedAt);


        let actionHtml = canAct
          ? (d && d.status === "accepted")
            ? `
              <div class="small-muted" style="margin-top:6px;">✅ Angenommen · bis ${escapeHtml(fmtTime(d.until))}</div>
              ${isLifted ? `<div class="small-muted" style="margin-top:6px;">⏹ Aufgehoben · ${escapeHtml(fmtTime(d.liftedAt))}</div>` : ""}
              ${isReservedNow ? `
                <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <button class="btn" data-res-act="lift" data-res-at="${escapeHtml(String(m.at))}" style="padding:6px 10px;">Reservierung aufheben</button>
                </div>
              ` : ""}
            `
            : (d && d.status === "rejected")
              ? `<div class="small-muted" style="margin-top:6px;">❌ Abgelehnt</div>`
              : `
                <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <span class="small-muted">Std:</span>
                  <input id="resHours_${escapeHtml(String(m.at))}" type="number" min="0.25" step="0.25" value="24"
                    style="width:100px;padding:6px 8px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);" />
                  <button class="btn" data-res-act="accept" data-res-at="${escapeHtml(String(m.at))}" style="padding:6px 10px;">Annehmen</button>
                  <button class="btn" data-res-act="reject" data-res-at="${escapeHtml(String(m.at))}" style="padding:6px 10px;">Ablehnen</button>
                </div>
              `
          : "";
        
// ✅ Offer Actions (Buyer/Seller in Chat) + Gegenangebot/Ändern/Zurückziehen (POS20)
try {
  const isOfferMsg = (m && (m.type === "offer" || String(m.text || "").startsWith("💸 Angebot") || String(m.text || "").startsWith("🔁 Gegenangebot") || String(m.text || "").startsWith("✏️ Angebot geändert")));
  if (isOfferMsg && m.offerId) {
    const off = (offers() || []).find(o => String(o.id) === String(m.offerId));
    if (off && u) {
      const st = String(off.status || "");
      const buyerId = String(off.buyerId || "");
      const sellerId = String(off.sellerId || (l ? l.sellerId : ""));
      const createdBy = (off.createdBy != null) ? String(off.createdBy) : String(off.from || buyerId);
      const receiverId = (createdBy === buyerId) ? sellerId : buyerId;

      const isAdminHere = (u.role === "admin");
      const isSender = String(u.id) === createdBy;
      const isReceiver = String(u.id) === receiverId;

      if (st === "OPEN") {
        // Receiver can accept/decline and counter
        if (isReceiver || isAdminHere) {
          actionHtml += `
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="btn" data-off-act="accept" data-off-id="${escapeHtml(String(off.id))}" style="padding:6px 10px;">Annehmen</button>
              <button class="btn" data-off-act="reject" data-off-id="${escapeHtml(String(off.id))}" style="padding:6px 10px;">Ablehnen</button>
              <button class="btn" data-off-act="counter" data-off-id="${escapeHtml(String(off.id))}" style="padding:6px 10px;">Gegenangebot</button>
            </div>
          `;
        }
        // Sender can change/withdraw
        if (isSender || isAdminHere) {
          actionHtml += `
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <button class="btn" data-off-act="change" data-off-id="${escapeHtml(String(off.id))}" style="padding:6px 10px;">Angebot ändern</button>
              <button class="btn" data-off-act="withdraw" data-off-id="${escapeHtml(String(off.id))}" style="padding:6px 10px;">Zurückziehen</button>
            </div>
          `;
        }
      } else if (st === "ACCEPTED") {
        actionHtml += `<div class="small-muted" style="margin-top:6px;">✅ Angebot angenommen</div>`;
      } else if (st === "DECLINED") {
        actionHtml += `<div class="small-muted" style="margin-top:6px;">❌ Angebot abgelehnt</div>`;
      } else if (st === "WITHDRAWN") {
        actionHtml += `<div class="small-muted" style="margin-top:6px;">🗑️ Angebot zurückgezogen</div>`;
      } else if (st === "COUNTERED") {
        actionHtml += `<div class="small-muted" style="margin-top:6px;">🔁 Gegenangebot gesendet</div>`;
      } else if (st === "UPDATED") {
        actionHtml += `<div class="small-muted" style="margin-top:6px;">✏️ Angebot geändert</div>`;
      }
    }
  }
} catch {}

                const orderId = (m && m.orderId != null) ? String(m.orderId) : null;

                // ✅ Pay button only ONCE per order (prevents duplicate "Jetzt bezahlen")
                let payHtml = "";
                const isBuyerView = !!(u && orderId && ((l && String(u.id) !== String(l.sellerId)) || (!l && String(m.from) !== String(u.id))));

                if (isBuyerView) {
                  if (!seenPayOrders.has(orderId)) {
                    seenPayOrders.add(orderId);
                    payHtml = `<div style="margin-top:8px;">
                       <a class="btn" href="checkout.html?order=${encodeURIComponent(orderId)}" style="padding:6px 10px; display:inline-block;">Jetzt bezahlen</a>
                     </div>`;
                  }
                }

                // Hide redundant payment-info messages once the pay button already exists
                const isPayInfoMsg = !!(orderId && (String(m.type || "") === "order_created" || String(txt).includes("Zahlung verfügbar")));
                if (isPayInfoMsg && orderId && seenPayOrders.has(orderId) && payHtml === "") {
                  return "";
                }


        return `
          <div class="msg ${mine ? "mine" : ""}">
            <div class="small-muted">${escapeHtml(mine ? "du" : (other?.name || ""))} · ${escapeHtml(fmtTime(m.at))}</div>
            <div>${linkifyEscapedHtml(escapeHtml(m.text))}</div>
            ${actionHtml}${payHtml}
          </div>
        `;
      }).join("");
      msgsBox.scrollTop = msgsBox.scrollHeight;

      // Bind actions (re-render safe)
      msgsBox.querySelectorAll("[data-res-act]").forEach(btn => {
        btn.addEventListener("click", () => {
          const act = btn.getAttribute("data-res-act");
          const at = btn.getAttribute("data-res-at");
          if (!act || !at) return;

          const freshList2 = chats();
          const chat2 = freshList2.find(x => x.id === c.id) || c;
          const msg = (chat2.messages || []).find(x => String(x.at) === String(at));
          if (!msg) return;

          const lcur = chat2.listingId ? getListing(chat2.listingId) : null;
          if (!lcur) { alert("Listing nicht gefunden."); return; }
          if (!(u.role === "admin" || u.id === lcur.sellerId)) { alert("Keine Berechtigung."); return; }

          const decisions = load(K.RESERVE_DECISIONS, {});
          const dkey = `${chat2.id}|${msg.at}`;
          if (act !== "lift" && decisions[dkey] && decisions[dkey].status) return; // schon entschieden

          const buyerId = String(msg.from);

          if (act === "accept") {
            if (String(lcur.status || "").toUpperCase() !== "ACTIVE") { alert("Artikel ist nicht verfügbar."); return; }
            const inpEl = document.getElementById(`resHours_${msg.at}`);
            const hours = Math.max(0.25, Number(inpEl?.value || 24));
            const until = nowTs() + hours * 60 * 60 * 1000;

            // ✅ Order erstellen (PENDING_PAYMENT), damit Buyer direkt bezahlen kann
            let orderId = null;
            try {
              const existing = orders().find(o =>
                String(o.listingId) === String(lcur.id) &&
                String(o.buyerId) === String(buyerId) &&
                (o.status === "PENDING_PAYMENT" || o.status === "PAID" || o.status === "SHIPPED" || o.status === "COMPLETED")
              );
              if (existing) {
                orderId = existing.id;
              } else {
                const ord = {
                  id: uid("ord"),
                  listingId: lcur.id,
                  buyerId,
                  sellerId: lcur.sellerId,
                  total: Number(lcur.price || 0),
                  status: "PENDING_PAYMENT",
                  createdAt: nowTs(),
                  paidAt: null,
                  shippedAt: null,
                  completedAt: null,
                  canceledAt: null,
                  source: "RESERVATION",
                  reservedUntil: until
                };
                const olist = orders();
                olist.unshift(ord);
                setOrders(olist);
                orderId = ord.id;
              }
            } catch {}

            // Listing reservieren
            const llist = listings();
            const li = llist.findIndex(x => x.id === lcur.id);
            if (li >= 0) {
              llist[li] = { ...llist[li], status: "RESERVED", reservedBy: buyerId, reservedUntil: until };
              setListings(llist);
            }

            decisions[dkey] = { status: "accepted", until, hours, buyerId, by: u.id, decidedAt: nowTs(), orderId };
            save(K.RESERVE_DECISIONS, decisions);

            // Chat Antwort
            const list = chats();
            const idx = list.findIndex(x => x.id === chat2.id);
            if (idx >= 0) {
              const untilTxt = new Date(until).toLocaleString("de-DE");
              const orderTxt = orderId ? `
🧾 Zahlung verfügbar. (Button unten)` : "";
              const txt = `✅ Reservierung angenommen (${hours} Std) bis ${untilTxt}${orderTxt}`;
              const reply = { from: u.id, text: txt, at: nowTs(), type: "reservation_accept", orderId };
              list[idx] = { ...list[idx], createdAt: nowTs(), messages: (list[idx].messages || []).concat([reply]) };
              setChats(list);
              bumpUnread(buyerId, chat2.id, 1);
            }

            renderChat();
            return;
          }

          if (act === "lift") {
            // Reservierung aufheben (nur wenn vorher angenommen)
            const decisions2 = load(K.RESERVE_DECISIONS, {});
            const cur = decisions2[dkey] || null;
            if (!cur || cur.status !== "accepted") { alert("Keine angenommene Reservierung gefunden."); return; }
            if (cur.liftedAt) { alert("Reservierung wurde schon aufgehoben."); return; }

            // Listing zurück auf ACTIVE setzen
            const llist = listings();
            const li = llist.findIndex(x => x.id === lcur.id);
            if (li >= 0) {
              llist[li] = { ...llist[li], status: "ACTIVE", reservedBy: null, reservedUntil: null };
              setListings(llist);
            }

            // ✅ ggf. offene Order (PENDING_PAYMENT) aus Reservierung stornieren
            try {
              const olist = orders();
              const oi = olist.findIndex(o =>
                String(o.listingId) === String(lcur.id) &&
                String(o.buyerId) === String(buyerId) &&
                String(o.source || "") === "RESERVATION" &&
                o.status === "PENDING_PAYMENT"
              );
              if (oi >= 0) {
                olist[oi] = { ...olist[oi], status: "CANCELED", canceledAt: nowTs(), canceledReason: "RESERVATION_LIFTED" };
                setOrders(olist);
              }
            } catch {}

            // Entscheidung markieren
            decisions2[dkey] = { ...cur, liftedAt: nowTs(), liftedBy: u.id };
            save(K.RESERVE_DECISIONS, decisions2);

            // Chat Antwort
            const list = chats();
            const idx = list.findIndex(x => x.id === chat2.id);
            if (idx >= 0) {
              const txt = `⏹ Reservierung aufgehoben`;
              const reply = { from: u.id, text: txt, at: nowTs(), type: "reservation_lift" };
              list[idx] = { ...list[idx], createdAt: nowTs(), messages: (list[idx].messages || []).concat([reply]) };
              setChats(list);
              bumpUnread(buyerId, chat2.id, 1);
            }

            renderChat();
            return;
          }

          if (act === "reject") {
            decisions[dkey] = { status: "rejected", buyerId, by: u.id, decidedAt: nowTs() };
            save(K.RESERVE_DECISIONS, decisions);

            const list = chats();
            const idx = list.findIndex(x => x.id === chat2.id);
            if (idx >= 0) {
              const reply = { from: u.id, text: "❌ Reservierung abgelehnt.", at: nowTs() };
              list[idx] = { ...list[idx], createdAt: nowTs(), messages: (list[idx].messages || []).concat([reply]) };
              setChats(list);
              bumpUnread(buyerId, chat2.id, 1);
            }

            renderChat();
          }
        });

      // ✅ Bind offer actions (accept/decline) inside chat
      msgsBox.querySelectorAll("[data-off-act]").forEach(btn => {
        btn.addEventListener("click", () => {
          const act = btn.getAttribute("data-off-act");
          const offerId = btn.getAttribute("data-off-id");
          if (!offerId) return;

          const list = offers();
          const idx = list.findIndex(x => String(x.id) === String(offerId));
          if (idx < 0) return;

          const off = list[idx];
          if (String(off.status) !== "OPEN") return;

          if (act === "reject") {
            list[idx] = { ...off, status: "DECLINED", decidedAt: nowTs(), decidedBy: u.id };
            setOffers(list);

            // Chat Nachricht an Buyer
            const txt = `❌ Angebot abgelehnt.`;
            const saved = addChatMessage(fresh.id, { from: u.id, text: txt, at: nowTs(), type:"offer_decision", offerId: off.id, status:"DECLINED" });
            bumpUnread(off.buyerId, saved?.id || fresh.id, 1);
            renderChat();
            return;
          }

          if (act === "accept") {
            // Order erstellen (für Buyer Checkout)
            const ord = createOrderForListing(off.listingId, off.buyerId);
            const orderId = ord?.id || null;

            list[idx] = { ...off, status: "ACCEPTED", decidedAt: nowTs(), decidedBy: u.id, orderId: orderId || off.orderId || null };
            setOffers(list);

            const txt = `✅ Angebot angenommen. Du kannst jetzt bezahlen.`;
            const saved = addChatMessage(fresh.id, { from: u.id, text: txt, at: nowTs(), type:"offer_decision", offerId: off.id, status:"ACCEPTED", orderId: orderId || off.orderId || null });
            bumpUnread(off.buyerId, saved?.id || fresh.id, 1);

            renderChat();
            return;
          }
        });
      });
      });
    }
  }

  function send() {
    const txt = (inp?.value || "").trim();
    if (!txt) return;

    const msg = { from: u.id, text: txt, at: nowTs() };
    const saved = addChatMessage(c.id, msg);

    // ✅ Unread beim Empfänger erhöhen
    bumpUnread(withId, saved?.id || c.id, 1);

    if (inp) inp.value = "";
    renderChat();
  }

  sendBtn?.addEventListener("click", send);
  inp?.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  renderChat();
  updateChatUnreadUI();
}

/* =========================
   PAGES: EDIT
   ========================= */
async function initEdit() {
  const u = currentUser();
  if (!u) { location.href = "login.html?next=Edit.html"; return; }
  if (!canSell(u)) { alert("Nur Seller/Admin."); location.href = "profile.html"; return; }

  const id = qs("id");
  const l = getListing(id);
  if (!l) { alert("Listing nicht gefunden"); location.href = "profile.html"; return; }
  if (!isAdmin(u) && l.sellerId !== u.id) { alert("Kein Zugriff"); location.href = "profile.html"; return; }

  $("#eTitle") && ($("#eTitle").value = l.title || "");
  $("#ePrice") && ($("#ePrice").value = l.price || "");
  $("#eCity") && ($("#eCity").value = l.city || "");
  $("#eDesc") && ($("#eDesc").value = l.description || "");

  const sel = $("#eCategory");
  if (sel) {
    const cats = getCategories();
    sel.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    sel.value = l.category || cats[0] || "";
  }

  $("#cancelEdit")?.addEventListener("click", () => location.href = "profile.html");

  $("#editForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = ($("#eTitle")?.value || "");
    const price = Number($("#ePrice")?.value || 0);
    const city = ($("#eCity")?.value || "");
    const desc = ($("#eDesc")?.value || "");
    const category = ($("#eCategory")?.value || "");

    const list = listings();
    const idx = list.findIndex(x => x.id === l.id);
    if (idx < 0) return;
    list[idx] = { ...list[idx], title, price, city, description: desc, category };
    setListings(list);

    alert("Gespeichert ✅");
    location.href = `listing.html?id=${encodeURIComponent(l.id)}`;
  });
}

/* =========================
   PAGES: SELLER PROFILE
   ========================= */
async function initSellerProfile() {
  const sellerId = qs("id");
  const s = getUserById(sellerId);
  if (!s) { alert("Verkäufer nicht gefunden"); location.href = "index.html"; return; }

  const { count, avg, list } = sellerReviewStats(sellerId);
  const activeListings = allListings().filter(l => l.sellerId === sellerId && l.status === "ACTIVE");
  const soldCount = orders().filter(o => o.sellerId === sellerId && o.status === "COMPLETED").length;

  const head = $("#sellerHead");
  if (head) {
    head.innerHTML = `
      <div class="card" style="padding:14px;">
        <div class="small-muted">Verkäufer</div>
        <div style="font-weight:1000;font-size:22px;margin-top:6px;">${escapeHtml(s.name || "User")}</div>
        <div class="small-muted" style="margin-top:6px;">${escapeHtml(s.city || "")}</div>
        <div class="hr"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <span class="badge">⭐ ${fmtStars(avg)} (${count})</span>
          <span class="badge">Verkäufe: ${soldCount}</span>
          <span class="badge">Aktive Inserate: ${activeListings.length}</span>
        </div>
      </div>

      <div class="card" style="padding:14px;">
        <div style="font-weight:900;">Aktion</div>
        <div class="small-muted" style="margin-top:6px;">Starte einen Chat mit dem Verkäufer.</div>
        <div class="hr"></div>
        <button class="btn btn-primary" id="btnChatSeller" type="button">💬 Chat starten</button>
      </div>
    `;

    $("#btnChatSeller")?.addEventListener("click", () => {
      const u = currentUser();
      if (!u) { location.href = `login.html?next=sellerprofil.html?id=${encodeURIComponent(sellerId)}`; return; }
      if (u.id === sellerId) return alert("Das bist du.");
      location.href = `messages.html?with=${encodeURIComponent(sellerId)}`;
    });
  }

  const hint = $("#sellerRatingHint");
  if (hint) hint.textContent = count ? `Durchschnitt: ${fmtStars(avg)} · ${stars(avg)}` : "Noch keine Bewertungen.";

  const boxR = $("#sellerReviews");
  if (boxR) {
    if (!list.length) {
      boxR.innerHTML = `<div class="notice">Noch keine Bewertungen.</div>`;
    } else {
      const sorted = list.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      boxR.innerHTML = sorted.map(r => {
        const b = getUserById(r.buyerId);
        return `
          <div class="card" style="padding:12px;margin:10px 0;">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
              <b>${escapeHtml(b?.name || "Käufer")}</b>
              <span class="badge">⭐ ${r.rating}/5</span>
            </div>
            <div class="small-muted" style="margin-top:6px;">${escapeHtml(fmtTime(r.createdAt))}</div>
            ${r.text ? `<div style="margin-top:10px;white-space:pre-wrap;">${escapeHtml(r.text)}</div>` : `<div class="small-muted" style="margin-top:10px;">(ohne Kommentar)</div>`}
          </div>
        `;
      }).join("");
    }
  }

  const boxL = $("#sellerListings");
  if (boxL) {
    if (!activeListings.length) {
      boxL.innerHTML = `<div class="notice">Keine aktiven Inserate.</div>`;
    } else {
      boxL.innerHTML = activeListings.map(l => {
        const imgHtml = l.images?.[0] ? `<img src="${l.images[0]}" alt="">` : `<div class="fallback">${escapeHtml(l.category)}</div>`;
        return `
          <div class="item">
            <div class="img">${imgHtml}</div>
            <div class="item-body">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                <div style="font-weight:900;flex:1;line-height:1.2">
                  <a href="listing.html?id=${encodeURIComponent(l.id)}" style="text-decoration:underline;">${escapeHtml(l.title)}</a>
                </div>
                <div>${badgeHtml(l.status)}</div>
              </div>
              <div class="price">${moneyEUR(l.price)}</div>
              <div class="meta"><span>${escapeHtml(l.city||"")}</span><span>${escapeHtml(fmtTime(l.createdAt))}</span></div>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

/* =========================
   BOOT
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  maybeSetVersion();
  ensureSeed();
  cleanupExpiredReservations();
  themeInit();
  navInit();

  const page = document.body?.getAttribute("data-page");

  try {
    if (page === "index") await initIndex();
    if (page === "login") initLogin();
    if (page === "sell") await initSell();
    if (page === "listing") await initListing();
    if (page === "cart") await initCart();
    if (page === "checkout") await initCheckout();
    if (page === "order") await initOrder();
    if (page === "profile") await initProfile();
    if (page === "admin") await initAdmin();
    if (page === "favorites") await initFavorites();
    if (page === "offers") await initOffers();
    if (page === "messages") await initMessages();
    if (page === "edit") await initEdit();
    if (page === "seller") await initSellerProfile();
  } catch (e) {
    console.error(e);
    // Optional: alert nur wenn du willst
    // alert("Fehler in app.js: " + e?.message);
  }
});
/* =========================
   POS 16: Batch-Checkout (APPEND-ONLY)
   - Wenn Warenkorb mehrere Orders erzeugt, werden sie nacheinander im Checkout geöffnet
   - Kein Design-Change nötig, nur Logik + kleiner Hinweis
   ========================= */

(function(){
  const BATCH_LIST_KEY = "mm_batch_orders";   // sessionStorage
  const BATCH_INDEX_KEY = "mm_batch_index";  // sessionStorage

  function batchGetList(){
    try{
      const raw = sessionStorage.getItem(BATCH_LIST_KEY);
      const arr = JSON.parse(raw || "[]");
      return Array.isArray(arr) ? arr : [];
    }catch(e){ return []; }
  }
  function batchGetIndex(){
    const n = Number(sessionStorage.getItem(BATCH_INDEX_KEY) || "0");
    return Number.isFinite(n) ? n : 0;
  }
  function batchSet(list, idx){
    sessionStorage.setItem(BATCH_LIST_KEY, JSON.stringify(list || []));
    sessionStorage.setItem(BATCH_INDEX_KEY, String(idx || 0));
  }
  function batchClear(){
    sessionStorage.removeItem(BATCH_LIST_KEY);
    sessionStorage.removeItem(BATCH_INDEX_KEY);
  }

  function batchFindNextPending(fromIdx){
    const list = batchGetList();
    for(let i = fromIdx; i < list.length; i++){
      const oid = list[i];
      const o = getOrder(oid);
      if(o && o.status === "PENDING_PAYMENT") return { oid, i };
    }
    return null;
  }

  function isBatchMode(){
    return qs("batch") === "1" && batchGetList().length > 0;
  }

  // === Override Cart Checkout Button (capture) ===
  function patchCartButton(){
    const btn = document.getElementById("btnCheckoutCart");
    if(!btn) return;

    btn.addEventListener("click", (e) => {
      // capture listener ist besser, aber selbst in bubble stoppen wir alles was danach kommt:
      e.preventDefault();
      e.stopImmediatePropagation();

      const u = currentUser();
      if (!u) { location.href = "login.html?next=cart.html"; return; }

      const ids = cart();
      if (!ids.length) return alert("Warenkorb ist leer.");

      const created = [];
      const remaining = [];

      for (const id of ids) {
        const l = getListing(id);
        if (!l || l.status !== "ACTIVE") { remaining.push(id); continue; }
        if (l.sellerId === u.id) { remaining.push(id); continue; }

        const ord = createOrderForListing(id, u.id);
        if (ord) created.push(ord);
        else remaining.push(id);
      }

      setCart(remaining);
      updateCartCountUI();

      if (!created.length) {
        alert("Keine Orders erstellt (Artikel nicht aktiv / nicht verfügbar).");
        // cart rendert sich über deine normale Seite
        location.reload();
        return;
      }

      // Batch speichern → nacheinander bezahlen
      const orderIds = created.map(o => o.id);
      batchSet(orderIds, 0);

      alert(`Checkout ✅\nOrders erstellt: ${orderIds.length}\nDu wirst jetzt nacheinander durch die Zahlungen geführt.`);
      location.href = `checkout.html?order=${encodeURIComponent(orderIds[0])}&batch=1`;
    }, true); // CAPTURE, damit wir sicher vor anderen Listenern dran sind
  }

  // === Patch Checkout Pay/Cancel (capture) ===
  function patchCheckoutButtons(){
    const btnPay = document.getElementById("btnPay");
    const btnCancel = document.getElementById("btnCancelOrder");

    if(!btnPay && !btnCancel) return;

    // kleiner Hinweis (ohne Design zu verändern)
    if(isBatchMode()){
      const info = document.getElementById("coInfo") || document.body;
      if(info){
        const hint = document.createElement("div");
        hint.className = "notice";
        hint.style.marginTop = "10px";
        hint.textContent = "Batch-Checkout aktiv: Du bezahlst mehrere Orders nacheinander.";
        info.parentNode && info.parentNode.insertBefore(hint, info.nextSibling);
      }
    }

    if(btnPay){
      btnPay.addEventListener("click", (e) => {
        if(!isBatchMode()) return; // normaler Flow bleibt unberührt

        e.preventDefault();
        e.stopImmediatePropagation();

        const u = currentUser();
        if (!u) { location.href = "login.html?next=checkout.html"; return; }

        const orderId = qs("order");
        const o = getOrder(orderId);
        if (!o) { alert("Order nicht gefunden"); location.href = "profile.html"; return; }
        if (o.buyerId !== u.id && !isAdmin(u)) { alert("Kein Zugriff"); location.href = "profile.html"; return; }

        const fresh = getOrder(o.id);
        if (!fresh || fresh.status !== "PENDING_PAYMENT") {
          alert("Schon bezahlt/storniert.");
        } else {
          updateOrderById(fresh.id, { status: "PAID", paidAt: nowTs() });
          markListingSold(fresh.listingId, fresh.buyerId);
        }

        // zum nächsten pending order
        const curIdx = batchGetIndex();
        const next = batchFindNextPending(curIdx + 1);

        if(next){
          batchSet(batchGetList(), next.i);
          location.href = `checkout.html?order=${encodeURIComponent(next.oid)}&batch=1`;
        }else{
          batchClear();
          alert("Batch-Checkout fertig ✅");
          location.href = "profile.html";
        }
      }, true);
    }

    if(btnCancel){
      btnCancel.addEventListener("click", (e) => {
        if(!isBatchMode()) return; // normaler Flow bleibt unberührt

        e.preventDefault();
        e.stopImmediatePropagation();

        const u = currentUser();
        if (!u) { location.href = "login.html?next=checkout.html"; return; }

        const orderId = qs("order");
        const o = getOrder(orderId);
        if (!o) { alert("Order nicht gefunden"); location.href = "profile.html"; return; }
        if (o.buyerId !== u.id && !isAdmin(u)) { alert("Kein Zugriff"); location.href = "profile.html"; return; }

        if (!confirm("Order stornieren?")) return;

        const fresh = getOrder(o.id);
        if (fresh && fresh.status === "PENDING_PAYMENT") {
          updateOrderById(fresh.id, { status: "CANCELED", canceledAt: nowTs() });
          restoreListingToActiveIfReservedBy(fresh.listingId, fresh.buyerId);
        }

        const curIdx = batchGetIndex();
        const next = batchFindNextPending(curIdx + 1);

        if(next){
          batchSet(batchGetList(), next.i);
          location.href = `checkout.html?order=${encodeURIComponent(next.oid)}&batch=1`;
        }else{
          batchClear();
          alert("Batch-Checkout beendet ✅");
          location.href = "profile.html";
        }
      }, true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    try{
      const page = document.body?.getAttribute("data-page");
      if(page === "cart") patchCartButton();
      if(page === "checkout") patchCheckoutButtons();
    }catch(e){}
  });
})();
/* =========================
   POS 17.1: Admin "Sperren" Spalte FIX (APPEND-ONLY)
   - Patch läuft JEDES MAL wenn adminBox neu gerendert wird (Tab-Wechsel)
   - Keine Änderung am Design / bestehenden Features
   ========================= */

(function(){
  const BLOCK_KEY = "mm_blocked_users"; // { userId: true }

  function blockedMap(){ return load(BLOCK_KEY, {}); }
  function setBlockedMap(m){ save(BLOCK_KEY, (m && typeof m==="object") ? m : {}); }
  function isBlocked(userId){
    const m = blockedMap();
    return !!m[String(userId||"")];
  }
  function setBlocked(userId, flag){
    const m = blockedMap();
    const id = String(userId||"");
    if(!id) return;
    if(flag) m[id] = true;
    else delete m[id];
    setBlockedMap(m);
  }

  function textNorm(x){ return String(x||"").trim().toLowerCase(); }

  function enhanceUsersTable(table){
    if(!table) return;
    if(table.getAttribute("data-enhanced-users") === "1") return;

    const ths = Array.from(table.querySelectorAll("thead th"));
    const headers = ths.map(th => textNorm(th.textContent));

    // Users-Tabelle erkennen: braucht email + role
    if(!(headers.includes("email") && (headers.includes("role") || headers.includes("rolle")))) return;

    // "Sperre" schon vorhanden?
    if(headers.includes("sperre")) {
      table.setAttribute("data-enhanced-users","1");
      return;
    }

    // Email Spaltenindex finden
    const emailIdx = headers.indexOf("email");
    if(emailIdx < 0) return;

    // Header-Spalte "Sperre" hinzufügen
    const theadRow = table.querySelector("thead tr");
    if(theadRow){
      const th = document.createElement("th");
      th.textContent = "Sperre";
      theadRow.appendChild(th);
    }

    const list = users();

    // Jede Zeile: Button hinzufügen
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    rows.forEach(tr=>{
      const tds = Array.from(tr.querySelectorAll("td"));
      const email = textNorm(tds[emailIdx]?.textContent || "");
      const usr = list.find(x => textNorm(x.email) === email);

      const td = document.createElement("td");
      if(!usr){
        td.textContent = "—";
        tr.appendChild(td);
        return;
      }

      const blocked = isBlocked(usr.id);
      td.innerHTML = `
        <button class="btn ${blocked ? "" : "btn-danger"}" data-block="${escapeHtml(usr.id)}" type="button">
          ${blocked ? "Entsperren" : "Sperren"}
        </button>
      `;
      tr.appendChild(td);
    });

    // Click handler
    table.querySelectorAll("[data-block]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-block");
        const currently = isBlocked(id);
        if(!confirm(currently ? "User entsperren?" : "User sperren?")) return;
        setBlocked(id, !currently);
        alert(currently ? "Entsperrt ✅" : "Gesperrt ✅");
        location.reload();
      });
    });

    table.setAttribute("data-enhanced-users","1");
  }

  function enhanceListingsTable(table){
    if(!table) return;
    if(table.getAttribute("data-enhanced-listings") === "1") return;

    const ths = Array.from(table.querySelectorAll("thead th"));
    const headers = ths.map(th => textNorm(th.textContent));
    if(!(headers.includes("title") && headers.includes("status") && headers.includes("open"))) return;
    if(headers.includes("delete")) {
      table.setAttribute("data-enhanced-listings","1");
      return;
    }

    const theadRow = table.querySelector("thead tr");
    if(theadRow){
      const th = document.createElement("th");
      th.textContent = "Delete";
      theadRow.appendChild(th);
    }

    Array.from(table.querySelectorAll("tbody tr")).forEach(tr=>{
      const openLink = tr.querySelector("a[href*='listing.html?id=']");
      const href = openLink?.getAttribute("href") || "";
      const id = new URLSearchParams((href.split("?")[1]||"")).get("id") || "";

      const td = document.createElement("td");
      td.innerHTML = `<button class="btn btn-danger" data-dellisting="${escapeHtml(id)}" type="button">Löschen</button>`;
      tr.appendChild(td);
    });

    table.querySelectorAll("[data-dellisting]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-dellisting");
        if(!id) return;
        if(!confirm("Listing wirklich löschen?")) return;

        // minimal: listing entfernen + cart/offer cleanup
        const llist = listings().filter(l => l.id !== id);
        setListings(llist);
        setCart(cart().filter(x => x !== id));
        setOffers(offers().filter(o => o.listingId !== id));

        alert("Listing gelöscht ✅");
        location.reload();
      });
    });

    table.setAttribute("data-enhanced-listings","1");
  }

  function enhanceOrdersTable(table){
    if(!table) return;
    if(table.getAttribute("data-enhanced-orders") === "1") return;

    const ths = Array.from(table.querySelectorAll("thead th"));
    const headers = ths.map(th => textNorm(th.textContent));
    if(!(headers.includes("order") && headers.includes("status") && headers.includes("open"))) return;
    if(headers.includes("delete")) {
      table.setAttribute("data-enhanced-orders","1");
      return;
    }

    const theadRow = table.querySelector("thead tr");
    if(theadRow){
      const th = document.createElement("th");
      th.textContent = "Delete";
      theadRow.appendChild(th);
    }

    Array.from(table.querySelectorAll("tbody tr")).forEach(tr=>{
      const openLink = tr.querySelector("a[href*='order.html?id=']");
      const href = openLink?.getAttribute("href") || "";
      const id = new URLSearchParams((href.split("?")[1]||"")).get("id") || "";

      const td = document.createElement("td");
      td.innerHTML = `<button class="btn btn-danger" data-delorder="${escapeHtml(id)}" type="button">Löschen</button>`;
      tr.appendChild(td);
    });

    table.querySelectorAll("[data-delorder]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-delorder");
        if(!id) return;
        if(!confirm("Order wirklich löschen?")) return;

        const o = getOrder(id);
        if(o && o.status==="PENDING_PAYMENT"){
          restoreListingToActiveIfReservedBy(o.listingId, o.buyerId);
        }
        setReviews(reviews().filter(r => r.orderId !== id));
        setOrders(orders().filter(x => x.id !== id));

        alert("Order gelöscht ✅");
        location.reload();
      });
    });

    table.setAttribute("data-enhanced-orders","1");
  }

  function runEnhance(){
    const box = document.getElementById("adminBox");
    if(!box) return;
    const table = box.querySelector("table");
    if(!table) return;

    // je nach Tab-Tabelle wird genau die passende Enhancement-Funktion aktiv
    enhanceUsersTable(table);
    enhanceListingsTable(table);
    enhanceOrdersTable(table);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const page = document.body?.getAttribute("data-page");
      if(page !== "admin") return;

      // Initial + bei Tab-Clicks
      setTimeout(runEnhance, 50);
      setTimeout(runEnhance, 200);

      ["tabUsers","tabListings","tabOrders","tabCats"].forEach(id=>{
        document.getElementById(id)?.addEventListener("click", ()=>{
          setTimeout(runEnhance, 50);
          setTimeout(runEnhance, 200);
        });
      });

      // Wenn adminBox neu gerendert wird (Tab wechselt), automatisch wieder patchen
      const box = document.getElementById("adminBox");
      if(box){
        const obs = new MutationObserver(()=>{ runEnhance(); });
        obs.observe(box, { childList:true, subtree:true });
      }
    }catch(e){}
  });
})();
/* =========================
   POS 18: Versandadresse + Lieferstatus (APPEND-ONLY)
   - Buyer speichert Adresse im Profil
   - Checkout zeigt Adresse + Pflicht-Check
   - Seller kann Tracking + Versanddatum setzen
   - Buyer kann "Erhalten" bestätigen (falls noch nicht vorhanden)
   - Keine Designänderung nötig (nur kleine Zusatzboxen)
   ========================= */

(function(){
  const ADDR_KEY = "mm_addresses"; // { userId: {fullName, street, zip, city, country, phone} }

  function addrMap(){ return load(ADDR_KEY, {}); }
  function setAddrMap(m){ save(ADDR_KEY, (m && typeof m==="object") ? m : {}); }
  function getAddr(userId){
    const m = addrMap();
    return m[String(userId||"")] || null;
  }
  function setAddr(userId, addr){
    const m = addrMap();
    m[String(userId||"")] = addr;
    setAddrMap(m);
  }

  function addrFilled(a){
    if(!a) return false;
    return !!(String(a.fullName||"").trim() && String(a.street||"").trim() && String(a.zip||"").trim() && String(a.city||"").trim() && String(a.country||"").trim());
  }

  function renderAddrText(a){
    if(!a) return "—";
    const parts = [
      a.fullName,
      a.street,
      `${a.zip||""} ${a.city||""}`.trim(),
      a.country,
      a.phone ? `Tel: ${a.phone}` : ""
    ].filter(Boolean);
    return parts.join(" · ");
  }

  // ===== Profile: Address box =====
  function patchProfileAddress(){
    const u = currentUser();
    if(!u) return;

    // Insert after basic profile info if exists
    const anchor =
      document.getElementById("pRole")?.closest(".card") ||
      document.querySelector("main .card") ||
      document.querySelector("main") ||
      document.body;

    if(!anchor) return;

    const a = getAddr(u.id) || { fullName:u.name||"", street:"", zip:"", city:u.city||"", country:"Deutschland", phone:"" };

    const box = document.createElement("div");
    box.className = "card";
    box.style.padding = "14px";
    box.style.marginTop = "14px";
    box.innerHTML = `
      <div style="font-weight:900;">Versandadresse</div>
      <div class="small-muted" style="margin-top:6px;">Diese Adresse wird beim Checkout verwendet.</div>
      <div class="hr"></div>

      <div class="row" style="grid-template-columns:1fr 1fr; gap:10px;">
        <div>
          <div class="small-muted">Name</div>
          <input class="input" id="addrFullName" value="${escapeHtml(a.fullName||"")}" placeholder="Vorname Nachname">
        </div>
        <div>
          <div class="small-muted">Telefon (optional)</div>
          <input class="input" id="addrPhone" value="${escapeHtml(a.phone||"")}" placeholder="+49 ...">
        </div>
      </div>

      <div style="margin-top:10px;">
        <div class="small-muted">Straße + Hausnr.</div>
        <input class="input" id="addrStreet" value="${escapeHtml(a.street||"")}" placeholder="Musterstraße 12">
      </div>

      <div class="row" style="grid-template-columns:160px 1fr 1fr; gap:10px; margin-top:10px;">
        <div>
          <div class="small-muted">PLZ</div>
          <input class="input" id="addrZip" value="${escapeHtml(a.zip||"")}" placeholder="31134">
        </div>
        <div>
          <div class="small-muted">Stadt</div>
          <input class="input" id="addrCity" value="${escapeHtml(a.city||"")}" placeholder="Hildesheim">
        </div>
        <div>
          <div class="small-muted">Land</div>
          <input class="input" id="addrCountry" value="${escapeHtml(a.country||"Deutschland")}" placeholder="Deutschland">
        </div>
      </div>

      <div class="hr"></div>
      <button class="btn btn-primary" id="btnSaveAddr" type="button">Adresse speichern</button>
      <div class="small-muted" id="addrSavedHint" style="margin-top:8px;"></div>
    `;

    // add after anchor card if possible
    const parent = anchor.parentNode;
    if(parent) parent.insertBefore(box, anchor.nextSibling);
    else document.body.appendChild(box);

    document.getElementById("btnSaveAddr")?.addEventListener("click", ()=>{
      const upd = {
        fullName: (document.getElementById("addrFullName")?.value || "").trim(),
        phone: (document.getElementById("addrPhone")?.value || "").trim(),
        street: (document.getElementById("addrStreet")?.value || "").trim(),
        zip: (document.getElementById("addrZip")?.value || "").trim(),
        city: (document.getElementById("addrCity")?.value || "").trim(),
        country: (document.getElementById("addrCountry")?.value || "").trim(),
      };
      setAddr(u.id, upd);
      const hint = document.getElementById("addrSavedHint");
      if(hint) hint.textContent = addrFilled(upd) ? "Gespeichert ✅" : "Gespeichert ✅ (Adresse ist noch unvollständig)";
      alert("Adresse gespeichert ✅");
    });
  }

  // ===== Checkout: show address + require filled before pay =====
  function patchCheckoutAddress(){
    const u = currentUser();
    if(!u) return;

    const orderId = qs("order");
    const o = getOrder(orderId);
    if(!o) return;

    const a = getAddr(u.id);

    // insert under coInfo
    const info = document.getElementById("coInfo");
    const insertAt = info?.parentNode || document.querySelector("main") || document.body;

    const box = document.createElement("div");
    box.className = "card";
    box.style.padding = "12px";
    box.style.marginTop = "12px";
    box.innerHTML = `
      <div style="font-weight:900;">Versandadresse</div>
      <div class="small-muted" style="margin-top:6px;">${escapeHtml(renderAddrText(a))}</div>
      <div class="hr"></div>
      <a class="btn" href="profile.html">Adresse im Profil bearbeiten</a>
      ${addrFilled(a) ? "" : `<div class="notice" style="margin-top:10px;">⚠️ Adresse ist unvollständig. Bitte im Profil ausfüllen, bevor du bezahlst.</div>`}
    `;
    insertAt.insertBefore(box, info ? info.nextSibling : insertAt.firstChild);

    // block pay if missing
    const btnPay = document.getElementById("btnPay");
    if(btnPay && o.status === "PENDING_PAYMENT"){
      btnPay.addEventListener("click", (e)=>{
        // capture: wir blocken früh, lassen sonst deinen normalen Pay-Flow
        if(!addrFilled(getAddr(u.id))){
          e.preventDefault();
          e.stopImmediatePropagation();
          alert("Bitte zuerst deine Versandadresse im Profil ausfüllen.");
          location.href = "profile.html";
        }
      }, true);
    }
  }

  // ===== Seller: Tracking + shipped helper in order page =====
  function patchOrderShipping(){
    const u = currentUser();
    if(!u) return;

    const id = qs("id");
    const o = getOrder(id);
    if(!o) return;

    const isSeller = o.sellerId === u.id || isAdmin(u);
    const isBuyer = o.buyerId === u.id || isAdmin(u);

    const actions = document.getElementById("orderActions");
    const main = document.querySelector("main") || document.body;
    const host = actions || main;

    // show address to seller when PAID/SHIPPED
    if(isSeller){
      const a = getAddr(o.buyerId);
      const box = document.createElement("div");
      box.className = "card";
      box.style.padding = "12px";
      box.style.marginTop = "12px";
      box.innerHTML = `
        <div style="font-weight:900;">Lieferadresse (Buyer)</div>
        <div class="small-muted" style="margin-top:6px;">${escapeHtml(renderAddrText(a))}</div>
        <div class="hr"></div>
        <div class="small-muted">Tracking (optional)</div>
        <input class="input" id="trackCode" placeholder="z.B. DHL 0034..." value="${escapeHtml(o.tracking || "")}">
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn" id="btnSaveTracking" type="button">Tracking speichern</button>
          ${o.status==="PAID" ? `<button class="btn btn-primary" id="btnShipNow" type="button">Als versendet markieren</button>` : ""}
        </div>
        <div class="small-muted" style="margin-top:8px;">Status: ${escapeHtml(o.status)}</div>
      `;
      host.appendChild(box);

      document.getElementById("btnSaveTracking")?.addEventListener("click", ()=>{
        const code = (document.getElementById("trackCode")?.value || "").trim();
        updateOrderById(o.id, { tracking: code });
        alert("Tracking gespeichert ✅");
      });

      document.getElementById("btnShipNow")?.addEventListener("click", ()=>{
        const fresh = getOrder(o.id);
        if(!fresh || fresh.status!=="PAID") return alert("Status geändert.");
        const code = (document.getElementById("trackCode")?.value || "").trim();
        updateOrderById(fresh.id, { status:"SHIPPED", shippedAt: nowTs(), tracking: code });

      // POS16.2: notify buyer in chat
      try {
        postOrderChatEvent({
          listingId: fresh.listingId,
          buyerId: fresh.buyerId,
          sellerId: fresh.sellerId,
          fromId: fresh.sellerId,
          toId: fresh.buyerId,
          text: "📦 Versandt! Der Verkäufer hat die Bestellung als versendet markiert." + (code ? ("\n🔎 Tracking: " + code) : ""),
          type: "order_shipped",
          orderId: fresh.id
        });
      } catch {}
        alert("Als versendet markiert ✅");
        location.reload();
      });
    }

    // buyer: show tracking + allow receive confirm if shipped
    if(isBuyer){
      const box = document.createElement("div");
      box.className = "card";
      box.style.padding = "12px";
      box.style.marginTop = "12px";
      box.innerHTML = `
        <div style="font-weight:900;">Versand</div>
        <div class="small-muted" style="margin-top:6px;">Tracking: ${escapeHtml(o.tracking || "—")}</div>
        <div class="small-muted" style="margin-top:6px;">Versendet: ${escapeHtml(o.shippedAt ? fmtTime(o.shippedAt) : "—")}</div>
        ${o.status==="SHIPPED" ? `<div class="hr"></div><button class="btn btn-primary" id="btnReceiveNow" type="button">Erhalten bestätigen</button>` : ""}
      `;
      host.appendChild(box);

      document.getElementById("btnReceiveNow")?.addEventListener("click", ()=>{
        const fresh = getOrder(o.id);
        if(!fresh || fresh.status!=="SHIPPED") return alert("Status geändert.");
        updateOrderById(fresh.id, { status:"COMPLETED", completedAt: nowTs() });
        alert("Bestätigt ✅");
        location.reload();
      });
    }

    // timeline add tracking info (optional)
    const tl = document.getElementById("orderTimeline");
    if(tl && o.tracking){
      tl.textContent = (tl.textContent || "") + ` · Tracking: ${o.tracking}`;
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const page = document.body?.getAttribute("data-page");
      if(page==="profile") patchProfileAddress();
      if(page==="checkout") patchCheckoutAddress();
      if(page==="order") patchOrderShipping();
    }catch(e){}
  });
})();
/* =========================
   POS 19: Offers -> ACCEPTED erzeugt Order + Checkout Link (APPEND-ONLY)
   - Wenn Seller ein Angebot annimmt:
     -> Listing wird RESERVED
     -> Order PENDING_PAYMENT wird erstellt (total = offer.amount)
     -> Offer bekommt orderId
   - Buyer sieht im Outgoing Tab: "Zum Checkout"
   ========================= */

(function(){
  function getOffer(id){ return offers().find(o => o.id === id) || null; }
  function setOfferPatch(id, patch){
    const list = offers();
    const idx = list.findIndex(x => x.id === id);
    if(idx < 0) return null;
    list[idx] = { ...list[idx], ...patch };
    setOffers(list);
    return list[idx];
  }

  // create order based on offer (price override)
  function createOrderForOffer(offer){
    const o = offer;
    const l = getListing(o.listingId);
    if(!l) return null;

    // only if listing active
    if(l.status !== "ACTIVE") return null;

    // reserve listing
    const ord = {
      id: uid("ord"),
      listingId: l.id,
      buyerId: o.buyerId,
      sellerId: o.sellerId,
      total: Number(o.amount || 0),
      status: "PENDING_PAYMENT",
      createdAt: nowTs(),
      paidAt: null,
      shippedAt: null,
      completedAt: null,
      canceledAt: null,
      source: "OFFER",
      offerId: o.id
    };

    const olist = orders();
    olist.unshift(ord);
    setOrders(olist);

    // listing -> RESERVED
    const llist = listings();
    const idx = llist.findIndex(x => x.id === l.id);
    if(idx >= 0){
      llist[idx] = { ...llist[idx], status:"RESERVED", reservedBy: o.buyerId };
      setListings(llist);
    }

    return ord;
  }

  // Patch "Annehmen" click: after ACCEPTED, create order
  function patchOffersAccept(){
    const page = document.body?.getAttribute("data-page");
    if(page !== "offers") return;

    // observe table area to re-patch after rerender
    const host = document.getElementById("offerTable");
    if(!host) return;

    function enhance(){
      // Incoming: ACCEPT buttons have data-acc from your integrated code
      host.querySelectorAll("[data-acc]").forEach(btn=>{
        if(btn.getAttribute("data-pos19") === "1") return;
        btn.setAttribute("data-pos19","1");

        btn.addEventListener("click", (e)=>{
          // Let your original handler run FIRST, but we run after it (microtask)
          setTimeout(()=>{
            const id = btn.getAttribute("data-acc");
            const off = getOffer(id);
            if(!off) return;

            // only when accepted and no order yet
            if(off.status !== "ACCEPTED") return;
            if(off.orderId) return;

            // create order
            const ord = createOrderForOffer(off);
            if(!ord){
              alert("Konnte keine Order erstellen (Listing nicht ACTIVE).");
              return;
            }

            // link offer to order
            setOfferPatch(off.id, { orderId: ord.id });

            // ✅ Buyer im Chat informieren (Checkout-Link) + Unread erhöhen
            try {
              const c = ensureChat(off.buyerId, off.sellerId, off.listingId);
              const lcur = getListing(off.listingId);
              const msgText =
                `🧾 Order erstellt.\n👉 Jetzt bezahlen: checkout.html?order=${ord.id}` +
                (lcur ? `\nArtikel: ${lcur.title}` : "");
              addChatMessage(c.id, {
                id: uid("msg"),
                from: off.sellerId,
                text: msgText,
                at: nowTs(),
                type: "order_created",
                orderId: ord.id,
                offerId: off.id
              });
              bumpUnread(off.buyerId, c.id, 1);
            } catch {}

            // info
            alert("Offer angenommen ✅\nOrder erstellt ✅\nBuyer kann jetzt bezahlen.");
          }, 0);
        }, false);
      });

      // Outgoing: add checkout link if orderId exists
      // We patch the rendered HTML table by adding an extra link below action cell if missing
      host.querySelectorAll("table tbody tr").forEach(tr=>{
        const cells = tr.querySelectorAll("td");
        if(!cells.length) return;
        const actionCell = cells[cells.length - 1];
        if(!actionCell) return;

        // find offer id by checking buttons with data-acc/data-rej (incoming) or open link
        // For outgoing table, no accept/reject buttons; but rows include listing link and are reconstructed.
        // We'll parse listing title and amount not safe, so instead: inject by scanning offers list and match first cell text + amount.
        // Simpler: if actionCell already has checkout link, skip.
        if(actionCell.querySelector("[data-checkoutlink='1']")) return;

        const title = (cells[0]?.textContent || "").trim();
        const amountText = (cells[1]?.textContent || "").trim();

        const u = currentUser();
        if(!u) return;

        const list = offers().filter(o => o.buyerId === u.id && o.status === "ACCEPTED" && o.orderId);
        const match = list.find(o=>{
          const l = getListing(o.listingId);
          if(!l) return false;
          const amt = moneyEUR(o.amount);
          return (l.title === title) && (amt === amountText);
        });

        if(!match) return;

        const a = document.createElement("a");
        a.className = "btn btn-primary";
        a.setAttribute("data-checkoutlink","1");
        a.href = `checkout.html?order=${encodeURIComponent(match.orderId)}`;
        a.textContent = "Zum Checkout";
        actionCell.appendChild(document.createTextNode(" "));
        actionCell.appendChild(a);
      });
    }

    // initial + on rerender
    setTimeout(enhance, 60);
    setTimeout(enhance, 200);

    const obs = new MutationObserver(()=>enhance());
    obs.observe(host, { childList:true, subtree:true });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{ patchOffersAccept(); }catch(e){}
  });
})();
/* =========================
   POS 20: Seller Dashboard auf profile.html (APPEND-ONLY)
   - Nur für Seller/Admin sichtbar
   - Zeigt Verkäufe (Orders wo sellerId=currentUser)
   - Filter: Status + Suche
   - Aktionen: Tracking speichern + "Als versendet" (wenn PAID)
   ========================= */

(function(){
  function ensureSellerDash(){
    const u = currentUser();
    if(!u) return;
    if(!(u.role==="seller" || u.role==="admin")) return;

    const main = document.querySelector("main") || document.body;

    // nicht doppelt einfügen
    if(document.getElementById("sellerDashBox")) return;

    const box = document.createElement("div");
    box.className = "card";
    box.id = "sellerDashBox";
    box.style.padding = "14px";
    box.style.marginTop = "14px";

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;">
        <div>
          <div style="font-weight:900;font-size:18px;">Seller Dashboard</div>
          <div class="small-muted">Verkäufe verwalten: Tracking & Versandstatus.</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <select class="input" id="sdStatus" style="min-width:170px;">
            <option value="">Alle Status</option>
            <option value="PAID">PAID</option>
            <option value="SHIPPED">SHIPPED</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="PENDING_PAYMENT">PENDING_PAYMENT</option>
            <option value="CANCELED">CANCELED</option>
          </select>
          <input class="input" id="sdQ" placeholder="Suche (Titel / Order-ID)" style="min-width:220px;" />
          <button class="btn" id="sdReload" type="button">Neu laden</button>
        </div>
      </div>
      <div class="hr"></div>
      <div id="sdList"></div>
    `;

    main.appendChild(box);

    const sel = document.getElementById("sdStatus");
    const q = document.getElementById("sdQ");
    const listEl = document.getElementById("sdList");

    function render(){
      if(!listEl) return;

      const status = (sel?.value || "").trim().toUpperCase();
      const text = (q?.value || "").trim().toLowerCase();

      let list = orders().filter(o => o.sellerId === u.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

      if(status) list = list.filter(o => String(o.status||"").toUpperCase() === status);

      if(text){
        list = list.filter(o => {
          const l = getListing(o.listingId);
          const t = (l?.title || "").toLowerCase();
          return t.includes(text) || String(o.id||"").toLowerCase().includes(text);
        });
      }

      if(!list.length){
        listEl.innerHTML = `<div class="notice">Keine Verkäufe für diesen Filter.</div>`;
        return;
      }

      listEl.innerHTML = list.map(o=>{
        const l = getListing(o.listingId);
        const buyer = getUserById(o.buyerId);
        const title = l?.title || "Listing gelöscht";
        const tracking = o.tracking || "";

        const canShip = (o.status === "PAID");
        const showTrack = (o.status === "PAID" || o.status === "SHIPPED" || o.status === "COMPLETED");

        return `
          <div class="card" style="padding:12px;margin:10px 0;">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
              <div style="flex:1;min-width:240px;">
                <div style="font-weight:900;line-height:1.2">${escapeHtml(title)}</div>
                <div class="small-muted" style="margin-top:6px;">
                  Order: ${escapeHtml(o.id)} · Buyer: ${escapeHtml(buyer?.name || "?")} · ${escapeHtml(fmtTime(o.createdAt))}
                </div>
              </div>
              <div>${badgeHtml(o.status)}</div>
            </div>

            <div class="hr"></div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <a class="btn" href="order.html?id=${encodeURIComponent(o.id)}">Order öffnen</a>
              ${showTrack ? `
                <input class="input" data-trackinp="${escapeHtml(o.id)}" placeholder="Tracking (optional)" value="${escapeHtml(tracking)}" style="min-width:260px;" />
                <button class="btn" data-savetrack="${escapeHtml(o.id)}" type="button">Tracking speichern</button>
              ` : ``}
              ${canShip ? `<button class="btn btn-primary" data-ship="${escapeHtml(o.id)}" type="button">Als versendet</button>` : ``}
            </div>
          </div>
        `;
      }).join("");

      // handlers
      listEl.querySelectorAll("[data-savetrack]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const oid = btn.getAttribute("data-savetrack");
          const inp = listEl.querySelector(`[data-trackinp="${CSS.escape(oid)}"]`);
          const code = (inp?.value || "").trim();
          updateOrderById(oid, { tracking: code });
          alert("Tracking gespeichert ✅");
        });
      });

      listEl.querySelectorAll("[data-ship]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const oid = btn.getAttribute("data-ship");
          const fresh = getOrder(oid);
          if(!fresh || fresh.status !== "PAID") return alert("Status geändert.");
          const inp = listEl.querySelector(`[data-trackinp="${CSS.escape(oid)}"]`);
          const code = (inp?.value || "").trim();
          updateOrderById(oid, { status:"SHIPPED", shippedAt: nowTs(), tracking: code });

          // POS16.2: notify buyer in chat
          try {
            postOrderChatEvent({
              listingId: fresh.listingId,
              buyerId: fresh.buyerId,
              sellerId: fresh.sellerId,
              fromId: fresh.sellerId,
              toId: fresh.buyerId,
              text: "📦 Versandt! Der Verkäufer hat die Bestellung als versendet markiert." + (code ? ("\n🔎 Tracking: " + code) : ""),
              type: "order_shipped",
              orderId: fresh.id
            });
          } catch {}
          alert("Als versendet markiert ✅");
          render();
        });
      });
    }

    sel?.addEventListener("change", render);
    q?.addEventListener("input", render);
    document.getElementById("sdReload")?.addEventListener("click", render);

    render();
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const page = document.body?.getAttribute("data-page");
      if(page === "profile") {
        // nach deinem initProfile rendern
        setTimeout(ensureSellerDash, 80);
        setTimeout(ensureSellerDash, 200);
      }
    }catch(e){}
  });
})();
/* =========================
   POS 21: Index Extra-Filter (APPEND-ONLY)
   - Preis von/bis
   - Stadtfilter
   - Nur Favoriten Toggle
   - Kein Eingriff in initIndex() (wir filtern die gerenderten Karten)
   ========================= */

(function(){
  function parseEur(text){
    // "45,00 €" -> 45
    const t = String(text||"").replace(/\./g,"").replace(",",".").replace(/[^\d.]/g,"").trim();
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }

  function getListingIdFromCard(card){
    const a = card.querySelector("a[href*='listing.html?id=']");
    const href = a?.getAttribute("href") || "";
    const q = href.split("?")[1] || "";
    return new URLSearchParams(q).get("id");
  }

  function getCardData(card){
    const title = (card.querySelector(".item-body div[style*='font-weight:900']")?.textContent || "").trim();
    const priceText = (card.querySelector(".price")?.textContent || "").trim();
    const metaSpans = card.querySelectorAll(".meta span");
    const city = (metaSpans[0]?.textContent || "").trim();
    const price = parseEur(priceText);
    const id = getListingIdFromCard(card);
    return { id, title, city, price };
  }

  function ensureFiltersUI(){
    const qEl = document.getElementById("q");
    const catEl = document.getElementById("cat");
    const sortEl = document.getElementById("sort");
    const grid = document.getElementById("grid");
    if(!grid) return null;

    // nicht doppelt
    if(document.getElementById("pos21Filters")) return {
      root: document.getElementById("pos21Filters"),
      min: document.getElementById("fMin"),
      max: document.getElementById("fMax"),
      city: document.getElementById("fCity"),
      fav: document.getElementById("fFavOnly")
    };

    const wrap = document.createElement("div");
    wrap.id = "pos21Filters";
    wrap.className = "card";
    wrap.style.padding = "12px";
    wrap.style.marginBottom = "12px";

    wrap.innerHTML = `
      <div style="font-weight:900;">Filter</div>
      <div class="small-muted" style="margin-top:6px;">Extra: Preis, Stadt, Favoriten.</div>
      <div class="hr"></div>

      <div class="row" style="grid-template-columns: 150px 150px 1fr 180px; gap:10px;">
        <div>
          <div class="small-muted">Preis von (€)</div>
          <input class="input" id="fMin" placeholder="z.B. 10" inputmode="decimal">
        </div>
        <div>
          <div class="small-muted">Preis bis (€)</div>
          <input class="input" id="fMax" placeholder="z.B. 50" inputmode="decimal">
        </div>
        <div>
          <div class="small-muted">Stadt</div>
          <input class="input" id="fCity" placeholder="z.B. Hildesheim">
        </div>
        <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;">
          <button class="btn" id="fFavOnly" type="button">⭐ Nur Favoriten: AUS</button>
          <button class="btn" id="fReset" type="button">Reset</button>
        </div>
      </div>
    `;

    // so einfügen, dass Design nicht zerstört wird:
    // wenn es einen Filterbereich gibt (bei q/cat/sort), dann darunter.
    const anchor = (qEl && qEl.parentElement) ? qEl.parentElement : null;
    if(anchor && anchor.parentNode){
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    } else {
      // fallback: direkt vor grid
      grid.parentNode?.insertBefore(wrap, grid);
    }

    // events
    const min = wrap.querySelector("#fMin");
    const max = wrap.querySelector("#fMax");
    const city = wrap.querySelector("#fCity");
    const favBtn = wrap.querySelector("#fFavOnly");
    const resetBtn = wrap.querySelector("#fReset");

    // state
    let favOnly = false;

    function applyFilters(){
      const grid = document.getElementById("grid");
      if(!grid) return;

      const minV = Number(String(min?.value || "").replace(",", "."));
      const maxV = Number(String(max?.value || "").replace(",", "."));
      const cityV = String(city?.value || "").trim().toLowerCase();

      const u = currentUser();
      const favMap = favs();
      const favIds = u ? (Array.isArray(favMap?.[u.id]) ? favMap[u.id] : []) : [];

      const cards = Array.from(grid.querySelectorAll(".item"));
      let shown = 0;

      cards.forEach(card=>{
        const d = getCardData(card);

        let ok = true;
        if(Number.isFinite(minV) && String(min?.value||"").trim() !== "") ok = ok && (d.price >= minV);
        if(Number.isFinite(maxV) && String(max?.value||"").trim() !== "") ok = ok && (d.price <= maxV);
        if(cityV) ok = ok && (String(d.city||"").toLowerCase().includes(cityV));

        if(favOnly){
          if(!u){
            ok = false; // als Gast nichts anzeigen
          } else {
            ok = ok && d.id && favIds.includes(d.id);
          }
        }

        card.style.display = ok ? "" : "none";
        if(ok) shown++;
      });

      const empty = document.getElementById("emptyHint");
      if(empty){
        // nur wenn grid existiert: wir zeigen emptyHint, wenn kein sichtbares item
        empty.style.display = shown ? "none" : "";
      }
    }

    function toggleFav(){
      const u = currentUser();
      if(!u){
        // nicht ändern, nur zum login
        location.href = "login.html?next=index.html";
        return;
      }
      favOnly = !favOnly;
      favBtn.textContent = `⭐ Nur Favoriten: ${favOnly ? "AN" : "AUS"}`;
      applyFilters();
    }

    function reset(){
      if(min) min.value = "";
      if(max) max.value = "";
      if(city) city.value = "";
      favOnly = false;
      if(favBtn) favBtn.textContent = "⭐ Nur Favoriten: AUS";
      applyFilters();
    }

    min?.addEventListener("input", applyFilters);
    max?.addEventListener("input", applyFilters);
    city?.addEventListener("input", applyFilters);
    favBtn?.addEventListener("click", toggleFav);
    resetBtn?.addEventListener("click", reset);

    // Re-apply wenn initIndex neu rendert
    const obs = new MutationObserver(()=>applyFilters());
    obs.observe(grid, { childList:true, subtree:true });

    // auch auf bestehende Filter reagieren (q/cat/sort), weil initIndex dann neu rendert
    qEl?.addEventListener("input", ()=>setTimeout(applyFilters, 0));
    catEl?.addEventListener("change", ()=>setTimeout(applyFilters, 0));
    sortEl?.addEventListener("change", ()=>setTimeout(applyFilters, 0));

    // initial
    setTimeout(applyFilters, 50);

    return { root: wrap, min, max, city, fav: favBtn };
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const page = document.body?.getAttribute("data-page");
      if(page !== "index") return;
      ensureFiltersUI();
    }catch(e){}
  });
})();
/* =========================
   POS 21.1: Favoriten FIX (APPEND-ONLY)
   - Favoriten Toggle auf index.html funktioniert sicher
   - robustes Listing-ID Matching (href -> id, fallback: title+price+city Match)
   - überschreibt nur den "Nur Favoriten" Teil, Rest bleibt wie bisher
   ========================= */

(function(){
  const FAV_ONLY_STATE = "mm_fav_only_on"; // localStorage boolean

  function setFavOnlyState(on){ localStorage.setItem(FAV_ONLY_STATE, on ? "1" : "0"); }
  function getFavOnlyState(){ return localStorage.getItem(FAV_ONLY_STATE) === "1"; }

  function parseEur(text){
    const t = String(text||"").replace(/\./g,"").replace(",",".").replace(/[^\d.]/g,"").trim();
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }

  function cardHrefId(card){
    const a = card.querySelector("a[href*='listing.html?id=']");
    const href = a?.getAttribute("href") || "";
    const q = href.split("?")[1] || "";
    const id = new URLSearchParams(q).get("id");
    return id || "";
  }

  function getCardData(card){
    const title = (card.querySelector(".item-body")?.textContent || "").trim();
    const priceText = (card.querySelector(".price")?.textContent || "").trim();
    const metaSpans = card.querySelectorAll(".meta span");
    const city = (metaSpans[0]?.textContent || "").trim();
    const price = parseEur(priceText);
    return { title, city, price };
  }

  function resolveCardListingId(card){
    // 1) try href id
    const id = cardHrefId(card);
    if(id) return id;

    // 2) fallback match with local listings (title+price+city)
    const d = getCardData(card);
    const list = allListings();
    const match = list.find(l=>{
      const samePrice = Number(l.price||0) === Number(d.price||0);
      const sameCity = String(l.city||"").trim().toLowerCase() === String(d.city||"").trim().toLowerCase();
      const sameTitle = String(l.title||"").trim().toLowerCase() === String(d.title||"").trim().toLowerCase();
      return samePrice && sameCity && sameTitle;
    });
    return match?.id || "";
  }

  function applyIndexFiltersRobust(){
    const grid = document.getElementById("grid");
    if(!grid) return;

    // read extra filters (POS21 UI)
    const minEl = document.getElementById("fMin");
    const maxEl = document.getElementById("fMax");
    const cityEl = document.getElementById("fCity");
    const favBtn = document.getElementById("fFavOnly");

    const minV = Number(String(minEl?.value || "").replace(",", "."));
    const maxV = Number(String(maxEl?.value || "").replace(",", "."));
    const cityV = String(cityEl?.value || "").trim().toLowerCase();

    const favOnly = getFavOnlyState();
    if(favBtn) favBtn.textContent = `⭐ Nur Favoriten: ${favOnly ? "AN" : "AUS"}`;

    const u = currentUser();
    const favMap = favs();
    const favIds = u ? (Array.isArray(favMap?.[u.id]) ? favMap[u.id] : []) : [];

    const cards = Array.from(grid.querySelectorAll(".item"));
    let shown = 0;

    cards.forEach(card=>{
      const id = resolveCardListingId(card);
      const d = getCardData(card);

      let ok = true;

      // price filters
      if(minEl && String(minEl.value||"").trim() !== "" && Number.isFinite(minV)) ok = ok && (d.price >= minV);
      if(maxEl && String(maxEl.value||"").trim() !== "" && Number.isFinite(maxV)) ok = ok && (d.price <= maxV);

      // city filter
      if(cityV) ok = ok && String(d.city||"").toLowerCase().includes(cityV);

      // favOnly
      if(favOnly){
        if(!u) ok = false;
        else ok = ok && id && favIds.includes(id);
      }

      card.style.display = ok ? "" : "none";
      if(ok) shown++;
    });

    const empty = document.getElementById("emptyHint");
    if(empty) empty.style.display = shown ? "none" : "";
  }

  function patchFavOnlyButton(){
    const btn = document.getElementById("fFavOnly");
    if(!btn) return;

    // Wir übernehmen den Click (capture) -> zuverlässig
    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopImmediatePropagation();

      const u = currentUser();
      if(!u){
        location.href = "login.html?next=index.html";
        return;
      }

      const next = !getFavOnlyState();
      setFavOnlyState(next);
      applyIndexFiltersRobust();
    }, true);
  }

  function patchListingFavButton(){
    // optional: falls das Favorisieren auf listing.html mal “hakt”
    const page = document.body?.getAttribute("data-page");
    if(page !== "listing") return;

    const btn = document.getElementById("btnFav");
    if(!btn) return;

    btn.addEventListener("click", (e)=>{
      // wir lassen normalen flow zu, aber zusätzlich sichern wir es robust
      try{
        const u = currentUser();
        const id = qs("id");
        if(!u || !id) return;

        // falls normaler handler schon toggled -> okay, wir syncen nur:
        const map = favs();
        const arr = Array.isArray(map[u.id]) ? map[u.id] : [];
        // wenn id nicht drin ist -> hinzufügen, sonst entfernen (toggle)
        if(arr.includes(id)) map[u.id] = arr.filter(x=>x!==id);
        else map[u.id] = arr.concat([id]);
        setFavs(map);
      }catch(err){}
    }, true);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      const page = document.body?.getAttribute("data-page");
      if(page === "index"){
        // wenn UI schon existiert
        patchFavOnlyButton();

        // bei jeder Änderung im grid nochmal robust anwenden (nach initIndex render)
        const grid = document.getElementById("grid");
        if(grid){
          const obs = new MutationObserver(()=>applyIndexFiltersRobust());
          obs.observe(grid, { childList:true, subtree:true });
        }

        // auch wenn inputs existieren
        ["fMin","fMax","fCity"].forEach(id=>{
          document.getElementById(id)?.addEventListener("input", ()=>applyIndexFiltersRobust());
        });

        // initial
        setTimeout(applyIndexFiltersRobust, 80);
        setTimeout(applyIndexFiltersRobust, 200);
      }

      // extra safety on listing fav
      if(page === "listing") patchListingFavButton();
    }catch(e){}
  });
})();
/* =========================
   POS 22: Cart Mengen + Pay-All (APPEND-ONLY)
   - Warenkorb speichert Mengen: { listingId: qty }
   - UI auf cart.html: +/- Menge, Gesamtpreis korrekt
   - Pay-All: erstellt Orders, bezahlt ALLE sofort (simuliert Zahlung)
   - Bestehender "Checkout" bleibt (optional), wir fügen "Pay-All" extra hinzu
   ========================= */

(function(){
  const CART_QTY_KEY = "mm_cart_qty"; // { listingId: qty }

  function qtyMap(){ return load(CART_QTY_KEY, {}); }
  function setQtyMap(m){ save(CART_QTY_KEY, (m && typeof m==="object") ? m : {}); }

  function getQty(listingId){
    const m = qtyMap();
    const q = Number(m[String(listingId||"")] || 1);
    return Number.isFinite(q) && q > 0 ? Math.min(99, Math.floor(q)) : 1;
  }
  function setQty(listingId, qty){
    const id = String(listingId||"");
    if(!id) return;
    const m = qtyMap();
    const q = Math.max(1, Math.min(99, Math.floor(Number(qty||1))));
    m[id] = q;
    setQtyMap(m);
  }
  function delQty(listingId){
    const id = String(listingId||"");
    const m = qtyMap();
    delete m[id];
    setQtyMap(m);
  }

  // When adding to cart (existing addToCart uses mm_cart array),
  // we ensure qty defaults to 1
  function patchAddToCartQty(){
    const page = document.body?.getAttribute("data-page");
    if(page !== "listing") return;

    const btn = document.getElementById("btnCart");
    if(!btn) return;

    btn.addEventListener("click", ()=>{
      const id = qs("id");
      if(!id) return;
      // ensure qty exists
      if(!qtyMap()[id]) setQty(id, 1);
    }, true);
  }

  // Create order with quantity (total = price * qty)
  function createOrderForListingQty(listingId, buyerId, qty){
    const fresh = getListing(listingId);
    if (!fresh || fresh.status !== "ACTIVE") return null;

    const q = Math.max(1, Math.min(99, Math.floor(Number(qty||1))));

    const ord = {
      id: uid("ord"),
      listingId: fresh.id,
      buyerId,
      sellerId: fresh.sellerId,
      total: Number(fresh.price || 0) * q,
      qty: q,
      status: "PENDING_PAYMENT",
      createdAt: nowTs(),
      paidAt: null,
      shippedAt: null,
      completedAt: null,
      canceledAt: null,
      source: "CART"
    };

    const olist = orders();
    olist.unshift(ord);
    setOrders(olist);

    // listing -> RESERVED (one listing can only be sold once in this demo)
    const llist = listings();
    const idx = llist.findIndex(x => x.id === fresh.id);
    if (idx >= 0) {
      llist[idx] = { ...llist[idx], status: "RESERVED", reservedBy: buyerId };
      setListings(llist);
    }

    return ord;
  }

  // Immediate pay (simulate payment) for an order
  function payOrderNow(orderId){
    const o = getOrder(orderId);
    if(!o) return null;
    if(o.status !== "PENDING_PAYMENT") return o;

    updateOrderById(o.id, { status: "PAID", paidAt: nowTs() });
    markListingSold(o.listingId, o.buyerId);
    return getOrder(o.id);
  }

  function patchCartUI(){
    const page = document.body?.getAttribute("data-page");
    if(page !== "cart") return;

    const listEl = document.getElementById("cartList");
    const totalEl = document.getElementById("cartTotal");
    if(!listEl) return;

    // add Pay-All button if not exists
    const btnCheckout = document.getElementById("btnCheckoutCart");
    if(btnCheckout && !document.getElementById("btnPayAll")){
      const payAll = document.createElement("button");
      payAll.className = "btn btn-primary";
      payAll.id = "btnPayAll";
      payAll.type = "button";
      payAll.textContent = "💳 Pay All (sofort bezahlen)";
      btnCheckout.parentNode?.insertBefore(payAll, btnCheckout.nextSibling);

      payAll.addEventListener("click", ()=>{
        const u = currentUser();
        if(!u){ location.href = "login.html?next=cart.html"; return; }

        const ids = cart();
        if(!ids.length) return alert("Warenkorb ist leer.");

        // require address if POS18 active
        try{
          const addrMap = load("mm_addresses", {});
          const a = addrMap?.[u.id] || null;
          const ok = a && String(a.fullName||"").trim() && String(a.street||"").trim() && String(a.zip||"").trim() && String(a.city||"").trim() && String(a.country||"").trim();
          if(!ok){
            alert("Bitte zuerst deine Versandadresse im Profil ausfüllen.");
            location.href = "profile.html";
            return;
          }
        }catch(e){}

        const created = [];
        const remaining = [];

        for (const id of ids) {
          const l = getListing(id);
          if (!l || l.status !== "ACTIVE") { remaining.push(id); continue; }
          if (l.sellerId === u.id) { remaining.push(id); continue; }

          const q = getQty(id);
          const ord = createOrderForListingQty(id, u.id, q);
          if (ord) created.push(ord);
          else remaining.push(id);
        }

        // clear paid ones from cart + qtyMap
        created.forEach(o=>{
          delQty(o.listingId);
        });
        setCart(remaining);
        updateCartCountUI();

        if (!created.length) {
          alert("Keine Orders erstellt (Artikel nicht aktiv / nicht verfügbar).");
          location.reload();
          return;
        }

        // pay all immediately
        const paid = created.map(o => payOrderNow(o.id)).filter(Boolean);

        alert(`Pay-All ✅\nOrders: ${paid.length}\nAlle wurden als bezahlt markiert.`);
        location.href = "profile.html";
      });
    }

    // enhance each cart item with qty controls (after your normal render)
    function enhance(){
      const cards = Array.from(listEl.querySelectorAll(".item"));
      if(!cards.length) return;

      cards.forEach(card=>{
        if(card.getAttribute("data-qtydone")==="1") return;

        // detect listing id from remove button
        const rem = card.querySelector("[data-remove]");
        const id = rem?.getAttribute("data-remove") || "";
        if(!id) return;

        const q = getQty(id);

        const body = card.querySelector(".item-body");
        if(!body) return;

        const qtyRow = document.createElement("div");
        qtyRow.style.marginTop = "10px";
        qtyRow.style.display = "flex";
        qtyRow.style.gap = "10px";
        qtyRow.style.flexWrap = "wrap";
        qtyRow.style.alignItems = "center";

        qtyRow.innerHTML = `
          <span class="badge">Menge:</span>
          <button class="btn" type="button" data-qminus="${escapeHtml(id)}">−</button>
          <span class="badge" data-qval="${escapeHtml(id)}">${q}</span>
          <button class="btn" type="button" data-qplus="${escapeHtml(id)}">+</button>
        `;

        body.appendChild(qtyRow);
        card.setAttribute("data-qtydone","1");
      });

      // handlers
      listEl.querySelectorAll("[data-qminus]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const id = btn.getAttribute("data-qminus");
          const cur = getQty(id);
          const next = Math.max(1, cur - 1);
          setQty(id, next);
          const val = listEl.querySelector(`[data-qval="${CSS.escape(id)}"]`);
          if(val) val.textContent = String(next);
          recomputeTotal();
        });
      });
      listEl.querySelectorAll("[data-qplus]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const id = btn.getAttribute("data-qplus");
          const cur = getQty(id);
          const next = Math.min(99, cur + 1);
          setQty(id, next);
          const val = listEl.querySelector(`[data-qval="${CSS.escape(id)}"]`);
          if(val) val.textContent = String(next);
          recomputeTotal();
        });
      });
    }

    function recomputeTotal(){
      if(!totalEl) return;
      const ids = cart();
      const items = ids.map(id => getListing(id)).filter(Boolean);
      const sum = items.reduce((s,l)=>{
        const q = getQty(l.id);
        return s + (Number(l.price||0) * q);
      }, 0);
      totalEl.textContent = moneyEUR(sum);
    }

    // observe rerenders from existing cart renderer
    const obs = new MutationObserver(()=>{
      enhance();
      recomputeTotal();
    });
    obs.observe(listEl, { childList:true, subtree:true });

    setTimeout(()=>{ enhance(); recomputeTotal(); }, 120);
    setTimeout(()=>{ enhance(); recomputeTotal(); }, 300);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      patchAddToCartQty();
      patchCartUI();
    }catch(e){}
  });
})();
/* =========================
   POS 22.1: Menge springt 1->99 FIX (APPEND-ONLY)
   - Event Delegation auf #cartList (capture)
   - stopImmediatePropagation damit alte/doppelte Listener nicht mehr feuern
   ========================= */

(function(){
  const CART_QTY_KEY = "mm_cart_qty"; // gleich wie POS22

  function qtyMap(){ return load(CART_QTY_KEY, {}); }
  function setQtyMap(m){ save(CART_QTY_KEY, (m && typeof m==="object") ? m : {}); }

  function getQty(listingId){
    const m = qtyMap();
    const q = Number(m[String(listingId||"")] || 1);
    return Number.isFinite(q) && q > 0 ? Math.min(99, Math.floor(q)) : 1;
  }
  function setQty(listingId, qty){
    const id = String(listingId||"");
    if(!id) return;
    const m = qtyMap();
    const q = Math.max(1, Math.min(99, Math.floor(Number(qty||1))));
    m[id] = q;
    setQtyMap(m);
  }

  function recomputeCartTotal(){
    const totalEl = document.getElementById("cartTotal");
    if(!totalEl) return;
    const ids = cart();
    const items = ids.map(id => getListing(id)).filter(Boolean);
    const sum = items.reduce((s,l)=> s + (Number(l.price||0) * getQty(l.id)), 0);
    totalEl.textContent = moneyEUR(sum);
  }

  function patchCartQtyDelegation(){
    const page = document.body?.getAttribute("data-page");
    if(page !== "cart") return;

    const listEl = document.getElementById("cartList");
    if(!listEl) return;

    // nur einmal aktivieren
    if(listEl.getAttribute("data-qty-delegation") === "1") return;
    listEl.setAttribute("data-qty-delegation","1");

    listEl.addEventListener("click", (e)=>{
      const t = e.target;

      // PLUS
      const plusBtn = t?.closest?.("[data-qplus]");
      if(plusBtn){
        e.preventDefault();
        e.stopImmediatePropagation();

        const id = plusBtn.getAttribute("data-qplus");
        const cur = getQty(id);
        const next = Math.min(99, cur + 1);
        setQty(id, next);

        const val = listEl.querySelector(`[data-qval="${CSS.escape(id)}"]`);
        if(val) val.textContent = String(next);

        recomputeCartTotal();
        return;
      }

      // MINUS
      const minusBtn = t?.closest?.("[data-qminus]");
      if(minusBtn){
        e.preventDefault();
        e.stopImmediatePropagation();

        const id = minusBtn.getAttribute("data-qminus");
        const cur = getQty(id);
        const next = Math.max(1, cur - 1);
        setQty(id, next);

        const val = listEl.querySelector(`[data-qval="${CSS.escape(id)}"]`);
        if(val) val.textContent = String(next);

        recomputeCartTotal();
        return;
      }
    }, true); // CAPTURE: wir sind vor allen alten Listenern dran

    // einmal neu berechnen
    setTimeout(recomputeCartTotal, 80);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{ patchCartQtyDelegation(); }catch(e){}
  });
})();
/* =========================
   POS 23: Reviews Auto-Offer (APPEND-ONLY)
   - Wenn Buyer eine Order sieht die COMPLETED ist und noch kein Review hat:
     -> Review-Box erscheint (1-5 Sterne + Text)
   - Speichert Review und zeigt "Danke"
   ========================= */

(function(){
  function hasReviewForOrder(orderId){
    try{
      return !!getReviewByOrder(orderId);
    }catch(e){
      // fallback
      const list = reviews();
      return !!list.find(r => r.orderId === orderId);
    }
  }

  function renderReviewBox(order){
    const u = currentUser();
    if(!u) return;
    if(order.buyerId !== u.id) return;
    if(order.status !== "COMPLETED") return;
    if(hasReviewForOrder(order.id)) return;

    const main = document.querySelector("main") || document.body;
    if(document.getElementById("reviewBox")) return;

    const box = document.createElement("div");
    box.className = "card";
    box.id = "reviewBox";
    box.style.padding = "14px";
    box.style.marginTop = "14px";

    box.innerHTML = `
      <div style="font-weight:900;">Bewertung abgeben</div>
      <div class="small-muted" style="margin-top:6px;">Bewerte den Verkäufer (1–5 Sterne). Ein Review pro Bestellung.</div>
      <div class="hr"></div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <span class="badge">Sterne</span>
        <select class="input" id="revStars" style="max-width:160px;">
          <option value="5">5 ⭐⭐⭐⭐⭐</option>
          <option value="4">4 ⭐⭐⭐⭐</option>
          <option value="3">3 ⭐⭐⭐</option>
          <option value="2">2 ⭐⭐</option>
          <option value="1">1 ⭐</option>
        </select>
      </div>

      <div style="margin-top:10px;">
        <div class="small-muted">Kommentar (optional)</div>
        <textarea class="input" id="revText" rows="4" placeholder="Wie war der Kauf? (max. 400 Zeichen)"></textarea>
      </div>

      <div class="hr"></div>
      <button class="btn btn-primary" id="btnSendReview" type="button">Bewertung senden</button>
      <div class="small-muted" id="revHint" style="margin-top:8px;"></div>
    `;

    main.appendChild(box);

    document.getElementById("btnSendReview")?.addEventListener("click", ()=>{
      const rating = Number(document.getElementById("revStars")?.value || 5);
      const text = (document.getElementById("revText")?.value || "").trim();

      const r = addReview({
        sellerId: order.sellerId,
        buyerId: order.buyerId,
        orderId: order.id,
        rating,
        text
      });

      const hint = document.getElementById("revHint");

      if(!r){
        if(hint) hint.textContent = "Du hast diese Bestellung schon bewertet.";
        alert("Schon bewertet.");
        return;
      }

      if(hint) hint.textContent = "Danke! Bewertung gespeichert ✅";
      alert("Bewertung gespeichert ✅");
      // hide box after success
      box.remove();
    });
  }

  function patchOrderPageReview(){
    const page = document.body?.getAttribute("data-page");
    if(page !== "order") return;

    const id = qs("id");
    const o = getOrder(id);
    if(!o) return;

    // Render review box under everything
    setTimeout(()=>renderReviewBox(o), 80);
    setTimeout(()=>renderReviewBox(o), 200);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{ patchOrderPageReview(); }catch(e){}
  });
})();
/* =========================
   POS 25.9: Kategorien Checkbox-Auswahl (SAFE / NO-OBSERVER) (APPEND-ONLY)
   - KEIN MutationObserver -> verhindert Freezes
   - Patch läuft NUR wenn du den Kategorien-Tab anklickst (oder beim Laden + Delay)
   - Pro Kategorie Checkbox zum Anwählen
   - Button: "Ausgewählte deaktivieren" (mehr willst du nicht)
   ========================= */
(function(){
  const $  = (sel,root=document)=>root.querySelector(sel);
  const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

  function isAdminPage(){ return (document.body?.getAttribute("data-page")||"") === "admin"; }

  function setActiveCompat(name, active){
    const n = (typeof normalizeCategoryName==="function") ? normalizeCategoryName(name) : String(name||"").trim();
    if(!n) return;

    // deine bestehenden Funktionen (wenn vorhanden)
    if(typeof setCategoryActive === "function") return setCategoryActive(n, active);
    if(typeof setCatActive === "function") return setCatActive(n, active);

    // fallback (meta-key)
    try{
      const META_KEY = (window.K && K.CAT_META) ? K.CAT_META : "mm_cat_meta";
      const load = (typeof window.load==="function") ? window.load : (k,fb)=>{ try{const r=localStorage.getItem(k);return r?JSON.parse(r):fb;}catch{return fb;} };
      const save = (typeof window.save==="function") ? window.save : (k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch{} };

      const m = load(META_KEY, {});
      const obj = (m && typeof m==="object" && !Array.isArray(m)) ? m : {};
      obj[n] = { ...(obj[n]||{}), active: !!active };
      save(META_KEY, obj);
    }catch(e){}
  }

  function getCatCard(){
    // deine Kategorien-Ansicht hat eine Karte mit "Aktuelle Kategorien"
    const cards = $$(".card");
    return cards.find(c => (c.textContent||"").includes("Aktuelle Kategorien")) || null;
  }

  function getChips(catCard){
    // chips sind Elemente die ein X-Button enthalten
    const xBtns = $$("button", catCard).filter(b => (b.textContent||"").trim().toUpperCase()==="X");
    const chips = xBtns.map(b => b.closest("span,div") || b.parentElement).filter(Boolean);
    return Array.from(new Set(chips));
  }

  function catNameFromChip(chip){
    const clone = chip.cloneNode(true);
    clone.querySelectorAll("button").forEach(b=>{
      if((b.textContent||"").trim().toUpperCase()==="X") b.remove();
    });
    return String(clone.textContent||"").trim();
  }

  function patchOnce(){
    if(!isAdminPage()) return;

    // eingeloggt / admin check nur wenn Funktionen existieren
    try{
      if(typeof currentUser==="function"){
        const u = currentUser();
        if(!u) return;
        if(typeof isAdmin==="function" && !isAdmin(u)) return;
      }
    }catch(e){}

    const catCard = getCatCard();
    if(!catCard) return;

    // Bar nur 1x
    if(!$("#mmCatSelectBarSafe", catCard)){
      const bar = document.createElement("div");
      bar.id = "mmCatSelectBarSafe";
      bar.style.display = "flex";
      bar.style.gap = "10px";
      bar.style.flexWrap = "wrap";
      bar.style.alignItems = "center";
      bar.style.margin = "10px 0 0";

      bar.innerHTML = `
        <span class="badge" id="mmCatSelCountSafe">Auswahl: 0</span>
        <button class="btn" id="mmCatDeactivateSafe" type="button">Ausgewählte deaktivieren</button>
        <button class="btn" id="mmCatClearSafe" type="button">Auswahl löschen</button>
      `;

      // direkt unter die Überschrift setzen (wenn gefunden)
      const headerLine = Array.from(catCard.querySelectorAll("*"))
        .find(el => el.childElementCount===0 && /Aktuelle Kategorien/i.test(el.textContent||""));
      if(headerLine && headerLine.parentNode){
        headerLine.parentNode.insertBefore(bar, headerLine.nextSibling);
      }else{
        catCard.insertBefore(bar, catCard.firstChild);
      }
    }

    const chips = getChips(catCard);
    if(!chips.length) return;

    // Checkbox in Chips einfügen (nur 1x pro Chip)
    chips.forEach(chip=>{
      if(chip.getAttribute("data-pos259")==="1") return;
      chip.setAttribute("data-pos259","1");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "mm-cat-check-safe";
      cb.style.transform = "scale(1.1)";
      cb.style.cursor = "pointer";
      cb.style.marginRight = "6px";

      // Wichtig: Checkbox darf NICHT den Chip/X-Klick auslösen
      cb.addEventListener("click", (e)=>{ e.stopPropagation(); }, true);

      chip.insertBefore(cb, chip.firstChild);
    });

    const countEl = $("#mmCatSelCountSafe", catCard);
    const getSelected = ()=> chips.filter(ch => ch.querySelector("input.mm-cat-check-safe")?.checked);

    function updateCount(){
      if(countEl) countEl.textContent = `Auswahl: ${getSelected().length}`;
    }
    function clearSel(){
      chips.forEach(ch=>{
        const cb = ch.querySelector("input.mm-cat-check-safe");
        if(cb) cb.checked = false;
      });
      updateCount();
    }

    // change listener nur 1x
    $$(".mm-cat-check-safe", catCard).forEach(cb=>{
      if(cb.getAttribute("data-pos259c")==="1") return;
      cb.setAttribute("data-pos259c","1");
      cb.addEventListener("change", updateCount);
    });

    // Buttons nur 1x
    const btnOff = $("#mmCatDeactivateSafe", catCard);
    const btnClr = $("#mmCatClearSafe", catCard);

    if(btnOff && btnOff.getAttribute("data-pos259b")!=="1"){
      btnOff.setAttribute("data-pos259b","1");
      btnOff.addEventListener("click", ()=>{
        const sel = getSelected();
        if(!sel.length) return alert("Bitte Kategorie(n) ankreuzen.");
        sel.forEach(ch=>{
          const name = catNameFromChip(ch);
          setActiveCompat(name, false);
        });
        clearSel();
        alert("Deaktiviert ✅ (Seite bleibt stabil)");
      });
    }

    if(btnClr && btnClr.getAttribute("data-pos259b")!=="1"){
      btnClr.setAttribute("data-pos259b","1");
      btnClr.addEventListener("click", clearSel);
    }

    updateCount();
  }

  // Patch beim Laden + wenn Kategorien-Tab geklickt wird (ohne Observer)
  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      if(!isAdminPage()) return;

      // 2x delayed patch (falls Admin erst später rendert)
      setTimeout(patchOnce, 150);
      setTimeout(patchOnce, 450);

      // Klick auf Kategorien -> danach patchen
      const tabCats = document.getElementById("tabCats") ||
        Array.from(document.querySelectorAll(".tab")).find(b => (b.textContent||"").trim().toLowerCase()==="kategorien");

      tabCats?.addEventListener("click", ()=>{
        setTimeout(patchOnce, 120);
        setTimeout(patchOnce, 320);
      }, true);
    }catch(e){}
  });
})();
/* =========================
   POS 26: Admin User Sperren/Entsperren (APPEND-ONLY)
   - Admin kann Users sperren (blocked=true)
   - Gesperrte Users können nicht einloggen
   - Eingeloggte gesperrte Users werden automatisch ausgeloggt
   ========================= */
(function(){
  const $  = (sel,root=document)=>root.querySelector(sel);
  const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

  const USERS_KEY = (window.K && K.USERS) ? K.USERS : "mm_users";
  const SESSION_KEY = (window.K && K.SESSION) ? K.SESSION : "mm_session";

  const loadSafe = (k,fb)=>{ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch{ return fb; } };
  const saveSafe = (k,v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} };

  function getUsers(){ return (typeof window.users==="function") ? window.users() : loadSafe(USERS_KEY, []); }
  function setUsers(list){
    if(typeof window.setUsers==="function") return window.setUsers(list);
    saveSafe(USERS_KEY, Array.isArray(list)?list:[]);
  }

  function curUser(){
    return (typeof window.currentUser==="function") ? window.currentUser() : null;
  }
  function isAdminUser(u){
    return (typeof window.isAdmin==="function") ? window.isAdmin(u) : ((u?.role||"")==="admin");
  }

  function logoutNow(){
    if(typeof window.logout==="function") return window.logout();
    localStorage.removeItem(SESSION_KEY);
    location.href = "index.html";
  }

  // 1) Guard: wenn User gesperrt ist -> rauswerfen
  function guardBlocked(){
    const u = curUser();
    if(!u) return;
    if(u.blocked){
      alert("Dein Account wurde gesperrt.");
      logoutNow();
    }
  }

  // 2) Login block: falls es eine login() Funktion gibt, patchen wir sie (ohne zu brechen)
  function patchLogin(){
    if(typeof window.login !== "function") return; // wenn du login anders machst, reicht guardBlocked
    if(window.__MM_LOGIN_PATCHED__) return;
    window.__MM_LOGIN_PATCHED__ = true;

    const orig = window.login;
    window.login = function(email, pass){
      const u = orig(email, pass);
      if(u && u.blocked){
        // sofort wieder ausloggen
        try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
        return null;
      }
      return u;
    };
  }

  // 3) Admin Users UI: Buttons einfügen (ohne dein Layout zu ändern)
  function patchAdminUsersTable(){
    const page = document.body?.getAttribute("data-page") || "";
    if(page !== "admin") return;

    const u = curUser();
    if(!u || !isAdminUser(u)) return;

    // nur wenn Users Tab aktiv / sichtbar
    const box = document.getElementById("adminBox");
    if(!box) return;

    // wir suchen in der Users Tabelle nach Zeilen
    const rows = $$("tbody tr", box);
    if(!rows.length) return;

    // pro Row: am Ende Buttons hinzufügen (wenn nicht schon da)
    rows.forEach(tr=>{
      if(tr.getAttribute("data-pos26")==="1") return;
      tr.setAttribute("data-pos26","1");

      const tds = $$("td", tr);
      if(!tds.length) return;

      // Email steht meist in 2. Spalte, Role irgendwo, wir suchen User per Email match
      const emailCell = tds.find(td => (td.textContent||"").includes("@"));
      const email = (emailCell?.textContent||"").trim().toLowerCase();
      if(!email) return;

      const list = getUsers();
      const user = list.find(x => String(x.email||"").trim().toLowerCase()===email);
      if(!user) return;

      // Admin nicht sperrbar
      const isTargetAdmin = (user.role||"")==="admin";

      // letzte Spalte ist Aktion – wenn nicht vorhanden, nehmen wir letzte
      const actionTd = tds[tds.length-1];

      // Badge anzeigen
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.style.marginRight = "8px";
      badge.textContent = user.blocked ? "gesperrt" : "aktiv";
      if(user.blocked) badge.classList.add("reserved");

      // Button
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.textContent = user.blocked ? "Entsperren" : "Sperren";
      if(isTargetAdmin) btn.disabled = true;

      btn.addEventListener("click", ()=>{
        const list2 = getUsers();
        const idx = list2.findIndex(x => x.id===user.id);
        if(idx<0) return;

        if(list2[idx].role==="admin") return alert("Admin kann nicht gesperrt werden.");

        const next = !list2[idx].blocked;
        if(!confirm(`${next ? "Sperren" : "Entsperren"}: ${list2[idx].name || list2[idx].email}?`)) return;

        list2[idx] = { ...list2[idx], blocked: next };
        setUsers(list2);

        // UI update ohne rerender
        badge.textContent = next ? "gesperrt" : "aktiv";
        badge.classList.toggle("reserved", next);
        btn.textContent = next ? "Entsperren" : "Sperren";
      });

      // in Aktion TD rein
      actionTd.innerHTML = ""; // sauber
      actionTd.appendChild(badge);
      actionTd.appendChild(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      guardBlocked();
      patchLogin();

      // Patch Admin Users: beim Laden und nach Tab-Klick
      setTimeout(patchAdminUsersTable, 200);
      setTimeout(patchAdminUsersTable, 500);

      ["tabUsers","tabListings","tabOrders","tabCats"].forEach(id=>{
        document.getElementById(id)?.addEventListener("click", ()=>{
          setTimeout(patchAdminUsersTable, 250);
          setTimeout(patchAdminUsersTable, 600);
        }, true);
      });
    }catch(e){}
  });
})();
;
;
;
/* ================================
   DARK MODE FIX: Kategorie / Select Text sichtbar
   - macht Select + Options im Dropdown lesbar (weiß auf dunkel)
================================== */
(function darkModeCategoryTextFix() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const STYLE_ID = "darkmode_select_option_fix_v1";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Browser soll Dark UI bevorzugen */
    html { color-scheme: dark; }

    /* Alle Selects + Options lesbar im Darkmode */
    select {
      background: #0e0e15 !important;
      color: #ffffff !important;
      border-color: #2b2b40 !important;
    }

    /* Dropdown-Einträge (Kategorien) */
    select option {
      background: #0e0e15 !important;
      color: #ffffff !important;
    }

    /* Falls du irgendeinen custom dropdown hast */
    [role="listbox"], [role="option"] {
      background: #0e0e15 !important;
      color: #ffffff !important;
    }

    /* Placeholder / disabled im Select (falls vorhanden) */
    select:disabled {
      color: #b9b9d6 !important;
      background: #12121a !important;
    }
  `;
  document.head.appendChild(style);
})();


/* ============================
   POS15.2 MIGRATION: Wenn Reservierung schon angenommen wurde (vor Update),
   aber noch keine Order existiert -> automatisch Order erstellen.
   ============================ */
(function(){
  function migrateReservationAcceptedToOrder(){
    try{
      const dec = load(K.RESERVE_DECISIONS, {});
      const seenPayOrders = new Set();
      const allChats = chats();
      const allListings = listings();
      const olist = orders();

      let changedDec = false;
      let changedOrders = false;
      let changedListings = false;

      // quick index: existing orders by (listingId|buyerId) in active pipeline
      const activeOrderKey = new Set(
        olist
          .filter(o => o && (o.status==="PENDING_PAYMENT" || o.status==="PAID" || o.status==="SHIPPED" || o.status==="COMPLETED"))
          .map(o => `${String(o.listingId)}|${String(o.buyerId)}`)
      );

      Object.keys(dec || {}).forEach((k)=>{
        const d = dec[k];
        if(!d || d.status !== "accepted") return;
        if(d.liftedAt) return;

        // already linked
        if(d.orderId) return;

        const chatId = String(k).split("|")[0];
        const ch = allChats.find(c => String(c.id) === String(chatId));
        if(!ch || !ch.listingId) return;

        const listingId = String(ch.listingId);
        const buyerId = String(d.buyerId || "");
        if(!buyerId) return;

        const l = allListings.find(x => String(x.id) === listingId);
        if(!l) return;

        // avoid duplicate orders
        if(activeOrderKey.has(`${listingId}|${buyerId}`)) {
          // find actual order id and store it
          const existing = olist.find(o => String(o.listingId)===listingId && String(o.buyerId)===buyerId && (o.status==="PENDING_PAYMENT"||o.status==="PAID"||o.status==="SHIPPED"||o.status==="COMPLETED"));
          if(existing){
            d.orderId = existing.id;
            changedDec = true;
          }
          return;
        }

        // only create if listing is reserved by this buyer OR still active
        const st = String(l.status||"").toUpperCase();
        if(!(st==="ACTIVE" || (st==="RESERVED" && String(l.reservedBy||"")===buyerId))) return;

        const until = Number(d.until || d.reservedUntil || nowTs()+24*60*60*1000);

        // create order
        const ord = {
          id: uid("ord"),
          listingId: l.id,
          buyerId,
          sellerId: l.sellerId,
          total: Number(l.price || 0),
          status: "PENDING_PAYMENT",
          createdAt: nowTs(),
          paidAt: null,
          shippedAt: null,
          completedAt: null,
          canceledAt: null,
          source: "RESERVATION",
          reservedUntil: until
        };
        olist.unshift(ord);
        changedOrders = true;

        activeOrderKey.add(`${listingId}|${buyerId}`);

        // ensure listing reserved
        const li = allListings.findIndex(x => String(x.id)===listingId);
        if(li>=0){
          allListings[li] = { ...allListings[li], status:"RESERVED", reservedBy: buyerId, reservedUntil: until };
          changedListings = true;
        }

        // store orderId in decision
        d.orderId = ord.id;
        changedDec = true;
      });

      if(changedOrders) setOrders(olist);
      if(changedListings) setListings(allListings);
      if(changedDec) save(K.RESERVE_DECISIONS, dec);
    }catch(e){}
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    migrateReservationAcceptedToOrder();
  });
})();




/* ============================
   POS15.6: Fix Offer Accept/Decline buttons in Chat (event delegation, reliable)
   - Seller can click "Annehmen"/"Ablehnen" on offer message in chat
   - Creates order with offer amount + sets listing RESERVED
   - Pushes "Jetzt bezahlen" message (order_created) for buyer
   Backup: BACKUP_POS15_5_APPJS_BEFORE_OFFER_CHAT_ACTIONS_FIX_2026-01-06.js
   ============================ */

(function () {
  if (window.__POS15_6_CHAT_OFFER_ACTIONS__) return;
  window.__POS15_6_CHAT_OFFER_ACTIONS__ = true;

  function safeNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function createOrderForOfferGlobal(off) {
    const l = getListing(off.listingId);
    if (!l) return null;

    const lStatus = String(l.status || "").toUpperCase();

    // Allow if ACTIVE OR RESERVED by same buyer (avoid blocking when already reserved)
    if (lStatus === "SOLD") return null;
    if (lStatus === "RESERVED" && l.reservedBy && String(l.reservedBy) !== String(off.buyerId)) return null;

    const total = safeNumber(off.amount ?? off.price ?? off.total, safeNumber(l.price, 0));

    const ord = {
      id: uid("ord"),
      listingId: l.id,
      buyerId: String(off.buyerId),
      sellerId: String(off.sellerId || l.sellerId),
      total,
      status: "PENDING_PAYMENT",
      createdAt: nowTs(),
      paidAt: null,
      shippedAt: null,
      completedAt: null,
      canceledAt: null,
      source: "OFFER",
      offerId: String(off.id)
    };

    const olist = orders();
    olist.unshift(ord);
    setOrders(olist);

    // Listing => RESERVED
    const llist = listings();
    const idx = llist.findIndex(x => x.id === l.id);
    if (idx >= 0) {
      llist[idx] = { ...llist[idx], status: "RESERVED", reservedBy: String(off.buyerId) };
      setListings(llist);
    }

    return ord;
  }

  function ensureOrderMessage(chatId, sellerId, orderId, offerId) {
    const c = chats().find(x => x.id === chatId);
    const msgs = c?.messages || [];
    const has = msgs.some(m => (m && m.type === "order_created" && String(m.orderId) === String(orderId)));
    if (has) return;

    addChatMessage(chatId, {
      id: uid("msg"),
      from: String(sellerId),
      text: "🧾 Zahlung verfügbar. Klicke unten auf „Jetzt bezahlen“.",
      at: nowTs(),
      type: "order_created",
      orderId: String(orderId),
      offerId: offerId ? String(offerId) : null
    });
  }

  // Capture clicks everywhere, so it works even after re-render
  document.addEventListener("click", (e) => {
    const btn = e.target && (e.target.closest ? e.target.closest("[data-off-act][data-off-id]") : null);
    if (!btn) return;

    // stop other handlers -> prevents double execution and fixes "nothing happens"
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    const u = currentUser();
    if (!u) return;

    const act = btn.getAttribute("data-off-act");
    const offerId = btn.getAttribute("data-off-id");
    if (!offerId) return;

    const list = offers();
    const idx = list.findIndex(x => String(x.id) === String(offerId));
    if (idx < 0) return;

    const off = list[idx];
    if (String(off.status) !== "OPEN") return;

    
// Permissions + Rollen (POS20: Gegenangebot / Angebot ändern / Zurückziehen)
const isAdmin = (u.role === "admin");
const buyerId = String(off.buyerId || "");
const sellerId = String(off.sellerId || (getListing(off.listingId)?.sellerId || ""));
const createdBy = (off.createdBy != null) ? String(off.createdBy) : String(off.from || buyerId);
const receiverId = (createdBy === buyerId) ? sellerId : buyerId;
const otherId = (String(u.id) === buyerId) ? sellerId : buyerId;

const isSender = String(u.id) === createdBy;
const isReceiver = String(u.id) === receiverId;

// Rechte:
// - accept/reject/counter: Empfänger (oder Admin)
// - change/withdraw: Sender (oder Admin)
if (act === "accept" || act === "reject" || act === "counter") {
  if (!(isAdmin || isReceiver)) return;
} else if (act === "change" || act === "withdraw") {
  if (!(isAdmin || isSender)) return;
} else {
  return;
}

// Find chat (same listing + users)
const chat = ensureChat(buyerId, sellerId, off.listingId || null);
const l = getListing(off.listingId);
const title = l ? String(l.title || "Artikel") : "Artikel";

function bumpOther() {
  try { if (otherId) bumpUnread(otherId, chat.id, 1); } catch {}
}
function uiRefresh() {
  try { updateChatUnreadUI(); } catch {}
  try { navInit(); } catch {}
}

if (act === "withdraw") {
  list[idx] = { ...off, status: "WITHDRAWN", decidedAt: nowTs(), decidedBy: u.id };
  setOffers(list);

  addChatMessage(chat.id, {
    id: uid("msg"),
    from: u.id,
    text: "🗑️ Angebot zurückgezogen.",
    at: nowTs(),
    type: "offer_decision",
    offerId: off.id,
    status: "WITHDRAWN"
  });

  bumpOther();
  uiRefresh();
  location.reload();
  return;
}

if (act === "change") {
  const amount = prompt("Neuer Angebotspreis in €:", String(off.amount ?? off.price ?? off.total ?? ""));
  if (amount === null) return;
  const val = Number(String(amount).replace(",", "."));
  if (!val || val <= 0) return alert("Ungültiger Betrag.");

  // mark old as UPDATED + create new OPEN offer
  list[idx] = { ...off, status: "UPDATED", decidedAt: nowTs(), decidedBy: u.id };
  const newOff = {
    id: uid("off"),
    listingId: off.listingId,
    sellerId,
    buyerId,
    amount: val,
    status: "OPEN",
    createdAt: nowTs(),
    createdBy: u.id,
    parentOfferId: String(off.id)
  };
  list.unshift(newOff);
  setOffers(list);

  addChatMessage(chat.id, {
    id: uid("msg"),
    from: u.id,
    text: `✏️ Angebot geändert: ${moneyEUR(val)}\nArtikel: ${title}`,
    at: nowTs(),
    type: "offer",
    offerId: newOff.id,
    amount: val
  });

  bumpOther();
  uiRefresh();
  location.reload();
  return;
}

if (act === "counter") {
  const amount = prompt("Dein Gegenangebot in €:", String(off.amount ?? off.price ?? off.total ?? ""));
  if (amount === null) return;
  const val = Number(String(amount).replace(",", "."));
  if (!val || val <= 0) return alert("Ungültiger Betrag.");

  // mark old as COUNTERED + create new OPEN offer from current user
  list[idx] = { ...off, status: "COUNTERED", decidedAt: nowTs(), decidedBy: u.id };
  const newOff = {
    id: uid("off"),
    listingId: off.listingId,
    sellerId,
    buyerId,
    amount: val,
    status: "OPEN",
    createdAt: nowTs(),
    createdBy: u.id,
    parentOfferId: String(off.id)
  };
  list.unshift(newOff);
  setOffers(list);

  addChatMessage(chat.id, {
    id: uid("msg"),
    from: u.id,
    text: `🔁 Gegenangebot: ${moneyEUR(val)}\nArtikel: ${title}`,
    at: nowTs(),
    type: "offer",
    offerId: newOff.id,
    amount: val
  });

  bumpOther();
  uiRefresh();
  location.reload();
  return;
}

if (act === "reject") {
  list[idx] = { ...off, status: "DECLINED", decidedAt: nowTs(), decidedBy: u.id };
  setOffers(list);

  addChatMessage(chat.id, {
    id: uid("msg"),
    from: u.id,
    text: "❌ Angebot abgelehnt.",
    at: nowTs(),
    type: "offer_decision",
    offerId: off.id,
    status: "DECLINED"
  });

  bumpOther();
  uiRefresh();
  location.reload();
  return;
}

if (act === "accept") {
  // Accept offer => order
  let orderId = off.orderId || null;

  // Create order if missing
  if (!orderId) {
    const ord = createOrderForOfferGlobal({ ...off, sellerId, buyerId });
    orderId = ord?.id || null;
  }

  list[idx] = { ...off, sellerId, buyerId, status: "ACCEPTED", decidedAt: nowTs(), decidedBy: u.id, orderId: orderId || null };
  setOffers(list);

  addChatMessage(chat.id, {
    id: uid("msg"),
    from: u.id,
    text: "✅ Angebot angenommen. Bestellung wurde erstellt.",
    at: nowTs(),
    type: "offer_decision",
    offerId: off.id,
    status: "ACCEPTED",
    orderId: orderId || null
  });

  if (orderId) {
    ensureOrderMessage(chat.id, sellerId, orderId, off.id);
  }

  bumpOther();
  uiRefresh();
  location.reload();
  return;
}
}, true);
})();
/* =========================================================
   POS17_CHAT_BADGE_PERFECT (append-only)
   - Stable unread thread counting
   - Marks thread read on open/click
   - Multi-tab safe (storage + focus/visibility)
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const safeParse = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };
  const LS = {
    get(k, fb) { const v = localStorage.getItem(k); return v == null ? fb : safeParse(v, fb); },
    set(k, val) { localStorage.setItem(k, JSON.stringify(val)); }
  };

  const READ_KEY = "mm_chat_read_state_v1"; // new, stable read tracking

  function getMeId() {
    const candidates = ["mm_session", "session", "currentSession", "mm_currentUser", "currentUser"];
    for (const k of candidates) {
      const v = LS.get(k, null);
      if (v && (v.userId || v.id || v._id || v.email)) return String(v.userId || v.id || v._id || v.email);
    }
    const id = localStorage.getItem("loggedInUserId") || localStorage.getItem("userId");
    return id ? String(id) : null;
  }

  function findChatsKey() {
    const preferred = ["mm_chats", "chats", "chatThreads", "mm_chatThreads", "messagesThreads"];
    for (const k of preferred) {
      const v = LS.get(k, null);
      if (Array.isArray(v)) return k;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k);
      if (!raw || raw.length < 5) continue;
      const parsed = safeParse(raw, null);
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      const ok = parsed.some(x => x && typeof x === "object" && Array.isArray(x.messages));
      if (ok) return k;
    }
    LS.set("mm_chats", []);
    return "mm_chats";
  }

  function loadThreads() {
    const key = findChatsKey();
    const threads = LS.get(key, []);
    return { key, threads: Array.isArray(threads) ? threads : [] };
  }

  function threadId(t) {
    return String(t?.id || t?.chatId || t?.threadId || "");
  }

  function msgTs(m) {
    const t = m?.ts ?? m?.time ?? m?.createdAt ?? m?.date ?? 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }

  function msgTo(m) {
    return String(m?.to || m?.toUserId || m?.receiverId || "");
  }

  function msgFrom(m) {
    return String(m?.from || m?.fromUserId || m?.senderId || "");
  }

  function lastRelevantMessage(thread) {
    const msgs = Array.isArray(thread?.messages) ? thread.messages : [];
    if (!msgs.length) return null;
    // last by timestamp if present
    let best = msgs[0];
    for (const m of msgs) {
      if (msgTs(m) >= msgTs(best)) best = m;
    }
    return best;
  }

  function readStateGet() {
    return LS.get(READ_KEY, {}); // { [meId]: { [threadId]: lastReadTs } }
  }

  function readStateSet(state) {
    LS.set(READ_KEY, state);
  }

  function markThreadReadForMe(tid, ts) {
    const me = getMeId();
    if (!me || !tid) return;
    const state = readStateGet();
    if (!state[me]) state[me] = {};
    state[me][tid] = Math.max(Number(state[me][tid] || 0), Number(ts || Date.now()));
    readStateSet(state);
  }

  function getLastReadTs(tid) {
    const me = getMeId();
    if (!me || !tid) return 0;
    const state = readStateGet();
    return Number(state?.[me]?.[tid] || 0);
  }

  function countUnreadThreads() {
    const me = getMeId();
    if (!me) return 0;

    const { threads } = loadThreads();
    let count = 0;

    for (const t of threads) {
      const tid = threadId(t);
      if (!tid) continue;

      const last = lastRelevantMessage(t);
      if (!last) continue;

      const lastTime = msgTs(last);
      const lastFrom = msgFrom(last);
      const lastTo = msgTo(last);

      // only consider messages that are "for me" in some way
      // If last message was sent to me OR from other party and thread has new activity.
      const newSinceRead = lastTime > getLastReadTs(tid);

      // if last message is from me, don't count as unread
      const fromMe = lastFrom === me;

      // if message explicitly targets me, it's relevant
      const targetsMe = lastTo === me;

      // heuristic: if new activity since read AND not from me AND (targets me OR no explicit "to" used)
      const toFieldMissing = !lastTo || lastTo === "undefined";
      if (newSinceRead && !fromMe && (targetsMe || toFieldMissing)) {
        count += 1;
      }
    }

    return count;
  }

  // UI badge
  function ensureBadgeCss() {
    if ($("#pos17ChatBadgeStyle")) return;
    const st = document.createElement("style");
    st.id = "pos17ChatBadgeStyle";
    st.textContent = `
      .pos17-badge-wrap{ position:relative !important; display:inline-flex; align-items:center; }
      .pos17-badge{
        position:absolute; top:-6px; right:-8px;
        min-width:18px; height:18px; padding:0 5px;
        border-radius:999px; font-size:12px; line-height:18px;
        background:#ff2d2d; color:#fff; text-align:center;
        font-weight:700; box-shadow:0 2px 10px rgba(0,0,0,.25);
        pointer-events:none;
      }
    `;
    document.head.appendChild(st);
  }

  function findChatNav() {
    return (
      $("#btnChatNav") ||
      $("#navChat") ||
      $('a[href*="chat.html"]') ||
      $('a[href*="chat"]') ||
      $("#btnChat") ||
      null
    );
  }

  function paintBadge() {
    const el = findChatNav();
    if (!el) return;

    ensureBadgeCss();
    el.classList.add("pos17-badge-wrap");

    let badge = $(".pos17-badge", el);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "pos17-badge";
      el.appendChild(badge);
    }

    const unread = countUnreadThreads();
    if (unread > 0) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  }

  // Mark read on chat page open + thread clicks
  function onChatPage() {
    return location.pathname.toLowerCase().includes("chat");
  }

  function activeChatIdFromUrl() {
    const u = new URL(location.href);
    return u.searchParams.get("chat") || u.searchParams.get("chatId") || u.searchParams.get("id") || "";
  }

  function bindThreadClickMarkRead() {
    // Try to catch clicks on thread list items
    document.addEventListener("click", (e) => {
      const el = e.target?.closest?.("[data-chat-id],[data-thread-id],.chat-thread,.thread,.chatItem,.chat-item");
      if (!el) return;

      const tid =
        el.getAttribute("data-chat-id") ||
        el.getAttribute("data-thread-id") ||
        el.getAttribute("data-id") ||
        "";

      if (tid) {
        markThreadReadForMe(String(tid), Date.now());
        setTimeout(paintBadge, 50);
      }
    }, true);
  }

  function markReadIfChatOpen() {
    if (!onChatPage()) return;
    const tid = activeChatIdFromUrl();
    if (!tid) return;

    // mark read at "now" when opening thread
    markThreadReadForMe(String(tid), Date.now());
    paintBadge();
  }

  function boot() {
    paintBadge();
    markReadIfChatOpen();
    bindThreadClickMarkRead();

    window.addEventListener("storage", (e) => {
      if (!e || !e.key) return;
      const k = String(e.key).toLowerCase();
      if (k.includes("chat") || k.includes("message") || k.includes("order") || k.includes("review") || k.includes(READ_KEY)) {
        paintBadge();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        markReadIfChatOpen();
        paintBadge();
      }
    });

    window.addEventListener("focus", () => {
      markReadIfChatOpen();
      paintBadge();
    });

    // keep stable (UI that renders late)
    setInterval(() => {
      markReadIfChatOpen();
      paintBadge();
    }, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
window.__DISABLE_POS19_REVIEWS__ = true;

/* =========================================================
   POS19_REVIEWS_STORE_SHOW (append-only)
   - Buyer can rate on order.html (purchased item)
   - Saves to localStorage: mm_reviews_v1
   - Sends chat message to seller after rating
   - Shows existing rating on order.html
   ========================================================= */
(() => {
  if (window.__DISABLE_POS19_REVIEWS__) return;

    "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const safeParse = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };
  const LS = {
    get(k, fb) { const v = localStorage.getItem(k); return v == null ? fb : safeParse(v, fb); },
    set(k, val) { localStorage.setItem(k, JSON.stringify(val)); }
  };
  const uid = () => "id_" + Math.random().toString(36).slice(2) + "_" + Date.now();
  const nowTs = () => Date.now();

  // ---------- session ----------
  function getMeId() {
    const candidates = ["mm_session", "session", "currentSession", "mm_currentUser", "currentUser"];
    for (const k of candidates) {
      const v = LS.get(k, null);
      if (v && (v.userId || v.id || v._id || v.email)) return String(v.userId || v.id || v._id || v.email);
    }
    const id = localStorage.getItem("loggedInUserId") || localStorage.getItem("userId");
    return id ? String(id) : null;
  }

  // ---------- key finders ----------
  function findArrayKey(preferredKeys, validatorFn) {
    for (const k of preferredKeys) {
      const v = LS.get(k, null);
      if (validatorFn(v)) return k;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k);
      if (!raw || raw.length < 5) continue;
      const parsed = safeParse(raw, null);
      if (validatorFn(parsed)) return k;
    }
    return null;
  }

  function findOrdersKey() {
    return findArrayKey(
      ["mm_orders", "orders", "mmOrders", "orderList", "mm_order_list"],
      (v) => Array.isArray(v) && (v.length === 0 || v.some(o => o && typeof o === "object" && (o.status || o.state || o.orderStatus)))
    );
  }

  function findChatsKey() {
    const k = findArrayKey(
      ["mm_chats", "chats", "chatThreads", "mm_chatThreads", "messagesThreads"],
      (v) => Array.isArray(v) && (v.length === 0 || v.some(x => x && typeof x === "object" && Array.isArray(x.messages)))
    );
    if (k) return k;
    LS.set("mm_chats", []);
    return "mm_chats";
  }

  // ---------- chat helpers ----------
  function loadChats() {
    const key = findChatsKey();
    const chats = LS.get(key, []);
    return { key, chats: Array.isArray(chats) ? chats : [] };
  }
  function saveChats(key, chats) { LS.set(key, chats); }

  function getThreadParticipants(t) {
    const sellerId = String(t?.sellerId || t?.seller || t?.sellerUserId || "");
    const buyerId  = String(t?.buyerId  || t?.buyer  || t?.buyerUserId  || "");
    return { sellerId, buyerId };
  }

  function findThreadForOrder(chats, order) {
    const oid = String(order?.id || order?.orderId || order?._id || "");
    const lid = String(order?.listingId || order?.itemId || "");
    let t = chats.find(x => String(x?.orderId || "") === oid && oid);
    if (t) return t;

    const buyerId = String(order?.buyerId || order?.buyer || order?.buyerUserId || "");
    const sellerId = String(order?.sellerId || order?.seller || order?.sellerUserId || "");
    t = chats.find(x => {
      const p = getThreadParticipants(x);
      const sameParties = p.buyerId === buyerId && p.sellerId === sellerId && buyerId && sellerId;
      const sameListing = String(x?.listingId || x?.itemId || "") === lid && lid;
      return sameParties && (sameListing || !lid);
    });
    if (t) return t;

    t = chats.find(x => {
      const p = getThreadParticipants(x);
      return p.buyerId === buyerId && p.sellerId === sellerId && buyerId && sellerId;
    });
    return t || null;
  }

  function createThreadFromOrder(order) {
    const oid = String(order?.id || order?.orderId || order?._id || "");
    const buyerId = String(order?.buyerId || order?.buyer || order?.buyerUserId || "");
    const sellerId = String(order?.sellerId || order?.seller || order?.sellerUserId || "");
    const lid = String(order?.listingId || order?.itemId || "");
    return {
      id: uid(),
      orderId: oid || undefined,
      listingId: lid || undefined,
      buyerId,
      sellerId,
      messages: []
    };
  }

  function pushSystemMsg(thread, { from, to, text, metaType }) {
    const msg = {
      id: uid(),
      ts: nowTs(),
      from: String(from || ""),
      to: String(to || ""),
      text: String(text || ""),
      type: "system",
      meta: { type: metaType || "review" },
      unreadFor: [String(to || "")]
    };
    thread.messages.push(msg);
  }

  // ---------- reviews store ----------
  const REVIEWS_KEY = "mm_reviews_v1"; // array of reviews
  function loadReviews() {
    const r = LS.get(REVIEWS_KEY, []);
    return Array.isArray(r) ? r : [];
  }
  function saveReviews(reviews) { LS.set(REVIEWS_KEY, reviews); }

  function orderIdOf(order) {
    return String(order?.id || order?.orderId || order?._id || "");
  }

  function upsertReview({ orderId, listingId, sellerId, buyerId, rating, text }) {
    const reviews = loadReviews();
    const existingIndex = reviews.findIndex(r => String(r?.orderId || "") === String(orderId));
    const item = {
      id: existingIndex >= 0 ? reviews[existingIndex].id : uid(),
      ts: nowTs(),
      orderId: String(orderId || ""),
      listingId: String(listingId || ""),
      sellerId: String(sellerId || ""),
      buyerId: String(buyerId || ""),
      rating: Number(rating || 0),
      text: String(text || "")
    };

    if (existingIndex >= 0) reviews[existingIndex] = item;
    else reviews.push(item);

    saveReviews(reviews);
    return item;
  }

  function getReviewForOrder(orderId) {
    const reviews = loadReviews();
    return reviews.find(r => String(r?.orderId || "") === String(orderId)) || null;
  }

  // ---------- order reading ----------
  function getOrderFromPage() {
    const ordersKey = findOrdersKey();
    if (!ordersKey) return null;

    const orders = LS.get(ordersKey, []);
    if (!Array.isArray(orders)) return null;

    const u = new URL(location.href);
    const oid = u.searchParams.get("order") || u.searchParams.get("orderId") || u.searchParams.get("id") || "";
    if (!oid) return null;

    const order = orders.find(o => String(o?.id || o?.orderId || o?._id || "") === String(oid));
    return order || null;
  }

  // ---------- UI ----------
  function ensureCss() {
    if ($("#pos19ReviewStyle")) return;
    const st = document.createElement("style");
    st.id = "pos19ReviewStyle";
    st.textContent = `
      .pos19-card{ border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px; margin-top:14px; }
      .pos19-row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .pos19-stars button{
        border:1px solid rgba(255,255,255,.2);
        background:transparent; color:inherit;
        padding:6px 10px; border-radius:10px; cursor:pointer;
      }
      .pos19-stars button.active{ background: rgba(255,255,255,.12); }
      .pos19-card textarea{ width:100%; margin-top:10px; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.2); background:transparent; color:inherit; }
      .pos19-card .btn{ margin-top:10px; }
      .pos19-muted{ opacity:.8; font-size:13px; }
    `;
    document.head.appendChild(st);
  }

  function isOrderPage() {
    return location.pathname.toLowerCase().includes("order");
  }

  function findHost() {
    // try typical containers
    return $("#orderDetails") || $("#orderBox") || $(".order-details") || $(".content") || $("#main") || document.body;
  }

  function renderStars(container, value, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "pos19-row pos19-stars";
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "⭐ " + i;
      if (i === value) b.classList.add("active");
      b.addEventListener("click", () => onChange(i));
      wrap.appendChild(b);
    }
    container.appendChild(wrap);
    return wrap;
  }

  function updateActiveStars(starsWrap, value) {
    const btns = $$("button", starsWrap);
    btns.forEach((b, idx) => {
      const i = idx + 1;
      b.classList.toggle("active", i === value);
    });
  }

  function injectReviewBox(order) {
    if (!order) return;
    if (!isOrderPage()) return;

    const me = getMeId();
    const buyerId = String(order?.buyerId || order?.buyer || order?.buyerUserId || "");
    if (!me || !buyerId || me !== buyerId) return; // only buyer sees this box

    ensureCss();

    const host = findHost();
    if (!host) return;

    if ($("#pos19ReviewCard")) return;

    const oid = orderIdOf(order);
    const existing = getReviewForOrder(oid);

    const sellerId = String(order?.sellerId || order?.seller || order?.sellerUserId || "");
    const listingId = String(order?.listingId || order?.itemId || "");
    const title = String(order?.title || order?.itemTitle || order?.listingTitle || "Artikel");

    const card = document.createElement("div");
    card.id = "pos19ReviewCard";
    card.className = "pos19-card";

    const head = document.createElement("div");
    head.className = "pos19-row";
    head.innerHTML = `<strong>Bewertung abgeben</strong> <span class="pos19-muted">(für: ${title})</span>`;
    card.appendChild(head);

    const info = document.createElement("div");
    info.className = "pos19-muted";
    info.style.marginTop = "6px";
    info.textContent = existing ? "Du hast bereits bewertet – du kannst es hier aktualisieren." : "Gib dem Seller eine Bewertung (1–5 Sterne).";
    card.appendChild(info);

    let currentRating = existing?.rating ? Number(existing.rating) : 5;

    const starsWrap = renderStars(card, currentRating, (v) => {
      currentRating = v;
      updateActiveStars(starsWrap, v);
    });

    const ta = document.createElement("textarea");
    ta.rows = 3;
    ta.placeholder = "Optionaler Kommentar…";
    ta.value = existing?.text ? String(existing.text) : "";
    card.appendChild(ta);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = existing ? "Bewertung aktualisieren" : "Bewertung speichern";
    btn.addEventListener("click", () => {
      const text = String(ta.value || "").trim();

      const saved = upsertReview({
        orderId: oid,
        listingId,
        sellerId,
        buyerId,
        rating: currentRating,
        text
      });

      // send chat message to seller (always)
      const { key: chatsKey, chats } = loadChats();
      let thread = findThreadForOrder(chats, order);
      if (!thread) {
        thread = createThreadFromOrder(order);
        chats.push(thread);
      }

      const msgText = text
        ? `⭐ Neue Bewertung: ${saved.rating}/5 – "${text}"`
        : `⭐ Neue Bewertung: ${saved.rating}/5`;

      pushSystemMsg(thread, { from: buyerId, to: sellerId, text: msgText, metaType: "review_submitted" });
      saveChats(chatsKey, chats);

      alert("Bewertung gespeichert ✅ Der Seller wurde im Chat benachrichtigt.");
      location.reload();
    });
    card.appendChild(btn);

    // show existing summary
    if (existing) {
      const summary = document.createElement("div");
      summary.className = "pos19-muted";
      summary.style.marginTop = "10px";
      summary.textContent = `Aktuell gespeichert: ${Number(existing.rating)}/5` + (existing.text ? ` – "${existing.text}"` : "");
      card.appendChild(summary);
    }

    host.appendChild(card);
  }

  // Optional: show seller summary on sellerprofile.html if present
  function tryInjectSellerProfileReviews() {
    const path = location.pathname.toLowerCase();
    if (!path.includes("sellerprofile")) return;

    const u = new URL(location.href);
    const sid = u.searchParams.get("seller") || u.searchParams.get("sellerId") || u.searchParams.get("id") || "";
    if (!sid) return;

    ensureCss();

    const host = $("#sellerProfile") || $("#profileBox") || $(".profile") || $("#main") || document.body;
    if (!host) return;

    if ($("#pos19SellerReviews")) return;

    const reviews = loadReviews().filter(r => String(r?.sellerId || "") === String(sid));
    const count = reviews.length;
    const avg = count ? (reviews.reduce((a, r) => a + Number(r.rating || 0), 0) / count) : 0;

    const box = document.createElement("div");
    box.id = "pos19SellerReviews";
    box.className = "pos19-card";

    const h = document.createElement("div");
    h.className = "pos19-row";
    h.innerHTML = `<strong>Bewertungen</strong> <span class="pos19-muted">(${count})</span>`;
    box.appendChild(h);

    const s = document.createElement("div");
    s.className = "pos19-muted";
    s.style.marginTop = "6px";
    s.textContent = count ? `⭐ Durchschnitt: ${avg.toFixed(1)} / 5` : "Noch keine Bewertungen vorhanden.";
    box.appendChild(s);

    if (count) {
      const list = document.createElement("div");
      list.style.marginTop = "10px";
      // newest first
      reviews.sort((a,b) => Number(b.ts||0) - Number(a.ts||0));
      reviews.slice(0, 20).forEach(r => {
        const row = document.createElement("div");
        row.className = "pos19-muted";
        const txt = r.text ? ` – "${String(r.text)}"` : "";
        row.textContent = `⭐ ${Number(r.rating||0)}/5${txt}`;
        list.appendChild(row);
      });
      box.appendChild(list);
    }

    host.appendChild(box);
  }

  function boot() {
    if (isOrderPage()) {
      const order = getOrderFromPage();
      // wait a moment for DOM render
      setTimeout(() => injectReviewBox(order), 250);
    }
    tryInjectSellerProfileReviews();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
/* =========================================================
   POS20_V2_OFFERS_UPGRADE (append-only)  ✅ robust
   - Buyer buttons appear when an offer is detected (even text-based)
   - Seller can send counter-offer
   - Writes offers in a compatible structure: {type:"offer", offer:{price,status}}
   ========================================================= */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const safeParse = (v, fb) => { try { return JSON.parse(v); } catch { return fb; } };

  const LS = {
    get(k, fb) { const v = localStorage.getItem(k); return v == null ? fb : safeParse(v, fb); },
    set(k, val) { localStorage.setItem(k, JSON.stringify(val)); }
  };

  const uid = () => "id_" + Math.random().toString(36).slice(2) + "_" + Date.now();
  const nowTs = () => Date.now();

  // ---- session ----
  function getMeId() {
    const candidates = ["mm_session", "session", "currentSession", "mm_currentUser", "currentUser"];
    for (const k of candidates) {
      const v = LS.get(k, null);
      if (v && (v.userId || v.id || v._id || v.email)) return String(v.userId || v.id || v._id || v.email);
    }
    const id = localStorage.getItem("loggedInUserId") || localStorage.getItem("userId");
    return id ? String(id) : null;
  }

  // ---- find chats key ----
  function findArrayKey(preferredKeys, validatorFn) {
    for (const k of preferredKeys) {
      const v = LS.get(k, null);
      if (validatorFn(v)) return k;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const raw = localStorage.getItem(k);
      if (!raw || raw.length < 5) continue;
      const parsed = safeParse(raw, null);
      if (validatorFn(parsed)) return k;
    }
    return null;
  }

  function findChatsKey() {
    const k = findArrayKey(
      ["mm_chats", "chats", "chatThreads", "mm_chatThreads", "messagesThreads"],
      (v) => Array.isArray(v) && (v.length === 0 || v.some(x => x && typeof x === "object" && Array.isArray(x.messages)))
    );
    if (k) return k;
    LS.set("mm_chats", []);
    return "mm_chats";
  }

  function loadChats() {
    const key = findChatsKey();
    const chats = LS.get(key, []);
    return { key, chats: Array.isArray(chats) ? chats : [] };
  }
  function saveChats(key, chats) { LS.set(key, chats); }

  // ---- page helpers ----
  function onChatPage() { return location.pathname.toLowerCase().includes("chat"); }
  function activeChatIdFromUrl() {
    const u = new URL(location.href);
    return u.searchParams.get("chat") || u.searchParams.get("chatId") || u.searchParams.get("id") || "";
  }

  function threadId(t) { return String(t?.id || t?.chatId || t?.threadId || ""); }
  function participants(t) {
    const sellerId = String(t?.sellerId || t?.seller || t?.sellerUserId || "");
    const buyerId  = String(t?.buyerId  || t?.buyer  || t?.buyerUserId  || "");
    return { sellerId, buyerId };
  }

  function inferParticipantsFromMessages(thread) {
    const msgs = Array.isArray(thread?.messages) ? thread.messages : [];
    // If your thread misses buyerId/sellerId sometimes, infer: first two distinct userIds in messages.
    const ids = [];
    for (const m of msgs) {
      const f = m?.from || m?.fromUserId || m?.senderId;
      const t = m?.to || m?.toUserId || m?.receiverId;
      if (f && !ids.includes(String(f))) ids.push(String(f));
      if (t && !ids.includes(String(t))) ids.push(String(t));
      if (ids.length >= 2) break;
    }
    return { a: ids[0] || "", b: ids[1] || "" };
  }

  function otherParty(thread, meId) {
    const p = participants(thread);
    if (p.sellerId && p.buyerId) return meId === p.sellerId ? p.buyerId : (meId === p.buyerId ? p.sellerId : "");
    const inf = inferParticipantsFromMessages(thread);
    if (meId === inf.a) return inf.b;
    if (meId === inf.b) return inf.a;
    return "";
  }

  function isBuyer(thread, meId) {
    const p = participants(thread);
    if (p.buyerId) return p.buyerId === meId;
    // fallback inference: if thread has buyer label somewhere else, skip; otherwise assume not
    return false;
  }
  function isSeller(thread, meId) {
    const p = participants(thread);
    if (p.sellerId) return p.sellerId === meId;
    return false;
  }

  // ---- offer detection (robust) ----
  function parsePriceFromText(txt) {
    if (!txt) return null;
    const s = String(txt).replace(/\s+/g, " ").toLowerCase();
    // try "12,50" or "12.50" or "12 €"
    const m = s.match(/(\d{1,6})([.,]\d{1,2})?\s*(€|eur)?/);
    if (!m) return null;
    const num = Number((m[1] + (m[2] || "")).replace(",", "."));
    return Number.isFinite(num) ? num : null;
  }

  function inferStatusFromText(txt) {
    const s = String(txt || "").toLowerCase();
    if (s.includes("abgelehnt")) return "declined";
    if (s.includes("angenommen")) return "accepted";
    if (s.includes("zurückgezogen") || s.includes("zurueckgezogen")) return "withdrawn";
    if (s.includes("gegenangebot")) return "counter";
    return "pending";
  }

  function normalizeOffer(msg) {
    if (!msg || typeof msg !== "object") return null;

    // structured offer
    if (msg.type === "offer" || (msg.offer && typeof msg.offer === "object")) {
      const offer = msg.offer || {};
      const status = String(offer.status || msg.status || "pending").toLowerCase();
      const price = Number(offer.price ?? msg.price ?? parsePriceFromText(msg.text));
      return {
        kind: "structured",
        msg,
        status,
        price: Number.isFinite(price) ? price : null,
        from: String(msg.from || msg.fromUserId || msg.senderId || ""),
        to: String(msg.to || msg.toUserId || msg.receiverId || "")
      };
    }

    // semi-structured via meta
    const metaType = String(msg?.meta?.type || "").toLowerCase();
    const text = String(msg.text || "");
    const looksOffer = metaType.includes("offer") || text.toLowerCase().includes("angebot");
    if (looksOffer) {
      const price = parsePriceFromText(text);
      const status = inferStatusFromText(text);
      return {
        kind: "text",
        msg,
        status,
        price,
        from: String(msg.from || msg.fromUserId || msg.senderId || ""),
        to: String(msg.to || msg.toUserId || msg.receiverId || "")
      };
    }

    return null;
  }

  function lastOffer(thread) {
    const msgs = Array.isArray(thread?.messages) ? thread.messages : [];
    const offers = msgs.map(normalizeOffer).filter(Boolean);
    if (!offers.length) return null;

    // newest by ts
    const ts = (x) => Number(x?.msg?.ts || x?.msg?.time || x?.msg?.createdAt || 0) || 0;
    let best = offers[0];
    for (const o of offers) if (ts(o) >= ts(best)) best = o;

    return best;
  }

  // ---- push messages ----
  function pushOfferMessage(thread, { from, to, price, note, metaType }) {
    const msg = {
      id: uid(),
      ts: nowTs(),
      from: String(from || ""),
      to: String(to || ""),
      type: "offer",
      offer: {
        id: uid(),
        price: Number(price || 0),
        status: "pending",
        note: String(note || "")
      },
      meta: { type: metaType || "offer" },
      unreadFor: [String(to || "")]
    };
    thread.messages.push(msg);
  }

  function pushSystem(thread, { from, to, text, metaType }) {
    const msg = {
      id: uid(),
      ts: nowTs(),
      from: String(from || ""),
      to: String(to || ""),
      type: "system",
      text: String(text || ""),
      meta: { type: metaType || "system" },
      unreadFor: [String(to || "")]
    };
    thread.messages.push(msg);
  }

  // ---- UI ----
  function ensureCss() {
    if ($("#pos20v2Style")) return;
    const st = document.createElement("style");
    st.id = "pos20v2Style";
    st.textContent = `
      #pos20v2Bar{
        position:fixed; left:12px; right:12px; bottom:12px;
        z-index:9999;
        display:flex; gap:10px; flex-wrap:wrap;
        padding:10px; border-radius:14px;
        background: rgba(0,0,0,.55);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,.15);
      }
      #pos20v2Bar .btn{ cursor:pointer; }
      #pos20v2Bar .pos20v2Hint{ opacity:.9; font-size:13px; }
    `;
    document.head.appendChild(st);
  }

  function removeBar() {
    const el = $("#pos20v2Bar");
    if (el) el.remove();
  }

  function ensureBtnClass(btn) {
    // if project already has .btn styling, use it; else make it look ok
    btn.classList.add("btn");
    if (!getComputedStyle(btn).padding) {
      btn.style.padding = "10px 12px";
      btn.style.borderRadius = "12px";
      btn.style.border = "1px solid rgba(255,255,255,.2)";
      btn.style.background = "transparent";
      btn.style.color = "inherit";
    }
  }

  function render() {
    if (!onChatPage()) return;

    const meId = getMeId();
    if (!meId) return;

    const { key, chats } = loadChats();
    const cid = String(activeChatIdFromUrl() || "");
    const thread = chats.find(t => threadId(t) === cid) || null;
    if (!thread) return;

    // must have a detected offer, otherwise no buttons
    const offer = lastOffer(thread);
    if (!offer) { removeBar(); return; }

    // only show actions if offer still "pending-ish"
    const status = String(offer.status || "pending").toLowerCase();
    const pendingLike = ["pending","open","counter","countered",""].includes(status);
    if (!pendingLike) { removeBar(); return; }

    ensureCss();
    removeBar();

    const bar = document.createElement("div");
    bar.id = "pos20v2Bar";

    const otherId = otherParty(thread, meId);
    const p = participants(thread);

    const hint = document.createElement("div");
    hint.className = "pos20v2Hint";
    hint.textContent = "Angebot-Aktionen:";
    bar.appendChild(hint);

    // BUYER: change/withdraw (wenn buyerId bekannt, sonst trotzdem anbieten wenn offer von mir)
    const offerFromMe = (offer.from && offer.from === meId);
    const offerToOther = (otherId && offer.to === otherId) || !offer.to;

    const allowBuyerTools =
      (p.buyerId ? (p.buyerId === meId) : offerFromMe) && offerToOther;

    if (allowBuyerTools) {
      const btnChange = document.createElement("button");
      btnChange.type = "button";
      btnChange.textContent = "✏️ Angebot ändern";
      ensureBtnClass(btnChange);

      btnChange.addEventListener("click", () => {
        const current = offer.price != null ? String(offer.price) : "";
        const raw = prompt(`Neuen Angebotspreis eingeben${current ? ` (aktuell: ${current})` : ""}:`, current || "");
        if (raw == null) return;
        const newPrice = Number(String(raw).replace(",", "."));
        if (!Number.isFinite(newPrice) || newPrice <= 0) {
          alert("Ungültiger Preis.");
          return;
        }

        // try to mark old offer as superseded if structured
        if (offer.msg && offer.msg.offer && typeof offer.msg.offer === "object") {
          offer.msg.offer.status = "superseded";
        }

        // send new structured offer message (so seller code can accept/decline)
        const toId = p.sellerId || otherId;
        pushOfferMessage(thread, {
          from: meId,
          to: toId,
          price: newPrice,
          note: "Buyer hat Angebot geändert",
          metaType: "offer_changed"
        });

        saveChats(key, chats);
        alert("Angebot geändert ✅");
        location.reload();
      });

      const btnWithdraw = document.createElement("button");
      btnWithdraw.type = "button";
      btnWithdraw.textContent = "🗑️ Angebot zurückziehen";
      ensureBtnClass(btnWithdraw);

      btnWithdraw.addEventListener("click", () => {
        if (!confirm("Willst du das Angebot wirklich zurückziehen?")) return;

        if (offer.msg && offer.msg.offer && typeof offer.msg.offer === "object") {
          offer.msg.offer.status = "withdrawn";
        }

        const toId = p.sellerId || otherId;
        pushSystem(thread, {
          from: meId,
          to: toId,
          text: "🗑️ Buyer hat das Angebot zurückgezogen.",
          metaType: "offer_withdrawn"
        });

        saveChats(key, chats);
        alert("Angebot zurückgezogen ✅");
        location.reload();
      });

      bar.appendChild(btnChange);
      bar.appendChild(btnWithdraw);
    }

    // SELLER: counter-offer (wenn sellerId bekannt, sonst anbieten wenn offer NICHT von mir)
    const allowSellerTools =
      (p.sellerId ? (p.sellerId === meId) : !offerFromMe);

    if (allowSellerTools) {
      const btnCounter = document.createElement("button");
      btnCounter.type = "button";
      btnCounter.textContent = "↩️ Gegenangebot senden";
      ensureBtnClass(btnCounter);

      btnCounter.addEventListener("click", () => {
        const current = offer.price != null ? String(offer.price) : "";
        const raw = prompt(`Gegenangebot eingeben${current ? ` (Buyer-Angebot: ${current})` : ""}:`, current || "");
        if (raw == null) return;
        const counter = Number(String(raw).replace(",", "."));
        if (!Number.isFinite(counter) || counter <= 0) {
          alert("Ungültiger Preis.");
          return;
        }

        if (offer.msg && offer.msg.offer && typeof offer.msg.offer === "object") {
          offer.msg.offer.status = "countered";
        }

        const toId = p.buyerId || otherId;
        pushOfferMessage(thread, {
          from: meId,
          to: toId,
          price: counter,
          note: "Seller hat Gegenangebot gesendet",
          metaType: "counter_offer"
        });

        saveChats(key, chats);
        alert("Gegenangebot gesendet ✅");
        location.reload();
      });

      bar.appendChild(btnCounter);
    }

    // If no role matched, remove (avoid confusion)
    const onlyHint = bar.children.length <= 1;
    if (onlyHint) { removeBar(); return; }

    document.body.appendChild(bar);
  }

  function boot() {
    if (!onChatPage()) return;
    render();
    // chat UI loads late -> keep trying
    setInterval(render, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();


/* =========================================================
   POS_UIFIX_CARD_IMAGE_RENDER (append-only)
   Fix: Unterschiedliche "Hintergrund-Box"-Größen / Container läuft über Layout hinaus
   (besonders checkout.html / order.html / listing.html)
   - macht Bilder responsiv (width:100%, max-height)
   - verhindert Overflow (overflow:hidden)
   - zentriert Placeholder/Images sauber
   ========================================================= */
(() => {
  "use strict";

  function shouldApply() {
    const p = (location.pathname || "").toLowerCase();
    const dp = document.body?.getAttribute?.("data-page") || "";
    return (
      dp === "checkout" || dp === "order" || dp === "listing" ||
      p.includes("checkout") || p.includes("order") || p.includes("listing")
    );
  }

  function inject() {
    if (!shouldApply()) return;
    if (document.getElementById("pos_uifix_cardimg_style")) return;

    const style = document.createElement("style");
    style.id = "pos_uifix_cardimg_style";
    style.textContent = `
      /* make main detail images consistent */
      #coImg, #oImg, #lImage {
        overflow: hidden !important;
        box-sizing: border-box !important;
        width: 100% !important;
        max-width: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      #coImg img, #oImg img, #lImage img {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: 520px !important;
        object-fit: contain !important;
      }

      /* prevent SVG placeholders or big images from stretching cards */
      img {
        max-width: 100% !important;
        height: auto !important;
      }

      /* keep wrappers from overflowing on detail pages */
      main .card .img, main .img {
        max-width: 100% !important;
        overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
  else inject();
})();
/* =========================================================
   POS21: TOAST + OFFER BUTTON FIX + ACCEPT TIME PICKER (append-only)
   - Fix offer "toast not visible" (redirect delayed)
   - Fix unread bump (must use chat.id, not message id)
   - Seller accept offer in chat with time picker (datetime-local)
   ========================================================= */
(() => {
  "use strict";
  if (window.__POS21_TOAST_OFFER_TIME__) return;
  window.__POS21_TOAST_OFFER_TIME__ = true;

  // ---------- Toast ----------
  (function initToastOnce(){
    if (window.mmToast) return;

    const css = `
      .mm-toast-wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:99999;}
      .mm-toast{max-width:min(92vw,560px);background:rgba(20,20,20,.92);color:#fff;padding:16px 18px;border-radius:14px;
        box-shadow:0 10px 30px rgba(0,0,0,.35);font-size:16px;line-height:1.35;transform:translateY(10px);opacity:0;
        transition:opacity .18s ease,transform .18s ease;pointer-events:none;text-align:center;}
      .mm-toast.show{opacity:1;transform:translateY(0);}
      .mm-toast.ok{background:rgba(22,115,65,.92);}
      .mm-toast.warn{background:rgba(176,120,10,.92);}
      .mm-toast.err{background:rgba(165,38,38,.92);}
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "mm-toast-wrap";
    wrap.innerHTML = `<div class="mm-toast" role="status" aria-live="polite"></div>`;
    document.body.appendChild(wrap);

    window.mmToast = function(msg, type="ok", ms=1300){
      const box = wrap.querySelector(".mm-toast");
      box.className = "mm-toast " + (type || "");
      box.textContent = msg || "";
      requestAnimationFrame(() => box.classList.add("show"));
      clearTimeout(window.__MM_TOAST_T__);
      window.__MM_TOAST_T__ = setTimeout(() => box.classList.remove("show"), Math.max(600, ms|0));
    };
  })();

  // ---------- datetime picker modal ----------
  function mmPickDateTime({ title="Zeit auswählen", okText="Annehmen", onOk }) {
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center;padding:18px;";
    const card = document.createElement("div");
    card.style.cssText = "width:min(92vw,520px);background:#fff;border-radius:16px;box-shadow:0 12px 35px rgba(0,0,0,.35);padding:16px;";
    const now = new Date(); now.setMinutes(now.getMinutes() + 60);
    const pad = n => String(n).padStart(2,"0");
    const val = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    card.innerHTML = `
      <div style="font-weight:900;font-size:16px;margin-bottom:10px;">${title}</div>
      <input id="mmDT" type="datetime-local" value="${val}"
        style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;font-size:14px;">
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
        <button id="mmCancel" class="btn" type="button">Abbrechen</button>
        <button id="mmOk" class="btn btn-primary" type="button">${okText}</button>
      </div>
    `;
    ov.appendChild(card);
    document.body.appendChild(ov);

    const cleanup = () => ov.remove();
    ov.addEventListener("click", (e)=>{ if (e.target === ov) cleanup(); });
    card.querySelector("#mmCancel").onclick = cleanup;
    card.querySelector("#mmOk").onclick = () => {
      const dt = card.querySelector("#mmDT").value;
      if (!dt) return window.mmToast("⚠️ Bitte Zeit auswählen", "warn", 1200);
      cleanup();
      onOk && onOk(dt);
    };
  }

  // ---------- helper: create order for offer (safe, idempotent) ----------
  function safeNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function findOrderByOfferId(offerId) {
    try {
      const olist = (typeof orders === "function") ? orders() : [];
      return olist.find(o => String(o.offerId || "") === String(offerId) && String(o.source || "") === "OFFER") || null;
    } catch {
      return null;
    }
  }

  function createOrderForOfferPOS21(off) {
    const l = (typeof getListing === "function") ? getListing(off.listingId) : null;
    if (!l) return null;

    const st = String(l.status || "").toUpperCase();
    if (st === "SOLD") return null;
    if (st === "RESERVED" && l.reservedBy && String(l.reservedBy) !== String(off.buyerId)) return null;

    const existing = findOrderByOfferId(off.id);
    if (existing) return existing;

    const total = safeNumber(off.amount ?? off.price ?? off.total, safeNumber(l.price, 0));

    const ord = {
      id: (typeof uid === "function") ? uid("ord") : ("ord_" + Date.now()),
      listingId: l.id,
      buyerId: String(off.buyerId),
      sellerId: String(off.sellerId || l.sellerId),
      total,
      status: "PENDING_PAYMENT",
      createdAt: (typeof nowTs === "function") ? nowTs() : Date.now(),
      paidAt: null, shippedAt: null, completedAt: null, canceledAt: null,
      source: "OFFER",
      offerId: String(off.id)
    };

    const olist = orders();
    olist.unshift(ord);
    setOrders(olist);

    // Listing => RESERVED
    const llist = listings();
    const idx = llist.findIndex(x => String(x.id) === String(l.id));
    if (idx >= 0) {
      llist[idx] = { ...llist[idx], status: "RESERVED", reservedBy: String(off.buyerId) };
      setListings(llist);
    }
    return ord;
  }

  function ensureOrderMessagePOS21(chatId, sellerId, orderId, offerId, acceptedTime) {
    const c = chats().find(x => String(x.id) === String(chatId));
    const msgs = c?.messages || [];
    const has = msgs.some(m => (m && m.type === "order_created" && String(m.orderId) === String(orderId)));
    if (has) return;

    const timeLine = acceptedTime ? `\n🕒 Zeit: ${acceptedTime}` : "";
    addChatMessage(chatId, {
      id: uid("msg"),
      from: String(sellerId),
      text: "🧾 Zahlung verfügbar. Klicke unten auf „Jetzt bezahlen“." + timeLine,
      at: nowTs(),
      type: "order_created",
      orderId: String(orderId),
      offerId: offerId ? String(offerId) : null
    });
  }

  // =========================================================
  // 1) LISTING: Offer Button -> toast + correct unread + delayed redirect
  // =========================================================
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("#btnOffer") : null;
    if (!btn) return;

    const page = document.body?.getAttribute("data-page");
    if (page !== "listing") return;

    // We take over
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    const id = (typeof qs === "function") ? qs("id") : (new URLSearchParams(location.search).get("id"));
    const l = (typeof getListing === "function") ? getListing(id) : null;
    if (!l) return;

    const u = (typeof currentUser === "function") ? currentUser() : null;
    if (!u) { location.href = `login.html?next=listing.html?id=${encodeURIComponent(l.id)}`; return; }
    if (u.id === l.sellerId) { alert("Du bist der Verkäufer."); return; }

    const amount = prompt("Dein Angebot in €:", String(l.price || "0"));
    if (amount === null) return;

    const val = Number(String(amount).replace(",", "."));
    if (!val || val <= 0) { alert("Ungültiger Betrag."); return; }

    const off = {
      id: uid("off"),
      listingId: l.id,
      sellerId: l.sellerId,
      buyerId: u.id,
      amount: val,
      status: "OPEN",
      createdAt: nowTs(),
      createdBy: u.id,
      parentOfferId: null
    };

    const list = offers();
    list.unshift(off);
    setOffers(list);

    const c = ensureChat(u.id, l.sellerId, l.id);
    addChatMessage(c.id, {
      id: uid("msg"),
      from: u.id,
      text: `💸 Angebot: ${moneyEUR(val)}\nArtikel: ${l.title}`,
      at: nowTs(),
      type: "offer",
      offerId: off.id,
      amount: val
    });

    // ✅ FIX: unread bump MUST use chat.id
    try { bumpUnread(l.sellerId, c.id, 1); } catch {}

    window.mmToast("✅ Angebot gesendet", "ok", 1100);
    setTimeout(() => { location.href = "offers.html"; }, 650);
  }, true);

  // =========================================================
  // 2) CHAT: Seller accept offer -> pick time -> accept + order + notify buyer
  // =========================================================
  document.addEventListener("click", (e) => {
    const btn = e.target && (e.target.closest ? e.target.closest("[data-off-act][data-off-id]") : null);
    if (!btn) return;

    const act = btn.getAttribute("data-off-act");
    if (act !== "accept") return; // only time picker on accept

    // We take over accept
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    const u = currentUser();
    if (!u) return;

    const offerId = btn.getAttribute("data-off-id");
    if (!offerId) return;

    const list = offers();
    const idx = list.findIndex(x => String(x.id) === String(offerId));
    if (idx < 0) return;

    const off = list[idx];
    if (String(off.status) !== "OPEN") {
      window.mmToast("ℹ️ Angebot ist nicht mehr offen", "warn", 1200);
      return;
    }

    // Permission: receiver (seller) or admin
    const buyerId = String(off.buyerId || "");
    const l = getListing(off.listingId);
    const sellerId = String(off.sellerId || (l ? l.sellerId : ""));
    const createdBy = (off.createdBy != null) ? String(off.createdBy) : String(off.from || buyerId);
    const receiverId = (createdBy === buyerId) ? sellerId : buyerId;

    const isAdminHere = (u.role === "admin");
    const isReceiver = String(u.id) === receiverId;

    if (!(isAdminHere || isReceiver)) return;

    mmPickDateTime({
      title: "Zeit einstellen (Treffen/Übergabe/Versand)",
      okText: "Annehmen",
      onOk: (dtValue) => {
        // mark offer accepted + store time
        let orderId = off.orderId || null;

        // create order (idempotent)
        const ord = createOrderForOfferPOS21({ ...off, sellerId, buyerId });
        orderId = ord?.id || orderId;

        list[idx] = {
          ...off,
          status: "ACCEPTED",
          decidedAt: nowTs(),
          decidedBy: u.id,
          acceptedTime: dtValue,
          orderId: orderId || off.orderId || null
        };
        setOffers(list);

        // notify buyer in chat + unread
        try {
          const chat = ensureChat(buyerId, sellerId, off.listingId || null);

          // add decision note
          addChatMessage(chat.id, {
            id: uid("msg"),
            from: u.id,
            text: `✅ Angebot angenommen.\n🕒 Zeit: ${dtValue}`,
            at: nowTs(),
            type: "offer_decision",
            offerId: off.id,
            status: "ACCEPTED",
            acceptedTime: dtValue
          });

          // order message for payment (if order exists)
          if (orderId) {
            ensureOrderMessagePOS21(chat.id, sellerId, orderId, off.id, dtValue);
          }

          bumpUnread(buyerId, chat.id, 1);

          // refresh UI if available
          try { updateChatUnreadUI(); } catch {}
          try { navInit(); } catch {}
          try { if (typeof renderChat === "function") renderChat(); } catch {}
        } catch {}

        window.mmToast("✅ Angebot angenommen + Zeit gespeichert", "ok", 1300);
        // optional reload to refresh message actions
        setTimeout(() => { try { location.reload(); } catch {} }, 450);
      }
    });
  }, true);

})();

