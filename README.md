# Decentralized Medical Records Registry

A secure, zero-knowledge medical record sharing platform. This system utilizes a **"Lean-Chain" Architecture**, keeping heavy file processing and storage off-chain, while utilizing the Ethereum blockchain strictly as an immutable, tamper-proof access registry.

---

## Architecture Philosophy

- **Zero-Knowledge Client:** The FastAPI server and PostgreSQL database are "blind" to medical data. Symmetric encryption (AES-256) of files happens strictly on the React frontend.
- **Gas-Optimized Smart Contracts:** No heavy PDF bytes or string parsing are done on-chain. Solidity is used purely as a bouncer to map which doctors have access to which file keys.
- **Relational Metadata Caching:** PostgreSQL handles fast querying, searching, and filtering of file locations and user profiles to reduce network latency.

---

## System Components

### 1. React Frontend (The Compute Edge)

- Generates raw single-use **Master File Keys** (AES-256) for every file.
- Encrypts raw medical files and uploads them to Cloud/IPFS.
- Decrypts keys and files locally in the browser using the user's private key. Private keys never leave the client.

### 2. FastAPI & PostgreSQL (The Metadata Router)

- Caches file storage locations and user-encrypted keys for fast lookups.
- Computes shared secrets (ECIES) to re-encrypt file keys for doctors, passing them off to the blockchain.

### 3. Solidity Smart Contract (The Immutable Bouncer)

- Maintains a mapping of `Patient -> Doctor -> IsAllowed`.
- Stores the custom-encrypted Master File Keys for doctors: `Patient -> RecordId -> Doctor -> EncryptedKey`.

---

## Core User Workflows

### Uploading a Record

1. **React** generates a random Symmetric Key $\text{Key}_{AES}$.
2. **React** locks the medical PDF using $\text{Key}_{AES}$ and uploads it to cloud storage.
3. **React** locks $\text{Key}_{AES}$ using the **User's Public Key**.
4. **FastAPI** saves the file storage pointer and the User-locked key into **PostgreSQL**.

### Sharing a Record with a Doctor

1. **FastAPI** reads the User-locked key from PostgreSQL.
2. User's software decrypts it in local RAM, and derives a **Shared Secret** with the Doctor using standard Diffie-Hellman Elliptic Curve Cryptography.
3. The raw $\text{Key}_{AES}$ is re-encrypted using this Shared Secret.
4. **FastAPI** pushes this newly encrypted key to the **Solidity Contract** mapping.

### A Doctor Viewing a Record

1. **React** pulls the file storage location from **PostgreSQL**.
2. **React** pulls the custom-encrypted key from **Solidity**.
3. The Doctor's React app uses their Private Key to unlock the Shared Secret, retrieve the $\text{Key}_{AES}$, and decrypt the file locally.

---

## Prerequisites & Stack

- **Smart Contracts:** Solidity `^0.8.24` (Hardhat/Foundry)
- **Backend:** Python 3.10+, FastAPI, `web3.py`, `eciespy`
- **Database:** PostgreSQL
- **Frontend:** React (TypeScript), `ethers.js`


## Run the project

### Prerequisites

- **Docker** and **Docker Compose**
- **Foundry** (`curl -L https://foundry.paradigm.xyz | bash` then `foundryup`) — only needed to start Anvil and deploy the contract via `start-blockchain.sh`

### 1. Local blockchain and contract

From the repo root:

```bash
chmod +x start-blockchain.sh   # once, if needed
./start-blockchain.sh
```

This starts **Anvil** on port `8545`, deploys **MedicalAccessRegistry**, and appends `CONTRACT_ADDRESS=<address>` to **`.env`** in the project root. Leave this terminal running (Anvil stays up).

If you change the contract and redeploy, run **`docker compose restart backend frontend`** (or `docker compose up --build` again) so containers pick up the new address from `.env`.

### 2. App stack (API, DB, UI)

In a **second** terminal:

```bash
docker compose up --build
```

Wait until Postgres, the FastAPI backend, and the Vite frontend are healthy.

| Service    | URL |
|-----------|-----|
| Frontend  | [http://localhost:5173](http://localhost:5173) |
| Backend API | [http://localhost:8000](http://localhost:8000) |
| Anvil RPC | `http://localhost:8545` (must be running from step 1) |

The backend uses `host.docker.internal:8545` to reach Anvil on your machine.

### 3. Sign in

Open the frontend, choose an **Anvil test account** (matches the keys printed when Anvil starts), then register or sign in with your name, email, and role (patient or doctor).
