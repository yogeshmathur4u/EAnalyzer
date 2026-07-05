# Data Encryption & Security Architecture

**Legal AI Analyzer — How we protect your clients' sensitive communications**

> Internal Technical Document · Version 1.0 · 5 July 2026 · Confidential

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Why We Chose Application-Level Encryption](#2-why-we-chose-application-level-encryption)
3. [What Is — and Is Not — Encrypted](#3-what-is--and-is-not--encrypted)
4. [The Algorithm: AES-256-GCM](#4-the-algorithm-aes-256-gcm)
5. [The ENCRYPTION_KEY — Why It's Stable](#5-the-encryption_key--why-its-stable)
6. [Security Strengths & Known Gaps](#6-security-strengths--known-gaps)
7. [Is This Encryption Strong Enough?](#7-is-this-encryption-strong-enough)
8. [Security Roadmap](#8-security-roadmap)

---

## 1. Executive Summary

All sensitive communication content stored by Legal AI Analyzer is encrypted using **AES-256-GCM** — the same algorithm used by TLS 1.3, Signal, and WhatsApp. Encryption happens **before** data reaches the database, meaning the database itself never holds readable legal content.

Even if an attacker gained complete access to our database server, they would see only indecipherable ciphertext. Google OAuth credentials (which allow us to read Gmail on behalf of the user) are encrypted by the same mechanism and never stored in plaintext.

---

## 2. Why We Chose Application-Level Encryption

Legal communications are among the most sensitive data a person can share. A thread about a lease dispute, an employment claim, or a family matter contains information that could cause real harm if exposed. We identified three realistic threat surfaces:

- **Database breach** — an attacker gains direct access to the Postgres database (e.g. via a leaked connection string or a cloud misconfiguration).
- **Cloud provider access** — a rogue employee or a government subpoena directed at the infrastructure provider.
- **Backup exposure** — an unencrypted database snapshot landing in an accessible storage bucket.

Standard database-level encryption (encryption at rest) addresses the physical disk scenario but leaves data readable to anyone who can connect to the database — including the scenarios above.

**Application-level encryption** means the data is encrypted by our backend code before it is written to the database. The database stores only ciphertext; the decryption key never touches the database server. This is a fundamentally stronger model.

---

## 3. What Is — and Is Not — Encrypted

| Field | Table | Description | Status |
|---|---|---|---|
| `sanitizedText` | ExtractedMessage | Full cleaned body of each email message | ✅ AES-256-GCM |
| `chunkText` | MessageChunk | Paragraphs split for AI search (RAG chunks) | ✅ AES-256-GCM |
| `accessToken` | GoogleToken | Google OAuth access token (allows Gmail access) | ✅ AES-256-GCM |
| `refreshToken` | GoogleToken | Google OAuth refresh token (long-lived credential) | ✅ AES-256-GCM |
| `fromAddress`, `toAddress` | ExtractedMessage, Thread | Sender / recipient email addresses | ⚠️ Plaintext |
| `subject` | ExtractedMessage, Thread | Email subject line | ⚠️ Plaintext |
| `data` | Thread | Thread metadata snapshot (participants, labels, date) | ⚠️ Plaintext |
| `name`, `email`, `picture` | User | Google profile information | ℹ️ Public profile data |
| Session cookie | HTTP Cookie | Browser authentication token (JWT) | ✅ HMAC-signed, httpOnly |

> **Note:** The most sensitive data — the actual *content* of legal communications — is fully encrypted. Email metadata (sender, subject, date) is stored in plaintext to enable database search and filtering, which is a known trade-off discussed in the assessment section.

---

## 4. The Algorithm: AES-256-GCM

### What AES-256 means

**AES (Advanced Encryption Standard)** is the global encryption standard endorsed by NIST and used by every major bank, government, and secure messaging application in the world.

The **256** refers to the key size: 256 bits, which is 2²⁵⁶ possible keys — a number so astronomically large that even if every computer on Earth tried every possible key every second since the Big Bang, they would not have made a dent in checking them all. Brute-force is physically impossible.

### What GCM adds

**GCM (Galois/Counter Mode)** makes our implementation *authenticated* encryption. It does two things simultaneously:

- **Confidentiality** — the data is unreadable without the key.
- **Integrity** — any tampering with the stored ciphertext is detected and rejected when decrypting. An attacker cannot silently modify data.

This property is called **AEAD (Authenticated Encryption with Associated Data)** — it is the gold standard for modern encryption.

### Per-encryption random IV

Every single `encrypt()` call generates a fresh, cryptographically random **12-byte Initialization Vector (IV)**. This means the same email body, encrypted twice, produces two completely different ciphertexts — there are no patterns in the database that could reveal whether two stored messages are identical in content. This defeats frequency analysis attacks.

### Stored format

Each encrypted value in the database is stored as three base64 components joined by dots:

```
<IV (12 bytes)>.<AuthTag (16 bytes)>.<Ciphertext (variable length)>
```

| Component | Size | Purpose |
|---|---|---|
| IV | 12 bytes | Random nonce — unique per encryption call |
| AuthTag | 16 bytes | Tamper-detection seal generated by GCM |
| Ciphertext | Variable | The encrypted payload |

Example of what a stored `sanitizedText` looks like in the database:

```
rK9mXqP2nL4sT7vB.dF3hJ8kM1wQ6zA2cE.U29tZSBsZWdhbCBjb250ZW50...
```

There is no readable information here — no email content, no structure, nothing exploitable.

### Full source code

The entire encryption implementation — both encrypt and decrypt — is 30 lines:

```js
// backend/src/utils/encryption.js

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

export function encrypt(plaintext) {
  if (plaintext == null) return null;

  const iv = crypto.randomBytes(12);               // fresh random nonce every call
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();             // 16-byte tamper seal

  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString('base64'))
    .join('.');
}

export function decrypt(payload) {
  if (payload == null) return null;

  const [ivB64, authTagB64, ciphertextB64] = payload.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);  // throws if tampered — tamper detection

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString('utf8');
}
```

### Where encryption is applied

```js
// backend/src/utils/tokenStore.js — OAuth credentials
const encryptedAccessToken  = encrypt(googleTokens.access_token);
const encryptedRefreshToken = encrypt(googleTokens.refresh_token);

// backend/src/services/gmailService.js — email body content
sanitizedText: encrypt(plainSanitizedText),

// backend/src/services/embeddingService.js — RAG chunks
const encryptedChunkText = encrypt(chunk);
```

---

## 5. The ENCRYPTION_KEY — Why It's Stable

### Where is the key actually stored?

> **The key is NOT in the source code.** It never has been.

`ENCRYPTION_KEY` is a secret environment variable:
- **Locally:** stored in `.env` file which is listed in `.gitignore` and never committed to git
- **Production (Render):** stored in Render's encrypted secrets vault, injected at runtime
- **In code:** only accessed via `process.env.ENCRYPTION_KEY` — a reference, not the value

The key is loaded once when the server starts:

```js
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
```

No source file, no git commit, no log line ever contains the actual key value.

### What the key looks like

A 64-character hex string representing 256 bits of cryptographically random entropy, generated once with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example output (not the real key):
# a3f8d2c1e9b047f6a1c3e7d9b2f8a4c6e1d3b7f9a2c4e8d6b1f3a7c9e2d4b8f6
```

### Why it cannot be easily changed (key rotation)

Every row in `ExtractedMessage`, `MessageChunk`, and `GoogleToken` was encrypted with the current key. If we change the key:

1. All existing ciphertext becomes permanently unreadable — like changing a padlock after the contents are locked inside.
2. Decryption would throw a `crypto` error for every stored record.
3. The entire database of extracted messages, chunks, and OAuth tokens would need to be re-encrypted with the new key before switching over.

**This is inherent to symmetric encryption at rest — not a design flaw specific to our implementation.** Every system using symmetric encryption faces this same constraint.

### Why this is acceptable right now

The key lives in Render's secret vault, which:
- Is separate from the database (an attacker compromising the DB doesn't get the key)
- Is not rotated frequently (reducing exposure windows)
- Is only accessible to the application process, not exposed via any API or log

### The enterprise upgrade path

The professional solution for key rotation is **envelope encryption with a KMS**:

1. Each row is encrypted with a unique per-row **Data Encryption Key (DEK)**
2. The DEK itself is encrypted by a **Key Encryption Key (KEK)** held in a managed KMS (Google Cloud KMS, AWS KMS)
3. To rotate: re-encrypt only the small DEKs, not the actual data

This means you can rotate the master key without touching any data rows. This is planned for v2 alongside production hardening.

---

## 6. Security Strengths & Known Gaps

### ✅ Strengths

**Email body content — Strong**
The actual text of every email is encrypted with AES-256-GCM before storage. A database breach exposes zero readable legal content. This is the most important property.

**OAuth credentials — Strong**
Google access and refresh tokens are encrypted identically. A database dump cannot be used to impersonate a user's Gmail account and read their inbox.

**Session security — Strong**
Session cookies are `httpOnly` (JavaScript in the browser cannot read them), HMAC-signed with a separate `JWT_SECRET`, expire after 7 days, and are scoped to the authenticated user's identity only.

**Tamper detection — Strong**
GCM's authentication tag means any modification to stored ciphertext — even a single bit — causes decryption to throw a hard error. Silent data corruption or injection attacks on stored ciphertext are impossible.

**Unique IV per record — Strong**
Each encryption call uses a fresh random 12-byte IV, so identical email bodies produce completely different ciphertexts. Frequency/pattern analysis attacks on the database are defeated.

**Key separated from data — Strong**
The encryption key lives only in the application's environment, never in the database. Compromising the database alone is insufficient — an attacker must also separately compromise the application runtime secrets.

**User data isolation — Strong**
Every query in the backend includes a `userId` filter. User A's data is structurally inaccessible to User B regardless of encryption — encryption is a backup defence, not the primary isolation mechanism.

---

### ⚠️ Known Gaps

**Email metadata stored in plaintext**
`fromAddress`, `toAddress`, and `subject` are stored in plaintext to enable database search and filtering. A database breach would expose *who* communicated with *whom* and *about what subject*, even though the content of those communications would remain encrypted.

*Why accepted:* Encrypting these fields would require moving all search to the application layer or implementing encrypted search indexes (a significantly more complex engineering problem). This is a v2 item.

**No key rotation mechanism**
Changing `ENCRYPTION_KEY` requires a one-time migration script to decrypt every row with the old key and re-encrypt with the new key. No such script exists yet, and the operation would require a maintenance window.

*Why accepted:* The key is protected by Render's secrets vault and is not exposed to routine operations. The risk is low for v1 scale.

**Single shared key for all users**
One key encrypts all users' data. If the key were somehow exposed, all users' encrypted content would be at risk simultaneously. Per-user key derivation would scope a breach to a single user.

*Why accepted:* The attack that would expose the key (application runtime compromise) already grants access to the running server — at which point encryption provides limited additional protection anyway. The more important control is access control to the application environment itself.

---

## 7. Is This Encryption Strong Enough?

**Yes — genuinely, not as a marketing claim.**

AES-256-GCM is not a startup compromise. It is:

| Used by | Algorithm | Key size |
|---|---|---|
| Legal AI Analyzer | AES-256-GCM | 256-bit |
| Signal / WhatsApp | AES-256-GCM | 256-bit |
| TLS 1.3 (all HTTPS) | AES-256-GCM | 256-bit |
| Google Cloud KMS | AES-256-GCM | 256-bit |
| AWS Secrets Manager | AES-256-GCM | 256-bit |
| US Government (NSA Top Secret) | AES-256 | 256-bit minimum |

The specific implementation details — random IV per call, authenticated GCM mode, key outside the database — follow the same pattern used in production by Stripe, HashiCorp Vault, and every major cloud KMS.

**The honest gaps are about metadata and key rotation — operational concerns, not cryptographic weaknesses.** They do not undermine the core claim:

> *The substantive content of every legal communication this product processes is cryptographically protected such that a database breach alone cannot expose it.*

---

## 8. Security Roadmap

| Item | Description | Priority |
|---|---|---|
| **Metadata encryption** | Encrypt `fromAddress`, `toAddress`, `subject` — requires moving search to application layer or encrypted search indexes | High (v2) |
| **KMS + envelope encryption** | Integrate Google Cloud KMS or AWS KMS. Per-row data keys encrypted by a managed master key, enabling rotation without re-encrypting all data | High (v2) |
| **Per-user key derivation** | Derive per-user encryption keys using HKDF so a single key exposure is scoped to one user's data, not all users | Medium (v2) |
| **Audit log** | Log every decrypt operation with userId, timestamp, and endpoint — detect anomalous access patterns | Medium |
| **Penetration test** | Third-party security audit before any regulated-industry rollout | Before regulated launch |

---

*Internal document — not for external distribution*
*Legal AI Analyzer Engineering Team · July 2026*
