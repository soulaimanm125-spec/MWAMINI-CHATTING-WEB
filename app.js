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

function initDashboardPage() {
    const savedUid = localStorage.getItem("session_uid");
    const savedName = localStorage.getItem("session_name");

    // Exit immediately if this script runs on the login screen
    if (!savedUid && window.location.pathname.includes("dashboard.html")) {
        window.location.href = "index.html";
        return;
    } else if (!savedUid) {
        return; 
    }

    currentUser = { uid: savedUid, name: savedName, accountMode: "standard" };
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true }).catch(() => {});

    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if(document.getElementById("current-user-title")) document.getElementById("current-user-title").innerText = data.name;
            if(document.getElementById("my-status-display")) document.getElementById("my-status-display").innerText = data.status || "Available";
        }
    });

    // --- MWAMINI STATUS POST ENGINE ---
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

                await updateDoc(doc(db, "users", currentUser.uid), { status: textPayload || "Active with a story update." });
                if(input) input.value = "";
                if(mediaInput) mediaInput.value = "";
                alert("Your MWAMINI status story line has been successfully dispatched.");
            } catch (err) {
                alert("Status story delivery dropped: " + err.message);
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

    // --- NATIVE VOICE RECORDING ATTACHMENTS ---
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
                            text: "Voice Note Spatial Transmission",
                            fileUrl: downloadUrl,
                            type: "audio",
                            senderId: currentUser.uid,
                            senderName: currentUser.name,
                            createdAt: serverTimestamp()
                        });
                    };
                } catch (err) {
                    alert("Audio capturing permission rejected: " + err.message);
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

    if(document.getElementById("trigger-voice-call")) {
        document.getElementById("trigger-voice-call").addEventListener("click", () => alert("Initiating secure encrypted Voice Call stream..."));
    }
    if(document.getElementById("trigger-video-call")) {
        document.getElementById("trigger-video-call").addEventListener("click", () => alert("Requesting high-definition peer Video Link configuration..."));
    }

    // --- PRIVACY SEARCH QUERY SUITE ---
    const searchField = document.getElementById("search-users");
    if (searchField) {
        searchField.addEventListener("input", (e) => executeTargetSearchQuery(e.target.value.trim()));
    }
    executeTargetSearchQuery("");

    // --- MESSAGE SEND FORM ACTIONS ---
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
        listCanvas.innerHTML = `<p style="font-size:12px; color:#667781; text-align:center; padding:15px; margin:0;">Type an exact username to clear privacy filter.</p>`;
        return;
    }

    const queryResultSnap = await getDocs(query(collection(db, "users"), where("name", "==", keyword)));
    if (queryResultSnap.empty) {
        listCanvas.innerHTML = `<p style="font-size:12px; color:#ea0038; text-align:center; padding:15px; margin:0;">No verified identity matching resolved.</p>`;
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
    row.style = "display:flex; align-items:center; gap:10px; padding:10px; cursor:pointer; border-bottom:1px solid #f0f2f5;";

    row.innerHTML = `
        <div style="background:#00a884; color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">${userData.name.charAt(0).toUpperCase()}</div>
        <div>
            <h4 style="margin:0; font-size:14px; color:#111b21;">${userData.name}</h4>
            <p style="margin:0; font-size:12px; color:#667781;">${userData.status || 'Available'}</p>
        </div>
    `;

    row.addEventListener("click", () => {
        activeChatId = [currentUser.uid, userData.uid].sort().join("_");
        activeSessionStartTime = new Date();

        if(document.getElementById("no-chat-selected")) document.getElementById("no-chat-selected").classList.add("hidden");
        if(document.getElementById("active-chat-area")) document.getElementById("active-chat-area").classList.remove("hidden");
        if(document.getElementById("chat-header-name")) document.getElementById("chat-header-name").innerText = userData.name;

        setDoc(doc(db, "chats", activeChatId), {
            chatId: activeChatId,
            participants: [currentUser.uid, userData.uid],
            updatedAt: serverTimestamp()
        }, { merge: true });

        bindLiveIsolatedMessageStreams(collection(db, "chats", activeChatId, "messages"));
    });

    if(canvas) {
        canvas.innerHTML = "";
        canvas.appendChild(row);
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
                    visualPayloadOutputBlock = `<audio src="${data.fileUrl}" controls style="max-width:240px;"></audio>`;
                } else {
                    visualPayloadOutputBlock = `<p style="margin:0; font-size:14px; white-space:pre-wrap;">${data.text}</p>`;
                }

                bubbleRow.innerHTML = `<div style="background:${isMe ? '#d9fdd3' : '#ffffff'}; padding:8px 12px; border-radius:8px; box-shadow:0 1px 1px rgba(0,0,0,0.05); max-width:60%;">${visualPayloadOutputBlock}</div>`;
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
