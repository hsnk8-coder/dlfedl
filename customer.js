import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

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

const DB_NAME = 'DebtAppDB';
const DB_VERSION = 2;
let db;
let customerId = null;

const urlParams = new URLSearchParams(window.location.search);
customerId = urlParams.get('id');

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
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e);
    });
}

window.verifyCustomer = async function() {
    const input = document.getElementById('custPassInput').value;
    if(!customerId) {
        document.getElementById('msg').innerText = "رابط غير صالح";
        return;
    }

    const tx = db.transaction(['customers'], 'readonly');
    const store = tx.objectStore('customers');
    const req = store.get(customerId);
    
    req.onsuccess = () => {
        const cust = req.result;
        if (!cust) {
            document.getElementById('msg').innerText = "حساب غير موجود";
            return;
        }

        if (cust.passHash) {
            if (hashPass(input) === cust.passHash) {
                loadCustomerData(cust);
            } else {
                document.getElementById('msg').innerText = "كلمة المرور خاطئة";
            }
        } else {
            loadCustomerData(cust);
        }
    };
};

async function loadCustomerData(cust) {
    document.getElementById('cust-login').classList.add('hidden');
    document.getElementById('cust-view').classList.remove('hidden');
    
    document.getElementById('cName').innerText = cust.name;

    const tx = db.transaction(['transactions'], 'readonly');
    const allTransReq = tx.objectStore('transactions').getAll();
    
    allTransReq.onsuccess = async () => {
        const allTrans = allTransReq.result;
        const myTrans = allTrans.filter(t => t.customerId === customerId);
        
        let balance = 0;
        myTrans.forEach(t => {
            if (t.type === 'debt' || t.type === 'sale') balance += parseFloat(t.amount);
            else balance -= parseFloat(t.amount);
        });

        let currency = cust.currency || 'IQD';
        let symbol = currency === 'USD' ? '$' : 'د.ع';
        
        document.getElementById('cBalance').innerText = 
            currency === 'USD' 
            ? '$' + Number(balance).toLocaleString() 
            : Number(balance).toLocaleString() + ' د.ع';

        if(balance > 0 && myTrans.length > 0) {
            myTrans.sort((a,b) => new Date(b.date) - new Date(a.date));
            const lastDate = new Date(myTrans[0].date);
            const now = new Date();
            const diffTime = Math.abs(now - lastDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if(diffDays > 30) {
                document.getElementById('paymentAlert').style.display = 'block';
            }
        }

        const list = document.getElementById('cTransList');
        myTrans.sort((a,b) => new Date(b.date) - new Date(a.date)); 
        
        myTrans.forEach(t => {
            const div = document.createElement('div');
            div.className = 'trans-item flex flex-between';
            div.style.padding = "10px";
            div.style.background = "rgba(255,255,255,0.7)";
            div.style.marginBottom = "5px";
            div.style.borderRadius = "8px";
            
            let color = t.type === 'payment' ? 'green' : 'red';
            let label = t.type === 'payment' ? 'تسديد' : (t.type === 'sale' ? 'شراء' : 'دين');
            let itemTxt = t.item ? `(${t.item})` : '';

            div.innerHTML = `
                <div>
                    <strong>${t.date}</strong><br>
                    <small>${itemTxt} ${t.note || ''}</small>
                </div>
                <div style="color:${color}; font-weight:bold;">
                    ${label} ${Number(t.amount).toLocaleString()} ${symbol}
                </div>
            `;
            list.appendChild(div);
        });

        // جلب رقم المدير من الفايربيس
        let adminPhone = "9647700000000"; // افتراضي
        try {
            const settingsRef = doc(dbFirestore, "settings", "storeInfo");
            const settingsSnap = await getDoc(settingsRef);
            if (settingsSnap.exists()) {
                const data = settingsSnap.data();
                if(data.phone) adminPhone = data.phone;
            }
        } catch(e) { console.log('Offline or Error fetching phone'); }

        const msg = `مرحباً، بخصوص حسابي: ${cust.name}`;
        document.getElementById('waLink').href = `https://wa.me/${adminPhone}?text=${encodeURIComponent(msg)}`;
    };
}

initDB();
