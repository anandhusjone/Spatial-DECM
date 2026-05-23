function normalizeCalculatorEquality(l, r) {
  const ln = Number(l), rn = Number(r);
  return Number.isFinite(ln) && Number.isFinite(rn) ? [ln, rn] : [l, r];
}

function evaluateCalculatorBinary(operator, leftNode, rightNode, context) {
  if (operator === "and") {
    return toCalculatorBoolean(evaluateCalculatorAst(leftNode, context)) &&
           toCalculatorBoolean(evaluateCalculatorAst(rightNode, context));
  }
  if (operator === "or") {
    return toCalculatorBoolean(evaluateCalculatorAst(leftNode, context)) ||
           toCalculatorBoolean(evaluateCalculatorAst(rightNode, context));
  }

  const l = evaluateCalculatorAst(leftNode, context);
  const r = evaluateCalculatorAst(rightNode, context);

  if (operator === "||") return `${l ?? ""}${r ?? ""}`;
  if (operator === "+")  return Number(l) + Number(r);
  if (operator === "-")  return Number(l) - Number(r);
  if (operator === "*")  return Number(l) * Number(r);
  if (operator === "/")  return Number(l) / Number(r);
  if (operator === "%")  return Number(l) % Number(r);
  if (operator === "^")  return Number(l) ** Number(r);

  const [nl, nr] = normalizeCalculatorEquality(l, r);
  if (operator === "=" || operator === "==") return nl === nr;
  if (operator === "!=" || operator === "<>") return nl !== nr;
  if (operator === "<")  return nl < nr;
  if (operator === "<=") return nl <= nr;
  if (operator === ">")  return nl > nr;
  if (operator === ">=") return nl >= nr;

  throw new Error(`Unsupported operator '${operator}'`);
}

function evaluateCalculatorAst(node, context) {
  if (!node) return null;

  if (node.type === "literal") return node.value;

  if (node.type === "field") return context.fields?.[node.name] ?? null;

  if (node.type === "identifier") {
    const lower = node.name.toLowerCase();
    if (lower === "null")  return null;
    if (lower === "true")  return true;
    if (lower === "false") return false;
    // Bare identifiers resolve to field values
    return context.fields?.[node.name] ?? null;
  }

  // $area $length $x $y — resolved from geoVars
  if (node.type === "variable") {
    return context.geoVars?.[node.name] ?? null;
  }

  if (node.type === "unary") {
    const value = evaluateCalculatorAst(node.argument, context);
    if (node.operator === "-") return -Number(value);
    if (node.operator === "+") return  Number(value);
    if (node.operator === "not") return !toCalculatorBoolean(value);
    throw new Error(`Unsupported unary operator '${node.operator}'`);
  }

  if (node.type === "binary") {
    return evaluateCalculatorBinary(node.operator, node.left, node.right, context);
  }

  if (node.type === "case") {
    for (const branch of node.branches) {
      if (toCalculatorBoolean(evaluateCalculatorAst(branch.when, context))) {
        return evaluateCalculatorAst(branch.then, context);
      }
    }
    return node.elseBranch ? evaluateCalculatorAst(node.elseBranch, context) : null;
  }

  if (node.type === "call") {
    const catalog = createCalculatorFunctionCatalog();
    const name = String(node.callee || "").toLowerCase();
    const fn = catalog[name];
    if (!fn) {
      // Fuzzy match suggestion
      const suggestion = findClosestCalculatorFunction(name, Object.keys(catalog));
      const hint = suggestion ? ` — did you mean ${suggestion}()?` : "";
      throw createCalculatorError(`Unknown function '${node.callee}'${hint}`, null);
    }
    return fn(node, context);
  }

  throw new Error(`Unsupported node type '${node.type}'`);
}

// Levenshtein-based fuzzy match for function name typos
function findClosestCalculatorFunction(name, candidates) {
  const lev = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[a.length][b.length];
  };
  let best = null, bestDist = Infinity;
  for (const c of candidates) {
    const d = lev(name, c);
    if (d < bestDist && d <= 3) { bestDist = d; best = c; }
  }
  return best;
}

function evaluateCalculatorEngine(expression, contextOptions = {}) {
  const ast = parseCalculatorExpression(expression);
  const context = buildCalculatorContext(contextOptions.feature, contextOptions);
  return evaluateCalculatorAst(ast, context);
}

window.evaluateCalculatorAst = evaluateCalculatorAst;
window.evaluateCalculatorEngine = evaluateCalculatorEngine;
