import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative } from 'node:path';

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceFiles = [
  join(frontendRoot, 'src/App.jsx'),
  join(frontendRoot, 'src/App.css'),
];
const uiDirectory = join(frontendRoot, 'src/components/ui');
const sourceExtensions = new Set(['.css', '.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const patterns = [
  {
    name: 'hex color',
    expression: /#[\da-fA-F]{3,8}\b/g,
  },
  {
    name: 'functional color',
    expression: /\b(?:color|hsl|hsla|hwb|lab|lch|oklab|oklch|rgb|rgba)\s*\(/gi,
  },
  {
    name: 'palette utility class',
    expression: /(?<![\w-])(?:!?[\w-]+:)*(?:accent|bg|border|caret|decoration|divide|fill|from|outline|placeholder|ring|shadow|stroke|text|to|via)-(?:amber|black|blue|cyan|emerald|fuchsia|gray|green|indigo|lime|neutral|orange|pink|purple|red|rose|sky|slate|stone|teal|violet|white|yellow|zinc)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/\d+)?\b/g,
  },
  {
    name: 'arbitrary utility value',
    expression: /\b(?:!?[\w-]+:)*[a-z][\w-]*-\[[^\]\r\n]+\]/gi,
  },
  {
    name: 'arbitrary utility property',
    expression: /\[(?:[a-z-]+):[^\]\r\n]+\]/gi,
  },
  {
    name: 'named CSS color',
    expression: /\b(?:background(?:-color)?|backgroundColor|border(?:-(?:block|inline|top|right|bottom|left))?(?:-color)?|borderColor|color|fill|outline-color|outlineColor|stroke)\s*:\s*(?:['"])?(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blue|brown|coral|crimson|cyan|fuchsia|gold|gray|green|indigo|ivory|khaki|lavender|lime|magenta|maroon|navy|olive|orange|orchid|pink|plum|purple|red|rebeccapurple|silver|tan|teal|tomato|turquoise|violet|white|yellow)\b/gi,
  },
];

function collectUiSourceFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectUiSourceFiles(path);
    }
    return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function lineAndColumn(source, index) {
  const prefix = source.slice(0, index);
  const line = prefix.split('\n').length;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line, column: index - lineStart + 1 };
}

const files = [...sourceFiles, ...collectUiSourceFiles(uiDirectory)];
const findings = [];

for (const path of files) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    continue;
  }

  const source = readFileSync(path, 'utf8');
  for (const { name, expression } of patterns) {
    expression.lastIndex = 0;
    for (const match of source.matchAll(expression)) {
      const { line, column } = lineAndColumn(source, match.index);
      findings.push({
        path: relative(frontendRoot, path),
        line,
        column,
        name,
        value: match[0],
      });
    }
  }
}

const uiFileCount = files.length - sourceFiles.length;
console.log(`UI literal guard: ${findings.length} candidate(s) across ${files.length} file(s).`);
console.log(`Targets: src/App.jsx, src/App.css, src/components/ui/ (${uiFileCount} source file(s)).`);

for (const finding of findings) {
  console.error(`${finding.path}:${finding.line}:${finding.column} ${finding.name}: ${finding.value}`);
}

if (findings.length > 0) {
  process.exitCode = 1;
}
