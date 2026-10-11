import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Inicjalizacja instancji Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Konfiguracja Google Providera z wymaganymi uprawnieniami Workspace (Gmail API)
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/gmail.send');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

/**
 * Inicjalizacja nasłuchu stanu uwierzytelnienia Firebase.
 * Zwraca funkcję odsubskrybowania.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Logowanie kontem Google użytkownika za pomocą popupu Firebase.
 * Pobiera i przechowuje w pamięci token OAuth z uprawnieniem do wysyłania e-maili.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Nie udało się uzyskać tokenu dostępu OAuth z konta Google.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Błąd logowania kontem Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Pobranie aktualnego tokenu dostępu (z pamięci podręcznej w sesji)
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Ustawienie tokenu dostępu w pamięci (jeśli pobrany z ponownego uwierzytelnienia)
 */
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

/**
 * Wylogowanie konta Google i wyczyszczenie tokenów
 */
export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};
