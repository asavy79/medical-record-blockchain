# Implementation Plan

## Decisions

| Decision | Choice |
|----------|--------|
| Record IDs | UUID in DB, converted to uint256 on-chain via `BigInt('0x' + uuid.replace(/-/g, ''))` (UUID is 128-bit, fits in uint256) |
| Encryption keys | Reuse Ethereum secp256k1 wallet key pair for ECDH |
| File storage | PostgreSQL `bytea` column (swap to S3 later) |
| Invite flow | Off-chain invites (backend routes), on accept → frontend calls `grantAccess` on-chain |

---

# Part 1: Frontend Plan

## New Dependencies

```
npm install ethers                  # v6 — wallet, contract calls, signing
npm install @noble/secp256k1       # ECDH shared secret, public key derivation
npm install @noble/hashes          # SHA-256, HKDF key derivation
```

AES-GCM encryption uses the **Web Crypto API** (built into every browser, no package needed).

## Frontend File Structure (new/modified)

```
frontend/app/src/
├── services/
│   ├── api.ts                 # Axios/fetch wrapper for backend REST calls
│   ├── wallet.ts              # Wallet connection, get signer, get public key
│   ├── contract.ts            # ethers.Contract instance + typed call helpers
│   └── crypto.ts              # AES-GCM encrypt/decrypt, ECDH, key derivation
├── abi/
│   └── MedicalAccessRegistry.json  # Contract ABI (from forge build output)
├── context/
│   ├── AuthContext.tsx         # REPLACE mock auth → wallet signature + JWT
│   ├── ConnectionContext.tsx   # REPLACE mock connections → backend invite API + on-chain grantAccess
│   └── WalletContext.tsx       # NEW — ethers provider, signer, wallet address state
├── pages/
│   ├── SignIn.tsx              # REPLACE mock login → wallet connect + signature challenge
│   └── Dashboard.tsx          # REPLACE mock data → backend API calls + on-chain reads
├── components/
│   ├── InviteModal.tsx         # REPLACE mock invites → POST /invites, PATCH /invites/:id
│   └── PrivateKeyModal.tsx     # REPLACE mock decrypt → real ECDH + AES-GCM decryption
```

## Wallet Connection Flow (wallet.ts + WalletContext.tsx)

1. App loads → check if `window.ethereum` exists (MetaMask) OR use Anvil's JSON-RPC directly
2. For **local dev with Anvil**: create `ethers.JsonRpcProvider("http://localhost:8545")` and `new ethers.Wallet(ANVIL_PRIVATE_KEY, provider)` — lets us use any of Anvil's 10 pre-funded accounts without MetaMask
3. `WalletContext` exposes: `provider`, `signer`, `walletAddress`, `privateKey` (hex string, needed for ECDH)
4. Derive the **uncompressed public key** from the private key using `@noble/secp256k1`:
   ```ts
   import { getPublicKey } from '@noble/secp256k1';
   const publicKey = getPublicKey(privateKeyBytes, false); // false = uncompressed (65 bytes)
   ```
   This public key is registered on the backend and used for ECDH by other users.

## Authentication Flow (SignIn.tsx + AuthContext.tsx)

1. User selects an Anvil account (dropdown of the 10 known addresses) or connects MetaMask
2. Frontend calls `GET /auth/challenge?wallet_address=0x...` → backend returns a random nonce string
3. Frontend signs the nonce: `await signer.signMessage(nonce)`
4. Frontend calls `POST /auth/login` with `{ wallet_address, signature, nonce }`
5. Backend verifies signature via `eth_account.Account.recover_message()`, checks wallet is registered → returns JWT
6. JWT stored in memory (AuthContext state). Attached to all subsequent API requests as `Authorization: Bearer <token>`
7. If wallet is not registered, redirect to registration flow first

## Registration Flow

1. **Patient registration**: user fills name + email → frontend derives public key from wallet → `POST /patients` with `{ name, email, wallet_address, public_key }`
2. **Doctor registration**: same but `POST /doctors` with `{ name, email, wallet_address, public_key, specialty }`
3. No JWT required for registration endpoints
4. After registration, auto-login (trigger the auth flow above)

## Encryption Flows (crypto.ts)

### Helper Functions

