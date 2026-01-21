import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// === Firebase Config ===
const firebaseConfig = {
    apiKey: "AIzaSyCFSOAFOhxXX1Dxym7kAghMRq8bFknP3wU",
    authDomain: "hjkjklo.firebaseapp.com",
    projectId: "hjkjklo",
    storageBucket: "hjkjklo.firebasestorage.app",
    messagingSenderId: "900615344338",
    appId: "1:900615344338:web:343277c0fd9674ab3c9d0b"
};

const appFirebase = initializeApp(firebaseConfig);
const dbFirestore = getFirestore(appFirebase);

// === Local DB Setup ===
const DB_NAME = 'DebtAppDB';
const DB_VERSION = 2;
let db;
let currentCustomer = null;
let currentTransType = '';

const hashPass = str => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString();
};

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('customers')) {
                db.createObjectStore('customers', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('transactions')) {
                db.createObjectStore('transactions', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e);
    });
}

// === Sync Functions (Firebase <-> Local) ===
async function syncToFirebase(collectionName, data) {
    if(navigator.onLine) {
        try {
            await setDoc(doc(dbFirestore, collectionName, data.id), data);
            console.log("Synced to Firebase:", collectionName);
        } catch(e) {
            console.error("Sync Error:", e);
        }
    }
}

async function deleteFromFirebase(collectionName, id) {
    if(navigator.onLine) {
        try {
            await deleteDoc(doc(dbFirestore, collectionName, id));
        } catch(e) { console.error("Delete Error", e); }
    }
}

async function syncDown() {
    if(!navigator.onLine) return;
    try {
        // Sync Customers
        const qCust = await getDocs(collection(dbFirestore, "customers"));
        const tx = db.transaction(['customers', 'transactions'], 'readwrite');
        const cStore = tx.objectStore('customers');
        qCust.forEach(doc => cStore.put(doc.data()));

        // Sync Transactions
        const qTrans = await getDocs(collection(dbFirestore, "transactions"));
        const tStore = tx.objectStore('transactions');
        qTrans.forEach(doc => tStore.put(doc.data()));

        // Sync Settings
        const settingsRef = doc(dbFirestore, "settings", "storeInfo");
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            localStorage.setItem('store_phone', data.phone || '');
            if(document.getElementById('adminPhoneInput')) {
                document.getElementById('adminPhoneInput').value = data.phone || '';
            }
        }
        
        console.log("Sync Down Complete");
    } catch(e) { console.error("Sync Down Error", e); }
}

// === Authentication & App ===
window.checkAdminLogin = async function() {
    const passInput = document.getElementById('adminPassInput').value;
    const storeInput = document.getElementById('storeNameInput').value;
    const storedPass = localStorage.getItem('admin_pass');
    
    if(storeInput) localStorage.setItem('store_name', storeInput);

    let isValid = false;
    if (!storedPass) {
        // كلمة المرور الجديدة 1998
        if (passInput === '1998') {
            localStorage.setItem('admin_pass', hashPass('1998'));
            isValid = true;
        } else {
            document.getElementById('loginMsg').innerText = "كلمة المرور الافتراضية: 1998";
        }
    } else {
        if (hashPass(passInput) === storedPass) isValid = true;
        else document.getElementById('loginMsg').innerText = "كلمة المرور خاطئة";
    }

    if (isValid) {
        const inputs = document.getElementById('login-inputs');
        const title = document.getElementById('brand-title');
        const welcome = document.getElementById('welcome-brand');
        
        inputs.style.display = 'none';
        title.style.display = 'none';
        
        welcome.innerText = localStorage.getItem('store_name') || 'سجل الديون';
        welcome.classList.remove('hidden');
        
        gsap.from(welcome, {
            duration: 1.5, scale: 0.5, opacity: 0, rotation: 360, ease: "elastic.out(1, 0.3)",
            onComplete: unlockApp
        });
        
        // Start background sync
        syncDown().then(() => loadDashboard()); 
    }
};

