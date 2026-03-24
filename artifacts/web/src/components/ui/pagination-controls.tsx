import { Button } from "@/components/ui/button";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

export function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  disabled = false,
}: PaginationControlsProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? "Nenhum registro" : `${start}-${end} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">
          Página {totalPages === 0 ? 0 : page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || totalPages === 0 || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
