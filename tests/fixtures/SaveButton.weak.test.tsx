it('handles a disabled button', async () => {
  const onSave = vi.fn();

  render(<SaveButton disabled onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: 'Save' }));
});