function unlockApp() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    const storeName = localStorage.getItem('store_name');
    if(storeName) document.getElementById('headerStoreName').innerText = storeName;
    
    // Load saved phone
    const savedPhone = localStorage.getItem('store_phone');
    if(savedPhone) document.getElementById('adminPhoneInput').value = savedPhone;

    loadDashboard();
}

window.logout = function() { location.reload(); };

// === Dashboard ===
async function loadDashboard() {
    const tx = db.transaction(['customers', 'transactions'], 'readonly');
    const customers = await getAll(tx.objectStore('customers'));
    const transactions = await getAll(tx.objectStore('transactions'));

    let totalDebt = 0;
    const now = new Date();

    customers.forEach(c => {
        c.balance = 0;
        const myTrans = transactions.filter(t => t.customerId === c.id);
        myTrans.forEach(t => {
            if (t.type === 'debt' || t.type === 'sale') c.balance += parseFloat(t.amount);
            if (t.type === 'payment') c.balance -= parseFloat(t.amount);
        });
        
        if(myTrans.length > 0) {
            myTrans.sort((a,b) => new Date(b.date) - new Date(a.date));
            c.lastDate = myTrans[0].date;
            const diffTime = Math.abs(now - new Date(c.lastDate));
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            c.isOverdue = (diffDays > 30 && c.balance > 0);
        } else {
            c.lastDate = ''; c.isOverdue = false;
        }
    });

    totalDebt = customers.reduce((sum, c) => sum + c.balance, 0);
    document.getElementById('totalDebt').innerText = formatCurrency(totalDebt, 'IQD');
    document.getElementById('customerCount').innerText = customers.length;
    renderCustomersList(customers);
}

function renderCustomersList(customers) {
    const list = document.getElementById('customersList');
    list.innerHTML = '';
    
    customers.forEach(c => {
        const div = document.createElement('div');
        div.className = 'card glass flex flex-between';
        div.style.cursor = 'pointer';
        div.onclick = () => window.openCustomer(c.id);
        
        let statusClass = c.balance > 0 ? 'bg-danger' : 'bg-ok';
        let alertIcon = c.isOverdue ? '<span style="color:orange; font-size:1.2em;">⚠️</span>' : '';

        div.innerHTML = `
            <div>
                <strong>${c.name} ${alertIcon}</strong><br>
                <small>${c.phone}</small>
            </div>
            <div style="text-align:left">
                <span class="badge ${statusClass}">${formatCurrency(c.balance, c.currency)}</span><br>
                <small style="font-size:0.7em; color:#666">${c.lastDate || 'جديد'}</small>
            </div>
        `;
        list.appendChild(div);
    });
}

// === Customer Ops ===
window.addCustomer = async function() {
    const name = document.getElementById('newCustName').value;
    const phone = document.getElementById('newCustPhone').value;
    const whatsapp = document.getElementById('newCustWhatsapp').value;
    const currency = document.getElementById('newCustCurrency').value;
    const pass = document.getElementById('newCustPass').value;
    
    if(!name) return alert('الاسم مطلوب');

    const customer = {
        id: Date.now().toString(),
        name, phone, whatsapp, currency,
        passHash: pass ? hashPass(pass) : null,
        created: new Date().toISOString()
    };

    const tx = db.transaction(['customers'], 'readwrite');
    await tx.objectStore('customers').add(customer);
    
    // Sync
    await syncToFirebase('customers', customer);

    window.closeModal('modal-add-customer');
    document.getElementById('newCustName').value = '';
    document.getElementById('newCustPhone').value = '';
    document.getElementById('newCustWhatsapp').value = '';
    loadDashboard();
};

