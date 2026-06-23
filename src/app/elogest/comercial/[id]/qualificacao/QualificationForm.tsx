"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUALIFICATION_CRITERIA,
  qualificationClassificationLabel,
} from "@/lib/commercial-qualification";

type Initial = Record<string, unknown>;

type CriterionGuide = {
  title: string;
  description: string;
  questions: string[];
  scale: string[];
};

const systems = [
  "Planilhas",
  "WhatsApp",
  "E-mail",
  "Sistema Condominial",
  "Sistema Financeiro",
  "Sistema De Chamados",
  "Plataforma De Assembleias",
  "Armazenamento Em Nuvem",
  "Documentos Físicos",
];

const pains = [
  "Informações Dispersas",
  "Retrabalho",
  "Falta De Rastreabilidade",
  "Chamados Sem Controle",
  "Comunicação Sem Comprovação",
  "Fornecedores Desorganizados",
  "Assembleias Trabalhosas",
  "Produção Demorada De Atas",
  "Financeiro Fragmentado",
  "Falta De Relatórios",
  "Dificuldade Para Crescer",
  "Baixa Participação Dos Usuários",
];

const modules = [
  "Condomínios, Unidades E Moradores",
  "Chamados",
  "Fornecedores",
  "Comunicados",
  "Reuniões",
  "Enquetes",
  "Assembleias",
  "Ata Com IA",
  "Financeiro",
  "Relatórios",
  "IA Operacional",
  "Portal",
];

const objections = [
  "Preço",
  "Complexidade",
  "Implantação",
  "Resistência Da Equipe",
  "Uso Pelos Moradores",
  "Migração De Dados",
  "Segurança/LGPD",
  "Integrações",
  "Já Possui Outro Sistema",
];

