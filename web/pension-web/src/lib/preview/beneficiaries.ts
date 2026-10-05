export type PreviewPaymentStatus = "Paid" | "Pending" | "Failed";

export interface PreviewPayment {
  id: string;
  month: string;
  date: string;
  amount: string;
  status: PreviewPaymentStatus;
  reference: string;
}

export interface PreviewBeneficiary {
  id: string;
  name: string;
  gender: "Male" | "Female" | "Transgender";
  age: number;
  category: string;
  district: string;
  centre: string;
  registrationDate: string;
  address: string;
  mobile: string;
  aadhaar: string;
  janAadhaar: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  status: "Active" | "Pending" | "Inactive";
  payments: PreviewPayment[];
}

export const PREVIEW_BENEFICIARIES: PreviewBeneficiary[] = [
  {
    id: "PLHIV-00001",
    name: "Asha Demo",
    gender: "Female",
    age: 34,
    category: "GENERAL",
    district: "Jaipur",
    centre: "Jaipur ART Centre",
    registrationDate: "12 Aug 2026",
    address: "Demo District, Rajasthan",
    mobile: "DEMO-MOBILE-0001",
    aadhaar: "DEMO-AADHAAR-0001",
    janAadhaar: "DEMO-JAN-0001",
    bankName: "Demo Bank",
    accountNumber: "DEMO-ACCOUNT-0001",
    ifsc: "DEMO-IFSC-0001",
    status: "Active",
    payments: [
      {
        id: "DEMO-PAY-001",
        month: "September 2026",
        date: "30 Sep 2026",
        amount: "₹1,000",
        status: "Paid",
        reference: "DEMO-TXN-SEP-001",
      },
      {
        id: "DEMO-PAY-002",
        month: "August 2026",
        date: "31 Aug 2026",
        amount: "₹1,000",
        status: "Paid",
        reference: "DEMO-TXN-AUG-001",
      },
      {
        id: "DEMO-PAY-003",
        month: "July 2026",
        date: "31 Jul 2026",
        amount: "₹1,000",
        status: "Pending",
        reference: "Not available",
      },
    ],
  },
  {
    id: "PLHIV-00002",
    name: "Bimal Demo",
    gender: "Male",
    age: 41,
    category: "GENERAL",
    district: "Ajmer",
    centre: "Ajmer ART Centre",
    registrationDate: "10 Aug 2026",
    address: "Demo District, Rajasthan",
    mobile: "DEMO-MOBILE-0002",
    aadhaar: "DEMO-AADHAAR-0002",
    janAadhaar: "DEMO-JAN-0002",
    bankName: "Demo Bank",
    accountNumber: "DEMO-ACCOUNT-0002",
    ifsc: "DEMO-IFSC-0002",
    status: "Active",
    payments: [],
  },
  {
    id: "PLHIV-00003",
    name: "Chanda Demo",
    gender: "Female",
    age: 29,
    category: "GENERAL",
    district: "Kota",
    centre: "Kota ART Centre",
    registrationDate: "08 Aug 2026",
    address: "Demo District, Rajasthan",
    mobile: "DEMO-MOBILE-0003",
    aadhaar: "DEMO-AADHAAR-0003",
    janAadhaar: "DEMO-JAN-0003",
    bankName: "Demo Bank",
    accountNumber: "DEMO-ACCOUNT-0003",
    ifsc: "DEMO-IFSC-0003",
    status: "Pending",
    payments: [],
  },
  {
    id: "PLHIV-00004",
    name: "Deepak Demo",
    gender: "Male",
    age: 38,
    category: "GENERAL",
    district: "Jodhpur",
    centre: "Jodhpur ART Centre",
    registrationDate: "06 Aug 2026",
    address: "Demo District, Rajasthan",
    mobile: "DEMO-MOBILE-0004",
    aadhaar: "DEMO-AADHAAR-0004",
    janAadhaar: "DEMO-JAN-0004",
    bankName: "Demo Bank",
    accountNumber: "DEMO-ACCOUNT-0004",
    ifsc: "DEMO-IFSC-0004",
    status: "Active",
    payments: [],
  },
  {
    id: "PLHIV-00005",
    name: "Esha Demo",
    gender: "Female",
    age: 45,
    category: "GENERAL",
    district: "Udaipur",
    centre: "Udaipur ART Centre",
    registrationDate: "04 Aug 2026",
    address: "Demo District, Rajasthan",
    mobile: "DEMO-MOBILE-0005",
    aadhaar: "DEMO-AADHAAR-0005",
    janAadhaar: "DEMO-JAN-0005",
    bankName: "Demo Bank",
    accountNumber: "DEMO-ACCOUNT-0005",
    ifsc: "DEMO-IFSC-0005",
    status: "Inactive",
    payments: [],
  },
  {
    id: "PLHIV-00006",
    name: "Farhan Demo",
    gender: "Male",
    age: 32,
    category: "GENERAL",
    district: "Jaipur",
    centre: "Jaipur ART Centre",
    registrationDate: "02 Aug 2026",
    address: "Demo District, Rajasthan",
    mobile: "DEMO-MOBILE-0006",
    aadhaar: "DEMO-AADHAAR-0006",
    janAadhaar: "DEMO-JAN-0006",
    bankName: "Demo Bank",
    accountNumber: "DEMO-ACCOUNT-0006",
    ifsc: "DEMO-IFSC-0006",
    status: "Active",
    payments: [],
  },
];

let beneficiaries = PREVIEW_BENEFICIARIES;
const listeners = new Set<() => void>();

export function getPreviewBeneficiaries(): PreviewBeneficiary[] {
  return beneficiaries;
}

export function subscribeToPreviewBeneficiaries(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function savePreviewBeneficiary(updated: PreviewBeneficiary): void {
  beneficiaries = beneficiaries.map((beneficiary) =>
    beneficiary.id === updated.id ? { ...updated } : beneficiary,
  );
  listeners.forEach((listener) => listener());
}
