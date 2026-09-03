/** Generated artifact: Python training must use the runtime's tool schemas. */
import { writeFileSync, readFileSync } from 'node:fs';
import ts from 'typescript';
// Read literal declarations without importing live tool handlers or park datasets.
const source = ts.createSourceFile('tools.ts', readFileSync(new URL('../env/tools.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function literal(node: ts.Expression): any {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(x => literal(x as ts.Expression));
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
    if (!ts.isPropertyAssignment(p)) throw new Error('Contract must use literals');
    return [p.name.getText(source).replace(/^['"]|['"]$/g, ''), literal(p.initializer)];
  }));
  throw new Error('Unsupported contract expression: ' + node.getText(source));
}
let registry: any[] = [];
for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
  for (const declaration of statement.declarationList.declarations) if (declaration.name.getText(source) === 'TOOLS') {
    registry = (declaration.initializer as ts.ArrayLiteralExpression).elements.map(element => {
      const fields: Record<string, any> = {};
      for (const p of (element as ts.ObjectLiteralExpression).properties) if (ts.isPropertyAssignment(p)) {
        const name = p.name.getText(source);
        if (['name', 'description', 'input_schema'].includes(name)) fields[name] = literal(p.initializer);
      }
      fields.input_schema.additionalProperties = false;
      return fields;
    });
  }
}
if (registry.length !== 9) throw new Error('Review changed tool count before exporting');
const path = new URL('./tool-contract.json', import.meta.url);
const data = JSON.stringify({version: 'tool-contract-v2', tools: registry}, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== data) throw new Error('Tool schema drift: run npx tsx rl/train/export_contract.ts');
} else writeFileSync(path, data);
