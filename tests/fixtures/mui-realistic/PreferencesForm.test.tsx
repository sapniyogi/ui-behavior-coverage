import { PreferencesForm } from './PreferencesForm';

test('enables notifications and verifies the next checked state', async () => {
  const onChange = vi.fn();
  render(<PreferencesForm enabled={false} onEnabledChange={onChange} />);
  await user.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ target: expect.objectContaining({ checked: true }) }),
  );
});

test('disables notifications but only checks that a callback fired', async () => {
  const onChange = vi.fn();
  render(<PreferencesForm enabled onEnabledChange={onChange} />);
  await user.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenCalled();
});

test('selects the email radio option', async () => {
  const onChange = vi.fn();
  render(<PreferencesForm emailSelected={false} onEmailSelect={onChange} />);
  await user.click(screen.getByRole('radio'));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ target: expect.objectContaining({ checked: true }) }),
  );
});

test('edits the display name', async () => {
  const onChange = vi.fn();
  render(<PreferencesForm displayName="" onDisplayNameChange={onChange} />);
  await user.type(screen.getByRole('textbox'), 'Ada');
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ target: expect.objectContaining({ value: 'Ada' }) }),
  );
});

test('changes region using native select semantics', async () => {
  const onChange = vi.fn();
  render(<PreferencesForm region="us" onRegionChange={onChange} />);
  await user.selectOptions(screen.getByRole('combobox'), 'eu');
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ target: expect.objectContaining({ value: 'eu' }) }),
  );
});
