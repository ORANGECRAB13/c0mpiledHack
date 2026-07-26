const pick = (items, index) => items[index % items.length];
const money = (value) => Math.round(value * 100) / 100;
const isoDate = (daysAgo = 0) => {
  const date = new Date('2026-07-25T12:00:00-07:00');
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
};

const field = (name, label, type = 'text', extra = {}) => ({ name, label, type, ...extra });

export const entities = [
  { name: 'customers', label: 'Customers', module: 'Customer Operations', fields: [
    field('account_no', 'Account #', 'text', { searchable: true }), field('name', 'Customer Name', 'text', { searchable: true }),
    field('customer_class', 'Class'), field('email', 'Email'), field('phone', 'Phone'), field('service_address', 'Service Address', 'text', { searchable: true }),
    field('city', 'City'), field('zip', 'ZIP'), field('care_status', 'CARE Status'), field('autopay', 'AutoPay', 'boolean'), field('active', 'Active', 'boolean')
  ]},
  { name: 'service_accounts', label: 'Service Accounts', module: 'Customer Operations', fields: [
    field('service_id', 'Service ID', 'text', { searchable: true }), field('customer_name', 'Customer', 'text', { searchable: true }),
    field('premise', 'Premise'), field('rate_plan', 'Rate Plan'), field('meter_no', 'Meter'), field('status', 'Status'), field('annual_kwh', 'Annual kWh', 'number')
  ]},
  { name: 'meters', label: 'Smart Meters', module: 'Grid & Assets', fields: [
    field('meter_no', 'Meter #', 'text', { searchable: true }), field('service_id', 'Service ID', 'text', { searchable: true }),
    field('model', 'Model'), field('install_date', 'Installed', 'date'), field('last_read_kwh', 'Last Read kWh', 'number'),
    field('ami_status', 'AMI Status'), field('firmware', 'Firmware'), field('active', 'Active', 'boolean')
  ]},
  { name: 'rate_plans', label: 'Rate Plans', module: 'Customer Operations', fields: [
    field('code', 'Rate Code', 'text', { searchable: true }), field('name', 'Plan Name', 'text', { searchable: true }),
    field('segment', 'Segment'), field('energy_rate', '$ / kWh', 'money'), field('monthly_charge', 'Monthly Charge', 'money'), field('tou', 'Time-of-Use', 'boolean'), field('active', 'Active', 'boolean')
  ]},
  { name: 'substations', label: 'Substations', module: 'Grid & Assets', fields: [
    field('code', 'Station ID', 'text', { searchable: true }), field('name', 'Substation', 'text', { searchable: true }),
    field('county', 'County'), field('capacity_mva', 'Capacity MVA', 'number'), field('peak_load_mw', 'Peak Load MW', 'number'), field('health_index', 'Health Index', 'number'), field('status', 'Status')
  ]},
  { name: 'transformers', label: 'Transformers', module: 'Grid & Assets', fields: [
    field('asset_no', 'Asset #', 'text', { searchable: true }), field('substation', 'Substation'), field('manufacturer', 'Manufacturer'),
    field('rating_kva', 'Rating kVA', 'number'), field('install_year', 'Install Year', 'number'), field('load_pct', 'Load %', 'number'), field('condition', 'Condition')
  ]},
  { name: 'crews', label: 'Field Crews', module: 'Field Service', fields: [
    field('crew_code', 'Crew', 'text', { searchable: true }), field('supervisor', 'Supervisor', 'text', { searchable: true }),
    field('service_center', 'Service Center'), field('specialty', 'Specialty'), field('members', 'Members', 'number'), field('availability', 'Availability')
  ]},
  { name: 'suppliers', label: 'Vendors', module: 'Procurement', fields: [
    field('code', 'Vendor ID', 'text', { searchable: true }), field('name', 'Vendor', 'text', { searchable: true }),
    field('category', 'Category'), field('contact_person', 'Contact'), field('email', 'Email'), field('phone', 'Phone'), field('safety_rating', 'Safety Rating'), field('active', 'Active', 'boolean')
  ]},
  { name: 'products', label: 'Materials & Equipment', module: 'Inventory', fields: [
    field('sku', 'Stock Code', 'text', { searchable: true }), field('name', 'Description', 'text', { searchable: true }),
    field('category', 'Category'), field('uom', 'UOM'), field('unit_price', 'Unit Cost', 'money'), field('on_hand', 'On Hand', 'number'), field('reorder_point', 'Reorder Point', 'number'), field('warehouse', 'Warehouse')
  ]},
  { name: 'warehouses', label: 'Service Warehouses', module: 'Inventory', fields: [
    field('code', 'Warehouse', 'text', { searchable: true }), field('name', 'Name', 'text', { searchable: true }), field('region', 'Region'),
    field('manager', 'Manager'), field('inventory_value', 'Inventory Value', 'money'), field('fill_rate', 'Fill Rate %', 'number'), field('active', 'Active', 'boolean')
  ]},
  { name: 'employees', label: 'Employees', module: 'Workforce', fields: [
    field('employee_no', 'Employee #', 'text', { searchable: true }), field('name', 'Employee', 'text', { searchable: true }),
    field('department', 'Department'), field('title', 'Title'), field('location', 'Location'), field('hire_date', 'Hire Date', 'date'), field('status', 'Status')
  ]},
  { name: 'chart_of_accounts', label: 'Chart of Accounts', module: 'Accounting', fields: [
    field('code', 'Account', 'text', { searchable: true }), field('name', 'Account Name', 'text', { searchable: true }),
    field('type', 'Type'), field('subtype', 'Sub-type'), field('normal_balance', 'Normal Balance'), field('balance', 'Balance', 'money'), field('active', 'Active', 'boolean')
  ]},
  { name: 'accounting_periods', label: 'Accounting Periods', module: 'Accounting', fields: [
    field('name', 'Period', 'text', { searchable: true }), field('start_date', 'Start Date', 'date'), field('end_date', 'End Date', 'date'), field('status', 'Status')
  ]},
  { name: 'branches', label: 'Operating Divisions', module: 'System', fields: [
    field('code', 'Division', 'text', { searchable: true }), field('name', 'Name', 'text', { searchable: true }), field('address', 'Headquarters'), field('active', 'Active', 'boolean')
  ]}
];

