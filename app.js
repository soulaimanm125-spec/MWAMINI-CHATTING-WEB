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

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

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

    // --- CONTINUOUS ACCOUNT SYNCHRONIZATION EVENT ROUTINE ---
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("current-user-title").innerText = data.name;
            document.getElementById("my-status-display").innerText = data.status || "Available";
            const avatarPreview = document.getElementById("my-global-avatar-preview");
            if (avatarPreview) {
                if (data.avatarUrl) {
                    avatarPreview.innerHTML = `<img src="${data.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else {
                    avatarPreview.innerText = data.name.charAt(0).toUpperCase();
                }
            }
        }
    });

    // --- FILE SYSTEM EXCHANGE ROUTINE ---
    const mediaInput = document.getElementById("file-input");
    mediaInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;

        const statusTracker = document.getElementById("chat-header-status-text");
        statusTracker.innerText = "📎 Processing attachment data...";

        try {
            const storageRef = ref(storage, `shared_media/${activeChatId}/${Date.now()}_${file.name}`);
            const uploadSnap = await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(uploadSnap.ref);

            let docClass = "document";
            if (file.type.startsWith("image/")) docClass = "image";
            else if (file.type.startsWith("video/")) docClass = "video";

            const collectionRoute = isGroupChat 
                ? collection(db, "groups", activeChatId, "messages")
                : collection(db, "chats", activeChatId, "messages");

            await addDoc(collectionRoute, {
                text: file.name,
                fileUrl: downloadUrl,
                type: docClass,
                senderId: currentUser.uid,
                senderName: currentUser.name,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            alert("File delivery transmission failure: " + err.message);
        } finally {
            statusTracker.innerText = "secure session channel";
            mediaInput.value = "";
        }
    });

    // --- TEXT CHAT TRANSMISSION TRIGGER ---
    document.getElementById("message-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        if (!input.value.trim() || !activeChatId) return;

        const originalText = input.value.trim();
        input.value = "";

        const collectionRoute = isGroupChat 
            ? collection(db, "groups", activeChatId, "messages")
            : collection(db, "chats", activeChatId, "messages");

        await addDoc(collectionRoute, {
            text: originalText,
            type: "text",
            senderId: currentUser.uid,
            senderName: currentUser.name,
            createdAt: serverTimestamp()
        });
    });

    // --- DYNAMIC VISIBILITY DIRECTORY SYSTEM SEARCH LOOPS ---
    document.getElementById("search-users").addEventListener("input", (e) => {
        renderSidebarChannels(e.target.value.trim());
    });

    // --- PROFILE STATUS UPDATER DISPATCHER ---
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        if (!input.value.trim()) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: input.value.trim() });
        input.value = "";
    });

    // --- MULTIUSER CHAT ROOM GENERATOR WORKFLOW ---
    document.getElementById("create-group-btn").addEventListener("click", async () => {
        const title = prompt("Assign a functional group chat channel namespace:");
        if (!title || !title.trim()) return;

        const structuralId = "group_" + Date.now();
        await setDoc(doc(db, "groups", structuralId), {
            groupId: structuralId,
            name: title.trim().toUpperCase() + " (Group)",
            accountMode: currentUser.accountMode,
            members: [currentUser.name.toUpperCase()],
            isGroup: true,
            createdAt: serverTimestamp()
        });
        alert(`Shared space channel group context room "${title}" provisioned successfully.`);
        renderSidebarChannels("");
    });

    renderSidebarChannels("");

    // --- LOGOUT ROUTINE ACTION TRIGGER ---
    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false }).catch(() => {});
        localStorage.clear();
        signOut(auth).finally(() => { window.location.href = "index.html"; });
    });
}

function renderSidebarChannels(filterKey) {
    const box = document.getElementById("users-container");
    if (!box) return;
    box.innerHTML = "";

    const cleanMatch = filterKey.trim().toUpperCase();

    // Pull individual users from collection
    const userQuery = query(collection(db, "users"), where("accountMode", "==", currentUser.accountMode));
    getDocs(userQuery).then((snap) => {
        snap.forEach((userDoc) => {
            const data = userDoc.data();
            if (data.uid !== currentUser.uid && (cleanMatch === "" || data.name.toUpperCase().includes(cleanMatch))) {
                appendChannelRowElement(data, false);
            }
        });
    });

    // Pull joint multi-user shared context group references
    const groupQuery = query(collection(db, "groups"), where("accountMode", "==", currentUser.accountMode));
    getDocs(groupQuery).then((snap) => {
        snap.forEach((gDoc) => {
            const data = gDoc.data();
            if (cleanMatch === "" || data.name.toUpperCase().includes(cleanMatch)) {
                appendChannelRowElement(data, true);
            }
        });
    });
}

function appendChannelRowElement(itemData, isGroupObj) {
    const box = document.getElementById("users-container");
    const containerRow = document.createElement("div");
    containerRow.className = "wa-user-item";

    const isLive = !isGroupObj && itemData.isOnline;
    const marker = isLive ? "● Active Now" : "Away";

    containerRow.innerHTML = `
        <div class="wa-avatar-container">
            <div class="wa-avatar" style="background: ${isGroupObj ? '#005c4b' : '#00a884'}">${isGroupObj ? '👥' : itemData.name.charAt(0).toUpperCase()}</div>
        </div>
        <div class="wa-user-info">
            <div class="wa-user-header-row">
                <h4>${itemData.name}</h4>
                <span style="font-size:11px; color:${isLive ? '#00a884':'#8696a0'};">${marker}</span>
            </div>
            <p class="wa-user-status-text">${isGroupObj ? 'Shared context channel message stream' : (itemData.status || 'Available')}</p>
        </div>
    `;

    containerRow.addEventListener("click", () => {
        isGroupChat = isGroupObj;
        document.getElementById("no-chat-selected").classList.add("hidden");
        document.getElementById("active-chat-area").classList.remove("hidden");
        document.getElementById("chat-header-name").innerText = itemData.name;

        if (isGroupObj) {
            activeChatId = itemData.groupId;
            bindMessageDataStreams(collection(db, "groups", activeChatId, "messages"));
        } else {
            activeChatId = [currentUser.uid, itemData.uid].sort().join("_");
            setDoc(doc(db, "chats", activeChatId), {
                chatId: activeChatId,
                participants: [currentUser.uid, itemData.uid],
                updatedAt: serverTimestamp()
            }, { merge: true });
            bindMessageDataStreams(collection(db, "chats", activeChatId, "messages"));
        }
    });

    box.appendChild(containerRow);
}

function bindMessageDataStreams(collectionReference) {
    if (unsubscribeMessages) unsubscribeMessages();
    const orderedQuery = query(collectionReference, orderBy("createdAt", "asc"));

    unsubscribeMessages = onSnapshot(orderedQuery, (snapshot) => {
        const streamCanvas = document.getElementById("message-stream");
        if (!streamCanvas) return;
        streamCanvas.innerHTML = "";

        snapshot.forEach((msgDoc) => {
            const data = msgDoc.data();
            const messageBubbleRow = document.createElement("div");
            messageBubbleRow.className = `wa-message-row ${data.senderId === currentUser.uid ? 'row-sent' : 'row-received'}`;

            let contentBlock = "";
            if (data.type === "image") {
                contentBlock = `<img src="${data.fileUrl}" style="max-width:240px; border-radius:6px; cursor:pointer;" onclick="window.open('${data.fileUrl}', '_blank')">`;
            } else if (data.type === "video") {
                contentBlock = `<video src="${data.fileUrl}" controls style="max-width:240px; border-radius:6px;"></video>`;
            } else if (data.type === "document") {
                contentBlock = `<div style="background:#f0f2f5; padding:8px; border-radius:4px; cursor:pointer;" onclick="window.open('${data.fileUrl}', '_blank')">📄 <span style="font-size:12px; word-break:break-all;">${data.text}</span></div>`;
            } else {
                contentBlock = `<p class="bubble-text" style="margin:0;">${data.text}</p>`;
            }

            messageBubbleRow.innerHTML = `<div class="wa-bubble">${contentBlock}</div>`;
            streamCanvas.appendChild(messageBubbleRow);
        });
        streamCanvas.scrollTop = streamCanvas.scrollHeight;
    });
}
