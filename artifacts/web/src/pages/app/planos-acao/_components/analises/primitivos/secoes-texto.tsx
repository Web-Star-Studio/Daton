import { AutoGrowTextarea } from "../../auto-grow-textarea";

export type Secao<K extends string> = {
  key: K;
  label: string;
  placeholder?: string;
};

export function SecoesTexto<K extends string>({
  secoes,
  value,
  onChange,
  readOnly = false,
}: {
  secoes: ReadonlyArray<Secao<K>>;
  value: Partial<Record<K, string>>;
  onChange: (next: Partial<Record<K, string>>) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-3">
      {secoes.map((secao) => (
        <div key={secao.key}>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {secao.label}
          </label>
          <AutoGrowTextarea
            value={value[secao.key] ?? ""}
            onChange={(e) =>
              onChange({ ...value, [secao.key]: e.target.value })
            }
            placeholder={secao.placeholder}
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  );
}
