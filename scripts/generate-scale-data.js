import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data/us-arrearage');
const factor = Math.max(1, Number(process.argv[2] || 100));

const customerPath = path.join(dataDir, 'customers.json');
const accountPath = path.join(dataDir, 'accounts.json');
const customerDoc = JSON.parse(await readFile(customerPath, 'utf8'));
const accountDoc = JSON.parse(await readFile(accountPath, 'utf8'));

// The first records are the authored demo fixtures. Keeping these as the seed
// makes regeneration idempotent even after the JSON exports have been expanded.
const seedCustomers = customerDoc.customers.slice(0, 3);
const seedInvoices = accountDoc.invoices.slice(0, 3);
const seedPayments = accountDoc.payments.slice(0, 3);
const seedNotes = accountDoc.contactNotes.slice(0, 3);

if (seedCustomers.length !== 3 || seedInvoices.length !== 3 || seedPayments.length !== 3 || seedNotes.length !== 3) {
  throw new Error('Expected the original 3-customer, 9-account-record demo seed.');
}

const firstNames = [
  'Avery', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Cameron', 'Quinn',
  'Parker', 'Reese', 'Drew', 'Skyler', 'Emerson', 'Hayden', 'Rowan', 'Sage'
];
const lastNames = [
  'Adams', 'Bennett', 'Chen', 'Diaz', 'Ellis', 'Foster', 'Garcia', 'Howard',
  'Ibrahim', 'Johnson', 'Kim', 'Lopez', 'Mitchell', 'Nguyen', 'Owens', 'Patel',
  'Robinson', 'Singh', 'Turner', 'Williams'
];
const locations = [
  { state: 'CA', city: 'Fresno', county: 'Fresno' },
  { state: 'TX', city: 'San Antonio', county: 'Bexar' },
  { state: 'IL', city: 'Springfield', county: 'Sangamon' },
  { state: 'NY', city: 'Buffalo', county: 'Erie' },
  { state: 'CA', city: 'Sacramento', county: 'Sacramento' },
  { state: 'TX', city: 'Dallas', county: 'Dallas' },
  { state: 'IL', city: 'Peoria', county: 'Peoria' },
  { state: 'NY', city: 'Rochester', county: 'Monroe' }
];

const customers = [...seedCustomers];
const invoices = [...seedInvoices];
const payments = [...seedPayments];
const contactNotes = [...seedNotes];

const generatedBySeed = new Map();