export const docTypes = [
  { name: 'utility_bill', label: 'Utility Bills', module: 'Billing & Revenue', partyType: 'customer', hasLines: true },
  { name: 'payment', label: 'Customer Payments', module: 'Billing & Revenue', partyType: 'customer', hasLines: true },
  { name: 'credit_adjustment', label: 'Billing Adjustments', module: 'Billing & Revenue', partyType: 'customer', hasLines: true },
  { name: 'work_order', label: 'Work Orders', module: 'Field Service', partyType: 'customer', hasLines: true },
  { name: 'outage_event', label: 'Outage Events', module: 'Grid Operations', partyType: 'none', hasLines: true },
  { name: 'purchase_order', label: 'Purchase Orders', module: 'Procurement', partyType: 'supplier', hasLines: true },
  { name: 'expense', label: 'Operating Expenses', module: 'Accounting', partyType: 'supplier', hasLines: true },
  { name: 'capital_project', label: 'Capital Projects', module: 'Grid & Assets', partyType: 'supplier', hasLines: true }
];

const firstNames = ['Olivia','Liam','Emma','Noah','Ava','Mateo','Sophia','Ethan','Isabella','Lucas','Mia','James','Amelia','Benjamin','Harper','Elijah','Camila','Daniel','Luna','Henry'];
const lastNames = ['Garcia','Chen','Johnson','Patel','Williams','Nguyen','Martinez','Kim','Brown','Davis','Wilson','Anderson','Thomas','Moore','Jackson','White','Harris','Clark','Lewis','Robinson'];
const cities = ['San Francisco','Oakland','San Jose','Sacramento','Fresno','Santa Rosa','Stockton','Chico','Bakersfield','Monterey','Redding','Concord'];
const streets = ['Market St','Broadway','Mission St','Oak Ave','Pine St','Valley Rd','Sunset Blvd','River Way','Maple Dr','Cedar Ln'];

const customers = Array.from({ length: 2400 }, (_, i) => {
  const first = pick(firstNames, i * 7);
  const last = pick(lastNames, i * 11 + 3);
  const business = i % 11 === 0;
  const name = business ? `${last} ${pick(['Foods','Manufacturing','Dental Group','Market','Properties','Logistics'], i)} LLC` : `${first} ${last}`;
  return {
    id: i + 1, account_no: `10${String(438200 + i).padStart(8, '0')}`, name,
    customer_class: business ? 'Small Business' : i % 19 === 0 ? 'Agricultural' : 'Residential',
    email: `${first}.${last}${i % 97}@example.com`.toLowerCase(), phone: `(415) 55${i % 10}-${String(1000 + (i * 37) % 9000)}`,
    service_address: `${100 + (i * 17) % 9800} ${pick(streets, i * 3)}`, city: pick(cities, i * 5), zip: String(94000 + (i * 29) % 5900),
    care_status: i % 7 === 0 ? 'Enrolled' : 'Not enrolled', autopay: i % 3 !== 0, active: i % 101 !== 0
  };
});

