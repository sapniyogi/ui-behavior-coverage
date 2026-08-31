# Two-minute UBC demo

This demo uses the repository's real `SaveButton` fixtures to show the difference between **reaching** a UI behavior and **verifying** it.

## 1. Clone and build

```bash
git clone https://github.com/sapniyogi/ui-behavior-coverage.git
cd ui-behavior-coverage
npm ci
npm run build
```

## 2. Analyze the weak test

```bash
node dist/src/cli/index.js analyze \
  --component tests/fixtures/SaveButton.tsx \
  --test tests/fixtures/SaveButton.weak.test.tsx
```

The component renders a native button whose `disabled` state suppresses its `onSave` callback. The weak test renders the button disabled and clicks it, but never asserts that `onSave` stayed uncalled.

UBC therefore classifies the supported behavior as **EXERCISED**, not VERIFIED.

For this single-contract fixture, the analyzer regression suite establishes:

```text
Behavior Reach:        100%
Behavior Verification:   0%
Verification Gap:       100 percentage points
```

See the source:

- [SaveButton.tsx](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/tests/fixtures/SaveButton.tsx)
- [SaveButton.weak.test.tsx](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/tests/fixtures/SaveButton.weak.test.tsx)

## 3. Analyze the verified test

```bash
node dist/src/cli/index.js analyze \
  --component tests/fixtures/SaveButton.tsx \
  --test tests/fixtures/SaveButton.verified.test.tsx
```

The verified test performs the same interaction and then adds the behavioral oracle:

```tsx
expect(onSave).not.toHaveBeenCalled();
```

UBC can now classify the disabled-click suppression behavior as **VERIFIED**. The regression suite establishes 100% Behavior Verification for this single-contract case.

See [SaveButton.verified.test.tsx](https://github.com/sapniyogi/ui-behavior-coverage/blob/main/tests/fixtures/SaveButton.verified.test.tsx).

## Why this is different from ordinary code coverage

Both tests can execute the same component path. UBC asks a narrower test-quality question: did the test contain explicit evidence for the supported UI behavior it exercised?

```text
Weak test
  render disabled button
  click button
  no suppression oracle
        ↓
     EXERCISED

Verified test
  render disabled button
  click button
  assert callback was suppressed
        ↓
      VERIFIED
```

## Try it on your project

Install the stable package:

```bash
npm install -D ui-behavior-coverage
```

Then scan the repository:

```bash
npx ui-behavior-coverage scan .
```

Or analyze a single component/test pair:

```bash
npx ui-behavior-coverage analyze \
  --component src/YourComponent.tsx \
  --test src/YourComponent.test.tsx
```

UBC is intentionally conservative. Unsupported or ambiguous behavior is left unclassified rather than guessed.