window.openCustomer = async function(id) {
    const tx = db.transaction(['customers', 'transactions'], 'readonly');
    const customer = await get(tx.objectStore('customers'), id);
    const allTrans = await getAll(tx.objectStore('transactions'));
    
    currentCustomer = customer;
    
    const custTrans = allTrans.filter(t => t.customerId === id).sort((a,b) => new Date(b.date) - new Date(a.date));
    let balance = 0;
    custTrans.slice().reverse().forEach(t => {
         if (t.type === 'debt' || t.type === 'sale') balance += parseFloat(t.amount);
         else balance -= parseFloat(t.amount);
    });

    document.getElementById('view-customer').classList.remove('hidden');
    gsap.from("#view-customer .container", {y: 50, opacity: 0, duration: 0.5});

    document.getElementById('custName').innerText = customer.name;
    document.getElementById('custPhone').innerText = customer.phone;
    document.getElementById('custBalance').innerText = formatCurrency(balance, customer.currency);
    
    const waBtn = document.getElementById('btnWhatsapp');
    if(customer.whatsapp) {
        waBtn.classList.remove('hidden');
        waBtn.href = `https://wa.me/${customer.whatsapp}`;
    } else {
        waBtn.classList.add('hidden');
    }

    const url = `${window.location.origin}${window.location.pathname.replace('index.html', '')}customer.html?id=${id}`;
    document.getElementById('custLink').value = url;

    renderTransactions(custTrans, customer.currency);
};

window.deleteCustomerBtn = async function() {
    if(!currentCustomer) return;
    if(confirm(`هل أنت متأكد من حذف الزبون (${currentCustomer.name}) وجميع سجلاته؟ لا يمكن التراجع.`)) {
        // Delete Transactions locally
        const tx = db.transaction(['customers', 'transactions'], 'readwrite');
        const allTrans = await getAll(tx.objectStore('transactions'));
        const myTrans = allTrans.filter(t => t.customerId === currentCustomer.id);
        
        myTrans.forEach(t => {
            tx.objectStore('transactions').delete(t.id);
            deleteFromFirebase('transactions', t.id);
        });

        // Delete Customer locally
        await tx.objectStore('customers').delete(currentCustomer.id);
        await deleteFromFirebase('customers', currentCustomer.id);

        alert('تم الحذف بنجاح');
        window.goHome();
    }
};

function renderTransactions(transactions, currency) {
    const list = document.getElementById('transactionsList');
    list.innerHTML = '';
    
    transactions.forEach(t => {
        const div = document.createElement('div');
        div.className = 'trans-item flex flex-between';
        
        let colorClass = (t.type === 'payment') ? 'trans-pay' : 'trans-debt';
        let typeName = t.type === 'debt' ? 'دين' : (t.type === 'payment' ? 'تسديد' : 'فاتورة');
        let itemDisplay = t.item ? `<span style="background:#eee; px:4px; border-radius:4px; font-size:0.8em">${t.item}</span>` : '';

        div.innerHTML = `
            <div>
                <strong class="${colorClass}">${typeName}</strong> ${itemDisplay} <br>
                <small>${t.date}</small> <small style="color:#777">${t.note || ''}</small>
            </div>
            <div>
                <strong class="${colorClass}">${formatCurrency(t.amount, currency)}</strong>
                ${t.type !== 'payment' ? `<button class="btn btn-sm btn-danger no-print" onclick="window.deleteTrans('${t.id}')">×</button>` : ''}
            </div>
        `;
        list.appendChild(div);
    });
}

// === Transactions ===
window.openTransModal = function(type) {
    currentTransType = type;
    let title = type === 'debt' ? 'إضافة دين' : (type === 'payment' ? 'إضافة تسديد' : 'فاتورة بيع');
    document.getElementById('transTitle').innerText = title;
    
    document.getElementById('transDate').valueAsDate = new Date();
    document.getElementById('transAmount').value = '';
    document.getElementById('transNote').value = '';
    document.getElementById('transItem').value = '';
    
    if(type === 'payment') document.getElementById('transItem').classList.add('hidden');
    else document.getElementById('transItem').classList.remove('hidden');

    window.showModal('modal-transaction');
};

window.saveTransaction = async function() {
    const amount = parseFloat(document.getElementById('transAmount').value);
    const note = document.getElementById('transNote').value;
    const item = document.getElementById('transItem').value;
    const date = document.getElementById('transDate').value;
    
    if(!amount || isNaN(amount)) return alert('المبلغ غير صحيح');

    const trans = {
        id: Date.now().toString(),
        customerId: currentCustomer.id,
        type: currentTransType,
        amount, note, item, date,
        timestamp: new Date().toISOString()
    };

    const tx = db.transaction(['transactions'], 'readwrite');
    await tx.objectStore('transactions').add(trans);
    
    await syncToFirebase('transactions', trans);

    window.closeModal('modal-transaction');
    window.openCustomer(currentCustomer.id);
};

