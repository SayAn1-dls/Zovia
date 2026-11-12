"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshSession } from "@/features/auth/session-adapter";

import { updateProfileAction } from "../actions";
import {
  GENDER_LABELS,
  GENDERS,
  OCCUPATION_LABELS,
  OCCUPATIONS,
  profileSchema,
  type OwnProfile,
  type ProfileFormValues,
  type ProfileInput,
} from "../schemas";
import { NativeSelect } from "./native-select";

const FIELDS = ["display_name", "gender", "occupation", "college_name", "course", "work_location", "company", "home_city", "bio"] as const;

function toValues(profile: OwnProfile): ProfileFormValues {
  return {
    display_name: profile.display_name,
    gender: profile.gender ?? "",
    occupation: profile.occupation ?? "",
    college_name: profile.college_name ?? "",
    course: profile.course ?? "",
    work_location: profile.work_location ?? "",
    company: profile.company ?? "",
    home_city: profile.home_city ?? "",
    bio: profile.bio ?? "",
  };
}

export function ProfileForm({ profile }: { profile: OwnProfile }) {
  const form = useForm<ProfileFormValues, unknown, ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: toValues(profile),
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const { isSubmitting, isDirty } = form.formState;
  const occupation = useWatch({ control: form.control, name: "occupation" });

  async function onSubmit() {
    setFailure(null);
    const values = form.getValues();
    const result = await updateProfileAction(values);
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, FIELDS);
      setFailure(result.error.message);
      return;
    }
    form.reset(values);
    toast.success("Profile saved");
    void refreshSession();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? <FormMessage tone="danger" title="Not saved">{failure}</FormMessage> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField control={form.control} name="display_name" label="Name">
          {(field) => <Input autoComplete="name" {...field} />}
        </FormField>
        <FormField control={form.control} name="gender" label="Gender" optional>
          {(field) => (
            <NativeSelect {...field}>
              <option value="">Not set</option>
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
        <FormField control={form.control} name="home_city" label="Home town" optional>
          {(field) => <Input {...field} />}
        </FormField>
        {occupation === "student" ? (
          <>
            <FormField control={form.control} name="college_name" label="College" optional>
              {(field) => <Input autoComplete="organization" {...field} />}
            </FormField>
            <FormField control={form.control} name="course" label="Course" optional>
              {(field) => <Input {...field} />}
            </FormField>
          </>
        ) : null}
        {occupation === "working_professional" ? (
          <>
            <FormField control={form.control} name="work_location" label="Where you work" optional>
              {(field) => <Input {...field} />}
            </FormField>
            <FormField control={form.control} name="company" label="Company" optional>
              {(field) => <Input autoComplete="organization" {...field} />}
            </FormField>
          </>
        ) : null}
      </div>
      <FormField control={form.control} name="bio" label="About you" optional description="Up to 500 characters.">
        {(field) => <Textarea rows={4} maxLength={500} {...field} />}
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <Save data-icon="inline-start" aria-hidden />
        )}
        Save profile
      </Button>
    </form>
  );
}
