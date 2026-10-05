import { Field } from "./ui";

export interface DateOnlyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}
/** Date without a time (yyyy-mm-dd). Native keyboards have no date picker in this build, so it stays a text field. */
export default function DateOnlyField({ label, value, onChange }: DateOnlyFieldProps) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      keyboardType="numbers-and-punctuation"
      autoCorrect={false}
    />
  );
}
