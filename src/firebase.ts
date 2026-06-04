import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, doc, getDoc, getDocs, getDocFromServer, limit, increment, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
// Cloud Functions are deployed to asia-east1 — match what's set in
// functions/src/createQpayInvoice.ts and qpayWebhook.ts.
export const functions = getFunctions(app, 'asia-east1');
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, doc, getDoc, getDocs, getDocFromServer, limit, increment, setDoc, httpsCallable };

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
