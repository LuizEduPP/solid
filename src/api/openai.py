import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from agent.loop import DeepSearchAgent, extract_objective
from api.schemas import (
    ChatCompletionChunk,
    ChatCompletionChunkChoice,
    ChatCompletionChunkDelta,
    ChatCompletionChoice,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
)
from config import Settings

router = APIRouter()


def _message_content(message: ChatMessage) -> str:
    if isinstance(message.content, str):
        return message.content
    if isinstance(message.content, list):
        parts: list[str] = []
        for part in message.content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text", "")))
        return "\n".join(parts)
    return ""


def _resolve_params(
    request: ChatCompletionRequest,
    settings: Settings,
) -> tuple[float, int, float]:
    target_score = request.target_score if request.target_score is not None else settings.target_score
    max_iterations = (
        request.max_iterations if request.max_iterations is not None else settings.max_iterations
    )
    min_score = request.min_score if request.min_score is not None else settings.min_score
    return target_score, max_iterations, min_score


@router.get("/models")
async def list_models() -> dict[str, Any]:
    return {
        "object": "list",
        "data": [
            {
                "id": "deepsearch",
                "object": "model",
                "owned_by": "deepsearch",
            }
        ],
    }


@router.post("/chat/completions", response_model=None)
async def chat_completions(
    request_body: ChatCompletionRequest,
    request: Request,
) -> ChatCompletionResponse | StreamingResponse:
    settings: Settings = request.app.state.settings
    target_score, max_iterations, min_score = _resolve_params(request_body, settings)
    if request_body.min_score is not None:
        settings = settings.model_copy(update={"min_score": min_score})

    messages = [
        {"role": message.role, "content": _message_content(message)}
        for message in request_body.messages
    ]

    try:
        objective = extract_objective(messages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    agent = DeepSearchAgent(settings)
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created = int(time.time())
    model = request_body.model or "deepsearch"

    if request_body.stream:
        return StreamingResponse(
            _stream_chunks(
                agent=agent,
                objective=objective,
                target_score=target_score,
                max_iterations=max_iterations,
                completion_id=completion_id,
                created=created,
                model=model,
            ),
            media_type="text/event-stream",
        )

    content_parts: list[str] = []
    async for chunk in agent.run(objective, target_score, max_iterations):
        content_parts.append(chunk)

    return ChatCompletionResponse(
        id=completion_id,
        created=created,
        model=model,
        choices=[
            ChatCompletionChoice(
                index=0,
                message=ChatMessage(role="assistant", content="".join(content_parts)),
                finish_reason="stop",
            )
        ],
    )


async def _stream_chunks(
    agent: DeepSearchAgent,
    objective: str,
    target_score: float,
    max_iterations: int,
    completion_id: str,
    created: int,
    model: str,
) -> AsyncIterator[str]:
    role_sent = False

    async for chunk in agent.run(objective, target_score, max_iterations):
        delta_kwargs: dict[str, str] = {"content": chunk}
        if not role_sent:
            delta_kwargs["role"] = "assistant"
            role_sent = True

        payload = ChatCompletionChunk(
            id=completion_id,
            created=created,
            model=model,
            choices=[
                ChatCompletionChunkChoice(
                    index=0,
                    delta=ChatCompletionChunkDelta(**delta_kwargs),
                )
            ],
        )
        yield f"data: {json.dumps(payload.model_dump())}\n\n"

    done = ChatCompletionChunk(
        id=completion_id,
        created=created,
        model=model,
        choices=[
            ChatCompletionChunkChoice(
                index=0,
                delta=ChatCompletionChunkDelta(),
                finish_reason="stop",
            )
        ],
    )
    yield f"data: {json.dumps(done.model_dump())}\n\n"
    yield "data: [DONE]\n\n"
