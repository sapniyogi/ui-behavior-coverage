import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import ts from 'typescript';

const sourceExtensions = ['.tsx', '.ts', '.jsx', '.js'];
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/;

export interface ProjectModuleResolverOptions {
  tsconfigPath?: string;
}

export interface ResolvedProjectExport {
  file: string;
  componentName: string;
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function parseProjectSourceFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );
}

export function readProjectCompilerOptions(
  rootDir: string,
  options: ProjectModuleResolverOptions = {},
): ts.CompilerOptions {
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

function isSourceFile(file: string): boolean {
  return sourceExtensions.some((extension) => file.endsWith(extension));
}

function isInsideRoot(file: string, rootDir: string): boolean {
  const rel = relative(rootDir, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function fallbackRelativeResolution(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = extname(base)
    ? [base]
    : [
        ...sourceExtensions.map((extension) => `${base}${extension}`),
        ...sourceExtensions.map((extension) => join(base, `index${extension}`)),
      ];

  return candidates.find((candidate) =>
    isSourceFile(candidate) &&
    existsSync(candidate) &&
    statSync(candidate).isFile() &&
    !testFilePattern.test(candidate),
  );
}

export function resolveProjectModuleFile(
  fromFile: string,
  specifier: string,
  rootDir: string,
  compilerOptions: ts.CompilerOptions,
): { file?: string; external: boolean } {
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
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
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

export function traceProjectExport(
  file: string,
  exportName: string | undefined,
  rootDir: string,
  compilerOptions: ts.CompilerOptions,
  visited = new Set<string>(),
): ResolvedProjectExport | undefined {
  const visitKey = `${file}::${exportName ?? 'default'}`;
  if (visited.has(visitKey)) return undefined;
  visited.add(visitKey);

  const sourceFile = parseProjectSourceFile(file);

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

        const resolved = resolveProjectModuleFile(file, moduleSpecifier, rootDir, compilerOptions);
        if (!resolved.file) continue;
        return traceProjectExport(
          resolved.file,
          sourceName === 'default' ? undefined : sourceName,
          rootDir,
          compilerOptions,
          visited,
        );
      }
    }

    if (!statement.exportClause && moduleSpecifier && exportName) {
      const resolved = resolveProjectModuleFile(file, moduleSpecifier, rootDir, compilerOptions);
      if (!resolved.file) continue;
      const traced = traceProjectExport(resolved.file, exportName, rootDir, compilerOptions, visited);
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
