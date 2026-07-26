/**
 * On-device text embeddings — mirrors ai-brain's embeddings service.
 *
 * ai-brain embeds policy chunks once (stored on graph nodes) and embeds the
 * query at search time, ranking by cosine similarity through a Neo4j vector
 * index. This is the Node port of that: BAAI/bge-small-en-v1.5 (384-dim) via
 * Transformers.js, loaded lazily and guarded so a missing model or offline box
 * never breaks retrieval — callers fall back to full-text / local citation.
 */

export const EMBEDDING_DIM = 384;
const MODEL_NAME = 'Xenova/bge-small-en-v1.5';
// bge models are trained to prefix *queries* (not documents) with this instruction.
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

let extractorPromise = null;
let disabled = false;

async function getExtractor() {
  if (disabled) return null;
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        // Imported lazily: non-semantic paths (and boxes without the model) pay
        // nothing until embeddings are actually needed.
        const { pipeline } = await import('@xenova/transformers');
        return await pipeline('feature-extraction', MODEL_NAME, { quantized: true });
      } catch (err) {
        disabled = true;
        console.warn(`[embeddings] disabled (${err.message}); falling back to full-text/local`);
        return null;
      }
    })();
  }
  return extractorPromise;
}

export function embeddingsAvailable() {
  return !disabled;
}

async function embed(text, { isQuery }) {
  const extractor = await getExtractor();
  if (!extractor) return null;
  try {
    const input = isQuery ? QUERY_PREFIX + text : text;
    const output = await extractor(input, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch {
    return null;
  }
}

export async function embedQuery(text) {
  return embed(text, { isQuery: true });
}

export async function embedDocuments(texts) {
  const out = [];
  for (const t of texts) out.push(await embed(t, { isQuery: false }));
  return out;
}
