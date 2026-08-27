import fs from "fs";
import path from "path";

const root = process.cwd();
const src = path.join(root, "src");
const files = [];

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
}
walk(src);

const contents = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const entryRe =
  /src\/app\/.*\/(page|layout|route)\.tsx?$|^src\/middleware\.ts$|^src\/instrumentation\.ts$/;

const dead = [];
for (const f of files.filter((x) => !x.endsWith(".test.ts"))) {
  const rel = path.relative(root, f).replace(/\\/g, "/");
  if (entryRe.test(rel)) continue;

  const mod = path.relative(src, f).replace(/\\/g, "/").replace(/\.tsx?$/, "");
  const alias = "@/" + mod;
  const base = path.basename(f).replace(/\.tsx?$/, "");

  let importers = [];
  for (const [other, txt] of contents) {
    if (other === f) continue;
    const hasAlias = txt.includes(alias);
    const hasRel =
      new RegExp(`from ['"].*${base}['"]`).test(txt) &&
      (txt.includes(`./${base}`) ||
        txt.includes(`/${base}'`) ||
        txt.includes(`/${base}"`));
    if (hasAlias || hasRel) importers.push(path.relative(root, other).replace(/\\/g, "/"));
  }

  if (importers.length === 0) dead.push({ rel, mod, base });
}

dead.sort((a, b) => a.rel.localeCompare(b.rel));
console.log(JSON.stringify(dead, null, 2));
console.error("total:", dead.length);
