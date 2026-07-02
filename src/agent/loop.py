import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from openai import AsyncOpenAI

from agent.prompts import ANALYST_SYSTEM, FINAL_SYSTEM, PLANNER_SYSTEM
from config import Settings
from search.web import SearchHit, format_hits, search_web


@dataclass
class IterationRecord:
    number: int
    angle: str
    queries: list[str]
    hits: list[SearchHit]
    findings: str
    gaps: list[str]
    score: float
    score_reasoning: str
    next_variation: str


@dataclass
class AgentRun:
    objective: str
    target_score: float
    iterations: list[IterationRecord] = field(default_factory=list)

    @property
    def latest_score(self) -> float:
        if not self.iterations:
            return 0.0
        return self.iterations[-1].score


def extract_objective(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        if message["role"] == "user" and message["content"].strip():
            return message["content"].strip()
    raise ValueError("No user message with objective found")


def _parse_json_payload(raw: str) -> dict:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start : end + 1]
    return json.loads(text)


class DeepSearchAgent:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )

    async def _chat(self, system: str, user: str) -> str:
        response = await self._client.chat.completions.create(
            model=self._settings.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.4,
        )
        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("LLM returned empty content")
        return content

    async def _plan(self, objective: str, run: AgentRun) -> dict:
        history = _format_history(run)
        user = f"Objective:\n{objective}\n\nPrior iterations:\n{history or '(first iteration)'}"
        raw = await self._chat(PLANNER_SYSTEM, user)
        return _parse_json_payload(raw)

    async def _analyze(
        self,
        objective: str,
        run: AgentRun,
        angle: str,
        query_results: list[tuple[str, list[SearchHit]]],
    ) -> dict:
        history = _format_history(run)
        evidence = "\n\n".join(
            f"Query: {query}\n{format_hits(query_hits)}"
            for query, query_hits in query_results
        )
        user = (
            f"Objective:\n{objective}\n\n"
            f"Current angle: {angle}\n\n"
            f"Prior iterations:\n{history or '(none)'}\n\n"
            f"Web results this iteration:\n{evidence}"
        )
        raw = await self._chat(ANALYST_SYSTEM, user)
        payload = _parse_json_payload(raw)
        score = float(payload["score"])
        payload["score"] = max(self._settings.min_score, min(100.0, score))
        return payload

    async def _final_report(self, objective: str, run: AgentRun) -> str:
        history = _format_history(run, include_findings=True)
        user = (
            f"Objective:\n{objective}\n\n"
            f"Target confidence reached: {run.latest_score:.2f}%\n\n"
            f"Research log:\n{history}"
        )
        return await self._chat(FINAL_SYSTEM, user)

    async def run(
        self,
        objective: str,
        target_score: float,
        max_iterations: int,
    ) -> AsyncIterator[str]:
        run = AgentRun(objective=objective, target_score=target_score)

        yield _event(
            "status",
            f"DeepSearch started — target: {target_score:.2f}%, max iterations: {max_iterations}",
        )

        for iteration in range(1, max_iterations + 1):
            yield _event("iteration", f"--- Iteration {iteration}/{max_iterations} ---")

            plan = await self._plan(objective, run)
            queries: list[str] = plan["queries"]
            angle: str = plan["angle"]
            yield _event("plan", f"Angle: {angle}\nQueries: {', '.join(queries)}")

            query_results: list[tuple[str, list[SearchHit]]] = []
            total_hits = 0
            for query in queries:
                yield _event("search", f"Searching: {query}")
                query_hits = search_web(query, self._settings.results_per_query)
                query_results.append((query, query_hits))
                total_hits += len(query_hits)

            yield _event("search_done", f"Collected {total_hits} results")

            analysis = await self._analyze(objective, run, angle, query_results)
            hits = [hit for _, query_hits in query_results for hit in query_hits]
            score = float(analysis["score"])

            record = IterationRecord(
                number=iteration,
                angle=angle,
                queries=queries,
                hits=hits,
                findings=str(analysis["findings"]),
                gaps=[str(g) for g in analysis.get("gaps", [])],
                score=score,
                score_reasoning=str(analysis["score_reasoning"]),
                next_variation=str(analysis.get("next_variation", "")),
            )
            run.iterations.append(record)

            yield _event(
                "score",
                (
                    f"Confidence: **{score:.2f}%** (target: {target_score:.2f}%)\n"
                    f"Reasoning: {record.score_reasoning}\n"
                    f"Gaps: {', '.join(record.gaps) or 'none'}"
                ),
            )

            if score >= target_score:
                yield _event(
                    "status",
                    f"Target score reached at iteration {iteration} ({score:.2f}%)",
                )
                break

            if iteration < max_iterations:
                yield _event(
                    "status",
                    f"Below target — next variation: {record.next_variation}",
                )
        else:
            yield _event(
                "status",
                f"Max iterations reached — final score: {run.latest_score:.2f}%",
            )

        yield _event("status", "Generating final report...")
        report = await self._final_report(objective, run)
        yield _event("report", report)


def _format_history(run: AgentRun, include_findings: bool = False) -> str:
    if not run.iterations:
        return ""

    blocks: list[str] = []
    for record in run.iterations:
        block = (
            f"Iteration {record.number} | score {record.score:.2f}%\n"
            f"Angle: {record.angle}\n"
            f"Queries: {', '.join(record.queries)}\n"
            f"Reasoning: {record.score_reasoning}"
        )
        if include_findings:
            block += f"\nFindings: {record.findings}"
        blocks.append(block)
    return "\n\n".join(blocks)


def _event(kind: str, content: str) -> str:
    prefix = {
        "status": "⏳",
        "iteration": "🔄",
        "plan": "📋",
        "search": "🔍",
        "search_done": "✅",
        "score": "📊",
        "report": "📄",
    }.get(kind, "•")
    return f"{prefix} {content}\n\n"
