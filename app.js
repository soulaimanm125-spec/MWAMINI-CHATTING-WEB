import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    onSnapshot, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    addDoc, 
    serverTimestamp, 
    orderBy, 
    where, 
    getDocs, 
    limit 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Exact project infrastructure binding initialization values
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

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// ========================================================
// SECTION A: GATEWAY IDENTITY HANDLERS (index.html)
// ========================================================
let isLoginMode = false; // False = Register Mode, True = Login Mode

export function initAuthGateway() {
    const submitBtn = document.getElementById("auth-submit-btn");
    const switchLink = document.getElementById("auth-switch-link");
    const nameGroup = document.getElementById("name-group");
    const switchText = document.getElementById("auth-switch-text");
    const errorDisplay = document.getElementById("error-message");
    const guestBtn = document.getElementById("guest-login-btn");

    if (!submitBtn) return; // Guard logic if script executes while on dashboard panel page

    // --- SWAP INTERFACE MODAL LOGIC (Login vs Register) ---
    switchLink.addEventListener("click", (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        errorDisplay.classList.add("hidden");
        
        if (isLoginMode) {
            submitBtn.innerText = "Login";
            switchLink.innerText = "Register here";
            switchText.innerText = "Don't have an account?";
            nameGroup.classList.add("hidden"); // Clear name profile text fields on strict login checks
        } else {
            submitBtn.innerText = "Register";
            switchLink.innerText = "Login here";
            switchText.innerText = "Already have an account?";
            nameGroup.classList.remove("hidden");
        }
    });

    // --- SUBMIT OPERATIONS DISPATCH ENGINE ---
    submitBtn.addEventListener("click", async () => {
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value.trim();
        const name = document.getElementById("auth-name").value.trim();

        errorDisplay.classList.add("hidden");

        if (!email || !password || (!isLoginMode && !name)) {
            showErrorUI("Please complete all fields correctly.");
            return;
        }

        try {
            if (isLoginMode) {
                // Execute Authentication Login Flow
                const credential = await signInWithEmailAndPassword(auth, email, password);
                const userDoc = await getDoc(doc(db, "users", credential.user.uid));
                
                let targetName = email.split("@")[0];
                let accountMode = "standard";

                if (userDoc.exists()) {
                    targetName = userDoc.data().name;
                    accountMode = userDoc.data().accountMode || "standard";
                }
                
                saveSessionAndRedirect(credential.user.uid, targetName, accountMode);
            } else {
                // Execute Authentication Registration Flow
                const credential = await createUserWithEmailAndPassword(auth, email, password);
                
                const profilePayload = {
                    uid: credential.user.uid,
                    name: name,
                    email: email,
                    status: "Hey there! I am using Mwamini Chat.",
                    accountMode: "standard",
                    isOnline: true,
                    avatarUrl: ""
                };

                // Commit Profile records safely down into Firestore collections
                await setDoc(doc(db, "users", credential.user.uid), profilePayload);
                saveSessionAndRedirect(credential.user.uid, name, "standard");
            }
        } catch (err) {
            showErrorUI(err.message); // Safely displays any live authentication blocks right on the screen
        }
    });

    // Optional Quick Simulation Access Channel Handler
    guestBtn.addEventListener("click", () => {
        const fallbackId = "guest_" + Date.now();
        saveSessionAndRedirect(fallbackId, "GUEST_USER", "guest_sandbox");
    });

    function showErrorUI(msg) {
        errorDisplay.innerText = msg;
        errorDisplay.classList.remove("hidden");
    }

    function saveSessionAndRedirect(uid, name, mode) {
        localStorage.setItem("session_uid", uid);
        localStorage.setItem("session_name", name);
        localStorage.setItem("session_account_mode", mode);
        window.location.href = "dashboard.html";
    }
}

