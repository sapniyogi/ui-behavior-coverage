import { Box, Radio, Select, Switch, TextField } from '@mui/material';

export function PreferencesForm({
  enabled,
  switchDisabled,
  onEnabledChange,
  emailSelected,
  radioDisabled,
  onEmailSelect,
  displayName,
  onDisplayNameChange,
  region,
  onRegionChange,
}) {
  return (
    <Box data-testid="preferences-card" sx={{ borderRadius: 2, p: 2 }}>
      <Switch
        checked={enabled}
        disabled={switchDisabled}
        onChange={onEnabledChange}
        slotProps={{ input: { 'aria-label': 'Notifications' } }}
      />

      <Radio
        checked={emailSelected}
        disabled={radioDisabled}
        onChange={onEmailSelect}
        value="email"
        slotProps={{ input: { 'aria-label': 'Email' } }}
      />

      <TextField
        label="Display name"
        value={displayName}
        onChange={onDisplayNameChange}
      />

      <Select
        native
        aria-label="Region"
        value={region}
        onChange={onRegionChange}
      >
        <option value="us">United States</option>
        <option value="eu">Europe</option>
      </Select>
    </Box>
  );
}
