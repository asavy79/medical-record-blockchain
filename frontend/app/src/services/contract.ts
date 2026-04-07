/**
 * Typed wrappers around the MedicalAccessRegistry smart contract.
 */

import { ethers, type ContractTransactionReceipt } from 'ethers';
import MedicalAccessRegistryABI from '../abi/MedicalAccessRegistry.json';

// Populated from env or after deployment
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

export function getContract(signer: ethers.Signer): ethers.Contract {
  if (!CONTRACT_ADDRESS) throw new Error('VITE_CONTRACT_ADDRESS not set');
  return new ethers.Contract(CONTRACT_ADDRESS, MedicalAccessRegistryABI, signer);
}

export async function grantAccess(
  signer: ethers.Signer,
  doctorAddress: string,
): Promise<ContractTransactionReceipt | null> {
  const contract = getContract(signer);
  const tx = await contract.grantAccess(doctorAddress);
  return tx.wait();
}

export async function revokeAccess(
  signer: ethers.Signer,
  doctorAddress: string,
): Promise<ContractTransactionReceipt | null> {
  const contract = getContract(signer);
  const tx = await contract.revokeAccess(doctorAddress);
  return tx.wait();
}

export async function shareKeyWithDoctor(
  signer: ethers.Signer,
  patientAddress: string,
  recordId: bigint,
  doctorAddress: string,
  encryptedKey: string,
): Promise<ContractTransactionReceipt | null> {
  const contract = getContract(signer);
  const tx = await contract.shareKeyWithDoctor(patientAddress, recordId, doctorAddress, encryptedKey);
  return tx.wait();
}

export async function getDoctorKey(
  signer: ethers.Signer,
  patientAddress: string,
  recordId: bigint,
): Promise<string> {
  const contract = getContract(signer);
  return contract.getDoctorKey(patientAddress, recordId);
}

export async function checkAccess(
  signer: ethers.Signer,
  patientAddress: string,
  doctorAddress: string,
): Promise<boolean> {
  const contract = getContract(signer);
  return contract.checkAccess(patientAddress, doctorAddress);
}
