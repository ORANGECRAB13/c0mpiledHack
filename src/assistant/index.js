// The compliance assistant: a real grounded chat over the internal document
// corpus. Runs on the Azure AI Foundry agent tier when configured
// (AZURE_NEW_ENDPOINT / AZURE_NEW_KEY), falling back to the Azure OpenAI /
// OpenAI chat tier from src/ai.js. Citations returned by the model are
// verified against the corpus before they reach the UI, so the PDF viewer only
// ever highlights text that is genuinely on the cited page.

import { agentModelConfigured, agentModelStatus, completeJson } from '../agents/azure.js';
import { askAi, getAiConfig } from '../ai.js';
import { corpusPrompt, findQuote, DOCS } from './corpus.js';
import { customersPrompt, CUSTOMERS } from './customers.js';

const SYSTEM = `You are the compliance assistant for Aurora Retail Energy, an Australian energy retailer regulated by the AER under the National Energy Retail Law and Rules.
Answer questions from credit officers and compliance staff using ONLY the internal document corpus and the customer records below.
Policy claims must cite a clause from the document corpus, quoting it verbatim. Customer facts come from the CRM records — state them plainly without a citation, and when a policy applies to a customer's situation, combine the record with the cited clause.
If neither the corpus nor the records cover the question, say so plainly — never invent clauses, amounts, customers, or rule numbers.
Jurisdiction matters: each document carries a "Jurisdiction" line and each customer a "Location". General AER/NERL instruments apply to customers in NSW, QLD, SA, ACT and TAS. VIC-only documents (the Best Offer Policy) apply only to VIC customers — never apply a state-specific obligation to a customer in a different state, and note the mismatch if asked.

DOCUMENT CORPUS
${corpusPrompt()}

CUSTOMER RECORDS (CRM · operational queue)
${customersPrompt()}`;

const SHAPE = `{
  "answer": "2-4 sentence answer, plain prose, leading with the direct answer",
  "citations": [
    { "doc": "doc id from the corpus", "page": 1, "quote": "verbatim clause text from the corpus", "reason": "one sentence on why this clause decides the point" }
  ]
}`;

export function assistantStatus() {
  const foundry = agentModelStatus();
  const chat = getAiConfig();
  return {
    configured: foundry.configured || chat.enabled,
    tier: foundry.configured ? 'azure-ai-foundry' : chat.enabled ? chat.provider : 'none',
    model: foundry.configured ? foundry.model : chat.enabled ? chat.model : null,
    documents: DOCS.length,
    customers: CUSTOMERS.length
  };
}

/** Verify and normalise a model citation; drop anything not in the corpus. */
function verifyCitation(c, n) {
  if (!c || typeof c.doc !== 'string' || typeof c.quote !== 'string') return null;
  const hit = findQuote(c.doc, c.quote);
  if (!hit) return null;
  return {
    n,
    doc: c.doc,
    page: hit.page,
    quote: hit.text,
    reason: typeof c.reason === 'string' ? c.reason : ''
  };
}

export async function askAssistant(question, history = []) {
  if (!question || typeof question !== 'string') throw new Error('question is required');
  const status = assistantStatus();
  if (!status.configured) {
    const err = new Error('No model configured. Set AZURE_NEW_ENDPOINT and AZURE_NEW_KEY (Azure AI Foundry) or the Azure OpenAI / OpenAI variables.');
    err.code = 'not_configured';
    throw err;
  }

  const convo = history
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Officer'}: ${m.text}`)
    .join('\n');
  const user = convo ? `${convo}\nOfficer: ${question}` : question;

  let raw;
  if (agentModelConfigured()) {
    raw = await completeJson(SYSTEM, user, SHAPE, { maxTokens: 2400 });
  } else {
    const text = await askAi(`${SYSTEM}\n\nReply with a single JSON object and nothing else. No code fences. Shape:\n${SHAPE}\n\n${user}`);
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    raw = JSON.parse(fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  }

  const citations = (Array.isArray(raw.citations) ? raw.citations : [])
    .map((c, i) => verifyCitation(c, i + 1))
    .filter(Boolean)
    .map((c, i) => ({ ...c, n: i + 1 }));

  return {
    answer: typeof raw.answer === 'string' ? raw.answer : String(raw.answer ?? ''),
    citations,
    tier: status.tier,
    model: status.model
  };
}
