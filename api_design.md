# Python Backend — API Routes & Data Models

---

## Architecture Overview

The backend serves as a **metadata router and off-chain cache only**. It never holds private keys and never submits transactions to the blockchain.

- **Frontend → Blockchain (direct):** All chain writes (`grantAccess`, `revokeAccess`, `shareKeyWithDoctor`) are signed and submitted by the user's wallet via `ethers.js`. The smart contract uses `msg.sender` for identity, so transactions must originate from the user.
- **Frontend → Backend (JWT-authenticated):** User profiles, record metadata, file storage pointers, and cached permission lookups.
- **Backend → Blockchain (read-only listener):** A `web3.py` event listener watches for `AccessGranted`, `AccessRevoked`, and `KeyShared` events and syncs the off-chain `RecordPermission` table automatically.

### Authentication

All backend routes (except `POST /patients` and `POST /doctors` registration) require a valid **JWT Bearer token** in the `Authorization` header. Tokens are issued at login and contain the user's `id` and `role`.

### Local Development

- **Anvil** (Foundry) runs a local Ethereum chain at `localhost:8545` with 10 pre-funded accounts and known private keys.
- **Forge** deploys `MedicalAccessRegistry` to the local chain via `forge script`.
- The React frontend connects to `localhost:8545` using Anvil's test accounts as wallets.
- The FastAPI backend connects to `localhost:8545` as an event listener only.

---

## API Routes

### Records

| Method | Route                                        | Description                                                                                                    |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST` | `/patients/{patient_id}/records`             | Create a new record entry; accepts file storage location + encrypted master key. Patient-only (JWT-enforced).  |
| `GET`  | `/patients/{patient_id}/records`             | Fetch all record IDs + metadata + storage locations for the patient. Access checked against off-chain cache.   |
| `GET`  | `/patients/{patient_id}/records/{record_id}` | Fetch a single record's metadata and storage location.                                                         |

> Records are **immutable** once created. There are no update or delete routes.

### Permissions (off-chain cache — read-only)

The backend does **not** grant or revoke permissions. Those operations happen directly on-chain from the frontend. The backend only exposes a read endpoint over its event-synced cache.

| Method | Route                                                    | Description                                                                        |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET`  | `/patients/{patient_id}/records/{record_id}/permissions` | List all doctors who currently have access to a record (read from off-chain cache). |

### Users

| Method | Route                    | Description                                                                                           |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `POST` | `/patients`              | Register a new patient; stores name, email, public key, wallet address. No JWT required.              |
| `GET`  | `/patients/{patient_id}` | Fetch patient profile + public key.                                                                   |
| `POST` | `/doctors`               | Register a new doctor; stores name, email, public key, wallet address. No JWT required.               |
| `GET`  | `/doctors/{doctor_id}`   | Fetch doctor profile + public key. Needed by frontend to compute the ECDH shared secret.              |
| `GET`  | `/doctors`               | Search/list doctors (so a patient can find a doctor to grant access to).                              |

### Auth

| Method | Route          | Description                                                                                 |
| ------ | -------------- | ------------------------------------------------------------------------------------------- |
| `POST` | `/auth/login`  | Accepts wallet signature challenge; returns a JWT if the signature matches a registered user. |

---

## On-Chain Operations (Frontend → Blockchain)

These are **not** backend routes. They are smart contract calls made directly from the React frontend using `ethers.js`, signed by the user's wallet.

| Contract Function                                              | Caller  | Description                                                        |
| -------------------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `grantAccess(doctor)`                                          | Patient | Grant a doctor profile-level access. Emits `AccessGranted`.        |
| `revokeAccess(doctor)`                                         | Patient | Revoke a doctor's access. Emits `AccessRevoked`.                   |
| `shareKeyWithDoctor(patient, recordId, doctor, encryptedKey)`  | Patient | Store the re-encrypted file key for a specific doctor and record.  |
| `getDoctorKey(patient, recordId)`                               | Doctor  | Retrieve the caller's encrypted file key for a record (view call). |
| `checkAccess(patient, doctor)`                                  | Any     | Check whether a doctor has access to a patient (view call).        |

---

## Data Models

### Patient

| Column            | Type      | Notes                              |
| ----------------- | --------- | ---------------------------------- |
| `id`              | UUID, PK  |                                    |
| `name`            | VARCHAR   |                                    |
| `email`           | VARCHAR   | Unique                             |
| `wallet_address`  | VARCHAR   | Ethereum address, unique           |
| `public_key`      | TEXT      | ECC public key, hex or PEM encoded |
| `created_at`      | TIMESTAMP |                                    |

### Doctor

| Column            | Type      | Notes                              |
| ----------------- | --------- | ---------------------------------- |
| `id`              | UUID, PK  |                                    |
| `name`            | VARCHAR   |                                    |
| `email`           | VARCHAR   | Unique                             |
| `wallet_address`  | VARCHAR   | Ethereum address, unique           |
| `public_key`      | TEXT      | ECC public key, hex or PEM encoded |
| `created_at`      | TIMESTAMP |                                    |

### PatientRecord

| Column                 | Type      | Notes                                              |
| ---------------------- | --------- | -------------------------------------------------- |
| `id`                   | UUID, PK  |                                                    |
| `patient_id`           | UUID, FK  | References `Patient`                               |
| `metadata`             | JSONB     | File name, type, size, category/label, description |
| `file_location`        | TEXT      | Cloud storage URI (S3, GCS, etc.)                  |
| `encrypted_master_key` | TEXT      | Master key encrypted with the patient's public key |
| `created_at`           | TIMESTAMP |                                                    |

### RecordPermission (off-chain cache of on-chain state)

| Column       | Type                | Notes                                                      |
| ------------ | ------------------- | ---------------------------------------------------------- |
| `id`         | UUID, PK            |                                                            |
| `record_id`  | UUID, FK            | References `PatientRecord`                                 |
| `doctor_id`  | UUID, FK            | References `Doctor`                                        |
| `granted_at` | TIMESTAMP           | Set when `AccessGranted` event is received                 |
| `revoked_at` | TIMESTAMP, nullable | Set when `AccessRevoked` event is received; enables audit  |

> Source of truth lives on-chain. This table is populated by the backend's event listener and serves as a fast read cache for `GET /permissions`.

---

## Design Notes

- **Private keys never leave the frontend.** All blockchain transactions are signed client-side. The backend never submits transactions or handles private keys.

- **`encrypted_master_key` on `PatientRecord`** is encrypted with the patient's public key so only they can decrypt it client-side. When granting access, the frontend decrypts this locally, computes an ECDH shared secret with the doctor's public key, re-encrypts the master key, and calls `shareKeyWithDoctor` on-chain directly.

- **Only patients can create records.** The `POST /records` route is restricted to the patient identified by `{patient_id}` in the JWT.

- **The backend event listener** connects to the chain via `web3.py`, subscribes to `AccessGranted`, `AccessRevoked`, and `KeyShared` events, and upserts rows in `RecordPermission` accordingly. On startup it replays missed events from the last processed block.

- **Consider indexing `metadata->>'category'`** in Postgres for fast filtered queries on `GET /records`.
