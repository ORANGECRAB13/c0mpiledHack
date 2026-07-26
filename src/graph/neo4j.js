import neo4j from 'neo4j-driver';

const graphConfig = {
  uri: process.env.NEO4J_URI || '',
  username: process.env.NEO4J_USERNAME || process.env.NEO4J_USER || '',
  password: process.env.NEO4J_PASSWORD || '',
  database: process.env.NEO4J_DATABASE || 'neo4j'
};

let driver;

export function isGraphConfigured() {
  return Boolean(graphConfig.uri && graphConfig.username && graphConfig.password);
}

export function getGraphConfig() {
  return {
    uri: graphConfig.uri,
    username: graphConfig.username,
    database: graphConfig.database,
    configured: isGraphConfigured()
  };
}

export function getDriver() {
  if (!isGraphConfigured()) {
    throw new Error('Neo4j is not configured. Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD in .env.');
  }

  if (!driver) {
    driver = neo4j.driver(graphConfig.uri, neo4j.auth.basic(graphConfig.username, graphConfig.password));
  }
  return driver;
}

export async function verifyGraphConnectivity() {
  if (!isGraphConfigured()) {
    return { ok: false, configured: false, error: 'Neo4j env vars are not configured.' };
  }

  try {
    await getDriver().verifyConnectivity();
    return { ok: true, configured: true, database: graphConfig.database };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
}

export async function withGraphSession(mode, work) {
  const session = getDriver().session({
    database: graphConfig.database,
    defaultAccessMode: mode
  });

  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

export const READ = neo4j.session.READ;
export const WRITE = neo4j.session.WRITE;
