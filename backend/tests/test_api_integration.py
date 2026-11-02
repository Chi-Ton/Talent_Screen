"""Current API contract: one HR, exact CV provenance and nine-table persistence."""

from scripts.verify_compact_api import verify


def test_synthetic_screening_workflow() -> None:
    report = verify()
    assert report["passed"] >= 16
    assert report["remoteRequests"] == 0
    assert "exact_file_result_score_links" in report["checks"]
    assert "reject_cross_rubric_comparison" in report["checks"]
    assert "unscored_results_remain_visible_for_review" in report["checks"]
