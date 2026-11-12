"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { useController, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";

import { applyApiFieldErrors, FieldError, FormField, FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/features/account/components/native-select";
import { apiFetch, isApiError } from "@/lib/api/client";
import { routes } from "@/lib/navigation";

import { parseLocalities } from "../cards";
import { DEAL_BREAKER_CODES } from "../compatibility";
import {
  DEAL_BREAKER_LABELS,
  FURNISHING_LABELS,
  FURNISHINGS,
  GENDER_LABELS,
  GENDERS,
  OCCUPATION_LABELS,
  OCCUPATIONS,
  roommateProfileSchema,
  type City,
  type LifestyleQuestion,
  type RoommateProfileFormValues,
  type RoommateProfileInput,
} from "../schemas";
import { ChoicePill } from "./choice-pill";

type Values = RoommateProfileFormValues;
type FormControl = Control<Values, unknown, RoommateProfileInput>;

const FIELDS = [
  "headline",
  "about",
  "age",
  "gender",
  "occupation",
  "occupation_detail",
  "city",
  "preferred_localities",
  "budget_min",
  "budget_max",
  "move_in_date",
  "age_min",
  "age_max",
  "place.title",
] as const;

const EMPTY_PLACE: NonNullable<Values["place"]> = {
  title: "",
  description: "",
  locality: "",
  rent_share: "",
  deposit_share: "",
  vacancies: 1,
  available_from: "",
  furnishing: "",
};

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-5 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-7">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LocalitiesField({ control }: { control: FormControl }) {
  const id = useId();
  const { field, fieldState } = useController({ control, name: "preferred_localities" });
  const [text, setText] = useState(() => (field.value ?? []).join(", "));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm leading-none font-semibold">
        Preferred localities <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>
      </label>
      <p className="-mt-0.5 text-sm text-muted-foreground">Separate with commas, e.g. Koramangala, HSR Layout.</p>
      <Input
        id={id}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          field.onChange(parseLocalities(event.target.value));
        }}
        onBlur={() => {
          setText(parseLocalities(text).join(", "));
          field.onBlur();
        }}
        aria-invalid={Boolean(fieldState.error)}
      />
      {fieldState.error?.message ? <FieldError>{fieldState.error.message}</FieldError> : null}
    </div>
  );
}

function MultiChoice<T extends string>({
  control,
  name,
  legend,
  options,
  labels,
}: {
  control: FormControl;
  name: "preferred_genders" | "occupation_prefs" | "deal_breakers";
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
}) {
  const { field } = useController({ control, name });
  const selected = (field.value ?? []) as T[];
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <ChoicePill
            key={option}
            type="checkbox"
            name={name}
            value={option}
            checked={selected.includes(option)}
            onChange={() =>
              field.onChange(
                selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option],
              )
            }
          >
            {labels[option]}
          </ChoicePill>
        ))}
      </div>
    </fieldset>
  );
}

