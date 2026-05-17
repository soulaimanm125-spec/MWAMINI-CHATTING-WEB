import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBtDMYBR0jcyK-JfgsYtET1SenPngzmQi4",
  authDomain: "mwamini-chatting-web.firebaseapp.com",
  databaseURL: "https://mwamini-chatting-web-default-rtdb.firebaseio.com",
  projectId: "mwamini-chatting-web",
  storageBucket: "mwamini-chatting-web.firebasestorage.app",
  messagingSenderId: "640958885512",
  appId: "1:640958885512:web:2f9a636acc85534009b93d",
  measurementId: "G-SW9FBXX78G"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null;
let activeChatId = null;
let unsubscribeMessages = null;

// ========================================================
// AUTHENTICATION ENGINE (Hybrid Registration & Guest Gate)
// ========================================================
export function initAuthPage() {
    let isRegisterMode = false;

    // Direct entry path check for existing Guest sessions
    const savedUid = localStorage.getItem("mwamini_guest_uid");
    const savedName = localStorage.getItem("mwamini_guest_name");
    if (savedUid && savedName) {
        window.location.href = "dashboard.html";
        return;
    }

    setPersistence(auth, browserLocalPersistence).then(() => {
        onAuthStateChanged(auth, (user) => {
            if (user) window.location.href = "dashboard.html";
        });
    });

    const authForm = document.getElementById("auth-form");
    const toggleBtn = document.getElementById("toggle-auth-mode");
    const guestBtn = document.getElementById("guest-mode-btn");
    const nameGroup = document.getElementById("name-field-group");
    const emailGroup = document.getElementById("email-field-group");
    const passGroup = document.getElementById("pass-field-group");
    const submitBtn = document.getElementById("submit-btn");
    const toggleMsg = document.getElementById("toggle-msg");
    const errorMsg = document.getElementById("error-message");

    if (toggleBtn) {
        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isRegisterMode = !isRegisterMode;
            nameGroup.classList.toggle("hidden", !isRegisterMode);
            emailGroup.classList.remove("hidden");
            passGroup.classList.remove("hidden");
            submitBtn.innerText = isRegisterMode ? "Register" : "Login";
            toggleMsg.innerText = isRegisterMode ? "Already have an account?" : "Don't have an account?";
            toggleBtn.innerText = isRegisterMode ? "Login here" : "Register here";
        });
    }

    if (guestBtn) {
        guestBtn.addEventListener("click", (e) => {
            e.preventDefault();
            nameGroup.classList.remove("hidden");
            emailGroup.classList.add("hidden");
            passGroup.classList.add("hidden");
            submitBtn.innerText = "Join as Guest";
            toggleMsg.innerText = "Want a permanent profile?";
            toggleBtn.innerText = "Register here";
            isRegisterMode = false;
        });
    }

    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            errorMsg.innerText = "";
            const name = document.getElementById("auth-name").value.trim();
            const email = document.getElementById("auth-email").value.trim();
            const password = document.getElementById("auth-password").value;

            // Execution path for Guest Mode submission
            if (emailGroup.classList.contains("hidden")) {
                if (!name) { errorMsg.innerText = "Please enter a Guest name."; return; }
                const guestUid = "guest_" + Math.random().toString(36).substring(2, 11);
                await setDoc(doc(db, "users", guestUid), {
                    uid: guestUid, name: name, type: "guest",
                    status: "Hey there! I am using Mwamini Chat.", isOnline: true
                });
                localStorage.setItem("mwamini_guest_uid", guestUid);
                localStorage.setItem("mwamini_guest_name", name);
                window.location.href = "dashboard.html";
                return;
            }

            try {
                if (isRegisterMode) {
                    const credentials = await createUserWithEmailAndPassword(auth, email, password);
                    await setDoc(doc(db, "users", credentials.user.uid), {
                        uid: credentials.user.uid,
                        name: name || email.split("@")[0],
                        email: email, type: "registered",
                        status: "Hey there! I am using Mwamini Chat.", isOnline: true
                    });
                } else {
                    const credentials = await signInWithEmailAndPassword(auth, email, password);
                    await updateDoc(doc(db, "users", credentials.user.uid), { isOnline: true });
                }
            } catch (error) { errorMsg.innerText = error.message; }
        });
    }
}

// ========================================================
// MESSENGER CORE ENGINE & CUSTOMIZATION CONFIGURATOR
// ========================================================
export function initDashboardPage() {
    const savedUid = localStorage.getItem("mwamini_guest_uid");
    const savedName = localStorage.getItem("mwamini_guest_name");

    if (savedUid && savedName) {
        currentUser = { uid: savedUid, name: savedName, type: "guest" };
        setupDashboardSession();
    } else {
        onAuthStateChanged(auth, async (user) => {
            if (!user) { window.location.href = "index.html"; } 
            else {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                currentUser = userDoc.data();
                setupDashboardSession();
            }
        });
    }
}

function setupDashboardSession() {
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true });

    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("current-user-title").innerText = data.name;
            document.getElementById("my-status-display").innerText = data.status || "";
            if (data.avatarUrl) {
                document.getElementById("my-profile-preview").src = data.avatarUrl;
            }
        }
    });

    loadIsolatedSidebar();
    attachCustomizationListeners();
}

