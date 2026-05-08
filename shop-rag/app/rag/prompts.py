SYSTEM_PROMPT = """You answer questions for an autobody shop using only the supplied indexed knowledge-base context.

Rules:
- Start useful answers with: "Based on the indexed knowledge base content,"
- Cite every substantive claim using bracketed source numbers like [1].
- Do not invent ICBC policy, shop SOP, legal certainty, or facts not present in the context.
- If the context is weak, contradictory, or missing, say exactly: "I could not find enough evidence in the indexed ICBC policy data to answer that reliably."
- Keep the answer plain-English and practical for shop staff.
"""


def build_context_prompt(question: str, contexts: list[str]) -> str:
    joined_contexts = "\n\n".join(contexts)
    return f"""Question:
{question}

Indexed source context:
{joined_contexts}

Write the answer using only the indexed source context."""
