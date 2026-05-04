function normalizeCalculatorEquality(leftValue, rightValue) {
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return [leftNumber, rightNumber];
  }
  return [leftValue, rightValue];
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

  const leftValue = evaluateCalculatorAst(leftNode, context);
  const rightValue = evaluateCalculatorAst(rightNode, context);

  if (operator === "||") {
    return `${leftValue ?? ""}${rightValue ?? ""}`;
  }

  if (operator === "+") {
    return Number(leftValue) + Number(rightValue);
  }
  if (operator === "-") {
    return Number(leftValue) - Number(rightValue);
  }
  if (operator === "*") {
    return Number(leftValue) * Number(rightValue);
  }
  if (operator === "/") {
    return Number(leftValue) / Number(rightValue);
  }
  if (operator === "%") {
    return Number(leftValue) % Number(rightValue);
  }
  if (operator === "^") {
    return Number(leftValue) ** Number(rightValue);
  }

  const [normalizedLeft, normalizedRight] = normalizeCalculatorEquality(leftValue, rightValue);
  if (operator === "=" || operator === "==") {
    return normalizedLeft === normalizedRight;
  }
  if (operator === "!=" || operator === "<>") {
    return normalizedLeft !== normalizedRight;
  }
  if (operator === "<") {
    return normalizedLeft < normalizedRight;
  }
  if (operator === "<=") {
    return normalizedLeft <= normalizedRight;
  }
  if (operator === ">") {
    return normalizedLeft > normalizedRight;
  }
  if (operator === ">=") {
    return normalizedLeft >= normalizedRight;
  }

  throw new Error(`Unsupported binary operator ${operator}.`);
}

function evaluateCalculatorAst(node, context) {
  if (!node) {
    return null;
  }

  if (node.type === "literal") {
    return node.value;
  }

  if (node.type === "field") {
    return context.fields?.[node.name] ?? null;
  }

  if (node.type === "identifier") {
    const lowerName = node.name.toLowerCase();
    if (lowerName === "null") {
      return null;
    }
    if (lowerName === "true") {
      return true;
    }
    if (lowerName === "false") {
      return false;
    }
    return context.fields?.[node.name] ?? null;
  }

  if (node.type === "variable") {
    return context.variables?.[node.name] ?? null;
  }

  if (node.type === "unary") {
    const value = evaluateCalculatorAst(node.argument, context);
    if (node.operator === "-") {
      return -Number(value);
    }
    if (node.operator === "+") {
      return Number(value);
    }
    if (node.operator === "not") {
      return !toCalculatorBoolean(value);
    }
    throw new Error(`Unsupported unary operator ${node.operator}.`);
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
    const functionCatalog = createCalculatorFunctionCatalog();
    const functionName = String(node.callee || "").toLowerCase();
    const fn = functionCatalog[functionName];
    if (!fn) {
      throw new Error(`Unknown calculator function "${node.callee}".`);
    }
    return fn(node, context);
  }

  throw new Error(`Unsupported AST node type "${node.type}".`);
}

function evaluateCalculatorEngine(expression, contextOptions = {}) {
  const ast = parseCalculatorExpression(expression);
  const context = buildCalculatorContext(contextOptions.feature, contextOptions);
  return evaluateCalculatorAst(ast, context);
}

window.evaluateCalculatorAst = evaluateCalculatorAst;
window.evaluateCalculatorEngine = evaluateCalculatorEngine;
