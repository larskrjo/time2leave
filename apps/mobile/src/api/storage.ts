/**
 * Secure persistence of the backend session JWT.
 *
 * Uses `expo-secure-store` so the token lives in:
 *   - iOS: Keychain (kSecAttrAccessibleAfterFirstUnlock)
 *   - Android: EncryptedSharedPreferences backed by Android Keystore
 *
 * The `expo-secure-store` API returns `null` for missing values and
 * is async on every platform, which lets us treat token retrieval as
 * a single Promise<string | null> regardless of OS.
 */
import * as SecureStore from "expo-secure-store";

const SESSION_TOKEN_KEY = "tlh.session.token";
const SESSION_EXPIRY_KEY = "tlh.session.expires_at";

export type StoredSession = {
    token: string;
    expiresAt: string | null;
};

export async function readStoredSession(): Promise<StoredSession | null> {
    const [token, expiresAt] = await Promise.all([
        SecureStore.getItemAsync(SESSION_TOKEN_KEY),
        SecureStore.getItemAsync(SESSION_EXPIRY_KEY),
    ]);
    if (!token) return null;
    return { token, expiresAt };
}

export async function writeStoredSession(
    session: StoredSession,
): Promise<void> {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, session.token);
    if (session.expiresAt) {
        await SecureStore.setItemAsync(
            SESSION_EXPIRY_KEY,
            session.expiresAt,
        );
    } else {
        await SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY);
    }
}

export async function clearStoredSession(): Promise<void> {
    await Promise.all([
        SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
        SecureStore.deleteItemAsync(SESSION_EXPIRY_KEY),
    ]);
}

/**
 * Lightweight in-memory mirror so the request hook can attach the
 * token synchronously after sign-in without a SecureStore round-trip
 * on every API call. `<AuthProvider>` keeps this in sync.
 */
let currentToken: string | null = null;

export function setCurrentToken(token: string | null): void {
    currentToken = token;
}

export function getCurrentToken(): string | null {
    return currentToken;
}