```
generateMasterKey()         → crypto.getRandomValues(32 bytes) → AES-256 key
aesGcmEncrypt(key, data)    → Web Crypto AES-GCM → { iv, ciphertext }
aesGcmDecrypt(key, iv, ct)  → Web Crypto AES-GCM → plaintext
eciesEncrypt(publicKey, plaintext)  → ephemeral ECDH + AES-GCM (using @noble/secp256k1 + @noble/hashes HKDF)
eciesDecrypt(privateKey, blob)      → reverse of above
ecdhSharedSecret(myPrivKey, theirPubKey) → @noble/secp256k1 getSharedSecret → HKDF derive → AES key
```

### Flow A: Patient Uploads a Record

```
1. User selects a file from disk
2. masterKey = generateMasterKey()                          // random 256-bit AES key
3. encryptedFile = aesGcmEncrypt(masterKey, fileBytes)      // AES-GCM encrypt the file
4. encryptedMasterKey = eciesEncrypt(patientPublicKey, masterKey)  // ECIES encrypt master key to self
5. POST /patients/{id}/records:
     body: { metadata: {...}, encrypted_master_key: hex(encryptedMasterKey) }
     file: encryptedFile (as binary upload, stored in DB bytea)
6. Backend stores record row + file bytes, returns record UUID
```

### Flow B: Patient Views Own Record

```
1. GET /patients/{id}/records/{record_id}  → { metadata, encrypted_master_key, encrypted_file }
2. masterKey = eciesDecrypt(patientPrivateKey, encrypted_master_key)
3. fileBytes = aesGcmDecrypt(masterKey, encrypted_file)
4. Display or download the decrypted file
```

### Flow C: Patient Grants Access to a Doctor

```
1. Patient accepts an invite (or finds doctor via search)
2. Frontend calls contract.grantAccess(doctorAddress)       // ethers.js, signed by patient wallet
3. Wait for tx confirmation
4. Backend event listener picks up AccessGranted event → inserts into record_permissions
```

### Flow D: Patient Shares a Specific Record's Key with a Doctor

```
1. Patient selects which records to share with the granted doctor
2. For each record:
   a. masterKey = eciesDecrypt(patientPrivateKey, record.encrypted_master_key)
   b. GET /doctors/{doctor_id} → doctorPublicKey
   c. sharedSecret = ecdhSharedSecret(patientPrivateKey, doctorPublicKey)
   d. reEncryptedKey = aesGcmEncrypt(sharedSecret, masterKey)     // AES-GCM with ECDH-derived key
   e. onChainRecordId = BigInt('0x' + recordUuid.replace(/-/g, ''))
   f. contract.shareKeyWithDoctor(patientAddress, onChainRecordId, doctorAddress, hex(reEncryptedKey))
3. Backend event listener picks up KeyShared events
```

### Flow E: Doctor Views a Shared Record

```
1. GET /patients/{patient_id}/records/{record_id}/permissions → confirms doctor has access
2. onChainRecordId = BigInt('0x' + recordUuid.replace(/-/g, ''))
3. encryptedKey = await contract.getDoctorKey(patientAddress, onChainRecordId)   // view call, no gas
4. GET /patients/{patient_id} → patientPublicKey
5. sharedSecret = ecdhSharedSecret(doctorPrivateKey, patientPublicKey)            // same shared secret
6. masterKey = aesGcmDecrypt(sharedSecret, encryptedKey)
7. GET /patients/{patient_id}/records/{record_id} → encrypted_file
8. fileBytes = aesGcmDecrypt(masterKey, encrypted_file)
9. Display or download
```

## Contract Interaction (contract.ts)

```ts
import { ethers } from 'ethers';
import MedicalAccessRegistryABI from '../abi/MedicalAccessRegistry.json';

// Initialize once per session
const contract = new ethers.Contract(CONTRACT_ADDRESS, MedicalAccessRegistryABI, signer);

// Typed wrappers:
grantAccess(doctorAddress: string): Promise<ContractTransactionReceipt>
revokeAccess(doctorAddress: string): Promise<ContractTransactionReceipt>
shareKeyWithDoctor(patientAddr, recordId: bigint, doctorAddr, encryptedKey: string): Promise<ContractTransactionReceipt>
getDoctorKey(patientAddr, recordId: bigint): Promise<string>   // view call
checkAccess(patientAddr, doctorAddr): Promise<boolean>         // view call
```

