import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, orderBy, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null; 
let activeChatId = null;
let isGroupChat = false;
let unsubscribeMessages = null;
let activeSessionStartTime = null; // Tracks connection instance window timestamps

export function initDashboardPage() {
    const savedUid = localStorage.getItem("session_uid");
    const savedName = localStorage.getItem("session_name");
    const savedMode = localStorage.getItem("session_account_mode");

    if (!savedUid) {
        window.location.href = "index.html";
        return;
    }

    currentUser = { uid: savedUid, name: savedName, accountMode: savedMode || "standard" };
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true }).catch(() => {});

    // Save profile metadata snapshot synchronization hook
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("current-user-title").innerText = data.name;
            document.getElementById("my-status-display").innerText = data.status || "Available";
        }
    });

    // --- UPGRADED: STATUS STORIES TIMELINE DISPATCH MANAGER ---
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        const statusText = input.value.trim();
        if (!statusText) return;

        try {
            await addDoc(collection(db, "statuses"), {
                uid: currentUser.uid,
                userName: currentUser.name,
                accountMode: currentUser.accountMode,
                textPayload: statusText,
                createdAt: serverTimestamp()
            });
            await updateDoc(doc(db, "users", currentUser.uid), { status: statusText });
            input.value = "";
            alert("Status story updated successfully.");
        } catch(e) { console.error("Status dispatch dropped: ", e); }
    });

    // Mount structural active live timeline subscriber listener
    const historicalThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24-hour retention marker
    const liveStatusQuery = query(
        collection(db, "statuses"), 
        where("accountMode", "==", currentUser.accountMode),
        orderBy("createdAt", "desc"),
        limit(15)
    );

    onSnapshot(liveStatusQuery, (snapshot) => {
        const platformFeedTray = document.getElementById("active-statuses-view");
        if (!platformFeedTray) return;
        platformFeedTray.innerHTML = "";
        
        snapshot.forEach((statusDoc) => {
            const data = statusDoc.data();
            if (!data.createdAt) return;
            
            // Client side calculation safety checks for 24-hour expiration frames
            if(data.createdAt.toDate() > historicalThreshold) {
                const bubble = document.createElement("div");
                bubble.style = "background: #005c4b; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; white-space: nowrap; cursor: help;";
                bubble.innerText = `${data.userName}: ${data.textPayload}`;
                platformFeedTray.appendChild(bubble);
            }
        });
    });

    // --- UPGRADED: SEARCH EXACT NAMES ONLY PRIVACY DIRECTORY ---
    const searchField = document.getElementById("search-users");
    searchField.addEventListener("input", (e) => {
        executeTargetSearchQuery(e.target.value.trim());
    });

    // Leave list interface fully empty upon baseline initial launch state execution
    executeTargetSearchQuery("");

    // --- TEXT MESSAGE INPUT DELIVERY FLOW ---
    document.getElementById("message-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        if (!input.value.trim() || !activeChatId) return;

        const basePayloadText = input.value.trim();
        input.value = "";

        const route = isGroupChat ? collection(db, "groups", activeChatId, "messages") : collection(db, "chats", activeChatId, "messages");
        await addDoc(route, {
            text: basePayloadText,
            type: "text",
            senderId: currentUser.uid,
            senderName: currentUser.name,
            createdAt: serverTimestamp()
        });
    });

    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false }).catch(() => {});
        localStorage.clear();
        signOut(auth).finally(() => { window.location.href = "index.html"; });
    });
}

// Security Masked Query Routine Execution Frame
async function executeTargetSearchQuery(keyword) {
    const listCanvas = document.getElementById("users-container");
    if (!listCanvas) return;
    listCanvas.innerHTML = "";

    if (!keyword) {
        // Strict privacy constraint constraint rule protection enforcement:
        listCanvas.innerHTML = `<p style="font-size:12px; color:#667781; text-align:center; padding:15px; margin:0;">Type an exact username to clear privacy filter tracking paths.</p>`;
        return;
    }

    // Lookup structural query matches against specific name instances
    const usersRef = collection(db, "users");
    const nameMatchQuery = query(usersRef, where("name", "==", keyword), where("accountMode", "==", currentUser.accountMode));
    
    const queryResultSnap = await getDocs(nameMatchQuery);
    
    if (queryResultSnap.empty) {
        listCanvas.innerHTML = `<p style="font-size:12px; color:#ea0038; text-align:center; padding:15px; margin:0;">No verified identity matching "${keyword}" resolved.</p>`;
        return;
    }

    queryResultSnap.forEach((userDoc) => {
        const data = userDoc.data();
        if (data.uid !== currentUser.uid) {
            buildSidebarChannelElement(data);
        }
    });
}

function buildSidebarChannelElement(userData) {
    const canvas = document.getElementById("users-container");
    const row = document.createElement("div");
    row.className = "wa-user-item";

    row.innerHTML = `
        <div class="wa-avatar-container">
            <div class="wa-avatar" style="background: #00a884">${userData.name.charAt(0).toUpperCase()}</div>
        </div>
        <div class="wa-user-info">
            <div class="wa-user-header-row">
                <h4>${userData.name}</h4>
            </div>
            <p class="wa-user-status-text">${userData.status || 'Available'}</p>
        </div>
    `;

    row.addEventListener("click", () => {
        isGroupChat = false;
        activeChatId = [currentUser.uid, userData.uid].sort().join("_");
        
        // Capture initialization execution timestamps down to variable registers
        activeSessionStartTime = new Date();

        document.getElementById("no-chat-selected").classList.add("hidden");
        document.getElementById("active-chat-area").classList.remove("hidden");
        document.getElementById("chat-header-name").innerText = userData.name;

        setDoc(doc(db, "chats", activeChatId), {
            chatId: activeChatId,
            participants: [currentUser.uid, userData.uid],
            updatedAt: serverTimestamp()
        }, { merge: true });

        bindLiveIsolatedMessageStreams(collection(db, "chats", activeChatId, "messages"));
    });

    canvas.innerHTML = ""; // Wipe helper notifications containers away entirely
    canvas.appendChild(row);
}

function bindLiveIsolatedMessageStreams(collectionReference) {
    if (unsubscribeMessages) unsubscribeMessages();
    const orderedQuery = query(collectionReference, orderBy("createdAt", "asc"));

    unsubscribeMessages = onSnapshot(orderedQuery, (snapshot) => {
        const chatBoxWindow = document.getElementById("message-stream");
        if (!chatBoxWindow) return;
        chatBoxWindow.innerHTML = "";

        snapshot.forEach((msgDoc) => {
            const data = msgDoc.data();
            if (!data.createdAt) return;

            const targetMessageTime = data.createdAt.toDate();

            // CONSTRAINT UPGRADE RULE: Only render messages created *after* clicking the profile icon
            if (targetMessageTime >= activeSessionStartTime) {
                const bubbleRow = document.createElement("div");
                bubbleRow.className = `wa-message-row ${data.senderId === currentUser.uid ? 'row-sent' : 'row-received'}`;
                bubbleRow.innerHTML = `<div class="wa-bubble"><p class="bubble-text" style="margin:0;">${data.text}</p></div>`;
                chatBoxWindow.appendChild(bubbleRow);
            }
        });
        chatBoxWindow.scrollTop = chatBoxWindow.scrollHeight;
    });
}
