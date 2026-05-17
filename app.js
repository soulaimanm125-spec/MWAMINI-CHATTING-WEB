import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
// GATEWAY LOGIN ENGINE
// ========================================================
export function initAuthPage() {
    let isRegisterMode = false;
    const authForm = document.getElementById("auth-form");
    const toggleBtn = document.getElementById("toggle-auth-mode");
    const nameGroup = document.getElementById("name-field-group");
    const submitBtn = document.getElementById("submit-btn");
    const toggleMsg = document.getElementById("toggle-msg");
    const errorMsg = document.getElementById("error-message");
    const guestTriggerBtn = document.getElementById("guest-mode-trigger-btn");

    if (nameGroup) nameGroup.style.display = "none";

    toggleBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        nameGroup.style.display = isRegisterMode ? "block" : "none";
        submitBtn.innerText = isRegisterMode ? "Register Account" : "Login";
        toggleMsg.innerText = isRegisterMode ? "Already have an account?" : "Don't have an account?";
        toggleBtn.innerText = isRegisterMode ? "Login here" : "Register here";
    });

    authForm?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value;
        const name = document.getElementById("auth-name")?.value.trim();

        try {
            if (isRegisterMode) {
                const creds = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", creds.user.uid), {
                    uid: creds.user.uid,
                    name: name || email.split("@")[0],
                    email: email,
                    accountMode: "REGISTERED",
                    status: "Hey there! I am using Mwamini Chat.",
                    avatarUrl: "",
                    isOnline: true
                });
                setSession(creds.user.uid, name || email.split("@")[0], "REGISTERED");
            } else {
                const creds = await signInWithEmailAndPassword(auth, email, password);
                const snap = await getDoc(doc(db, "users", creds.user.uid));
                const rName = snap.exists() ? snap.data().name : email.split("@")[0];
                await updateDoc(doc(db, "users", creds.user.uid), { isOnline: true });
                setSession(creds.user.uid, rName, "REGISTERED");
            }
            window.location.href = "dashboard.html";
        } catch (err) {
            errorMsg.innerText = err.message;
        }
    });

    guestTriggerBtn?.addEventListener("click", async () => {
        const gName = prompt("Enter your temporary Guest Name:");
        if (!gName || !gName.trim()) return;
        const gUid = "guest_" + Math.random().toString(36).substring(2, 11);

        await setDoc(doc(db, "users", gUid), {
            uid: gUid,
            name: gName.trim() + " (Guest)",
            accountMode: "GUEST",
            status: "Using guest mode channel.",
            avatarUrl: "",
            isOnline: true
        });
        setSession(gUid, gName.trim() + " (Guest)", "GUEST");
        window.location.href = "dashboard.html";
    });
}

function setSession(uid, name, mode) {
    localStorage.setItem("session_uid", uid);
    localStorage.setItem("session_name", name);
    localStorage.setItem("session_account_mode", mode);
}

// ========================================================
// CORE MESSENGER & PROFILE ENGINE
// ========================================================
export function initDashboardPage() {
    const savedUid = localStorage.getItem("session_uid");
    const savedName = localStorage.getItem("session_name");
    const savedMode = localStorage.getItem("session_account_mode");

    if (!savedUid) {
        window.location.href = "index.html";
        return;
    }

    currentUser = { uid: savedUid, name: savedName, accountMode: savedMode };
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true });

    // Restore background color selection from localStorage
    const savedBg = localStorage.getItem("chat_bg_color") || "#efeae2";
    document.getElementById("message-stream").style.backgroundColor = savedBg;
    const picker = document.getElementById("bg-color-picker");
    if (picker) picker.value = savedBg;

    // Realtime User profile display monitor
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("current-user-title").innerText = data.name;
            document.getElementById("my-status-display").innerText = data.status || "";
            
            const avatarEl = document.getElementById("my-global-avatar-preview");
            if (avatarEl) {
                if (data.avatarUrl) {
                    avatarEl.innerHTML = `<img src="${data.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else {
                    avatarEl.innerText = data.name.charAt(0).toUpperCase();
                }
            }
        }
    });

    // Profile picture clicking actions
    document.getElementById("my-profile-pic-container").addEventListener("click", () => {
        document.getElementById("avatar-image-upload").click();
    });

    // Profile Picture Upload implementation
    document.getElementById("avatar-image-upload").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const pathRef = ref(storage, `avatars/${currentUser.uid}`);
            const snap = await uploadBytes(pathRef, file);
            const url = await getDownloadURL(snap.ref);
            await updateDoc(doc(db, "users", currentUser.uid), { avatarUrl: url });
            alert("Profile image updated!");
        } catch (err) {
            console.error(err);
        }
    });

    // Color picker background changer link
    document.getElementById("bg-color-picker").addEventListener("input", (e) => {
        const color = e.target.value;
        document.getElementById("message-stream").style.backgroundColor = color;
        localStorage.setItem("chat_bg_color", color);
    });

    // Status updates button
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        if (!input.value.trim()) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: input.value.trim() });
        input.value = "";
    });

    // Standard Message Dispatcher
    document.getElementById("message-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        if (!input.value.trim() || !activeChatId) return;

        const txt = input.value.trim();
        input.value = "";
        await addDoc(collection(db, "chats", activeChatId, "messages"), {
            text: txt,
            type: "text",
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
        });
    });

    // File attachments loader
    document.getElementById("file-input").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;
        try {
            const fileRef = ref(storage, `files/${activeChatId}/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(fileRef, file);
            const url = await getDownloadURL(snap.ref);

            let type = "document";
            if (file.type.startsWith("image/")) type = "image";
            else if (file.type.startsWith("video/")) type = "video";
            else if (file.type.startsWith("audio/")) type = "audio";

            await addDoc(collection(db, "chats", activeChatId, "messages"), {
                text: file.name,
                fileUrl: url,
                type: type,
                senderId: currentUser.uid,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false });
        localStorage.clear();
        signOut(auth).finally(() => { window.location.href = "index.html"; });
    });

    loadSidebarUsers();
}