function attachCustomizationListeners() {
    // Status Bar implementation moved above central chat area
    document.getElementById("update-status-btn")?.addEventListener("click", async () => {
        const inputField = document.getElementById("status-input");
        const newStatus = inputField.value.trim();
        if (!newStatus) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: newStatus });
        inputField.value = "";
    });

    // Profile Picture updates module
    document.getElementById("avatar-upload-input")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const avatarRef = ref(storage, `avatars/${currentUser.uid}`);
            const snapshot = await uploadBytes(avatarRef, file);
            const downloadUrl = await getDownloadURL(snapshot.ref);
            await updateDoc(doc(db, "users", currentUser.uid), { avatarUrl: downloadUrl });
            alert("Profile image updated successfully!");
        } catch (err) { alert("Avatar update failure: " + err.message); }
    });

    // Conversation background switcher module
    document.getElementById("bg-color-picker")?.addEventListener("input", (e) => {
        document.getElementById("message-stream").style.backgroundImage = "none";
        document.getElementById("message-stream").style.backgroundColor = e.target.value;
    });

    document.getElementById("logout-btn")?.addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false });
        if (currentUser.type === "guest") {
            localStorage.clear();
            window.location.href = "index.html";
        } else {
            signOut(auth).then(() => { window.location.href = "index.html"; });
        }
    });

    document.getElementById("message-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        const messageText = input.value.trim();
        if (!messageText || !activeChatId) return;
        input.value = "";
        await addDoc(collection(db, "chats", activeChatId, "messages"), {
            text: messageText, type: "text", senderId: currentUser.uid, createdAt: serverTimestamp()
        });
    });

    document.getElementById("file-input")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;
        try {
            const storagePathRef = ref(storage, `shared_files/${activeChatId}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storagePathRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            let fileTypeMetadata = "document";
            if (file.type.startsWith("image/")) fileTypeMetadata = "image";
            else if (file.type.startsWith("video/")) fileTypeMetadata = "video";
            else if (file.type.startsWith("audio/")) fileTypeMetadata = "audio";

            await addDoc(collection(db, "chats", activeChatId, "messages"), {
                text: file.name, fileUrl: downloadURL, type: fileTypeMetadata, senderId: currentUser.uid, createdAt: serverTimestamp()
            });
        } catch (error) { alert("File shared transfer failure: " + error.message); }
    });
}

function loadIsolatedSidebar() {
    const q = query(collection(db, "users"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("users-container");
        if (!container) return;
        container.innerHTML = "";
        snapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            if (userData.uid !== currentUser.uid) {
                // Privacy Filter implementation: Guest profiles and Registered profiles remain separated
                if (currentUser.type === "guest" && userData.type !== "guest") return;
                if (currentUser.type === "registered" && userData.type === "guest") return;

                const item = document.createElement("div");
                item.className = "wa-user-item";
                const activeBadgeClass = userData.isOnline ? "badge-online" : "badge-offline";
                const avatarRender = userData.avatarUrl ? `<img src="${userData.avatarUrl}" class="wa-avatar-img">` : `<div class="wa-avatar">${userData.name.charAt(0).toUpperCase()}</div>`;

                item.innerHTML = `
                    <div class="wa-avatar-container">${avatarRender}<span class="presence-dot ${activeBadgeClass}"></span></div>
                    <div class="wa-user-info">
                        <div class="wa-user-header-row">
                            <h4>${userData.name}</h4>
                            <span class="presence-status-text ${activeBadgeClass}">${userData.isOnline ? "● Online" : "Offline"}</span>
                        </div>
                        <p class="wa-user-status-text">💬 ${userData.status || 'Available'}</p>
                    </div>
                `;
                item.addEventListener("click", () => openWhatsAppChat(userData));
                container.appendChild(item);
            }
        });
    });
}

async function openWhatsAppChat(targetUser) {
    // Generate private hash combinations
    activeChatId = [currentUser.uid, targetUser.uid].sort().join("_");
    document.getElementById("no-chat-selected").classList.add("hidden");
    document.getElementById("active-chat-area").classList.remove("hidden");
    document.getElementById("chat-header-name").innerText = targetUser.name;

    const chatRef = doc(db, "chats", activeChatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
        await setDoc(chatRef, { chatId: activeChatId, participants: [currentUser.uid, targetUser.uid], updatedAt: serverTimestamp() });
    }
    listenToWhatsAppMessages();
}

function listenToWhatsAppMessages() {
    if (unsubscribeMessages) unsubscribeMessages();
    const mQuery = query(collection(db, "chats", activeChatId, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMessages = onSnapshot(mQuery, (snapshot) => {
        const stream = document.getElementById("message-stream");
        if (!stream) return;
        stream.innerHTML = "";
        snapshot.forEach((msgDoc) => {
            const msg = msgDoc.data();
            const bubbleRow = document.createElement("div");
            bubbleRow.className = `wa-message-row ${msg.senderId === currentUser.uid ? 'row-sent' : 'row-received'}`;
            let messageContentHTML = "";
            if (msg.type === "image") messageContentHTML = `<img src="${msg.fileUrl}" class="shared-media-img" alt="Shared Image" onclick="window.open('${msg.fileUrl}')">`;
            else if (msg.type === "video") messageContentHTML = `<video src="${msg.fileUrl}" controls class="shared-media-video"></video>`;
            else if (msg.type === "audio") messageContentHTML = `<audio src="${msg.fileUrl}" controls class="shared-media-audio"></audio>`;
            else if (msg.type === "document") messageContentHTML = `<div class="shared-doc-box" onclick="window.open('${msg.fileUrl}')"><span>📄</span><div class="doc-details"><p class="doc-name">${msg.text}</p><small>Click to view</small></div></div>`;
            else messageContentHTML = `<p class="bubble-text">${msg.text}</p>`;

            bubbleRow.innerHTML = `<div class="wa-bubble">${messageContentHTML}</div>`;
            stream.appendChild(bubbleRow);
        });
        stream.scrollTop = stream.scrollHeight;
    });
}
