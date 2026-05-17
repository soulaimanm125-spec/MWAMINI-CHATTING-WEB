import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// 1. Core Firebase Web Credentials
const firebaseConfig = {
  apiKey: "AIzaSyBtDMYBR0jcyK-JfgsYtET1SenPngzmQi4",
  authDomain: "mwamini-chatting-web.firebaseapp.com",
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
// 3. AUTHENTICATION ENGINE (Allows Open Registration)
// ========================================================
export function initAuthPage() {
    let isRegisterMode = false;

    // Persist login status across tab refreshes cleanly
    setPersistence(auth, browserLocalPersistence).then(() => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                window.location.href = "dashboard.html";
            }
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
                    // Create account directly in Firebase Authentication
                    const credentials = await createUserWithEmailAndPassword(auth, email, password);
                    
                    // Create user profile document in Firestore
                    await setDoc(doc(db, "users", credentials.user.uid), {
                        uid: credentials.user.uid,
                        name: name || email.split("@")[0],
                        email: email
                    });
                } else {
                    // User sign in path
                    await signInWithEmailAndPassword(auth, email, password);
                }
            } catch (error) {
                // Clear and structured error messages shown to user
                errorMsg.innerText = error.message;
            }
        });
    }
}

// ========================================================
// 4. WHATSAPP STYLE MESSENGER LOGIC (With File Uploads)
// ========================================================
export function initDashboardPage() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "index.html";
        } else {
            currentUser = user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                document.getElementById("current-user-title").innerText = userDoc.data().name;
            }
            loadWhatsAppSidebar();
        }
    });

    document.getElementById("logout-btn")?.addEventListener("click", () => {
        signOut(auth).then(() => { window.location.href = "index.html"; });
    });

    // Text Form Submission Handle
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

    // File Sharing Input Trigger Handle
    document.getElementById("file-input")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;

        const uploadStatusBar = document.getElementById("chat-header-name");
        const originalTitle = uploadStatusBar.innerText;
        uploadStatusBar.innerText = "🔄 Uploading file...";

        try {
            // Uploads file to Firebase Storage bucket using chat ID grouping
            const storagePathRef = ref(storage, `shared_files/${activeChatId}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storagePathRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            await addDoc(collection(db, "chats", activeChatId, "messages"), {
                text: file.name,
                fileUrl: downloadURL,
                type: file.type.startsWith("image/") ? "image" : "document",
                senderId: currentUser.uid,
                createdAt: serverTimestamp()
            });
        } catch (error) {
            alert("File upload failed: " + error.message);
        } finally {
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
                item.innerHTML = `
                    <div class="wa-avatar">${userData.name.charAt(0).toUpperCase()}</div>
                    <div class="wa-user-info">
                        <h4>${userData.name}</h4>
                        <p>${userData.email}</p>
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
            
            if (msg.type === "image") {
                messageContentHTML = `<img src="${msg.fileUrl}" class="shared-media-img" alt="Shared Image" onclick="window.open('${msg.fileUrl}')">`;
            } else if (msg.type === "document") {
                messageContentHTML = `
                    <div class="shared-doc-box" onclick="window.open('${msg.fileUrl}')">
                        <span>📄</span>
                        <div class="doc-details">
                            <p class="doc-name">${msg.text}</p>
                            <small>Click to view file</small>
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
