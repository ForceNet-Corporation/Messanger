import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCiL-Eq-xQNRR8d-bReut-gahzy2BGTWds",
    authDomain: "forcenet-cefc2.firebaseapp.com",
    projectId: "forcenet-cefc2",
    storageBucket: "forcenet-cefc2.firebasestorage.app",
    messagingSenderId: "1021268753513",
    appId: "1:1021268753513:web:f7af3b4e0e4ff40c48f6f8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };