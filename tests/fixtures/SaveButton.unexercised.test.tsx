it('renders disabled', () => {
  const onSave = vi.fn();
  render(<SaveButton disabled onSave={onSave} />);
});
