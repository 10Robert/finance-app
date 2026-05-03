import json
import logging
import re

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

CATEGORIZE_PROMPT = """Você é um categorizador de transações financeiras.

Categorias disponíveis (use exatamente esses nomes):
{categories_json}

Transações para categorizar:
{transactions_json}

Para cada transação, retorne um array JSON onde cada elemento tem:
- "index": o número do índice original
- "type": "expense" ou "income"
- "category": nome exato da categoria da lista acima
- "confidence": 0.0 a 1.0 (sua confiança na categorização)
- "cleaned_description": descrição curta e legível em português

Retorne APENAS JSON válido, sem blocos de código markdown, sem explicação."""

PDF_EXTRACT_PROMPT = """Você é um parser de extratos bancários e faturas de cartão de crédito.

Abaixo está o conteúdo de um extrato/fatura em **Markdown estruturado**
(tabelas em formato markdown, cabeçalhos preservados). Use a estrutura das
tabelas para identificar colunas (data, descrição, valor) com precisão.

INCLUA transações destas seções:
- "Lançamentos: compras e saques" (todas as bandeiras/finais de cartão)
- "Lançamentos internacionais" (use o valor em R$, não em USD/BRL)
- "Lançamentos: produtos e serviços"
- "Outros lançamentos" (estornos, créditos)

EXCLUA destas seções (NÃO retorne nada delas):
- "Compras parceladas - próximas faturas" (são parcelas FUTURAS, já cadastradas)
- "Encargos cobrados nesta fatura" (juros, multa, IOF — totais agregados)
- "Simulação de Compras parc.", "Simulação Saque Cash", "Demais Taxas..."
- Resumo da fatura, Limites de crédito, dados de cabeçalho/rodapé
- Linhas de total/subtotal ("Lançamentos no cartão (final ...)", "Total...")

DETECÇÃO DE PARCELAS:
Quando a descrição contiver padrão "NN/MM" no final (ex: "MERCADO*ITEM 02/06",
"MANIA DE CAMISA 01/02", "EC *PICHAUINFO01/12"):
- "installment_number": NN (número da parcela atual)
- "installment_count": MM (total de parcelas)
- "cleaned_description": descrição SEM o sufixo "NN/MM"

Quando NÃO houver parcelas (compra à vista ou assinatura):
- "installment_number": 1
- "installment_count": 1

VALORES NEGATIVOS (estornos): linhas como "ESTORNO IOF -5,90", "Google One -0,81",
ou "PDFSIMPLI - 168,92" são créditos/estornos. Retorne com:
- "amount": valor POSITIVO (sem o sinal negativo)
- "type": "income" (para diferenciar de gastos)

Categorias disponíveis (use exatamente esses nomes):
{categories_json}

Conteúdo do extrato (markdown):
{pdf_text}

Retorne um array JSON onde cada elemento tem:
- "date": "YYYY-MM-DD" (use o ano da fatura — se a data for de meses anteriores
  ao fechamento, use o mesmo ano; se posterior, considere ano anterior)
- "description": descrição original da transação (com NN/MM se houver)
- "cleaned_description": descrição curta e legível em português (SEM "NN/MM")
- "amount": valor numérico POSITIVO em R$
- "type": "expense" ou "income"
- "installment_number": número da parcela atual (1 se não parcelado)
- "installment_count": total de parcelas (1 se não parcelado)
- "category": nome exato da categoria da lista acima
- "confidence": 0.0 a 1.0

Retorne APENAS JSON válido, sem blocos de código markdown."""


