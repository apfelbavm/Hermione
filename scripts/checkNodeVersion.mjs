const REQUIRED_MAJOR = 24;

const current = process.versions.node;
const major = Number.parseInt(current.split(".")[0], 10);

if (!Number.isInteger(major)) {
  console.error(`[Hermione] Could not parse Node.js version: ${current}`);
  process.exit(1);
}

if (major < REQUIRED_MAJOR) {
  console.error(`[Hermione] Node.js ${REQUIRED_MAJOR}+ is required. Current: ${current}`);
  process.exit(1);
}
