function parseCalculatorExpression(expression) {
  const tokens = tokenizeCalculatorExpression(expression);
  let index = 0;

  const peek = (offset = 0) => tokens[index + offset] || tokens[tokens.length - 1];
  const consume = () => {
    const token = peek();
    index += 1;
    return token;
  };
  const matchKeyword = (value) => peek().type === "KEYWORD" && peek().value === value;
  const matchOperator = (...values) => peek().type === "OP" && values.includes(peek().value);
  const matchPunctuation = (value) => peek().type === "PUNC" && peek().value === value;

  const expectKeyword = (value) => {
    if (!matchKeyword(value)) {
      throw createCalculatorError(`Expected keyword ${value}.`, peek());
    }
    return consume();
  };

  const expectPunctuation = (value) => {
    if (!matchPunctuation(value)) {
      throw createCalculatorError(`Expected "${value}".`, peek());
    }
    return consume();
  };

  const parseExpressionNode = () => {
    if (matchKeyword("CASE")) {
      return parseCaseExpression();
    }
    return parseOrExpression();
  };

  const parseCaseExpression = () => {
    expectKeyword("CASE");
    const branches = [];
    while (matchKeyword("WHEN")) {
      consume();
      const whenNode = parseExpressionNode();
      expectKeyword("THEN");
      const thenNode = parseExpressionNode();
      branches.push({ when: whenNode, then: thenNode });
    }
    let elseBranch = null;
    if (matchKeyword("ELSE")) {
      consume();
      elseBranch = parseExpressionNode();
    }
    expectKeyword("END");
    return CalculatorAst.caseExpression(branches, elseBranch);
  };

  const parseOrExpression = () => {
    let node = parseAndExpression();
    while (matchKeyword("OR")) {
      const operator = consume().value.toLowerCase();
      node = CalculatorAst.binary(operator, node, parseAndExpression());
    }
    return node;
  };

  const parseAndExpression = () => {
    let node = parseComparisonExpression();
    while (matchKeyword("AND")) {
      const operator = consume().value.toLowerCase();
      node = CalculatorAst.binary(operator, node, parseComparisonExpression());
    }
    return node;
  };

  const parseComparisonExpression = () => {
    let node = parseConcatExpression();
    while (true) {
      if (matchKeyword("IS")) {
        consume();
        const negate = matchKeyword("NOT");
        if (negate) {
          consume();
        }
        expectKeyword("NULL");
        node = CalculatorAst.call("is_null", [{ name: null, value: node }]);
        if (negate) {
          node = CalculatorAst.unary("not", node);
        }
        continue;
      }

      if (!matchOperator("=", "==", "!=", "<>", "<", "<=", ">", ">=")) {
        break;
      }

      const operator = consume().value;
      node = CalculatorAst.binary(operator, node, parseConcatExpression());
    }
    return node;
  };

  const parseConcatExpression = () => {
    let node = parseAdditiveExpression();
    while (matchOperator("||")) {
      const operator = consume().value;
      node = CalculatorAst.binary(operator, node, parseAdditiveExpression());
    }
    return node;
  };

  const parseAdditiveExpression = () => {
    let node = parseMultiplicativeExpression();
    while (matchOperator("+", "-")) {
      const operator = consume().value;
      node = CalculatorAst.binary(operator, node, parseMultiplicativeExpression());
    }
    return node;
  };

  const parseMultiplicativeExpression = () => {
    let node = parsePowerExpression();
    while (matchOperator("*", "/", "%")) {
      const operator = consume().value;
      node = CalculatorAst.binary(operator, node, parsePowerExpression());
    }
    return node;
  };

  const parsePowerExpression = () => {
    let node = parseUnaryExpression();
    while (matchOperator("^")) {
      const operator = consume().value;
      node = CalculatorAst.binary(operator, node, parseUnaryExpression());
    }
    return node;
  };

  const parseUnaryExpression = () => {
    if (matchOperator("+", "-")) {
      const operator = consume().value;
      return CalculatorAst.unary(operator, parseUnaryExpression());
    }
    if (matchKeyword("NOT")) {
      const operator = consume().value.toLowerCase();
      return CalculatorAst.unary(operator, parseUnaryExpression());
    }
    return parsePrimaryExpression();
  };

  const parseCallArguments = () => {
    const args = [];
    expectPunctuation("(");
    while (!matchPunctuation(")")) {
      const current = peek();
      if (current.type === "IDENT" && peek(1).type === "OP" && peek(1).value === ":=") {
        const name = consume().value;
        consume();
        args.push({ name, value: parseExpressionNode() });
      } else {
        args.push({ name: null, value: parseExpressionNode() });
      }

      if (!matchPunctuation(",")) {
        break;
      }
      consume();
    }
    expectPunctuation(")");
    return args;
  };

  const parsePrimaryExpression = () => {
    const token = peek();

    if (token.type === "NUMBER") {
      consume();
      return CalculatorAst.literal(token.value);
    }

    if (token.type === "STRING") {
      consume();
      return CalculatorAst.literal(token.value);
    }

    if (token.type === "FIELD") {
      consume();
      return CalculatorAst.field(token.value);
    }

    if (token.type === "VARIABLE") {
      consume();
      return CalculatorAst.variable(token.value);
    }

    if (token.type === "KEYWORD" && ["NULL", "TRUE", "FALSE"].includes(token.value)) {
      consume();
      return CalculatorAst.literal(
        token.value === "NULL" ? null : token.value === "TRUE"
      );
    }

    if (token.type === "IDENT") {
      consume();
      if (matchPunctuation("(")) {
        return CalculatorAst.call(token.value, parseCallArguments());
      }
      return CalculatorAst.identifier(token.value);
    }

    if (matchPunctuation("(")) {
      consume();
      const node = parseExpressionNode();
      expectPunctuation(")");
      return node;
    }

    throw createCalculatorError("Unexpected token in expression.", token);
  };

  const ast = parseExpressionNode();
  if (peek().type !== "EOF") {
    throw createCalculatorError("Unexpected trailing tokens.", peek());
  }
  return ast;
}

window.parseCalculatorExpression = parseCalculatorExpression;
