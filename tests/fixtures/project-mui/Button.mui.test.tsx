import { Button } from '@mui/material';

test('disabled MUI button is verified', async () => {
  const onClick = vi.fn();
  render(<Button disabled onClick={onClick}>Save</Button>);
  await user.click(screen.getByRole('button'));
  expect(onClick).not.toHaveBeenCalled();
});
