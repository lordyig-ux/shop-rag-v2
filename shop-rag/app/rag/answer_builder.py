import logging
from typing import Protocol

import httpx

from app.core.config import Settings
from app.rag.models import INSUFFICIENT_EVIDENCE_ANSWER, RetrievedChunk
from app.rag.prompts import SYSTEM_PROMPT, build_context_prompt


logger = logging.getLogger(__name__)


class AnswerBuilder(Protocol):
    def build_answer(self, question: str, chunks: list[RetrievedChunk]) -> tuple[str, list[str]]:
        ...


class OpenAIAnswerBuilder:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def build_answer(self, question: str, chunks: list[RetrievedChunk]) -> tuple[str, list[str]]:
        if not chunks:
            return INSUFFICIENT_EVIDENCE_ANSWER, ["low_retrieval_confidence"]

        if self.settings.answer_provider != "openai":
            return _extractive_fallback(chunks, "answer_provider_disabled")

        if not self.settings.openai_configured:
            return _extractive_fallback(chunks, "openai_api_key_missing")

        contexts = [_format_chunk(index, chunk) for index, chunk in enumerate(chunks, start=1)]
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.settings.openai_api_key)
            response = client.responses.create(
                model=self.settings.openai_model,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": build_context_prompt(question, contexts)},
                ],
            )
            text = getattr(response, "output_text", None)
            if isinstance(text, str) and text.strip():
                return text.strip(), []
            return _extractive_fallback(chunks, "openai_empty_response")
        except Exception as exc:
            logger.exception("OpenAI answer generation failed")
            return _extractive_fallback(chunks, f"openai_answer_generation_error:{type(exc).__name__}")


class OllamaAnswerBuilder:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def build_answer(self, question: str, chunks: list[RetrievedChunk]) -> tuple[str, list[str]]:
        if not chunks:
            return INSUFFICIENT_EVIDENCE_ANSWER, ["low_retrieval_confidence"]

        if not self.settings.ollama_configured:
            return _extractive_fallback(chunks, "ollama_not_configured")

        contexts = [_format_chunk(index, chunk) for index, chunk in enumerate(chunks, start=1)]
        url = f"{self.settings.ollama_base_url.rstrip('/')}/api/chat"
        payload = {
            "model": self.settings.ollama_model,
            "stream": False,
            "keep_alive": self.settings.ollama_keep_alive,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_context_prompt(question, contexts)},
            ],
        }
        headers = _ollama_headers(self.settings)

        try:
            response = httpx.post(
                url,
                json=payload,
                timeout=self.settings.ollama_timeout_seconds,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            text = _ollama_response_text(data)
            if text:
                return text, []
            return _extractive_fallback(chunks, "ollama_empty_response")
        except Exception as exc:
            logger.exception("Ollama answer generation failed")
            return _extractive_fallback(chunks, f"ollama_answer_generation_error:{type(exc).__name__}")


def create_answer_builder(settings: Settings) -> AnswerBuilder:
    if settings.answer_provider == "ollama":
        return OllamaAnswerBuilder(settings)
    return OpenAIAnswerBuilder(settings)


def _ollama_response_text(data: object) -> str:
    if not isinstance(data, dict):
        return ""
    message = data.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
    response = data.get("response")
    if isinstance(response, str):
        return response.strip()
    return ""


def _ollama_headers(settings: Settings) -> dict[str, str] | None:
    key = settings.ollama_api_key_value
    if not key:
        return None
    return {"Authorization": f"Bearer {key}"}


def _extractive_fallback(chunks: list[RetrievedChunk], warning: str) -> tuple[str, list[str]]:
    if not chunks:
        return INSUFFICIENT_EVIDENCE_ANSWER, ["low_retrieval_confidence", warning]
    first = chunks[0]
    answer = (
        "Based on the indexed knowledge base content, I found relevant source excerpts, "
        "but AI answer generation is not currently available. Review the cited excerpts below; "
        f"the strongest match is \"{first.title}\" [1]."
    )
    return answer, [warning]


def _format_chunk(index: int, chunk: RetrievedChunk) -> str:
    url = chunk.source_url or "No source URL available"
    return (
        f"[{index}] Title: {chunk.title}\n"
        f"Collection: {chunk.collection}\n"
        f"Chunk ID: {chunk.chunk_id}\n"
        f"Score: {chunk.score:.4f}\n"
        f"Source URL: {url}\n"
        f"Excerpt:\n{chunk.text[:1800]}"
    )
