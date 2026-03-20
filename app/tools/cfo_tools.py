"""
Herramientas del CFO (Ledger): Noticias financieras y datos de bolsa.
Conecta con n8n para acceder a APIs financieras externas.
"""
import json
from typing import Optional, Literal
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool
from app.tools.registry import register_role_tool
from app.tools.n8n_client import n8n_client


# ============================================================
# SCHEMAS
# ============================================================

class GetFinancialNewsInput(BaseModel):
    topic: str = Field(..., description="Tema financiero a buscar (ej: 'AI stocks', 'tasas de interés', 'crypto')")
    date_range: Literal["today", "week", "month"] = Field("today", description="Rango temporal de las noticias")
    limit: int = Field(5, ge=1, le=10, description="Número máximo de noticias")


class GetStockDataInput(BaseModel):
    symbol: str = Field(..., description="Símbolo bursátil (ej: 'AAPL', 'MSFT', 'GOOGL', 'TSLA')")
    period: Literal["1d", "5d", "1mo", "3mo"] = Field("1d", description="Período de datos")


class GetMarketAnalysisInput(BaseModel):
    sector: str = Field(..., description="Sector de mercado (ej: 'technology', 'healthcare', 'energy', 'finance')")
    metrics: Optional[list[str]] = Field(
        default=["price", "volume", "momentum"],
        description="Métricas a incluir en el análisis",
    )


# ============================================================
# FUNCIONES
# ============================================================

async def _get_financial_news(
    topic: str, date_range: Literal["today", "week", "month"] = "today", limit: int = 5,
) -> str:
    result = await n8n_client.call_webhook(
        "cfo/financial-news",
        {"topic": topic, "date_range": date_range, "limit": limit},
        timeout=15.0,
    )
    return json.dumps(result, ensure_ascii=False)


async def _get_stock_data(
    symbol: str, period: Literal["1d", "5d", "1mo", "3mo"] = "1d",
) -> str:
    result = await n8n_client.call_webhook(
        "cfo/stock-data",
        {"symbol": symbol.upper(), "period": period},
        timeout=15.0,
    )
    return json.dumps(result, ensure_ascii=False)


async def _get_market_analysis(
    sector: str, metrics: Optional[list[str]] = None,
) -> str:
    result = await n8n_client.call_webhook(
        "cfo/market-analysis",
        {"sector": sector, "metrics": metrics or ["price", "volume", "momentum"]},
        timeout=20.0,
    )
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# REGISTRO
# ============================================================

register_role_tool("CFO", StructuredTool.from_function(
    coroutine=_get_financial_news,
    name="get_financial_news",
    description="Obtiene noticias financieras del día por tema. Fuentes: NewsAPI, Reuters, Bloomberg.",
    args_schema=GetFinancialNewsInput,
))

register_role_tool("CFO", StructuredTool.from_function(
    coroutine=_get_stock_data,
    name="get_stock_data",
    description="Consulta datos de bolsa en tiempo real: precio, volumen, cambio porcentual por símbolo.",
    args_schema=GetStockDataInput,
))

register_role_tool("CFO", StructuredTool.from_function(
    coroutine=_get_market_analysis,
    name="get_market_analysis",
    description="Genera un análisis de mercado por sector con métricas clave (precio, volumen, momentum).",
    args_schema=GetMarketAnalysisInput,
))
