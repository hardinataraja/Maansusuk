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

// Global State
let cart = [];

// === KEAMANAN & ROLE ===
function checkAccess() {
    const role = localStorage.getItem("userRole");
    
    // Jika tidak ada session login, tendang ke login.html
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "login.html";
        }
    });

    // Jika admin, tambahkan class ke body untuk memunculkan tombol edit/hapus
    if (role === "admin") {
        document.body.classList.add("is-admin");
    }
}

window.logout = () => {
    signOut(auth).then(() => {
        localStorage.clear();
        window.location.href = "login.html";
    });
};

// === UI FUNCTIONS ===
window.showSection = (id, btn) => {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn, .bottom-nav button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

window.openModal = (id) => document.getElementById(id).classList.add('show');
window.closeModal = (id) => document.getElementById(id).classList.remove('show');

// === KASIR LOGIC ===
document.getElementById("btnAddItem").addEventListener("click", () => {
    const sel = document.getElementById("selectProduct");
    const opt = sel.options[sel.selectedIndex];
    const qty = Number(document.getElementById("transQty").value);
    if(!sel.value || qty < 1) return;

    cart.push({ 
        id: sel.value, 
        name: opt.text.split(' (')[0], 
        price: Number(opt.dataset.price), 
        qty: qty 
    });
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

// === CHECKOUT TRANSACTION ===
document.getElementById("btnCheckout").addEventListener("click", async () => {
    const driverId = document.getElementById("selectDriver").value;
    if(!driverId || cart.length === 0) return Swal.fire("Oops!", "Pilih driver & isi keranjang", "warning");

    const result = await Swal.fire({ 
        title: 'Simpan Transaksi?', 
        text: "Stok akan otomatis terpotong!", 
        icon: 'question', 
        showCancelButton: true 
    });

    if (result.isConfirmed) {
        try {
            let grandTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
            let commission = grandTotal * 0.5;

            await runTransaction(db, async (transaction) => {
                const productUpdates = [];
                for (const item of cart) {
                    const pRef = doc(db, "products", item.id);
                    const pSnap = await transaction.get(pRef);
                    if (!pSnap.exists()) throw "Produk tidak ditemukan!";
                    if (pSnap.data().stock < item.qty) throw `Stok ${item.name} tidak cukup!`;
                    productUpdates.push({ ref: pRef, newStock: Number(pSnap.data().stock) - item.qty });
                }

                const dRef = doc(db, "drivers", driverId);
                const dSnap = await transaction.get(dRef);
                if (!dSnap.exists()) throw "Driver tidak ditemukan!";

                productUpdates.forEach(p => transaction.update(p.ref, { stock: p.newStock }));
                transaction.update(dRef, { unpaidCommission: increment(commission) });
                
                const tRef = doc(collection(db, "transactions"));
                transaction.set(tRef, { 
                    driverId, items: cart, totalPrice: grandTotal, 
                    totalCommission: commission, createdAt: serverTimestamp() 
                });
            });

            Swal.fire("Berhasil!", "Transaksi selesai", "success");
            cart = []; renderCart();
        } catch (e) { Swal.fire("Gagal", e.toString(), "error"); }
    }
});

// === DRIVER & PRODUCT ACTIONS (ADMIN ONLY LOGIC) ===
window.payCommission = async (id, name, amount) => {
    if(localStorage.getItem("userRole") !== "admin") return Swal.fire("Akses Ditolak", "Hanya Admin yang bisa bayar komisi", "error");
    // ... logika bayar ...
    const res = await Swal.fire({ title: 'Bayar Komisi?', text: `Lunas Rp ${amount.toLocaleString()}?`, icon: 'warning', showCancelButton: true });
    if(res.isConfirmed) {
        await updateDoc(doc(db, "drivers", id), { unpaidCommission: 0 });
        Swal.fire("Lunas!", "Status direset", "success");
    }
};

window.sendWaReminder = (wa, name, amount) => {
    const msg = `Halo ${name}, komisi Rp ${amount.toLocaleString()} sudah siap diambil.`;
    window.open(`https://wa.me/62${wa.replace(/^0/, '')}?text=${encodeURIComponent(msg)}`, '_blank');
};

window.editDriver = (id, name, plate, wa) => {
    document.getElementById("editDriverId").value = id;
    document.getElementById("editDriverName").value = name;
    document.getElementById("editDriverPlate").value = plate;
    document.getElementById("editDriverWA").value = wa;
    openModal("editDriverModal");
};

window.deleteDriver = async (id, name) => {
    const res = await Swal.fire({ title: 'Hapus?', text: name, icon: 'warning', showCancelButton: true });
    if(res.isConfirmed) await deleteDoc(doc(db, "drivers", id));
};

window.editProduct = (id, name, price, stock) => {
    document.getElementById("editProductId").value = id;
    document.getElementById("editProductName").value = name;
    document.getElementById("editProductPrice").value = price;
    document.getElementById("editProductStock").value = stock;
    openModal("editProductModal");
};

window.deleteProduct = async (id, name) => {
    const res = await Swal.fire({ title: 'Hapus?', text: name, icon: 'warning', showCancelButton: true });
    if(res.isConfirmed) await deleteDoc(doc(db, "products", id));
};

// === SYNC DATA ===
function syncAll() {
    onSnapshot(collection(db, "products"), (snap) => {
        const table = document.getElementById("productsTableBody");
        const sel = document.getElementById("selectProduct");
        let totalStok = 0; table.innerHTML = ""; sel.innerHTML = '<option value="">Pilih Produk</option>';
        snap.forEach(docSnap => {
            const d = docSnap.data(); totalStok += Number(d.stock || 0);
            table.innerHTML += `<tr>
                <td>${d.name}</td><td>Rp ${d.price.toLocaleString()}</td><td>${d.stock}</td>
                <td class="admin-only">
                    <button class="btn-edit" onclick="editProduct('${docSnap.id}','${d.name}',${d.price},${d.stock})">Edit</button>
                    <button class="btn-delete" onclick="deleteProduct('${docSnap.id}','${d.name}')">X</button>
                </td>
            </tr>`;
            sel.innerHTML += `<option value="${docSnap.id}" data-price="${d.price}">${d.name} (Stok: ${d.stock})</option>`;
        });
        document.getElementById("dashStok").innerText = totalStok + " pcs";
    });

    onSnapshot(collection(db, "drivers"), (snap) => {
        const table = document.getElementById("driversTableBody");
        const sel = document.getElementById("selectDriver");
        let totalUnpaid = 0; table.innerHTML = ""; sel.innerHTML = '<option value="">Pilih Driver</option>';
        snap.forEach(dDoc => {
            const d = dDoc.data(); const unpaid = d.unpaidCommission || 0; totalUnpaid += unpaid;
            table.innerHTML += `<tr>
                <td><strong>${d.name}</strong></td><td class="txt-red">Rp ${unpaid.toLocaleString()}</td>
                <td><span class="badge ${unpaid > 0 ? 'badge-red' : 'badge-green'}">${unpaid > 0 ? 'Unpaid' : 'Clear'}</span></td>
                <td class="admin-only">
                    <button class="btn-edit" onclick="editDriver('${dDoc.id}','${d.name}','${d.plate}','${d.wa}')">Edit</button>
                    <button class="btn-delete" onclick="deleteDriver('${dDoc.id}','${d.name}')">X</button>
                </td>
                <td>
                    <button class="admin-only" onclick="payCommission('${dDoc.id}','${d.name}',${unpaid})">Paid</button>
                    <button onclick="sendWaReminder('${d.wa}','${d.name}',${unpaid})">WA</button>
                </td>
            </tr>`;
            sel.innerHTML += `<option value="${dDoc.id}">${d.name}</option>`;
        });
        document.getElementById("dashComm").innerText = "Rp " + totalUnpaid.toLocaleString();
    });
}

// Jalankan sistem
checkAccess();
syncAll();
lucide.createIcons();
