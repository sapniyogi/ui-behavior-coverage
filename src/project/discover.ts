import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { DiscoverySkipReason, ProjectDiscoveryTelemetry } from '../core/model';

const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules', '.next', 'build']);
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/;
const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js'];

export interface ProjectTarget {
  componentFile: string;
  componentNames: string[];
  testFiles: string[];
}

export interface ProjectDiscoveryResult {
  targets: ProjectTarget[];
  telemetry: ProjectDiscoveryTelemetry;
}

export interface ProjectDiscoveryOptions {
  tsconfigPath?: string;
}

interface ImportBinding {
  importedName?: string;
  localName: string;
  isDefault?: boolean;
}

interface ImportedComponentReference {
  componentFile: string;
  componentName: string;
}

interface ResolvedExport {
  file: string;
  componentName: string;
}

interface PackageSelfReference {
  name: string;
  exports?: unknown;
}

function createSkipped(): Record<DiscoverySkipReason, number> {
  return {
    'no-runtime-jsx': 0,
    'no-rendered-component-import': 0,
    'external-module': 0,
    'unresolved-module': 0,
    'unresolved-barrel-export': 0,
  };
}

function walkFiles(rootDir: string): string[] {
  const files: string[] = [];

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirectories.has(entry)) continue;

      const fullPath = join(directory, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) visit(fullPath);
      else if (stat.isFile()) files.push(fullPath);
    }
  };

  visit(rootDir);
  return files;
}

export function discoverTestFiles(rootDir: string): string[] {
  const root = resolve(rootDir);
  return walkFiles(root).filter((candidate) => testFilePattern.test(candidate)).sort();
}

function runtimeImportBindings(clause: ts.ImportClause | undefined): ImportBinding[] {
  if (!clause || clause.isTypeOnly) return [];

  const bindings: ImportBinding[] = [];
  if (clause.name) bindings.push({ localName: clause.name.text, isDefault: true });

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

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseSourceFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
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

function readCompilerOptions(rootDir: string, options: ProjectDiscoveryOptions): ts.CompilerOptions {
  const explicit = options.tsconfigPath ? resolve(options.tsconfigPath) : undefined;
  const configPath = explicit ?? ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath || !existsSync(configPath)) {
    return {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    };
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    return {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    };
  }

  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  return {
    ...parsed.options,
    allowJs: true,
    jsx: parsed.options.jsx ?? ts.JsxEmit.Preserve,
  };
}

function readPackageSelfReference(rootDir: string): PackageSelfReference | undefined {
  const packageJson = join(rootDir, 'package.json');
  if (!existsSync(packageJson)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(packageJson, 'utf8')) as { name?: unknown; exports?: unknown };
    if (typeof parsed.name !== 'string' || parsed.name.length === 0) return undefined;
    return { name: parsed.name, exports: parsed.exports };
  } catch {
    return undefined;
  }
}

function isSourceFile(file: string): boolean {
  return sourceExtensions.some((extension) => file.endsWith(extension));
}

function isInsideRoot(file: string, rootDir: string): boolean {
  const rel = relative(rootDir, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function existingSourceCandidate(base: string): string | undefined {
  const extension = extname(base);
  const candidates = extension
    ? [
        base,
        ...(extension === '.js' || extension === '.jsx'
          ? sourceExtensions.map((sourceExtension) => `${base.slice(0, -extension.length)}${sourceExtension}`)
          : []),
      ]
    : [
        ...sourceExtensions.map((sourceExtension) => `${base}${sourceExtension}`),
        ...sourceExtensions.map((sourceExtension) => join(base, `index${sourceExtension}`)),
      ];

  return candidates.find((candidate) =>
    isSourceFile(candidate) && existsSync(candidate) && statSync(candidate).isFile() && !testFilePattern.test(candidate),
  );
}

function fallbackRelativeResolution(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  return existingSourceCandidate(resolve(dirname(fromFile), specifier));
}

function firstStringExportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const target = firstStringExportTarget(entry);
      if (target) return target;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ['source', 'import', 'default', 'browser', 'node', 'require']) {
    if (!(key in record)) continue;
    const target = firstStringExportTarget(record[key]);
    if (target) return target;
  }
  for (const candidate of Object.values(record)) {
    const target = firstStringExportTarget(candidate);
    if (target) return target;
  }
  return undefined;
}

