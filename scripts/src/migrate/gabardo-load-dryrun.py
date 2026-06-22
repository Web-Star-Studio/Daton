#!/usr/bin/env python3
"""
DRY-RUN (no writes) for the Transportes Gabardo (org 2) employee bulk load + enrich.

- Normalizes/validates every spreadsheet row.
- Maps filiais -> existing unit ids; terceiros -> unitId NULL + contractType 'terceirizado'.
- Canonical PT values: gender (Masculino/Feminino), education (padronizado).
- Classifies: INSERT (new) / ENRICH (CPF already in system -> fill-if-empty) / REVIEW.
- Emits /tmp/gabardo-load-plan.json for the Drizzle write step.

Reads /tmp/gabardo-existing-employees.json (full fields, from dump script) for dedup+enrich.
"""
import json
import re
import datetime
import unicodedata
from collections import Counter, OrderedDict, defaultdict

import openpyxl

XLSX = "CARGA_DATON_22_06_FINAL.xlsx"
ORG_ID = 2

# Pseudo-filiais a criar p/ motoristas de empresas terceiras. Decisão do cliente
# (Aline/SGI): "subir como motorista terceiro, no lugar de filial cadastrada",
# "mesmo tratamento e controles que os motoristas Gabardo", "precisa estar nos
# treinamentos". -> criamos uma unidade e vinculamos via unitId (não fica nulo).
UNITS_TO_CREATE = [
    {"key": "__TERCEIRO__", "name": "MOTORISTA TERCEIRO", "code": "TERCEIRO", "type": "filial"},
    {"key": "__INTEGRADO__", "name": "INTEGRADO GABARDO", "code": "INTEGRADO", "type": "filial"},
]
FILIAL_TO_UNIT = {
    "PORTO ALEGRE - RS": 3, "ANAPOLIS CARREGAMENTO - GO": 9, "PIRACICABA - SP": 10,
    "CAMACARI - BA": 15, "SÃO BERNARDO DO CAMPO - SP": 8, "ANAPOLIS FROTA - GO": 12,
    "PORTO REAL - RJ": 7, "IRACEMAPOLIS - SP": 11, "DUQUE DE CAXIAS - RJ": 6,
    "CARIACICA - ES": 5, "SAO JOSE DOS PINHAIS - PR": 4, "PALHOCA - SC": 13,
    "EUSEBIO - CE": 14, "SUAPE - PE": 19,
    # sentinels resolvidos p/ unit id real no passo de inserção (Drizzle)
    "MOTORISTA TERCEIRO": "__TERCEIRO__", "INTEGRADO GABARDO": "__INTEGRADO__",
}
NO_UNIT_LABELS = {"MOTORISTA TERCEIRO", "INTEGRADO GABARDO"}  # -> terceirizado + pseudo-filial

SYSTEM_DEPARTMENTS = {
    "Abastecimento", "Administrativo", "Almoxarifado", "Borracharia", "Carregamento",
    "Comercial", "Compras", "Diretoria", "Financeiro", "Frota", "Frota - Motorista",
    "Higiene e Limpeza", "Lavagem", "Marketing", "Obra - Manutenção",
    "Oficina - Manutenção", "Operacional", "Pátio", "Pintura", "Portaria e Vigia",
    "Psicologia", "Rastreador", "Recepção", "Recursos Humanos e DP",
    "Segurança do Trabalho", "SGI - Sistema de Gestão Integrado",
    "TI - Tecnologia da Informação",
}

CONTRACT_MAP = {"CLT": "clt", "PJ": "pj", "AP": "intern", "APRENDIZ": "intern",
                "ESTAGIARIO": "intern", "TEMPORARIO": "temporary",
                "TERCEIRIZADO": "terceirizado", "TERCEIRO": "terceirizado"}
STATUS_MAP = {"ATIVO": "active", "ATIVA": "active", "INATIVO": "inactive",
              "DEMITIDO": "inactive", "AFASTADO": "on_leave"}
GENDER_MAP = {"MASCULINO": "Masculino", "FEMININO": "Feminino",
              "NAO BINARIO": "Não Binário", "OUTRO": "Prefiro Não Informar"}
