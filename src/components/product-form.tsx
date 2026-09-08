import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { ProductGender, Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Product = Tables<"products">;

// RF03 — pendência registrada no PROGRESSO.md: ao trocar a imagem de um
// produto, o path novo sempre leva um timestamp (linha abaixo, em
// handleSubmit), então o arquivo antigo nunca é sobrescrito — só órfão no
// bucket. Extrai o path relativo de uma URL pública do Storage para poder
// removê-lo depois que a troca for confirmada.
function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

const GENDER_OPTIONS: { value: ProductGender; label: string }[] = [
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "unissex", label: "Unissex" },
];

// Cadastro/edição de produto (Tela 5, RF03). Custo e preço de venda não são
// definidos aqui — vêm do módulo de Compras (RF04/RF06); aqui só se cadastra
// a "ficha" do produto e o markup usado para sugerir o preço a cada compra.
export function ProductForm({ product }: { product?: Product }) {
  const navigate = useNavigate();
  const isEdit = !!product;

  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [gender, setGender] = useState<ProductGender | undefined>(product?.gender);
  const [ml, setMl] = useState(product?.ml.toString() ?? "");
  const [markupPercent, setMarkupPercent] = useState(product?.markup_percent.toString() ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.image_url ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RF03 (v1.1) — recálculo do preço de venda sugerido ao editar o markup:
  // só se aplica na edição de um produto que já teve ao menos uma compra
  // (current_unit_cost_brl definido). Cadastro novo nunca mostra este campo.
  const currentUnitCostBrl = product?.current_unit_cost_brl ?? null;
  const showSuggestedPrice = isEdit && currentUnitCostBrl != null;
  const [salePrice, setSalePrice] = useState(product?.current_sale_price?.toString() ?? "");
  const [salePriceTouched, setSalePriceTouched] = useState(false);

  const suggestedSalePrice =
    currentUnitCostBrl != null
      ? Math.round(currentUnitCostBrl * (1 + (Number(markupPercent) || 0) / 100) * 100) / 100
      : 0;

  const isValid =
    Boolean(name.trim() && brand.trim() && gender && ml && markupPercent) &&
    (!showSuggestedPrice || (salePriceTouched ? Number(salePrice) > 0 : suggestedSalePrice > 0));

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || !gender) {
      setError(
        showSuggestedPrice
          ? "Preencha nome, marca, gênero, ml, markup e o preço de venda antes de salvar."
          : "Preencha nome, marca, gênero, ml e markup antes de salvar.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    const id = product?.id ?? crypto.randomUUID();
    const previousImageUrl = product?.image_url ?? null;
    let imageUrl = previousImageUrl;

    if (imageFile) {
      const ext = imageFile.name.split(".").pop();
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("products")
        .upload(path, imageFile, { upsert: true });

      if (uploadError) {
        setSubmitting(false);
        setError(`Falha ao enviar a imagem: ${uploadError.message}`);
        return;
      }

      imageUrl = supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
    }

    const payload = {
      name: name.trim(),
      brand: brand.trim(),
      gender,
      ml: Number(ml),
      markup_percent: Number(markupPercent),
      description: description.trim() || null,
      image_url: imageUrl,
    };

    const finalSalePrice = salePriceTouched ? Number(salePrice) : suggestedSalePrice;

    const { error: saveError } = isEdit
      ? await supabase
          .from("products")
          .update({
            ...payload,
            active,
            ...(showSuggestedPrice ? { current_sale_price: finalSalePrice } : {}),
          })
          .eq("id", id)
      : await supabase.from("products").insert({ id, ...payload });

    setSubmitting(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    // Só remove a imagem antiga depois que a troca já está salva no produto
    // (nunca antes) — melhor um arquivo órfão remanescente do que um produto
    // sem nenhuma imagem válida caso o passo acima tivesse falhado. Best-effort:
    // uma falha aqui não desfaz o salvamento, que já foi concluído com sucesso.
    if (imageFile && previousImageUrl && previousImageUrl !== imageUrl) {
      const previousPath = extractStoragePath(previousImageUrl, "products");
      if (previousPath) {
        const { error: removeError } = await supabase.storage
          .from("products")
          .remove([previousPath]);
        if (removeError) console.warn("Falha ao remover imagem antiga:", removeError.message);
      }
    }

    toast.success(
      showSuggestedPrice
        ? `Produto atualizado. Preço de venda: R$ ${finalSalePrice.toFixed(2)}.`
        : isEdit
          ? "Produto atualizado."
          : "Produto cadastrado.",
    );
    navigate({ to: "/master/catalogo" });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      <div>
        <Label>Imagem</Label>
        <div className="mt-1.5 flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
            {imagePreview ? (
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-center text-xs text-muted-foreground">
                sem foto
              </div>
            )}
          </div>
          <Input type="file" accept="image/*" onChange={handleImageChange} className="max-w-xs" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nome *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand">Marca *</Label>
          <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">Gênero *</Label>
          <Select
            {...(gender ? { value: gender } : {})}
            onValueChange={(v) => setGender(v as ProductGender)}
          >
            <SelectTrigger id="gender">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ml">ML *</Label>
          <Input
            id="ml"
            type="number"
            min="0"
            step="0.1"
            value={ml}
            onChange={(e) => setMl(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="markup">Markup (%) *</Label>
          <Input
            id="markup"
            type="number"
            min="0"
            step="0.1"
            value={markupPercent}
            onChange={(e) => setMarkupPercent(e.target.value)}
            required
          />
        </div>
      </div>

      {showSuggestedPrice && (
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="sale-price">Novo preço de venda sugerido (R$) *</Label>
          <Input
            id="sale-price"
            type="number"
            min="0"
            step="0.01"
            className="tabular"
            value={salePriceTouched ? salePrice : suggestedSalePrice.toFixed(2)}
            onChange={(e) => {
              setSalePrice(e.target.value);
              setSalePriceTouched(true);
            }}
            required
          />
          <p className="text-xs text-muted-foreground">
            Sugerido a partir do custo unitário vigente (R$ {currentUnitCostBrl!.toFixed(2)}) ×
            markup. Ajuste se quiser usar outro valor.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {isEdit && (
        <div className="flex items-center gap-3">
          <Switch checked={active} onCheckedChange={setActive} id="active" />
          <Label htmlFor="active">Produto ativo</Label>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