def _parse_json_response(text: str) -> list[dict]:
    """Parse JSON from LLM response, handling markdown fences."""
    text = text.strip()
    # Remove markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def categorize_transactions(transactions: list[dict], categories: list[dict]) -> list[dict]:
    """Send parsed CSV transactions to Claude for categorization."""
    # Batch in groups of 50
    results = []
    batch_size = 50

    for i in range(0, len(transactions), batch_size):
        batch = transactions[i : i + batch_size]
        indexed_batch = [{"index": i + j, **t} for j, t in enumerate(batch)]

        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": CATEGORIZE_PROMPT.format(
                        categories_json=json.dumps(categories, ensure_ascii=False),
                        transactions_json=json.dumps(indexed_batch, ensure_ascii=False),
                    ),
                }
            ],
        )

        try:
            parsed = _parse_json_response(message.content[0].text)
            results.extend(parsed)
        except (json.JSONDecodeError, IndexError):
            # Retry once with stricter instruction
            retry_msg = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                temperature=0,
                messages=[
                    {
                        "role": "user",
                        "content": CATEGORIZE_PROMPT.format(
                            categories_json=json.dumps(categories, ensure_ascii=False),
                            transactions_json=json.dumps(indexed_batch, ensure_ascii=False),
                        ),
                    },
                    {"role": "assistant", "content": message.content[0].text},
                    {"role": "user", "content": "Sua resposta não é JSON válido. Retorne APENAS o array JSON, sem nenhum texto adicional."},
                ],
            )
            parsed = _parse_json_response(retry_msg.content[0].text)
            results.extend(parsed)

    return results


def _chunk_by_lines(text: str, max_lines: int = 400) -> list[str]:
    """Split text into chunks by line, trying not to break transactions apart.

    Default max_lines is generous — faturas inteiras costumam caber em
    uma única chamada quando o markdown vem do Granite-Docling (compacto).
    Quebrar sub-seções como 'Lançamentos internacionais' em chunks separados
    fazia o LLM perdê-las.
    """
    lines = text.splitlines()
    if len(lines) <= max_lines:
        return [text]
    chunks = []
    for i in range(0, len(lines), max_lines):
        chunks.append("\n".join(lines[i : i + max_lines]))
    return chunks


async def extract_and_categorize_pdf(pdf_text: str, categories: list[dict]) -> list[dict]:
    """Send PDF text to Claude for extraction and categorization."""
    # Chunk only se realmente for muito grande — caso contrário, mandar tudo junto
    # garante que o LLM enxergue a fatura inteira (rodapés, seções de juros e
    # parcelas-futuras precisam estar visíveis para que ele saiba o que IGNORAR).
    chunks = _chunk_by_lines(pdf_text, max_lines=400)

    results = []
    for chunk_index, chunk in enumerate(chunks):
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=16384,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": PDF_EXTRACT_PROMPT.format(
                        categories_json=json.dumps(categories, ensure_ascii=False),
                        pdf_text=chunk,
                    ),
                }
            ],
        )

        raw_text = message.content[0].text if message.content else ""
        stop_reason = getattr(message, "stop_reason", None)
        logger.info(
            "PDF extract chunk %d/%d: stop_reason=%s, response_len=%d",
            chunk_index + 1,
            len(chunks),
            stop_reason,
            len(raw_text),
        )

        if stop_reason == "max_tokens":
            logger.warning(
                "Chunk %d hit max_tokens — response was truncated. Consider smaller chunks.",
                chunk_index + 1,
            )

        try:
            parsed = _parse_json_response(raw_text)
            if not isinstance(parsed, list):
                logger.warning("LLM returned non-list payload for chunk %d", chunk_index + 1)
                continue
            results.extend(parsed)
        except (json.JSONDecodeError, IndexError) as exc:
            logger.error(
                "Failed to parse LLM response for chunk %d (stop=%s): %s",
                chunk_index + 1,
                stop_reason,
                exc,
            )
            # Try to recover any complete objects from a truncated array
            recovered = _recover_partial_json_array(raw_text)
            if recovered:
                logger.info("Recovered %d items from truncated chunk %d", len(recovered), chunk_index + 1)
                results.extend(recovered)
            continue

    return results


def _recover_partial_json_array(text: str) -> list[dict]:
    """Best-effort recovery: parse complete JSON objects from a truncated array."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    if not text.startswith("["):
        return []
    objects = []
    depth = 0
    start = None
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    objects.append(json.loads(text[start : i + 1]))
                except json.JSONDecodeError:
                    pass
                start = None
    return objects
