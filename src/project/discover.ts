import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import ts from 'typescript';

const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx)$/;

export interface ProjectTarget {
  componentFile: string;
  componentNames: string[];
  testFiles: string[];
}

interface ImportBinding {
  importedName?: string;
  localName: string;
}

function walkFiles(rootDir: string): string[] {
  const files: string[] = [];

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirectories.has(entry)) continue;

      const fullPath = join(directory, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) visit(fullPath);
      else if (stat.isFile()) files.push(fullPath);
    }
  };

  visit(rootDir);
  return files;
}

function runtimeImportBindings(clause: ts.ImportClause | undefined): ImportBinding[] {
  if (!clause || clause.isTypeOnly) return [];

  const bindings: ImportBinding[] = [];
  if (clause.name) bindings.push({ localName: clause.name.text });

  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      if (element.isTypeOnly) continue;
      bindings.push({
        importedName: element.propertyName?.text ?? element.name.text,
        localName: element.name.text,
      });
    }
  }

  return bindings;
}

function jsxIdentifierNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName)) names.add(node.tagName.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return names;
}

function resolveComponentModule(testFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;

  const base = resolve(dirname(testFile), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.tsx`, join(base, 'index.tsx')];

  for (const candidate of candidates) {
    if (
      candidate.endsWith('.tsx') &&
      !testFilePattern.test(candidate) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
    ) {
      return candidate;
    }
  }

  return undefined;
}

interface ImportedComponentReference {
  componentFile: string;
  componentName: string;
}

function importedComponentsUsedInJsx(testFile: string): ImportedComponentReference[] {
  const source = readFileSync(testFile, 'utf8');
  const sourceFile = ts.createSourceFile(
    testFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const renderedNames = jsxIdentifierNames(sourceFile);
  const references: ImportedComponentReference[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const componentFile = resolveComponentModule(testFile, statement.moduleSpecifier.text);
    if (!componentFile) continue;

    for (const binding of runtimeImportBindings(statement.importClause)) {
      if (!renderedNames.has(binding.localName)) continue;

      // Aliased named imports are deliberately skipped for now because the analyzer
      // matches JSX tag names to source component names directly.
      if (binding.importedName && binding.importedName !== binding.localName) continue;

      references.push({
        componentFile,
        componentName: binding.importedName ?? binding.localName,
      });
    }
  }

  return references;
}

export function discoverProjectTargets(rootDir: string): ProjectTarget[] {
  const root = resolve(rootDir);
  const targets = new Map<
    string,
    { componentNames: Set<string>; testFiles: Set<string> }
  >();

  for (const file of walkFiles(root).filter((candidate) => testFilePattern.test(candidate)).sort()) {
    for (const reference of importedComponentsUsedInJsx(file)) {
      const existing = targets.get(reference.componentFile) ?? {
        componentNames: new Set<string>(),
        testFiles: new Set<string>(),
      };

      existing.componentNames.add(reference.componentName);
      existing.testFiles.add(file);
      targets.set(reference.componentFile, existing);
    }
  }

  return [...targets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([componentFile, target]) => ({
      componentFile,
      componentNames: [...target.componentNames].sort(),
      testFiles: [...target.testFiles].sort(),
    }));
}