function packageExportTarget(exportsField: unknown, subpath: string): string | undefined {
  const requested = subpath ? `./${subpath}` : '.';
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) {
    return requested === '.' ? firstStringExportTarget(exportsField) : undefined;
  }
  if (!exportsField || typeof exportsField !== 'object') return undefined;

  const exportsRecord = exportsField as Record<string, unknown>;
  if (requested in exportsRecord) return firstStringExportTarget(exportsRecord[requested]);

  const wildcardEntries = Object.entries(exportsRecord)
    .filter(([key]) => key.includes('*'))
    .sort(([left], [right]) => right.length - left.length);

  for (const [key, value] of wildcardEntries) {
    const starIndex = key.indexOf('*');
    const prefix = key.slice(0, starIndex);
    const suffix = key.slice(starIndex + 1);
    if (!requested.startsWith(prefix) || !requested.endsWith(suffix)) continue;

    const matched = requested.slice(prefix.length, requested.length - suffix.length);
    const target = firstStringExportTarget(value);
    if (target) return target.replace('*', matched);
  }

  return undefined;
}

function resolvePackageSelfImport(
  specifier: string,
  rootDir: string,
  packageSelfReference: PackageSelfReference | undefined,
): string | undefined {
  if (!packageSelfReference) return undefined;
  if (specifier !== packageSelfReference.name && !specifier.startsWith(`${packageSelfReference.name}/`)) {
    return undefined;
  }

  const subpath = specifier === packageSelfReference.name
    ? ''
    : specifier.slice(packageSelfReference.name.length + 1);
  const exportedTarget = packageExportTarget(packageSelfReference.exports, subpath);

  if (exportedTarget?.startsWith('./')) {
    const candidate = existingSourceCandidate(resolve(rootDir, exportedTarget));
    if (candidate && isInsideRoot(candidate, rootDir)) return candidate;
  }

  const fallbackBases = subpath
    ? [join(rootDir, 'src', subpath), join(rootDir, subpath)]
    : [join(rootDir, 'src', 'index'), join(rootDir, 'index')];

  for (const base of fallbackBases) {
    const candidate = existingSourceCandidate(base);
    if (candidate && isInsideRoot(candidate, rootDir)) return candidate;
  }
  return undefined;
}

function resolveModuleFile(
  fromFile: string,
  specifier: string,
  rootDir: string,
  compilerOptions: ts.CompilerOptions,
  packageSelfReference: PackageSelfReference | undefined,
): { file?: string; external: boolean } {
  const selfReference = resolvePackageSelfImport(specifier, rootDir, packageSelfReference);
  if (selfReference) return { file: normalize(selfReference), external: false };

  const resolvedModule = ts.resolveModuleName(specifier, fromFile, compilerOptions, ts.sys).resolvedModule;
  let file = resolvedModule?.resolvedFileName;

  if (file?.endsWith('.d.ts')) file = undefined;
  file ??= fallbackRelativeResolution(fromFile, specifier);
  if (!file || !isSourceFile(file)) return { external: !specifier.startsWith('.') };

  const normalizedFile = normalize(file);
  if (!isInsideRoot(normalizedFile, rootDir)) return { external: true };
  return { file: normalizedFile, external: false };
}

function declarationName(node: ts.Node): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    node.name
  ) {
    return node.name.text;
  }
  if (ts.isVariableStatement(node)) {
    const first = node.declarationList.declarations[0];
    if (first && ts.isIdentifier(first.name)) return first.name.text;
  }
  return undefined;
}

function localDefaultExportName(sourceFile: ts.SourceFile): string | undefined {
  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const hasDefault = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    const hasExport = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (hasDefault && hasExport) {
      const name = declarationName(statement);
      if (name) return name;
    }

    if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression)
    ) {
      return statement.expression.text;
    }
  }
  return undefined;
}

function locallyDeclaredExport(sourceFile: ts.SourceFile, exportName: string): string | undefined {
  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const exported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;

    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === exportName) {
      return exportName;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName) return exportName;
      }
    }
  }
  return undefined;
}

