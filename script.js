import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, serverTimestamp, 
    query, where, doc, updateDoc, increment, runTransaction, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDDBE7Lq1Dcy_piqmFA9G76H-4LgySm4a4",
    authDomain: "maansusuk.firebaseapp.com",
    projectId: "maansusuk",
    storageBucket: "maansusuk.firebasestorage.app",
    messagingSenderId: "1002293117764",
    appId: "1:1002293117764:web:a4aa932b34526dd9bccd11"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let cart = [];

function checkAccess() {
    const role = localStorage.getItem("userRole");
    onAuthStateChanged(auth, (user) => {
        if (!user) window.location.href = "login.html";
    });
    if (role === "admin") document.body.classList.add("is-admin");
}

window.logout = () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "login.html";
    });
};

window.showSection = (id, btn) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn, .bottom-nav button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

window.openModal = (id) => document.getElementById(id).classList.add('show');
window.closeModal = (id) => document.getElementById(id).classList.remove('show');

// KASIR
document.getElementById("btnAddItem").addEventListener("click", () => {
    const sel = document.getElementById("selectProduct");
    const opt = sel.options[sel.selectedIndex];
    const qty = Number(document.getElementById("transQty").value);
    if(!sel.value || qty < 1) return;
    cart.push({ id: sel.value, name: opt.text.split(' (')[0], price: Number(opt.dataset.price), qty: qty });
    renderCart();
});

function renderCart() {
    const container = document.getElementById("cartList");
    container.innerHTML = ""; let total = 0;
    cart.forEach((item) => {
        total += (item.price * item.qty);
        container.innerHTML += `<div class="cart-item"><span>${item.name} x${item.qty}</span><span>Rp ${(item.price * item.qty).toLocaleString()}</span></div>`;
    });
    document.getElementById("txtTotal").innerText = "Rp " + total.toLocaleString();
    document.getElementById("txtComm").innerText = "Rp " + (total * 0.5).toLocaleString();
}

document.getElementById("btnCheckout").addEventListener("click", async () => {
    const driverId = document.getElementById("selectDriver").value;
    if(!driverId || cart.length === 0) return Swal.fire("Oops!", "Pilih driver & isi keranjang", "warning");
    const result = await Swal.fire({ title: 'Simpan Transaksi?', text: "Stok otomatis terpotong!", icon: 'question', showCancelButton: true });

    if (result.isConfirmed) {
        try {
            let total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
            let comm = total * 0.5;
            await runTransaction(db, async (transaction) => {
                const updates = [];
                for (const item of cart) {
                    const pRef = doc(db, "products", item.id);
                    const pSnap = await transaction.get(pRef);
                    if (pSnap.data().stock < item.qty) throw `Stok ${item.name} kurang!`;
                    updates.push({ ref: pRef, newStock: Number(pSnap.data().stock) - item.qty });
                }
                updates.forEach(u => transaction.update(u.ref, { stock: u.newStock }));
                transaction.update(doc(db, "drivers", driverId), { unpaidCommission: increment(comm) });
                transaction.set(doc(collection(db, "transactions")), { driverId, items: cart, totalPrice: total, totalCommission: comm, createdAt: serverTimestamp() });
            });
            Swal.fire("Berhasil!", "Transaksi disimpan", "success");
            cart = []; renderCart();
        } catch (e) { Swal.fire("Gagal", e.toString(), "error"); }
    }
});

// ACTIONS (EDIT/DELETE)
window.updateDriver = async () => {
    const id = document.getElementById("editDriverId").value;
    try {
        await updateDoc(doc(db, "drivers", id), {
            name: document.getElementById("editDriverName").value,
            plate: document.getElementById("editDriverPlate").value,
            wa: document.getElementById("editDriverWA").value
        });
        closeModal("editDriverModal");
        Swal.fire("Selesai", "Driver diperbarui", "success");
    } catch (e) { Swal.fire("Error", e.message, "error"); }
};

window.updateProduct = async () => {
    const id = document.getElementById("editProductId").value;
    try {
        await updateDoc(doc(db, "products", id), {
            name: document.getElementById("editProductName").value,
            price: Number(document.getElementById("editProductPrice").value),
            stock: Number(document.getElementById("editProductStock").value)
        });
        closeModal("editProductModal");
        Swal.fire("Selesai", "Produk diperbarui", "success");
    } catch (e) { Swal.fire("Error", e.message, "error"); }
};

