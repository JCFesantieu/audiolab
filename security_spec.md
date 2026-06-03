# Security Specification & Threat Model

This document outlines the security specifications and "Dirty Dozen" vulnerabilities designed to exercise our Firestore ruleset.

## 1. Data Invariants
- **Auth Guard:** All read/write operations for analysis history must be authenticated.
- **Identity Integrity:** The `ownerId` of the document must strictly equal `request.auth.uid` during creation and modification.
- **Temporal Integrity:** `createdAt` must be strictly bound to `request.time` (server timestamp) on creation and remain immutable.
- **Email Verification:** Users must have `request.auth.token.email_verified == true` to write to the database (production standard).
- **Bounds Checking:** No string can exceed 10KB. The list of dialogue turns must be bounded between 1 and 100 items. Output scores must reside between 1.0 and 10.0.
- **No Client Delegation:** Blanket list querying is blocked; constraints are forced through server checks.

---

## 2. The "Dirty Dozen" Payloads

We define 12 malicious payloads designed to bypass guards:

### Payload 1: Anonymous Create (Identity Spoofing)
An authenticated but anonymous user tries to write analysis data.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 2: Ghost Owner Create (Identity Spoofing)
An authenticated user tries to upload an analysis assigning `ownerId` to another user's UID.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 3: Unverified Email Write (Auth Bypass)
An authenticated user whose email is not verified attempts to write.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 4: Arbitrary ID Inject (Resource Poisoning)
An attacker injects a malformed string containing directory traversal paths (`../`) or extremely long payloads as the `analysisId`.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 5: Past Creation Date (Temporal Tampering)
An attacker tries to fake the `createdAt` value to a hardcoded historical Unix epoch or future date instead of `request.time`.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 6: Shadow Update Field (Update Leak)
An attacker attempts to write a "Ghost Field" `isAdmin: true` inside their analysis document.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 7: Immortal Field Mutate (Immutability Bypass)
An attacker attempts to mutate the immutable `createdAt` or `ownerId` field during a document update.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 8: Value Poisoning (Critical Out-of-Bounds Score)
An attacker tries to write an out-of-bounds score (e.g., `-999.0` or `101.0`) inside `overallQuality.score`.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 9: Denial-of-Wallet Array Attack (Exhaustion Attack)
An attacker attempts to insert a massive array of 100,000 faux dialogue turns to inflate Firestore billing resource consumption.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 10: Blank list Query Scraping (Data Leak)
A user performs a blanket collection query (e.g. `getDocs(collection(db, 'analyses'))`) without a `userId` filter.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 11: PII Blanket Read (Identity Leak)
A user tries to fetch another user's private data or emails using `getDoc`.
- **Expected Result:** `PERMISSION_DENIED`

### Payload 12: Empty Turn Array Write (Integrity Failure)
An attacker tries to upload an analysis with zero dialogue turns or a missing essential field.
- **Expected Result:** `PERMISSION_DENIED`

---

## 3. Test Runner Declaration
The following tests are defined under `firestore.rules.test.ts` to execute locally against the emulator.
