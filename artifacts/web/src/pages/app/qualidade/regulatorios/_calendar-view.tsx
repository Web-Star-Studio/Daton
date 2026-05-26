import { useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RegulatoryDocument } from "@workspace/api-client-react";

// --- Constants ---

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const IDENTIFIER_TYPE_SHORT_LABELS: Record<string, string> = {
  licenca_ambiental: "Lic. Amb.",
  avcb: "AVCB",
  alvara: "Alvará",
  outorga: "Outorga",
  certidao: "Certidão",
  outro: "Outro",
};

// Color buckets by status. Chips são pill-style com leve background + ring sutil.
const STATUS_CHIP_CLASSES: Record<string, string> = {
  vencido:
    "bg-red-100 text-red-700 ring-1 ring-red-200 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
  a_vencer:
    "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200 hover:bg-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-500/30",
  vigente:
    "bg-green-100 text-green-700 ring-1 ring-green-200 hover:bg-green-200 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-500/30",
};

// --- Helpers ---

// Parse YYYY-MM-DD into a local Date (avoiding TZ shifts that `new Date(iso)` causes).
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isoKeyFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function chipLabel(doc: RegulatoryDocument): string {
  const type = IDENTIFIER_TYPE_SHORT_LABELS[doc.identifierType] ?? doc.identifierType;
  if (doc.documentNumber) return `${type} · ${doc.documentNumber}`;
  if (doc.unitName) return `${type} · ${doc.unitName}`;
  return type;
}

// Build the 6-week (42-day) grid that anchors on the Sunday of the week of day 1.
// Always returns exactly 42 cells — easier to render and prevents jumpy heights.
function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  // Day-of-week of the 1st (0 = Sunday).
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return cells;
}

// --- Component ---

export function RegulatoryCalendarView({
  documents,
  onDocClick,
}: {
  documents: RegulatoryDocument[];
  onDocClick: (doc: RegulatoryDocument) => void;
}) {
  // Anchor month/year — initialize to current month, but allow user to navigate.
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));

  // Day-of-month -> list of docs vencendo nesse dia (within current cursor month).
  // We bucket by ISO key so we can show docs from neighboring months greyed out
  // when they spill into the visible grid.
  const docsByDay = useMemo(() => {
    const map = new Map<string, RegulatoryDocument[]>();
    for (const doc of documents) {
      if (!doc.expirationDate) continue;
      const key = doc.expirationDate.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(doc);
      else map.set(key, [doc]);
    }
    return map;
  }, [documents]);

  const gridCells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  // For "+N mais" expansion: which cell is currently expanded.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  function goPrev() {
    setCursor((c) => {
      const m = c.month - 1;
      if (m < 0) return { year: c.year - 1, month: 11 };
      return { year: c.year, month: m };
    });
    setExpandedKey(null);
  }

  function goNext() {
    setCursor((c) => {
      const m = c.month + 1;
      if (m > 11) return { year: c.year + 1, month: 0 };
      return { year: c.year, month: m };
    });
    setExpandedKey(null);
  }

  function goToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setExpandedKey(null);
  }

  const monthLabel = `${MONTH_NAMES[cursor.month]} ${cursor.year}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Header: navigation */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goPrev}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold min-w-[160px] text-center capitalize">
            {monthLabel}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={goNext}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToday}>
          <Calendar className="h-3.5 w-3.5 mr-1" />
          Hoje
        </Button>
      </div>

      {/* Grid */}
      <div className="rounded-lg border overflow-hidden bg-card">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground text-center"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {gridCells.map((date, idx) => {
            const inCurrentMonth = date.getMonth() === cursor.month;
            const isToday = isSameDay(date, today);
            const key = isoKeyFor(date);
            const docsForDay = docsByDay.get(key) ?? [];
            const isExpanded = expandedKey === key;
            const visibleDocs = isExpanded ? docsForDay : docsForDay.slice(0, 2);
            const hiddenCount = docsForDay.length - visibleDocs.length;

            // Border-right except last col; border-bottom except last row.
            const isLastCol = (idx + 1) % 7 === 0;
            const isLastRow = idx >= 35;

            return (
              <div
                key={key}
                className={[
                  "min-h-[88px] p-1.5 flex flex-col gap-1 relative",
                  !isLastCol && "border-r",
                  !isLastRow && "border-b",
                  !inCurrentMonth && "bg-muted/20",
                  isToday && "ring-2 ring-inset ring-primary/60 z-[1]",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div
                  className={[
                    "text-[11px] font-medium leading-none",
                    inCurrentMonth ? "text-foreground" : "text-muted-foreground/50",
                    isToday && "text-primary",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {date.getDate()}
                </div>

                {/* Chips */}
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {visibleDocs.map((doc) => (
                    <button
                      type="button"
                      key={doc.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDocClick(doc);
                      }}
                      title={`${chipLabel(doc)}${doc.unitName ? ` · ${doc.unitName}` : ""}`}
                      className={[
                        "text-[10px] px-1.5 py-0.5 rounded text-left truncate cursor-pointer transition",
                        STATUS_CHIP_CLASSES[doc.status] ?? STATUS_CHIP_CLASSES.vigente,
                      ].join(" ")}
                    >
                      {chipLabel(doc)}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedKey(key);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded text-left text-muted-foreground hover:bg-muted/60 transition"
                    >
                      + {hiddenCount} mais
                    </button>
                  )}
                  {isExpanded && docsForDay.length > 2 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedKey(null);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded text-left text-muted-foreground hover:bg-muted/60 transition"
                    >
                      recolher
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-200 ring-1 ring-red-300 dark:bg-red-500/30 dark:ring-red-500/40" />
          Vencido
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-yellow-200 ring-1 ring-yellow-300 dark:bg-yellow-500/30 dark:ring-yellow-500/40" />
          A vencer
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-200 ring-1 ring-green-300 dark:bg-green-500/30 dark:ring-green-500/40" />
          Vigente
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          {documents.length} documento{documents.length === 1 ? "" : "s"} no escopo
        </span>
      </div>
    </div>
  );
}