for (let batch = 1; batch < factor; batch += 1) {
  for (let seedIndex = 0; seedIndex < seedCustomers.length; seedIndex += 1) {
    const seed = seedCustomers[seedIndex];
    const sequence = batch * seedCustomers.length + seedIndex;
    const location = locations[sequence % locations.length];
    const name = `${firstNames[sequence % firstNames.length]} ${lastNames[(sequence * 7) % lastNames.length]}`;
    const id = `CUS-SYN-${String(sequence).padStart(5, '0')}`;
    const caseId = `C-SYN-${String(sequence).padStart(5, '0')}`;
    const householdSize = 1 + (sequence % 6);
    const annualIncome = 18500 + ((sequence * 1379) % 71500);
    const arrears = Number((185 + ((sequence * 83.17) % 4325)).toFixed(2));
    const customer = {
      ...seed,
      id,
      caseId,
      name,
      state: location.state,
      city: location.city,
      county: location.county,
      accountOpened: `${2017 + (sequence % 8)}-${String(1 + (sequence % 12)).padStart(2, '0')}-${String(1 + (sequence % 27)).padStart(2, '0')}`,
      preferredContact: ['email', 'mobile after 4pm', 'text message', 'any time'][sequence % 4],
      declaredHouseholdSize: householdSize,
      declaredAnnualIncome: annualIncome,
      declaredIncomeAsOf: `${2022 + (sequence % 4)}-01-15`,
      declaredIncomeNote: 'Synthetic ERP profile generated for context-graph scale testing.',
      incomeSource: ['employment', 'fixed_income', 'seasonal_work'][sequence % 3],
      arrears,
      hasDisconnectionNotice: sequence % 3 === 0,
      disconnectionNoticeDate: sequence % 3 === 0 ? '2026-07-18' : undefined,
      medicalCertificationOnFile: sequence % 17 === 0,
      enrolledPrograms: [],
      demoRole: 'synthetic_scale_record',
      text: `${name} is a synthetic ${location.state} residential electricity customer with ${arrears.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in arrears.`
    };
    if (!customer.disconnectionNoticeDate) delete customer.disconnectionNoticeDate;
    customers.push(customer);
    generatedBySeed.set(`${batch}:${seed.id}`, customer);
  }

  for (const [recordIndex, seed] of seedInvoices.entries()) {
    const customer = generatedBySeed.get(`${batch}:${seed.customerId}`);
    invoices.push({
      ...seed,
      id: `INV-SYN-${String(batch * seedInvoices.length + recordIndex).padStart(5, '0')}`,
      customerId: customer.id,
      outstandingBalance: customer.arrears,
      unpaidInvoices: 1 + ((batch + recordIndex) % 7),
      debtIncrease90Days: Number((0.08 + ((batch * 11 + recordIndex) % 75) / 100).toFixed(2)),
      text: `${1 + ((batch + recordIndex) % 7)} invoices remain unpaid totalling ${customer.arrears.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`
    });
  }

  for (const [recordIndex, seed] of seedPayments.entries()) {
    const customer = generatedBySeed.get(`${batch}:${seed.customerId}`);
    const failed = (batch + recordIndex) % 5;
    const extensions = (batch * 2 + recordIndex) % 4;
    payments.push({
      ...seed,
      id: `PAY-SYN-${String(batch * seedPayments.length + recordIndex).padStart(5, '0')}`,
      customerId: customer.id,
      failedAutoPayments: failed,
      extensionRequests: extensions,
      lastSuccessfulAmount: Number((55 + ((batch * 13 + recordIndex) % 190)).toFixed(2)),
      text: `${failed} automatic payments failed. ${extensions} payment extensions were requested.`
    });
  }

  for (const [recordIndex, seed] of seedNotes.entries()) {
    const customer = generatedBySeed.get(`${batch}:${seed.customerId}`);
    contactNotes.push({
      ...seed,
      id: `CC-SYN-${String(batch * seedNotes.length + recordIndex).padStart(5, '0')}`,
      customerId: customer.id,
      date: `2026-${String(1 + ((batch + recordIndex) % 7)).padStart(2, '0')}-${String(1 + ((batch * 3 + recordIndex) % 27)).padStart(2, '0')}`,
      text: recordIndex % 2 === 0
        ? 'Customer asked about payment assistance after a change in household income. No program was enrolled during the contact.'
        : 'Customer requested a payment extension and reported difficulty keeping the account current.',
      signals: recordIndex % 2 === 0
        ? ['assistance_enquiry_unresolved', 'reduced_income_disclosure']
        : ['extension_request']
    });
  }
}

const scale = {
  factor,
  seedRows: seedCustomers.length + seedInvoices.length + seedPayments.length + seedNotes.length,
  totalRows: customers.length + invoices.length + payments.length + contactNotes.length,
  note: 'Deterministic synthetic scale data for discovery-agent and context-graph demos.'
};

await Promise.all([
  writeFile(customerPath, `${JSON.stringify({
    ...customerDoc,
    _scale: scale,
    customers
  }, null, 2)}\n`, 'utf8'),
  writeFile(accountPath, `${JSON.stringify({
    ...accountDoc,
    _scale: scale,
    invoices,
    payments,
    contactNotes
  }, null, 2)}\n`, 'utf8')
]);

console.log(`Generated ${scale.totalRows} operational rows (${factor}x the ${scale.seedRows}-row seed).`);
console.log(`Customers ${customers.length}, invoices ${invoices.length}, payments ${payments.length}, contact notes ${contactNotes.length}.`);
