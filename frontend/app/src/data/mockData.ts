export type Role = 'patient' | 'doctor';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  specialty?: string;
  dob?: string;
}

export interface MedRecord {
  id: string;
  patientId: string;
  title: string;
  type: string;
  date: string;
  size: string;
  content: string;
}

export interface SharedAccess {
  patientId: string;
  doctorId: string;
  recordIds: string[];
}

// A confirmed connection between a patient and doctor (accepted invite)
export interface Connection {
  patientId: string;
  doctorId: string;
}

export interface Invite {
  id: string;
  fromId: string;
  toId: string;
  status: 'pending' | 'accepted' | 'declined';
}

export const MOCK_PRIVATE_KEY = '0xabc123privatekey';

export const users: User[] = [
  { id: 'p1', username: 'john.doe',    password: 'patient123', name: 'John Doe',      role: 'patient', dob: 'March 12, 1985' },
  { id: 'p2', username: 'sarah.smith', password: 'patient456', name: 'Sarah Smith',   role: 'patient', dob: 'July 4, 1990'   },
  { id: 'd1', username: 'dr.patel',    password: 'doctor123',  name: 'Dr. Anita Patel',  role: 'doctor', specialty: 'Cardiology'        },
  { id: 'd2', username: 'dr.nguyen',   password: 'doctor456',  name: 'Dr. Kevin Nguyen', role: 'doctor', specialty: 'General Practice'   },
  { id: 'd3', username: 'dr.chen',     password: 'doctor789',  name: 'Dr. Lisa Chen',    role: 'doctor', specialty: 'Neurology'          },
];

export const records: MedRecord[] = [
  {
    id: 'r1', patientId: 'p1', title: 'Annual Blood Panel', type: 'Lab Report',
    date: 'Jan 15, 2025', size: '142 KB',
    content: 'Blood Type: O-\nHemoglobin: 14.2 g/dL\nWhite Blood Cells: 6.8 K/uL\nPlatelets: 220 K/uL\nAll values within normal range.',
  },
  {
    id: 'r2', patientId: 'p1', title: 'Chest X-Ray', type: 'Imaging',
    date: 'Feb 3, 2025', size: '3.1 MB',
    content: 'Findings: Lungs clear bilaterally. No infiltrates, effusions, or pneumothorax. Heart size normal. Impression: Normal chest X-ray.',
  },
  {
    id: 'r3', patientId: 'p1', title: 'Cardiology Consult', type: 'Consultation',
    date: 'Mar 10, 2025', size: '89 KB',
    content: 'Patient presents with occasional palpitations. EKG normal sinus rhythm. Echo scheduled for follow-up. Recommend lifestyle modifications.',
  },
  {
    id: 'r4', patientId: 'p2', title: 'Allergy Test Results', type: 'Lab Report',
    date: 'Dec 5, 2024', size: '210 KB',
    content: 'Positive reactivity: Dust mites (3+), Cat dander (2+), Pollen (1+). Negative: Peanuts, shellfish, penicillin. Recommend antihistamine as needed.',
  },
  {
    id: 'r5', patientId: 'p2', title: 'Annual Physical', type: 'Visit Summary',
    date: 'Jan 28, 2025', size: '67 KB',
    content: 'BP: 118/74. HR: 72 bpm. BMI: 22.4. All vitals normal. Vaccinations up to date. Next visit in 12 months.',
  },
  {
    id: 'r6', patientId: 'p2', title: 'MRI Brain Scan', type: 'Imaging',
    date: 'Feb 14, 2025', size: '8.4 MB',
    content: 'No acute intracranial abnormality. No mass, hemorrhage, or infarct identified. Ventricles and sulci normal for age.',
  },
];

// Who can see whom (accepted connections)
export const initialConnections: Connection[] = [
  { patientId: 'p1', doctorId: 'd1' },
  { patientId: 'p1', doctorId: 'd2' },
  { patientId: 'p2', doctorId: 'd1' },
  { patientId: 'p2', doctorId: 'd2' },
];

// Which specific records are shared per connection
export const initialSharedAccess: SharedAccess[] = [
  { patientId: 'p1', doctorId: 'd1', recordIds: ['r1', 'r3'] },
  { patientId: 'p1', doctorId: 'd2', recordIds: ['r2'] },
  { patientId: 'p2', doctorId: 'd1', recordIds: ['r6'] },
  { patientId: 'p2', doctorId: 'd2', recordIds: ['r4', 'r5'] },
];

// Pre-seeded pending invite so you can test accepting right away
export const initialInvites: Invite[] = [
  { id: 'inv1', fromId: 'd3', toId: 'p1', status: 'pending' },
];
