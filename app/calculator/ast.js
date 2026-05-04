/*
Stable AST node shapes used by the calculator parser/evaluator:

- { type: "literal", value }
- { type: "field", name }
- { type: "variable", name }
- { type: "identifier", name }
- { type: "unary", operator, argument }
- { type: "binary", operator, left, right }
- { type: "call", callee, args: [{ name, value }] }
- { type: "case", branches: [{ when, then }], elseBranch }
*/

window.CalculatorAst = {
  literal: (value) => ({ type: "literal", value }),
  field: (name) => ({ type: "field", name }),
  variable: (name) => ({ type: "variable", name }),
  identifier: (name) => ({ type: "identifier", name }),
  unary: (operator, argument) => ({ type: "unary", operator, argument }),
  binary: (operator, left, right) => ({ type: "binary", operator, left, right }),
  call: (callee, args) => ({ type: "call", callee, args }),
  caseExpression: (branches, elseBranch = null) => ({
    type: "case",
    branches,
    elseBranch,
  }),
};
