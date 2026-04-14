import asyncio
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from web3 import AsyncWeb3
from web3.providers import AsyncHTTPProvider

from config import settings
from database import async_session
from models.doctor import Doctor
from models.patient import Patient
from models.permission import RecordPermission
from models.record import PatientRecord

# Only the event ABI entries needed for log decoding
CONTRACT_ABI = [
    {
        "type": "event",
        "name": "AccessGranted",
        "inputs": [
            {"name": "patient", "type": "address", "indexed": True},
            {"name": "doctor", "type": "address", "indexed": True},
        ],
        "anonymous": False,
    },
    {
        "type": "event",
        "name": "AccessRevoked",
        "inputs": [
            {"name": "patient", "type": "address", "indexed": True},
            {"name": "doctor", "type": "address", "indexed": True},
        ],
        "anonymous": False,
    },
    {
        "type": "event",
        "name": "KeyShared",
        "inputs": [
            {"name": "patient", "type": "address", "indexed": True},
            {"name": "recordId", "type": "uint256", "indexed": True},
            {"name": "doctor", "type": "address", "indexed": True},
        ],
        "anonymous": False,
    },
]


def uint256_to_uuid(record_id: int) -> uuid.UUID:
    """Convert a uint256 record ID back to a UUID.

    The frontend converts UUID → uint256 via BigInt('0x' + uuid.replace(/-/g, '')).
    We reverse that: format as 32-char hex, then insert hyphens at 8-4-4-4-12.
    """
    hex_str = format(record_id, "032x")
    return uuid.UUID(hex_str)


async def handle_access_granted(patient_addr: str, doctor_addr: str):
    """Log profile-level access grant. Actual record permissions come via KeyShared."""
    print(f"[event] AccessGranted: patient={patient_addr} doctor={doctor_addr}")


async def handle_access_revoked(patient_addr: str, doctor_addr: str):
    """Revoke all record permissions for this doctor on this patient's records."""
    async with async_session() as db:
        # Find patient and doctor by wallet address
        patient_result = await db.execute(
            select(Patient).where(Patient.wallet_address == patient_addr.lower())
        )
        patient = patient_result.scalar_one_or_none()

        doctor_result = await db.execute(
            select(Doctor).where(Doctor.wallet_address == doctor_addr.lower())
        )
        doctor = doctor_result.scalar_one_or_none()

        if not patient or not doctor:
            print(f"[event] AccessRevoked: unknown patient or doctor, skipping")
            return

        # Get all this patient's record IDs
        records_result = await db.execute(
            select(PatientRecord.id).where(PatientRecord.patient_id == patient.id)
        )
        record_ids = [r[0] for r in records_result.all()]

        if record_ids:
            # Revoke all permissions for this doctor on these records
            await db.execute(
                update(RecordPermission)
                .where(
                    RecordPermission.record_id.in_(record_ids),
                    RecordPermission.doctor_id == doctor.id,
                    RecordPermission.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(timezone.utc))
            )
            await db.commit()

        print(f"[event] AccessRevoked: revoked {len(record_ids)} record permissions")


async def handle_key_shared(patient_addr: str, record_id_uint: int, doctor_addr: str):
    """Upsert a record permission when a key is shared on-chain."""
    record_uuid = uint256_to_uuid(record_id_uint)

    async with async_session() as db:
        # Look up patient, doctor, record
        patient_result = await db.execute(
            select(Patient).where(Patient.wallet_address == patient_addr.lower())
        )
        patient = patient_result.scalar_one_or_none()

        doctor_result = await db.execute(
            select(Doctor).where(Doctor.wallet_address == doctor_addr.lower())
        )
        doctor = doctor_result.scalar_one_or_none()

        if not patient or not doctor:
            print(f"[event] KeyShared: unknown patient or doctor, skipping")
            return

        record_result = await db.execute(
            select(PatientRecord).where(
                PatientRecord.id == record_uuid,
                PatientRecord.patient_id == patient.id,
            )
        )
        record = record_result.scalar_one_or_none()
        if not record:
            print(f"[event] KeyShared: record {record_uuid} not found, skipping")
            return

        # Upsert: check if permission row exists
        perm_result = await db.execute(
            select(RecordPermission).where(
                RecordPermission.record_id == record_uuid,
                RecordPermission.doctor_id == doctor.id,
            )
        )
        existing_perm = perm_result.scalar_one_or_none()

        if existing_perm:
            # Re-activate if previously revoked
            existing_perm.revoked_at = None
            existing_perm.granted_at = datetime.now(timezone.utc)
        else:
            perm = RecordPermission(
                id=uuid.uuid4(),
                record_id=record_uuid,
                doctor_id=doctor.id,
            )
            db.add(perm)

        await db.commit()
        print(f"[event] KeyShared: permission upserted for record={record_uuid} doctor={doctor.id}")


async def poll_events(app_state: dict):
    """Main polling loop for blockchain events."""
    if not settings.contract_address:
        print("[event_listener] No contract address configured, skipping event polling")
        return

    w3 = AsyncWeb3(AsyncHTTPProvider(settings.rpc_url))
    contract = w3.eth.contract(
        address=w3.to_checksum_address(settings.contract_address),
        abi=CONTRACT_ABI,
    )

    last_block = app_state.get("last_block", 0)
    print(f"[event_listener] Starting event polling from block {last_block}")

    while True:
        try:
            latest = await w3.eth.block_number

            if latest > last_block:
                from_block = last_block + 1
                to_block = latest

                # AccessGranted events
                try:
                    logs = await contract.events.AccessGranted.get_logs(
                        from_block=from_block, to_block=to_block
                    )
                    for log in logs:
                        await handle_access_granted(
                            log.args.patient, log.args.doctor
                        )
                except Exception as e:
                    print(f"[event_listener] Error fetching AccessGranted: {e}")

                # AccessRevoked events
                try:
                    logs = await contract.events.AccessRevoked.get_logs(
                        from_block=from_block, to_block=to_block
                    )
                    for log in logs:
                        await handle_access_revoked(
                            log.args.patient, log.args.doctor
                        )
                except Exception as e:
                    print(f"[event_listener] Error fetching AccessRevoked: {e}")

                # KeyShared events
                try:
                    logs = await contract.events.KeyShared.get_logs(
                        from_block=from_block, to_block=to_block
                    )
                    for log in logs:
                        await handle_key_shared(
                            log.args.patient, log.args.recordId, log.args.doctor
                        )
                except Exception as e:
                    print(f"[event_listener] Error fetching KeyShared: {e}")

                last_block = latest
                app_state["last_block"] = last_block

        except Exception as e:
            print(f"[event_listener] Polling error: {e}")

        await asyncio.sleep(2)
