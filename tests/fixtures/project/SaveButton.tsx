export interface SaveButtonProps {
  disabled?: boolean;
  onSave(): void;
}

export function SaveButton({ disabled, onSave }: SaveButtonProps) {
  return (
    <button disabled={disabled} onClick={onSave}>
      Save
    </button>
  );
}
