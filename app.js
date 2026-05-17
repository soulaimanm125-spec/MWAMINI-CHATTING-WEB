import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// 1. Firebase Core Credentials
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

// 2. Initialize Instances
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null; 
let activeChatId = null;
let unsubscribeMessages = null;

// ========================================================
// 3. SECURE AUTHENTICATION HUB (Dual Gate System)
// ========================================================
export function initAuthPage() {
    let isRegisterMode = false;

    // Check existing browser tokens
    const cachedUid = localStorage.getItem("session_uid");
    const cachedMode = localStorage.getItem("session_account_mode");

    if (cachedUid && cachedMode) {
        window.location.href = "dashboard.html";
        return;
    }

    const authForm = document.getElementById("auth-form");
    const toggleBtn = document.getElementById("toggle-auth-mode");
    const nameGroup = document.getElementById("name-field-group");
    const emailGroup = document.getElementById("email-field-group");
    const passwordGroup = document.getElementById("password-field-group");
    const submitBtn = document.getElementById("submit-btn");
    const toggleMsg = document.getElementById("toggle-msg");
    const errorMsg = document.getElementById("error-message");
    const guestTriggerBtn = document.getElementById("guest-mode-trigger-btn");

    // Initialize UI into clean Login view state matching traditional forms
    nameGroup.classList.add("hidden");

    toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        nameGroup.classList.toggle("hidden", !isRegisterMode);
        submitBtn.innerText = isRegisterMode ? "Register Account" : "Login";
        toggleMsg.innerText = isRegisterMode ? "Already have an account?" : "Don't have an account?";
        toggleBtn.innerText = isRegisterMode ? "Login here" : "Register here";
    });

    // Option A: Handle Authenticated Operations
    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        errorMsg.innerText = "";
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value;
        const name = document.getElementById("auth-name").value.trim();

        try {
            if (isRegisterMode) {
                const credentials = await createUserWithEmailAndPassword(auth, email, password);
                const userObject = {
                    uid: credentials.user.uid,
                    name: name || email.split("@")[0],
                    email: email,
                    accountMode: "REGISTERED",
                    status: "Hey there! I am using Mwamini Chat.",
                    avatarUrl: "",
                    isOnline: true
                };
                await setDoc(doc(db, "users", credentials.user.uid), userObject);
                setLocalSessionTokens(credentials.user.uid, name || email.split("@")[0], "REGISTERED");
            } else {
                const credentials = await signInWithEmailAndPassword(auth, email, password);
                const docSnap = await getDoc(doc(db, "users", credentials.user.uid));
                const remoteName = docSnap.exists() ? docSnap.data().name : email.split("@")[0];
                await updateDoc(doc(db, "users", credentials.user.uid), { isOnline: true });
                setLocalSessionTokens(credentials.user.uid, remoteName, "REGISTERED");
            }
            window.location.href = "dashboard.html";
        } catch (error) {
            errorMsg.innerText = error.message;
        }
    });

    // Option B: Isolated Anonymous Guest Access
    guestTriggerBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const chosenGuestName = prompt("Please enter a fast temporary Guest Alias name to continue:");
        if (!chosenGuestName || !chosenGuestName.trim()) return;

        try {
            const structuralGuestUid = "guest_" + Math.random().toString(36).substring(2, 11);
            const userObject = {
                uid: structuralGuestUid,
                name: chosenGuestName.trim() + " (Guest)",
                email: "anonymous-guest-mode-pool",
                accountMode: "GUEST",
                status: "Browsing securely in temporary Guest Mode.",
                avatarUrl: "",
                isOnline: true
            };
            await setDoc(doc(db, "users", structuralGuestUid), userObject);
            setLocalSessionTokens(structuralGuestUid, chosenGuestName.trim() + " (Guest)", "GUEST");
            window.location.href = "dashboard.html";
        } catch (error) {
            alert("Error spinning up guest channel: " + error.message);
        }
    });
}

function setLocalSessionTokens(uid, name, accountMode) {
    localStorage.setItem("session_uid", uid);
    localStorage.setItem("session_name", name);
    localStorage.setItem("session_account_mode", accountMode);
}

