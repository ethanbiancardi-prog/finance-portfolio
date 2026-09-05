import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  suffix?: string;
  wrapperClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>;

const inputClasses =
  "mt-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black transition-colors dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

export function Field({ label, suffix, wrapperClassName, className, ...rest }: FieldProps) {
  return (
    <label className={`block ${wrapperClassName ?? ""}`}>
      <span className="block text-xs text-zinc-500">
        {label}
        {suffix ? ` (${suffix})` : ""}
      </span>
      <input className={`${inputClasses} ${className ?? "w-full"}`} {...rest} />
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  options: { value: string; label: string }[];
  wrapperClassName?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function SelectField({
  label,
  options,
  wrapperClassName,
  className,
  ...rest
}: SelectFieldProps) {
  return (
    <label className={`block ${wrapperClassName ?? ""}`}>
      <span className="block text-xs text-zinc-500">{label}</span>
      <select className={`${inputClasses} ${className ?? ""}`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
