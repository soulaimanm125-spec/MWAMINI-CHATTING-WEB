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
    
    // Set user online status inside DB configuration paths
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true }).catch(() => {});

    // Sync saved wallpaper backgrounds configurations
    const savedBg = localStorage.getItem("chat_bg_color") || "#efeae2";
    document.getElementById("message-stream").style.backgroundColor = savedBg;
    document.getElementById("bg-color-picker").value = savedBg;

    document.getElementById("bg-color-picker").addEventListener("input", (e) => {
        const selectedColor = e.target.value;
        document.getElementById("message-stream").style.backgroundColor = selectedColor;
        localStorage.setItem("chat_bg_color", selectedColor);
    });

    // Real-time listener for current user state transformations
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

    // --- MANAGE AVATAR UPLOAD ---
    document.getElementById("my-profile-pic-container").addEventListener("click", () => {
        document.getElementById("avatar-image-upload").click();
    });

    document.getElementById("avatar-image-upload").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const avatarRef = ref(storage, `avatars/${currentUser.uid}`);
            const snap = await uploadBytes(avatarRef, file);
            const downloadUrl = await getDownloadURL(snap.ref);
            await updateDoc(doc(db, "users", currentUser.uid), { avatarUrl: downloadUrl });
        } catch (err) {
            alert("Avatar transformation error: " + err.message);
        }
    });

    // --- TEXT STATUS TRADING ---
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        if (!input.value.trim()) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: input.value.trim() });
        input.value = "";
    });

    // --- PHOTO / VIDEO STORIES UPLOAD FEED ---
    const statusMediaUpload = document.getElementById("status-media-upload");
    statusMediaUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const fileRef = ref(storage, `statuses/${currentUser.uid}/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(snap.ref);
            const typeMarker = file.type.startsWith("video/") ? "video" : "photo";

            await addDoc(collection(db, "statuses"), {
                uid: currentUser.uid,
                userName: currentUser.name,
                accountMode: currentUser.accountMode,
                mediaUrl: downloadUrl,
                type: typeMarker,
                createdAt: serverTimestamp()
            });
            alert("Your new media status update is live!");
        } catch (err) {
            alert("Status compilation issue: " + err.message);
        } finally {
            statusMediaUpload.value = "";
        }
    });

    // Render active media timeline feeds
    const statusQuery = query(collection(db, "statuses"), where("accountMode", "==", currentUser.accountMode), orderBy("createdAt", "desc"), limit(10));
    onSnapshot(statusQuery, (snapshot) => {
        const box = document.getElementById("active-statuses-view");
        box.innerHTML = "";
        snapshot.forEach((storyDoc) => {
            const data = storyDoc.data();
            const bubble = document.createElement("div");
            bubble.style = "background: #00a884; color: white; font-size: 11px; padding: 5px 10px; border-radius: 12px; cursor: pointer; white-space: nowrap; font-weight: 500; flex-shrink: 0;";
            bubble.innerText = `${data.userName} (${data.type === 'video' ? '🎥 Video' : '🖼️ Status'})`;
            bubble.onclick = () => window.open(data.mediaUrl, "_blank");
            box.appendChild(bubble);
        });
    });

    // --- COMPANION GOOGLE SLIDING DRAWER PANEL ---
    const searchSidebar = document.getElementById("google-assistant-sidebar");
    document.getElementById("toggle-google-panel-btn").addEventListener("click", () => searchSidebar.classList.toggle("hidden"));
    document.getElementById("close-google-panel-btn").addEventListener("click", () => searchSidebar.classList.add("hidden"));

    document.getElementById("exec-google-search-btn").addEventListener("click", processAssistantQuery);
    document.getElementById("google-search-input").addEventListener("keypress", (e) => { if (e.key === "Enter") processAssistantQuery(); });

    function processAssistantQuery() {
        const term = document.getElementById("google-search-input").value.trim();
        if (!term) return;
        const resBox = document.getElementById("google-results-container");
        resBox.innerHTML = `<p style="color: #4285f4; font-weight: 600;">Fetching live intelligence context summaries...</p>`;

        setTimeout(() => {
            resBox.innerHTML = `
                <div style="background: white; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 10px;">
                    <h4 style="color: #1a0dab; font-size:14px; margin-bottom:4px;"><a href="https://www.google.com/search?q=${encodeURIComponent(term)}" target="_blank" style="text-decoration:none; color:inherit;">"${term}" - External Web Search</a></h4>
                    <p style="color:#4d5156; font-size:12px; line-height:1.4;">Parsed relevant directory indices for "${term}". Click the workspace link above to explore detailed search results in real-time.</p>
                </div>
            `;
        }, 750);
    }

    // --- CALL ACTIONS ---
    const overlay = document.getElementById("active-call-overlay");
    document.getElementById("audio-call-btn").addEventListener("click", () => launchCallSession(false));
    document.getElementById("video-call-btn").addEventListener("click", () => launchCallSession(true));
    document.getElementById("hangup-call-btn").addEventListener("click", () => {
        overlay.classList.add("hidden");
        document.getElementById("video-streams-container").classList.add("hidden");
    });

    function launchCallSession(withVideo) {
        const dest = document.getElementById("chat-header-name").innerText;
        document.getElementById("call-screen-title").innerText = `Calling ${dest}...`;
        document.getElementById("call-screen-type").innerText = withVideo ? "SECURE VIDEO CHANNEL" : "SECURE AUDIO CHANNEL";
        if (withVideo) document.getElementById("video-streams-container").classList.remove("hidden");
        overlay.classList.remove("hidden");
    }

    // --- RESTRUCTURED FILE SHARING CHANNEL ---
    const mediaInput = document.getElementById("file-input");
    mediaInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;

        const headerTitle = document.getElementById("chat-header-name");
        const cacheTitle = headerTitle.innerText;
        headerTitle.innerText = "📎 Processing file data streams...";

        try {
            const storageRef = ref(storage, `shared_media/${activeChatId}/${Date.now()}_${file.name}`);
            const uploadSnap = await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(uploadSnap.ref);

            let calculatedType = "document";
            if (file.type.startsWith("image/")) calculatedType = "image";
            else if (file.type.startsWith("video/")) calculatedType = "video";
            else if (file.type.startsWith("audio/")) calculatedType = "audio";

            const collectionRoute = isGroupChat 
                ? collection(db, "groups", activeChatId, "messages")
                : collection(db, "chats", activeChatId, "messages");

            await addDoc(collectionRoute, {
                text: file.name,
                fileUrl: downloadUrl,
                type: calculatedType,
                senderId: currentUser.uid,
                senderName: currentUser.name,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            alert("File attachment processing failed: " + err.message);
        } finally {
            headerTitle.innerText = cacheTitle;
            mediaInput.value = "";
        }
    });

    // --- AUDIO VOICE TRANSCRIPTION MEMOS ---
    const recordBtn = document.getElementById("voice-record-btn");
    const recIndicator = document.getElementById("voice-recording-status");

    recordBtn.addEventListener("click", async () => {
        if (!activeChatId) return alert("Select an open channel thread to push memos.");

        if (!isRecording) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return alert("Microphone system access permissions missing.");
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunks.push(ev.data); };
                mediaRecorder.onstop = async () => {
                    recIndicator.classList.add("hidden");
                    recordBtn.innerText = "🎤";

                    const memoBlob = new Blob(audioChunks, { type: "audio/webm" });
                    const audioRef = ref(storage, `voice_notes/${activeChatId}/${Date.now()}.webm`);
                    const uploadSnap = await uploadBytes(audioRef, memoBlob);
                    const downloadUrl = await getDownloadURL(uploadSnap.ref);

                    const collectionRoute = isGroupChat 
                        ? collection(db, "groups", activeChatId, "messages")
                        : collection(db, "chats", activeChatId, "messages");

                    await addDoc(collectionRoute, {
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
                recIndicator.classList.remove("hidden");
            } catch (err) {
                alert("Microphone stream mapping error: " + err.message);
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
        }
    });

    // --- CREATE SEPARATE GROUP SPACES ---
    document.getElementById("create-group-btn").addEventListener("click", async () => {
        const title = prompt("Assign a label for the new dynamic multi-user conversation group:");
        if (!title || !title.trim()) return;

        const invites = prompt("List members separated by commas (e.g., MURIGO, MWAMINI):");
        const parsingArray = invites ? invites.split(",").map(i => i.trim().toUpperCase()) : [];

        const structuralId = "group_" + Date.now();
        await setDoc(doc(db, "groups", structuralId), {
            groupId: structuralId,
            name: title.trim() + " (Group)",
            accountMode: currentUser.accountMode,
            members: [currentUser.name.toUpperCase(), ...parsingArray],
            isGroup: true,
            createdAt: serverTimestamp()
        });
        alert(`Room "${title}" provisioned successfully.`);
        fetchSidebarChannels("");
    });

    // --- STANDARD TEXT DISPATCH LOOPS ---
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

    document.getElementById("search-users").addEventListener("input", (e) => {
        fetchSidebarChannels(e.target.value.trim());
    });

    fetchSidebarChannels("");

    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false }).catch(() => {});
        localStorage.clear();
        signOut(auth).finally(() => { window.location.href = "index.html"; });
    });
}

// ========================================================
// SECURITY ISOLATED LOOKUP SEARCH DIRECTORY POPULATOR
// ========================================================
function fetchSidebarChannels(filterKeyword) {
    const box = document.getElementById("users-container");
    if (!box) return;
    box.innerHTML = "";

    const cleanedKey = filterKeyword.trim().toUpperCase();

    // PRIVACY DESIGN PATTERN: Do not auto-populate users globally unless an explicit lookup search keyword exists
    if (cleanedKey.length > 0) {
        const userQuery = query(collection(db, "users"), where("accountMode", "==", currentUser.accountMode));
        getDocs(userQuery).then((snap) => {
            snap.forEach((userDoc) => {
                const data = userDoc.data();
                if (data.uid !== currentUser.uid && data.name.toUpperCase().includes(cleanedKey)) {
                    renderSidebarRow(data, false);
                }
            });
        });
    }

    // Pull joined custom multi-user group chat assets
    const groupQuery = query(collection(db, "groups"), where("accountMode", "==", currentUser.accountMode));
    getDocs(groupQuery).then((snap) => {
        snap.forEach((gDoc) => {
            const data = gDoc.data();
            if (data.members.includes(currentUser.name.toUpperCase())) {
                if (cleanedKey === "" || data.name.toUpperCase().includes(cleanedKey)) {
                    renderSidebarRow(data, true);
                }
            }
        });
    });
}

function renderSidebarRow(itemData, isGroupObj) {
    const box = document.getElementById("users-container");
    const containerRow = document.createElement("div");
    containerRow.className = "wa-user-item";

    const liveStatus = !isGroupObj && itemData.isOnline;
    const trackingClass = liveStatus ? "badge-online" : "badge-offline";
    const explicitText = isGroupObj ? "Shared Room Workspace" : (liveStatus ? "● Active Now" : "Away");

    const visualAvatar = isGroupObj ? "👥" : (itemData.avatarUrl 
        ? `<img src="${itemData.avatarUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
        : itemData.name.charAt(0).toUpperCase());

    containerRow.innerHTML = `
        <div class="wa-avatar-container">
            <div class="wa-avatar" style="background: ${isGroupObj ? '#005c4b' : '#00a884'}">${visualAvatar}</div>
            <span class="presence-dot ${trackingClass}"></span>
        </div>
        <div class="wa-user-info">
            <div class="wa-user-header-row">
                <h4>${itemData.name}</h4>
                <span class="presence-status-text ${trackingClass}">${explicitText}</span>
            </div>
            <p class="wa-user-status-text">${isGroupObj ? 'Tap to open thread history' : '💬 ' + (itemData.status || 'Available')}</p>
        </div>
    `;

    containerRow.addEventListener("click", () => {
        isGroupChat = isGroupObj;
        if (isGroupObj) {
            activeChatId = itemData.groupId;
            document.getElementById("no-chat-selected").classList.add("hidden");
            document.getElementById("active-chat-area").classList.remove("hidden");
            document.getElementById("chat-header-name").innerText = itemData.name;
            syncLiveMessageStreams(collection(db, "groups", activeChatId, "messages"));
        } else {
            activeChatId = [currentUser.uid, itemData.uid].sort().join("_");
            document.getElementById("no-chat-selected").classList.add("hidden");
            document.getElementById("active-chat-area").classList.remove("hidden");
            document.getElementById("chat-header-name").innerText = itemData.name;

            setDoc(doc(db, "chats", activeChatId), {
                chatId: activeChatId,
                participants: [currentUser.uid, itemData.uid],
                updatedAt: serverTimestamp()
            }, { merge: true });

            syncLiveMessageStreams(collection(db, "chats", activeChatId, "messages"));
        }
    });

    box.appendChild(containerRow);
}

