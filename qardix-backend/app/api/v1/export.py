from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Dict, Any

from app.database.connection import get_db
from app.models.models import User
from app.auth.dependencies import require_admin_or_superadmin

router = APIRouter(prefix="/export", tags=["Data Export"])

ALLOWED_TABLES = {
    "companies": "companies",
    "profiles": "users",
    "users": "users",
    "patient_assessments": "patient_assessments",
    "ecg_records": "ecg_records",
    "ai_results": "ai_results",
    "doctor_validations": "doctor_validations",
    "reports": "reports",
    "usage_events": "usage_events",
    "demo_requests": "demo_requests",
}


@router.get("/{table_name}")
async def export_table_data(
    table_name: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin_or_superadmin),
) -> List[Dict[str, Any]]:
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail=f"Invalid table: {table_name}")

    db_table = ALLOWED_TABLES[table_name]
    res = await db.execute(text(f'SELECT * FROM "{db_table}"'))
    rows = []
    for row in res.fetchall():
        r_dict = dict(row._mapping)
        # Convert UUIDs and datetimes to str for JSON serialization
        for k, v in r_dict.items():
            if v is not None and not isinstance(v, (int, float, str, bool, list, dict)):
                r_dict[k] = str(v)
        rows.append(r_dict)

    return rows