## Invite Flow (frontend side)

```
1. Doctor clicks "Request Access" on a patient → POST /invites { from_id, to_id }
2. Patient sees pending invites → GET /invites?user_id=X&status=pending
3. Patient clicks Accept:
   a. PATCH /invites/{id} { status: "accepted" }
   b. contract.grantAccess(doctorAddress)       // on-chain
   c. Then optionally share specific record keys (Flow D above)
4. Patient clicks Decline → PATCH /invites/{id} { status: "declined" }
```

---

# Part 2: Backend Plan

## Tech Stack

| Component | Library |
|-----------|---------|
| Framework | FastAPI (async) |
| Schemas | Pydantic v2 (BaseModel for request/response, BaseSettings for config) |
| ORM | SQLAlchemy 2.0 (async, with asyncpg driver) |
| Database | PostgreSQL |
| Auth | python-jose (JWT), eth_account (signature verification) |
| Blockchain | web3.py (async, event listening only) |
| Server | uvicorn |

## requirements.txt

```
fastapi>=0.115
uvicorn[standard]>=0.34
sqlalchemy[asyncio]>=2.0
asyncpg>=0.30
pydantic>=2.0
pydantic-settings>=2.0
python-jose[cryptography]>=3.3
python-multipart>=0.0.9
eth-account>=0.13
web3>=7.0
```

## Backend File Structure

```
backend/
├── main.py                         # FastAPI app, lifespan (startup: DB + event listener), CORS, include routers
├── config.py                       # Pydantic BaseSettings: DB URL, JWT secret, contract address, RPC URL
├── database.py                     # async engine, async sessionmaker, Base declarative model
├── requirements.txt
│
├── models/                         # SQLAlchemy ORM models
│   ├── __init__.py                 # re-exports all models
│   ├── patient.py                  # Patient table
│   ├── doctor.py                   # Doctor table
│   ├── record.py                   # PatientRecord table (includes bytea file_data column)
│   ├── permission.py               # RecordPermission table (off-chain cache)
│   └── invite.py                   # Invite table (off-chain invite flow)
│
├── schemas/                        # Pydantic v2 request/response models
│   ├── __init__.py
│   ├── patient.py                  # PatientCreate, PatientResponse
│   ├── doctor.py                   # DoctorCreate, DoctorResponse
│   ├── record.py                   # RecordCreate, RecordResponse (file sent separately as UploadFile)
│   ├── permission.py               # PermissionResponse
│   ├── invite.py                   # InviteCreate, InviteUpdate, InviteResponse
│   └── auth.py                     # LoginRequest, LoginResponse, ChallengeResponse
│
├── routes/                         # APIRouter modules
│   ├── __init__.py
│   ├── patients.py                 # POST /patients, GET /patients/{id}
│   ├── doctors.py                  # POST /doctors, GET /doctors/{id}, GET /doctors
│   ├── records.py                  # POST /patients/{id}/records, GET /patients/{id}/records, GET .../records/{rid}
│   ├── permissions.py              # GET /patients/{id}/records/{rid}/permissions
│   ├── invites.py                  # POST /invites, GET /invites, PATCH /invites/{id}
│   └── auth.py                     # GET /auth/challenge, POST /auth/login
│
├── services/
│   ├── __init__.py
│   ├── auth.py                     # create_jwt(), verify_jwt(), verify_wallet_signature()
│   └── event_listener.py          # Web3 event listener background task
│
└── dependencies.py                 # get_db() session dependency, get_current_user() JWT dependency
```

## Database Models (SQLAlchemy 2.0 async)

### Patient
```python
class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[uuid.UUID]            = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]                = mapped_column(String(255))
    email: Mapped[str]               = mapped_column(String(255), unique=True)
    wallet_address: Mapped[str]      = mapped_column(String(42), unique=True)   # 0x + 40 hex chars
    public_key: Mapped[str]          = mapped_column(Text)                      # uncompressed secp256k1, hex
    created_at: Mapped[datetime]     = mapped_column(default=func.now())
```

### Doctor
```python
class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[uuid.UUID]            = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str]                = mapped_column(String(255))
    email: Mapped[str]               = mapped_column(String(255), unique=True)
    wallet_address: Mapped[str]      = mapped_column(String(42), unique=True)
    public_key: Mapped[str]          = mapped_column(Text)
    specialty: Mapped[str | None]    = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime]     = mapped_column(default=func.now())
```

