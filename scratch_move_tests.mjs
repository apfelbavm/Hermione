import { readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const srcDir = join(root, "src");
const testsDir = join(root, "tests");

function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTestFiles(full));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const testFiles = findTestFiles(srcDir);
console.log(`Found ${testFiles.length} test files`);

const RELATIVE_IMPORT_RE = /((?:from\s+|import\s*\(\s*)["'])(\.\.?\/[^"']*)(["'])/g;

for (const oldAbsPath of testFiles) {
  const relFromSrc = relative(srcDir, oldAbsPath); // e.g. nodes/crypto.test.ts
  const newAbsPath = join(testsDir, relFromSrc);
  const oldDir = dirname(oldAbsPath);
  const newDir = dirname(newAbsPath);

  let content = readFileSync(oldAbsPath, "utf8");

  content = content.replace(RELATIVE_IMPORT_RE, (match, prefix, importPath, suffix) => {
    const absoluteTarget = resolve(oldDir, importPath);
    let newRel = relative(newDir, absoluteTarget).replace(/\\/g, "/");
    if (!newRel.startsWith(".")) newRel = "./" + newRel;
    return `${prefix}${newRel}${suffix}`;
  });

  mkdirSync(newDir, { recursive: true });
  writeFileSync(newAbsPath, content, "utf8");
  unlinkSync(oldAbsPath);
  console.log(`${relative(root, oldAbsPath)} -> ${relative(root, newAbsPath)}`);
}

// Remove now-empty directories left behind under src/.
function removeEmptyDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirs(join(dir, entry.name));
  }
  if (readdirSync(dir).length === 0 && dir !== srcDir) {
    rmdirSync(dir);
    console.log(`removed empty dir: ${relative(root, dir)}`);
  }
}
removeEmptyDirs(srcDir);

console.log("Done.");
