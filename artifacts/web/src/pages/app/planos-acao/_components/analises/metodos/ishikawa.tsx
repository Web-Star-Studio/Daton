import { CadeiaPorques } from "../primitivos/cadeia-porques";
import { ListaAgrupada } from "../primitivos/lista-agrupada";
import {
  ISHIKAWA_CATEGORIES,
  ISHIKAWA_CATEGORY_LABELS,
  newId,
  type IshikawaData,
} from "../types";

/** Levanta causas nos 6M, escolhe a mais provável, e essa causa puxa os 5 porquês. */
export function Ishikawa({
  data,
  onChange,
  readOnly,
}: {
  data: IshikawaData;
  onChange: (next: IshikawaData) => void;
  readOnly?: boolean;
}) {
  const causas = data.causes ?? [];
  const selecionada = causas.find((c) => c.id === data.selectedCauseId);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Causas por categoria (6M) — marque a mais provável
        </p>
        <ListaAgrupada
          categorias={ISHIKAWA_CATEGORIES}
          rotulos={ISHIKAWA_CATEGORY_LABELS}
          itens={causas}
          onChange={(next) => onChange({ ...data, causes: next })}
          selectedId={data.selectedCauseId}
          onSelect={(id) => onChange({ ...data, selectedCauseId: id })}
          readOnly={readOnly}
          novoItem={(category) => ({ id: newId(), category, text: "" })}
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          5 Porquês {selecionada?.text ? `— sobre "${selecionada.text}"` : ""}
        </p>
        {!selecionada && (
          <p className="mb-2 text-[12px] text-muted-foreground">
            Marque acima a causa mais provável para aprofundá-la nos porquês.
          </p>
        )}
        <CadeiaPorques
          whys={data.whys ?? []}
          onChange={(whys) => onChange({ ...data, whys })}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
