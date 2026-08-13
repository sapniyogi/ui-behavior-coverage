import { SaveButton } from './SaveButton';

it('touches disabled behavior', async () => {
  const onSave = vi.fn();
  render(<SaveButton disabled onSave={onSave} />);
  await user.click(screen.getByRole('button'));
});
