import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = null; 
let activeChatId = null;
let isGroupChat = false;
let unsubscribeMessages = null;

// Audio notes parameters
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

    // Background selection setup
    document.getElementById("message-stream").style.backgroundColor = localStorage.getItem("chat_bg_color") || "#efeae2";

    // Profile listener to monitor custom avatar modifications
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("current-user-title").innerText = data.name;
            document.getElementById("my-status-display").innerText = data.status || "Available";
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

    // Profile Picture Modification Handler
    document.getElementById("my-profile-pic-container").addEventListener("click", () => {
        document.getElementById("avatar-image-upload").click();
    });

    document.getElementById("avatar-image-upload").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const pathRef = ref(storage, `avatars/${currentUser.uid}`);
            const snap = await uploadBytes(pathRef, file);
            const url = await getDownloadURL(snap.ref);
            await updateDoc(doc(db, "users", currentUser.uid), { avatarUrl: url });
            alert("Profile image updated successfully!");
        } catch (err) {
            alert("Error updating photo: " + err.message);
        }
    });

    // Text status update button action
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        if (!input.value.trim()) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: input.value.trim() });
        input.value = "";
    });

    // --- PHOTO AND VIDEO STATUS UPDATES PIPELINE ---
    const statusMediaUpload = document.getElementById("status-media-upload");
    statusMediaUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        alert("Uploading your temporary status media item...");
        try {
            const fileRef = ref(storage, `statuses/${currentUser.uid}/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(snap.ref);

            let mediaType = "photo";
            if (file.type.startsWith("video/")) mediaType = "video";

            await addDoc(collection(db, "statuses"), {
                uid: currentUser.uid,
                userName: currentUser.name,
                accountMode: currentUser.accountMode,
                mediaUrl: downloadUrl,
                type: mediaType,
                createdAt: serverTimestamp()
            });
            alert("Your new media status update is live!");
        } catch (err) {
            alert("Status upload failed: " + err.message);
        } finally {
            statusMediaUpload.value = "";
        }
    });

    // Stream status display tray items
    const sQuery = query(collection(db, "statuses"), where("accountMode", "==", currentUser.accountMode), orderBy("createdAt", "desc"), limit(15));
    onSnapshot(sQuery, (snapshot) => {
        const container = document.getElementById("active-statuses-view");
        container.innerHTML = "";
        snapshot.forEach((sDoc) => {
            const data = sDoc.data();
            const indicator = document.createElement("div");
            indicator.style = "background: #00a884; color: white; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0;";
            indicator.innerText = `${data.userName} (${data.type === 'video' ? '🎥 Video' : '🖼️ Photo'})`;
            indicator.onclick = () => {
                if (data.type === "video") {
                    alert(`Viewing video status by ${data.userName}. Opening video stream window.`);
                    window.open(data.mediaUrl);
                } else {
                    alert(`Viewing image status update by ${data.userName}. Opening preview.`);
                    window.open(data.mediaUrl);
                }
            };
            container.appendChild(indicator);
        });
    });

    // --- INTEGRATED DIRECT GOOGLE SEARCH PANEL ENGINE ---
    const googleSidebar = document.getElementById("google-assistant-sidebar");
    document.getElementById("toggle-google-panel-btn").addEventListener("click", () => {
        googleSidebar.classList.toggle("hidden");
    });
    document.getElementById("close-google-panel-btn").addEventListener("click", () => {
        googleSidebar.classList.add("hidden");
    });

    document.getElementById("exec-google-search-btn").addEventListener("click", performAssistantSearch);
    document.getElementById("google-search-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") performAssistantSearch();
    });

    function performAssistantSearch() {
        const queryTerm = document.getElementById("google-search-input").value.trim();
        if (!queryTerm) return;
        
        const container = document.getElementById("google-results-container");
        container.innerHTML = `<p style="color: #4285f4; font-weight: bold;">Searching across knowledge streams...</p>`;

        // Simulated intelligent parsing engine answering requests safely in real-time
        setTimeout(() => {
            container.innerHTML = `
                <div style="background: #ffffff; padding: 10px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 10px;">
                    <h4 style="color: #1a0dab; margin-bottom: 4px;"><a href="https://www.google.com/search?q=${encodeURIComponent(queryTerm)}" target="_blank" style="text-decoration: none; color: inherit;">${queryTerm} - Google Search Result</a></h4>
                    <p style="color: #4d5156; font-size: 12px;">Here is what we fetched regarding "${queryTerm}": Open the direct web application engine to find answers or reference resources efficiently.</p>
                </div>
                <p style="font-size:11px; color:#667781;">Click link above to navigate full external search results canvas.</p>
            `;
        }, 800);
    }

    // --- VOICE AND VIDEO CALL SIMULATION SYSTEMS ---
    const callOverlay = document.getElementById("active-call-overlay");
    const callTitle = document.getElementById("call-screen-title");
    const callType = document.getElementById("call-screen-type");
    const videoStreams = document.getElementById("video-streams-container");

    document.getElementById("audio-call-btn").addEventListener("click", () => startCallSession(false));
    document.getElementById("video-call-btn").addEventListener("click", () => startCallSession(true));
    document.getElementById("hangup-call-btn").addEventListener("click", () => {
        callOverlay.classList.add("hidden");
        videoStreams.classList.add("hidden");
    });

    function startCallSession(isVid) {
        const title = document.getElementById("chat-header-name").innerText;
        callTitle.innerText = `Connecting session with ${title}...`;
        callType.innerText = isVid ? "SECURE VIDEO CHANNEL" : "SECURE AUDIO CHANNEL";
        if (isVid) videoStreams.classList.remove("hidden");
        callOverlay.classList.remove("hidden");
    }

    // --- RESTRUCTURED FILE ATTACHMENTS PIPELINE ---
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
            alert("Upload error: " + err.message);
        } finally {
            headerTitle.innerText = fallbackTitle;
            fileInputElement.value = ""; 
        }
    });

    // --- VOICE RECORDER ENGINE CODE ---
    const recordBtn = document.getElementById("voice-record-btn");
    const recordingStatus = document.getElementById("voice-recording-status");

    recordBtn.addEventListener("click", async () => {
        if (!activeChatId) return alert("Select an active private session conversation channel.");

        if (!isRecording) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return alert("Microphone system device permissions missing.");
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
            mediaRecorder.stop();
            isRecording = false;
        }
    });

    // Create Group channel tool
    document.getElementById("create-group-btn").addEventListener("click", async () => {
        const groupTitle = prompt("Provide a unique title name for the new Chat Group:");
        if (!groupTitle || !groupTitle.trim()) return;

        const targetUserQuery = prompt("Provide usernames separated by commas to join this group (e.g. MURIGO, MWAMINI):");
        const searchArray = targetUserQuery ? targetUserQuery.split(",").map(n => n.trim().toUpperCase()) : [];

        const groupUid = "group_" + Date.now();
        await setDoc(doc(db, "groups", groupUid), {
            groupId: groupUid,
            name: groupTitle.trim() + " (Group Room)",
            accountMode: currentUser.accountMode,
            members: [currentUser.name.toUpperCase(), ...searchArray],
            isGroup: true,
            createdAt: serverTimestamp()
        });
        alert(`Group room "${groupTitle}" deployed successfully!`);
        loadSidebarRooms("");
    });

    // Chat Message Submission handle
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

    // Interactive search query dispatcher
    document.getElementById("search-users").addEventListener("input", (e) => {
        loadSidebarRooms(e.target.value.trim());
    });

    loadSidebarRooms("");

    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false });
        localStorage.clear();
        signOut(auth).finally(() => { window.location.href = "index.html"; });
    });
}

// ========================================================
// SECURITY SEARCH LOOKUP & SIDEBAR POPULATION ENGINE
// ========================================================
function loadSidebarRooms(searchKeyword) {
    const container = document.getElementById("users-container");
    if (!container) return;
    container.innerHTML = "";

    const cleanKeyword = searchKeyword.trim().toUpperCase();

    // PRIVACY DISCOVERY LOCKRULE: Users do not auto-populate unless search field contains characters matching the exact field query parameters.
    if (cleanKeyword.length > 0) {
        const uQuery = query(collection(db, "users"), where("accountMode", "==", currentUser.accountMode));
        getDocs(uQuery).then((snapshot) => {
            snapshot.forEach((userDoc) => {
                const userData = userDoc.data();
                if (userData.uid !== currentUser.uid && userData.name.toUpperCase().includes(cleanKeyword)) {
                    renderRoomRow(userData, false);
                }
            });
        });
    }

    // Load available community Group spaces dynamically based on configuration filters
    const gQuery = query(collection(db, "groups"), where("accountMode", "==", currentUser.accountMode));
    getDocs(gQuery).then((snapshot) => {
        snapshot.forEach((gDoc) => {
            const gData = gDoc.data();
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
    const statusText = isGroupObj ? "Active Group Room" : (isOnline ? "● Online" : "Offline");

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
            <p class="wa-user-status-text">${isGroupObj ? 'Tap to join text feed' : '💬 ' + (roomData.status || 'Available')}</p>
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