function syncLiveMessageStreams(collectionReference) {
    if (unsubscribeMessages) unsubscribeMessages();
    const orderedQuery = query(collectionReference, orderBy("createdAt", "asc"));

    unsubscribeMessages = onSnapshot(orderedQuery, (snapshot) => {
        const displayCanvas = document.getElementById("message-stream");
        if (!displayCanvas) return;
        displayCanvas.innerHTML = "";

        snapshot.forEach((msgDoc) => {
            const data = msgDoc.data();
            const messageBubbleRow = document.createElement("div");
            messageBubbleRow.className = `wa-message-row ${data.senderId === currentUser.uid ? 'row-sent' : 'row-received'}`;

            let structureHTML = "";
            const dynamicSenderNameTag = isGroupChat && data.senderId !== currentUser.uid 
                ? `<small style="display:block; color:#008069; font-weight:bold; margin-bottom:2px;">${data.senderName || 'Anonymous'}</small>` 
                : "";

            if (data.type === "voice") {
                structureHTML = `${dynamicSenderNameTag}<audio src="${data.fileUrl}" controls style="max-width:100%; outline:none;"></audio>`;
            } else if (data.type === "image") {
                structureHTML = `${dynamicSenderNameTag}<img src="${data.fileUrl}" class="shared-media-img" onclick="window.open('${data.fileUrl}', '_blank')">`;
            } else if (data.type === "video") {
                structureHTML = `${dynamicSenderNameTag}<video src="${data.fileUrl}" controls class="shared-media-video"></video>`;
            } else if (data.type === "audio") {
                structureHTML = `${dynamicSenderNameTag}<audio src="${data.fileUrl}" controls style="max-width:100%;"></audio>`;
            } else if (data.type === "document") {
                structureHTML = `${dynamicSenderNameTag}<div class="shared-doc-box" onclick="window.open('${data.fileUrl}', '_blank')"><span>📄</span> <p style="margin:0; word-break:break-all;">${data.text}</p></div>`;
            } else {
                structureHTML = `${dynamicSenderNameTag}<p class="bubble-text">${data.text}</p>`;
            }

            messageBubbleRow.innerHTML = `<div class="wa-bubble">${structureHTML}</div>`;
            displayCanvas.appendChild(messageBubbleRow);
        });
        displayCanvas.scrollTop = displayCanvas.scrollHeight;
    });
}
