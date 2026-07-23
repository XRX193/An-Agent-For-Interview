import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const REQUIRED_ENV = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "VECTOR_INDEX_NAME",
];

for (const name of REQUIRED_ENV) {
  if (!process.env[name]) {
    fail(`${name} is not configured.`);
  }
}

const indexName = process.env.VECTOR_INDEX_NAME;
const require = createRequire(join(process.cwd(), "package.json"));
let wranglerCli;

try {
  wranglerCli = join(dirname(require.resolve("wrangler/package.json")), "bin", "wrangler.js");
} catch {
  fail("Wrangler is not installed. Run npm ci before setting up Vectorize.");
}

function runWrangler(args, captureOutput = false) {
  const result = spawnSync(process.execPath, [wranglerCli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
  }

  return result;
}

function readJson(args, operation) {
  const result = runWrangler(args, true);
  if (result.status !== 0) {
    if (result.stdout) {
      process.stderr.write(result.stdout);
    }
    failCloudflareAccess(operation);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`Wrangler returned invalid JSON while trying to ${operation}: ${error.message}`);
  }
}

function hasIndex(indexes) {
  if (!Array.isArray(indexes)) {
    fail("Wrangler returned an unexpected response while listing Vectorize indexes.");
  }
  return indexes.some((index) => index?.name === indexName);
}

function hasRepoMetadataIndex(metadataIndexes) {
  if (!Array.isArray(metadataIndexes)) {
    fail("Wrangler returned an unexpected response while listing metadata indexes.");
  }
  return metadataIndexes.some((index) => index?.propertyName === "repo");
}

function failCloudflareAccess(operation) {
  fail(
    `Unable to ${operation}. Replace the CLOUDFLARE_API_TOKEN GitHub secret with an account-scoped token that includes Vectorize Edit for account ${process.env.CLOUDFLARE_ACCOUNT_ID}.`,
    "Cloudflare Vectorize access denied",
  );
}

function fail(message, title = "Vectorize setup failed") {
  console.error(`::error title=${title}::${message}`);
  process.exit(1);
}

let indexes = readJson(
  ["vectorize", "list", "--json"],
  "list Vectorize indexes",
);

if (!hasIndex(indexes)) {
  console.log(`Creating Vectorize index '${indexName}'...`);
  const createResult = runWrangler([
    "vectorize",
    "create",
    indexName,
    "--dimensions=1024",
    "--metric=cosine",
  ]);

  if (createResult.status !== 0) {
    // Another workflow may have created the index concurrently.
    indexes = readJson(
      ["vectorize", "list", "--json"],
      "verify the Vectorize index after creation failed",
    );
    if (!hasIndex(indexes)) {
      failCloudflareAccess(`create Vectorize index '${indexName}'`);
    }
  }
} else {
  console.log(`Vectorize index '${indexName}' already exists.`);
}

let metadataIndexes = readJson(
  ["vectorize", "list-metadata-index", indexName, "--json"],
  `list metadata indexes for '${indexName}'`,
);

if (!hasRepoMetadataIndex(metadataIndexes)) {
  console.log(`Creating 'repo' metadata index on '${indexName}'...`);
  const createMetadataResult = runWrangler([
    "vectorize",
    "create-metadata-index",
    indexName,
    "--propertyName=repo",
    "--type=string",
  ]);

  if (createMetadataResult.status !== 0) {
    // Treat a concurrent successful creation as success.
    metadataIndexes = readJson(
      ["vectorize", "list-metadata-index", indexName, "--json"],
      `verify the 'repo' metadata index after creation failed`,
    );
    if (!hasRepoMetadataIndex(metadataIndexes)) {
      failCloudflareAccess(`create the 'repo' metadata index on '${indexName}'`);
    }
  }
} else {
  console.log(`Metadata index 'repo' already exists on '${indexName}'.`);
}
