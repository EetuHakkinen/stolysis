"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HistoryIcon, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  checkFormula,
  FORMULA_OPERATORS,
  FORMULA_PARENTHESES,
  formatFormula,
  operatorSymbol,
  type Formula,
  type FormulaPeriod,
  type FormulaToken,
} from "@/lib/formulas";
import { cn } from "@/lib/utils";

// Fields a formula can use, by result field group in display order.
export type FormulaFieldGroup = { id: number; name: string; fields: { id: number; name: string }[] };

const BOX_ID = "formula-box";
const PALETTE_PREFIX = "palette:";

type Item = { key: string; token: FormulaToken };

let nextKey = 0;
const toItem = (token: FormulaToken): Item => ({ key: `token-${nextKey++}`, token });

const TOKEN_BASE = "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-sm font-medium select-none";

function tokenClassName(token: FormulaToken) {
  if ("field" in token)
    return token.period === "previous"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
      : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200";
  if ("number" in token) return "border-border bg-background tabular-nums";
  return "min-w-7 justify-center border-border bg-muted font-mono";
}

// Field names by id from the groups.
function fieldNames(groups: FormulaFieldGroup[]) {
  return new Map(groups.flatMap((group) => group.fields.map((field) => [field.id, field.name] as const)));
}

// Formats formulas as readable text with the fields' current names, e.g. for tooltips.
export function useFormatFormula(groups: FormulaFieldGroup[]) {
  const t = useTranslations("FormulaEditor");
  const format = useFormatter();
  const names = fieldNames(groups);

  return (formula: Formula) =>
    formatFormula(formula, {
      field: (fieldId, period) => {
        const name = names.get(fieldId) ?? t("unknownField");
        return period === "previous" ? t("previousValue", { name }) : name;
      },
      number: (value) => format.number(value, { maximumFractionDigits: 10 }),
    });
}

// Text shown in a token: the field name, number or operator symbol.
function useTokenLabel(groups: FormulaFieldGroup[]) {
  const t = useTranslations("FormulaEditor");
  const format = useFormatter();
  const names = fieldNames(groups);

  return (token: FormulaToken) => {
    if ("field" in token) return names.get(token.field) ?? t("unknownField");
    if ("number" in token) return format.number(token.number, { maximumFractionDigits: 10 });
    if ("operator" in token) return operatorSymbol(token.operator);
    return token.parenthesis;
  };
}

