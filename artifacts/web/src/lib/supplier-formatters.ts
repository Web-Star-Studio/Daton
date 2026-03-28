export function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatSupplierLegalIdentifier(value: string, personType: "pj" | "pf") {
  const digits = normalizeDigits(value).slice(0, personType === "pj" ? 14 : 11);

  if (personType === "pj") {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.replace(/^(\d{2})(\d+)/, "$1.$2");
    if (digits.length <= 8) return digits.replace(/^(\d{2})(\d{3})(\d+)/, "$1.$2.$3");
    if (digits.length <= 12) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/, "$1.$2.$3/$4");
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*$/, "$1.$2.$3/$4-$5");
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.replace(/^(\d{3})(\d+)/, "$1.$2");
  if (digits.length <= 9) return digits.replace(/^(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*$/, "$1.$2.$3-$4");
}

export function formatSupplierPostalCode(value: string) {
  const digits = normalizeDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.replace(/^(\d{5})(\d+)/, "$1-$2");
}

export function supplierLegalIdentifierPlaceholder(personType: "pj" | "pf") {
  return personType === "pj" ? "00.000.000/0000-00" : "000.000.000-00";
}
