import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/**
 * Types for the FIDO2 admin screen (ADR-143).
 *
 * Mirrors the response shapes of the kill-switch-api's
 * `/v1/auth/webauthn/*` endpoints (routed via the Next.js rewrite
 * `/api/auth/:path*` → `/v1/auth/:path*`).
 */

export type WebAuthnTransport =
  | "usb"
  | "nfc"
  | "ble"
  | "internal"
  | "hybrid"
  | "cable"
  | "smart-card";

export interface Fido2Credential {
  id: string;
  name: string | null;
  createdAt: string;
  transports: WebAuthnTransport[];
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface Fido2CredentialsResponse {
  credentials: Fido2Credential[];
}

export interface Fido2RegisterBeginResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeId: string;
}

export interface Fido2RegisterFinishResponse {
  credential: Fido2Credential;
}

export interface Fido2AssertBeginResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
}

export interface Fido2AssertFinishResponse {
  verified: boolean;
  assertionToken: string;
  expiresAt: string;
  userId: string;
  credentialId: string;
}

export interface Fido2LoginBeginResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
}

export interface Fido2LoginFinishResponse {
  verified: boolean;
  userId: string;
  email: string;
  name: string;
  credentialId: string;
}

export interface Fido2RevokeResponse {
  revoked: true;
  id: string;
}

export interface Fido2RenameResponse {
  credential: Fido2Credential;
}