function traceExport(
  file: string,
  exportName: string | undefined,
  rootDir: string,
  compilerOptions: ts.CompilerOptions,
  packageSelfReference: PackageSelfReference | undefined,
  visited = new Set<string>(),
): ResolvedExport | undefined {
  const visitKey = `${file}::${exportName ?? 'default'}`;
  if (visited.has(visitKey)) return undefined;
  visited.add(visitKey);

  const sourceFile = parseSourceFile(file);

  if (!exportName) {
    const localDefault = localDefaultExportName(sourceFile);
    if (localDefault) return { file, componentName: localDefault };
  } else {
    const local = locallyDeclaredExport(sourceFile, exportName);
    if (local) return { file, componentName: local };
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;

    const moduleSpecifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : undefined;

    if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        const exposedName = element.name.text;
        const sourceName = element.propertyName?.text ?? element.name.text;
        const requested = exportName ?? 'default';
        if (exposedName !== requested) continue;

        if (!moduleSpecifier) {
          const local = locallyDeclaredExport(sourceFile, sourceName);
          if (local) return { file, componentName: local };
          continue;
        }

        const resolved = resolveModuleFile(
          file,
          moduleSpecifier,
          rootDir,
          compilerOptions,
          packageSelfReference,
        );
        if (!resolved.file) continue;
        return traceExport(
          resolved.file,
          sourceName === 'default' ? undefined : sourceName,
          rootDir,
          compilerOptions,
          packageSelfReference,
          visited,
        );
      }
    }

    if (!statement.exportClause && moduleSpecifier && exportName) {
      const resolved = resolveModuleFile(
        file,
        moduleSpecifier,
        rootDir,
        compilerOptions,
        packageSelfReference,
      );
      if (!resolved.file) continue;
      const traced = traceExport(
        resolved.file,
        exportName,
        rootDir,
        compilerOptions,
        packageSelfReference,
        visited,
      );
      if (traced) return traced;
    }
  }

  if (!exportName) {
    const stem = basename(file).replace(/\.(?:tsx?|jsx?)$/, '');
    if (stem !== 'index') return { file, componentName: stem };
  } else if (basename(file).startsWith(`${exportName}.`)) {
    return { file, componentName: exportName };
  }

  return undefined;
}

function importedComponentsUsedInJsx(
  testFile: string,
  rootDir: string,
  compilerOptions: ts.CompilerOptions,
  packageSelfReference: PackageSelfReference | undefined,
  telemetry: ProjectDiscoveryTelemetry,
): ImportedComponentReference[] {
  const sourceFile = parseSourceFile(testFile);
  const renderedNames = jsxIdentifierNames(sourceFile);
  const references: ImportedComponentReference[] = [];
  if (renderedNames.size === 0) {
    telemetry.skipped['no-runtime-jsx'] += 1;
    return references;
  }
  telemetry.testFilesWithRuntimeJsx += 1;

  let renderedRuntimeImportCount = 0;

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;

    for (const binding of runtimeImportBindings(statement.importClause)) {
      if (!renderedNames.has(binding.localName)) continue;
      renderedRuntimeImportCount += 1;
      telemetry.importsExamined += 1;

      const resolved = resolveModuleFile(
        testFile,
        specifier,
        rootDir,
        compilerOptions,
        packageSelfReference,
      );
      if (!resolved.file) {
        telemetry.skipped[resolved.external ? 'external-module' : 'unresolved-module'] += 1;
        continue;
      }

      const traced = traceExport(
        resolved.file,
        binding.isDefault ? undefined : binding.importedName,
        rootDir,
        compilerOptions,
        packageSelfReference,
      );
      if (!traced) {
        telemetry.skipped['unresolved-barrel-export'] += 1;
        continue;
      }

      telemetry.importsResolved += 1;
      references.push({ componentFile: traced.file, componentName: traced.componentName });
    }
  }

  if (renderedRuntimeImportCount === 0) telemetry.skipped['no-rendered-component-import'] += 1;
  return references;
}

export function discoverProject(
  rootDir: string,
  options: ProjectDiscoveryOptions = {},
): ProjectDiscoveryResult {
  const root = resolve(rootDir);
  const testFiles = discoverTestFiles(root);
  const compilerOptions = readCompilerOptions(root, options);
  const packageSelfReference = readPackageSelfReference(root);
  const telemetry: ProjectDiscoveryTelemetry = {
    totalTestFiles: testFiles.length,
    testFilesWithRuntimeJsx: 0,
    testFilesWithTargets: 0,
    importsExamined: 0,
    importsResolved: 0,
    skipped: createSkipped(),
  };
  const targets = new Map<string, { componentNames: Set<string>; testFiles: Set<string> }>();

  for (const file of testFiles) {
    const references = importedComponentsUsedInJsx(
      file,
      root,
      compilerOptions,
      packageSelfReference,
      telemetry,
    );
    if (references.length > 0) telemetry.testFilesWithTargets += 1;

    for (const reference of references) {
      const existing = targets.get(reference.componentFile) ?? {
        componentNames: new Set<string>(),
        testFiles: new Set<string>(),
      };

      existing.componentNames.add(reference.componentName);
      existing.testFiles.add(file);
      targets.set(reference.componentFile, existing);
    }
  }

  return {
    targets: [...targets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([componentFile, target]) => ({
        componentFile,
        componentNames: [...target.componentNames].sort(),
        testFiles: [...target.testFiles].sort(),
      })),
    telemetry,
  };
}

export function discoverProjectTargets(
  rootDir: string,
  options: ProjectDiscoveryOptions = {},
): ProjectTarget[] {
  return discoverProject(rootDir, options).targets;
}
