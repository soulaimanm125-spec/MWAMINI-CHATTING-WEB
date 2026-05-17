import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
// 3. AUTHENTICATION ENGINE
// ========================================================
export function initAuthPage() {
    let isRegisterMode = false;

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
            const email = document.getElementById("auth-email").value.trim();
            const password = document.getElementById("auth-password").value;
            const name = document.getElementById("auth-name").value;

            try {
                if (isRegisterMode) {
                    const credentials = await createUserWithEmailAndPassword(auth, email, password);
                    await setDoc(doc(db, "users", credentials.user.uid), {
                        uid: credentials.user.uid,
                        name: name || email.split("@")[0],
                        email: email,
                        status: "Hey there! I am using Mwamini Chat.",
                        isOnline: true
                    });
                } else {
                    const credentials = await signInWithEmailAndPassword(auth, email, password);
                    await updateDoc(doc(db, "users", credentials.user.uid), { isOnline: true });
                }
            } catch (error) {
                errorMsg.innerText = error.message;
            }
        });
    }
}

// ========================================================
// 4. MESSENGER ENGINE (Texts, Active Users & Multi-Files)
// ========================================================
export function initDashboardPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "index.html";
        } else {
            currentUser = user;
            
            // Set dynamic connection status to true on log state presence trigger
            await updateDoc(doc(db, "users", user.uid), { isOnline: true });

            onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    document.getElementById("current-user-title").innerText = data.name;
                    document.getElementById("my-status-display").innerText = data.status || "No custom status set";
                }
            });

            loadWhatsAppSidebar();
        }
    });

    // Custom Status Changer Handler Button Hook
    document.getElementById("update-status-btn")?.addEventListener("click", async () => {
        const inputField = document.getElementById("status-input");
        const newStatus = inputField.value.trim();
        if (!newStatus) return;

        try {
            await updateDoc(doc(db, "users", currentUser.uid), { status: newStatus });
            inputField.value = "";
            alert("Status updated!");
        } catch (error) {
            console.error("Error writing user status: ", error);
        }
    });

    // Logout Process (Sets presence flag status to false cleanly before session dropped)
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
        if (currentUser) {
            await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false });
        }
        signOut(auth).then(() => { window.location.href = "index.html"; });
    });

    // Text Dispatch Submissions Handler
    document.getElementById("message-form")?.addEventListener("submit", async (e) => {
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

    // Unified Media Upload Handler (Processes Images, Videos, Audio, and Documents)
    document.getElementById("file-input")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;

        const uploadStatusBar = document.getElementById("chat-header-name");
        const originalTitle = uploadStatusBar.innerText;
        uploadStatusBar.innerText = "🔄 Uploading attachment payload...";

        try {
            const storagePathRef = ref(storage, `shared_files/${activeChatId}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storagePathRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // Dynamically check file type structure extensions
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
            alert("Media attachment drop failed: " + error.message);
        } disable {
            uploadStatusBar.innerText = originalTitle;
        }
    });
}

function loadWhatsAppSidebar() {
    const q = query(collection(db, "users"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById("users-container");
        if (!container) return;
        container.innerHTML = "";
        snapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            if (userData.uid !== currentUser.uid) {
                const item = document.createElement("div");
                item.className = "wa-user-item";
                
                // Add online badge classes conditionally based on presence updates
                const activeBadgeClass = userData.isOnline ? "badge-online" : "badge-offline";
                const activeTextString = userData.isOnline ? "● Online" : "Offline";

                item.innerHTML = `
                    <div class="wa-avatar-container">
                        <div class="wa-avatar">${userData.name.charAt(0).toUpperCase()}</div>
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
                item.addEventListener("click", () => openWhatsAppChat(userData));
                container.appendChild(item);
            }
        });
    });
}

async function openWhatsAppChat(targetUser) {
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
            
            // Core Conditional Engine to render the correct type of shared media element
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
                            <small>Click to view document file</small>
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
