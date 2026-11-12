"use client";

import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { saveChargesAction, saveRulesAction } from "../actions";
import {
  CHARGE_FREQUENCIES,
  CHARGE_FREQUENCY_LABELS,
  GATE_TIME_RULE,
  NOTES_RULE,
  YES_NO_RULES,
  type ChargeFrequency,
  type OwnerCharge,
  type RuleChoice,
  type RuleRow,
  type YesNoRuleCode,
} from "../schemas";
import { CheckRow, Panel } from "./bits";
import { NativeSelect } from "./native-select";

function initialChoices(rules: RuleRow[]): Record<YesNoRuleCode, RuleChoice> {
  const out = {} as Record<YesNoRuleCode, RuleChoice>;
  for (const rule of YES_NO_RULES) {
    const row = rules.find((r) => r.rule_code === rule.code);
    out[rule.code] = row?.allowed === true ? "allowed" : row?.allowed === false ? "not_allowed" : "unset";
  }
  return out;
}

function RulesPanel({ propertyId, rules }: { propertyId: string; rules: RuleRow[] }) {
  const router = useRouter();
  const [choices, setChoices] = useState(() => initialChoices(rules));
  const [gate, setGate] = useState(rules.find((r) => r.rule_code === GATE_TIME_RULE)?.value ?? "");
  const [notes, setNotes] = useState(rules.find((r) => r.rule_code === NOTES_RULE)?.note ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveRulesAction({ property_id: propertyId, choices, gate_closing_time: gate, notes });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("House rules saved");
      router.refresh();
    });
  }

  return (
    <Panel title="House rules" description="Say clearly what is and is not allowed. Leave a rule as “Not specified” if it does not apply.">
      <div className="grid gap-4 sm:grid-cols-2">
        {YES_NO_RULES.map((rule) => (
          <label key={rule.code} className="flex flex-col gap-1.5 text-sm font-semibold">
            {rule.label}
            <NativeSelect value={choices[rule.code]} onChange={(event) => setChoices((current) => ({ ...current, [rule.code]: event.target.value as RuleChoice }))}>
              <option value="unset">Not specified</option>
              <option value="allowed">Allowed</option>
              <option value="not_allowed">Not allowed</option>
            </NativeSelect>
          </label>
        ))}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Gate closes at
          <Input type="time" value={gate} onChange={(event) => setGate(event.target.value)} />
        </label>
      </div>
      <label className="mt-4 flex flex-col gap-1.5 text-sm font-semibold">
        Other rules
        <Textarea rows={3} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything else tenants should know." />
      </label>
      <Button size="lg" className="mt-5" onClick={save} disabled={pending}>
        {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
        Save rules
      </Button>
    </Panel>
  );
}

type ChargeDraft = { key: number; label: string; amount: string; frequency: ChargeFrequency; is_mandatory: boolean };

function ChargesPanel({ propertyId, charges }: { propertyId: string; charges: OwnerCharge[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ChargeDraft[]>(() =>
    charges.map((charge, index) => ({ key: index, label: charge.label, amount: String(charge.amount), frequency: charge.frequency, is_mandatory: charge.is_mandatory })),
  );
  const [pending, startTransition] = useTransition();
  const nextKey = useRef(charges.length);

  function patch(key: number, changes: Partial<ChargeDraft>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function save() {
    startTransition(async () => {
      const result = await saveChargesAction({
        property_id: propertyId,
        charges: rows.map(({ label, amount, frequency, is_mandatory }) => ({ label, amount, frequency, is_mandatory })),
      });
      if (!result.ok) {
        const details = result.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const first = details?.fieldErrors ? Object.values(details.fieldErrors)[0]?.[0] : undefined;
        toast.error(first ?? result.error.message);
        return;
      }
      toast.success("Extra charges saved");
      router.refresh();
    });
  }

  return (
    <Panel title="Extra charges" description="Anything a tenant pays beyond rent, maintenance, utilities and food, e.g. laundry or a registration fee.">
      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.key} className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Charge
                <Input value={row.label} maxLength={80} onChange={(event) => patch(row.key, { label: event.target.value })} placeholder="Laundry" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Amount (₹)
                <Input inputMode="numeric" value={row.amount} onChange={(event) => patch(row.key, { amount: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                How often
                <NativeSelect value={row.frequency} onChange={(event) => patch(row.key, { frequency: event.target.value as ChargeFrequency })}>
                  {CHARGE_FREQUENCIES.map((value) => (
                    <option key={value} value={value}>
                      {CHARGE_FREQUENCY_LABELS[value]}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <Button variant="ghost" size="icon-lg" aria-label={`Remove ${row.label || "charge"}`} onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}>
                <Trash2 aria-hidden />
              </Button>
              <div className="sm:col-span-4">
                <CheckRow label="Mandatory" description="Every tenant pays it." checked={row.is_mandatory} onChange={(checked) => patch(row.key, { is_mandatory: checked })} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No extra charges.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="lg"
          disabled={rows.length >= 20}
          onClick={() => {
            const key = nextKey.current;
            nextKey.current += 1;
            setRows((current) => [...current, { key, label: "", amount: "", frequency: "monthly", is_mandatory: true }]);
          }}
        >
          <Plus data-icon="inline-start" aria-hidden />
          Add a charge
        </Button>
        <Button size="lg" onClick={save} disabled={pending}>
          {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
          Save charges
        </Button>
      </div>
    </Panel>
  );
}

export function RulesAndChargesForm({ propertyId, rules, charges }: { propertyId: string; rules: RuleRow[]; charges: OwnerCharge[] }) {
  return (
    <div className="space-y-6">
      <RulesPanel propertyId={propertyId} rules={rules} />
      <ChargesPanel propertyId={propertyId} charges={charges} />
    </div>
  );
}
