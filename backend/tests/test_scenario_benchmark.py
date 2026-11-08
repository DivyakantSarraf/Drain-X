import pytest
from app.services.scenario_benchmark import ScenarioBenchmarkRunner
from app.models.contracts import ScenarioType, MechanismState


def test_scenario_runner_gradual_debris_to_intervention():
    runner = ScenarioBenchmarkRunner()
    runner.start_scenario(ScenarioType.SUCCESSFUL_INTERVENTION, seed=42)
    assert runner.is_running is True

    # Step through 50 seconds of simulation
    for _ in range(100):  # 100 * 0.5s = 50s
        step_res = runner.step(0.5)

    # By 50s, debris should have triggered intervention and completed cycle
    status = runner.mechanism.get_status()
    assert status.cycle_count >= 1
    assert runner.intervention.total_interventions >= 1


def test_benchmarking_metrics_computation():
    runner = ScenarioBenchmarkRunner()
    runner.start_scenario(ScenarioType.SUDDEN_BLOCKAGE, seed=42)

    for _ in range(60):  # 30 seconds
        runner.step(0.5)

    benchmark = runner.intervention
    assert runner.simulation_time_s >= 30.0
