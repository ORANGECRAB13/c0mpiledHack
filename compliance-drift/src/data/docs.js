// Management-system document library for an AU energy retailer
// ("Aurora Retail Energy") — credit & collections / hardship / compliance
// corpus read by the context engine. Discipline icons: shield=compliance,
// layers=quality, doc=customer comms, zap=operations.

export const DOC_TABS = [
  { id: 'Policies', n: 10, desc: 'Approved company policy documents that define commitments and rules.' },
  { id: 'Plans', n: 1, desc: 'Management plans that set out how obligations are met over time.' },
  { id: 'Procedures', n: 6, desc: 'Step-by-step controlled documents for regulated activities.' },
  { id: 'Processes', n: 3, desc: 'End-to-end operational processes across teams and systems.' },
  { id: 'Work Instructions', n: 3, desc: 'Task-level instructions for frontline agents and field ops.' },
  { id: 'Forms', n: 91, desc: 'Customer and internal forms — the fields the engine reads and files.' },
  { id: 'Registers', n: 22, desc: 'Live registers the engine keeps current from documents and events.' },
  { id: 'Records', n: 7, desc: 'Point-in-time evidence: reports, audits, attestations.' },
];

export const DOCS = {
  Policies: [
    ['01. Customer Hardship Policy Rev 4.docx', ['shield', 'doc'], 'M. Okafor', '21 July 2026'],
    ['02. Credit and Collections Policy Rev 6.docx', ['shield'], null, '14 July 2026'],
    ['03. Payment Difficulty and Assistance Policy (VIC) Rev 3.docx', ['shield', 'doc'], 'J. Tran', '6 July 2026'],
    ['04. Disconnection and Reconnection Policy Rev 5.docx', ['shield', 'zap'], null, '6 July 2026'],
    ['05. Life Support Customer Policy Rev 4.docx', ['shield', 'zap'], null, '30 June 2026'],
    ['06. Family and Domestic Violence Policy Rev 2.docx', ['shield', 'doc'], 'M. Okafor', '30 June 2026'],
    ['07. Privacy and Credit Reporting Policy Rev 3.docx', ['shield'], null, '24 June 2026'],
    ['08. Complaints and Dispute Resolution Policy Rev 4.docx', ['doc'], null, '18 June 2026'],
    ['09. Marketing and Explicit Informed Consent Policy Rev 2.docx', ['layers'], null, '12 June 2026'],
    ['10. Concessions and Rebates Policy Rev 3.docx', ['shield', 'doc'], 'J. Tran', '2 June 2026'],
  ],
  Plans: [
    ['Regulatory Compliance Management Plan 2026 Rev 1.docx', ['shield', 'layers'], 'M. Okafor', '1 July 2026'],
  ],
  Procedures: [
    ['PR-01. Hardship Program Entry and Exit Procedure Rev 5.docx', ['shield', 'doc'], null, '19 July 2026'],
    ['PR-02. Disconnection Warning Notice Procedure Rev 7.docx', ['shield', 'zap'], 'J. Tran', '12 July 2026'],
    ['PR-03. Life Support Registration and Deregistration Procedure Rev 4.docx', ['shield', 'zap'], null, '5 July 2026'],
    ['PR-04. Concession Verification Procedure Rev 3.docx', ['shield'], null, '28 June 2026'],
    ['PR-05. Debt Collection and Agency Referral Procedure Rev 6.docx', ['shield'], null, '21 June 2026'],
    ['PR-06. Wrongful Disconnection Investigation Procedure Rev 2.docx', ['shield', 'layers'], 'M. Okafor', '14 June 2026'],
  ],
  Processes: [
    ['PZ-01. Payment Plan Establishment Process Rev 4.docx', ['zap', 'doc'], null, '17 July 2026'],
    ['PZ-02. Billing Exception and Re-bill Process Rev 3.docx', ['zap'], null, '9 July 2026'],
    ['PZ-03. Customer Transfer-In Credit Check Process Rev 2.docx', ['zap', 'shield'], null, '1 July 2026'],
  ],
  'Work Instructions': [
    ['WI-4. Credit and Collections Work Instruction v11.docx', ['shield', 'zap'], 'J. Tran', '25 May 2026', 'stale'],
    ['WI-7. DNSP De-energisation Request Work Instruction v6.docx', ['zap'], null, '11 July 2026'],
    ['WI-9. Centrepay and Direct Debit Setup Work Instruction v4.docx', ['doc'], null, '3 July 2026'],
  ],
  Forms: [
    ['F-012. Hardship Program Application Form Rev 5.docx', ['doc'], null, '20 July 2026'],
    ['F-018. Payment Plan Agreement Form Rev 6.docx', ['doc'], null, '18 July 2026'],
    ['F-022. Life Support Medical Confirmation Form Rev 4.docx', ['shield', 'doc'], null, '15 July 2026'],
    ['F-031. Family Violence Safe Contact Preference Form Rev 2.docx', ['shield', 'doc'], 'M. Okafor', '10 July 2026'],
    ['F-044. Concession Card Verification Form Rev 3.docx', ['doc'], null, '6 July 2026'],
    ['F-051. Explicit Informed Consent Record Form Rev 2.docx', ['layers'], null, '30 June 2026'],
    ['F-063. Reconnection Request Form Rev 3.docx', ['zap', 'doc'], null, '24 June 2026'],
    ['F-070. Complaint Lodgement Form Rev 4.docx', ['doc'], null, '18 June 2026'],
  ],
  Registers: [
    ['R-01. Obligation Register (NSW-VIC-QLD credit & collections).xlsx', ['shield', 'layers'], 'M. Okafor', '4 August 2026'],
    ['R-04. Life Support Customer Register.xlsx', ['shield', 'zap'], null, '4 August 2026'],
    ['R-07. Hardship Program Register.xlsx', ['shield', 'doc'], null, '3 August 2026'],
    ['R-09. Disconnection and Reconnection Register.xlsx', ['zap'], null, '3 August 2026'],
    ['R-12. Complaints and EWOV/EWON Referral Register.xlsx', ['doc'], null, '2 August 2026'],
    ['R-15. Wrongful Disconnection Payment Register.xlsx', ['shield'], 'J. Tran', '1 August 2026'],
    ['R-22. Breach and Incident Register.xlsx', ['shield', 'layers'], null, '1 August 2026', 'stale'],
    ['R-24. Explicit Informed Consent Register.xlsx', ['layers'], null, '29 July 2026'],
  ],
  Records: [
    ['AER Retail Performance Report — Q4 FY26 submission.pdf', ['shield'], 'M. Okafor', '28 July 2026'],
    ['ESC Payment Difficulty Framework Audit 2025 — final report.pdf', ['shield', 'layers'], null, '15 July 2026'],
    ['Board Compliance Attestation FY26.pdf', ['shield'], null, '8 July 2026'],
    ['AER Customer Hardship Policy approval letter (v4).pdf', ['shield', 'doc'], null, '21 June 2026'],
    ['Life Support Register reconciliation with DNSPs — June 2026.pdf', ['zap'], null, '14 June 2026'],
    ['Agent training completion record — Credit module 6.pdf', ['doc'], null, '2 June 2026'],
    ['Internal audit — collections call sampling May 2026.pdf', ['layers'], null, '26 May 2026'],
  ],
};

// footer notes for the big collections shown as subsets
export const DOC_OVERFLOW = {
  Forms: '+ 83 more forms · auto-filed by the engine as customers and agents submit them',
  Registers: '+ 14 more registers · kept current from documents, events and the obligation register',
};
