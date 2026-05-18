import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, setDoc, updateDoc, addDoc, serverTimestamp, orderBy, where, getDocs, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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
let unsubscribeMessages = null;
let activeSessionStartTime = null; 

let audioMediaRecorder = null;
let recordedAudioChunks = [];
const unreadNotificationMap = new Map();

function initDashboardPage() {
    if (!document.getElementById("users-container") && !document.getElementById("message-form")) {
        console.log("Welcome view active. Core engines operating cleanly.");
        return; 
    }

    const savedUid = localStorage.getItem("session_uid");
    const savedName = localStorage.getItem("session_name");

    if (!savedUid) {
        window.location.href = "index.html";
        return; 
    }

    currentUser = { uid: savedUid, name: savedName, accountMode: "standard" };
    
    // Set user online
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true }).catch(() => {});

    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if(document.getElementById("current-user-title")) document.getElementById("current-user-title").innerText = data.name;
            if(document.getElementById("my-status-display")) document.getElementById("my-status-display").innerText = data.status || "Available";
        }
    });

    // --- BACKGROUND CHANGER ---
    const bgChanger = document.getElementById("background-changer");
    if (bgChanger) {
        bgChanger.addEventListener("change", (e) => {
            const chosenColor = e.target.value;
            const messageStream = document.getElementById("message-stream");
            if (messageStream) {
                messageStream.style.backgroundColor = chosenColor;
                messageStream.style.color = (chosenColor === "#263238") ? "#ffffff" : "#000000";
            }
        });
    }

    // --- GROUP CREATION SYSTEM ---
    const groupTypeSelect = document.getElementById("group-type-select");
    const groupPassField = document.getElementById("group-password-input");
    const createGroupBtn = document.getElementById("create-group-btn");

    if (groupTypeSelect && groupPassField) {
        groupTypeSelect.addEventListener("change", (e) => {
            if (e.target.value === "protected") {
                groupPassField.classList.remove("hidden");
            } else {
                groupPassField.classList.add("hidden");
            }
        });
    }

    if (createGroupBtn) {
        createGroupBtn.addEventListener("click", async () => {
            const groupNameInput = document.getElementById("group-name-input");
            const name = groupNameInput ? groupNameInput.value.trim() : "";
            const type = groupTypeSelect ? groupTypeSelect.value : "public";
            const password = groupPassField ? groupPassField.value.trim() : "";

            if (!name) {
                alert("Please provide a name for the chat group room.");
                return;
            }
            if (type === "protected" && !password) {
                alert("Protected groups require a secure password configuration.");
                return;
            }

            try {
                const groupRef = doc(collection(db, "users")); 
                await setDoc(groupRef, {
                    uid: groupRef.id,
                    name: name,
                    status: `Group Room Type: ${type.toUpperCase()}`,
                    isGroup: true,
                    groupType: type,
                    groupPassword: password,
                    isOnline: true
                });
                alert(`Group chat room "${name}" compiled successfully! It is now permanently visible to everyone.`);
                if(groupNameInput) groupNameInput.value = "";
                if(groupPassField) groupPassField.value = "";
            } catch (err) {
                alert("Failed to build room collection: " + err.message);
            }
        });
    }

    // --- NEW: LIVE PERMANENT GROUPS DISCOVERY STREAM ---
    const discoveryTray = document.getElementById("global-groups-discovery");
    if (discoveryTray) {
        onSnapshot(query(collection(db, "users"), where("isGroup", "==", true)), (snapshot) => {
            discoveryTray.innerHTML = "";
            if (snapshot.empty) {
                discoveryTray.innerHTML = `<p style="font-size:11px; color:#667781; text-align:center; padding:10px; margin:0;">No channels built yet. Create one above!</p>`;
                return;
            }

            snapshot.forEach((groupDoc) => {
                const data = groupDoc.data();
                const element = document.createElement("div");
                element.style = "display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid #f0f2f5; cursor:pointer; background:#ffffff;";
                element.onmouseenter = () => element.style.backgroundColor = "#f5f6f6";
                element.onmouseleave = () => element.style.backgroundColor = "#ffffff";

                const badgeTypeClass = data.groupType === "protected" ? "group-badge-protected" : "group-badge-public";
                const labelText = data.groupType === "protected" ? "🔒 Protected" : "🔓 Public";

                element.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="background:#005c4b; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px;">👥</div>
                        <div>
                            <h5 style="margin:0; font-size:13px; color:#111b21; font-weight:600;">${data.name}</h5>
                            <span class="${badgeTypeClass}">${labelText}</span>
                        </div>
                    </div>
                    <div id="badge-holder-${data.uid}"></div>
                `;

                element.addEventListener("click", () => {
                    handleChatTargetActivation(data);
                });

                discoveryTray.appendChild(element);
                if (unreadNotificationMap.get(data.uid)) {
                    triggerSidebarNotificationBadge(data.uid);
                }
            });
        });
    }

    // --- GLOBAL MESSAGE TRAFFIC UNREAD BADGES ---
    onSnapshot(collection(db, "chats"), (snapshot) => {
        snapshot.forEach((chatDoc) => {
            const data = chatDoc.data();
            onSnapshot(query(collection(db, "chats", chatDoc.id, "messages"), orderBy("createdAt", "desc"), limit(1)), (msgSnap) => {
                msgSnap.forEach((mDoc) => {
                    const mData = mDoc.data();
                    if (mData.senderId !== currentUser.uid && chatDoc.id !== activeChatId) {
                        unreadNotificationMap.set(chatDoc.id, true);
                        triggerSidebarNotificationBadge(chatDoc.id);
                    }
                });
            });
        });
    });

    // --- STORIES FEED WINDOW ---
    const updateStatusBtn = document.getElementById("update-status-btn");
    if (updateStatusBtn) {
        updateStatusBtn.addEventListener("click", async () => {
            const input = document.getElementById("status-input");
            const mediaInput = document.getElementById("status-media-file");
            const textPayload = input ? input.value.trim() : "";
            const attachedFile = mediaInput ? mediaInput.files[0] : null;

            if (!textPayload && !attachedFile) return;
            let downloadedMediaUrl = "";
            let computedMediaType = "text";

            try {
                if (attachedFile) {
                    computedMediaType = attachedFile.type.startsWith("video/") ? "video" : "image";
                    const storageLocationRef = ref(storage, `mwamini_statuses/${currentUser.uid}/${Date.now()}_${attachedFile.name}`);
                    const snapshot = await uploadBytes(storageLocationRef, attachedFile);
                    downloadedMediaUrl = await getDownloadURL(snapshot.ref);
                }

                await addDoc(collection(db, "statuses"), {
                    uid: currentUser.uid,
                    userName: currentUser.name,
                    accountMode: "standard",
                    textPayload: textPayload || `Posted an update status ${computedMediaType}`,
                    mediaUrl: downloadedMediaUrl,
                    statusType: computedMediaType,
                    createdAt: serverTimestamp()
                });

                await updateDoc(doc(db, "users", currentUser.uid), { status: textPayload || "Active with a status update." });
                if(input) input.value = "";
                if(mediaInput) mediaInput.value = "";
                alert("Status update posted successfully.");
            } catch (err) {
                alert("Status upload failed: " + err.message);
            }
        });
    }

    const retentionThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    onSnapshot(query(collection(db, "statuses"), orderBy("createdAt", "desc"), limit(20)), (snapshot) => {
        const feedContainerTray = document.getElementById("active-statuses-view");
        if (!feedContainerTray) return;
        feedContainerTray.innerHTML = "";

        snapshot.forEach((statusDoc) => {
            const data = statusDoc.data();
            if (!data.createdAt) return;
            if (data.createdAt.toDate() > retentionThreshold) {
                const layoutBubble = document.createElement("div");
                layoutBubble.style = "background: #e1f5fe; border: 1px solid #b3e5fc; padding: 6px 12px; border-radius: 12px; font-size: 12px; color: #01579b; cursor: pointer; display: flex; flex-direction: column; gap: 4px; white-space:nowrap;";
                
                let embeddedMediaOutputElement = "";
                if (data.statusType === "image") {
                    embeddedMediaOutputElement = `<img src="${data.mediaUrl}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">`;
                } else if (data.statusType === "video") {
                    embeddedMediaOutputElement = `<video src="${data.mediaUrl}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;" muted></video>`;
                }

                layoutBubble.innerHTML = `<strong>${data.userName}</strong><span>${data.textPayload}</span>${embeddedMediaOutputElement}`;
                if (data.mediaUrl) {
                    layoutBubble.addEventListener("click", () => window.open(data.mediaUrl, "_blank"));
                }
                feedContainerTray.appendChild(layoutBubble);
            }
        });
    });

    // --- VOICE MEMO CAPTURE ---
    const recordVoiceBtn = document.getElementById("voice-record-btn");
    const recordStatusText = document.getElementById("voice-recording-status");

    if (recordVoiceBtn) {
        recordVoiceBtn.addEventListener("click", async () => {
            if (!activeChatId) return;
            if (!audioMediaRecorder) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    audioMediaRecorder = new MediaRecorder(stream);
                    audioMediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedAudioChunks.push(e.data); };
                    audioMediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(recordedAudioChunks, { type: "audio/ogg; codecs=opus" });
                        recordedAudioChunks = [];
                        if(recordStatusText) recordStatusText.classList.add("hidden");
                        recordVoiceBtn.style.color = "initial";

                        const voiceStorageRef = ref(storage, `voice_memos/${activeChatId}/${Date.now()}_clip.ogg`);
                        const snap = await uploadBytes(voiceStorageRef, audioBlob);
                        const downloadUrl = await getDownloadURL(snap.ref);

                        await addDoc(collection(db, "chats", activeChatId, "messages"), {
                            text: "Voice Note Transmission",
                            fileUrl: downloadUrl,
                            type: "audio",
                            senderId: currentUser.uid,
                            senderName: currentUser.name,
                            createdAt: serverTimestamp()
                        });
                    };
                } catch (err) {
                    alert("Audio device access denied: " + err.message);
                    return;
                }
            }

            if (audioMediaRecorder.state === "inactive") {
                audioMediaRecorder.start();
                if(recordStatusText) recordStatusText.classList.remove("hidden");
                recordVoiceBtn.style.color = "#ea0038";
            } else {
                audioMediaRecorder.stop();
            }
        });
    }

    // --- SEARCH USERS HANDLER ---
    const searchField = document.getElementById("search-users");
    if (searchField) {
        searchField.addEventListener("input", (e) => executeTargetSearchQuery(e.target.value.trim()));
    }
    executeTargetSearchQuery("");

    // --- DISPATCH MESSAGE ---
    const messageForm = document.getElementById("message-form");
    if (messageForm) {
        messageForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const input = document.getElementById("message-input");
            if (!input || !input.value.trim() || !activeChatId) return;

            const basePayloadText = input.value.trim();
            input.value = "";

            await addDoc(collection(db, "chats", activeChatId, "messages"), {
                text: basePayloadText,
                type: "text",
                senderId: currentUser.uid,
                senderName: currentUser.name,
                createdAt: serverTimestamp()
            });
        });
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false }).catch(() => {});
            localStorage.clear();
            signOut(auth).finally(() => { window.location.href = "index.html"; });
        });
    }
}

async function executeTargetSearchQuery(keyword) {
    const listCanvas = document.getElementById("users-container");
    if (!listCanvas) return;
    listCanvas.innerHTML = "";

    if (!keyword) {
        listCanvas.innerHTML = `<p style="font-size:12px; color:#667781; text-align:center; padding:15px; margin:0;">Search a friend's full name to open a direct DM window.</p>`;
        return;
    }

    // Users lookup explicitly
    const queryResultSnap = await getDocs(query(collection(db, "users"), where("name", "==", keyword), where("isGroup", "==", null)));
    if (queryResultSnap.empty) {
        listCanvas.innerHTML = `<p style="font-size:12px; color:#ea0038; text-align:center; padding:15px; margin:0;">No verified users found matching that name.</p>`;
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
    row.id = `sidebar-row-${userData.uid}`;
    row.style = "display:flex; align-items:center; justify-content:space-between; padding:12px; cursor:pointer; border-bottom:1px solid #f0f2f5; transition: background 0.2s;";
    row.onmouseenter = () => row.style.backgroundColor = "#f5f6f6";
    row.onmouseleave = () => row.style.backgroundColor = "transparent";

    const presenceBadgeClass = userData.isOnline ? "status-online" : "status-offline";
    const presenceText = userData.isOnline ? "online" : "offline";

    row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex:1;">
            <div style="background:#00a884; color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:16px;">${userData.name.charAt(0).toUpperCase()}</div>
            <div style="flex: 1;">
                <h4 style="margin:0; font-size:14px; color:#111b21; font-weight: 600; display:flex; align-items:center;">
                    ${userData.name}
                    <span class="status-badge ${presenceBadgeClass}">${presenceText}</span>
                </h4>
                <p style="margin:0; font-size:12px; color:#667781; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${userData.status || 'Available'}</p>
            </div>
        </div>
        <div id="badge-holder-${userData.uid}"></div>
    `;

    row.addEventListener("click", () => {
        handleChatTargetActivation(userData);
    });

    if(canvas) {
        canvas.appendChild(row);
        if (unreadNotificationMap.get(activeChatId)) {
            triggerSidebarNotificationBadge(activeChatId);
        }
    }
}

// --- CENTRALIZED HANDLER FOR ALL CLICK CHAT ENTRY POINTS ---
function handleChatTargetActivation(userData) {
    if (userData.isGroup && userData.groupType === "protected") {
        const enteredPassword = prompt(`"${userData.name}" is a protected channel room. Please type the group password to connect:`);
        if (enteredPassword !== userData.groupPassword) {
            alert("Access authorization rejected: Invalid group password token.");
            return;
        }
    }

    activeChatId = userData.isGroup ? userData.uid : [currentUser.uid, userData.uid].sort().join("_");
    activeSessionStartTime = new Date();

    unreadNotificationMap.delete(activeChatId);
    const badgeElement = document.getElementById(`badge-holder-${userData.uid}`);
    if(badgeElement) badgeElement.innerHTML = "";

    document.getElementById("no-chat-selected").classList.add("hidden");
    document.getElementById("active-chat-area").classList.remove("hidden");
    document.getElementById("chat-header-name").innerText = userData.name;
    
    const headerBadge = document.getElementById("chat-header-presence-badge");
    if (headerBadge) {
        if (!userData.isGroup) {
            headerBadge.className = `status-badge ${userData.isOnline ? 'status-online' : 'status-offline'}`;
            headerBadge.innerText = userData.isOnline ? 'online' : 'offline';
        } else {
            headerBadge.className = userData.groupType === "protected" ? "group-badge-protected" : "group-badge-public";
            headerBadge.innerText = userData.groupType === "protected" ? "🔒 Protected" : "🔓 Public";
        }
    }

    setDoc(doc(db, "chats", activeChatId), {
        chatId: activeChatId,
        participants: userData.isGroup ? [currentUser.uid] : [currentUser.uid, userData.uid],
        updatedAt: serverTimestamp()
    }, { merge: true });

    bindLiveIsolatedMessageStreams(collection(db, "chats", activeChatId, "messages"));
}

function triggerSidebarNotificationBadge(chatId) {
    const targetedRowId = chatId.includes("_") ? chatId.split("_").find(id => id !== currentUser.uid) : chatId;
    const badgeContainer = document.getElementById(`badge-holder-${targetedRowId}`);
    if (badgeContainer) {
        badgeContainer.innerHTML = `<span class="unread-indicator">NEW</span>`;
    }
}

function bindLiveIsolatedMessageStreams(collectionReference) {
    if (unsubscribeMessages) unsubscribeMessages();
    unsubscribeMessages = onSnapshot(query(collectionReference, orderBy("createdAt", "asc")), (snapshot) => {
        const chatBoxWindow = document.getElementById("message-stream");
        if (!chatBoxWindow) return;
        chatBoxWindow.innerHTML = "";

        snapshot.forEach((msgDoc) => {
            const data = msgDoc.data();
            if (!data.createdAt) return;

            if (data.createdAt.toDate() >= activeSessionStartTime) {
                const bubbleRow = document.createElement("div");
                const isMe = data.senderId === currentUser.uid;
                bubbleRow.style = `display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:10px;`;
                
                let visualPayloadOutputBlock = "";
                if (data.type === "audio") {
                    visualPayloadOutputBlock = `<audio src="${data.fileUrl}" controls style="max-width:240px; outline:none;"></audio>`;
                } else {
                    visualPayloadOutputBlock = `
                        <div style="font-size:11px; font-weight:bold; color:#005c4b; margin-bottom:2px;">${data.senderName}</div>
                        <p style="margin:0; font-size:14.5px; white-space:pre-wrap; line-height:1.4; color:#111b21;">${data.text}</p>
                    `;
                }

                bubbleRow.innerHTML = `<div style="background:${isMe ? '#d9fdd3' : '#ffffff'}; padding:8px 12px; border-radius:8px; box-shadow:0 1px 1px rgba(0,0,0,0.08); max-width:65%; word-wrap:break-word;">${visualPayloadOutputBlock}</div>`;
                chatBoxWindow.appendChild(bubbleRow);
            }
        });
        chatBoxWindow.scrollTop = chatBoxWindow.scrollHeight;
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDashboardPage);
} else {
    initDashboardPage();
}
