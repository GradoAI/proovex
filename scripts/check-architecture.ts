// Slice 1 architecture checker: six initial rules from GCK-D0017 section 11; remaining rules are reported as not covered.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';

export const IMPLEMENTED_RULES = [
  'ARCH-UNCLASSIFIED',
  'ARCH-TS-ONLY',
  'ARCH-CORE-IO',
  'ARCH-CORE-DEPENDENCY',
  'ARCH-LAYER-DIRECTION',
  'ARCH-PUBLIC-ENTRY',
] as const;

export const NOT_COVERED_RULES = [
  'ARCH-CHANGE-OWNER',
  'ARCH-RUN-GENERIC',
  'ARCH-EXTERNAL-ALLOWLIST',
  'ARCH-ONE-OWNER',
  'ARCH-LEGACY-BRIDGE',
  'ARCH-GRADO-NAMESPACE',
  'ARCH-PORT-IMPLEMENTATION',
  'ARCH-TRUTH-TRANSFER',
  'ARCH-NONPRODUCTION-IMPORT',
  'ARCH-LEGACY-GROWTH',
  'ARCH-CYCLE',
] as const;

export interface Violation {
  readonly rule: string;
  readonly file: string;
  readonly specifier?: string;
}

export interface CheckResult {
  readonly status: 'PASS' | 'FAIL';
  readonly violations: readonly Violation[];
  readonly implemented_rules: readonly string[];
  readonly not_covered_rules: readonly string[];
}

interface Layer {
  readonly name: string;
  readonly tier: string;
  readonly roots: readonly string[];
  readonly packages: readonly string[];
  readonly allowed_layers: readonly string[];
}

type AstNode = { type: string; [key: string]: unknown };

const LAYERS = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../architecture/layers.json', import.meta.url)), 'utf8'),
  ) as { layers: Layer[] }
).layers;

