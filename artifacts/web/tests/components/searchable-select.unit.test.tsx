import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "@/components/ui/searchable-select";

// jsdom não implementa scrollIntoView, usado pelo cmdk ao montar os itens.
Element.prototype.scrollIntoView = vi.fn();

describe("SearchableSelect — robustez a labels duplicados (#121)", () => {
  it("mantém os dois itens de mesmo label selecionáveis, com o value correto", async () => {
    const onChange = vi.fn();
    const options = [
      { value: "1", label: "João Silva" },
      { value: "2", label: "João Silva" },
    ];
    render(<SearchableSelect value="" onChange={onChange} options={options} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));

    // Antes do fix, o cmdk deduplicava por value=label → só 1 item renderizava.
    const items = screen.getAllByText("João Silva");
    expect(items).toHaveLength(2);

    // Selecionar o SEGUNDO homônimo → onChange com o value do 2º ("2").
    await user.click(items[1]);
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("filtra por nome (keywords) mesmo com value = id", async () => {
    const onChange = vi.fn();
    const options = [
      { value: "10", label: "Motorista Carreteiro" },
      { value: "20", label: "Ajudante de Obra" },
    ];
    render(<SearchableSelect value="" onChange={onChange} options={options} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Buscar..."), "ajud");

    // Busca por nome funciona apesar do value ser o id.
    expect(screen.queryByText("Motorista Carreteiro")).not.toBeInTheDocument();
    expect(screen.getByText("Ajudante de Obra")).toBeInTheDocument();
  });

  it("opção de value vazio (ex.: “Todos”) continua selecionável (#123)", async () => {
    const onChange = vi.fn();
    const options = [
      { value: "", label: "Todos" },
      { value: "1", label: "Filial A" },
    ];
    render(
      <SearchableSelect value="1" onChange={onChange} options={options} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("Todos"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
