# Python Backend — API Routes & Data Models

---

## API Routes

### Records

| Method | Route                                        | Description                                                                                                                |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/patients/{patient_id}/records`             | Create a new record entry; accepts file storage location + encrypted master key from frontend; calls `addRecord` on-chain  |
| `GET`  | `/patients/{patient_id}/records`             | Fetch all record IDs + storage locations + shared secrets for the requesting user; calls `checkAccess` on-chain per record |
| `GET`  | `/patients/{patient_id}/records/{record_id}` | Fetch a single record's metadata and storage location                                                                      |

### Permissions

| Method   | Route                                                                | Description                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/patients/{patient_id}/records/{record_id}/permissions`             | Grant a doctor access; accepts `doctor_id` + patient's encrypted master key (decrypted on frontend first, then re-encrypted with shared secret before hitting this route); calls `grantAccess` on-chain |
| `DELETE` | `/patients/{patient_id}/records/{record_id}/permissions/{doctor_id}` | Revoke a doctor's access; calls `revokeAccess` on-chain                                                                                                                                                 |
| `GET`    | `/patients/{patient_id}/records/{record_id}/permissions`             | List all doctors who currently have access to a record                                                                                                                                                  |

### Users

| Method | Route                    | Description                                                                                                                      |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/patients`              | Register a new patient; stores id, public key, name, email                                                                       |
| `GET`  | `/patients/{patient_id}` | Fetch patient profile + public key                                                                                               |
| `POST` | `/doctors`               | Register a new doctor                                                                                                            |
| `GET`  | `/doctors/{doctor_id}`   | Fetch doctor profile + public key; needed by frontend when computing the shared secret before calling the permissions POST route |
| `GET`  | `/doctors`               | Search/list doctors (so a patient can find a doctor to grant access to)                                                          |

---

## Data Models

### Patient

| Column       | Type      | Notes                              |
| ------------ | --------- | ---------------------------------- |
| `id`         | UUID, PK  |                                    |
| `name`       | VARCHAR   |                                    |
| `email`      | VARCHAR   | Unique                             |
| `public_key` | TEXT      | ECC public key, hex or PEM encoded |
| `created_at` | TIMESTAMP |                                    |

### Doctor

| Column       | Type      | Notes                              |
| ------------ | --------- | ---------------------------------- |
| `id`         | UUID, PK  |                                    |
| `name`       | VARCHAR   |                                    |
| `email`      | VARCHAR   | Unique                             |
| `public_key` | TEXT      | ECC public key, hex or PEM encoded |
| `created_at` | TIMESTAMP |                                    |

> **Note:** These two tables may be collapsed into a single `users` table with a `role` enum (`patient`, `doctor`). The cryptographic treatment is identical and it simplifies foreign keys.

### PatientRecord

| Column                 | Type      | Notes                                              |
| ---------------------- | --------- | -------------------------------------------------- |
| `id`                   | UUID, PK  |                                                    |
| `patient_id`           | UUID, FK  | References `Patient`                               |
| `metadata`             | JSONB     | File name, type, size, category/label, description |
| `file_location`        | TEXT      | Cloud storage URI (S3, GCS, etc.)                  |
| `encrypted_master_key` | TEXT      | Master key encrypted with the patient's public key |
| `created_at`           | TIMESTAMP |                                                    |
| `updated_at`           | TIMESTAMP |                                                    |

### RecordPermission _(optional — off-chain mirror of on-chain state)_

| Column       | Type                | Notes                              |
| ------------ | ------------------- | ---------------------------------- |
| `id`         | UUID, PK            |                                    |
| `record_id`  | UUID, FK            | References `PatientRecord`         |
| `doctor_id`  | UUID, FK            | References `Doctor`                |
| `granted_at` | TIMESTAMP           |                                    |
| `revoked_at` | TIMESTAMP, nullable | Soft delete; enables audit history |

> **Note:** This table is optional since the source of truth lives on-chain, but it enables fast `GET /permissions` lookups without hitting the chain every time and supports audit logging.

---

## Design Notes

- **Never accept a raw private key over the wire.** The `POST /permissions` route should only ever receive the already-computed `joined_key` (the master key re-encrypted with the ECDH shared secret). All private key operations must happen exclusively on the frontend.

- **`encrypted_master_key` on `PatientRecord`** is encrypted with the patient's public key so only they can decrypt it client-side. When granting access, the frontend decrypts this locally and re-encrypts it with the ECDH shared secret before POSTing to the permissions route.

- **Consider indexing `metadata->>'category'`** in Postgres. Your design mentions records being filtered and displayed by category — keeping that in Postgres rather than on-chain makes `GET /records` filtering fast and cheap.
