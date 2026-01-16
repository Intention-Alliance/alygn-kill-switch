/**
 * ZKP Verification Tests
 *
 * Tests the Zero-Knowledge Proof verification logic
 */

import { describe, expect, it } from 'bun:test';
import { createHash } from 'crypto';

// Local implementation of ProofVerifier for testing
interface ProofData {
  zkp_commitment?: string;
  zkp_challenge?: string;
  zkp_response?: string;
  public_hash?: string;
  timestamp?: number;
}

class ProofVerifier {
  static verifyZKProof(proofData: ProofData): boolean {
    if (!proofData.zkp_commitment || !proofData.zkp_challenge || !proofData.zkp_response) {
      return false;
    }

    try {
      const computedHash = createHash('sha256')
        .update(proofData.zkp_commitment + proofData.zkp_challenge + proofData.zkp_response)
        .digest('hex');

      return computedHash === proofData.public_hash;
    } catch {
      return false;
    }
  }

  static verifyTimestamp(proofData: ProofData, maxAgeMs: number = 300000): boolean {
    if (!proofData.timestamp) return false;
    const now = Date.now() * 1000000;
    const age = now - proofData.timestamp;
    return age >= 0 && age <= maxAgeMs * 1000000;
  }
}

describe('ZKP Verification', () => {
  it('verifies valid ZKP proof', () => {
    const commitment = 'test_commitment_123';
    const challenge = 'test_challenge_456';
    const response = 'test_response_789';

    const publicHash = createHash('sha256')
      .update(commitment + challenge + response)
      .digest('hex');

    const proof: ProofData = {
      zkp_commitment: commitment,
      zkp_challenge: challenge,
      zkp_response: response,
      public_hash: publicHash,
    };

    expect(ProofVerifier.verifyZKProof(proof)).toBe(true);
  });

  it('rejects proof with wrong public hash', () => {
    const proof: ProofData = {
      zkp_commitment: 'test_commitment',
      zkp_challenge: 'test_challenge',
      zkp_response: 'test_response',
      public_hash: 'wrong_hash',
    };

    expect(ProofVerifier.verifyZKProof(proof)).toBe(false);
  });

  it('rejects incomplete proof (missing commitment)', () => {
    const proof: ProofData = {
      zkp_challenge: 'test_challenge',
      zkp_response: 'test_response',
      public_hash: 'some_hash',
    };

    expect(ProofVerifier.verifyZKProof(proof)).toBe(false);
  });

  it('rejects incomplete proof (missing challenge)', () => {
    const proof: ProofData = {
      zkp_commitment: 'test_commitment',
      zkp_response: 'test_response',
      public_hash: 'some_hash',
    };

    expect(ProofVerifier.verifyZKProof(proof)).toBe(false);
  });

  it('rejects incomplete proof (missing response)', () => {
    const proof: ProofData = {
      zkp_commitment: 'test_commitment',
      zkp_challenge: 'test_challenge',
      public_hash: 'some_hash',
    };

    expect(ProofVerifier.verifyZKProof(proof)).toBe(false);
  });

  it('verifies recent timestamp', () => {
    const proof: ProofData = {
      timestamp: Date.now() * 1000000 - 1000000000, // 1 second ago (in nanoseconds)
    };

    expect(ProofVerifier.verifyTimestamp(proof)).toBe(true);
  });

  it('rejects old timestamp', () => {
    const proof: ProofData = {
      timestamp: Date.now() * 1000000 - 600000 * 1000000, // 10 minutes ago (in nanoseconds)
    };

    expect(ProofVerifier.verifyTimestamp(proof, 300000)).toBe(false); // 5 min max age
  });

  it('rejects missing timestamp', () => {
    const proof: ProofData = {};
    expect(ProofVerifier.verifyTimestamp(proof)).toBe(false);
  });

  it('rejects future timestamp', () => {
    const proof: ProofData = {
      timestamp: Date.now() * 1000000 + 60000 * 1000000, // 1 minute in future
    };

    expect(ProofVerifier.verifyTimestamp(proof)).toBe(false);
  });
});
