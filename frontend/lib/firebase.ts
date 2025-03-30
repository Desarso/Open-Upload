import { initializeApp, getApps, getApp } from "firebase/app"; // Import getApps and getApp
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile,
  GoogleAuthProvider, // Import GoogleAuthProvider
  signInWithPopup // Import signInWithPopup
} from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Ensure environment variables are prefixed with NEXT_PUBLIC_ for Next.js client-side access
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};

// Basic check if config is loaded - consider more robust checks
if (!firebaseConfig.apiKey) {
  console.error("Firebase config not loaded. Ensure NEXT_PUBLIC_ environment variables are set.");
  // You might want to throw an error or handle this case differently
}

// Initialize Firebase (check if already initialized for Next.js HMR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider(); // Create Google provider instance

export { 
    app, 
    auth, 
    storage,
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut,
    updateProfile,
    ref,
    uploadBytes,
    getDownloadURL,
    googleProvider, // Export Google provider
    signInWithPopup // Export signInWithPopup
};
