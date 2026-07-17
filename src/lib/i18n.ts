import fs from "node:fs";
import path from "node:path";

type Dict = Record<string, unknown>;
type Params = Record<string, string | number | boolean>;

let catalog: Dict | null = null;

function deepMerge(a: Dict, b: Dict): Dict {
  const out: Dict = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof out[k] === "object"
    ) {
      out[k] = deepMerge(out[k] as Dict, v as Dict);
    } else out[k] = v;
  }
  return out;
}

function loadOnce() {
  if (catalog) return catalog;
  const candidates = [
    path.resolve(process.cwd(), "config/strings/en"),
    path.resolve(process.cwd(), "dist/config/strings/en"),
  ];
  const dir = candidates.find(fs.existsSync) ?? candidates[0];
  if (!dir) throw new Error("No strings directory found");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  catalog = files.reduce((acc, f) => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    return deepMerge(acc, data);
  }, {} as Dict);

  return catalog;
}

function fmt(template: string, params?: Params) {
  if (!params) return template;
  return template.replace(/\{([\w.]+)}/g, (_, k) => {
    const paths = k.split(".");
    let v: unknown = params;

    for (const p of paths) v = (v as Record<string, unknown>)?.[p];
    if (v == null) {
      console.warn(
        `[i18n] missing placeholder "${k}" for template: ${template}`,
      );
    }
    return v == null ? `{${k}}` : String(v);
  });
}

function getRaw(key: string): unknown {
  const dict = loadOnce();
  return key
    .split(".")
    .reduce<unknown>(
      (acc: unknown, part) => (acc as Record<string, unknown>)?.[part],
      dict,
    );
}

export function t(key: string, params?: Params): string {
  const node = getRaw(key);
  if (node == null) {
    console.warn(`[i18n] missing key: ${key}`);
    return key; // shows the missing key rather than throwing
  }

  if (Array.isArray(node)) {
    const pick = node[Math.floor(Math.random() * node.length)];
    return typeof pick === "string" ? fmt(pick, params) : String(pick);
  }
  if (typeof node === "string") return fmt(node, params);

  // A non-string / non-array node means the key points at a subtree, not a
  // leaf string — surface the key instead of "[object Object]".
  console.warn(`[i18n] key is not a string: ${key}`);
  return key;
}

export function reloadStrings() {
  catalog = null;
}