const globToRegExp = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`,
  );

function layerOfPath(file: string): Layer | undefined {
  return LAYERS.find((layer) =>
    layer.roots.some((root) =>
      globToRegExp(`${root}/*`).test(
        file
          .split('/')
          .slice(0, root.split('/').length + 1)
          .join('/'),
      ),
    ),
  );
}

function layerOfPackage(name: string): Layer | undefined {
  return LAYERS.find((layer) => layer.packages.some((pattern) => globToRegExp(pattern).test(name)));
}

function packageRoot(file: string): string | undefined {
  const match = /^(proovex\/(?:packages|apps)\/[^/]+)\//.exec(file);
  return match?.[1];
}

function classify(
  file: string,
): 'fixture' | 'config' | 'forbidden-source' | 'test' | 'script' | 'production' | 'unclassified' {
  if (file.startsWith('proovex/architecture/fixtures/')) return 'fixture';
  if (/^proovex\/(package\.json|package-lock\.json|tsconfig\.json|biome\.json|\.nvmrc|\.gitignore)$/.test(file))
    return 'config';
  if (/^proovex\/\.grado\/devflow\/.+\.(yaml|json|md)$/.test(file)) return 'config';
  if (/^proovex\/(packages|apps)\/[^/]+\/package\.json$/.test(file)) return 'config';
  if (/^proovex\/architecture\/[^/]+\.json$/.test(file)) return 'config';
  if (
    /\.(js|mjs|cjs|jsx)$/.test(file) ||
    (file.endsWith('.tsx') && !file.startsWith('proovex/apps/console/'))
  )
    return 'forbidden-source';
  if (
    /^proovex\/(packages|apps)\/[^/]+\/test\/.+\.ts$/.test(file) ||
    /^proovex\/test\/.+\.ts$/.test(file)
  )
    return 'test';
  if (/^proovex\/scripts\/.+\.ts$/.test(file)) return 'script';
  if (/^proovex\/tools\/devflow\/README\.md$/.test(file)) return 'config';
  if (/^proovex\/tools\/devflow\/devflow\.test\.ts$/.test(file)) return 'test';
  if (/^proovex\/tools\/devflow\/devflow\.ts$/.test(file)) return 'script';
  if (/^proovex\/\.github\/workflows\/.+\.ya?ml$/.test(file)) return 'config';
  if (file.endsWith('.ts') && layerOfPath(file)) return 'production';
  return 'unclassified';
}

function walk(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(join(root, dir))) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.DS_Store') continue;
    const path = dir ? `${dir}/${entry}` : entry;
    if (statSync(join(root, path)).isDirectory()) walk(root, path, out);
    else out.push(path);
  }
}

function specifiers(file: string, source: string): string[] {
  const parsed = parseSync(file, source);
  if (parsed.errors.length > 0) throw new Error(`parse:${file}`);
  const found: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const ast = node as AstNode;
    if (
      (ast.type === 'ImportDeclaration' ||
        ast.type === 'ExportAllDeclaration' ||
        ast.type === 'ExportNamedDeclaration' ||
        ast.type === 'ImportExpression') &&
      typeof ast.source === 'object' &&
      ast.source !== null &&
      typeof (ast.source as AstNode).value === 'string'
    ) {
      found.push((ast.source as AstNode).value as string);
    }
    for (const value of Object.values(ast)) if (typeof value === 'object') visit(value);
  };
  visit(parsed.program);
  return found;
}

function edgeViolation(file: string, layer: Layer, specifier: string): string | undefined {
  const core = layer.tier === 'core';
  if (specifier.startsWith('.')) {
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (!target.startsWith('proovex/')) return core ? 'ARCH-CORE-DEPENDENCY' : undefined;
    const targetLayer = layerOfPath(target);
    if (!targetLayer || packageRoot(target) === packageRoot(file)) return undefined;
    if (targetLayer.name !== layer.name && !layer.allowed_layers.includes(targetLayer.name)) {
      return core ? 'ARCH-CORE-DEPENDENCY' : 'ARCH-LAYER-DIRECTION';
    }
    return 'ARCH-PUBLIC-ENTRY';
  }
  if (specifier.startsWith('node:') || builtinModules.includes(specifier)) {
    return core ? 'ARCH-CORE-IO' : undefined;
  }
  const match = /^(@proovex\/[^/]+)(\/.*)?$/.exec(specifier);
  const packageName = match?.[1];
  if (!packageName) return undefined;
  const targetLayer = layerOfPackage(packageName);
  if (!targetLayer) return core ? 'ARCH-CORE-DEPENDENCY' : 'ARCH-LAYER-DIRECTION';
  if (targetLayer.name !== layer.name && !layer.allowed_layers.includes(targetLayer.name)) {
    return core ? 'ARCH-CORE-DEPENDENCY' : 'ARCH-LAYER-DIRECTION';
  }
  return match?.[2] ? 'ARCH-PUBLIC-ENTRY' : undefined;
}

export function checkArchitecture(root: string): CheckResult {
  const files: string[] = [];
  if (statSync(join(root, 'proovex'), { throwIfNoEntry: false })?.isDirectory())
    walk(root, 'proovex', files);
  const violations: Violation[] = [];
  for (const file of files.sort()) {
    const kind = classify(file);
    if (kind === 'forbidden-source') violations.push({ rule: 'ARCH-TS-ONLY', file });
    else if (kind === 'unclassified') violations.push({ rule: 'ARCH-UNCLASSIFIED', file });
    else if (kind === 'production') {
      const layer = layerOfPath(file) as Layer;
      for (const specifier of specifiers(file, readFileSync(join(root, file), 'utf8'))) {
        const rule = edgeViolation(file, layer, specifier);
        if (rule) violations.push({ rule, file, specifier });
      }
    }
  }
  return {
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violations,
    implemented_rules: IMPLEMENTED_RULES,
    not_covered_rules: NOT_COVERED_RULES,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  );
  const result = checkArchitecture(root);
  process.stdout.write(
    `${JSON.stringify({ root: relative(process.cwd(), root).split(sep).join('/') || '.', ...result })}\n`,
  );
  if (result.status !== 'PASS') process.exitCode = 1;
}