// Editor of a calculated field's formula. The formula is shown as tokens in a box: fields of the
// current period in blue, of the previous period (a year earlier) in amber. Operators, numbers and
// fields are added to the end by clicking them below the box, or to a given place by dragging them
// into the box. Tokens in the box are reordered by dragging, and removed with their × button or
// the Delete key. The editor keeps its own copy of the formula, so defaultValue is only read when it
// mounts; onChange gets every change.
export function FormulaEditor({
  id,
  defaultValue,
  onChange,
  groups,
  fieldId,
  invalid,
  disabled,
}: {
  id?: string;
  defaultValue: Formula;
  onChange: (formula: Formula) => void;
  groups: FormulaFieldGroup[];
  // The edited field, which may only use its own previous value. Undefined for a new field.
  fieldId?: number;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("FormulaEditor");
  const dndId = useId();
  const tokenLabel = useTokenLabel(groups);
  const [items, setItems] = useState(() => defaultValue.map(toItem));
  const [dragged, setDragged] = useState<FormulaToken>();
  // Where a token dragged from below the box would be inserted.
  const [dropIndex, setDropIndex] = useState<number>();
  const [number, setNumber] = useState("");
  const { setNodeRef: setBoxRef } = useDroppable({ id: BOX_ID, disabled });

  const sensors = useSensors(
    // Moving a little before dragging starts keeps clicks working.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Only shown after a failed save, so an unfinished formula isn't marked while it's being written.
  const errorIndex = invalid ? checkFormula(items.map((item) => item.token))?.index : undefined;

  function update(next: Item[]) {
    setItems(next);
    onChange(next.map((item) => item.token));
  }

  const add = (token: FormulaToken) => update([...items, toItem(token)]);
  const remove = (key: string) => update(items.filter((item) => item.key !== key));

  function addNumber() {
    const value = Number(number);
    if (number.trim() === "" || !Number.isFinite(value)) return;
    add({ number: value });
    setNumber("");
  }

  // A token dragged from below the box goes before or after the token closest to it, whichever side
  // it is on, or to the empty box.
  const collisionDetection: CollisionDetection = (args) => {
    const tokens = args.droppableContainers.filter((container) => container.id !== BOX_ID);
    if (!String(args.active.id).startsWith(PALETTE_PREFIX))
      return closestCenter({ ...args, droppableContainers: tokens });
    const inBox = pointerWithin(args);
    if (inBox.length === 0 || tokens.length === 0) return inBox;
    return closestCenter({ ...args, droppableContainers: tokens });
  };

  function paletteDropIndex({ active, over }: DragMoveEvent): number | undefined {
    if (!over) return undefined;
    if (over.id === BOX_ID) return items.length;
    const index = items.findIndex((item) => item.key === over.id);
    const rect = active.rect.current.translated;
    if (index < 0 || !rect) return undefined;
    const after = rect.left + rect.width / 2 > over.rect.left + over.rect.width / 2;
    return index + (after ? 1 : 0);
  }

  function dragStart({ active }: DragStartEvent) {
    const fromPalette = active.data.current?.token as FormulaToken | undefined;
    setDragged(fromPalette ?? items.find((item) => item.key === active.id)?.token);
  }

  function dragMove(event: DragMoveEvent) {
    if (!String(event.active.id).startsWith(PALETTE_PREFIX)) return;
    const index = paletteDropIndex(event);
    if (index !== dropIndex) setDropIndex(index);
  }

  function dragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const fromPalette = active.data.current?.token as FormulaToken | undefined;
    if (fromPalette) {
      const index = paletteDropIndex(event);
      if (index != null) update(items.toSpliced(index, 0, toItem(fromPalette)));
    } else if (over && active.id !== over.id) {
      const from = items.findIndex((item) => item.key === active.id);
      const to = items.findIndex((item) => item.key === over.id);
      if (from >= 0 && to >= 0) update(arrayMove(items, from, to));
    }
    dragDone();
  }

  function dragDone() {
    setDragged(undefined);
    setDropIndex(undefined);
  }

  const marker = <span className="-mx-1 h-6 w-0.5 shrink-0 rounded-full bg-primary" aria-hidden />;
  const symbols: FormulaToken[] = [
    ...FORMULA_OPERATORS.map((operator) => ({ operator })),
    ...FORMULA_PARENTHESES.map((parenthesis) => ({ parenthesis })),
  ];

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={dragStart}
      onDragMove={dragMove}
      onDragEnd={dragEnd}
      onDragCancel={dragDone}
    >
      <div className="flex flex-col gap-3">
        <div
          ref={setBoxRef}
          id={id}
          aria-invalid={invalid}
          className={cn(
            "flex min-h-24 flex-wrap content-start items-center gap-1.5 rounded-lg border border-input p-2 transition-colors dark:bg-input/30",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            dropIndex != null && "border-ring ring-3 ring-ring/50",
          )}
        >
          {items.length === 0 && dropIndex == null && (
            <span className="px-1 text-sm text-muted-foreground">{t("placeholder")}</span>
          )}
          <SortableContext items={items.map((item) => item.key)} strategy={rectSortingStrategy}>
            {items.map((item, index) => (
              <FormulaBoxToken
                key={item.key}
                id={item.key}
                token={item.token}
                label={tokenLabel(item.token)}
                before={dropIndex === index ? marker : undefined}
                highlighted={errorIndex === index}
                onRemove={() => remove(item.key)}
                disabled={disabled}
              />
            ))}
          </SortableContext>
          {dropIndex != null && dropIndex === items.length && items.length > 0 && marker}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {symbols.map((token) => (
            <PaletteToken
              key={JSON.stringify(token)}
              token={token}
              label={tokenLabel(token)}
              onAdd={() => add(token)}
              disabled={disabled}
            />
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => {
                // Enter adds the number instead of submitting the form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNumber();
                }
              }}
              placeholder={t("number")}
              aria-label={t("number")}
              className="h-7 w-28"
              disabled={disabled}
            />
            <Button type="button" variant="outline" size="sm" onClick={addNumber} disabled={disabled}>
              {t("addNumber")}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="current">
          <TabsList>
            <TabsTrigger value="current">{t("currentPeriod")}</TabsTrigger>
            <TabsTrigger value="previous">{t("previousPeriod")}</TabsTrigger>
          </TabsList>
          {(["current", "previous"] as const).map((period) => (
            <TabsContent key={period} value={period} className="flex flex-col gap-3">
              {period === "previous" && <p className="text-muted-foreground">{t("previousDescription")}</p>}
              <FieldPalette
                groups={groups}
                period={period}
                fieldId={fieldId}
                onAdd={add}
                disabled={disabled}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* The overlay is fixed-positioned, so it's rendered outside the dialog: the dialog's transform
          would otherwise make it positioned relative to the dialog instead of the viewport. */}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragged && <TokenContent token={dragged} label={tokenLabel(dragged)} className="shadow-md" />}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

// The fields of one period as tokens, by group. A field can't use its own current value, so the
// edited field is left out of the current period.
function FieldPalette({
  groups,
  period,
  fieldId,
  onAdd,
  disabled,
}: {
  groups: FormulaFieldGroup[];
  period: FormulaPeriod;
  fieldId?: number;
  onAdd: (token: FormulaToken) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("FormulaEditor");
  const available = groups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => period === "previous" || field.id !== fieldId),
    }))
    .filter((group) => group.fields.length > 0);

  if (available.length === 0) return <p className="text-muted-foreground">{t("noFields")}</p>;

  return available.map((group) => (
    <div key={group.id} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{group.name}</span>
      <div className="flex flex-wrap gap-1.5">
        {group.fields.map((field) => {
          const token = { field: field.id, period };
          return (
            <PaletteToken
              key={field.id}
              token={token}
              label={field.name}
              onAdd={() => onAdd(token)}
              disabled={disabled}
            />
          );
        })}
      </div>
    </div>
  ));
}

// Looks of a token, shared by the box, the palette and the dragged copy.
function TokenContent({
  token,
  label,
  className,
  children,
}: {
  token: FormulaToken;
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={cn(TOKEN_BASE, tokenClassName(token), className)}>
      {"field" in token && token.period === "previous" && <HistoryIcon className="size-3.5" />}
      {label}
      {children}
    </span>
  );
}

// Token below the box: clicking adds it to the end of the formula, dragging to a given place.
function PaletteToken({
  token,
  label,
  onAdd,
  disabled,
}: {
  token: FormulaToken;
  label: string;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("FormulaEditor");
  const { setNodeRef, listeners } = useDraggable({
    id: `${PALETTE_PREFIX}${JSON.stringify(token)}`,
    data: { token },
    disabled,
  });
  const previous = "field" in token && token.period === "previous";

  return (
    <button
      ref={setNodeRef}
      type="button"
      // Only the pointer drags: Enter and Space click the button.
      onPointerDown={(e) => listeners?.onPointerDown?.(e)}
      onClick={onAdd}
      disabled={disabled}
      aria-label={previous ? t("previousValue", { name: label }) : label}
      className="cursor-grab touch-none rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
    >
      <TokenContent token={token} label={label} className="hover:brightness-95 dark:hover:brightness-125" />
    </button>
  );
}

// Token in the box, reordered by dragging. before is shown in front of it, e.g. a drop marker.
function FormulaBoxToken({
  id,
  token,
  label,
  before,
  highlighted,
  onRemove,
  disabled,
}: {
  id: string;
  token: FormulaToken;
  label: string;
  before?: React.ReactNode;
  highlighted: boolean;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("FormulaEditor");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const previous = "field" in token && token.period === "previous";
  const name = previous ? t("previousValue", { name: label }) : label;

  return (
    <>
      {before}
      <span
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        {...attributes}
        {...listeners}
        onKeyDown={(e) => {
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onRemove();
          } else listeners?.onKeyDown?.(e);
        }}
        aria-label={name}
        className={cn(
          "cursor-grab touch-none rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing",
          isDragging && "opacity-40",
        )}
      >
        <TokenContent
          token={token}
          label={label}
          className={cn("pr-1", highlighted && "border-destructive ring-3 ring-destructive/20")}
        >
          <button
            type="button"
            tabIndex={-1}
            // Clicking the button mustn't start dragging the token.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            disabled={disabled}
            aria-label={t("remove", { name })}
            className="rounded-sm p-0.5 opacity-60 hover:bg-foreground/10 hover:opacity-100"
          >
            <XIcon className="size-3" />
          </button>
        </TokenContent>
      </span>
    </>
  );
}