function Questionnaire({ control, questions }: { control: FormControl; questions: LifestyleQuestion[] }) {
  const { field } = useController({ control, name: "answers" });
  const answers = field.value ?? {};
  const answered = questions.filter((q) => answers[q.code] !== undefined).length;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {answered} of {questions.length} answered. More answers make your match score more accurate.
      </p>
      {questions.map((question) => (
        <fieldset key={question.code}>
          <legend className="mb-3 text-[0.9375rem] font-semibold">{question.prompt}</legend>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <ChoicePill
                key={option.value}
                type="radio"
                name={`answer-${question.code}`}
                value={String(option.value)}
                checked={answers[question.code] === option.value}
                onChange={() => field.onChange({ ...answers, [question.code]: option.value })}
              >
                {option.label}
              </ChoicePill>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function StatusChoice({ control }: { control: FormControl }) {
  const { field } = useController({ control, name: "status" });
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold">Show my profile to others</legend>
      <div className="flex flex-wrap gap-2">
        <ChoicePill type="radio" name="status" value="active" checked={field.value === "active"} onChange={() => field.onChange("active")}>
          Live: show me in the deck
        </ChoicePill>
        <ChoicePill type="radio" name="status" value="paused" checked={field.value === "paused"} onChange={() => field.onChange("paused")}>
          Paused: hide me for now
        </ChoicePill>
      </div>
    </fieldset>
  );
}

function PlaceToggle({ control }: { control: FormControl }) {
  const id = useId();
  const { field: hasPlace } = useController({ control, name: "has_place" });
  const { field: place } = useController({ control, name: "place" });
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold">
        I already have a place and need a roommate
      </label>
      <Switch
        id={id}
        checked={hasPlace.value === true}
        onCheckedChange={(checked: boolean) => {
          hasPlace.onChange(checked);
          place.onChange(checked ? (place.value ?? EMPTY_PLACE) : null);
        }}
      />
    </div>
  );
}

export function RoommateProfileForm({
  initial,
  exists,
  questions,
  cities,
}: {
  initial: Values;
  exists: boolean;
  questions: LifestyleQuestion[];
  cities: City[];
}) {
  const router = useRouter();
  const form = useForm<Values, unknown, RoommateProfileInput>({
    resolver: zodResolver(roommateProfileSchema),
    defaultValues: initial,
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const { isSubmitting } = form.formState;
  const hasPlace = useWatch({ control: form.control, name: "has_place" });
  const occupation = useWatch({ control: form.control, name: "occupation" });

  async function onSubmit() {
    setFailure(null);
    const values = form.getValues();
    try {
      const result = await apiFetch<{ status: string }>("/roommates/profile", { method: "PUT", body: values });
      form.reset(values);
      if (result.status === "active") {
        toast.success(exists ? "Profile saved" : "You're live! Start swiping.");
        router.push(routes.roommates);
      } else {
        toast.success("Profile saved");
      }
      router.refresh();
    } catch (error) {
      if (isApiError(error)) {
        applyApiFieldErrors(form.setError, error.details, FIELDS);
        setFailure(error.message);
      } else {
        setFailure("That did not save. Check your connection and try again.");
      }
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, () => setFailure("Some details need attention. Check the highlighted fields."))}
      noValidate
      className="space-y-6"
    >
      <Section title="The basics" description="This is what people see first on your card.">
        <FormField control={form.control} name="headline" label="Headline" description="One line about you, e.g. “Calm designer who cooks on Sundays”.">
          {(field) => <Input maxLength={80} {...field} />}
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="age" label="Age">
            {(field) => <Input type="number" inputMode="numeric" min={18} max={99} {...field} value={field.value ?? ""} />}
          </FormField>
          <FormField control={form.control} name="gender" label="Gender">
            {(field) => (
              <NativeSelect {...field}>
                <option value="" disabled>
                  Choose
                </option>
                {GENDERS.map((value) => (
                  <option key={value} value={value}>
                    {GENDER_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField control={form.control} name="occupation" label="You are a" optional>
            {(field) => (
              <NativeSelect {...field}>
                <option value="">Not set</option>
                {OCCUPATIONS.map((value) => (
                  <option key={value} value={value}>
                    {OCCUPATION_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            control={form.control}
            name="occupation_detail"
            label={occupation === "student" ? "College" : occupation === "working_professional" ? "Company or field" : "What you do"}
            optional
          >
            {(field) => <Input maxLength={120} {...field} />}
          </FormField>
        </div>
        <FormField control={form.control} name="about" label="About you" optional description="Up to 1,000 characters.">
          {(field) => <Textarea rows={4} maxLength={1000} {...field} />}
        </FormField>
      </Section>

      <Section title="Where and when">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="city" label="City">
            {(field) => (
              <NativeSelect {...field}>
                <option value="" disabled>
                  Choose a city
                </option>
                {cities.map((city) => (
                  <option key={city.slug} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField control={form.control} name="move_in_date" label="Move-in date" optional>
            {(field) => <Input type="date" {...field} />}
          </FormField>
          <FormField control={form.control} name="budget_min" label="Budget from (₹ / month)">
            {(field) => <Input type="number" inputMode="numeric" min={0} step={500} {...field} value={field.value ?? ""} />}
          </FormField>
          <FormField control={form.control} name="budget_max" label="Budget up to (₹ / month)">
            {(field) => <Input type="number" inputMode="numeric" min={0} step={500} {...field} value={field.value ?? ""} />}
          </FormField>
        </div>
        <LocalitiesField control={form.control} />
      </Section>

      <Section title="Your place" description="Already renting? Tell people about the room you are sharing.">
        <PlaceToggle control={form.control} />
        {hasPlace ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField control={form.control} name="place.title" label="Title" className="sm:col-span-2">
              {(field) => <Input maxLength={100} placeholder="Sunny room in a 2BHK" {...field} />}
            </FormField>
            <FormField control={form.control} name="place.locality" label="Locality" optional>
              {(field) => <Input maxLength={80} {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="place.furnishing" label="Furnishing" optional>
              {(field) => (
                <NativeSelect {...field} value={field.value ?? ""}>
                  <option value="">Not set</option>
                  {FURNISHINGS.map((value) => (
                    <option key={value} value={value}>
                      {FURNISHING_LABELS[value]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField control={form.control} name="place.rent_share" label="Their rent share (₹ / month)" optional>
              {(field) => <Input type="number" inputMode="numeric" min={0} {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="place.deposit_share" label="Their deposit share (₹)" optional>
              {(field) => <Input type="number" inputMode="numeric" min={0} {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="place.vacancies" label="Spots open" optional>
              {(field) => <Input type="number" inputMode="numeric" min={1} max={10} {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="place.available_from" label="Available from" optional>
              {(field) => <Input type="date" {...field} value={field.value ?? ""} />}
            </FormField>
            <FormField control={form.control} name="place.description" label="Describe the place" optional className="sm:col-span-2">
              {(field) => <Textarea rows={3} maxLength={1000} {...field} value={field.value ?? ""} />}
            </FormField>
          </div>
        ) : null}
      </Section>

      <Section title="Who you'd like to live with" description="Gender and age are hard filters in both directions; leave them empty for no preference.">
        <MultiChoice control={form.control} name="preferred_genders" legend="Gender" options={GENDERS} labels={GENDER_LABELS} />
        <div className="grid grid-cols-2 gap-5">
          <FormField control={form.control} name="age_min" label="Age from" optional>
            {(field) => <Input type="number" inputMode="numeric" min={18} max={99} {...field} value={field.value ?? ""} />}
          </FormField>
          <FormField control={form.control} name="age_max" label="Age up to" optional>
            {(field) => <Input type="number" inputMode="numeric" min={18} max={99} {...field} value={field.value ?? ""} />}
          </FormField>
        </div>
        <MultiChoice
          control={form.control}
          name="occupation_prefs"
          legend="Ideally a… (not a filter)"
          options={OCCUPATIONS}
          labels={OCCUPATION_LABELS}
        />
      </Section>

      <Section title="Your lifestyle" description="Answer honestly. This is how we estimate compatibility.">
        <Questionnaire control={form.control} questions={questions} />
      </Section>

      <Section title="Deal-breakers" description="People who answered these will not appear in your deck, and you will not appear in theirs.">
        <MultiChoice
          control={form.control}
          name="deal_breakers"
          legend="I can't live with"
          options={DEAL_BREAKER_CODES}
          labels={DEAL_BREAKER_LABELS}
        />
      </Section>

      <Section title="Visibility">
        <StatusChoice control={form.control} />
      </Section>

      {failure ? (
        <FormMessage tone="danger" title="Not saved">
          {failure}
        </FormMessage>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
          ) : (
            <Save data-icon="inline-start" aria-hidden />
          )}
          {exists ? "Save profile" : "Create profile"}
        </Button>
      </div>
    </form>
  );
}
