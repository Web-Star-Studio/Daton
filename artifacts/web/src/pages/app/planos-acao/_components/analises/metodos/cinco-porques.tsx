import { CadeiaPorques } from "../primitivos/cadeia-porques";
import type { FiveWhysData } from "../types";

export function CincoPorques({
  data,
  onChange,
  readOnly,
}: {
  data: FiveWhysData;
  onChange: (next: FiveWhysData) => void;
  readOnly?: boolean;
}) {
  return (
    <CadeiaPorques
      whys={data.whys ?? []}
      onChange={(whys) => onChange({ whys })}
      readOnly={readOnly}
    />
  );
}
