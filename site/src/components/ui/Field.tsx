import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  suffix?: string;
  wrapperClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>;

const labelClasses = "block text-[10px] uppercase tracking-[0.14em] text-zinc-500";

// Underline-only inputs: no box, just a baseline that lights up on focus —
// the field reads like a prompt rather than a form control.
const inputClasses =
  "mt-0.5 border-0 border-b border-border bg-transparent px-0 py-1 text-sm tabular-nums text-foreground transition-colors placeholder:text-zinc-600 hover:border-zinc-500 focus:border-accent focus:shadow-none";

export function Field({ label, suffix, wrapperClassName, className, ...rest }: FieldProps) {
  return (
    <label className={`block ${wrapperClassName ?? ""}`}>
      <span className={labelClasses}>
        {label}
        {suffix && <span className="normal-case tracking-normal text-zinc-600"> {suffix}</span>}
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
      <span className={labelClasses}>{label}</span>
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
