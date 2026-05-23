function parseCalculatorExpression(expression) {
  const tokens = tokenizeCalculatorExpression(expression);
  let index = 0;

  const peek = (offset = 0) => tokens[index + offset] || tokens[tokens.length - 1];
  const consume = () => { const t = peek(); index += 1; return t; };
  const matchKeyword = (v) => peek().type === "KEYWORD" && peek().value === v;
  const matchOperator = (...vals) => peek().type === "OP" && vals.includes(peek().value);
  const matchPunctuation = (v) => peek().type === "PUNC" && peek().value === v;

  const expectKeyword = (v) => {
    if (!matchKeyword(v)) throw createCalculatorError(`Expected '${v}' here`, peek());
    return consume();
  };
  const expectPunctuation = (v) => {
    if (!matchPunctuation(v)) throw createCalculatorError(`Expected '${v}' here`, peek());
    return consume();
  };

  // Top-level entry
  const parseExpressionNode = () => {
    if (matchKeyword("CASE")) return parseCaseExpression();
    return parseOrExpression();
  };

  const parseCaseExpression = () => {
    expectKeyword("CASE");
    const branches = [];
    while (matchKeyword("WHEN")) {
      consume();
      const when = parseExpressionNode();
      expectKeyword("THEN");
      const then = parseExpressionNode();
      branches.push({ when, then });
    }
    let elseBranch = null;
    if (matchKeyword("ELSE")) { consume(); elseBranch = parseExpressionNode(); }
    expectKeyword("END");
    return CalculatorAst.caseExpression(branches, elseBranch);
  };

  const parseOrExpression = () => {
    let node = parseAndExpression();
    while (matchKeyword("OR")) { consume(); node = CalculatorAst.binary("or", node, parseAndExpression()); }
    return node;
  };

  const parseAndExpression = () => {
    let node = parseComparisonExpression();
    while (matchKeyword("AND")) { consume(); node = CalculatorAst.binary("and", node, parseComparisonExpression()); }
    return node;
  };

  const parseComparisonExpression = () => {
    let node = parseConcatExpression();
    while (true) {
      if (matchKeyword("IS")) {
        consume();
        const negate = matchKeyword("NOT");
        if (negate) consume();
        expectKeyword("NULL");
        node = CalculatorAst.call("is_null", [{ name: null, value: node }]);
        if (negate) node = CalculatorAst.unary("not", node);
        continue;
      }
      if (!matchOperator("=", "==", "!=", "<>", "<", "<=", ">", ">=")) break;
      const op = consume().value;
      node = CalculatorAst.binary(op, node, parseConcatExpression());
    }
    return node;
  };

  const parseConcatExpression = () => {
    let node = parseAdditiveExpression();
    while (matchOperator("||")) { consume(); node = CalculatorAst.binary("||", node, parseAdditiveExpression()); }
    return node;
  };

  const parseAdditiveExpression = () => {
    let node = parseMultiplicativeExpression();
    while (matchOperator("+", "-")) { const op = consume().value; node = CalculatorAst.binary(op, node, parseMultiplicativeExpression()); }
    return node;
  };

  const parseMultiplicativeExpression = () => {
    let node = parsePowerExpression();
    while (matchOperator("*", "/", "%")) { const op = consume().value; node = CalculatorAst.binary(op, node, parsePowerExpression()); }
    return node;
  };

  const parsePowerExpression = () => {
    let node = parseUnaryExpression();
    while (matchOperator("^")) { consume(); node = CalculatorAst.binary("^", node, parseUnaryExpression()); }
    return node;
  };

  const parseUnaryExpression = () => {
    if (matchOperator("+", "-")) { const op = consume().value; return CalculatorAst.unary(op, parseUnaryExpression()); }
    if (matchKeyword("NOT")) { consume(); return CalculatorAst.unary("not", parseUnaryExpression()); }
    return parsePrimaryExpression();
  };

  const parseCallArguments = () => {
    const args = [];
    expectPunctuation("(");
    while (!matchPunctuation(")")) {
      // Named argument: ident :=
      if (peek().type === "IDENT" && peek(1).type === "OP" && peek(1).value === ":=") {
        const name = consume().value; consume();
        args.push({ name, value: parseExpressionNode() });
      } else {
        args.push({ name: null, value: parseExpressionNode() });
      }
      if (!matchPunctuation(",")) break;
      consume();
    }
    expectPunctuation(")");
    return args;
  };

  const parsePrimaryExpression = () => {
    const token = peek();

    if (token.type === "NUMBER") { consume(); return CalculatorAst.literal(token.value); }
    if (token.type === "STRING") { consume(); return CalculatorAst.literal(token.value); }
    if (token.type === "FIELD")  { consume(); return CalculatorAst.field(token.value); }

    // $area $length $x $y
    if (token.type === "DOLLAR_VAR") { consume(); return CalculatorAst.variable(token.value); }

    if (token.type === "KEYWORD" && ["NULL", "TRUE", "FALSE"].includes(token.value)) {
      consume();
      return CalculatorAst.literal(token.value === "NULL" ? null : token.value === "TRUE");
    }

    if (token.type === "IDENT") {
      consume();
      if (matchPunctuation("(")) return CalculatorAst.call(token.value, parseCallArguments());
      return CalculatorAst.identifier(token.value);
    }

    if (matchPunctuation("(")) {
      consume();
      const node = parseExpressionNode();
      expectPunctuation(")");
      return node;
    }

    // Friendly error for unexpected tokens
    if (token.type === "EOF") throw createCalculatorError("Expression ended unexpectedly — is it complete?", token);
    throw createCalculatorError(`Unexpected '${token.value}' here`, token);
  };

  const ast = parseExpressionNode();
  if (peek().type !== "EOF") {
    throw createCalculatorError(`Unexpected '${peek().value}' — check for extra operators or unclosed parentheses`, peek());
  }
  return ast;
}

window.parseCalculatorExpression = parseCalculatorExpression;