const serviceAccounts = customers.slice(0, 2100).map((customer, i) => ({
  id: i + 1, service_id: `SA-${String(7000000 + i).padStart(8, '0')}`, customer_name: customer.name,
  premise: `${customer.service_address}, ${customer.city}`, rate_plan: pick(['E-TOU-C','E-TOU-D','EV2-A','E-1','B-6','AG-4A'], i),
  meter_no: `SMT${String(88000000 + i)}`, status: i % 173 === 0 ? 'Disconnected' : 'Active', annual_kwh: 3200 + (i * 179) % 18600
}));

const meters = serviceAccounts.map((account, i) => ({
  id: i + 1, meter_no: account.meter_no, service_id: account.service_id, model: pick(['Landis+Gyr FOCUS AXR-SD','Itron OpenWay Riva','Aclara I-210+c'], i),
  install_date: isoDate(200 + (i * 19) % 4100), last_read_kwh: 1400 + (i * 337) % 92000,
  ami_status: i % 127 === 0 ? 'Communication exception' : 'Online', firmware: `6.${2 + i % 5}.${i % 10}`, active: account.status === 'Active'
}));

const suppliers = ['Quanta Utility Engineering','Wesco Distribution','Schweitzer Engineering Labs','Eaton Grid Solutions','Hitachi Energy USA','Graybar Electric','MasTec Utility Services','Burns & McDonnell','S&C Electric Company','Valley Traffic Control','North Coast Vegetation Mgmt','California Transformer Co.'].map((name, i) => ({
  id: i + 1, code: `V-${String(1200 + i)}`, name, category: pick(['Electrical Equipment','Construction','Engineering','Safety','Vegetation Management'], i),
  contact_person: `${pick(firstNames, i + 2)} ${pick(lastNames, i + 5)}`, email: `orders${i + 1}@vendor-example.com`, phone: `(510) 555-${String(2100 + i * 83)}`,
  safety_rating: pick(['A','A','A-','B+'], i), active: true
}));

const materials = ['15kV Pad-Mount Transformer','Class 2 Wood Utility Pole','ACSR 336.4 Conductor','Smart Meter Residential','Polymer Cutout 15kV','500 kVA Network Transformer','Crossarm Fiberglass','Surge Arrester 10kV','Underground Cable 1/0 AL','LED Streetlight 75W','Hot Line Clamp','FR Coverall Arc Rated','Recloser Control Cabinet','Capacitor Bank 600 kVAR','Fiber Optic ADSS Cable'].map((name, i) => ({
  id: i + 1, sku: `MAT-${String(41000 + i)}`, name, category: pick(['Transformers','Poles','Conductor','Metering','Protection','Safety'], i),
  uom: pick(['EA','FT','RL','SET'], i), unit_price: money(42 + (i + 1) ** 3 * 18.75), on_hand: 18 + (i * 47) % 760,
  reorder_point: 20 + (i * 13) % 120, warehouse: pick(['Bay Area Central','Sacramento North','Central Valley','North Coast'], i)
}));

const branches = [
  ['BA','Bay Area Electric Operations','245 Market St, San Francisco, CA'],
  ['CV','Central Valley Operations','800 P St, Fresno, CA'],
  ['SV','Sacramento Valley Operations','400 Capitol Mall, Sacramento, CA'],
  ['NC','North Coast Operations','75 Mendocino Ave, Santa Rosa, CA']
].map(([code,name,address], i) => ({ id: i + 1, code, name, address, active: true }));

const substations = Array.from({ length: 36 }, (_, i) => ({
  id: i + 1, code: `SUB-${String(101 + i)}`, name: `${pick(['Mission','Delta','Coyote','Redwood','Sierra','Bayview','Arroyo','Summit'], i)} ${i + 1}`,
  county: pick(['Alameda','Contra Costa','Santa Clara','Sacramento','Sonoma','San Joaquin'], i), capacity_mva: 40 + (i % 6) * 20,
  peak_load_mw: 24 + (i * 7) % 82, health_index: 62 + (i * 11) % 38, status: i % 17 === 0 ? 'Maintenance' : 'In service'
}));

