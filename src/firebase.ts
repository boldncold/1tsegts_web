import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, doc, getDoc, getDocs, limit, increment, setDoc } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Persistent local cache (IndexedDB): listeners serve their first snapshot
// from cache and only bill Firestore reads for docs that changed since the
// last visit — the menu costs a returning visitor ~0 reads instead of the
// whole collection. Multi-tab manager so a customer tab and the admin
// dashboard can share the cache without fighting over the IndexedDB lease.
export const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  firebaseConfig.firestoreDatabaseId,
);

// Cloud Functions are deployed to asia-east1 — match what's set in
// functions/src/createQpayInvoice.ts and qpayWebhook.ts.
export const functions = getFunctions(app, 'asia-east1');
export const googleProvider = new GoogleAuthProvider();

// Dev opt-in: point every SDK at the local Emulator Suite so development
// never reads (or bills) the production database. Enable by putting
//   VITE_USE_EMULATORS=true
// in .env.local (git-ignored), then `npm run emulators` in a second
// terminal. Remove the flag to deliberately test against production.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, doc, getDoc, getDocs, limit, increment, setDoc, httpsCallable };
