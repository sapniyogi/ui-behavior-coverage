import { SaveButton } from './SaveButton';

it('verifies disabled behavior', async () => {
  const onSave = vi.fn();
  render(<SaveButton disabled onSave={onSave} />);
  await user.click(screen.getByRole('button'));
  expect(onSave).not.toHaveBeenCalled();
});
