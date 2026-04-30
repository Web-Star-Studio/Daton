const INFOSIMPLES_CPF_URL =
  "https://api.infosimples.com/api/v2/consultas/receita-federal/cpf";
const DEFAULT_TIMEOUT_SECONDS = "300";

export type InfosimplesCpfResult = {
  nome: string;
  cpf: string;
  dataNascimento: string | null;
  situacaoCadastral: string | null;
  nomeSocial: string | null;
  anoObito: string | null;
};

export class InfosimplesError extends Error {
  constructor(
    public readonly code: number,
    public readonly codeMessage: string,
    public readonly errors: string[],
  ) {
    super(codeMessage || `Infosimples error ${code}`);
    this.name = "InfosimplesError";
  }
}

type InfosimplesResponse = {
  code: number;
  code_message: string;
  errors?: string[];
  data?: Array<{
    nome?: string;
    cpf?: string;
    data_nascimento?: string;
    situacao_cadastral?: string;
    nome_social?: string;
    ano_obito?: string;
  }>;
};

function getToken(): string {
  const token = process.env.INFO_SIMPLES;
  if (!token) {
    throw new Error("INFO_SIMPLES is required");
  }
  return token;
}

export async function lookupCpfReceitaFederal(input: {
  cpf: string;
  birthdate: string;
}): Promise<InfosimplesCpfResult> {
  const token = getToken();
  const body = new URLSearchParams({
    token,
    cpf: input.cpf,
    birthdate: input.birthdate,
    timeout: DEFAULT_TIMEOUT_SECONDS,
  });

  const response = await fetch(INFOSIMPLES_CPF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as InfosimplesResponse;

  if (payload.code !== 200) {
    throw new InfosimplesError(
      payload.code,
      payload.code_message,
      payload.errors ?? [],
    );
  }

  const entry = payload.data?.[0];
  if (!entry?.nome) {
    throw new InfosimplesError(
      payload.code,
      "Resposta da Infosimples sem dados de CPF",
      [],
    );
  }

  return {
    nome: entry.nome,
    cpf: entry.cpf ?? input.cpf,
    dataNascimento: entry.data_nascimento ?? null,
    situacaoCadastral: entry.situacao_cadastral ?? null,
    nomeSocial: entry.nome_social ?? null,
    anoObito: entry.ano_obito ?? null,
  };
}
