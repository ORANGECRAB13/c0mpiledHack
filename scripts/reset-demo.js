import { persistKnowledgeGaps } from '../src/graph/dataset.js';

await persistKnowledgeGaps([]);
console.log('Knowledge gaps cleared — the demo starts with the agent not knowing.');