const transformers = Array.from({ length: 180 }, (_, i) => ({
  id: i + 1, asset_no: `TX-${String(500100 + i)}`, substation: substations[i % substations.length].name,
  manufacturer: pick(['Eaton','Hitachi Energy','Virginia Transformer','Prolec GE','Howard Industries'], i), rating_kva: pick([500,750,1000,1500,2500,5000], i),
  install_year: 1988 + (i * 7) % 38, load_pct: 42 + (i * 13) % 58, condition: i % 29 === 0 ? 'Priority replacement' : i % 11 === 0 ? 'Monitor' : 'Good'
}));

const ratePlans = [
  ['E-TOU-C','Residential Time-of-Use (4–9 p.m.)','Residential',0.395,15.00,true], ['E-TOU-D','Residential Time-of-Use (5–8 p.m.)','Residential',0.367,15.00,true],
  ['EV2-A','Home Charging EV','Residential EV',0.323,15.00,true], ['E-1','Residential Tiered','Residential',0.412,10.00,false],
  ['B-6','Small Commercial TOU','Commercial',0.344,42.50,true], ['AG-4A','Agricultural Power','Agricultural',0.289,65.00,true]
].map(([code,name,segment,energy_rate,monthly_charge,tou], i) => ({ id:i+1,code,name,segment,energy_rate,monthly_charge,tou,active:true }));

const coaNames = [
  ['1000','Cash and Cash Equivalents','Asset'],['1100','Customer Accounts Receivable','Asset'],['1210','Materials and Supplies','Asset'],
  ['1500','Electric Utility Plant in Service','Asset'],['1600','Construction Work in Progress','Asset'],['2000','Accounts Payable','Liability'],
  ['2210','Customer Deposits','Liability'],['3000','Retained Earnings','Equity'],['4000','Residential Electric Revenue','Revenue'],
  ['4010','Commercial Electric Revenue','Revenue'],['4100','Transmission Revenue','Revenue'],['5000','Purchased Power Expense','Expense'],
  ['5100','Distribution Operations','Expense'],['5200','Customer Service Expense','Expense'],['5300','Vegetation Management','Expense'],['5400','Depreciation Expense','Expense']
];
const chart = coaNames.map(([code,name,type], i) => ({ id:i+1,code,name,type,subtype:type,normal_balance:['Asset','Expense'].includes(type)?'debit':'credit',balance:money(1250000+(i*1389203)%78000000),active:true }));

const crews = Array.from({length:28},(_,i)=>({id:i+1,crew_code:`FC-${String(21+i)}`,supervisor:`${pick(firstNames,i+4)} ${pick(lastNames,i+8)}`,service_center:pick(cities,i),specialty:pick(['Electric Distribution','Gas Operations','Vegetation','Substation','Metering'],i),members:4+i%5,availability:i%9===0?'On call':i%4===0?'Dispatched':'Available'}));
const warehouses = ['Bay Area Central','Sacramento North','Central Valley','North Coast'].map((name,i)=>({id:i+1,code:`WH-${i+1}`,name,region:pick(['Bay Area','Sacramento','Central Valley','North Coast'],i),manager:`${pick(firstNames,i+10)} ${pick(lastNames,i+2)}`,inventory_value:4250000+i*1375000,fill_rate:94.2+i%4,active:true}));
const employees = Array.from({length:320},(_,i)=>({id:i+1,employee_no:`E${String(24000+i)}`,name:`${pick(firstNames,i*3)} ${pick(lastNames,i*7)}`,department:pick(['Electric Operations','Customer Care','Finance','Grid Engineering','IT','Safety & Compliance'],i),title:pick(['Analyst','Senior Specialist','Supervisor','Engineer','Coordinator','Manager'],i),location:pick(cities,i*3),hire_date:isoDate(365+(i*41)%6200),status:i%113===0?'Leave':'Active'}));

export const entityRows = {
  customers, service_accounts: serviceAccounts, meters, rate_plans: ratePlans, substations, transformers, crews, suppliers,
  products: materials, warehouses, employees, chart_of_accounts: chart, branches,
  accounting_periods: Array.from({length:18},(_,i)=>({id:i+1,name:new Date(2025,0+i).toLocaleDateString('en-US',{month:'long',year:'numeric'}),start_date:new Date(2025,i,1).toISOString(),end_date:new Date(2025,i+1,0).toISOString(),status:i<14?'closed':'open'}))
};