const CRITERION_GUIDES: Record<string, CriterionGuide> = {
  painScore: {
    title: "Dor Clara E Relevante",
    description:
      "Avalia se o potencial cliente possui um problema real, frequente e importante que o EloGest pode ajudar a resolver.",
    questions: [
      "Qual problema mais afeta a operação atualmente?",
      "Com que frequência ele acontece?",
      "Qual impacto causa na equipe ou nos clientes?",
      "Existe retrabalho, custo, risco ou perda de tempo?",
      "O cliente reconhece esse problema como prioridade?",
    ],
    scale: [
      "0 — Não existem informações suficientes.",
      "1 — O cliente não identifica um problema relevante.",
      "2 — Existe uma dificuldade pequena ou eventual.",
      "3 — Existe um problema real, mas o impacto ainda não está claro.",
      "4 — A dor é frequente, relevante e afeta a operação.",
      "5 — A dor é crítica, mensurável e existe necessidade clara de solução.",
    ],
  },
  urgencyScore: {
    title: "Urgência",
    description:
      "Avalia em quanto tempo o potencial cliente pretende resolver o problema ou tomar uma decisão.",
    questions: [
      "Existe prazo para implantação?",
      "Algum contrato, assembleia ou crescimento está pressionando a decisão?",
      "O cliente pretende agir agora ou apenas pesquisar?",
      "Existe alguma consequência se nada for feito?",
    ],
    scale: [
      "0 — Urgência não avaliada.",
      "1 — Não existe prazo nem intenção de mudança.",
      "2 — Interesse para um futuro distante.",
      "3 — Possível decisão entre três e seis meses.",
      "4 — Pretende decidir em até noventa dias.",
      "5 — Necessidade imediata ou decisão prevista em até trinta dias.",
    ],
  },
  productFitScore: {
    title: "Aderência Aos Módulos",
    description:
      "Avalia quanto as necessidades do cliente correspondem aos módulos e recursos já disponíveis no EloGest.",
    questions: [
      "Os problemas apresentados são atendidos pelo EloGest?",
      "Quais módulos despertaram maior interesse?",
      "Existe necessidade de funcionalidades ainda não disponíveis?",
      "O cliente precisa de personalizações relevantes?",
    ],
    scale: [
      "0 — Aderência não avaliada.",
      "1 — Necessidades pouco relacionadas ao produto.",
      "2 — Apenas um ponto secundário possui aderência.",
      "3 — Alguns módulos atendem às necessidades principais.",
      "4 — Boa parte dos processos pode ser atendida pelo EloGest.",
      "5 — Forte correspondência entre as dores e os módulos disponíveis.",
    ],
  },
  authorityScore: {
    title: "Participação Do Decisor",
    description:
      "Avalia se a pessoa envolvida possui autoridade para aprovar a contratação ou influência real sobre a decisão.",
    questions: [
      "O contato pode tomar a decisão?",
      "Existem sócios, diretores ou gestores que precisam aprovar?",
      "O decisor participou da reunião?",
      "O contato consegue levar o projeto internamente?",
    ],
    scale: [
      "0 — Papel do contato não identificado.",
      "1 — Contato sem influência no processo.",
      "2 — Usuário interessado, mas distante do decisor.",
      "3 — Influenciador com acesso ao decisor.",
      "4 — Participante direto da decisão.",
      "5 — Decisor final ou proprietário envolvido e interessado.",
    ],
  },
  implementationScore: {
    title: "Capacidade De Implantação",
    description:
      "Avalia se a administradora possui equipe, dados, disponibilidade e organização suficientes para participar da implantação.",
    questions: [
      "Existe uma pessoa responsável pelo projeto?",
      "Os dados de condomínios e usuários estão disponíveis?",
      "A equipe pode participar dos treinamentos?",
      "Existe disponibilidade para um piloto?",
      "Há resistência interna significativa?",
    ],
    scale: [
      "0 — Capacidade não avaliada.",
      "1 — Ausência de equipe, dados e disponibilidade.",
      "2 — Existem grandes dificuldades para iniciar.",
      "3 — Implantação possível, mas depende de organização prévia.",
      "4 — Equipe e dados disponíveis com poucas pendências.",
      "5 — Responsáveis definidos, dados organizados e disponibilidade confirmada.",
    ],
  },
  financialScore: {
    title: "Capacidade Financeira",
    description:
      "Avalia se existe capacidade e disposição para investir em uma solução compatível com o porte e as necessidades da operação.",
    questions: [
      "Existe orçamento previsto?",
      "O cliente já utiliza sistemas pagos?",
      "O investimento é percebido como possível?",
      "O preço é a principal barreira?",
      "A administradora possui porte compatível com o plano recomendado?",
    ],
    scale: [
      "0 — Capacidade não avaliada.",
      "1 — Ausência declarada de orçamento.",
      "2 — Forte limitação financeira ou alta resistência a investimento.",
      "3 — Capacidade provável, ainda sem orçamento confirmado.",
      "4 — Orçamento ou capacidade compatível demonstrada.",
      "5 — Investimento previsto e disposição clara para contratar.",
    ],
  },
  expansionScore: {
    title: "Potencial De Expansão",
    description:
      "Avalia a possibilidade de ampliar a utilização do EloGest após a implantação inicial.",
    questions: [
      "Quantos condomínios e unidades a administradora possui?",
      "Existe expectativa de crescimento da carteira?",
      "O piloto pode ser expandido?",
      "Outros módulos poderão ser contratados?",
      "Existe possibilidade de indicação para outras administradoras?",
    ],
    scale: [
      "0 — Potencial não avaliado.",
      "1 — Operação muito limitada e sem perspectiva de expansão.",
      "2 — Possibilidade pequena de crescimento.",
      "3 — Potencial moderado de expansão.",
      "4 — Carteira relevante ou crescimento planejado.",
      "5 — Grande carteira, forte expansão ou elevada capacidade de indicação.",
    ],
  },
  strategicScore: {
    title: "Potencial Estratégico",
    description:
      "Avalia se o relacionamento pode gerar valor além da contratação direta, como validação de mercado, indicações, parceria ou investimento.",
    questions: [
      "O contato possui experiência relevante no mercado?",
      "Pode contribuir com validação ou conexões?",
      "Demonstra visão estratégica sobre o produto?",
      "Existe interesse em parceria ou investimento?",
      "Sua participação pode acelerar a evolução do EloGest?",
    ],
    scale: [
      "0 — Potencial não avaliado.",
      "1 — Relacionamento estritamente operacional e de baixo alcance.",
      "2 — Contribuição estratégica limitada.",
      "3 — Experiência ou rede com algum valor potencial.",
      "4 — Forte experiência, influência ou capacidade de contribuição.",
      "5 — Oportunidade estratégica clara, com contribuição concreta e alinhamento de longo prazo.",
    ],
  },
  pilotScore: {
    title: "Disponibilidade Para Piloto",
    description:
      "Avalia se o potencial cliente está disposto e preparado para testar o EloGest em uma operação real.",
    questions: [
      "Existe um condomínio adequado?",
      "Há responsável interno?",
      "A equipe aceita participar?",
      "O cliente concorda em definir objetivos e indicadores?",
      "Existe prazo possível para início?",
    ],
    scale: [
      "0 — Piloto não discutido.",
      "1 — Não existe interesse em testar.",
      "2 — Interesse genérico, sem estrutura ou prazo.",
      "3 — Interesse real, mas ainda com pendências.",
      "4 — Condomínio e equipe provavelmente disponíveis.",
      "5 — Piloto aceito, responsáveis definidos e condições de início encaminhadas.",
    ],
  },
  engagementScore: {
    title: "Engajamento Comercial",
    description:
      "Avalia o nível de participação, interesse e continuidade demonstrado durante o processo comercial.",
    questions: [
      "O contato responde às mensagens?",
      "Participa das reuniões e faz perguntas?",
      "Envolve outras pessoas na avaliação?",
      "Fornece informações e cumpre os combinados?",
      "Avança espontaneamente para o próximo passo?",
    ],
    scale: [
      "0 — Engajamento não avaliado.",
      "1 — Não responde ou demonstra desinteresse.",
      "2 — Responde de forma esporádica e sem avanço.",
      "3 — Participa, mas ainda sem compromisso claro.",
      "4 — Demonstra interesse consistente e cumpre próximos passos.",
      "5 — Alta participação, iniciativa própria e avanço concreto no processo.",
    ],
  },
};

