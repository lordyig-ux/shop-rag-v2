from __future__ import annotations

import json
import threading
import traceback
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field


JobStatus = Literal["running", "succeeded", "failed"]


class JobAlreadyRunningError(RuntimeError):
    pass


class JobRecord(BaseModel):
    job_id: str
    name: str
    status: JobStatus
    started_at: str
    finished_at: str | None = None
    current_step: str = "starting"
    error: str | None = None
    logs: list[str] = Field(default_factory=list)
    result: dict[str, object] = Field(default_factory=dict)


class JobContext:
    def __init__(self, manager: "JobManager", job_id: str, release_event: threading.Event) -> None:
        self._manager = manager
        self.job_id = job_id
        self._release_event = release_event

    def set_step(self, step: str) -> None:
        self._manager.update_job(self.job_id, current_step=step)
        self.log(f"Step: {step}")

    def log(self, message: str) -> None:
        self._manager.append_log(self.job_id, message)

    def set_result(self, result: dict[str, object]) -> None:
        self._manager.update_job(self.job_id, result=result)

    def wait_for_release(self, timeout: float | None = None) -> bool:
        return self._release_event.wait(timeout=timeout)


class JobManager:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._current_path = self.base_dir / "current_job.json"
        self._history_path = self.base_dir / "history.jsonl"
        self._lock = threading.Lock()
        self._release_events: dict[str, threading.Event] = {}
        self._threads: dict[str, threading.Thread] = {}

    def start_job(self, name: str, target: Callable[[JobContext], object | None]) -> JobRecord:
        with self._lock:
            current = self.current_job()
            if current and current.status == "running":
                raise JobAlreadyRunningError(f"Job already running: {current.name}")

            job = JobRecord(
                job_id=str(uuid.uuid4()),
                name=name,
                status="running",
                started_at=_now(),
            )
            self._write_current(job)
            release_event = threading.Event()
            self._release_events[job.job_id] = release_event

            thread = threading.Thread(
                target=self._run_job,
                args=(job.job_id, target, release_event),
                name=f"shop-rag-job-{name}",
                daemon=True,
            )
            self._threads[job.job_id] = thread
            thread.start()
            return job

    def current_job(self) -> JobRecord | None:
        if not self._current_path.exists():
            return None
        return JobRecord.model_validate_json(self._current_path.read_text(encoding="utf-8"))

    def history(self, limit: int = 20) -> list[JobRecord]:
        if not self._history_path.exists():
            return []
        lines = [line for line in self._history_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        records = [JobRecord.model_validate_json(line) for line in lines]
        return list(reversed(records[-limit:]))

    def update_job(self, job_id: str, **updates: object) -> None:
        with self._lock:
            job = self.current_job()
            if not job or job.job_id != job_id:
                return
            data = job.model_dump()
            data.update(updates)
            self._write_current(JobRecord.model_validate(data))

    def append_log(self, job_id: str, message: str) -> None:
        timestamped = f"{_now()} | {message}"
        with self._lock:
            job = self.current_job()
            if not job or job.job_id != job_id:
                return
            job.logs.append(timestamped)
            job.logs = job.logs[-200:]
            self._write_current(job)

    def release_job(self, job_id: str) -> None:
        event = self._release_events.get(job_id)
        if event:
            event.set()

    def wait_for_job(self, job_id: str, timeout: float | None = None) -> JobRecord:
        thread = self._threads.get(job_id)
        if thread:
            thread.join(timeout=timeout)
        job = self.current_job()
        if not job or job.job_id != job_id:
            raise RuntimeError(f"Job not found: {job_id}")
        return job

    def _run_job(
        self,
        job_id: str,
        target: Callable[[JobContext], object | None],
        release_event: threading.Event,
    ) -> None:
        context = JobContext(self, job_id, release_event)
        try:
            result = target(context)
            if isinstance(result, dict):
                context.set_result(result)
            self._finish_job(job_id, "succeeded", None)
        except Exception as exc:
            self.append_log(job_id, traceback.format_exc())
            self._finish_job(job_id, "failed", f"{type(exc).__name__}: {exc}")

    def _finish_job(self, job_id: str, status: JobStatus, error: str | None) -> None:
        with self._lock:
            job = self.current_job()
            if not job or job.job_id != job_id:
                return
            job.status = status
            job.error = error
            job.finished_at = _now()
            self._write_current(job)
            with self._history_path.open("a", encoding="utf-8") as handle:
                handle.write(job.model_dump_json() + "\n")

    def _write_current(self, job: JobRecord) -> None:
        self._current_path.write_text(json.dumps(job.model_dump(), indent=2), encoding="utf-8")


def _now() -> str:
    return datetime.now(UTC).isoformat()
