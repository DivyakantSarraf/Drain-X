import pytest
from app.services.scenario_benchmark import ScenarioBenchmarkRunner
from app.models.contracts import (
    ScenarioType,
    MechanismState,
    BlockageEventContract,
    PredictionContract,
    ActuatorDirectiveContract,
)
from app.services.state_store import state_store


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



def test_starting_new_scenario_clears_previous_active_blockage():
    runner = ScenarioBenchmarkRunner()

    previous_blockage = BlockageEventContract(
        section_id="SEC_SCREENING",
        probable_segment="PRIMARY_SCREENING_NET",
        severity=0.8,
        confidence=0.9,
        differential_head_cm=4.0,
        estimated_flow_drop_lpm=3.0,
        is_active=True,
    )
    state_store.record_blockage(previous_blockage)

    runner.start_scenario(ScenarioType.CLEAN_DRAINAGE, seed=42)

    assert state_store.get_active_blockage() is None



def test_starting_new_scenario_clears_previous_prediction():
    runner = ScenarioBenchmarkRunner()

    state_store.set_prediction(
        PredictionContract(
            section_id="SEC_SCREENING",
            ttc_seconds=120.0,
            confidence=0.9,
            projected_level_cm=25.0,
        )
    )

    runner.start_scenario(ScenarioType.CLEAN_DRAINAGE, seed=42)

    assert state_store.get_prediction() is None


def test_starting_new_scenario_clears_previous_gate_directive():
    runner = ScenarioBenchmarkRunner()

    state_store.set_gate_directive(
        ActuatorDirectiveContract(
            gate_target_angle=90.0,
            action="DIVERT_FLOW",
            reason="Previous scenario diversion",
            emergency_stop=True,
        )
    )

    runner.start_scenario(ScenarioType.CLEAN_DRAINAGE, seed=42)

    assert state_store.get_gate_directive() is None