EDU_MAP = {
    "FUNDAMENTAL - INCOMPLETO": "Fundamental Incompleto",
    "FUNDAMENTAL - COMPLETO": "Fundamental Completo",
    "MEDIO - INCOMPLETO": "Médio Incompleto",
    "MEDIO - COMPLETO": "Médio Completo",
    "TECNICO - COMPLETO": "Técnico", "TECNICO": "Técnico",
    "SUPERIOR - INCOMPLETO": "Superior Incompleto",
    "SUPERIOR - COMPLETO": "Superior Completo",
    "POS-GRADUACAO (LATO SENSO) - COMPLETO": "Pós-Graduação",
    "POS-GRADUACAO (LATO SENSU) - COMPLETO": "Pós-Graduação",
    "POS-GRADUACAO - COMPLETO": "Pós-Graduação", "POS-GRADUACAO": "Pós-Graduação",
    "MESTRADO - COMPLETO": "Mestrado", "MESTRADO": "Mestrado",
    "DOUTORADO - COMPLETO": "Doutorado", "DOUTORADO": "Doutorado",
    "NAO APLICAVEL": "Não Aplicável",
}

# fields we may enrich on existing records (fill-if-empty)
ENRICH_FIELDS = ["email", "position", "department", "admissionDate", "unitId",
                 "birthDate", "gender", "education"]


