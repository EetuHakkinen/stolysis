"use client";

import { useId } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Table body whose SortableTableRows are reordered by dragging their handles or with the keyboard.
// onMove gets the dragged row's old and new index in ids.
export function SortableTableBody({
  ids,
  onMove,
  children,
}: {
  ids: number[];
  onMove: (from: number, to: number) => void;
  children: React.ReactNode;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function dragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onMove(ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
  }

  return (
    // A fixed id keeps dnd-kit's generated attributes the same on the server and the client.
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
      <TableBody>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </TableBody>
    </DndContext>
  );
}

// Row of a SortableTableBody: a drag handle cell followed by the row's own cells.
export function SortableTableRow({
  id,
  handleLabel,
  children,
}: {
  id: number;
  handleLabel: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative bg-background", isDragging && "z-10 shadow-md")}
    >
      <TableCell className="w-0">
        <Button
          ref={setActivatorNodeRef}
          variant="ghost"
          size="icon-sm"
          className="cursor-grab touch-none active:cursor-grabbing"
          aria-label={handleLabel}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon />
        </Button>
      </TableCell>
      {children}
    </TableRow>
  );
}
