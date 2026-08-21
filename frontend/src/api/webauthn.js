// Face ID / Touch ID / Windows Hello "quick unlock" via WebAuthn platform
// authenticators.
//
// This is a LOCAL convenience gate, not a replacement for the server-side
// X-API-Key check in api/client.js — the password still lives in this
// browser's localStorage either way. All this module does is decide whether
// the app is allowed to read that stored password: a WebAuthn platform
// credential is registered once (tied to the Secure Enclave / equivalent),
// and every unlock re-proves "the same device, live, with a successful
// biometric" before the app proceeds. No challenge/response round-trips to
// the server — see the "Full passwordless login" option discussed if that
// stronger, server-verified guarantee is ever wanted instead.

const CREDENTIAL_ID_KEY = "budget_app_faceid_credential_id";
const ENABLED_KEY = "budget_app_faceid_enabled";

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

function randomChallenge() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

/** Whether Face ID/Touch ID/Windows Hello unlock is currently turned on. */
export function isFaceIdEnabled() {
  return (
    localStorage.getItem(ENABLED_KEY) === "1" &&
    Boolean(localStorage.getItem(CREDENTIAL_ID_KEY))
  );
}

/** Whether this browser/device even supports a platform authenticator. */
export async function isFaceIdAvailable() {
  if (
    !window.PublicKeyCredential ||
    !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Registers a new platform credential (triggers the Face ID/Touch ID
 * enrollment prompt) and turns quick-unlock on. Throws if the user cancels
 * or the platform authenticator isn't available.
 */
export async function registerFaceId() {
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "Ledger", id: window.location.hostname },
      user: { id: userId, name: "ledger", displayName: "Ledger" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });

  if (!credential) {
    throw new Error("Face ID setup was cancelled.");
  }

  localStorage.setItem(CREDENTIAL_ID_KEY, bufferToBase64url(credential.rawId));
  localStorage.setItem(ENABLED_KEY, "1");
  return true;
}

/** Turns quick-unlock off. Password entry becomes the only way in again. */
export function disableFaceId() {
  localStorage.removeItem(CREDENTIAL_ID_KEY);
  localStorage.removeItem(ENABLED_KEY);
}

/**
 * Prompts Face ID/Touch ID and resolves true on success. Throws if the
 * user cancels or the check fails — callers should catch and fall back to
 * password entry rather than treating that as fatal.
 */
export async function verifyFaceId() {
  const credentialId = localStorage.getItem(CREDENTIAL_ID_KEY);
  if (!credentialId) return false;

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [
        { id: base64urlToBuffer(credentialId), type: "public-key" },
      ],
      userVerification: "required",
      timeout: 60000,
    },
  });

  return Boolean(assertion);
}
