import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, doc, getDoc, getDocs, getDocFromServer, limit, increment, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use specified database ID or fallback to (default)
const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId.trim() !== "" 
  ? firebaseConfig.firestoreDatabaseId 
  : undefined;

export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, doc, getDoc, getDocs, getDocFromServer, limit, increment, setDoc };

// Test connection
async function testConnection() {
  console.log("Testing Firebase connection...");
  try {
    // Try to fetch one item from the menu collection which is publicly readable
    const q = query(collection(db, 'menu'), limit(1));
    await getDocs(q);
    console.log("Firebase connection test successful. Database ID:", databaseId || '(default)');
  } catch (error) {
    console.error("Firebase connection test failed:", error);
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client appears to be offline. Check your network and configuration.");
    }
  }
}
testConnection();
