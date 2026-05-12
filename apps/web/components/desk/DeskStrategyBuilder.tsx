"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input, Label, Select } from "@signalai/ui";
import {
  ACTIONS,
  DESK_CANDLE_TIMES,
  DESK_META,
  DESK_TEMPLATES,
  EXPIRY_OPTIONS,
  INDEX_OPTIONS,
  OPTION_TYPES,
  STRIKES,
  TEMPLATES,
  describeStrategy,
  validateStrategy,
} from "@signalai/utils";
import type { ConditionGroup, DeskType, EntryCondition, ExitCondition } from "@signalai/types";
import { useStrategy } from "@/store/strategy";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { GroupEditor } from "@/components/GroupEditor";

const STEPS = ["Basics", "Entry", "Exit", "Risk", "Review"];

const DESK_ACCENT: Record<DeskType, string> = {
  equity:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  options:        "bg-violet-500/10 text-violet-400 border-violet-500/30",
  "mutual-funds": "bg-sky-500/10 text-sky-400 border-sky-500/30",
};

export default function DeskStrategyBuilder({ desk }: { desk: DeskType }) {
  const draft = useStrategy((s) => s.draft);
  const set = useStrategy((s) => s.set);
  const setRaw = useStrategy((s) => s.setRaw);
  const reset = useStrategy((s) => s.reset);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const meta = DESK_META[desk];
  const candleTimes = DESK_CANDLE_TIMES[desk];

  // Initialise draft for this desk on mount
  useEffect(() => {
    reset(desk);
  }, [desk]);

  const validation = useMemo(() => validateStrategy(draft), [draft]);
  const summary = useMemo(() => describeStrategy(draft), [draft]);

  function applyTemplate(name: string) {
    const t = TEMPLATES[name];
    if (t) setRaw({ ...t });
  }

  async function save(asActive = false) {
    setError(null);
    if (!validation.ok) { setError(validation.errors.join(" ")); return; }
    setSaving(true);
    try {
      const body = {
        name: draft.name,
        strategy_json: { ...draft, desk, status: asActive ? "active" : "draft" },
        mode: draft.mode,
        status: asActive ? "active" : "draft",
      };
      const created = await api<{ id: string }>("/strategies", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/${desk}/strategies/${created.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-4">
        {/* Step tabs */}
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                step === i ? DESK_ACCENT[desk] : "bg-slate-900 border-slate-800 text-slate-300"
              }`}
            >
              {i + 1}. {s}
            </button>
          ))}
          <div className="ml-auto">
            <Select
              options={["— template —", ...DESK_TEMPLATES[desk]]}
              onChange={(e) => e.target.value !== "— template —" && applyTemplate(e.target.value)}
            />
          </div>
        </div>

        {step === 0 && <BasicsStep />}
        {step === 1 && (
          <Card title="2. Entry — AND / OR groups">
            <GroupEditor
              kind="entry"
              group={draft.entry as ConditionGroup<EntryCondition>}
              onChange={(g) => set({ entry: g as any })}
            />
          </Card>
        )}
        {step === 2 && (
          <Card title="3. Exit — AND / OR groups">
            <GroupEditor
              kind="exit"
              group={draft.exit as ConditionGroup<ExitCondition>}
              onChange={(g) => set({ exit: g as any })}
            />
          </Card>
        )}
        {step === 3 && <RiskStep />}
        {step === 4 && (
          <Card title="Plain-English summary">
            <p className="text-slate-200 leading-relaxed">{summary}</p>
          </Card>
        )}

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
          <Button onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))} disabled={step === STEPS.length - 1}>Next</Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => save(false)} disabled={saving}>Save as Draft</Button>
            <Button onClick={() => save(true)} disabled={saving || !validation.ok}>
              Save & Activate (Paper)
            </Button>
          </div>
        </div>
        {error && (
          <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-3">{error}</div>
        )}
      </div>

      {/* Right panel */}
      <div className="space-y-4">
        <Card title={
          <div className="flex items-center gap-2">
            Validation
            {validation.ok ? <Badge tone="success">OK</Badge> : <Badge tone="warn">{validation.errors.length} issues</Badge>}
          </div>
        }>
          {validation.ok ? (
            <div className="text-sm text-slate-300">Ready to save.</div>
          ) : (
            <ul className="text-sm text-amber-300 list-disc pl-4 space-y-1">
              {validation.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </Card>
        <Card title="Plain-English">
          <p className="text-sm text-slate-300 leading-relaxed">{summary}</p>
        </Card>
        <Card title="JSON preview">
          <pre className="text-[11px] leading-relaxed text-slate-300 overflow-auto max-h-[480px]">
{JSON.stringify(draft, null, 2)}
          </pre>
        </Card>
      </div>
    </div>
  );

  function BasicsStep() {
    return (
      <Card title={`1. Basics — ${meta.label} Desk`}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Strategy name</Label>
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <Label>Index</Label>
            <Select options={INDEX_OPTIONS as any} value={draft.index} onChange={(e) => set({ index: e.target.value as any })} />
          </div>
          <div>
            <Label>Option Type</Label>
            <Select options={OPTION_TYPES as any} value={draft.optionType} onChange={(e) => set({ optionType: e.target.value as any })} />
          </div>
          <div>
            <Label>Strike</Label>
            <Select options={STRIKES as any} value={draft.strike} onChange={(e) => set({ strike: e.target.value as any })} />
          </div>
          <div>
            <Label>Action</Label>
            <Select options={ACTIONS as any} value={draft.action} onChange={(e) => set({ action: e.target.value as any })} />
          </div>
          <div>
            <Label>Candle Time</Label>
            <Select options={candleTimes as any} value={draft.candleTime} onChange={(e) => set({ candleTime: e.target.value as any })} />
          </div>
          <div>
            <Label>Quantity (lots)</Label>
            <Input type="number" min={1} value={draft.quantity} onChange={(e) => set({ quantity: Number(e.target.value) })} />
          </div>
          {/* Options-only fields */}
          {desk === "options" && (
            <>
              <div>
                <Label>Option Type</Label>
                <Select options={OPTION_TYPES as any} value={draft.optionType ?? "CE"} onChange={(e) => set({ optionType: e.target.value as any })} />
              </div>
              <div>
                <Label>Strike</Label>
                <Select options={STRIKES as any} value={draft.strike ?? "ATM"} onChange={(e) => set({ strike: e.target.value as any })} />
              </div>
              <div>
                <Label>Expiry</Label>
                <Select
                  options={EXPIRY_OPTIONS as any}
                  value={draft.expiry ?? "Weekly"}
                  onChange={(e) => set({ expiry: e.target.value as any })}
                />
              </div>
            </>
          )}
        </div>
      </Card>
    );
  }

  function RiskStep() {
    return (
      <Card title="4. Risk Controls">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Max loss / day (₹)</Label>
            <Input
              type="number"
              value={draft.risk.maxLossPerDay}
              onChange={(e) => set({ risk: { ...draft.risk, maxLossPerDay: Number(e.target.value) } })}
            />
          </div>
          <div>
            <Label>Max trades / day</Label>
            <Input
              type="number"
              value={draft.risk.maxTradesPerDay}
              onChange={(e) => set({ risk: { ...draft.risk, maxTradesPerDay: Number(e.target.value) } })}
            />
          </div>
          <div>
            <Label>Max open positions</Label>
            <Input
              type="number"
              value={draft.risk.maxOpenPositions}
              onChange={(e) => set({ risk: { ...draft.risk, maxOpenPositions: Number(e.target.value) } })}
            />
          </div>
          {desk !== "mutual-funds" && (
            <div>
              <Label>Auto square-off (HH:MM)</Label>
              <Input
                value={draft.risk.autoSquareOffTime ?? ""}
                onChange={(e) => set({ risk: { ...draft.risk, autoSquareOffTime: e.target.value } })}
              />
            </div>
          )}
        </div>
      </Card>
    );
  }
}
