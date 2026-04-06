import json
import re

import anthropic

from app.config import settings

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

PDF_EXTRACT_PROMPT = """Você é um parser de extratos bancários.

Abaixo está o texto extraído de um extrato bancário em PDF.
Extraia TODAS as transações e categorize cada uma.

Categorias disponíveis (use exatamente esses nomes):
{categories_json}

Texto do extrato:
{pdf_text}

Retorne um array JSON onde cada elemento tem:
- "date": "YYYY-MM-DD"
- "description": descrição original da transação do extrato
- "amount": valor numérico (positivo para créditos/receitas, negativo para débitos/despesas)
- "type": "expense" ou "income"
- "category": nome exato da categoria da lista acima
- "confidence": 0.0 a 1.0
- "cleaned_description": descrição curta e legível em português

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


async def extract_and_categorize_pdf(pdf_text: str, categories: list[dict]) -> list[dict]:
    """Send PDF text to Claude for extraction and categorization."""
    # Split long PDFs into chunks
    max_chars = 15000
    if len(pdf_text) <= max_chars:
        chunks = [pdf_text]
    else:
        chunks = [pdf_text[i : i + max_chars] for i in range(0, len(pdf_text), max_chars)]

    results = []
    for chunk in chunks:
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
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

        try:
            parsed = _parse_json_response(message.content[0].text)
            results.extend(parsed)
        except (json.JSONDecodeError, IndexError):
            continue

    return results
