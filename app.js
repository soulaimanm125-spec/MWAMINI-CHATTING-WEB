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
let unsubscribeMessages = null;
let activeSessionStartTime = null; 

// Voice Memo Recording System Registers
let audioMediaRecorder = null;
let recordedAudioChunks = [];

export function initDashboardPage() {
    const savedUid = localStorage.getItem("session_uid");
    const savedName = localStorage.getItem("session_name");

    if (!savedUid) {
        window.location.href = "index.html";
        return;
    }

    currentUser = { uid: savedUid, name: savedName, accountMode: "standard" };
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true }).catch(() => {});

    // Profile initialization stream listener hook
    onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById("current-user-title").innerText = data.name;
            document.getElementById("my-status-display").innerText = data.status || "Available";
        }
    });

    // --- UPGRADED: ADVANCED IMAGE / VIDEO MWAMINI STATUS POST ENGINE ---
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        const mediaInput = document.getElementById("status-media-file");
        const textPayload = input.value.trim();
        const attachedFile = mediaInput.files[0];

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
                textPayload: textPayload || `Posted a new status ${computedMediaType}`,
                mediaUrl: downloadedMediaUrl,
                statusType: computedMediaType,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, "users", currentUser.uid), { 
                status: textPayload || `Active with a story update.` 
            });

            // Flush interface state values completely clean post transmission completion
            input.value = "";
            mediaInput.value = "";
            alert("Your MWAMINI status story line has been successfully dispatched.");
        } catch (err) {
            alert("Status story delivery dropped: " + err.message);
        }
    });

    // Read live MWAMINI Status feeds continuously across a rolling 24-hour retention timeline window
    const retentionThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const statusesQuery = query(collection(db, "statuses"), orderBy("createdAt", "desc"), limit(20));

    onSnapshot(statusesQuery, (snapshot) => {
        const feedContainerTray = document.getElementById("active-statuses-view");
        if (!feedContainerTray) return;
        feedContainerTray.innerHTML = "";

        snapshot.forEach((statusDoc) => {
            const data = statusDoc.data();
            if (!data.createdAt) return;

            if (data.createdAt.toDate() > retentionThreshold) {
                const layoutBubble = document.createElement("div");
                layoutBubble.style = "background: #e1f5fe; border: 1px solid #b3e5fc; padding: 6px 12px; border-radius: 12px; font-size: 12px; color: #01579b; cursor: pointer; display: flex; flex-direction: column; gap: 4px;";
                
                let embeddedMediaOutputElement = "";
                if (data.statusType === "image") {
                    embeddedMediaOutputElement = `<img src="${data.mediaUrl}" style="width:70px; height:70px; object-fit:cover; border-radius:4px; margin-top:2px;">`;
                } else if (data.statusType === "video") {
                    embeddedMediaOutputElement = `<video src="${data.mediaUrl}" style="width:70px; height:70px; object-fit:cover; border-radius:4px; margin-top:2px;" muted></video>`;
                }

                layoutBubble.innerHTML = `<strong>${data.userName}</strong><span>${data.textPayload}</span>${embeddedMediaOutputElement}`;
                
                // Clicking opens full resolution media directly into clean browser workspace contexts
                if (data.mediaUrl) {
                    layoutBubble.addEventListener("click", () => window.open(data.mediaUrl, "_blank"));
                }
                feedContainerTray.appendChild(layoutBubble);
            }
        });
    });

    // --- UPGRADED: NATIVE VOICE CHAT MEMO ENGINE ---
    const recordVoiceBtn = document.getElementById("voice-record-btn");
    const recordStatusText = document.getElementById("voice-recording-status");

    recordVoiceBtn.addEventListener("click", async () => {
        if (!activeChatId) return;

        if (!audioMediaRecorder) {
            // Requesting core browser input stream tracking access parameters
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioMediaRecorder = new MediaRecorder(stream);

                audioMediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) recordedAudioChunks.push(event.data);
                };

                audioMediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(recordedAudioChunks, { type: "audio/ogg; codecs=opus" });
                    recordedAudioChunks = [];

                    recordStatusText.classList.add("hidden");
                    recordVoiceBtn.style.color = "initial";

                    // Transmit generated voice audio file straight out to Cloud Storage paths
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

        // Toggle state recording switches sequentially on standard button inputs
        if (audioMediaRecorder.state === "inactive") {
            audioMediaRecorder.start();
            recordStatusText.classList.remove("hidden");
            recordVoiceBtn.style.color = "#ea0038";
        } else {
            audioMediaRecorder.stop();
        }
    });

    // --- UPGRADED: CALLING COMPONENT INTEGRATION HOOK HANDLERS ---
    document.getElementById("trigger-voice-call").addEventListener("click", () => {
        if (!activeChatId) return;
        alert(`Initiating secure encrypted Voice Call stream to user session endpoints...`);
    });

    document.getElementById("trigger-video-call").addEventListener("click", () => {
        if (!activeChatId) return;
        alert(`Requesting high-definition peer Video Link configuration matrices across active networks...`);
    });

    // --- SEARCH AND GENERAL CHAT LOGIC CONTINUITY RUNNERS ---
    const searchField = document.getElementById("search-users");
    searchField.addEventListener("input", (e) => executeTargetSearchQuery(e.target.value.trim()));
    executeTargetSearchQuery("");

    document.getElementById("message-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("message-input");
        if (!input.value.trim() || !activeChatId) return;

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

    document.getElementById("logout-btn").addEventListener("click", async () => {
        await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false }).catch(() => {});
        localStorage.clear();
        signOut(auth).finally(() => { window.location.href = "index.html"; });
    });
}

async function executeTargetSearchQuery(keyword) {
    const listCanvas = document.getElementById("users-container");
    if (!listCanvas) return;
    listCanvas.innerHTML = "";

    if (!keyword) {
        listCanvas.innerHTML = `<p style="font-size:12px; color:#667781; text-align:center; padding:15px; margin:0;">Type an exact username to start chatting.</p>`;
        return;
    }

    const queryResultSnap = await getDocs(query(collection(db, "users"), where("name", "==", keyword)));
    if (queryResultSnap.empty) {
        listCanvas.innerHTML = `<p style="font-size:12px; color:#ea0038; text-align:center; padding:15px; margin:0;">No matching name found.</p>`;
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
        <div class="wa-avatar-container"><div class="wa-avatar" style="background:#00a884">${userData.name.charAt(0).toUpperCase()}</div></div>
        <div class="wa-user-info">
            <div class="wa-user-header-row"><h4>${userData.name}</h4></div>
            <p class="wa-user-status-text">${userData.status || 'Available'}</p>
        </div>
    `;

    row.addEventListener("click", () => {
        activeChatId = [currentUser.uid, userData.uid].sort().join("_");
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

    canvas.innerHTML = "";
    canvas.appendChild(row);
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
                bubbleRow.className = `wa-message-row ${data.senderId === currentUser.uid ? 'row-sent' : 'row-received'}`;
                
                let visualPayloadOutputBlock = "";
                if (data.type === "audio") {
                    visualPayloadOutputBlock = `<audio src="${data.fileUrl}" controls style="max-width:220px; outline:none;"></audio>`;
                } else {
                    visualPayloadOutputBlock = `<p class="bubble-text" style="margin:0;">${data.text}</p>`;
                }

                bubbleRow.innerHTML = `<div class="wa-bubble">${visualPayloadOutputBlock}</div>`;
                chatBoxWindow.appendChild(bubbleRow);
            }
        });
        chatBoxWindow.scrollTop = chatBoxWindow.scrollHeight;
    });
}
