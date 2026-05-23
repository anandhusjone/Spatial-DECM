function createCalculatorError(message, token = null) {
  const error = new Error(message);
  error.name = "CalculatorExpressionError";
  error.line = token?.line || 1;
  error.column = token?.column || 1;
  error.details = `${message} (line ${error.line}, column ${error.column})`;
  return error;
}

function tokenizeCalculatorExpression(expression) {
  const source = String(expression ?? "");
  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const pushToken = (type, value, tokenLine = line, tokenColumn = column) => {
    tokens.push({ type, value, line: tokenLine, column: tokenColumn });
  };

  const advance = (count = 1) => {
    for (let step = 0; step < count; step += 1) {
      const char = source[index];
      index += 1;
      if (char === "\n") { line += 1; column = 1; } else { column += 1; }
    }
  };

  const readWhile = (predicate) => {
    let value = "";
    while (index < source.length && predicate(source[index])) {
      value += source[index];
      advance();
    }
    return value;
  };

  const KEYWORDS = new Set(["CASE", "WHEN", "THEN", "ELSE", "END", "AND", "OR", "NOT", "IS", "NULL", "TRUE", "FALSE"]);
  const DOLLAR_VARS = new Set(["area", "length", "x", "y"]);

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    // Whitespace
    if (/\s/.test(char)) { advance(); continue; }

    // Line comments (--)
    if (char === "-" && next === "-") {
      while (index < source.length && source[index] !== "\n") advance();
      continue;
    }

    // Single-quoted strings
    if (char === "'") {
      const startLine = line, startCol = column;
      advance();
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") { value += "'"; advance(2); continue; }
        if (source[index] === "'") { advance(); closed = true; break; }
        value += source[index]; advance();
      }
      if (!closed) {
        const lastWord = value.split(/\s+/).pop();
        throw createCalculatorError(
          `Missing closing quote after '${lastWord || value}'`,
          { line: startLine, column: startCol }
        );
      }
      pushToken("STRING", value, startLine, startCol);
      continue;
    }

    // Double-quoted field references
    if (char === '"') {
      const startLine = line, startCol = column;
      advance();
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') { value += '"'; advance(2); continue; }
        if (source[index] === '"') { advance(); closed = true; break; }
        value += source[index]; advance();
      }
      if (!closed) {
        throw createCalculatorError(`Missing closing quote in field name "${value}"`, { line: startLine, column: startCol });
      }
      pushToken("FIELD", value, startLine, startCol);
      continue;
    }

    // $variable (geometry vars: $area $length $x $y)
    if (char === "$") {
      const startLine = line, startCol = column;
      advance();
      const name = readWhile((c) => /[A-Za-z0-9_]/.test(c));
      if (!name) throw createCalculatorError("Expected a variable name after '$'", { line: startLine, column: startCol });
      if (!DOLLAR_VARS.has(name.toLowerCase())) {
        throw createCalculatorError(`'$${name}' is not a recognised variable — use $area, $length, $x, or $y`, { line: startLine, column: startCol });
      }
      pushToken("DOLLAR_VAR", `$${name.toLowerCase()}`, startLine, startCol);
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(next))) {
      const startLine = line, startCol = column;
      let value = readWhile((c) => /[0-9]/.test(c));
      if (source[index] === ".") { value += "."; advance(); value += readWhile((c) => /[0-9]/.test(c)); }
      pushToken("NUMBER", Number.parseFloat(value), startLine, startCol);
      continue;
    }

    // Identifiers and keywords
    if (/[A-Za-z_]/.test(char)) {
      const startLine = line, startCol = column;
      const value = readWhile((c) => /[A-Za-z0-9_]/.test(c));
      const upper = value.toUpperCase();
      pushToken(KEYWORDS.has(upper) ? "KEYWORD" : "IDENT", KEYWORDS.has(upper) ? upper : value, startLine, startCol);
      continue;
    }

    // Two-character operators
    const twoChar = `${char}${next}`;
    if (["||", "!=", "<=", ">=", ":=", "==", "<>"].includes(twoChar)) {
      pushToken("OP", twoChar); advance(2); continue;
    }

    // Single-character operators and punctuation
    if ("+-*/%^=<>(),".includes(char)) {
      pushToken(char === "(" || char === ")" || char === "," ? "PUNC" : "OP", char);
      advance(); continue;
    }

    throw createCalculatorError(`Unexpected character '${char}'`, { line, column });
  }

  pushToken("EOF", "", line, column);
  return tokens;
}

window.tokenizeCalculatorExpression = tokenizeCalculatorExpression;
window.createCalculatorError = createCalculatorError;
