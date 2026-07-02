from dataclasses import dataclass

from duckduckgo_search import DDGS


@dataclass(frozen=True)
class SearchHit:
    title: str
    url: str
    snippet: str


def search_web(query: str, max_results: int) -> list[SearchHit]:
    with DDGS() as ddgs:
        raw = list(ddgs.text(query, max_results=max_results))

    return [
        SearchHit(
            title=item.get("title", ""),
            url=item.get("href", ""),
            snippet=item.get("body", ""),
        )
        for item in raw
        if item.get("href")
    ]


def format_hits(hits: list[SearchHit]) -> str:
    if not hits:
        return "(no results)"

    blocks: list[str] = []
    for index, hit in enumerate(hits, start=1):
        blocks.append(
            f"[{index}] {hit.title}\nURL: {hit.url}\n{hit.snippet}".strip()
        )
    return "\n\n".join(blocks)
