/* Resolution Center — browse the real channels for fighting a wrong
   bill, a wrong price, or a wrong charge. US-focused, general
   information (not legal advice). The ladder is always: ask the
   company first, in writing second, regulator third — regulators
   move fastest when steps 1-2 are documented. */

export type ResolveCat = 'bills' | 'prices' | 'charges' | 'home';
export interface Channel { name: string; detail: string }
export interface ActionLink { label: string; url: string }
export interface Place { label: string; query: string }
export interface Topic {
  id: string; cat: ResolveCat; icon: string; title: string; about: string;
  steps: string[]; script: string; gather: string[]; channels: Channel[];
  links: ActionLink[]; places: Place[];
}

/** Google Maps search URL — opens the Maps app, results ranked by
    distance from the phone, each with its own Navigate button. */
export function mapsUrl(query: string, near?: string): string {
  const q = near && near.trim() ? `${query} near ${near.trim()}` : query;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}
/** Web search for a company's official page (pay / support). */
export function officialSearchUrl(name: string, action: string): string {
  return 'https://www.google.com/search?q=' + encodeURIComponent(`${name} official ${action}`);
}

export const CATS: { v: ResolveCat; label: string }[] = [
  { v: 'bills', label: '📄 Bills' },
  { v: 'prices', label: '🧾 Prices' },
  { v: 'charges', label: '💳 Charges' },
  { v: 'home', label: '🏠 Home & services' },
];

