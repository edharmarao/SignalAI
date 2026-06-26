"use client";
import { Badge, Button, Input, Label, Select } from "@signalai/ui";
import {
  INDICATORS,
} from "@signalai/utils";
import {
  isGroup,
  type ConditionGroup,
  type EntryCondition,
  type ExitCondition,
  type IndicatorCondition,
  type IndicatorName,
  type Logic,
} from "@signalai/types";

type AnyCond = EntryCondition | ExitCondition;
type Node = AnyCond | ConditionGroup<AnyCond>;

export interface GroupEditorProps {
  group: ConditionGroup<AnyCond>;
  onChange: (g: ConditionGroup<AnyCond>) => void;
  /** Which condition shapes to offer as quick-add buttons. */
  kind: "entry" | "exit";
  depth?: number;
}

const ENTRY_PRESETS: Record<string, () => EntryCondition> = {
  Level: () => ({ type: "level", field: "price", operator: ">", value: 22500 }),
  Indicator: () => ({
    type: "indicator",
    indicator: "RSI",
    period: 14,
    operator: ">",
    value: 60,
  }),
  Time: () => ({ type: "time", operator: ">=", time: "09:20" }),
};

const EXIT_PRESETS: Record<string, () => ExitCondition> = {
  "Stop Loss": () => ({ type: "stop_loss", value: 20 }),
  Target: () => ({ type: "target", value: 50 }),
  "Trailing SL": () => ({ type: "trailing_stop_loss", value: 10 }),
  "Time Exit": () => ({ type: "time_exit", time: "15:15" }),
  Indicator: () => ({
    type: "indicator",
    indicator: "RSI",
    period: 14,
    operator: "<",
    value: 40,
  }),
  Level: () => ({ type: "level", field: "price", operator: "<", value: 22400 }),
};

export function GroupEditor({ group, onChange, kind, depth = 0 }: GroupEditorProps) {
  const presets = kind === "entry" ? ENTRY_PRESETS : EXIT_PRESETS;

  function update(idx: number, node: Node) {
    const next = [...group.conditions];
    next[idx] = node;
    onChange({ ...group, conditions: next });
  }
  function remove(idx: number) {
    onChange({
      ...group,
      conditions: group.conditions.filter((_, i) => i !== idx),
    });
  }
  function addLeaf(name: string) {
    onChange({
      ...group,
      conditions: [...group.conditions, presets[name]()],
    });
  }
  function addGroup() {
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        { logic: group.logic === "AND" ? "OR" : "AND", conditions: [] },
      ],
    });
  }
  function setLogic(logic: Logic) {
    onChange({ ...group, logic });
  }

  const tones = ["bg-slate-950/40", "bg-slate-900/40", "bg-slate-950/30"];
  const borders = ["border-slate-800", "border-emerald-500/30", "border-sky-500/30"];

  return (
    <div
      className={`rounded-md border ${borders[depth % borders.length]} ${
        tones[depth % tones.length]
      } p-3`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs uppercase text-slate-500">Match</span>
        <div className="inline-flex rounded-md border border-slate-700 overflow-hidden">
          {(["AND", "OR"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLogic(l)}
              className={`px-2.5 py-1 text-xs ${
                group.logic === l
                  ? "bg-emerald-500 text-slate-950 font-medium"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          of {group.conditions.length} item{group.conditions.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {Object.keys(presets).map((p) => (
            <Button key={p} variant="secondary" onClick={() => addLeaf(p)}>
              + {p}
            </Button>
          ))}
          <Button variant="secondary" onClick={addGroup}>
            + Group
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {group.conditions.length === 0 && (
          <div className="text-xs text-slate-500 italic">
            Empty group. Add a condition or a nested group.
          </div>
        )}
        {group.conditions.map((c, i) => (
          <div key={i} className="flex items-stretch gap-2">
            {i > 0 && (
              <div className="flex items-center">
                <Badge tone={group.logic === "AND" ? "info" : "warn"}>
                  {group.logic}
                </Badge>
              </div>
            )}
            <div className="flex-1">
              {isGroup<AnyCond>(c) ? (
                <GroupEditor
                  group={c}
                  onChange={(g) => update(i, g)}
                  kind={kind}
                  depth={depth + 1}
                />
              ) : (
                <ConditionRow
                  cond={c}
                  kind={kind}
                  onChange={(nc) => update(i, nc)}
                  onRemove={() => remove(i)}
                />
              )}
            </div>
            {isGroup<AnyCond>(c) && (
              <Button variant="ghost" onClick={() => remove(i)}>
                ✕
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConditionRow({
  cond,
  kind,
  onChange,
  onRemove,
}: {
  cond: AnyCond;
  kind: "entry" | "exit";
  onChange: (c: AnyCond) => void;
  onRemove: () => void;
}) {
  const tone = kind === "entry" ? "info" : "warn";
  return (
    <div className="border border-slate-800 rounded-md p-3 bg-slate-950/60">
      <div className="flex items-center gap-2 mb-2">
        <Badge tone={tone as any}>{cond.type}</Badge>
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
            value={(cond as IndicatorCondition).indicator}
            onChange={(e) =>
              onChange({
                ...(cond as IndicatorCondition),
                indicator: e.target.value as IndicatorName,
              })
            }
          />
          <Input
            type="number"
            placeholder="period"
            value={(cond as IndicatorCondition).period ?? ""}
            onChange={(e) =>
              onChange({
                ...(cond as IndicatorCondition),
                period: Number(e.target.value) || undefined,
              })
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
            value={(cond as IndicatorCondition).value ?? ""}
            onChange={(e) =>
              onChange({
                ...(cond as any),
                value: Number(e.target.value) || undefined,
              })
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

      {(cond.type === "stop_loss" ||
        cond.type === "target" ||
        cond.type === "trailing_stop_loss") && (
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
    </div>
  );
}