const GENERAL_SCALE = [
  "0 — Não Avaliado",
  "1 — Muito Baixo",
  "2 — Baixo",
  "3 — Médio",
  "4 — Alto",
  "5 — Muito Alto",
];

function Multi({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-[#DDE5DF] p-4">
      <legend className="px-2 text-sm font-semibold text-[#465149]">
        {label}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(option)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, option]
                    : value.filter((item) => item !== option),
                )
              }
            />
            {option}
          </label>
        ))}
      </div>
      {value.some((item) => !options.includes(item)) ? (
        <div className="mt-4 rounded-xl border border-[#DDE5DF] bg-[#F8FAF8] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#667168]">
            Informações adicionais importadas
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#344139]">
            {value
              .filter((item) => !options.includes(item))
              .map((item) => (
                <li key={item}>{item}</li>
              ))}
          </ul>
        </div>
      ) : null}
    </fieldset>
  );
}

function CriterionHelp({ criterionKey }: { criterionKey: string }) {
  const guide = CRITERION_GUIDES[criterionKey];

  if (!guide) return null;

  return (
    <details className="rounded-2xl border border-[#DDE5DF] bg-[#F8FAF8] p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold text-[#256D3C] outline-none focus-visible:ring-2 focus-visible:ring-[#256D3C] focus-visible:ring-offset-2">
        <span aria-hidden="true">ⓘ</span> Como avaliar este critério
      </summary>

      <div className="mt-4 space-y-4 text-sm font-normal text-[#465149]">
        <p>{guide.description}</p>

        <div>
          <p className="font-semibold text-[#1F2A23]">Perguntas orientadoras</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {guide.questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-semibold text-[#1F2A23]">Referência de pontuação</p>
          <ul className="mt-2 space-y-1">
            {guide.scale.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

export default function QualificationForm({
  leadId,
  initial,
}: {
  leadId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const total = useMemo(
    () =>
      QUALIFICATION_CRITERIA.reduce(
        (sum, [key]) => sum + Number(form[key] || 0),
        0,
      ),
    [form],
  );

  const classification =
    total >= 43
      ? "STRATEGIC"
      : total >= 36
        ? "HIGH_PRIORITY"
        : total >= 26
          ? "QUALIFIED"
          : total >= 16
            ? "DEVELOPING"
            : "LOW_PRIORITY";

  const set = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function save(completed: boolean) {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/elogest/comercial/${leadId}/qualificacao`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, completed }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível salvar.");
      }

      setMessage(completed ? "Qualificação concluída." : "Rascunho salvo.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }

  const input = (label: string, key: string, type = "text") => (
    <label className="space-y-2 text-sm font-semibold text-[#465149]">
      {label}
      <input
        type={type}
        value={String(form[key] ?? "")}
        onChange={(event) =>
          set(
            key,
            type === "number"
              ? event.target.value === ""
                ? ""
                : Number(event.target.value)
              : event.target.value,
          )
        }
        className="w-full rounded-2xl border border-[#DDE5DF] px-4 py-3 font-normal"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border bg-white p-5">
          <p className="text-xs uppercase text-[#7A847D]">Pontuação</p>
          <p className="mt-2 text-2xl font-bold">{total}/50</p>
        </div>
        <div className="rounded-3xl border bg-white p-5 md:col-span-2">
          <p className="text-xs uppercase text-[#7A847D]">
            Classificação Automática
          </p>
          <p className="mt-2 text-xl font-semibold">
            {qualificationClassificationLabel(classification)}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6">
        <h2 className="text-xl font-semibold">Perfil Da Administradora</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {input("Anos De Mercado", "yearsInMarket", "number")}
          {input("Condomínios", "condominiumCount", "number")}
          {input("Unidades", "unitCount", "number")}
          {input("Tamanho Da Equipe", "teamSize", "number")}
        </div>
        <div className="mt-5">
          <Multi
            label="Sistemas Atuais"
            options={systems}
            value={(form.currentSystems as string[]) || []}
            onChange={(value) => set("currentSystems", value)}
          />
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6">
        <h2 className="text-xl font-semibold">Dores E Necessidades</h2>
        <div className="mt-5 grid gap-5">
          <Multi
            label="Principais Dores"
            options={pains}
            value={(form.painPoints as string[]) || []}
            onChange={(value) => set("painPoints", value)}
          />

          <div className="grid gap-4 md:grid-cols-3">
            {input("Dor Principal", "primaryPain")}

            <label className="space-y-2 text-sm font-semibold">
              Frequência
              <select
                value={String(form.painFrequency || "")}
                onChange={(event) => set("painFrequency", event.target.value)}
                className="w-full rounded-2xl border px-4 py-3 font-normal"
              >
                <option value="">Selecione</option>
                <option>Eventual</option>
                <option>Mensal</option>
                <option>Semanal</option>
                <option>Diária</option>
                <option>Contínua</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-semibold">
              Gravidade
              <select
                value={String(form.painSeverity || "")}
                onChange={(event) => set("painSeverity", event.target.value)}
                className="w-full rounded-2xl border px-4 py-3 font-normal"
              >
                <option value="">Selecione</option>
                <option>Baixa</option>
                <option>Média</option>
                <option>Alta</option>
                <option>Crítica</option>
              </select>
            </label>
          </div>

          <Multi
            label="Módulos De Interesse"
            options={modules}
            value={(form.desiredModules as string[]) || []}
            onChange={(value) => set("desiredModules", value)}
          />
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6">
        <h2 className="text-xl font-semibold">Decisão E Piloto</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {input("Urgência", "urgency")}
          {input("Papel Do Contato Na Decisão", "decisionRole")}
          {input("Situação Do Orçamento", "budgetStatus")}
          {input("Disponibilidade Para Piloto", "pilotReadiness")}
          {input("Concorrente/Sistema Atual", "competitorName")}
        </div>
        <div className="mt-5">
          <Multi
            label="Objeções"
            options={objections}
            value={(form.objections as string[]) || []}
            onChange={(value) => set("objections", value)}
          />
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Pontuação Por Critério</h2>
            <p className="mt-1 text-sm text-[#667168]">
              Use evidências do diagnóstico. A nota zero indica que o critério
              ainda não foi avaliado.
            </p>
          </div>

          <details className="rounded-2xl border border-[#DDE5DF] bg-[#F8FAF8] p-4 sm:max-w-xl">
            <summary className="cursor-pointer list-none font-semibold text-[#256D3C] outline-none focus-visible:ring-2 focus-visible:ring-[#256D3C] focus-visible:ring-offset-2">
              <span aria-hidden="true">ⓘ</span> Como Avaliar Os Critérios
            </summary>

            <div className="mt-4 space-y-4 text-sm text-[#465149]">
              <p>
                A pontuação deve ser baseada nas informações fornecidas pelo
                potencial cliente, no diagnóstico realizado e nas evidências
                observadas durante o atendimento.
              </p>

              <div>
                <p className="font-semibold text-[#1F2A23]">Escala geral</p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {GENERAL_SCALE.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-semibold text-[#1F2A23]">Boas práticas</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Não atribua nota elevada apenas por percepção positiva.</li>
                  <li>Registre observações que sustentem notas 4 ou 5.</li>
                  <li>Revise a pontuação quando surgirem novas informações.</li>
                  <li>Diferencie interesse verbal de compromisso concreto.</li>
                  <li>
                    Utilize a prioridade comercial separadamente quando houver
                    fatores de prazo ou estratégia.
                  </li>
                </ul>
              </div>
            </div>
          </details>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {QUALIFICATION_CRITERIA.map(([key, label]) => {
            const value = Number(form[key] || 0);

            return (
              <div
                key={key}
                className="space-y-4 rounded-3xl border border-[#DDE5DF] p-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <label
                      htmlFor={`criterion-${key}`}
                      className="text-sm font-semibold text-[#1F2A23]"
                    >
                      {label}
                    </label>
                    <span className="rounded-full bg-[#EEF5F0] px-3 py-1 text-sm font-semibold text-[#256D3C]">
                      {value}/5
                    </span>
                  </div>

                  <input
                    id={`criterion-${key}`}
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    value={value}
                    onChange={(event) => set(key, Number(event.target.value))}
                    className="mt-4 w-full"
                    aria-describedby={`criterion-scale-${key}`}
                  />

                  <p
                    id={`criterion-scale-${key}`}
                    className="mt-2 text-xs text-[#667168]"
                  >
                    0 Não Avaliado · 1 Muito Baixo · 2 Baixo · 3 Médio · 4 Alto · 5 Muito Alto
                  </p>
                </div>

                <CriterionHelp criterionKey={key} />
              </div>
            );
          })}
        </div>

        <label className="mt-5 block space-y-2 text-sm font-semibold">
          Observações
          <textarea
            rows={5}
            value={String(form.notes || "")}
            onChange={(event) => set("notes", event.target.value)}
            className="w-full rounded-2xl border px-4 py-3 font-normal"
            placeholder="Registre evidências que sustentem a pontuação, especialmente notas 4 ou 5."
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => save(false)}
            className="rounded-2xl border px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            Salvar Rascunho
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => save(true)}
            className="rounded-2xl bg-[#256D3C] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Concluir Qualificação
          </button>

          {message && (
            <p className="self-center text-sm" role="status" aria-live="polite">
              {message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
