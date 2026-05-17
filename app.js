import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. Firebase Configuration Profile
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// 2. Initialize Core Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let activeChatId = null;
let unsubscribeMessages = null;

// Export instances to windows context so page-specific code can access it if needed
window.firebaseAuth = auth;
window.firebaseDb = db;

// ==========================================
// 3. AUTHENTICATION ENGINE (index.html)
// ==========================================
export function initAuthPage() {
    let isRegisterMode = false;

    // Persist logins cleanly through browser tabs and page refreshes
    setPersistence(auth, browserLocalPersistence).then(() => {
        onAuthStateChanged(auth, (user) => {
            if (user) window.location.href = "dashboard.html";
        });
    });

    const authForm = document.getElementById("auth-form");
    const toggleBtn = document.getElementById("toggle-auth-mode");
    const nameGroup = document.getElementById("name-field-group");
    const submitBtn = document.getElementById("submit-btn");
    const toggleMsg = document.getElementById("toggle-msg");
    const errorMsg = document.getElementById("error-message");

    if (toggleBtn) {
        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            nameGroup.classList.toggle("hidden", !isRegisterMode);
            submitBtn.innerText = isRegisterMode ? "Register" : "Login";
            toggleMsg.innerText = isRegisterMode ? "Already have an account?" : "Don't have an account?";
            toggleBtn.innerText = isRegisterMode ? "Login here" : "Register here";
        });
    }

    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            errorMsg.innerText = "";
            const email = document.getElementById("auth-email").value;
            const password = document.getElementById("auth-password").value;
            const name = document.getElementById("auth-name").value;

            try {
                if (isRegisterMode) {
                    const credentials = await createUserWithEmailAndPassword(auth, email, password);
                    await setDoc(doc(db, "users", credentials.user.uid), {
                        uid: credentials.user.uid,
                        name: name || email.split("@")[0],
                        email: email,
                        photoURL: ""
                    });
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                }
            } catch (error) {
                errorMsg.innerText = error.message;
            }
        });
    }
}

// ==========================================
// 4. MESSENGER DASHBOARD ENGINE (dashboard.html)
// ==========================================
export function initDashboardPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "index.html";
        } else {
            currentUser = user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                document.getElementById("current-user-name").innerText = userDoc.data().name;
            }
            loadUsersSidebar();
        }
    });

    document.getElementById("logout-btn")?.addEventListener("click", () => {
        signOut(auth).then(() => { window.location.href = "index.html"; });
    });

    document.getElementById("message-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        const messageText = input.value.trim();
        if (!messageText || !activeChatId) return;

        input.value = "";
        await addDoc(collection(db, "chats", activeChatId, "messages"), {
            text: messageText,
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
        });
    });
}

// Fetch all registered profile items in real time
function loadUsersSidebar() {
    const q = query(collection(db, "users"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("users-container");
        if (!container) return;
        container.innerHTML = "";
        snapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            if (userData.uid !== currentUser.uid) {
                const item = document.createElement("div");
                item.className = "user-item";
                item.innerHTML = `
                    <div class="avatar">${userData.name.charAt(0).toUpperCase()}</div>
                    <div class="user-info">
                        <h4>${userData.name}</h4>
                        <p>${userData.email}</p>
                    </div>
                `;
                item.addEventListener("click", () => startOrLoadChat(userData));
                container.appendChild(item);
            }
        });
    });
}

// Unique Room Router logic preventing creation duplicates
async function startOrLoadChat(targetUser) {
    activeChatId = [currentUser.uid, targetUser.uid].sort().join("_");
    document.getElementById("no-chat-selected").classList.add("hidden");
    document.getElementById("active-chat-area").classList.remove("hidden");
    document.getElementById("active-user-title").innerText = targetUser.name;

    const chatRef = doc(db, "chats", activeChatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
        await setDoc(chatRef, {
            chatId: activeChatId,
            participants: [currentUser.uid, targetUser.uid],
            updatedAt: serverTimestamp()
        });
    }

    listenToMessageStream();
}

// Instantly pulls message subcollection items ordered by time
function listenToMessageStream() {
    if (unsubscribeMessages) unsubscribeMessages();

    const mQuery = query(collection(db, "chats", activeChatId, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMessages = onSnapshot(mQuery, (snapshot) => {
        const stream = document.getElementById("message-stream");
        if (!stream) return;
        stream.innerHTML = "";
        snapshot.forEach((msgDoc) => {
            const msg = msgDoc.data();
            const bubble = document.createElement("div");
            bubble.className = `message-bubble ${msg.senderId === currentUser.uid ? 'sent' : 'received'}`;
            bubble.innerText = msg.text;
            stream.appendChild(bubble);
        });
        stream.scrollTop = stream.scrollHeight;
    });
}