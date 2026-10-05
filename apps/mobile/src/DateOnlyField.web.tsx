import { Text, View } from "react-native";
import { colors, s, webFontFamily } from "./ui";

interface DateOnlyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}
/** Date without a time (yyyy-mm-dd), using the browser's own date picker. */
export default function DateOnlyField({ label, value, onChange }: DateOnlyFieldProps) {
  return (
    <View style={s.field}>
      <Text style={[s.small, { fontWeight: "600", color: colors.text }]}>{label}</Text>
      <input
        aria-label={label}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          border: `1px solid ${colors.line}`,
          borderRadius: 16,
          padding: "12px 16px",
          fontSize: 16,
          color: colors.text,
          background: "#FFF",
          fontFamily: webFontFamily,
          width: "100%",
          boxSizing: "border-box",
          minHeight: 48,
        }}
      />
    </View>
  );
}