const docConfig = {
  utility_bill: { prefix:'BILL', count:1850, party:'customer', base:92, notes:'Monthly electric service — meter read verified' },
  payment: { prefix:'PMT', count:1620, party:'customer', base:86, notes:'Customer payment received' },
  credit_adjustment: { prefix:'ADJ', count:94, party:'customer', base:38, notes:'Usage and billing adjustment' },
  work_order: { prefix:'WO', count:460, party:'customer', base:640, notes:'Field service dispatch' },
  outage_event: { prefix:'OUT', count:86, party:'none', base:18500, notes:'Distribution interruption response' },
  purchase_order: { prefix:'PO', count:310, party:'supplier', base:12500, notes:'Grid materials replenishment' },
  expense: { prefix:'EXP', count:525, party:'supplier', base:3200, notes:'Operating expense' },
  capital_project: { prefix:'CAP', count:72, party:'supplier', base:850000, notes:'Grid hardening capital program' }
};

export const documents = Object.fromEntries(Object.entries(docConfig).map(([type,cfg]) => [type, Array.from({length:cfg.count},(_,i)=>{
  const party = cfg.party === 'customer' ? customers[i % customers.length] : cfg.party === 'supplier' ? suppliers[i % suppliers.length] : null;
  const total = money(cfg.base * (0.65 + ((i*37)%100)/100));
  const status = pick(['posted','posted','posted','submitted','draft','posted','voided'],i);
  const lineNames = type === 'utility_bill' ? ['Electric delivery charges','Generation charges','Public purpose programs','Taxes and fees'] :
    type === 'outage_event' ? ['Crew labor and overtime','Replacement equipment','Traffic control and restoration'] :
    type === 'work_order' ? ['Field crew labor','Service materials','Inspection and closeout'] :
    [materials[i%materials.length].name,materials[(i+3)%materials.length].name,'Freight / service charge'];
  const lines = lineNames.map((description,j)=>{const qty=j===0?1:1+(i+j)%4;const unit_price=money(total/[lineNames.length*qty]);return{id:i*10+j+1,description,product_id:materials[(i+j)%materials.length].id,qty,unit_price,line_total:money(qty*unit_price)}});
  return {id:i+1,doc_no:`${cfg.prefix}-${String(260000+i).padStart(6,'0')}`,doc_date:isoDate(i%365),party_id:party?.id,party_name:party?.name||'Grid Operations',branch_id:1+i%branches.length,branch_name:branches[i%branches.length].name,total,status,notes:cfg.notes,lines,tax_amount:0,attrs:{},anomalies:i%89===0?[{id:9000+i,severity:'warn',rule_code:'USAGE_VARIANCE',status:'open',message:'Usage differs by more than 35% from the weather-normalized baseline.',ai_review:{verdict:'review',explanation:'High usage may reflect recent heat conditions; verify interval data.'}}]:[]};
})]));

export const anomalies = [
  ['HIGH_USAGE_VARIANCE','warn','Customer usage is 48% above weather-normalized baseline for service SA-07000482.','service_account'],
  ['METER_COMM_GAP','critical','Smart meter SMT88000914 has not reported interval data for 36 hours.','meter'],
  ['TRANSFORMER_OVERLOAD','critical','Transformer TX-500129 reached 103% of nameplate rating during evening peak.','transformer'],
  ['DUPLICATE_PAYMENT','warn','Two customer payments with the same amount and reference were posted within 4 minutes.','payment'],
  ['VENDOR_PRICE_OUTLIER','warn','Unit price for 15kV pad-mount transformer is 22% above the trailing 90-day median.','purchase_order'],
  ['OUTAGE_DURATION','warn','Restoration duration exceeded the circuit target by 42 minutes.','outage_event'],
  ['GL_MAPPING','info','Vegetation management invoice was posted to general distribution operations.','expense'],
  ['CARE_ELIGIBILITY','info','Customer usage and household profile suggest potential CARE program eligibility.','customer']
].map(([rule_code,severity,message,entity_type],i)=>({id:i+1,rule_code,severity,message,entity_type,status:i>5?'resolved':'open',created_at:isoDate(i*3),ai_review:{verdict:severity==='critical'?'escalate':'review',explanation:'Synthetic AI review based on utility operating policy and recent account context.'},resolution_note:i>5?'Reviewed and disposition recorded.':null}));