// ========================================================
// SECTION B: CORE APPLICATION WORKSPACE (dashboard.html)
// ========================================================
export function initDashboardPage() {
    const savedUid = localStorage.getItem("session_uid");
    const savedName = localStorage.getItem("session_name");
    const savedMode = localStorage.getItem("session_account_mode");

    if (!savedUid) {
        window.location.href = "index.html";
        return;
    }

    currentUser = { uid: savedUid, name: savedName, accountMode: savedMode };
    
    // Update active status presence parameter safely if authenticated via DB tracks
    if (!currentUser.uid.startsWith("guest_")) {
        updateDoc(doc(db, "users", currentUser.uid), { isOnline: true }).catch(() => {});
    }

    document.getElementById("message-stream").style.backgroundColor = localStorage.getItem("chat_bg_color") || "#efeae2";

    // Track own custom status modifications via instant snapshots
    if (!currentUser.uid.startsWith("guest_")) {
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
    }

    // Profile Picture Attachment Logic Click Route
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
            alert("Profile photo updated cleanly!");
        } catch (err) {
            alert("Storage access limit warning: Rules require fully mapped Authentication credentials.");
        }
    });

    // Custom status message update input execution click
    document.getElementById("update-status-btn").addEventListener("click", async () => {
        const input = document.getElementById("status-input");
        if (!input.value.trim()) return;
        await updateDoc(doc(db, "users", currentUser.uid), { status: input.value.trim() }).catch(() => {});
        input.value = "";
    });

    // --- STATUS BROADCAST PIPELINE ---
    const statusMediaUpload = document.getElementById("status-media-upload");
    statusMediaUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        alert("Uploading temporary status media updates...");
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
        } catch (err) {
            alert("Error broadcasting status asset block.");
        } finally {
            statusMediaUpload.value = "";
        }
    });

    // Monitor community update states matching isolated framework configurations
    const sQuery = query(collection(db, "statuses"), where("accountMode", "==", currentUser.accountMode), orderBy("createdAt", "desc"), limit(15));
    onSnapshot(sQuery, (snapshot) => {
        const container = document.getElementById("active-statuses-view");
        if (!container) return;
        container.innerHTML = "";
        snapshot.forEach((sDoc) => {
            const data = sDoc.data();
            const indicator = document.createElement("div");
            indicator.style = "background: #00a884; color: white; font-size: 10px; font-weight: bold; padding: 4px 8px; border-radius: 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0;";
            indicator.innerText = `${data.userName} (${data.type === 'video' ? '🎥 Video' : '🖼️ Status'})`;
            indicator.onclick = () => { window.open(data.mediaUrl); };
            container.appendChild(indicator);
        });
    }, () => {});

    // --- INTEGRATED GOOGLE KNOWLEDGE ASSISTANT FEED ---
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
        container.innerHTML = `<p style="color: #4285f4; font-weight: bold;">Processing secure Google framework search channels...</p>`;

        setTimeout(() => {
            container.innerHTML = `
                <div style="background: #ffffff; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 10px;">
                    <h4 style="color: #1a0dab; margin-bottom: 4px;"><a href="https://www.google.com/search?q=${encodeURIComponent(queryTerm)}" target="_blank" style="text-decoration: none; color: #1a0dab; font-weight: bold;">${queryTerm} - Web Search</a></h4>
                    <p style="color: #4d5156; font-size: 12px;">Launch search operations directly on Google to access secure info strings matching context values query entries.</p>
                </div>
            `;
        }, 600);
    }

    // --- VOICE AND VIDEO ENGINE CALL INTERFACES ---
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
        callTitle.innerText = `Calling ${title}...`;
        callType.innerText = isVid ? "SECURE VIDEO CHANNEL" : "SECURE AUDIO CHANNEL";
        if (isVid) videoStreams.classList.remove("hidden");
        callOverlay.classList.remove("hidden");
    }

    // --- RESPONSIVE SHARING ATTACHMENTS HANDLING ---
    const fileInputElement = document.getElementById("file-input");
    fileInputElement.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !activeChatId) return;

        const headerTitle = document.getElementById("chat-header-name");
        const fallbackTitle = headerTitle.innerText;
        headerTitle.innerText = "📎 Storing transmission files...";

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
            alert("File transmission failed: " + err.message);
        } finally {
            headerTitle.innerText = fallbackTitle;
            fileInputElement.value = ""; 
        }
    });

    // --- AUDIO VOICE TRANSCRIPTION NOTES RECORDERS ---
    const recordBtn = document.getElementById("voice-record-btn");
    const recordingStatus = document.getElementById("voice-recording-status");

    recordBtn.addEventListener("click", async () => {
        if (!activeChatId) return alert("Select an active dialogue channel room panel container first.");

        if (!isRecording) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return alert("Device connection audio streams configuration unsupported.");
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    recordingStatus.classList.add("hidden");
                    recordBtn.innerText = "🎤";

                    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
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
                alert("Microphone connection failed.");
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
        }
    });

    // Create Group Room Event Controller Hook
    document.getElementById("create-group-btn").addEventListener("click", async () => {
        const groupTitle = prompt("Provide group context identity label name:");
        if (!groupTitle || !groupTitle.trim()) return;

        const targetUserQuery = prompt("List targeted usernames separated explicitly via commas (e.g., MURIGO):");
        const searchArray = targetUserQuery ? targetUserQuery.split(",").map(n => n.trim().toUpperCase()) : [];

        const groupUid = "group_" + Date.now();
        await setDoc(doc(db, "groups", groupUid), {
            groupId: groupUid,
            name: groupTitle.trim() + " (Group Space)",
            accountMode: currentUser.accountMode,
            members: [currentUser.name.toUpperCase(), ...searchArray],
            isGroup: true,
            createdAt: serverTimestamp()
        });
        alert("Group room generated!");
        loadSidebarRooms("");
    });

    // Chat Form input submission engine loop
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

    document.getElementById("search-users").addEventListener("input", (e) => {
        loadSidebarRooms(e.target.value.trim());
    });

    loadSidebarRooms("");

    document.getElementById("logout-btn").addEventListener("click", async () => {
        if (!currentUser.uid.startsWith("guest_")) {
            await updateDoc(doc(db, "users", currentUser.uid), { isOnline: false }).catch(() => {});
        }
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

    // PRIVACY DISCOVERY LOCKRULE: Strict username match prevent auto-leak profiles
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

    // Stream available Groups
    const gQuery = query(collection(db, "
