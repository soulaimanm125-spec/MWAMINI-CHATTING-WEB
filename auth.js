import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Your exact app configuration metrics verified across instances
const firebaseConfig = {
  apiKey: "AIzaSyBtDMYBR0jcyK-JfgsYtET1SenPngzmQi4",
  authDomain: "mwamini-chatting-web.firebaseapp.com",
  projectId: "mwamini-chatting-web",
  storageBucket: "mwamini-chatting-web.firebasestorage.app",
  messagingSenderId: "640958885512",
  appId: "1:640958885512:web:2f9a636acc85534009b93d",
  measurementId: "G-SW9FBXX78G"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let isLoginMode = false; // Registration mode by default layout baseline

export function initAuthGateway() {
    const submitBtn = document.getElementById("auth-submit-btn");
    const switchLink = document.getElementById("auth-switch-link");
    const nameGroup = document.getElementById("name-group");
    const switchText = document.getElementById("auth-switch-text");
    const errorDisplay = document.getElementById("error-message");
    const guestBtn = document.getElementById("guest-login-btn");

    if (!submitBtn) return; // Prevent break if run on another dashboard view

    // --- SWITCH BETWEEN LOGIN & REGISTER ---
    switchLink.addEventListener("click", () => {
        isLoginMode = !isLoginMode;
        errorDisplay.innerText = ""; // Clear errors
        
        if (isLoginMode) {
            submitBtn.innerText = "Login";
            switchLink.innerText = "Register here";
            switchText.innerText = "Don't have an account?";
            nameGroup.style.display = "none"; // Hide name input for standard login
        } else {
            submitBtn.innerText = "Register";
            switchLink.innerText = "Login here";
            switchText.innerText = "Already have an account?";
            nameGroup.style.display = "block"; // Show name input for registration
        }
    });

    // --- REGISTER & LOGIN CLICK EVENT ---
    submitBtn.addEventListener("click", async () => {
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value.trim();
        const name = document.getElementById("auth-name").value.trim();

        errorDisplay.innerText = "";

        // Form Validation Check
        if (!email || !password || (!isLoginMode && !name)) {
            errorDisplay.innerText = "Please complete all fields correctly.";
            return;
        }

        try {
            if (isLoginMode) {
                // 1. Process Login Action
                const credential = await signInWithEmailAndPassword(auth, email, password);
                
                // Fetch user data document from Firestore safely
                const userSnap = await getDoc(doc(db, "users", credential.user.uid));
                let sessionName = email.split("@")[0];
                let sessionMode = "standard";

                if (userSnap.exists()) {
                    sessionName = userSnap.data().name;
                    sessionMode = userSnap.data().accountMode || "standard";
                }

                saveUserSession(credential.user.uid, sessionName, sessionMode);
            } else {
                // 2. Process Registration Action
                const credential = await createUserWithEmailAndPassword(auth, email, password);
                
                const profilePayload = {
                    uid: credential.user.uid,
                    name: name,
                    email: email,
                    status: "Hey there! I am using Mwamini Chat.",
                    accountMode: "standard",
                    isOnline: true,
                    avatarUrl: "",
                    createdAt: serverTimestamp()
                };

                // Create user document inside Firestore
                await setDoc(doc(db, "users", credential.user.uid), profilePayload);
                saveUserSession(credential.user.uid, name, "standard");
            }
        } catch (err) {
            // Display Firebase errors directly on screen (e.g., password too short, email in use)
            errorDisplay.innerText = err.message.replace("Firebase: ", "");
        }
    });

    // --- ANONYMOUS GUEST MODE CLICK EVENT ---
    guestBtn.addEventListener("click", async () => {
        try {
            errorDisplay.innerText = "";
            const credential = await signInAnonymously(auth);
            
            // Generate a fast readable clean temporary name fallback configuration
            const shortId = credential.user.uid.substring(0, 5).toUpperCase();
            const guestUser = `GUEST_${shortId}`;
            
            const guestPayload = {
                uid: credential.user.uid,
                name: guestUser,
                email: "guest-session@mwamini.local",
                status: "Browsing room channel updates in guest mode.",
                accountMode: "standard",
                isOnline: true,
                avatarUrl: "",
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, "users", credential.user.uid), guestPayload);
            saveUserSession(credential.user.uid, guestUser, "standard");
        } catch (err) {
            errorDisplay.innerText = "Guest login blocked: " + err.message;
        }
    });
}

function saveUserSession(uid, name, mode) {
    localStorage.setItem("session_uid", uid);
    localStorage.setItem("session_name", name);
    localStorage.setItem("session_account_mode", mode);
    // Move cleanly into the operational UI interface workspace
    window.location.href = "dashboard.html";
}
