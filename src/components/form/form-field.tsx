"use client";

import { CircleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import {
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  type UseFormSetError,
  useController,
} from "react-hook-form";

import { cn } from "@/lib/utils";

/**
 * Form helpers for React Hook Form + Zod.
 *
 *   const form = useForm<Values>({ resolver: zodResolver(schema) });
 *   <FormField control={form.control} name="email" label="E-mail">
 *     {(field) => <Input type="email" autoComplete="email" {...field} />}
 *   </FormField>
 *
 * `field` carries value/onChange/onBlur/ref plus id, aria-invalid and
 * aria-describedby, so the label, hint and error are wired for assistive tech.
 */

/** Props to spread onto the control. */
export type FieldControlProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = ControllerRenderProps<TValues, TName> & {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};

type FieldShellProps = {
  /** id of the control the label points at. */
  htmlFor: string;
  label: ReactNode;
  /** Appends "(optional)" to the label. */
  optional?: boolean;
  /** Helper text under the label. */
  description?: ReactNode;
  /** Error text; when set it is announced and shown in red. */
  error?: string | null;
  descriptionId?: string;
  errorId?: string;
  className?: string;
  children: ReactNode;
};

/** Label + hint + control + error layout, usable without React Hook Form. */
export function FieldShell({
  htmlFor,
  label,
  optional = false,
  description,
  error,
  descriptionId,
  errorId,
  className,
  children,
}: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-sm leading-none font-semibold text-foreground">
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>
        ) : null}
      </label>
      {description ? (
        <p id={descriptionId} className="-mt-0.5 text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/** Inline field error. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-foreground">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

type FormFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = {
  control: Control<TValues>;
  name: TName;
  label: ReactNode;
  optional?: boolean;
  description?: ReactNode;
  className?: string;
  /** Render the control; spread `field` onto it. */
  children: (field: FieldControlProps<TValues, TName>) => ReactNode;
};

/** A React Hook Form field with label, hint and validation message wired up. */
export function FormField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
>({ control, name, label, optional, description, className, children }: FormFieldProps<TValues, TName>) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message ?? null;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldShell
      htmlFor={id}
      label={label}
      optional={optional}
      description={description}
      error={error}
      descriptionId={descriptionId}
      errorId={errorId}
      className={className}
    >
      {children({
        ...field,
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}
    </FieldShell>
  );
}

/** Form-level message (server failure, rate limit, success note). */
export function FormMessage({
  tone = "danger",
  title,
  children,
  className,
}: {
  tone?: "danger" | "success" | "warning" | "info";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    danger: "border-destructive/25 bg-danger-surface text-danger-foreground",
    success: "border-success/30 bg-success-surface text-success-foreground",
    warning: "border-warning/40 bg-warning-surface text-warning-foreground",
    info: "border-blue/25 bg-info-surface text-info-foreground",
  } as const;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && "mt-0.5")}>{children}</div> : null}
    </div>
  );
}

/**
 * Copies field errors from an API `validation_failed` response onto the form.
 * Accepts the shapes the envelope's `error.details` may take: a record of
 * field -> message | message[], or { fieldErrors: {...} } (Zod flatten).
 * Unknown fields are ignored. Returns how many errors were applied.
 */
export function applyApiFieldErrors<TValues extends FieldValues>(
  setError: UseFormSetError<TValues>,
  details: unknown,
  knownFields: readonly FieldPath<TValues>[],
): number {
  if (!details || typeof details !== "object") return 0;
  const container = details as Record<string, unknown>;
  const source =
    container.fieldErrors && typeof container.fieldErrors === "object"
      ? (container.fieldErrors as Record<string, unknown>)
      : container;
  let applied = 0;
  for (const name of knownFields) {
    const raw = source[name];
    const message = Array.isArray(raw) ? raw[0] : raw;
    if (typeof message === "string" && message) {
      setError(name, { type: "server", message });
      applied += 1;
    }
  }
  return applied;
}
