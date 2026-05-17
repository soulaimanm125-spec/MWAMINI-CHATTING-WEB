import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, orderBy, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
let isGroupChat = false;
let unsubscribeMessages = null;

// Voice recording references
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

    currentUser = { uid: savedUid, name: savedName, accountMode: savedMode };
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true });

    // Background color setup
    const savedBg = localStorage.getItem("chat_bg_color") || "#efeae2";
    document.getElementById("message-stream").style.backgroundColor = savedBg;

    // Realtime context profiling monitor
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

    // Profile photo upload click triggers
    document.getElementById("my-profile-pic-container").addEventListener("click", () => {
        document.getElementById("avatar-image-upload").click();
    });

    document.getElementById("avatar-image-upload").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const pathRef = ref(storage, `avatars/${currentUser.uid}`);
        const snap = await uploadBytes(pathRef, file);
        const url = await getDownloadURL(snap.ref);
        await updateDoc(doc(db, "users", currentUser.uid), { avatarUrl: url });
        alert("Avatar image modified!");
    });

    // Status management listener
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        if (!input.value.trim()) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: input.value.trim() });
        input.value = "";
    });

    // Dynamic color modifications
    document.getElementById("bg-color-picker").addEventListener("input", (e) => {
        document.getElementById("message-stream").style.backgroundColor = e.target.value;
        localStorage.setItem("chat_bg_color", e.target.value);
    });

    // --- CRITICAL ATTACHMENT PIPELINE REPAIR ---
    const fileInputElement = document.getElementById("file-input");
    fileInputElement.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;

        const headerTitle = document.getElementById("chat-header-name");
        const fallbackTitle = headerTitle.innerText;
        headerTitle.innerText = "📎 Processing attachment data...";

        try {
            const fileRef = ref(storage, `shared_media/${activeChatId}/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(snap.ref);

            let docType = "document";
            if (file.type.startsWith("image/")) docType = "image";
            else if (file.type.startsWith("video/")) docType = "video";
            else if (file.type.startsWith("audio/")) docType = "audio";

            const msgCollection = isGroupChat 
                ? collection(db, "groups", activeChatId, "messages")
                : collection(db, "chats", activeChatId, "messages");

            await addDoc(msgCollection, {
                text: file.name,
                fileUrl: downloadUrl,
                type: docType,
                senderId: currentUser.uid,
                senderName: currentUser.name,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            alert("Upload rejected: " + err.message);
        } finally {
            headerTitle.innerText = fallbackTitle;
            fileInputElement.value = ""; // Clear file selector buffer
        }
    });

    // --- VOICE RECORDER ENGINE CODE ---
    const recordBtn = document.getElementById("voice-record-btn");
    const recordingStatus = document.getElementById("voice-recording-status");

    recordBtn.addEventListener("click", async () => {
        if (!activeChatId) return alert("Select a secure chat room session first.");

        if (!isRecording) {
            // Start voice note tracking
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return alert("Your device browser lacks active microphone media permissions.");
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                    recordingStatus.classList.add("hidden");
                    recordBtn.innerText = "🎤";

                    // Upload voice stream file to storage
                    const voiceRef = ref(storage, `voice_notes/${activeChatId}/${Date.now()}.webm`);
                    const snap = await uploadBytes(voiceRef, audioBlob);
                    const downloadUrl = await getDownloadURL(snap.ref);

                    const msgCollection = isGroupChat 
                        ? collection(db, "groups", activeChatId, "messages")
                        : collection(db, "chats", activeChatId, "messages");

                    await addDoc(msgCollection, {
                        text: "🎙️ Voice Note",
                        fileUrl: downloadUrl,
                        type: "voice",
                        senderId: currentUser.uid,
                        senderName: currentUser.name,
                        createdAt: serverTimestamp()
                    });
                };

                mediaRecorder.start();
                isRecording = true;
                recordBtn.innerText = "🛑";
                recordingStatus.classList.remove("hidden");
            } catch (err) {
                alert("Microphone connection failed: " + err.message);
            }
        } else {
            // Stop dynamic voice session tracking
            mediaRecorder.stop();
            isRecording = false;
        }
    });

    // --- MULTIUSER GROUP MANAGEMENT INITIALIZER ---
    document.getElementById("create-group-btn").addEventListener("click", async () => {
        const groupTitle = prompt("Provide a unique title name for the new Chat Group:");
        if (!groupTitle || !groupTitle.trim()) return;

        const targetUserQuery = prompt("Provide usernames separated by commas to join this group (e.g. MURIGO, MWAMINI):");
        const searchArray = targetUserQuery ? targetUserQuery.split(",").map(n => n.trim().toUpperCase()) : [];

        const groupUid = "group_" + Date.now();
        const groupPayload = {
            groupId: groupUid,
            name: groupTitle.trim() + " (Group Room)",
            accountMode: currentUser.accountMode,
            members: [currentUser.name.toUpperCase(), ...searchArray],
            isGroup: true,
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, "groups", groupUid), groupPayload);
        alert(`Group room "${groupTitle}" deployed successfully! Use search keywords to load.`);
        loadSidebarRooms("");
    });

    // Realtime Message Submission handle 
    document.getElementById("message-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        if (!input.value.trim() || !activeChatId) return;

        const msgText = input.value.trim();
        input.value = "";

        const msgCollection = isGroupChat 
            ? collection(db, "groups", activeChatId, "messages")
            : collection(db, "chats", activeChatId, "messages");

        await addDoc(msgCollection, {
            text: msgText,
            type: "text",
            senderId: currentUser.uid,
            senderName: currentUser.name,
            createdAt: serverTimestamp()
        });
    });

    // --- USERNAME SECURITY LOOKUP DISPATCHER ---
    document.getElementById("search-users").addEventListener("input", (e) => {
        const querySearchKeyword = e.target.value.trim();
        loadSidebarRooms(querySearchKeyword);
    });

    // Perform default load initialization safely
    loadSidebarRooms("");

    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false });
        localStorage.clear();
        signOut(auth).finally(() => { window.location.href = "index.html"; });
    });
}

// ========================================================
// SECURITY LOOKUP & FILTER ENGINE
// ========================================================
function loadSidebarRooms(searchKeyword) {
    const container = document.getElementById("users-container");
    if (!container) return;
    container.innerHTML = "";

    const cleanKeyword = searchKeyword.trim().toUpperCase();

    // 1. ISOLATED USER DISCOVERY RULE: If input search field is blank, users do not auto-populate (Privacy Locked)
    if (cleanKeyword.length > 0) {
        const uQuery = query(collection(db, "users"), where("accountMode", "==", currentUser.accountMode));
        getDocs(uQuery).then((snapshot) => {
            snapshot.forEach((userDoc) => {
                const userData = userDoc.data();
                // Match search input keyword directly to the unique username profile field
                if (userData.uid !== currentUser.uid && userData.name.toUpperCase().includes(cleanKeyword)) {
                    renderRoomRow(userData, false);
                }
            });
        });
    }

    // 2. GROUP ROOM FEED DISCOVERY PIPELINE
    const gQuery = query(collection(db, "groups"), where("accountMode", "==", currentUser.accountMode));
    getDocs(gQuery).then((snapshot) => {
        snapshot.forEach((gDoc) => {
            const gData = gDoc.data();
            // Validate that the active user belongs inside the custom user member list array parameters
            if (gData.members.includes(currentUser.name.toUpperCase())) {
                if (cleanKeyword === "" || gData.name.toUpperCase().includes(cleanKeyword)) {
                    renderRoomRow(gData, true);
                }
            }
        });
    });
}

function renderRoomRow(roomData, isGroupObj) {
    const container = document.getElementById("users-container");
    const item = document.createElement("div");
    item.className = "wa-user-item";

    const isOnline = !isGroupObj && roomData.isOnline;
    const badgeClass = isOnline ? "badge-online" : "badge-offline";
    const statusText = isGroupObj ? "Active Group Channel" : (isOnline ? "● Online" : "Offline");

    const avatarHTML = isGroupObj ? "👥" : (roomData.avatarUrl 
        ? `<img src="${roomData.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
        : roomData.name.charAt(0).toUpperCase());

    item.innerHTML = `
        <div class="wa-avatar-container">
            <div class="wa-avatar" style="background: ${isGroupObj ? '#005c4b' : '#00a884'}">${avatarHTML}</div>
            <span class="presence-dot ${badgeClass}"></span>
        </div>
        <div class="wa-user-info">
            <div class="wa-user-header-row">
                <h4>${roomData.name}</h4>
                <span class="presence-status-text ${badgeClass}">${statusText}</span>
            </div>
            <p class="wa-user-status-text">${isGroupObj ? 'Tap to enter conversation' : '💬 ' + (roomData.status || 'Available')}</p>
        </div>
    `;

    item.addEventListener("click", () => {
        isGroupChat = isGroupObj;
        if (isGroupObj) {
            openGroupChatChannel(roomData);
        } else {
            openPrivateChatChannel(roomData);
        }
    });
    container.appendChild(item);
}

