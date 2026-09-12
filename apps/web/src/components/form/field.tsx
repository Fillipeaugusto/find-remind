import { cn } from "cn";

/**
 * Estilos compartilhados dos campos com label flutuante (estilo checkout):
 * - ocioso: o label fica dentro da caixa, como placeholder;
 * - com foco ou valor: o label encolhe para uma legenda no canto superior esquerdo
 *   e o valor aparece abaixo, dentro da mesma caixa;
 * - erro: borda e texto auxiliar vermelhos.
 */
export const fieldShell =
  "relative flex min-h-[3.25rem] w-full rounded-xl border border-input bg-background text-foreground transition-[border-color,box-shadow] duration-150 " +
  "focus-within:border-foreground focus-within:shadow-[inset_0_0_0_1px_var(--foreground)] " +
  "has-disabled:cursor-not-allowed has-disabled:bg-muted/40 has-disabled:opacity-70 " +
  "has-aria-invalid:border-destructive has-aria-invalid:focus-within:shadow-[inset_0_0_0_1px_var(--destructive)]";

export const fieldControl =
  "peer w-full min-w-0 bg-transparent px-3.5 pt-5.5 pb-1.5 text-[15px] leading-6 outline-none placeholder-transparent disabled:cursor-not-allowed";

export const fieldLabelBase =
  "pointer-events-none absolute left-3.5 z-10 origin-left truncate text-muted-foreground transition-all duration-150 ease-out " +
  "max-w-[calc(100%-1.75rem)]";

/** Label na posição de placeholder (campo ocioso e vazio). */
export const fieldLabelResting = "top-1/2 -translate-y-1/2 text-[15px]";

/** Label encolhido como legenda (foco ou valor). */
export const fieldLabelFloated = "top-2 translate-y-0 text-[11.5px] font-medium tracking-wide";

/** Variante via `peer`: flutua quando o controle está focado ou preenchido. */
export const fieldLabelPeer =
  fieldLabelResting +
  " peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11.5px] peer-focus:font-medium peer-focus:tracking-wide " +
  "peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11.5px] peer-[:not(:placeholder-shown)]:font-medium peer-[:not(:placeholder-shown)]:tracking-wide";

export function FieldMessage({
  error,
  hint,
  id,
}: {
  error?: string;
  hint?: React.ReactNode;
  id?: string;
}) {
  if (!error && !hint) return null;
  return (
    <p
      id={id}
      role={error ? "alert" : undefined}
      className={cn("mt-1.5 px-0.5 text-[13px] leading-5", error ? "text-destructive" : "text-muted-foreground")}
    >
      {error ?? hint}
    </p>
  );
}
