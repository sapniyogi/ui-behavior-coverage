it('does not save when disabled', async () => {
  const onSave = vi.fn();

  render(<SaveButton disabled onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(onSave).not.toHaveBeenCalled();
});