async function openPrivateChatChannel(targetUser) {
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
    listenToMessageCollectionStream(collection(db, "chats", activeChatId, "messages"));
}

async function openGroupChatChannel(groupData) {
    activeChatId = groupData.groupId;
    document.getElementById("no-chat-selected").classList.add("hidden");
    document.getElementById("active-chat-area").classList.remove("hidden");
    document.getElementById("chat-header-name").innerText = groupData.name;

    listenToMessageCollectionStream(collection(db, "groups", activeChatId, "messages"));
}

function listenToMessageCollectionStream(msgCollectionRef) {
    if (unsubscribeMessages) unsubscribeMessages();
    const mQuery = query(msgCollectionRef, orderBy("createdAt", "asc"));

    unsubscribeMessages = onSnapshot(mQuery, (snapshot) => {
        const stream = document.getElementById("message-stream");
        if (!stream) return;
        stream.innerHTML = "";

        snapshot.forEach((msgDoc) => {
            const msg = msgDoc.data();
            const bubbleRow = document.createElement("div");
            bubbleRow.className = `wa-message-row ${msg.senderId === currentUser.uid ? 'row-sent' : 'row-received'}`;
            
            let itemHTML = "";
            const senderTag = isGroupChat && msg.senderId !== currentUser.uid ? `<small style="display:block; color:#008069; font-weight:bold; margin-bottom:3px;">${msg.senderName || 'User'}</small>` : "";

            if (msg.type === "voice") {
                itemHTML = `${senderTag}<audio src="${msg.fileUrl}" controls style="max-width:100%; outline:none;"></audio>`;
            } else if (msg.type === "image") {
                itemHTML = `${senderTag}<img src="${msg.fileUrl}" style="max-width:100%; max-height:250px; border-radius:6px; cursor:pointer;" onclick="window.open('${msg.fileUrl}')">`;
            } else if (msg.type === "video") {
                itemHTML = `${senderTag}<video src="${msg.fileUrl}" controls style="max-width:100%; max-height:250px; border-radius:6px;"></video>`;
            } else if (msg.type === "audio") {
                itemHTML = `${senderTag}<audio src="${msg.fileUrl}" controls style="max-width:100%;"></audio>`;
            } else if (msg.type === "document") {
                itemHTML = `${senderTag}<div class="shared-doc-box" onclick="window.open('${msg.fileUrl}')" style="cursor:pointer; display:flex; gap:10px; background:rgba(0,0,0,0.04); padding:8px; border-radius:6px; font-size:13px;">📄 <span>${msg.text}</span></div>`;
            } else {
                itemHTML = `${senderTag}<p class="bubble-text">${msg.text}</p>`;
            }

            bubbleRow.innerHTML = `<div class="wa-bubble">${itemHTML}</div>`;
            stream.appendChild(bubbleRow);
        });
        stream.scrollTop = stream.scrollHeight;
    });
}