export const journal = Array.from({length:120},(_,i)=>{const amount=money(2800+(i*9187)%280000);return{id:i+1,entry_no:`JE-${String(260700+i)}`,entry_date:isoDate(i*2),memo:pick(['Daily customer billing batch','Customer payment settlement','Purchased power accrual','Distribution maintenance expense','Capital project labor allocation'],i),total_debit:amount,total_credit:amount,status:'posted',lines:[{id:i*2+1,account_code:pick(chart,i).code,account_name:pick(chart,i).name,debit:amount,credit:0},{id:i*2+2,account_code:pick(chart,i+5).code,account_name:pick(chart,i+5).name,debit:0,credit:amount}]};});

export const auditRows = Array.from({length:100},(_,i)=>({id:i+1,at:isoDate(i/3),actor_name:pick(['Maya Patel','Carlos Rivera','System Billing Batch','Jordan Lee','AI Audit Agent'],i),action:pick(['CREATE','UPDATE','POST','APPROVE','RESOLVE'],i),entity_type:pick(['utility_bill','payment','work_order','customer','purchase_order','anomaly'],i),entity_id:1000+(i*73)%8000,reason:pick(['Monthly processing','Approved per operating policy','Customer-requested correction','Automated validation','Supervisor review'],i)}));

export const auditRun = {
  id: 12, started_at: isoDate(0), total_findings: 7, critical_findings: 2,
  checks: [
    {code:'UNBALANCED_JOURNAL',severity:'critical',title:'Unbalanced journal entries',count:0,sample:[]},
    {code:'METER_TO_BILL_GAPS',severity:'critical',title:'Bills missing validated meter reads',count:2,sample:[{bill:'BILL-260482',account:'10438682',gap_hours:36},{bill:'BILL-260917',account:'10439117',gap_hours:28}]},
    {code:'DUPLICATE_PAYMENTS',severity:'warn',title:'Potential duplicate payments',count:1,sample:[{payment:'PMT-260224',amount:'$184.27',minutes_apart:4}]},
    {code:'REVENUE_RECONCILIATION',severity:'critical',title:'Billing subledger to GL reconciliation',count:0,sample:[]},
    {code:'PO_PRICE_VARIANCE',severity:'warn',title:'Purchase order price variance',count:3,sample:[{po:'PO-260081',item:'Pad-Mount Transformer',variance:'22%'},{po:'PO-260177',item:'Recloser Control',variance:'16%'}]},
    {code:'CLOSED_PERIOD_CHANGES',severity:'critical',title:'Mutations in closed accounting periods',count:0,sample:[]},
    {code:'OUTAGE_COST_ALLOCATION',severity:'info',title:'Outage restoration costs awaiting allocation',count:1,sample:[{event:'OUT-260033',amount:'$18,420'}]}
  ],
  opinion:'## Auditor’s opinion\n\nThe synthetic utility ledger is **materially balanced** and revenue reconciles to the billing subledger. Two meter-to-bill exceptions require review before the next billing close.\n\n### Priority actions\n\n1. Validate interval reads for the two affected service accounts.\n2. Review the duplicate payment before issuing any refund.\n3. Obtain sourcing approval for three purchase-order price variances.\n\nNo unauthorized changes were detected in closed periods.'
};

export const legacySystems = {
  'Customer Information System': [
    {id:1,endpoint_path:'/Accounts/CustomerMaster',row_count:2400,strategy:'synthetic snapshot'},
    {id:2,endpoint_path:'/Billing/UsageHistory',row_count:18750,strategy:'synthetic snapshot'}
  ],
  'Grid Operations': [
    {id:3,endpoint_path:'/Assets/TransformerRegister',row_count:180,strategy:'synthetic snapshot'},
    {id:4,endpoint_path:'/OMS/OutageEvents',row_count:86,strategy:'synthetic snapshot'}
  ],
  'Advanced Metering': [{id:5,endpoint_path:'/AMI/IntervalReads',row_count:50400,strategy:'synthetic snapshot'}]
};

export function legacyDataset(id) {
  const dataset = Object.values(legacySystems).flat().find((item)=>item.id===Number(id));
  const rows = Array.from({length:Math.min(dataset?.row_count||0,200)},(_,i)=>({id:i+1,data:{record_id:`SYN-${id}-${String(i+1).padStart(6,'0')}`,service_area:pick(cities,i),reading_date:isoDate(i),value:money(12+(i*17)%900),quality:i%31===0?'estimated':'validated'}}));
  return {dataset:{...dataset,system_name:Object.entries(legacySystems).find(([,items])=>items.some(x=>x.id===Number(id)))?.[0]},columns:['record_id','service_area','reading_date','value','quality'],rows};
}
