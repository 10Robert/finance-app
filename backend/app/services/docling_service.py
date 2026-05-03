"""PDF → Markdown via IBM Granite-Docling-258M.

Converte PDFs de fatura de cartão e extratos bancários em markdown estruturado
antes de enviar à LLM. Markdown preserva a tabela do extrato em forma compacta
(linhas/colunas), economizando tokens em relação ao dump de texto do pdfplumber,
que costuma quebrar layout multicoluna e gerar ruído.

Modelo: ibm-granite/granite-docling-258M (VLM compacto, ~258M params).
Carregamento é lazy (primeira chamada baixa pesos para o cache do HF Hub) e
singleton para reuso entre requisições.
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

_converter = None
_converter_lock = Lock()


def is_available() -> bool:
    """Whether running Docling on this machine is sane.

    Granite-Docling is a 258M-param VLM. On CPU it takes minutes per page,
    which makes the import endpoint look hung. We auto-disable it unless a
    CUDA GPU is available, and let the user force-override via env var.
    """
    override = os.environ.get("USE_DOCLING", "").strip().lower()
    if override in ("0", "false", "no", "off"):
        return False
    if override in ("1", "true", "yes", "on"):
        return True
    try:
        import torch
        return bool(torch.cuda.is_available())
    except Exception:
        return False


def _get_converter():
    """Lazy-init do DocumentConverter com pipeline VLM Granite-Docling-258M."""
    global _converter
    if _converter is not None:
        return _converter

    with _converter_lock:
        if _converter is not None:
            return _converter

        from docling.datamodel import vlm_model_specs
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import VlmPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.pipeline.vlm_pipeline import VlmPipeline

        pipeline_options = VlmPipelineOptions(
            vlm_options=vlm_model_specs.GRANITEDOCLING_TRANSFORMERS,
        )

        _converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(
                    pipeline_cls=VlmPipeline,
                    pipeline_options=pipeline_options,
                ),
            }
        )
        logger.info("Docling converter inicializado com Granite-Docling-258M")
        return _converter


def pdf_to_markdown(file_path: Path) -> str:
    converter = _get_converter()
    result = converter.convert(str(file_path))
    return result.document.export_to_markdown()


async def pdf_to_markdown_async(file_path: Path) -> str:
    return await asyncio.to_thread(pdf_to_markdown, file_path)