window.deleteTrans = async function(id) {
    if(!confirm('حذف العملية؟')) return;
    const tx = db.transaction(['transactions'], 'readwrite');
    await tx.objectStore('transactions').delete(id);
    await deleteFromFirebase('transactions', id);
    
    tx.oncomplete = () => window.openCustomer(currentCustomer.id);
};

// === Settings ===
window.saveStoreSettings = async function() {
    const phone = document.getElementById('adminPhoneInput').value;
    if(phone) {
        localStorage.setItem('store_phone', phone);
        if(navigator.onLine) {
            try {
                await setDoc(doc(dbFirestore, "settings", "storeInfo"), { phone: phone });
                alert('تم حفظ الرقم ورفعه للسحابة');
            } catch(e) { alert('خطأ في الرفع للسحابة'); }
        } else {
            alert('تم الحفظ محلياً. سيتزامن عند الاتصال.');
        }
    }
};

window.changeAdminPass = function() {
    const newPass = document.getElementById('newAdminPass').value;
    if(newPass.length < 4) return alert('كلمة المرور قصيرة جداً');
    localStorage.setItem('admin_pass', hashPass(newPass));
    alert('تم تغيير كلمة المرور بنجاح!');
    document.getElementById('newAdminPass').value = '';
};

// === Utils & Globals ===
function get(store, key) {
    return new Promise((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
    });
}
function getAll(store) {
    return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });
}
function formatCurrency(num, currency = 'IQD') {
    if(currency === 'USD') return '$' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2 });
    return Number(num).toLocaleString('en-US') + ' د.ع';
}

window.filterCustomers = function() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    loadDashboard().then(() => {
        const items = document.querySelectorAll('#customersList > div');
        items.forEach(item => {
            const txt = item.innerText.toLowerCase();
            item.style.display = txt.includes(q) ? 'flex' : 'none';
        });
    });
};

window.switchTab = function(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
    gsap.from("#" + tabId, {opacity: 0, y: 10, duration: 0.3});
};

window.showModal = function(id) { document.getElementById(id).classList.remove('hidden'); };
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); };

window.goHome = function() { 
    document.getElementById('view-customer').classList.add('hidden');
    loadDashboard();
};

window.copyLink = function() {
    const copyText = document.getElementById("custLink");
    copyText.select();
    document.execCommand("copy");
    alert("تم نسخ الرابط");
};

// === Backup ===
window.exportData = async function() {
    const tx = db.transaction(['customers', 'transactions'], 'readonly');
    const c = await getAll(tx.objectStore('customers'));
    const t = await getAll(tx.objectStore('transactions'));
    const data = { customers: c, transactions: t, date: new Date() };
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
};

window.importData = async function(input) {
    if(!input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if(confirm(`استرجاع نسخة ${data.date}؟`)) {
                await clearDB();
                const tx = db.transaction(['customers', 'transactions'], 'readwrite');
                data.customers.forEach(async c => {
                    tx.objectStore('customers').put(c);
                    await syncToFirebase('customers', c);
                });
                data.transactions.forEach(async t => {
                    tx.objectStore('transactions').put(t);
                    await syncToFirebase('transactions', t);
                });
                alert('تم الاسترجاع');
                location.reload();
            }
        } catch(err) { alert('ملف غير صالح'); }
    };
    reader.readAsText(file);
};

window.clearAllData = async function() {
    if(confirm('هل أنت متأكد تماماً؟ سيتم حذف كل شيء!')) {
        indexedDB.deleteDatabase(DB_NAME);
        localStorage.clear();
        location.reload();
    }
};

async function clearDB() {
    const tx = db.transaction(['customers', 'transactions'], 'readwrite');
    tx.objectStore('customers').clear();
    tx.objectStore('transactions').clear();
    return new Promise(resolve => tx.oncomplete = resolve);
}

// Start
initDB();
