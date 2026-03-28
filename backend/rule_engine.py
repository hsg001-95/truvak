from dataclasses import dataclass, field
from typing import List, Optional
import json

@dataclass
class Rule:
    rule_name: str
    condition_field: str        # "score", "order_value", "is_cod"
    condition_operator: str     # "lt", "gt", "lte", "gte", "eq"
    condition_value: float
    action: str                 # "block_cod", "warn", "approve", "flag_review"
    cod_only: Optional[bool] = None
    is_active: bool = True

    def evaluate(self, score: float, order: dict) -> bool:
        """Returns True if this rule's condition is met."""
        if self.cod_only is True and int(order.get("is_cod", 0)) != 1:
            return False
        if self.cod_only is False and int(order.get("is_cod", 0)) != 0:
            return False

        field_map = {
            "score":       score,
            "order_value": order.get("order_value", 0),
            "is_cod":      int(order.get("is_cod", 0)),
        }
        actual = field_map.get(self.condition_field)
        if actual is None:
            return False

        ops = {
            "lt":  actual <  self.condition_value,
            "gt":  actual >  self.condition_value,
            "lte": actual <= self.condition_value,
            "gte": actual >= self.condition_value,
            "eq":  actual == self.condition_value,
        }
        return ops.get(self.condition_operator, False)


class RuleEngine:
    def __init__(self):
        self.rules: List[Rule] = []

    def add_rule(self, rule: Rule):
        self.rules.append(rule)

    def load_defaults(self, merchant_id: str = "default"):
        """
        Seed with sensible default rules for a new merchant.
        In production these are loaded from DB per merchant.
        """
        self.rules = [
            Rule(
                rule_name="Block COD - High Risk",
                condition_field="score",
                condition_operator="lt",
                condition_value=35.0,
                cod_only=True,
                action="block_cod"
            ),
            Rule(
                rule_name="Warn - Medium Risk COD",
                condition_field="score",
                condition_operator="lt",
                condition_value=52.0,
                cod_only=True,
                action="warn"
            ),
            Rule(
                rule_name="Flag Large COD Orders",
                condition_field="order_value",
                condition_operator="gt",
                condition_value=3000.0,
                cod_only=True,
                action="flag_review"
            ),
        ]

    def evaluate(self, score: float, order: dict) -> dict:
        """
        Run all active rules against score + order.
        Returns the highest priority action that fired.
        Priority: block_cod > flag_review > warn > approve
        """
        priority = {
            "block_cod":   4,
            "flag_review": 3,
            "warn":        2,
            "approve":     1,
        }

        fired_rules = []
        for rule in self.rules:
            if rule.is_active and rule.evaluate(score, order):
                fired_rules.append(rule.rule_name)

        # Determine highest priority action from fired rules
        best_action = "approve"
        best_priority = 0
        for rule in self.rules:
            if rule.is_active and rule.evaluate(score, order):
                p = priority.get(rule.action, 0)
                if p > best_priority:
                    best_priority = p
                    best_action = rule.action

        return {
            "recommended_action": best_action,
            "fired_rules": fired_rules,
            "total_rules_checked": len([r for r in self.rules if r.is_active]),
        }

    def to_dict(self) -> List[dict]:
        return [
            {
                "rule_name":          r.rule_name,
                "condition_field":    r.condition_field,
                "condition_operator": r.condition_operator,
                "condition_value":    r.condition_value,
                "action":             r.action,
                "cod_only":           r.cod_only,
                "is_active":          r.is_active,
            }
            for r in self.rules
        ]


if __name__ == "__main__":
    engine = RuleEngine()
    engine.load_defaults()

    test_cases = [
        {"label": "High risk COD (score=28)",      "score": 28,  "order": {"order_value": 1500, "is_cod": 1}},
        {"label": "Medium risk COD (score=52)",    "score": 52,  "order": {"order_value": 800,  "is_cod": 1}},
        {"label": "Low risk prepaid (score=85)",   "score": 85,  "order": {"order_value": 500,  "is_cod": 0}},
        {"label": "Large COD order (score=72)",    "score": 72,  "order": {"order_value": 3500, "is_cod": 1}},
        {"label": "Borderline block (score=39)",   "score": 39,  "order": {"order_value": 999,  "is_cod": 1}},
    ]

    print("=== Rule Engine Test ===\n")
    for tc in test_cases:
        result = engine.evaluate(tc["score"], tc["order"])
        print(f"  {tc['label']}")
        print(f"  Action : {result['recommended_action'].upper()}")
        print(f"  Fired  : {result['fired_rules']}")
        print()
