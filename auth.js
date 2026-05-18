import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBtDMYBR0jcyK-JfgsYtET1SenPngzmQi4",
  authDomain: "mwamini-chatting-web.firebaseapp.com",
  projectId: "mwamini-chatting-web",
  storageBucket: "mwamini-chatting-web.firebasestorage.app",
  messagingSenderId: "640958885512",
  appId: "1:640958885512:web:2f9a636acc85534009b93d",
  measurementId: "G-SW9FBXX78G"
};

// Prevent Firebase double initialization errors
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

let isLoginMode = false; // Tracks current UI view model state

export function initAuthGateway() {
    const submitBtn = document.getElementById("auth-submit-btn");
    const switchLink = document.getElementById("auth-switch-link");
    const nameGroup = document.getElementById("name-group");
    const switchText = document.getElementById("auth-switch-text");
    const errorDisplay = document.getElementById("error-message");
    const guestBtn = document.getElementById("guest-login-btn");

    if (!submitBtn) return;

    // --- TOGGLE INTERFACE LOGIC ---
    switchLink.addEventListener("click", () => {
        isLoginMode = !isLoginMode;
        errorDisplay.classList.add("hidden");
        
        if (isLoginMode) {
            submitBtn.innerText = "Login";
            switchLink.innerText = "Register here";
            switchText.innerText = "Don't have an account?";
            nameGroup.classList.add("hidden"); // Hide name input during login
        } else {
            submitBtn.innerText = "Register";
            switchLink.innerText = "Login here";
            switchText.innerText = "Already have an account?";
            nameGroup.classList.remove("hidden"); // Show name input during signup
        }
    });

    // --- SUBMIT TRANSACTION (Login / Register) ---
    submitBtn.addEventListener("click", async () => {
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value.trim();
        const name = document.getElementById("auth-name").value.trim();

        errorDisplay.classList.add("hidden");

        // Basic verification validator
        if (!email || !password || (!isLoginMode && !name)) {
            showUiError("Please populate all credential input channels accurately.");
            return;
        }

        try {
            if (isLoginMode) {
                // 1. Authenticate Log In
                const credentials = await signInWithEmailAndPassword(auth, email, password);
                
                // Fetch existing document to find stored username mapping safely
                const userSnap = await getDoc(doc(db, "users", credentials.user.uid));
                let savedName = email.split("@")[0];
                let savedMode = "standard";

                if (userSnap.exists()) {
                    savedName = userSnap.data().name;
                    savedMode = userSnap.data().accountMode || "standard";
                }

                saveSessionAndRedirect(credentials.user.uid, savedName, savedMode);
            } else {
                // 2. Authenticate New Registration Creation
                const credentials = await createUserWithEmailAndPassword(auth, email, password);
                
                const profilePayload = {
                    uid: credentials.user.uid,
                    name: name,
                    email: email,
                    status: "Hey there! I am using Mwamini Chat.",
                    accountMode: "standard",
                    isOnline: true,
                    avatarUrl: "",
                    createdAt: serverTimestamp()
                };

                // Store user record in database before loading dashboard
                await setDoc(doc(db, "users", credentials.user.uid), profilePayload);
                saveSessionAndRedirect(credentials.user.uid, name, "standard");
            }
        } catch (err) {
            showUiError(err.message); // Print out Firebase errors cleanly onto the UI
        }
    });

    // --- ANONYMOUS GUEST ACCESS CHANNEL ---
    guestBtn.addEventListener("click", async () => {
        try {
            errorDisplay.classList.add("hidden");
            const credentials = await signInAnonymously(auth);
            const guestUsername = "GUEST_" + credentials.user.uid.substring(0, 5).toUpperCase();
            
            await setDoc(doc(db, "users", credentials.user.uid), {
                uid: credentials.user.uid,
                name: guestUsername,
                email: "guest@mwamini.local",
                status: "Browsing via Anonymous Guest Channel.",
                accountMode: "standard",
                isOnline: true,
                avatarUrl: ""
            });

            saveSessionAndRedirect(credentials.user.uid, guestUsername, "standard");
        } catch (err) {
            showUiError("Guest authorization access blocked: " + err.message);
        }
    });
}

function showUiError(msg) {
    const errorDisplay = document.getElementById("error-message");
    if (errorDisplay) {
        errorDisplay.innerText = msg;
        errorDisplay.classList.remove("hidden");
    }
}

function saveSessionAndRedirect(uid, name, accountMode) {
    localStorage.setItem("session_uid", uid);
    localStorage.setItem("session_name", name);
    localStorage.setItem("session_account_mode", accountMode);
    window.location.href = "dashboard.html";
}