def clean_ws(v):
    if v is None:
        return None
    s = str(v).replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def deacc_up(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def to_iso(v):
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.date().isoformat() if isinstance(v, datetime.datetime) else v.isoformat()
    s = str(v).strip()
    if not s:
        return None
    m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000 if y < 50 else 1900
        try:
            return datetime.date(y, mo, d).isoformat()
        except ValueError:
            return ("INVALID", s)
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    return ("INVALID", s)


def cpf_digits(v):
    return re.sub(r"\D", "", str(v)) if v is not None else ""


def cpf_check(d):
    if len(d) != 11 or d == d[0] * 11:
        return False
    for n in (9, 10):
        s = sum(int(d[i]) * ((n + 1) - i) for i in range(n))
        dig = (s * 10) % 11
        dig = 0 if dig == 10 else dig
        if dig != int(d[n]):
            return False
    return True


def is_empty(v):
    return v is None or (isinstance(v, str) and v.strip() == "")


def main():
    try:
        existing_list = json.load(open("/tmp/gabardo-existing-employees.json"))
    except FileNotFoundError:
        existing_list = []
        print("WARN: existing employees dump not found -> dedup/enrich skipped\n")
    existing_by_cpf = defaultdict(list)
    for e in existing_list:
        existing_by_cpf[e["cpf"]].append(e)
    existing_cpfs = set(existing_by_cpf.keys())

    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["DATON"]
    rows = list(ws.iter_rows(values_only=True))
    header = list(rows[0])
    idx = {h: i for i, h in enumerate(header)}
    data = rows[1:]

    def g(r, name):
        i = idx[name]
        return r[i] if i < len(r) else None

    sheet_cpf_counts = Counter(cpf_digits(g(r, "CPF")) for r in data if cpf_digits(g(r, "CPF")))
    sheet_dup_cpfs = {c for c, n in sheet_cpf_counts.items() if n > 1}

    plan, enrich, review = [], [], []
    depts_needed = set()
    positions_needed = OrderedDict()
    unmapped_filiais = set()
    flags = Counter()
    edu_unmapped = Counter()
    enrich_field_counts = Counter()
    terc_contract_fix = 0
    enrich_divergences = []  # info-only kept values

    for ln, r in enumerate(data, start=2):
        name = clean_ws(g(r, "Nome Completo"))
        if not name and not g(r, "CPF"):
            continue

        cpf_raw = clean_ws(g(r, "CPF"))
        d = cpf_digits(cpf_raw)
        filial = clean_ws(g(r, "Filial"))
        dept = clean_ws(g(r, "Departamento"))
        cargo = clean_ws(g(r, "Cargo"))
        admission = to_iso(g(r, "Data de Contratação"))
        birth = to_iso(g(r, "Data de Nascimento"))
        termination = to_iso(g(r, "Data de Demissão"))
        contract_raw = clean_ws(g(r, "Tipo de Contrato"))
        status_raw = clean_ws(g(r, "Status"))
        gender_raw = clean_ws(g(r, "Gênero"))
        edu_raw = clean_ws(g(r, "Escolaridade"))
        email = clean_ws(g(r, "E-mail"))

        row_flags = []
        is_terceiro = filial in NO_UNIT_LABELS

        # filial -> unit
        if filial in FILIAL_TO_UNIT:
            unit_id = FILIAL_TO_UNIT[filial]
            if is_terceiro:
                row_flags.append(f"terceiro -> pseudo-filial {filial!r} + terceirizado")
        else:
            unit_id = None
            unmapped_filiais.add(filial)
            row_flags.append(f"FILIAL não mapeada: {filial!r}")

        # department
        dept_final = None
        if dept:
            dept_final = dept
            if dept not in SYSTEM_DEPARTMENTS:
                depts_needed.add(dept)
                row_flags.append(f"departamento a criar: {dept!r}")
        else:
            row_flags.append("sem departamento")

        if cargo:
            positions_needed[cargo] = positions_needed.get(cargo, 0) + 1

        # contract type
        if is_terceiro:
            ct = "terceirizado"
        elif contract_raw:
            ct = CONTRACT_MAP.get(deacc_up(contract_raw))
            if ct is None:
                ct = "clt"
                row_flags.append(f"tipo de contrato desconhecido {contract_raw!r} -> clt")
        else:
            ct = "clt"

        # status
        st = STATUS_MAP.get(deacc_up(status_raw)) if status_raw else "active"
        if status_raw and st is None:
            st = "active"
            row_flags.append(f"status desconhecido {status_raw!r} -> active")

        # gender (canonical PT)
        gender = None
        if gender_raw:
            gender = GENDER_MAP.get(deacc_up(gender_raw))
            if gender is None:
                row_flags.append(f"gênero desconhecido {gender_raw!r}")

        # education (canonical PT)
        education = None
        if edu_raw:
            education = EDU_MAP.get(deacc_up(edu_raw))
            if education is None:
                education = edu_raw  # keep raw, flag
                edu_unmapped[edu_raw] += 1
                row_flags.append(f"escolaridade não padronizada {edu_raw!r}")

        if isinstance(admission, tuple):
            row_flags.append(f"data de contratação inválida {admission[1]!r}")
            admission = None
        if isinstance(birth, tuple):
            row_flags.append(f"data de nascimento inválida {birth[1]!r}")
            birth = None
        if isinstance(termination, tuple):
            termination = None
        if admission is None:
            row_flags.append("sem data de contratação")

        record = {
            "row": ln, "organizationId": ORG_ID, "unitId": unit_id, "name": name,
            "cpf": cpf_raw, "email": email, "phone": None, "position": cargo,
            "department": dept_final, "contractType": ct, "admissionDate": admission,
            "terminationDate": termination, "status": st, "birthDate": birth,
            "gender": gender, "education": education, "_flags": row_flags,
        }

        # ---- classification ----
        if not d:
            record["_reason"] = "sem CPF"; flags["sem_cpf"] += 1; review.append(record); continue
        if not cpf_check(d):
            record["_reason"] = "CPF dígito verificador inválido"; flags["cpf_invalido"] += 1; review.append(record); continue
        if d in sheet_dup_cpfs:
            record["_reason"] = "CPF duplicado na planilha"; flags["cpf_dup_planilha"] += 1; review.append(record); continue

        if d in existing_cpfs:
            ex = existing_by_cpf[d][0]
            sets = {}
            info = []
            for f in ENRICH_FIELDS:
                newv = record[f]
                if newv is None or (isinstance(newv, str) and newv.strip() == ""):
                    continue
                curv = ex.get(f)
                if is_empty(curv):
                    sets[f] = newv
                    enrich_field_counts[f] += 1
                elif str(curv) != str(newv) and f in ("position", "department", "unitId", "admissionDate"):
                    info.append(f"{f}: mantém {curv!r} (planilha tinha {newv!r})")
            # terceiro contract correction: only if current is the bare default 'clt'
            if is_terceiro and (ex.get("contractType") in (None, "", "clt")):
                sets["contractType"] = "terceirizado"
                terc_contract_fix += 1
            if info:
                enrich_divergences.append({"cpf": d, "name": ex["name"], "info": info})
            enrich.append({"id": ex["id"], "cpf": d, "name": ex["name"],
                           "set": sets, "info": info})
            continue

        # OK to insert (new)
        if not admission:
            flags["insert_sem_admissao"] += 1
        plan.append(record)

    # ---------------- REPORT ----------------
    P = print
    P("=" * 80)
    P("DRY-RUN — CARGA + ENRIQUECIMENTO — TRANSPORTES GABARDO (org 2)")
    P("=" * 80)
    P(f"Linhas na planilha                     : {len(data)}")
    P(f"  -> INSERIR (novos)                   : {len(plan)}")
    P(f"  -> ENRIQUECER (já existem, fill-if-empty): {len(enrich)}")
    P(f"  -> REVISÃO (pendências, fora)        : {len(review)}")
    P("")
    P(f"Catálogo: departamentos a criar={len(depts_needed)} {sorted(depts_needed)} | cargos a criar={len(positions_needed)}")
    P(f"Pseudo-filiais a criar: {[u['name'] for u in UNITS_TO_CREATE]}")
    for u in UNITS_TO_CREATE:
        n_ins = sum(1 for r in plan if r["unitId"] == u["key"])
        n_enr = sum(1 for e in enrich if e["set"].get("unitId") == u["key"])
        P(f"   {u['name']:20s}: {n_ins} inseridos + {n_enr} enriquecidos vinculados")
    P(f"Terceiros marcados 'terceirizado' (inseridos): {sum(1 for r in plan if r['contractType']=='terceirizado')}")
    P(f"Inseridos sem data de contratação      : {flags['insert_sem_admissao']} (campo nulo)")
    if edu_unmapped:
        P(f"Escolaridade fora do mapa (mantida crua): {dict(edu_unmapped)}")
    if unmapped_filiais:
        P(f"!!! FILIAIS NÃO MAPEADAS: {sorted(unmapped_filiais)}")
    P("")
    P("--- ENRIQUECIMENTO dos que já existem ---")
    P(f"  registros que receberão ao menos 1 campo: {sum(1 for e in enrich if e['set'])}")
    P(f"  (sem nada a preencher, já completos): {sum(1 for e in enrich if not e['set'])}")
    P("  campos preenchidos (quantos registros recebem cada):")
    for f in ENRICH_FIELDS:
        P(f"     {f:14s}: {enrich_field_counts[f]}")
    P(f"     contractType (correção terceiro): {terc_contract_fix}")
    if enrich_divergences:
        P(f"\n  divergências MANTIDAS (sistema diferente da planilha; não sobrescrito): {len(enrich_divergences)}")
        for dv in enrich_divergences[:8]:
            P(f"     {dv['name']}: {dv['info']}")
        if len(enrich_divergences) > 8:
            P(f"     ... (+{len(enrich_divergences)-8})")
    P("\n  amostra de enriquecimentos (3):")
    for e in [e for e in enrich if e["set"]][:3]:
        P(f"     [{e['id']}] {e['name']} -> {e['set']}")
    P("")
    P("--- amostra REVISÃO (3) ---")
    for rec in review[:3]:
        P(f"   linha {rec['row']} | {rec['_reason']} | {rec['name']} | cpf={rec['cpf']}")
    P("\n--- amostra INSERIR (2) ---")
    for rec in plan[:2]:
        P("   " + json.dumps({k: v for k, v in rec.items() if not k.startswith('_')}, ensure_ascii=False))

    out = {
        "orgId": ORG_ID,
        "unitsToCreate": UNITS_TO_CREATE,
        "departmentsToCreate": sorted(depts_needed),
        "positionsToCreate": list(positions_needed.keys()),
        "insert": [{k: v for k, v in r.items() if not k.startswith("_")} for r in plan],
        "enrich": enrich,
        "review": [{**{k: v for k, v in r.items() if k != "_flags"}, "flags": r["_flags"]} for r in review],
        "counts": {"sheet": len(data), "insert": len(plan), "enrich": len(enrich),
                   "enrichWithChanges": sum(1 for e in enrich if e["set"]), "review": len(review)},
    }
    json.dump(out, open("/tmp/gabardo-load-plan.json", "w", encoding="utf-8"), ensure_ascii=False)
    P("\n>>> plano escrito em /tmp/gabardo-load-plan.json")


if __name__ == "__main__":
    main()
