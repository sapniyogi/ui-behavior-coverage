import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeProject } from '../src/project/analyze-project';

function withProject(
  files: Record<string, string>,
  callback: (root: string) => void,
): void {
  const root = mkdtempSync(join(tmpdir(), 'uibc-audit-regression-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(root, 'src', name), source);
    }
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function allResults(root: string) {
  return analyzeProject(root).reports.flatMap((report) => report.results);
}

test('R1: assertion on an always-disabled sibling cannot verify the primary disabled contract', () => {
  withProject({
    'Sibling.tsx': `
      import Button from '@mui/material/Button';
      export function Sibling({ lockPrimary }: { lockPrimary: boolean }) {
        return <>
          <Button disabled={lockPrimary}>Primary</Button>
          <Button disabled>AlwaysOff</Button>
        </>;
      }
    `,
    'Sibling.test.tsx': `
      import { Sibling } from './Sibling';
      test('wrong sibling', () => {
        render(<Sibling lockPrimary />);
        expect(screen.getByRole('button', { name: 'AlwaysOff' })).toBeDisabled();
      });
    `,
  }, (root) => {
    const result = allResults(root).find((item) =>
      item.behavior.condition.prop === 'lockPrimary' &&
      item.behavior.expectation.type === 'element-boolean-state'
    );
    assert.equal(result?.status, 'exercised');
  });
});

test('R2: assertion on an always-checked sibling cannot verify the primary checked contract', () => {
  withProject({
    'TwoBoxes.tsx': `
      import Checkbox from '@mui/material/Checkbox';
      export function TwoBoxes({ primaryOn }: { primaryOn: boolean }) {
        return <>
          <Checkbox inputProps={{ 'aria-label': 'primary' }} checked={primaryOn} />
          <Checkbox inputProps={{ 'aria-label': 'always' }} checked />
        </>;
      }
    `,
    'TwoBoxes.test.tsx': `
      import { TwoBoxes } from './TwoBoxes';
      test('wrong checkbox', () => {
        render(<TwoBoxes primaryOn />);
        expect(screen.getByRole('checkbox', { name: 'always' })).toBeChecked();
      });
    `,
  }, (root) => {
    const result = allResults(root).find((item) =>
      item.behavior.condition.prop === 'primaryOn' &&
      item.behavior.condition.value === true &&
      item.behavior.expectation.type === 'element-boolean-state'
    );
    assert.equal(result?.status, 'exercised');
  });
});

test('R3: callback suppression requires interaction with the element wired to that callback', () => {
  withProject({
    'Suppress.tsx': `
      import Button from '@mui/material/Button';
      export function Suppress({ locked, onGo }: { locked: boolean; onGo: () => void }) {
        return <>
          <Button onClick={onGo} disabled={locked}>Go</Button>
          <Button>Inert</Button>
        </>;
      }
    `,
    'Suppress.test.tsx': `
      import { Suppress } from './Suppress';
      test('wrong interaction', () => {
        const onGo = vi.fn();
        render(<Suppress locked onGo={onGo} />);
        fireEvent.click(screen.getByRole('button', { name: 'Inert' }));
        expect(onGo).not.toHaveBeenCalled();
      });
    `,
  }, (root) => {
    const result = allResults(root).find((item) =>
      item.behavior.condition.prop === 'locked' &&
      item.behavior.expectation.type === 'callback-not-called'
    );
    assert.equal(result?.status, 'exercised');
  });
});

test('R4: a matching component in an untaken wrapper branch is not render evidence', () => {
  withProject({
    'Panel.tsx': `
      import Button from '@mui/material/Button';
      export function Panel({ locked }: { locked: boolean }) {
        return <Button disabled={locked}>Panel</Button>;
      }
    `,
    'Panel.test.tsx': `
      import { Panel } from './Panel';
      function Harness({ useLocked = false }: { useLocked?: boolean }) {
        return useLocked ? <Panel locked={true} /> : <Panel locked={false} />;
      }
      test('untaken branch', () => {
        render(<Harness />);
        expect(screen.getByRole('button')).toBeDisabled();
      });
    `,
  }, (root) => {
    const result = allResults(root).find((item) =>
      item.behavior.condition.prop === 'locked' &&
      item.behavior.condition.value === true &&
      item.behavior.expectation.type === 'element-boolean-state'
    );
    assert.equal(result?.status, 'discovered');
  });
});

test('R5: a component inside an uninvoked render-prop callback is not render evidence', () => {
  withProject({
    'Panel2.tsx': `
      import Button from '@mui/material/Button';
      export function Panel2({ locked }: { locked: boolean }) {
        return <Button disabled={locked}>Panel</Button>;
      }
    `,
    'Panel2.test.tsx': `
      import { Panel2 } from './Panel2';
      const Never = ({ children }: { children: () => JSX.Element }) => null;
      function Harness() {
        return <Never>{() => <Panel2 locked={true} />}</Never>;
      }
      test('uninvoked callback', () => {
        render(<Harness />);
        expect(screen.getByRole('button')).toBeDisabled();
      });
    `,
  }, (root) => {
    const result = allResults(root).find((item) =>
      item.behavior.condition.prop === 'locked' &&
      item.behavior.condition.value === true &&
      item.behavior.expectation.type === 'element-boolean-state'
    );
    assert.equal(result?.status, 'discovered');
  });
});

test('R6: two-level test-local wrappers remain outside the conservative reach bound', () => {
  withProject({
    'Panel3.tsx': `
      import Button from '@mui/material/Button';
      export function Panel3({ locked }: { locked: boolean }) {
        return <Button disabled={locked}>Panel</Button>;
      }
    `,
    'Panel3.test.tsx': `
      import { Panel3 } from './Panel3';
      const Inner = () => <Panel3 locked={true} />;
      const Outer = () => <Inner />;
      test('two wrappers', () => {
        render(<Outer />);
        expect(screen.getByRole('button')).toBeDisabled();
      });
    `,
  }, (root) => {
    const result = allResults(root).find((item) =>
      item.behavior.condition.prop === 'locked' &&
      item.behavior.condition.value === true &&
      item.behavior.expectation.type === 'element-boolean-state'
    );
    assert.equal(result?.status, 'discovered');
  });
});

test('S6: disabled and loading rules sharing one source prop count as one observable contract', () => {
  withProject({
    'LoadMoreButton.tsx': `
      import Button from '@mui/material/Button';
      export function LoadMoreButton({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
        return <Button disabled={loading} loading={loading} onClick={onLoad}>Load more</Button>;
      }
    `,
    'LoadMoreButton.test.tsx': `
      import { LoadMoreButton } from './LoadMoreButton';
      test('loading', () => {
        const onLoad = vi.fn();
        render(<LoadMoreButton loading onLoad={onLoad} />);
        const button = screen.getByRole('button', { name: 'Load more' });
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(onLoad).not.toHaveBeenCalled();
      });
    `,
  }, (root) => {
    const results = allResults(root).filter((item) => item.behavior.condition.prop === 'loading');
    const renderDisabled = results.filter((item) => item.behavior.expectation.type === 'element-boolean-state');
    const suppression = results.filter((item) => item.behavior.expectation.type === 'callback-not-called');
    assert.equal(renderDisabled.length, 1);
    assert.equal(suppression.length, 1);
    assert.equal(renderDisabled[0]?.status, 'verified');
    assert.equal(suppression[0]?.status, 'verified');
  });
});
