import { Redirect } from "wouter";

// Cargos foram consolidados em "Cargos e competências" (Aprendizagem). A rota
// antiga redireciona para não quebrar links/bookmarks.
export default function OrganizacaoPositionsPage() {
  return <Redirect to="/aprendizagem/cargos" />;
}