window.editDriver = (id, n, p, w) => {
    document.getElementById("editDriverId").value = id;
    document.getElementById("editDriverName").value = n;
    document.getElementById("editDriverPlate").value = p;
    document.getElementById("editDriverWA").value = w;
    openModal("editDriverModal");
};

window.editProduct = (id, n, p, s) => {
    document.getElementById("editProductId").value = id;
    document.getElementById("editProductName").value = n;
    document.getElementById("editProductPrice").value = p;
    document.getElementById("editProductStock").value = s;
    openModal("editProductModal");
};

window.deleteDriver = async (id, n) => {
    if((await Swal.fire({title:'Hapus?', text:n, showCancelButton:true})).isConfirmed) await deleteDoc(doc(db,"drivers",id));
};

window.deleteProduct = async (id, n) => {
    if((await Swal.fire({title:'Hapus?', text:n, showCancelButton:true})).isConfirmed) await deleteDoc(doc(db,"products",id));
};

window.payCommission = async (id, n, a) => {
    if(localStorage.getItem("userRole")!=="admin") return;
    if((await Swal.fire({title:'Bayar?', text:`Rp ${a.toLocaleString()}`, showCancelButton:true})).isConfirmed) {
        await updateDoc(doc(db,"drivers",id), {unpaidCommission: 0});
    }
};

window.sendWaReminder = (wa, n, a) => {
    window.open(`https://wa.me/62${wa.replace(/^0/,'')}?text=Halo ${n}, komisi Rp ${a.toLocaleString()} siap diambil.`,'_blank');
};

// SYNC DATA & DASHBOARD
function syncAll() {
    onSnapshot(collection(db, "products"), (snap) => {
        const table = document.getElementById("productsTableBody");
        const sel = document.getElementById("selectProduct");
        let totalStok = 0; table.innerHTML = ""; sel.innerHTML = '<option value="">Pilih Produk</option>';
        snap.forEach(s => {
            const d = s.data(); totalStok += Number(d.stock || 0);
            table.innerHTML += `<tr><td>${d.name}</td><td>Rp ${d.price.toLocaleString()}</td><td>${d.stock}</td>
            <td class="admin-only"><button onclick="editProduct('${s.id}','${d.name}',${d.price},${d.stock})">Edit</button>
            <button onclick="deleteProduct('${s.id}','${d.name}')">X</button></td></tr>`;
            sel.innerHTML += `<option value="${s.id}" data-price="${d.price}">${d.name} (Stok: ${d.stock})</option>`;
        });
        document.getElementById("dashStok").innerText = totalStok + " pcs";
    });

    onSnapshot(collection(db, "drivers"), (snap) => {
        const table = document.getElementById("driversTableBody");
        const sel = document.getElementById("selectDriver");
        let unpaidTotal = 0; table.innerHTML = ""; sel.innerHTML = '<option value="">Pilih Driver</option>';
        snap.forEach(s => {
            const d = s.data(); const u = d.unpaidCommission || 0; unpaidTotal += u;
            table.innerHTML += `<tr><td><strong>${d.name}</strong></td><td class="txt-red">Rp ${u.toLocaleString()}</td>
            <td><span class="badge ${u>0?'badge-red':'badge-green'}">${u>0?'Unpaid':'Clear'}</span></td>
            <td class="admin-only"><button onclick="editDriver('${s.id}','${d.name}','${d.plate}','${d.wa}')">Edit</button></td>
            <td><button class="admin-only" onclick="payCommission('${s.id}','${d.name}',${u})">Paid</button>
            <button onclick="sendWaReminder('${d.wa}','${d.name}',${u})">WA</button></td></tr>`;
            sel.innerHTML += `<option value="${s.id}">${d.name}</option>`;
        });
        document.getElementById("dashComm").innerText = "Rp " + unpaidTotal.toLocaleString();
    });

    // Dashboard Penjualan Hari Ini
    const today = new Date(); today.setHours(0,0,0,0);
    onSnapshot(query(collection(db, "transactions"), where("createdAt", ">=", today)), (snap) => {
        let sales = 0;
        snap.forEach(doc => sales += Number(doc.data().totalPrice || 0));
        document.getElementById("dashSales").innerText = "Rp " + sales.toLocaleString();
    });
}

checkAccess();
syncAll();
lucide.createIcons();
