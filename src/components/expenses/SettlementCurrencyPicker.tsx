import { CurrencyPicker } from "./CurrencyPicker";

interface Props {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
  cachedCurrencyCodes?: string[];
}

export function SettlementCurrencyPicker({ value, onChange, disabled, cachedCurrencyCodes }: Props) {
  return (
    <CurrencyPicker
      value={value}
      onChange={onChange}
      disabled={disabled}
      cachedCurrencyCodes={cachedCurrencyCodes}
      variant="settlement"
    />
  );
}