// ========================================================
// 4. MESSENGER ENGINE & GRAPHIC CUSTOMIZER
// ========================================================
export function initDashboardPage() {
    const savedUid = localStorage.getItem("session_uid");
    const savedName = localStorage.getItem("session_name");
    const savedMode = localStorage.getItem("session_account_mode");

    if (!savedUid || !savedName || !savedMode) {
        window.location.href = "index.html";
        return;
    }

    currentUser = { uid: savedUid, name: savedName, accountMode: savedMode };
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true });

    // Instantly load client's saved background choices from memory
    const preservedColor = localStorage.getItem("mwamini_chat_bg_color") || "#efeae2";
    document.getElementById("message-stream").style.backgroundColor = preservedColor;

    // Monitor profile updates in real-time
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("current-user-title").innerText = data.name;
            document.getElementById("my-status-display").innerText = data.status || "";
            
            // Render avatar changes
            const avatarDivs = [document.getElementById("my-global-avatar-preview"), document.getElementById("drawer-avatar-preview-circle")];
            avatarDivs.forEach(el => {
                if (!el) return;
                if (data.avatarUrl) {
                    el.innerHTML = `<img src="${data.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else {
                    el.innerText = data.name.charAt(0).toUpperCase();
                }
            });
        }
    });

    loadIsolatedWhatsAppSidebar(savedMode);
    bindSettingsDrawerEvents();

    // Text Dispatches Handle
    document.getElementById("message-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        const messageText = input.value.trim();
        if (!messageText || !activeChatId) return;

        input.value = "";
        await addDoc(collection(db, "chats", activeChatId, "messages"), {
            text: messageText,
            type: "text",
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
        });
    });

    // Multi-File Upload Controller
    document.getElementById("file-input").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;

        const uploadStatusBar = document.getElementById("chat-header-name");
        const originalTitle = uploadStatusBar.innerText;
        uploadStatusBar.innerText = "🔄 Encrypting payload upload...";

        try {
            const storagePathRef = ref(storage, `shared_files/${activeChatId}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storagePathRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            let fileTypeMetadata = "document";
            if (file.type.startsWith("image/")) fileTypeMetadata = "image";
            else if (file.type.startsWith("video/")) fileTypeMetadata = "video";
            else if (file.type.startsWith("audio/")) fileTypeMetadata = "audio";

            await addDoc(collection(db, "chats", activeChatId, "messages"), {
                text: file.name,
                fileUrl: downloadURL,
                type: fileTypeMetadata,
                senderId: currentUser.uid,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            alert("Upload failed: " + error.message);
        } finally {
            uploadStatusBar.innerText = originalTitle;
        }
    });

    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false });
        localStorage.clear();
        signOut(auth).catch(() => {}).finally(() => { window.location.href = "index.html"; });
    });
}

