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
const trackedUnreadIndicatorSet = new Set();

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
    updateDoc(doc(db, "users", currentUser.uid), { isOnline: true }).catch(() => {});

    // --- IMMUTABLE WALLPAPER THEME SETTER ---
    const bgSelector = document.getElementById("background-changer");
    if (bgSelector) {
        bgSelector.addEventListener("change", (e) => {
            const chosenBgColor = e.target.value;
            const targetContainer = document.getElementById("message-stream");
            if (targetContainer) {
                targetContainer.style.backgroundColor = chosenBgColor;
                targetContainer.style.color = (chosenBgColor === "#121b22") ? "#ffffff" : "#000000";
            }
        });
    }

    // --- PERMANENT GROUP REGISTRATION SCHEDULER ---
    const groupSelectMenu = document.getElementById("group-type-select");
    const groupPasswordField = document.getElementById("group-password-input");
    const runCreateGroupBtn = document.getElementById("create-group-btn");

    if (groupSelectMenu && groupPasswordField) {
        groupSelectMenu.addEventListener("change", (e) => {
            if (e.target.value === "protected") {
                groupPasswordField.classList.remove("hidden");
            } else {
                groupPasswordField.classList.add("hidden");
            }
        });
    }

    if (runCreateGroupBtn) {
        runCreateGroupBtn.addEventListener("click", async () => {
            const inputField = document.getElementById("group-name-input");
            const groupTitle = inputField ? inputField.value.trim() : "";
            const groupClassification = groupSelectMenu ? groupSelectMenu.value : "public";
            const setPasswordValue = groupPasswordField ? groupPasswordField.value.trim() : "";

            if (!groupTitle) {
                alert("Please input a valid identification label for the group.");
                return;
            }
            if (groupClassification === "protected" && !setPasswordValue) {
                alert("Protected groups require an access code validation parameter.");
                return;
            }

            try {
                const uniqueGeneratedRoomId = "ROOM_" + Date.now();
                await setDoc(doc(db, "users", uniqueGeneratedRoomId), {
                    uid: uniqueGeneratedRoomId,
                    name: groupTitle,
                    status: `Active Channel Room (${groupClassification.toUpperCase()})`,
                    isGroup: true,
                    groupType: groupClassification,
                    groupPassword: setPasswordValue,
                    isOnline: true
                });

                alert(`Permanent Chat Room "${groupTitle}" successfully compiled into open directories!`);
                if(inputField) inputField.value = "";
                if(groupPasswordField) groupPasswordField.value = "";
                executeTargetSearchQuery(""); // Auto refresh pipeline layout view
            } catch (err) {
                alert("Compilation failed: " + err.message);
            }
        });
    }

    // --- REAL-TIME INCOMING MESSAGE CHAT NOTIFICATIONS ---
    onSnapshot(collection(db, "chats"), (snapshot) => {
        snapshot.forEach((chatDoc) => {
            const chatMetadata = chatDoc.data();
            // Listen if user is a participant or if it's a global group room
            if (chatDoc.id.startsWith("ROOM_") || (chatMetadata.participants && chatMetadata.participants.includes(currentUser.uid))) {
                onSnapshot(query(collection(db, "chats", chatDoc.id, "messages"), orderBy("createdAt", "desc"), limit(1)), (lastMsgSnap) => {
                    lastMsgSnap.forEach((msgDoc) => {
                        const actualMessage = msgDoc.data();
                        if (actualMessage.senderId !== currentUser.uid && chatDoc.id !== activeChatId) {
                            trackedUnreadIndicatorSet.add(chatDoc.id);
                            injectNotificationBadgeToSidebar(chatDoc.id);
                        }
                    });
                });
            }
        });
    });

    // --- STORIES/STATUS SYSTEMS ---
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

    // --- AUDIO VOICE CAPTURE HANDLERS ---
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

    // --- DIRECTORY SEARCH TRIGGERS ---
    const searchField = document.getElementById("search-users");
    if (searchField) {
        searchField.addEventListener("input", (e) => executeTargetSearchQuery(e.target.value.trim()));
    }
    executeTargetSearchQuery(""); // Run clean load automatically inside framework

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

    // PERMANENT VISIBILITY FEATURE: If search box is empty, load all active group rooms automatically
    if (!keyword) {
        const groupsSnapshot = await getDocs(query(collection(db, "users"), where("isGroup", "==", true)));
        if(groupsSnapshot.empty) {
            listCanvas.innerHTML = `<p style="font-size:12px; color:#667781; text-align:center; padding:15px; margin:0;">No active groups are running. Type a user name above to begin chatting.</p>`;
            return;
        }
        groupsSnapshot.forEach((groupDoc) => buildSidebarChannelElement(groupDoc.data()));
        return;
    }

    // Lookup tailored keyword elements matches
    const queryResultSnap = await getDocs(query(collection(db, "users"), where("name", "==", keyword)));
    if (queryResultSnap.empty) {
        listCanvas.innerHTML = `<p style="font-size:12px; color:#ea0038; text-align:center; padding:15px; margin:0;">No verified target identities found matching that exact name.</p>`;
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
    row.style = "display:flex; align-items:center; justify-content:between; padding:12px; cursor:pointer; border-bottom:1px solid #f0f2f5; transition: background 0.2s;";
    row.onmouseenter = () => row.style.backgroundColor = "#f5f6f6";
    row.onmouseleave = () => row.style.backgroundColor = "transparent";

    // LIVE PRESENCE ONLINE/OFFLINE BADGES ENGINE
    const isRoom = userData.isGroup === true;
    const presenceClass = userData.isOnline ? "status-online" : "status-offline";
    const presenceText = isRoom ? (userData.groupType.toUpperCase()) : (userData.isOnline ? "online" : "offline");

    row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; flex:1;">
            <div style="background:${isRoom ? '#005c4b' : '#00a884'}; color:white; width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:16px;">${isRoom ? '👥' : userData.name.charAt(0).toUpperCase()}</div>
            <div style="flex: 1;">
                <h4 style="margin:0; font-size:14px; color:#111b21; font-weight: 600; display:flex; align-items:center;">
                    ${userData.name}
                    <span class="status-badge ${presenceClass}">${presenceText}</span>
                </h4>
                <p style="margin:0; font-size:12px; color:#667781; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${userData.status || 'Available'}</p>
            </div>
        </div>
        <div id="badge-holder-${userData.uid}"></div>
    `;

    row.addEventListener("click", () => {
        // PASSWORD GATE IMPLEMENTATION ON PROTECTED ACTIVE CHAT GROUPS
        if (isRoom && userData.groupType === "protected") {
            const challengedTokenInput = prompt(`Enter the secure access password configuration key to connect to "${userData.name}":`);
            if (challengedTokenInput !== userData.groupPassword) {
                alert("Access Denied: Invalid security password token matching key.");
                return;
            }
        }

        activeChatId = userData.uid; 
        activeSessionStartTime = new Date();

        // Clear existing notifications upon opening the stream
        trackedUnreadIndicatorSet.delete(activeChatId);
        const activeBadgeRef = document.getElementById(`badge-holder-${userData.uid}`);
        if(activeBadgeRef) activeBadgeRef.innerHTML = "";

        document.getElementById("no-chat-selected").classList.add("hidden");
        document.getElementById("active-chat-area").classList.remove("hidden");
        document.getElementById("chat-header-name").innerText = userData.name;

        const headerPresenceBadge = document.getElementById("chat-header-presence-badge");
        if(headerPresenceBadge) {
            headerPresenceBadge.className = `status-badge ${presenceClass}`;
            headerPresenceBadge.innerText = presenceText;
        }

        setDoc(doc(db, "chats", activeChatId), {
            chatId: activeChatId,
            participants: isRoom ? [currentUser.uid] : [currentUser.uid, userData.uid],
            updatedAt: serverTimestamp()
        }, { merge: true });

        bindLiveIsolatedMessageStreams(collection(db, "chats", activeChatId, "messages"));
    });

    if(canvas) {
        canvas.appendChild(row);
        if (trackedUnreadIndicatorSet.has(userData.uid)) {
            injectNotificationBadgeToSidebar(userData.uid);
        }
    }
}

function injectNotificationBadgeToSidebar(targetId) {
    const spaceHolder = document.getElementById(`badge-holder-${targetId}`);
    if (spaceHolder) {
        spaceHolder.innerHTML = `<span class="unread-indicator">NEW</span>`;
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
                    // GOOGLE ASSISTANCE SPEAKER READ-OUT FEATURE INTEGRATED HERE
                    visualPayloadOutputBlock = `
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:30px; margin-bottom:2px;">
                            <span style="font-size:11px; font-weight:bold; color:#005c4b;">${data.senderName}</span>
                            <span class="read-aloud-bot" style="cursor:pointer; font-size:12px;" title="Google Voice Assistant Reading">🔊 Read Aloud</span>
                        </div>
                        <p style="margin:0; font-size:14.5px; white-space:pre-wrap; line-height:1.4; color:#111b21;">${data.text}</p>
                    `;
                }

                bubbleRow.innerHTML = `<div style="background:${isMe ? '#d9fdd3' : '#ffffff'}; padding:8px 12px; border-radius:8px; box-shadow:0 1px 1px rgba(0,0,0,0.08); max-width:65%; word-wrap:break-word;">${visualPayloadOutputBlock}</div>`;
                
                // Mount audio synthesis reader dynamically onto the elements stream
                const speakerActionBtn = bubbleRow.querySelector(".read-aloud-bot");
                if(speakerActionBtn) {
                    speakerActionBtn.addEventListener("click", () => {
                        const speakerVoiceNarrationInstance = new SpeechSynthesisUtterance(data.text);
                        speakerVoiceNarrationInstance.lang = 'en-US';
                        window.speechSynthesis.speak(speakerVoiceNarrationInstance);
                    });
                }

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