### PatientRecord
```python
class PatientRecord(Base):
    __tablename__ = "patient_records"
    id: Mapped[uuid.UUID]                = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID]        = mapped_column(ForeignKey("patients.id"))
    metadata_: Mapped[dict]              = mapped_column("metadata", JSONB)        # { filename, type, size, category, description }
    encrypted_master_key: Mapped[str]    = mapped_column(Text)                     # hex-encoded ECIES blob
    file_data: Mapped[bytes]             = mapped_column(LargeBinary)              # encrypted file bytes (bytea)
    created_at: Mapped[datetime]         = mapped_column(default=func.now())
```

### RecordPermission
```python
class RecordPermission(Base):
    __tablename__ = "record_permissions"
    id: Mapped[uuid.UUID]              = mapped_column(primary_key=True, default=uuid.uuid4)
    record_id: Mapped[uuid.UUID]       = mapped_column(ForeignKey("patient_records.id"))
    doctor_id: Mapped[uuid.UUID]       = mapped_column(ForeignKey("doctors.id"))
    granted_at: Mapped[datetime]       = mapped_column(default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

### Invite
```python
class Invite(Base):
    __tablename__ = "invites"
    id: Mapped[uuid.UUID]             = mapped_column(primary_key=True, default=uuid.uuid4)
    from_id: Mapped[str]              = mapped_column(String(42))       # wallet address of sender
    to_id: Mapped[str]                = mapped_column(String(42))       # wallet address of recipient
    from_role: Mapped[str]            = mapped_column(String(10))       # "patient" or "doctor"
    status: Mapped[str]               = mapped_column(String(10), default="pending")  # pending | accepted | declined
    created_at: Mapped[datetime]      = mapped_column(default=func.now())
    updated_at: Mapped[datetime]      = mapped_column(default=func.now(), onupdate=func.now())
```

## Pydantic Schemas

### Auth
```python
class ChallengeResponse(BaseModel):
    nonce: str                              # random string to sign

class LoginRequest(BaseModel):
    wallet_address: str
    signature: str
    nonce: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str                            # UUID as string
    role: str                               # "patient" or "doctor"
```

### Patient
```python
class PatientCreate(BaseModel):
    name: str
    email: EmailStr
    wallet_address: str
    public_key: str                         # hex-encoded uncompressed secp256k1

class PatientResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    wallet_address: str
    public_key: str
    created_at: datetime
```

### Doctor
```python
class DoctorCreate(BaseModel):
    name: str
    email: EmailStr
    wallet_address: str
    public_key: str
    specialty: str | None = None

class DoctorResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    wallet_address: str
    public_key: str
    specialty: str | None
    created_at: datetime
```

### Record
```python
class RecordMetadata(BaseModel):
    filename: str
    file_type: str
    size_bytes: int
    category: str                           # "lab_report", "imaging", "consultation", etc.
    description: str | None = None

class RecordCreate(BaseModel):
    metadata: RecordMetadata
    encrypted_master_key: str               # hex-encoded ECIES blob
    # file_data sent as UploadFile in multipart form

class RecordResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    metadata: RecordMetadata
    encrypted_master_key: str
    created_at: datetime
    # file_data returned via a separate download endpoint to avoid large JSON payloads
```

### Invite
```python
class InviteCreate(BaseModel):
    to_wallet_address: str

class InviteUpdate(BaseModel):
    status: Literal["accepted", "declined"]

class InviteResponse(BaseModel):
    id: uuid.UUID
    from_id: str
    to_id: str
    from_role: str
    status: str
    created_at: datetime
