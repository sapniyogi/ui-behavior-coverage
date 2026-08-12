# Behavioral coverage model

For each inferred behavior `b`, the analyzer assigns exactly one state.

- `discovered`: `b` exists in the component contract space but is not exercised by a matching test.
- `exercised`: a matching test establishes the required condition and performs the relevant interaction, but no sufficient assertion follows it.
- `verified`: the behavior is exercised and an assertion verifies the expected observable effect after the interaction.

## Metrics

```text
Behavior Reach = exercised-or-verified behaviors / discovered behaviors

Behavior Verification = verified behaviors / discovered behaviors

Verification Gap = Behavior Reach - Behavior Verification
```

A large Verification Gap is the core signal: tests are reaching behavior without proving its outcome.

These metrics are intentionally different from statement, branch, function, mutation, and accessibility coverage.
