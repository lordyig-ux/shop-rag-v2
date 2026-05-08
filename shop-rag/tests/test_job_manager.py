from app.services.job_manager import JobAlreadyRunningError, JobContext, JobManager


def test_job_manager_runs_one_job_at_a_time(tmp_path) -> None:
    manager = JobManager(tmp_path)

    def hold_job(context: JobContext) -> None:
        context.set_step("holding")
        context.wait_for_release(timeout=2)

    first = manager.start_job("icbc_refresh", hold_job)

    try:
        try:
            manager.start_job("shop_docs_import", lambda context: None)
            assert False, "second job should not start while first job is running"
        except JobAlreadyRunningError:
            pass
    finally:
        manager.release_job(first.job_id)
        manager.wait_for_job(first.job_id, timeout=3)

    current = manager.current_job()
    assert current is not None
    assert current.status == "succeeded"
    assert current.current_step == "holding"


def test_job_manager_records_failure_and_logs(tmp_path) -> None:
    manager = JobManager(tmp_path)

    def failing_job(context: JobContext) -> None:
        context.log("about to fail")
        raise RuntimeError("boom")

    job = manager.start_job("icbc_check", failing_job)
    finished = manager.wait_for_job(job.job_id, timeout=3)

    assert finished.status == "failed"
    assert "RuntimeError: boom" in (finished.error or "")
    assert "about to fail" in "\n".join(finished.logs)
    assert manager.history()[0].job_id == job.job_id
