"""Safe calculator tool used by the complex chat path."""

from __future__ import annotations

import ast
import operator

OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


def _eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.UnaryOp) and type(node.op) in OPS:
        return OPS[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        return OPS[type(node.op)](_eval(node.left), _eval(node.right))
    raise ValueError("Unsupported expression")


async def calculate(expression: str, description: str | None = None) -> dict:
    tree = ast.parse(expression, mode="eval")
    result = _eval(tree.body)
    return {
        "result": result,
        "formatted": f"{result:,.2f}" if isinstance(result, float) else f"{result:,}",
        "expression": expression,
        "description": description,
    }
