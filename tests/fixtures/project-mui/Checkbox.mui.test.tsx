import Checkbox from '@mui/material/Checkbox';

test('unchecked MUI checkbox transition is weak', async () => {
  const onChange = vi.fn();
  render(<Checkbox checked={false} onChange={onChange} />);
  await user.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenCalled();
});