```

## API Routes — Full Specifications

### AUTH

#### `GET /auth/challenge?wallet_address=0x...`
- **No JWT required**
- Generate a random nonce, store in memory cache (dict keyed by wallet_address, TTL 5 min)
- Return `{ nonce: "Sign this message to authenticate: <random_hex>" }`

#### `POST /auth/login`
- **No JWT required**
- Body: `LoginRequest`
- Recover signer address from signature using `eth_account.Account.recover_message(nonce, signature=sig)`
- Verify recovered address matches `wallet_address`
- Look up user in patients table, then doctors table, by wallet_address
- If found: issue JWT with `{ sub: user.id, role: "patient"|"doctor", exp: 24h }`
- Return `LoginResponse`
- If not found: return 404

### PATIENTS

#### `POST /patients`
- **No JWT required**
- Body: `PatientCreate`
- Validate wallet_address format (0x + 40 hex chars)
- Insert into patients table
- Return `PatientResponse` (201)

#### `GET /patients/{patient_id}`
- **JWT required**
- Return `PatientResponse`
- Used by doctors to fetch a patient's public key for ECDH

### DOCTORS

#### `POST /doctors`
- **No JWT required**
- Body: `DoctorCreate`
- Insert into doctors table
- Return `DoctorResponse` (201)

#### `GET /doctors/{doctor_id}`
- **JWT required**
- Return `DoctorResponse`
- Used by patients to fetch a doctor's public key for ECDH

#### `GET /doctors?search=<name>`
- **JWT required**
- Optional query param `search` for name/specialty filtering
- Return `list[DoctorResponse]`

### RECORDS

#### `POST /patients/{patient_id}/records`
- **JWT required, patient-only, must match {patient_id}**
- Multipart form: JSON metadata + encrypted_master_key in form fields, encrypted file as `UploadFile`
- Insert into patient_records (metadata JSON, encrypted_master_key text, file_data bytea)
- Return `RecordResponse` (201)

#### `GET /patients/{patient_id}/records`
- **JWT required**
- If caller is the patient: return all their records
- If caller is a doctor: return only records they have permission for (join record_permissions where doctor_id matches and revoked_at IS NULL)
- Return `list[RecordResponse]` (metadata only, no file bytes)

#### `GET /patients/{patient_id}/records/{record_id}`
- **JWT required, access-checked**
- Return `RecordResponse` (metadata only)

#### `GET /patients/{patient_id}/records/{record_id}/file`
- **JWT required, access-checked**
- Return raw encrypted bytes as `StreamingResponse` with `application/octet-stream`
- Patient can always access their own files
- Doctor can access if they have a non-revoked permission

### PERMISSIONS

#### `GET /patients/{patient_id}/records/{record_id}/permissions`
- **JWT required, patient-only for their own records**
- Query record_permissions where record_id matches and revoked_at IS NULL
- Join with doctors table to return doctor names
- Return `list[{ doctor_id, doctor_name, granted_at }]`

### INVITES

#### `POST /invites`
- **JWT required**
- Body: `InviteCreate { to_wallet_address }`
- `from_id` = caller's wallet_address (from JWT lookup)
- `from_role` = caller's role (from JWT)
- Validate target wallet exists in patients or doctors table
- Prevent duplicate pending invites
- Insert into invites table
- Return `InviteResponse` (201)

#### `GET /invites`
- **JWT required**
- Query params: `status=pending|accepted|declined` (optional filter)
- Return invites where `from_id` or `to_id` matches caller's wallet_address
- Return `list[InviteResponse]`

#### `PATCH /invites/{invite_id}`
- **JWT required, must be the `to_id` of the invite**
- Body: `InviteUpdate { status: "accepted" | "declined" }`
- Update invite row
- Return `InviteResponse`
- Note: the actual `grantAccess` on-chain call is done by the **frontend** after this returns successfully

## Event Listener (services/event_listener.py)

### Overview
- Runs as an **asyncio background task** started in FastAPI's lifespan
- Connects to the chain via `web3.py` AsyncWeb3 provider (`http://localhost:8545`)
- Loads the `MedicalAccessRegistry` contract ABI
- Polls for new events every ~2 seconds (Anvil doesn't support persistent websocket subscriptions reliably)

### Startup Behavior
1. Read `last_processed_block` from a simple DB table or file (default: 0)
2. Replay all events from `last_processed_block + 1` to `latest`
3. Begin polling loop

### Events Handled

#### `AccessGranted(patient, doctor)`
- Look up patient by wallet_address in patients table
- Look up doctor by wallet_address in doctors table
- If both found: note the grant (used by invite flow, but no record_permission row yet — that happens per-record via KeyShared)
- This event confirms profile-level access. The invite status can be cross-referenced.

#### `AccessRevoked(patient, doctor)`
- Look up patient + doctor by wallet_address
- Set `revoked_at = now()` on all record_permissions rows for this patient's records + this doctor
- This effectively revokes access to all records at once

#### `KeyShared(patient, recordId, doctor)`
- Convert `recordId` (uint256) back to UUID: format as 32-char hex → insert hyphens at 8-4-4-4-12
- Look up patient by wallet_address, doctor by wallet_address, record by UUID
- Upsert into record_permissions: if row exists with revoked_at set, clear revoked_at and update granted_at. If no row, insert new.

### Polling Loop
```python
async def poll_events(app_state):
    w3 = AsyncWeb3(AsyncHTTPProvider(settings.rpc_url))
    contract = w3.eth.contract(address=settings.contract_address, abi=abi)

    while True:
        latest = await w3.eth.block_number
        if latest > app_state.last_block:
            # Fetch logs for each event type from last_block+1 to latest
            for event in [contract.events.AccessGranted, contract.events.AccessRevoked, contract.events.KeyShared]:
                logs = await event.get_logs(fromBlock=app_state.last_block + 1, toBlock=latest)
                for log in logs:
                    await handle_event(log, db_session)
            app_state.last_block = latest
        await asyncio.sleep(2)
```

## JWT Auth Dependency (dependencies.py)

```python
async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db)
) -> dict:
    token = authorization.replace("Bearer ", "")
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    return {"id": payload["sub"], "role": payload["role"]}
```

## Config (config.py)

```python
class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/medical_records"
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24
    rpc_url: str = "http://localhost:8545"
    contract_address: str = ""                  # set after deployment
    cors_origins: list[str] = ["http://localhost:5173"]  # Vite dev server

    model_config = SettingsConfigDict(env_file=".env")
```

## Deployment Script (onchain)

Need to create `onchain/script/DeployMedicalAccess.s.sol`:
```solidity
import {MedicalAccessRegistry} from "../src/MedicalAccess.sol";

contract DeployScript is Script {
    function run() public {
        vm.startBroadcast();
        new MedicalAccessRegistry();
        vm.stopBroadcast();
    }
}
```

After `forge script --broadcast`, the contract address goes into `backend/.env` and `frontend/.env`.

---

# Part 3: Implementation Order

### Phase 1 — Infrastructure
1. Set up PostgreSQL (docker-compose with postgres service)
2. Create `backend/requirements.txt`, `config.py`, `database.py`
3. Create all SQLAlchemy models
4. Create `DeployMedicalAccess.s.sol` deployment script
5. Build contract ABI (`forge build`), copy ABI JSON to `frontend/app/src/abi/`

### Phase 2 — Backend Auth + Users
6. Implement auth schemas + routes (`GET /auth/challenge`, `POST /auth/login`)
7. Implement JWT service + dependency
8. Implement patient routes (`POST /patients`, `GET /patients/{id}`)
9. Implement doctor routes (`POST /doctors`, `GET /doctors/{id}`, `GET /doctors`)

### Phase 3 — Backend Records + Invites
10. Implement record schemas + routes (POST, GET list, GET single, GET file)
11. Implement invite schemas + routes (POST, GET, PATCH)
12. Implement permissions route (`GET .../permissions`)

### Phase 4 — Event Listener
13. Implement `event_listener.py` with polling loop
14. Wire into FastAPI lifespan (start on startup, cancel on shutdown)
15. Handle AccessGranted, AccessRevoked, KeyShared events

### Phase 5 — Frontend Crypto + Wallet
16. Install `ethers`, `@noble/secp256k1`, `@noble/hashes`
17. Implement `crypto.ts` (AES-GCM, ECIES, ECDH helpers)
18. Implement `wallet.ts` + `WalletContext` (Anvil account selection, public key derivation)
19. Implement `contract.ts` (ethers.Contract wrapper)
20. Implement `api.ts` (backend REST client with JWT header)

### Phase 6 — Frontend Integration
21. Replace `SignIn.tsx` → wallet connect + auth challenge flow
22. Replace `AuthContext.tsx` → JWT-based auth state
23. Replace `Dashboard.tsx` → real API calls for records
24. Replace `ConnectionContext.tsx` → backend invite API + on-chain grantAccess
25. Replace `InviteModal.tsx` → real invite CRUD
26. Replace `PrivateKeyModal.tsx` → real ECDH decryption flow
27. Implement record upload with client-side encryption
28. Implement record viewing with client-side decryption
