"""Category-rule learning: build a feedback loop from user-confirmed imports.

Rules are keyed by a *normalized* description (uppercased, alphanumeric tokens
joined by space, with trailing parcel suffixes stripped). When the same
normalized description maps to the same category multiple times, future imports
can short-circuit the LLM call.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, CategoryRule

# Apply a learned rule directly (skipping the LLM) once it has this many hits.
AUTO_APPLY_THRESHOLD = 3
# Maximum few-shot examples injected into the LLM prompt per categorization call.
MAX_FEW_SHOT = 12
# Max length of the normalized pattern stored in DB.
PATTERN_MAX_LEN = 200


def normalize_description(text: str) -> str:
    """Return a stable signature for a transaction description.

    - Lowercase, ASCII-folded (so "MERCADO Iguaçu" == "mercado iguacu")
    - Strip parcel suffixes like "01/12", "NN/MM" at the end
    - Collapse non-alphanumerics to single spaces
    - Trim
    """
    if not text:
        return ""
    # NFKD + drop combining marks
    folded = unicodedata.normalize("NFKD", text)
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    s = folded.lower()
    s = re.sub(r"\b\d{1,3}\s*/\s*\d{1,3}\b", " ", s)  # parcel suffix
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = s.strip()
    return s[:PATTERN_MAX_LEN]


async def learn_from_confirmed(
    db: AsyncSession,
    user_id: int,
    rows: Sequence[tuple[str, str, int]],
) -> int:
    """Upsert rules for each (description, type, category_id) tuple."""
    seen: dict[tuple[str, str, int], int] = {}
    for description, ttype, category_id in rows:
        if category_id is None:
            continue
        pattern = normalize_description(description)
        if not pattern:
            continue
        key = (pattern, ttype, int(category_id))
        seen[key] = seen.get(key, 0) + 1

    if not seen:
        return 0

    now = datetime.utcnow()
    payload = [
        {
            "user_id": user_id,
            "pattern": pattern,
            "type": ttype,
            "category_id": category_id,
            "hit_count": count,
            "last_used_at": now,
        }
        for (pattern, ttype, category_id), count in seen.items()
    ]

    stmt = pg_insert(CategoryRule).values(payload)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_category_rule_user_pattern_type",
        set_={
            "category_id": stmt.excluded.category_id,
            "hit_count": CategoryRule.hit_count + stmt.excluded.hit_count,
            "last_used_at": stmt.excluded.last_used_at,
        },
    )
    await db.execute(stmt)
    return len(payload)


async def lookup_rule(
    db: AsyncSession, user_id: int, description: str
) -> CategoryRule | None:
    pattern = normalize_description(description)
    if not pattern:
        return None
    result = await db.execute(
        select(CategoryRule)
        .where(CategoryRule.user_id == user_id, CategoryRule.pattern == pattern)
        .order_by(CategoryRule.hit_count.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_few_shot_examples(
    db: AsyncSession, user_id: int, limit: int = MAX_FEW_SHOT
) -> list[dict]:
    stmt = (
        select(CategoryRule, Category.name)
        .join(Category, Category.id == CategoryRule.category_id)
        .where(CategoryRule.user_id == user_id, CategoryRule.hit_count >= 2)
        .order_by(CategoryRule.hit_count.desc(), CategoryRule.last_used_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [
        {"description": rule.pattern, "category": cat_name, "type": rule.type}
        for rule, cat_name in result.all()
    ]
