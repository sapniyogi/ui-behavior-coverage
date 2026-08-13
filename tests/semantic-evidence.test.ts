import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { analyzeRenderStateTests } from '../src/project/analyze-render-state-tests';
import { extractMaterialUiSemanticBehaviors } from '../src/project/material-ui-semantic-state';

function extract(source: string) {
  const file = ts.createSourceFile('Component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return extractMaterialUiSemanticBehaviors(file);
}

test('verifies a public TextField value with toHaveValue', () => {
  const behaviors = extract(`
    import TextField from '@mui/material/TextField';
    export function NameField({ value }: any) {
      return <TextField value={value} /;
    }
  `);
  const value = behaviors.find((behavior) => behavior.kind === 'mui-text-field-value-render-state');
  assert.ok(value);
  const [result] = analyzeRenderStateTests(`
    test('shows value', () => {
      render(<NameField value="Ada" /);
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('Ada');
    });
  `, [value]);
  assert.equal(result.status, 'verified');
});

test('reports a value verification gap when the value is rendered but not asserted', () => {
  const behaviors = extract(`
    import TextField from '@mui/material/TextField';
    export function NameField({ value }: any) {
      return <TextField value={value} /;
    }
  `);
  const value = behaviors.find((behavior) => behavior.kind === 'mui-text-field-value-render-state');
  assert.ok(value);
  const [result] = analyzeRenderStateTests(`
    test('renders value', () => {
      render(<NameField value="Ada" />);
      screen.getByRole('textbox');
    });
  `, [value]);
  assert.equal(result.status, 'exercised');
  assert.match(result.suggestedAssertion ?? '', /toHaveValue/);
});

test('verifies Dialog visibility from a public open prop', () => {
  const behaviors = extract(`
    import Dialog from '@mui/material/Dialog';
    export function ConfirmDialog({ open }: any) {
      return <Dialog open={open}>Confirm</Dialog>;
    }
  `);
  const visible = behaviors.find((behavior) =>
    behavior.kind === 'mui-dialog-visibility-render-state' &&
    behavior.condition.value === true
  );
  assert.ok(visible);
  const [result] = analyzeRenderStateTests(`
    test('opens dialog', () => {
      render(<ConfirmDialog open />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeVisible();
    });
  `, [visible]);
  assert.equal(result.status, 'verified');
});

test('verifies explicit accessibility, expansion, and selection state', () => {
  const behaviors = extract(`
    import IconButton from '@mui/material/IconButton';
    export function StateButton({ expanded, selected }: any) {
      return (
        <IconButton aria-expanded={expanded} aria-selected={selected}>
          State
        </IconButton>
      );
    }
  `);
  const expanded = behaviors.find((behavior) =>
    behavior.kind === 'mui-accessibility-attribute-render-state' &&
    behavior.expectation.type === 'element-attribute-state' &&
    behavior.expectation.attribute === 'aria-expanded'
  );
  const selected = behaviors.find((behavior) =>
    behavior.kind === 'mui-accessibility-attribute-render-state' &&
    behavior.expectation.type === 'element-attribute-state' &&
    behavior.expectation.attribute === 'aria-selected'
  );
  assert.ok(expanded);
  assert.ok(selected);
  const results = analyzeRenderStateTests(`
    test('publishes semantic state', () => {
      render(<StateButton expanded selected={false} />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(button).toHaveAttribute('aria-selected', 'false');
    });
  `, [expanded, selected]);
  assert.deepEqual(results.map((result) => result.status), ['verified', 'verified']);
});

test('verifies React Admin-style form-controlled checked state from defaultValues', () => {
  const behaviors = extract(`
    import Switch from '@mui/material/Switch';
    import { useThemeProps } from '@mui/material/styles';
    export function BooleanInput(props: any) {
      const { source } = useThemeProps({ props, name: 'BooleanB'¦ëIÈJNÂˆÛÛœİÈšY[HH\ÙR[œ]
ßHÛİ\˜ÙHJNÂˆ™]\›ˆİÚ]ÚÚXÚÙY^Ğ›ÛÛX[ŠšY[˜[YJ_HÎÂˆBˆ
NÂˆÛÛœİÚXÚÙYH™Z]š[ÜœË™š[™

™Z]š[ÜŠHOˆ™Z]š[Ü‹šÚ[™OOH	Û]ZKY›Ü›KXÛÛ›ÛYXÚXÚÙY\™[™\‹\İ]IÊNÂˆ\ÜÙ\›ÚÊÚXÚÙY
NÂˆÛÛœİÜ™\İ[HH[˜[^™T™[™\”İ]U\İÊˆÛÛœİY˜][›ÜÈHÈÛİ\˜ÙNˆ	Ú\ÔX›\ÚY	ÈNÂˆ\İ
	İ\Ù\È›Ü›HY˜][	Ë

HOˆÂˆ™[™\ŠˆÚ[\Q›Ü›HY˜][˜[Y\Ï^ŞÈ\ÔX›\ÚYˆYH_O‚ˆ›ÛÛX[‰éºÒ²ââæFVfVÇE&÷7Òóà¢Âõ6–×ÆTf÷&Óà¢“°¢6öç7B–çWBÒ67&VVâævWD'”Æ&VÅFW‡B‚uV&Æ—6†VBr’2…DÔÄ"znµ±•µ•¹Ğì(€€€€€•áÁ•Ğ¡¥¹ÁÕĞ¹¡•­•¤¹Ñ½	”¡ÑÉÕ”¤ì(€€€ô¤ì(€€°m¡•­•‘t¤ì(€…ÍÍ•ÉĞ¹•ÅÕ…°¡É•ÍÕ±Ğ¹ÍÑ…ÑÕÌ°€Ù•É¥™¥•œ¤ì)ô¤ì()Ñ•ÍĞ Ù•É¥™¥•Ì™½É´µ½¹ÑÉ½±±•Q•áÑ¥•±Ù…±Õ”Ñ¡É½Õ „Ù…±Õ•Ì½¹Ñ…¥¹•Èœ°€ ¤€ôøì(€½¹ÍĞ‰•¡…Ù¥½ÉÌ€ô•áÑÉ…Ğ¡€(€€€¥µÁ½ÉĞQ•áÑ¥•±™É½´€µÕ¤½µ…Ñ•É¥…°½Q•áÑ¥•±œì(€€€•áÁ½ÉĞ™Õ¹Ñ¥½¸½¹ÑÉ½±±•‘9…µ”¡ì¹…µ”ôè…¹ä¤ì(€€€€€½¹ÍĞì™¥•±ô€ôÕÍ•½¹ÑÉ½±±•È¡ì¹…µ”ô¤ì(€€€€€É•ÑÕÉ¸€ñQ•áÑ¥•±Ù…±Õ”õí™¥•±¹Ù…±Õ•ô€¼øì(€€€ô(€€¤ì(€½¹ÍĞÙ…±Õ”€ô‰•¡…Ù¥½ÉÌ¹™¥¹ ¡‰•¡…Ù¥½È¤€ôø‰•¡…Ù¥½È¹­¥¹€ôôô€µÕ¤µ™½É´µ½¹ÑÉ½±±•µÙ…±Õ”µÉ•¹‘•ÈµÍÑ…Ñ”œ¤ì(€…ÍÍ•ÉĞ¹½¬¡Ù…±Õ”¤ì(€½¹ÍĞmÉ•ÍÕ±Ñt€ô…¹…±åé•I•¹‘•ÉMÑ…Ñ•Q•ÍÑÌ¡€(€€€Ñ•ÍĞ ÕÍ•Ì½¹ÑÉ½±±•Ù…±Õ”œ°€ ¤€ôøì(€€€€€É•¹‘•È (€€€€€€€€ñ½ÉµAÉ½Ù¥‘•ÈÙ…±Õ•ÌõíìÑ¥Ñ±”è€‘„œõôø(€€€€€€€€€€ñ½¹ÑÉ½±±•‘9…µ”¹…µ”ô‰Ñ¥Ñ±”ˆ€¼ø(€€€€€€€€ğ½½ÉµAÉ½Ù¥‘•Èø(€€€€€€¤ì(€€€€€½¹ÍĞ¥¹ÁÕĞ€ôÍÉ••¸¹•Ñ	åI½±” Ñ•áÑ‰½àœ¤ì(€€€€€•áÁ•Ğ¡¥¹ÁÕĞ¹Ù…±Õ”¤¹Ñ½	” ‘„œ¤ì(€€€ô¤ì(€€°mÙ…±Õ•t¤ì(€…ÍÍ•ÉĞ¹•ÅÕ…°¡É•ÍÕ±Ğ¹ÍÑ…ÑÕÌ°€Ù•É¥™¥•œ¤ì)ô¤ì(