export const TOPICS: Topic[] = [
  {
    id: 'utility-high', cat: 'bills', icon: '⚡', title: 'Utility bill too high or looks wrong',
    about: 'Electric, gas, or water jumped, or the reading looks estimated or wrong.',
    steps: [
      'Call the utility\'s billing department and ask for an itemized explanation + whether the reading was actual or ESTIMATED (it\'s printed on the bill).',
      'Ask for a meter re-read and a usage comparison against the same month last year — utilities must investigate billing complaints.',
      'Put the dispute in writing (email or their portal) so there\'s a dated record, and ask for a hold on the disputed amount while it\'s reviewed.',
      'No fix? File a complaint with your state Public Utilities Commission (PUC) — utilities answer regulators fast.',
    ],
    script: '"My bill jumped and the usage doesn\'t match my home. I need the reading verified — was it actual or estimated — and the disputed amount held while you investigate."',
    gather: ['This bill (saved in Bill Lens)', 'Your previous bills from the same company — patterns win disputes', 'A photo of your meter today, if you can get one'],
    channels: [
      { name: 'Utility billing department', detail: 'Number is on the bill itself — always the first call' },
      { name: 'State Public Utilities Commission', detail: 'Search "[your state] public utilities commission complaint" — free, and very effective' },
      { name: 'LIHEAP (if the bill is a hardship)', detail: 'Federal help with energy bills: energyassistance.us' },
    ],

    links: [
      { label: 'Find your state utility commission (regulator list)', url: 'https://www.naruc.org/about-naruc/regulatory-agencies/' },
      { label: 'Energy bill help — LIHEAP', url: 'https://energyassistance.us' },
      { label: 'Dial 2-1-1 for local help programs', url: 'https://www.211.org' },
    ],
    places: [
      { label: 'Utility payment centers', query: 'utility bill payment center' },
      { label: 'Utility company offices', query: 'electric utility company office' },
    ],  },
  {
    id: 'late-fee', cat: 'bills', icon: '⏰', title: 'Remove a late fee or penalty',
    about: 'A late fee, reconnect fee, or penalty you think is unfair — or a one-time slip on an otherwise clean record.',
    steps: [
      'Call and ask politely for a one-time courtesy removal — agents can usually waive one fee per year without a fight.',
      'If the lateness was their error (autopay glitch, bill never arrived), say so specifically and ask for the record of it.',
      'Declined? Ask for a supervisor, then follow up in writing through their portal or email.',
      'A pattern of unfair fees → complain to the regulator for that industry (see the channels).',
    ],
    script: '"I\'ve been a customer in good standing and this is my first late payment. I\'d like a one-time courtesy removal of the late fee — can you do that today?"',
    gather: ['The bill showing the fee (Bill Lens)', 'Your payment history — clean records are leverage', 'Any proof of their error (autopay confirmations, screenshots)'],
    channels: [
      { name: 'The biller\'s support line', detail: 'On the bill; ask for "retention" or a supervisor if the first agent can\'t waive' },
      { name: 'CFPB (financial products)', detail: 'consumerfinance.gov/complaint — for bank/credit/card fees' },
      { name: 'State utility commission / AG', detail: 'For utility and telecom fee patterns' },
    ],

    links: [
      { label: 'CFPB — complain about a financial company', url: 'https://www.consumerfinance.gov/complaint/' },
      { label: 'Find your state Attorney General', url: 'https://www.usa.gov/state-attorney-general' },
    ],
    places: [
      { label: 'Bank / credit union branches', query: 'bank branch' },
    ],  },
  {
    id: 'telecom-surprise', cat: 'bills', icon: '📱', title: 'Phone or internet bill surprise',
    about: 'A promo expired quietly, a fee appeared, or the price crept up mid-contract.',
    steps: [
      'Call the carrier and ask for every line that changed versus last month, by name.',
      'Ask for the promo to be re-applied or a loyalty/retention offer — retention departments have the real discounts.',
      'Get any credit confirmed with a reference number before you hang up.',
      'Still wrong? File an FCC informal complaint — carriers must respond to you within 30 days, and they take these seriously.',
    ],
    script: '"Walk me through every charge that changed since last month. If this is a promo expiring, I want the retention offers you can put on this line today."',
    gather: ['This bill + last month\'s (Bill Lens history shows the % jump)', 'Your promo/contract start details if you have them'],
    channels: [
      { name: 'Carrier retention department', detail: 'Say "cancel" or "retention" in the phone menu to reach them' },
      { name: 'FCC informal complaint', detail: 'consumercomplaints.fcc.gov — free; carriers must respond in 30 days' },
      { name: 'State Attorney General', detail: 'For deceptive pricing patterns' },
    ],

    links: [
      { label: 'FCC — file an informal complaint', url: 'https://consumercomplaints.fcc.gov' },
      { label: 'FTC — report fraud or bad practices', url: 'https://reportfraud.ftc.gov' },
    ],
    places: [
      { label: 'Carrier stores', query: 'cell phone carrier store' },
    ],  },
  {
    id: 'medical-bill', cat: 'bills', icon: '🏥', title: 'Medical bill error or surprise bill',
    about: 'Charged for something you didn\'t receive, double-billed, or hit with an out-of-network surprise.',
    steps: [
      'Request a fully ITEMIZED bill from the provider — errors (wrong codes, duplicate charges) are common and only visible itemized.',
      'Match it against your insurer\'s Explanation of Benefits (EOB). If they disagree, call the insurer first.',
      'Emergency or hospital out-of-network surprise? The federal No Surprises Act may protect you — say so explicitly.',
      'Unresolved → your state insurance department (for insurer issues) or state AG health care unit (for provider billing).',
    ],
    script: '"Please send me the fully itemized bill with CPT codes, and place my account on a billing hold while I compare it against my insurance EOB."',
    gather: ['The itemized bill + the original bill (Bill Lens)', 'Your EOB from the insurer', 'Any pre-authorization or estimate paperwork'],
    channels: [
      { name: 'Provider billing office', detail: 'Ask for "itemized bill" and "billing hold" in the same call' },
      { name: 'Your health insurer', detail: 'Number on your insurance card — EOB disputes start here' },
      { name: 'No Surprises Help Desk', detail: 'cms.gov/nosurprises — federal help line 1-800-985-3059' },
      { name: 'State insurance department', detail: 'Search "[your state] department of insurance complaint"' },
    ],

    links: [
      { label: 'No Surprises Act help desk', url: 'https://www.cms.gov/nosurprises' },
      { label: 'Find your state insurance department', url: 'https://www.usa.gov/state-consumer' },
    ],
    places: [
      { label: 'Hospital billing offices', query: 'hospital billing office' },
      { label: 'Free legal aid', query: 'legal aid office' },
    ],  },
  {
    id: 'card-charge', cat: 'charges', icon: '💳', title: 'Card charge you don\'t recognize, or a subscription trap',
    about: 'An unknown charge, a "free trial" that billed you, or a subscription that won\'t die.',
    steps: [
      'Call the number on the back of your card and dispute the charge — for credit cards, federal law (Regulation Z) gives you 60 days from the statement date.',
      'Ask the issuer to block future charges from that merchant by name.',
      'Cancel inside the merchant\'s own system too, and screenshot the cancellation confirmation.',
      'File reports so the pattern gets tracked: FTC and, for issuer problems, the CFPB.',
    ],
    script: '"I\'m disputing this charge under my billing rights. I don\'t recognize it / I cancelled on this date. Please open the dispute, give me the case number, and block the merchant."',
    gather: ['The statement showing the charge', 'Cancellation confirmations or trial sign-up emails', 'Dates — the 60-day clock matters'],
    channels: [
      { name: 'Card issuer disputes', detail: 'Number on the back of the card — fastest, strongest channel' },
      { name: 'CFPB complaint', detail: 'consumerfinance.gov/complaint — if the issuer mishandles it' },
      { name: 'FTC ReportFraud', detail: 'reportfraud.ftc.gov — subscription traps and scams' },
    ],

    links: [
      { label: 'CFPB — complaint about your card issuer', url: 'https://www.consumerfinance.gov/complaint/' },
      { label: 'FTC — report the subscription trap', url: 'https://reportfraud.ftc.gov' },
    ],
    places: [
      { label: "Your bank's branches", query: 'bank branch' },
    ],  },
  {
    id: 'price-wrong', cat: 'prices', icon: '🏷️', title: 'Price rang up wrong at the register',
    about: 'The shelf tag said one price, the register said another — or a sale price didn\'t apply.',
    steps: [
      'Say it at the register, before paying if you can — most stores fix it on the spot when shown the shelf tag.',
      'If you already paid, go to customer service with the receipt; a photo of the shelf tag is gold.',
      'Many states have item-pricing / scanner-accuracy laws — some entitle you to the item free or a set refund when the scan is wrong.',
      'Refused? Store corporate next, then your state weights & measures or AG consumer line.',
    ],
    script: '"The shelf price was $X and it rang up $Y — here\'s my receipt and a photo of the tag. I\'d like it adjusted to the posted price, please."',
    gather: ['The receipt (Price Amnesia saved it)', 'A photo of the shelf tag if you can get one', 'Your price history in this app — proof of the normal price'],
    channels: [
      { name: 'Store customer service / manager', detail: 'Same day is strongest — bring the receipt' },
      { name: 'Store corporate line', detail: 'On the receipt or the store\'s website' },
      { name: 'State weights & measures / AG', detail: 'Search "[your state] scanner price complaint"' },
    ],

    links: [
      { label: 'State consumer protection offices', url: 'https://www.usa.gov/state-consumer' },
    ],
    places: [
      { label: 'Grocery stores (customer service desk)', query: 'grocery store' },
    ],  },
  {
    id: 'receipt-error', cat: 'prices', icon: '🧾', title: 'Wrong charge on a grocery receipt',
    about: 'Double-scanned item, coupon or discount missing, or weighted item priced wrong.',
    steps: [
      'Go back to that store\'s customer service with the receipt — grocery stores fix honest scan errors quickly, usually within a few days of purchase.',
      'Point to the exact line; if it was a produce/weight item, they can check the scale log.',
      'If the store won\'t fix it, contact the chain\'s corporate customer line with the receipt details.',
      'A store with a pattern of "errors" → state AG consumer protection.',
    ],
    script: '"I was charged twice for this item / my coupon didn\'t come off — it\'s this line on the receipt. Can you refund the difference?"',
    gather: ['The saved receipt in this app (photo + items)', 'The coupon or ad if it was a discount issue'],
    channels: [
      { name: 'Store customer service desk', detail: 'Bring the receipt — fastest refund path' },
      { name: 'Chain corporate support', detail: 'On the receipt footer or website' },
      { name: 'State AG consumer protection', detail: 'For patterns, not one-offs' },
    ],

    links: [
      { label: 'State consumer protection offices', url: 'https://www.usa.gov/state-consumer' },
    ],
    places: [
      { label: 'The store — customer service', query: 'grocery store customer service' },
    ],  },
  {
    id: 'deposit-fee', cat: 'home', icon: '🏠', title: 'Deposit withheld or a bogus service fee',
    about: 'A landlord kept deposit money, or a mover/contractor/service added charges you never agreed to.',
    steps: [
      'Demand an itemized statement of every deduction, in writing — most states require one within a set number of days.',
      'Compare it line-by-line against your lease or contract; charges outside the contract are your dispute list.',
      'Send a short written demand (email is fine) citing the lease clause or state deadline, and keep everything.',
      'No response → local tenant/consumer office, then small claims court (cheap to file, no lawyer needed).',
    ],
    script: '"Please send the itemized deduction statement required under the lease and state law. I\'m disputing the charges that aren\'t in the contract, and I\'d like this resolved in writing."',
    gather: ['Your lease/contract', 'Move-in/move-out photos if it\'s a deposit', 'Every bill or invoice the service gave you (Bill Lens)'],
    channels: [
      { name: 'Landlord / company, in writing', detail: 'Email creates the dated record courts love' },
      { name: 'Local tenant rights / housing office', detail: 'Search "[your city] tenant rights help" — free advice' },
      { name: 'Small claims court', detail: 'Your county courthouse — filing is usually $30-75' },
      { name: 'State AG consumer protection', detail: 'For business fee patterns' },
    ],

    links: [
      { label: 'HUD — renter help by state', url: 'https://www.hud.gov/states' },
      { label: 'Find free legal aid (LawHelp)', url: 'https://www.lawhelp.org' },
      { label: 'Dial 2-1-1 for local tenant help', url: 'https://www.211.org' },
    ],
    places: [
      { label: 'Legal aid offices', query: 'legal aid office' },
      { label: 'Small claims court', query: 'small claims court' },
      { label: 'Tenant rights / housing office', query: 'tenant rights office' },
    ],  },
];

export function topicById(id: string): Topic | undefined { return TOPICS.find(t => t.id === id); }
export function billTopicFor(billType: string): string {
  switch (billType) {
    case 'electric': case 'gas': case 'water': return 'utility-high';
    case 'phone': case 'internet': return 'telecom-surprise';
    case 'medical': return 'medical-bill';
    case 'credit-card': case 'subscription': return 'card-charge';
    case 'rent': return 'deposit-fee';
    default: return 'late-fee';
  }
}