// ========================================================
// 5. DATA PERMISSIONS ISOLATION LAYER (CRITICAL SECURITY)
// ========================================================
function loadIsolatedWhatsAppSidebar(accountMode) {
    // Isolated logic: REGISTERED accounts see only REGISTERED users. GUEST accounts see only GUEST users.
    const secureQuery = query(collection(db, "users"), where("accountMode", "==", accountMode));
    
    onSnapshot(secureQuery, (snapshot) => {
        const container = document.getElementById("users-container");
        if (!container) return;
        container.innerHTML = "";
        
        snapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            if (userData.uid !== currentUser.uid) {
                const item = document.createElement("div");
                item.className = "wa-user-item";
                
                const activeBadgeClass = userData.isOnline ? "badge-online" : "badge-offline";
                const activeTextString = userData.isOnline ? "● Online" : "Offline";

                // Setup user avatar string or dynamic graphic layout elements
                const avatarViewHTML = userData.avatarUrl 
                    ? `<img src="${userData.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
                    : userData.name.charAt(0).toUpperCase();

                item.innerHTML = `
                    <div class="wa-avatar-container">
                        <div class="wa-avatar">${avatarViewHTML}</div>
                        <span class="presence-dot ${activeBadgeClass}"></span>
                    </div>
                    <div class="wa-user-info">
                        <div class="wa-user-header-row">
                            <h4>${userData.name}</h4>
                            <span class="presence-status-text ${activeBadgeClass}">${activeTextString}</span>
                        </div>
                        <p class="wa-user-status-text">💬 ${userData.status || 'Available'}</p>
                    </div>
                `;
                item.addEventListener("click", () => openSecurePrivateChat(userData));
                container.appendChild(item);
            }
        });
    });
}

async function openSecurePrivateChat(targetUser) {
    // Generate private access token ID
    activeChatId = [currentUser.uid, targetUser.uid].sort().join("_");
    document.getElementById("no-chat-selected").classList.add("hidden");
    document.getElementById("active-chat-area").classList.remove("hidden");
    document.getElementById("chat-header-name").innerText = targetUser.name;

    const chatHeaderAvatar = document.getElementById("active-chat-header-avatar");
    if (targetUser.avatarUrl) {
        chatHeaderAvatar.innerHTML = `<img src="${targetUser.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
        chatHeaderAvatar.innerText = targetUser.name.charAt(0).toUpperCase();
        chatHeaderAvatar.style.background = "#00a884";
    }

    const chatRef = doc(db, "chats", activeChatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
        await setDoc(chatRef, {
            chatId: activeChatId,
            participants: [currentUser.uid, targetUser.uid],
            updatedAt: serverTimestamp()
        });
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
            if (msg.type === "image") {
                messageContentHTML = `<img src="${msg.fileUrl}" class="shared-media-img" alt="Shared Image" onclick="window.open('${msg.fileUrl}')">`;
            } else if (msg.type === "video") {
                messageContentHTML = `<video src="${msg.fileUrl}" controls class="shared-media-video"></video>`;
            } else if (msg.type === "audio") {
                messageContentHTML = `<audio src="${msg.fileUrl}" controls class="shared-media-audio"></audio>`;
            } else if (msg.type === "document") {
                messageContentHTML = `
                    <div class="shared-doc-box" onclick="window.open('${msg.fileUrl}')">
                        <span>📄</span>
                        <div class="doc-details">
                            <p class="doc-name">${msg.text}</p>
                            <small>Click to open file</small>
                        </div>
                    </div>`;
            } else {
                messageContentHTML = `<p class="bubble-text">${msg.text}</p>`;
            }

            bubbleRow.innerHTML = `<div class="wa-bubble">${messageContentHTML}</div>`;
            stream.appendChild(bubbleRow);
        });
        stream.scrollTop = stream.scrollHeight;
    });
}

// ========================================================
// 6. SETTINGS DRAWER CONTROLLERS & REALTIME CUSTOMIZERS
// ========================================================
function bindSettingsDrawerEvents() {
    const overlay = document.getElementById("settings-drawer-overlay");
    const openTrigger = document.getElementById("open-settings-drawer-zone");
    const closeBtn = document.getElementById("close-drawer-btn");
    const updateStatusBtn = document.getElementById("update-status-btn");
    const avatarUploadInput = document.getElementById("avatar-image-upload");

    openTrigger.addEventListener("click", () => overlay.classList.remove("hidden"));
    closeBtn.addEventListener("click", () => overlay.classList.add("hidden"));

    // A. Update Status Message Handler
    updateStatusBtn.addEventListener("click", async () => {
        const inputField = document.getElementById("status-input");
        const newStatus = inputField.value.trim();
        if (!newStatus) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: newStatus });
        inputField.value = "";
        alert("Status text modified successfully.");
    });

    // B. Realtime Profile Picture Avatar File Attachment Uploader
    avatarUploadInput.addEventListener("change", async (e) => {
        const pfpFile = e.target.files[0];
        if (!pfpFile) return;

        const originalText = document.querySelector("label[for='avatar-image-upload']").innerText;
        document.querySelector("label[for='avatar-image-upload']").innerText = "Uploading...";

        try {
            const avatarStorageRef = ref(storage, `profile_pictures/${currentUser.uid}_${Date.now()}`);
            const uploadSnapshot = await uploadBytes(avatarStorageRef, pfpFile);
            const downloadAvatarUrl = await getDownloadURL(uploadSnapshot.ref);

            await updateDoc(doc(db, "users", currentUser.uid), { avatarUrl: downloadAvatarUrl });
            alert("Profile picture updated!");
        } catch (error) {
            alert("Avatar upload dropped: " + error.message);
        } finally {
            document.querySelector("label[for='avatar-image-upload']").innerText = originalText;
        }
    });

    // C. Live Workspace Chat Wallpaper Background Customizer Changer Action Loop
    document.querySelectorAll(".wp-selector").forEach(selectorBtn => {
        selectorBtn.addEventListener("click", (e) => {
            const activePickedColor = e.target.getAttribute("data-color");
            document.getElementById("message-stream").style.backgroundColor = activePickedColor;
            localStorage.setItem("mwamini_chat_bg_color", activePickedColor);
        });
    });
}
