"use client";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
} from "@signalai/ui";
import {
  ACTIONS,
  CANDLE_TIMES,
  INDEX_OPTIONS,
  INDICATORS,
  OPTION_TYPES,
  STRIKES,
  TEMPLATES,
  describeStrategy,
  validateStrategy,
} from "@signalai/utils";
import type {
  EntryCondition,
  ExitCondition,
  IndicatorCondition,
  IndicatorName,
  Logic,
  StrategyJSON,
} from "@signalai/types";
import { useStrategy } from "@/store/strategy";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

const STEPS = ["Basics", "Entry", "Exit", "Risk", "Review"];

export default function StrategyBuilder() {
  const draft = useStrategy((s) => s.draft);
  const set = useStrategy((s) => s.set);
  const setRaw = useStrategy((s) => s.setRaw);
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validation = useMemo(() => validateStrategy(draft), [draft]);
  const summary = useMemo(() => describeStrategy(draft), [draft]);

  function applyTemplate(name: string) {
    const t = TEMPLATES[name];
    if (t) setRaw({ ...t, name: `${t.name}` });
  }

  async function save(asActive = false) {
    setError(null);
    if (!validation.ok) {
      setError(validation.errors.join(" "));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: draft.name,
        strategy_json: { ...draft, status: asActive ? "active" : "draft" },
        mode: draft.mode,
        status: asActive ? "active" : "draft",
      };
      const created = await api<{ id: string }>("/strategies", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/strategies/${created.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-4">
        {/* Stepper */}
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                step === i
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-slate-900 border-slate-800 text-slate-300"
              }`}
            >
              {i + 1}. {s}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <Select
              options={["— template —", ...Object.keys(TEMPLATES)]}
              onChange={(e) =>
                e.target.value !== "— template —" && applyTemplate(e.target.value)
              }
            />
          </div>
        </div>

        {step === 0 && <BasicsStep />}
        {step === 1 && <EntryStep />}
        {step === 2 && <ExitStep />}
        {step === 3 && <RiskStep />}
        {step === 4 && (
          <Card title="Plain-English summary">
            <p className="text-slate-200 leading-relaxed">{summary}</p>
          </Card>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          <Button
            onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
            disabled={step === STEPS.length - 1}
          >
            Next
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
              Save as Draft
            </Button>
            <Button onClick={() => save(true)} disabled={saving || !validation.ok}>
              Save & Activate (Paper)
            </Button>
          </div>
        </div>
        {error && (
          <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-3">
            {error}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Card
          title={
            <div className="flex items-center gap-2">
              Validation
              {validation.ok ? (
                <Badge tone="success">OK</Badge>
              ) : (
                <Badge tone="warn">{validation.errors.length} issues</Badge>
              )}
            </div>
          }
        >
          {validation.ok ? (
            <div className="text-sm text-slate-300">Ready to save.</div>
          ) : (
            <ul className="text-sm text-amber-300 list-disc pl-4 space-y-1">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="JSON preview">
          <pre className="text-[11px] leading-relaxed text-slate-300 overflow-auto max-h-[480px]">
{JSON.stringify(draft, null, 2)}
          </pre>
        </Card>
      </div>
    </div>
  );

  // --- step components (closures over draft/set) ---
  function BasicsStep() {
    return (
      <Card title="1. Basics">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Strategy name</Label>
            <Input
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div>
            <Label>Index</Label>
            <Select
              options={INDEX_OPTIONS as any}
              value={draft.index}
              onChange={(e) => set({ index: e.target.value as any })}
            />
          </div>
          <div>
            <Label>Option Type</Label>
            <Select
              options={OPTION_TYPES as any}
              value={draft.optionType}
              onChange={(e) => set({ optionType: e.target.value as any })}
            />
          </div>
          <div>
            <Label>Strike</Label>
            <Select
              options={STRIKES as any}
              value={draft.strike}
              onChange={(e) => set({ strike: e.target.value as any })}
            />
          </div>
          <div>
            <Label>Action</Label>
            <Select
              options={ACTIONS as any}
              value={draft.action}
              onChange={(e) => set({ action: e.target.value as any })}
            />
          </div>
          <div>
            <Label>Candle Time</Label>
            <Select
              options={CANDLE_TIMES as any}
              value={draft.candleTime}
              onChange={(e) => set({ candleTime: e.target.value as any })}
            />
          </div>
          <div>
            <Label>Quantity (lots)</Label>
            <Input
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(e) => set({ quantity: Number(e.target.value) })}
            />
          </div>
        </div>
      </Card>
    );
  }

  function EntryStep() {
    function update(conditions: EntryCondition[]) {
      set({ entry: { ...draft.entry, conditions } as any });
    }
    function addLevel() {
      update([
        ...draft.entry.conditions,
        { type: "level", field: "price", operator: ">", value: 22500 },
      ] as any);
    }
    function addIndicator() {
      const c: IndicatorCondition = {
        type: "indicator",
        indicator: "RSI",
        period: 14,
        operator: ">",
        value: 60,
      };
      update([...draft.entry.conditions, c] as any);
    }
    function addTime() {
      update([
        ...draft.entry.conditions,
        { type: "time", operator: ">=", time: "09:20" },
      ] as any);
    }
    return (
      <Card title="2. Entry">
        <div className="flex gap-2 mb-4 items-center">
          <Label>Logic</Label>
          <Select
            options={["AND", "OR"]}
            value={draft.entry.logic}
            onChange={(e) =>
              set({
                entry: { ...draft.entry, logic: e.target.value as Logic } as any,
              })
            }
            className="!w-24"
          />
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={addLevel}>+ Level</Button>
            <Button variant="secondary" onClick={addIndicator}>+ Indicator</Button>
            <Button variant="secondary" onClick={addTime}>+ Time</Button>
          </div>
        </div>
        <div className="space-y-3">
          {draft.entry.conditions.map((c, i) => (
            <ConditionRow
              key={i}
              cond={c}
              onChange={(nc) => {
                const list = [...draft.entry.conditions];
                list[i] = nc as any;
                update(list);
              }}
              onRemove={() => {
                update(draft.entry.conditions.filter((_, j) => j !== i));
              }}
            />
          ))}
          {!draft.entry.conditions.length && (
            <div className="text-sm text-slate-500">
              No entry conditions yet. Add a level, indicator, or time condition.
            </div>
          )}
        </div>
      </Card>
    );
  }

  function ExitStep() {
    function update(conditions: ExitCondition[]) {
      set({ exit: { ...draft.exit, conditions } as any });
    }
    return (
      <Card title="3. Exit">
        <div className="flex gap-2 mb-4 items-center">
          <Label>Logic</Label>
          <Select
            options={["AND", "OR"]}
            value={draft.exit.logic}
            onChange={(e) =>
              set({
                exit: { ...draft.exit, logic: e.target.value as Logic } as any,
              })
            }
            className="!w-24"
          />
          <div className="ml-auto flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() =>
                update([
                  ...draft.exit.conditions,
                  { type: "stop_loss", value: 20 },
                ] as any)
              }
            >
              + Stop Loss
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                update([
                  ...draft.exit.conditions,
                  { type: "target", value: 50 },
                ] as any)
              }
            >
              + Target
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                update([
                  ...draft.exit.conditions,
                  { type: "trailing_stop_loss", value: 10 },
                ] as any)
              }
            >
              + Trailing SL
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                update([
                  ...draft.exit.conditions,
                  { type: "time_exit", time: "15:15" },
                ] as any)
              }
            >
              + Time Exit
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                update([
                  ...draft.exit.conditions,
                  {
                    type: "indicator",
                    indicator: "RSI",
                    period: 14,
                    operator: "<",
                    value: 40,
                  },
                ] as any)
              }
            >
              + Indicator
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                update([
                  ...draft.exit.conditions,
                  { type: "level", field: "price", operator: "<", value: 22400 },
                ] as any)
              }
            >
              + Level
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {draft.exit.conditions.map((c, i) => (
            <ExitRow
              key={i}
              cond={c}
              onChange={(nc) => {
                const list = [...draft.exit.conditions];
                list[i] = nc as any;
                update(list);
              }}
              onRemove={() =>
                update(draft.exit.conditions.filter((_, j) => j !== i))
              }
            />
          ))}
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
              onChange={(e) =>
                set({
                  risk: { ...draft.risk, maxLossPerDay: Number(e.target.value) },
                })
              }
            />
          </div>
          <div>
            <Label>Max trades / day</Label>
            <Input
              type="number"
              value={draft.risk.maxTradesPerDay}
              onChange={(e) =>
                set({
                  risk: { ...draft.risk, maxTradesPerDay: Number(e.target.value) },
                })
              }
            />
          </div>
          <div>
            <Label>Max open positions</Label>
            <Input
              type="number"
              value={draft.risk.maxOpenPositions}
              onChange={(e) =>
                set({
                  risk: { ...draft.risk, maxOpenPositions: Number(e.target.value) },
                })
              }
            />
          </div>
          <div>
            <Label>Auto square-off (HH:MM)</Label>
            <Input
              value={draft.risk.autoSquareOffTime}
              onChange={(e) =>
                set({
                  risk: { ...draft.risk, autoSquareOffTime: e.target.value },
                })
              }
            />
          </div>
        </div>
      </Card>
    );
  }
}

function ConditionRow({
  cond,
  onChange,
  onRemove,
}: {
  cond: EntryCondition;
  onChange: (c: EntryCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-slate-800 rounded-md p-3 bg-slate-950/40">
      <div className="flex items-center gap-2 mb-2">
        <Badge tone="info">{cond.type}</Badge>
        <Button variant="ghost" onClick={onRemove} className="ml-auto">
          Remove
        </Button>
      </div>
      {cond.type === "level" && (
        <div className="grid grid-cols-3 gap-2">
          <Select
            options={[">", "<", ">=", "<=", "=="]}
            value={cond.operator}
            onChange={(e) => onChange({ ...cond, operator: e.target.value as any })}
          />
          <Input
            type="number"
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: Number(e.target.value) })}
          />
        </div>
      )}
      {cond.type === "indicator" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Select
            options={INDICATORS as any}
            value={cond.indicator}
            onChange={(e) =>
              onChange({ ...cond, indicator: e.target.value as IndicatorName })
            }
          />
          <Input
            type="number"
            placeholder="period"
            value={cond.period ?? ""}
            onChange={(e) =>
              onChange({ ...cond, period: Number(e.target.value) || undefined })
            }
          />
          <Select
            options={[">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"]}
            value={cond.operator}
            onChange={(e) => onChange({ ...cond, operator: e.target.value as any })}
          />
          <Input
            type="number"
            placeholder="value"
            value={cond.value ?? ""}
            onChange={(e) =>
              onChange({ ...cond, value: Number(e.target.value) || undefined })
            }
          />
        </div>
      )}
      {cond.type === "time" && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            options={[">=", "<=", "=="]}
            value={cond.operator}
            onChange={(e) => onChange({ ...cond, operator: e.target.value as any })}
          />
          <Input
            value={cond.time}
            onChange={(e) => onChange({ ...cond, time: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function ExitRow({
  cond,
  onChange,
  onRemove,
}: {
  cond: ExitCondition;
  onChange: (c: ExitCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-slate-800 rounded-md p-3 bg-slate-950/40">
      <div className="flex items-center gap-2 mb-2">
        <Badge tone="warn">{cond.type}</Badge>
        <Button variant="ghost" onClick={onRemove} className="ml-auto">
          Remove
        </Button>
      </div>
      {("value" in cond && cond.type !== "level" && cond.type !== "indicator") && (
        <div>
          <Label>Value (points)</Label>
          <Input
            type="number"
            value={(cond as any).value}
            onChange={(e) =>
              onChange({ ...(cond as any), value: Number(e.target.value) })
            }
          />
        </div>
      )}
      {cond.type === "time_exit" && (
        <div>
          <Label>Time (HH:MM)</Label>
          <Input
            value={cond.time}
            onChange={(e) => onChange({ ...cond, time: e.target.value })}
          />
        </div>
      )}
      {cond.type === "level" && (
        <div className="grid grid-cols-3 gap-2">
          <Select
            options={[">", "<", ">=", "<=", "=="]}
            value={cond.operator}
            onChange={(e) => onChange({ ...cond, operator: e.target.value as any })}
          />
          <Input
            type="number"
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: Number(e.target.value) })}
          />
        </div>
      )}
      {cond.type === "indicator" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Select
            options={INDICATORS as any}
            value={cond.indicator}
            onChange={(e) =>
              onChange({ ...cond, indicator: e.target.value as IndicatorName })
            }
          />
          <Input
            type="number"
            placeholder="period"
            value={cond.period ?? ""}
            onChange={(e) =>
              onChange({
                ...cond,
                period: Number(e.target.value) || undefined,
              } as any)
            }
          />
          <Select
            options={[">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"]}
            value={cond.operator}
            onChange={(e) => onChange({ ...cond, operator: e.target.value as any })}
          />
          <Input
            type="number"
            placeholder="value"
            value={cond.value ?? ""}
            onChange={(e) =>
              onChange({
                ...cond,
                value: Number(e.target.value) || undefined,
              } as any)
            }
          />
        </div>
      )}
    </div>
  );
}
