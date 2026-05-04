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
      if (char === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
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

  const keywords = new Set(["CASE", "WHEN", "THEN", "ELSE", "END", "AND", "OR", "NOT", "IS", "NULL", "TRUE", "FALSE"]);

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (/\s/.test(char)) {
      advance();
      continue;
    }

    if (char === "-" && next === "-") {
      while (index < source.length && source[index] !== "\n") {
        advance();
      }
      continue;
    }

    if (char === "/" && next === "*") {
      const startToken = { line, column };
      advance(2);
      let closed = false;
      while (index < source.length) {
        if (source[index] === "*" && source[index + 1] === "/") {
          advance(2);
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        throw createCalculatorError("Unterminated block comment.", startToken);
      }
      continue;
    }

    if (char === "'") {
      const startLine = line;
      const startColumn = column;
      advance();
      let value = "";
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") {
          value += "'";
          advance(2);
          continue;
        }
        if (source[index] === "'") {
          advance();
          pushToken("STRING", value, startLine, startColumn);
          value = null;
          break;
        }
        value += source[index];
        advance();
      }
      if (value !== null) {
        throw createCalculatorError("Unterminated string literal.", { line: startLine, column: startColumn });
      }
      continue;
    }

    if (char === '"') {
      const startLine = line;
      const startColumn = column;
      advance();
      let value = "";
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') {
          value += '"';
          advance(2);
          continue;
        }
        if (source[index] === '"') {
          advance();
          pushToken("FIELD", value, startLine, startColumn);
          value = null;
          break;
        }
        value += source[index];
        advance();
      }
      if (value !== null) {
        throw createCalculatorError("Unterminated field reference.", { line: startLine, column: startColumn });
      }
      continue;
    }

    if (char === "[") {
      const startLine = line;
      const startColumn = column;
      advance();
      let value = "";
      while (index < source.length && source[index] !== "]") {
        value += source[index];
        advance();
      }
      if (source[index] !== "]") {
        throw createCalculatorError("Unterminated bracket field reference.", { line: startLine, column: startColumn });
      }
      advance();
      pushToken("FIELD", value.trim(), startLine, startColumn);
      continue;
    }

    if (char === "@") {
      const startLine = line;
      const startColumn = column;
      advance();
      const name = readWhile((current) => /[A-Za-z0-9_]/.test(current));
      if (!name) {
        throw createCalculatorError("Expected variable name after @.", { line: startLine, column: startColumn });
      }
      pushToken("VARIABLE", `@${name}`, startLine, startColumn);
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(next))) {
      const startLine = line;
      const startColumn = column;
      let value = readWhile((current) => /[0-9]/.test(current));
      if (source[index] === ".") {
        value += ".";
        advance();
        value += readWhile((current) => /[0-9]/.test(current));
      }
      pushToken("NUMBER", Number.parseFloat(value), startLine, startColumn);
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const startLine = line;
      const startColumn = column;
      const value = readWhile((current) => /[A-Za-z0-9_]/.test(current));
      const upperValue = value.toUpperCase();
      pushToken(keywords.has(upperValue) ? "KEYWORD" : "IDENT", keywords.has(upperValue) ? upperValue : value, startLine, startColumn);
      continue;
    }

    const twoCharOperator = `${char}${next}`;
    if (["||", "!=", "<=", ">=", ":=", "==", "<>"].includes(twoCharOperator)) {
      pushToken("OP", twoCharOperator);
      advance(2);
      continue;
    }

    if ("+-*/%^=<>(),".includes(char)) {
      pushToken(char === "(" || char === ")" || char === "," ? "PUNC" : "OP", char);
      advance();
      continue;
    }

    throw createCalculatorError(`Unexpected character "${char}".`, { line, column });
  }

  pushToken("EOF", "", line, column);
  return tokens;
}

window.tokenizeCalculatorExpression = tokenizeCalculatorExpression;
window.createCalculatorError = createCalculatorError;