// ========================================================
// PRIVATE USER ISOLATION FILTER
// ========================================================
function loadSidebarUsers() {
    // Mode isolation: Registered users only see Registered. Guests only see Guests.
    const qUsers = query(collection(db, "users"), where("accountMode", "==", currentUser.accountMode));
    
    onSnapshot(qUsers, (snapshot) => {
        const container = document.getElementById("users-container");
        if (!container) return;
        container.innerHTML = "";

        snapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            if (userData.uid !== currentUser.uid) {
                const item = document.createElement("div");
                item.className = "wa-user-item";
                
                const onlineClass = userData.isOnline ? "badge-online" : "badge-offline";
                const onlineText = userData.isOnline ? "● Online" : "Offline";
                const avatarView = userData.avatarUrl 
                    ? `<img src="${userData.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
                    : userData.name.charAt(0).toUpperCase();

                item.innerHTML = `
                    <div class="wa-avatar-container">
                        <div class="wa-avatar">${avatarView}</div>
                        <span class="presence-dot ${onlineClass}"></span>
                    </div>
                    <div class="wa-user-info">
                        <div class="wa-user-header-row">
                            <h4>${userData.name}</h4>
                            <span class="presence-status-text ${onlineClass}">${onlineText}</span>
                        </div>
                        <p class="wa-user-status-text">💬 ${userData.status || 'Available'}</p>
                    </div>
                `;
                item.addEventListener("click", () => openPrivateChatChannel(userData));
                container.appendChild(item);
            }
        });
    });
}

async function openPrivateChatChannel(targetUser) {
    // Chat isolation mapping: No one else outside these two IDs can query this combination
    activeChatId = [currentUser.uid, targetUser.uid].sort().join("_");
    document.getElementById("no-chat-selected").classList.add("hidden");
    document.getElementById("active-chat-area").classList.remove("hidden");
    document.getElementById("chat-header-name").innerText = targetUser.name;

    const chatRef = doc(db, "chats", activeChatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
        await setDoc(chatRef, {
            chatId: activeChatId,
            participants: [currentUser.uid, targetUser.uid],
            updatedAt: serverTimestamp()
        });
    }
    listenToMessages();
}

function listenToMessages() {
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
            
            let innerContent = "";
            if (msg.type === "image") {
                innerContent = `<img src="${msg.fileUrl}" class="shared-media-img" style="max-width:100%; max-height:250px; border-radius:6px;" onclick="window.open('${msg.fileUrl}')">`;
            } else if (msg.type === "video") {
                innerContent = `<video src="${msg.fileUrl}" controls style="max-width:100%; max-height:250px;"></video>`;
            } else if (msg.type === "audio") {
                innerContent = `<audio src="${msg.fileUrl}" controls></audio>`;
            } else if (msg.type === "document") {
                innerContent = `<div class="shared-doc-box" onclick="window.open('${msg.fileUrl}')" style="cursor:pointer; display:flex; gap:10px; background:#f0f2f5; padding:8px; border-radius:6px;">📄 <span>${msg.text}</span></div>`;
            } else {
                innerContent = `<p class="bubble-text">${msg.text}</p>`;
            }

            bubbleRow.innerHTML = `<div class="wa-bubble">${innerContent}</div>`;
            stream.appendChild(bubbleRow);
        });
        stream.scrollTop = stream.scrollHeight;
    });
}
